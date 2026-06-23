import * as vscode from "vscode";
import {
  CommitMessageSuggestionInput,
  FileChangeInput,
  GroupingSuggestion,
  AIGroupingResponse,
} from "./types";
import {
  buildCombinedCommitMessagePrompt,
  buildGroupingPrompt,
  MAX_DIFF_LENGTH,
} from "./prompts";
import {
  getProviderForSelection,
  getSelectedAIModelSelection,
} from "./providers/providerRegistry";

/**
 * Service for interacting with AI models to analyze and group code changes
 */
export class AIService {
  private readonly context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  /**
   * Analyzes file changes and suggests logical commit groupings using the selected AI model
   *
   * @param changes - Array of file changes to analyze
   * @param token - Cancellation token for the operation
   * @param recentCommits - Optional array of recent commit messages for style inference
   * @returns Array of grouping suggestions
   * @throws Error if no AI model is available or changes array is empty
   */
  async analyzeAndGroupChanges(
    changes: FileChangeInput[],
    token: vscode.CancellationToken,
    recentCommits?: string[],
  ): Promise<GroupingSuggestion[]> {
    if (changes.length === 0) {
      throw new Error("No changes to analyze");
    }

    const prompt = this.buildPrompt(changes, recentCommits);
    const response = await this.requestTextStream(prompt, token);

    const fullResponse = await this.collectTextStream(response);

    return this.parseResponse(fullResponse);
  }

  /**
   * Requests a text stream from the selected AI provider.
   */
  private async requestTextStream(
    prompt: string,
    token: vscode.CancellationToken,
  ): Promise<AsyncIterable<string>> {
    const selection = getSelectedAIModelSelection(this.context);
    const provider = getProviderForSelection(selection);
    return provider.sendPrompt(selection, this.context, prompt, token);
  }

  /**
   * Collects the streamed response from the language model.
   *
   * @param response - The chat response stream.
   * @returns The complete response text
   */
  private async collectTextStream(
    response: AsyncIterable<string>,
  ): Promise<string> {
    let fullResponse = "";
    for await (const chunk of response) {
      fullResponse += chunk;
    }
    return fullResponse;
  }

  /**
   * Builds the prompt for the AI model to analyze changes
   * Uses the prompts module for consistent prompt generation
   *
   * @param changes - Array of file changes
   * @param recentCommits - Optional array of recent commit messages for style inference
   * @returns The formatted prompt string
   */
  buildPrompt(changes: FileChangeInput[], recentCommits?: string[]): string {
    return buildGroupingPrompt(changes, recentCommits);
  }

  /**
   * Builds the prompt used to suggest a single commit message for merged groups.
   */
  buildCombinedCommitMessagePrompt(
    groups: CommitMessageSuggestionInput[],
    recentCommits?: string[],
  ): string {
    return buildCombinedCommitMessagePrompt(groups, recentCommits);
  }

  /**
   * Suggest a single commit message for multiple selected groups.
   */
  async suggestCombinedCommitMessage(
    groups: CommitMessageSuggestionInput[],
    token: vscode.CancellationToken,
    recentCommits?: string[],
  ): Promise<string> {
    if (groups.length === 0) {
      throw new Error("No groups provided for commit message suggestion");
    }

    const prompt = this.buildCombinedCommitMessagePrompt(groups, recentCommits);
    const response = await this.requestTextStream(prompt, token);
    const fullResponse = await this.collectTextStream(response);

    return this.parseCommitMessageSuggestion(fullResponse);
  }

