import * as vscode from "vscode";
import type { CommitGroup as CommitGroupType } from "./services/grouping/types";

// Re-export types from services
export type {
  CommitGroup,
  CommitGroupStatus,
  CommitAllResult,
} from "./services/grouping/types";
export type { FileChange, ChangesSummary } from "./services/git/types";

/**
 * Interface for the GroupingEngine
 * This allows commands and views to work with the engine without tight coupling
 */
export interface IGroupingEngine {
  /** Current commit groups */
  readonly groups: CommitGroupType[];
  /** Event fired when groups change */
  readonly onGroupsChanged: vscode.Event<CommitGroupType[]>;
  /** Analyze changes and create groups */
  analyzeChanges(token: vscode.CancellationToken): Promise<CommitGroupType[]>;
  /** Commit a specific group */
  commitGroup(groupId: string): Promise<void>;
  /** Commit all pending groups */
  commitAllGroups(): Promise<{ success: number; failed: number }>;
  /** Remove a group without committing */
  discardGroup(groupId: string): void;
  /** Update a group's commit message */
  updateGroupMessage(groupId: string, message: string): void;
  /** Clear all groups */
  clearGroups(): void;
}
