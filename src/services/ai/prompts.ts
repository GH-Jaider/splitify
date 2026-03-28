import { CommitMessageSuggestionInput, FileChangeInput } from "./types";

/**
 * Maximum characters to include from a diff to avoid context overflow
 */
export const MAX_DIFF_LENGTH = 1000;

/**
 * System context for the AI model
 */
export const SYSTEM_CONTEXT = `You are an expert at analyzing code changes and organizing them into logical, atomic commits.`;

/**
 * Builds the file changes section of the prompt
 */
export function buildChangesSection(changes: FileChangeInput[]): string {
  return changes
    .map((c) => {
      const truncatedDiff = c.diff.slice(0, MAX_DIFF_LENGTH);
      const suffix = c.diff.length > MAX_DIFF_LENGTH ? "\n... (truncated)" : "";
      const metadata = [
        c.status ? `Status: ${c.status}` : undefined,
        c.originalPath ? `Original path: ${c.originalPath}` : undefined,
        c.lastModifiedAt ? `Last modified at: ${c.lastModifiedAt}` : undefined,
      ]
        .filter(Boolean)
        .join("\n");
      const diffBody = truncatedDiff || "(no diff available)";
      return `### File: ${c.path}${metadata ? `\n${metadata}` : ""}\n\`\`\`diff\n${diffBody}${suffix}\n\`\`\``;
    })
    .join("\n\n");
}

/**
 * Builds the commit style section based on recent commit history
 */
export function buildCommitStyleSection(recentCommits?: string[]): string {
  if (recentCommits && recentCommits.length >= 5) {
    const commitList = recentCommits
      .slice(0, 15) // Show at most 15 examples
      .map((msg) => `  - ${msg}`)
      .join("\n");

    return `- Follow the commit message style and conventions used in this repository. Here are recent commit messages for reference:
${commitList}
  Match their format, prefix style, and tone.`;
  }

  return `- Write clear, descriptive commit messages that explain what the change does`;
}

/**
 * Builds the complete prompt for analyzing and grouping changes
 */
export function buildGroupingPrompt(
  changes: FileChangeInput[],
  recentCommits?: string[],
): string {
  const changesText = buildChangesSection(changes);
  const commitStyleText = buildCommitStyleSection(recentCommits);

  return `${SYSTEM_CONTEXT}

Analyze the following file changes and group them into logical commits. Each group should:
- Contain related changes that serve a single purpose
- Be atomic (could be reverted independently)
- IMPORTANT: Every file listed above MUST appear in exactly one group. Do not omit any files. If a file doesn't clearly belong with others, create a separate group for it.
${commitStyleText}

## Changes to analyze:

${changesText}

## File checklist (every file below MUST appear in exactly one group):
${changes.map((c, i) => `${i + 1}. ${c.path}`).join("\n")}

## Response format (JSON):

\`\`\`json
{
  "groups": [
    {
      "name": "short-identifier",
      "message": "commit message matching the repository style",
      "files": ["path/to/file1.ts", "path/to/file2.ts"],
      "reasoning": "Brief explanation of why these files are grouped together"
    }
  ]
}
\`\`\`

Respond ONLY with the JSON, no additional text. Ensure every file from the checklist above appears in exactly one group.`;
}

/**
 * Builds the prompt for suggesting one commit message for multiple groups.
 */
export function buildCombinedCommitMessagePrompt(
  groups: CommitMessageSuggestionInput[],
  recentCommits?: string[],
): string {
  const commitStyleText = buildCommitStyleSection(recentCommits);
  const groupsText = groups
    .map(
      (group, index) => `### Group ${index + 1}: ${group.name}
Existing message: ${group.message}
Reasoning: ${group.reasoning}
Files: ${group.files.join(", ")}`,
    )
    .join("\n\n");

  return `${SYSTEM_CONTEXT}

Suggest a single commit message that combines the following groups into one coherent commit.
The result should:
- Preserve the repository's existing commit message style
- Describe the combined intent, not just concatenate the old messages
- Stay concise and realistic for an actual git commit
- Use the group messages, reasoning, file list, and last-modified hints only as signals, not as rigid rules
${commitStyleText}

## Groups to merge:

${groupsText}

Respond ONLY with the commit message, no JSON, no explanation, no markdown bullets.`;
}
