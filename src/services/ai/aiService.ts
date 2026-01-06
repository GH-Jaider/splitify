import * as vscode from "vscode";
import {
  FileChangeInput,
  GroupingSuggestion,
  AIGroupingResponse,
} from "./types";
import { buildGroupingPrompt, MAX_DIFF_LENGTH } from "./prompts";

/**
 * Service for interacting with AI models to analyze and group code changes
 */
export class AIService {
  /**
   * Analyzes file changes and suggests logical commit groupings using Copilot's LLM
   *
   * @param changes - Array of file changes to analyze
   * @param token - Cancellation token for the operation
   * @returns Array of grouping suggestions
   * @throws Error if no Copilot model is available or changes array is empty
   */
  async analyzeAndGroupChanges(
    changes: FileChangeInput[],
    token: vscode.CancellationToken,
  ): Promise<GroupingSuggestion[]> {
    if (changes.length === 0) {
      throw new Error("No changes to analyze");
    }

    const model = await this.selectCopilotModel();

    const prompt = this.buildPrompt(changes);

    const messages = [vscode.LanguageModelChatMessage.User(prompt)];

    const response = await model.sendRequest(messages, {}, token);

    const fullResponse = await this.collectStreamedResponse(response);

    return this.parseResponse(fullResponse);
  }

  /**
   * Selects the Copilot language model
   *
   * @returns The selected language model
   * @throws Error if no Copilot model is available
   */
  private async selectCopilotModel(): Promise<vscode.LanguageModelChat> {
    const models = await vscode.lm.selectChatModels({
      vendor: "copilot",
      family: "gpt-4o",
    });

    if (models.length === 0) {
      throw new Error(
        "No Copilot model available. Please ensure GitHub Copilot is installed and activated.",
      );
    }

    return models[0];
  }

  /**
   * Collects the streamed response from the language model
   *
   * @param response - The chat response stream
   * @returns The complete response text
   */
  private async collectStreamedResponse(
    response: vscode.LanguageModelChatResponse,
  ): Promise<string> {
    let fullResponse = "";
    for await (const chunk of response.text) {
      fullResponse += chunk;
    }
    return fullResponse;
  }

  /**
   * Builds the prompt for the AI model to analyze changes
   * Uses the prompts module for consistent prompt generation
   *
   * @param changes - Array of file changes
   * @returns The formatted prompt string
   */
  buildPrompt(changes: FileChangeInput[]): string {
    return buildGroupingPrompt(changes);
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
}

// Re-export MAX_DIFF_LENGTH for backward compatibility with tests
export { MAX_DIFF_LENGTH };
