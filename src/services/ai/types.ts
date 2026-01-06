/**
 * Represents a suggestion for grouping files into a logical commit
 */
export interface GroupingSuggestion {
  /** Short identifier for the group */
  name: string;
  /** Commit message following conventional commits format */
  message: string;
  /** List of file paths belonging to this group */
  files: string[];
  /** Explanation of why these files are grouped together */
  reasoning: string;
}

/**
 * Represents a file change to be analyzed
 */
export interface FileChangeInput {
  /** Relative path to the file */
  path: string;
  /** Git diff content */
  diff: string;
}

/**
 * Response structure from the AI model
 */
export interface AIGroupingResponse {
  groups: GroupingSuggestion[];
}
