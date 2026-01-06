import { FileChangeInput } from "./types";

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
      return `### File: ${c.path}\n\`\`\`diff\n${truncatedDiff}${suffix}\n\`\`\``;
    })
    .join("\n\n");
}

/**
 * Builds the complete prompt for analyzing and grouping changes
 */
export function buildGroupingPrompt(changes: FileChangeInput[]): string {
  const changesText = buildChangesSection(changes);

  return `${SYSTEM_CONTEXT}

Analyze the following file changes and group them into logical commits. Each group should:
- Contain related changes that serve a single purpose
- Be atomic (could be reverted independently)
- Follow conventional commit conventions (feat, fix, refactor, docs, style, test, chore)

## Changes to analyze:

${changesText}

## Response format (JSON):

\`\`\`json
{
  "groups": [
    {
      "name": "short-identifier",
      "message": "feat(scope): description following conventional commits",
      "files": ["path/to/file1.ts", "path/to/file2.ts"],
      "reasoning": "Brief explanation of why these files are grouped together"
    }
  ]
}
\`\`\`

Respond ONLY with the JSON, no additional text.`;
}
