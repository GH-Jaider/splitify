import { FileChange } from "../git/types";

/**
 * Status of a commit group
 */
export type CommitGroupStatus = "pending" | "committed" | "error";

/**
 * Represents a group of related file changes to be committed together
 */
export interface CommitGroup {
  /** Unique identifier for the group */
  id: string;
  /** Short name/identifier for the group */
  name: string;
  /** Commit message for this group */
  message: string;
  /** Files belonging to this group */
  files: FileChange[];
  /** Explanation of why these files are grouped together */
  reasoning: string;
  /** Current status of the group */
  status: CommitGroupStatus;
}

/**
 * Result of committing all groups
 */
export interface CommitAllResult {
  /** Number of successfully committed groups */
  success: number;
  /** Number of groups that failed to commit */
  failed: number;
}

/**
 * Options for analyzing changes
 */
export interface AnalyzeOptions {
  /** Whether to include untracked files */
  includeUntracked?: boolean;
  /** Maximum number of files per group */
  maxFilesPerGroup?: number;
}