  /**
   * Analyzes file changes using streaming, emitting each group as it's parsed
   *
   * @param changes - Array of file changes to analyze
   * @param token - Cancellation token
   * @param recentCommits - Recent commit messages for style inference
   * @param onGroup - Callback fired for each group as it's parsed from the stream
   * @returns Array of all grouping suggestions
   */
  async analyzeAndGroupChangesStreaming(
    changes: FileChangeInput[],
    token: vscode.CancellationToken,
    recentCommits?: string[],
    onGroup?: (group: GroupingSuggestion) => void,
  ): Promise<GroupingSuggestion[]> {
    if (changes.length === 0) {
      throw new Error("No changes to analyze");
    }

    const prompt = this.buildPrompt(changes, recentCommits);
    const response = await this.requestTextStream(prompt, token);

    const groups: GroupingSuggestion[] = [];
    let buffer = "";
    let emittedCount = 0;

    for await (const chunk of response) {
      if (token.isCancellationRequested) {
        break;
      }

      buffer += chunk;

      // Try to extract complete groups from the buffer so far
      const completeGroupJsons = this.extractCompleteGroups(buffer);

      // Emit any newly completed groups
      for (let i = emittedCount; i < completeGroupJsons.length; i++) {
        try {
          const parsed = JSON.parse(
            completeGroupJsons[i],
          ) as GroupingSuggestion;
          if (parsed.name && parsed.message && Array.isArray(parsed.files)) {
            groups.push(parsed);
            if (onGroup) {
              onGroup(parsed);
            }
            emittedCount++;
          }
        } catch {
          // Not valid JSON, skip
        }
      }
    }

    // If streaming didn't yield results, fall back to full parse
    if (groups.length === 0) {
      return this.parseResponse(buffer);
    }

    return groups;
  }

  /**
   * Extract complete group JSON objects from a partial response buffer.
   * Uses bracket counting with string awareness to find balanced objects
   * inside the "groups" array.
   *
   * @param buffer - The accumulated response text so far
   * @returns Array of complete JSON object strings
   */
  extractCompleteGroups(buffer: string): string[] {
    const results: string[] = [];

    // Find the start of the groups array
    const arrayMatch = buffer.match(/"groups"\s*:\s*\[/);
    if (!arrayMatch || arrayMatch.index === undefined) {
      return results;
    }

    let pos = arrayMatch.index + arrayMatch[0].length;

    while (pos < buffer.length) {
      // Skip whitespace and commas
      while (pos < buffer.length && /[\s,]/.test(buffer[pos])) {
        pos++;
      }

      if (pos >= buffer.length || buffer[pos] !== "{") {
        break;
      }

      // Find matching closing brace, tracking depth and strings
      let depth = 0;
      let inString = false;
      let escaped = false;
      const start = pos;

      for (; pos < buffer.length; pos++) {
        const ch = buffer[pos];

        if (escaped) {
          escaped = false;
          continue;
        }

        if (ch === "\\") {
          escaped = true;
          continue;
        }

        if (ch === '"') {
          inString = !inString;
          continue;
        }

        if (inString) {
          continue;
        }

        if (ch === "{") {
          depth++;
        }
        if (ch === "}") {
          depth--;
          if (depth === 0) {
            results.push(buffer.substring(start, pos + 1));
            pos++;
            break;
          }
        }
      }

      // If we ran out of buffer before closing the brace, stop
      if (depth > 0) {
        break;
      }
    }

    return results;
  }

  /**
   * Parses the AI response into grouping suggestions
   *
   * @param response - The raw response string from the AI model
   * @returns Array of grouping suggestions
   * @throws Error if the response cannot be parsed
   */
  parseResponse(response: string): GroupingSuggestion[] {
    try {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : response;

      const parsed: AIGroupingResponse = JSON.parse(jsonStr.trim());

      if (!parsed.groups || !Array.isArray(parsed.groups)) {
        throw new Error("Invalid response structure: missing groups array");
      }

      return parsed.groups;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(
          "Failed to parse AI grouping suggestions: Invalid JSON format",
        );
      }
      if (
        error instanceof Error &&
        error.message.includes("Invalid response structure")
      ) {
        throw error;
      }
      throw new Error(`Failed to parse AI grouping suggestions: ${error}`);
    }
  }

  /**
   * Parse a plain-text commit message suggestion returned by the model.
   */
  parseCommitMessageSuggestion(response: string): string {
    const withoutCodeFences = response
      .replace(/```(?:text|markdown|md)?/gi, "")
      .replace(/```/g, "")
      .trim();

    const firstLine = withoutCodeFences
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean);

    const cleaned = firstLine
      ?.replace(/^(commit message|message)\s*:\s*/i, "")
      .replace(/^['"`]|['"`]$/g, "")
      .trim();

    if (!cleaned) {
      throw new Error(
        "Failed to parse commit message suggestion: empty response",
      );
    }

    return cleaned;
  }
}

// Re-export MAX_DIFF_LENGTH for backward compatibility with tests
export { MAX_DIFF_LENGTH };
