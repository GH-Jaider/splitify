/**
 * Represents a single file change in the working directory
 */
export interface FileChange {
  /** Relative path to the file from the repository root */
  path: string;
  /** Type of change */
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked';
  /** The diff content for this file */
  diff: string;
  /** Number of lines added */
  additions: number;
  /** Number of lines deleted */
  deletions: number;
  /** Original path (only for renamed files) */
  originalPath?: string;
}

/**
 * Summary of all changes in the repository
 */
export interface ChangesSummary {
  /** All file changes (staged + unstaged + untracked) */
  all: FileChange[];
  /** Only staged changes */
  staged: FileChange[];
  /** Only unstaged changes (modified tracked files) */
  unstaged: FileChange[];
  /** Untracked files */
  untracked: FileChange[];
  /** Total number of files changed */
  totalFiles: number;
}
