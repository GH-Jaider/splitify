import * as vscode from "vscode";
import type {
  CommitGroup as CommitGroupType,
  CommitAllResult,
} from "./services/grouping/types";
import type { FileChange as FileChangeType } from "./services/git/types";

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
  /** Files that have been removed from groups but not discarded */
  readonly ungroupedFiles: readonly FileChangeType[];
  /** Event fired when groups change */
  readonly onGroupsChanged: vscode.Event<CommitGroupType[]>;
  /** Analyze changes and create groups */
  analyzeChanges(token: vscode.CancellationToken): Promise<CommitGroupType[]>;
  /** Commit a specific group */
  commitGroup(groupId: string, noVerify?: boolean): Promise<void>;
  /** Commit all (or selected) pending groups with pre-commit hook strategy */
  commitAllGroups(options?: {
    groupIds?: string[];
    token?: vscode.CancellationToken;
    onProgress?: (
      committed: number,
      total: number,
      group: CommitGroupType,
    ) => void;
  }): Promise<CommitAllResult>;
  /** Remove a group without committing */
  discardGroup(groupId: string): void;
  /** Update a group's commit message */
  updateGroupMessage(groupId: string, message: string): void;
  /** Clear all groups */
  clearGroups(): void;
  /** Move a file from one group to another */
  moveFileToGroup(
    filePath: string,
    fromGroupId: string,
    toGroupId: string,
  ): void;
  /** Remove a file from a group */
  removeFileFromGroup(filePath: string, groupId: string): boolean;
  /** Add an ungrouped file to a specific group */
  addFileToGroup(filePath: string, groupId: string): boolean;
  /** Create a new empty group */
  createGroup(name: string, message: string): CommitGroupType;
  /** Merge two groups into one */
  mergeGroups(sourceGroupId: string, targetGroupId: string): boolean;
  /** Get a group by its ID */
  getGroupById(groupId: string): CommitGroupType | undefined;
}
