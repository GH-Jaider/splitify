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
 * Represents the data required to suggest a single commit message
 * for multiple selected groups.
 */
export interface CommitMessageSuggestionInput {
  /** Short identifier for the group */
  name: string;
  /** Existing commit message for the group */
  message: string;
  /** Why the group exists */
  reasoning: string;
  /** Files included in the group */
  files: string[];
}

/**
 * Represents a file change to be analyzed
 */
export interface FileChangeInput {
  /** Relative path to the file */
  path: string;
  /** Git diff content */
  diff: string;
  /** Git status for this file */
  status?: "added" | "modified" | "deleted" | "renamed" | "untracked";
  /** Original path before a rename */
  originalPath?: string;
  /** Last modification date, when known */
  lastModifiedAt?: string;
}

/**
 * Response structure from the AI model
 */
export interface AIGroupingResponse {
  groups: GroupingSuggestion[];
}
