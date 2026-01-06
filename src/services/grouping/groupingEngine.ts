import * as vscode from "vscode";
import { GitService } from "../git/gitService";
import { AIService } from "../ai/aiService";
import { FileChange } from "../git/types";
import { CommitGroup, CommitAllResult } from "./types";

/**
 * Engine for analyzing changes and managing commit groups
 * Coordinates between GitService and AIService to provide intelligent commit grouping
 */
export class GroupingEngine {
  private _groups: CommitGroup[] = [];
  private readonly _onGroupsChanged = new vscode.EventEmitter<CommitGroup[]>();

  /**
   * Event fired when groups are modified (added, removed, or updated)
   */
  readonly onGroupsChanged = this._onGroupsChanged.event;

  constructor(
    private readonly gitService: GitService,
    private readonly aiService: AIService,
  ) {}

  /**
   * Get the current commit groups
   */
  get groups(): CommitGroup[] {
    return this._groups;
  }

  /**
   * Analyze all changes in the repository and create commit groups
   *
   * @param token - Cancellation token for the operation
   * @returns Array of commit groups
   * @throws Error if no changes to analyze or AI analysis fails
   */
  async analyzeChanges(
    token: vscode.CancellationToken,
  ): Promise<CommitGroup[]> {
    // Get all changes from git
    const changesSummary = await this.gitService.getAllChanges();

    if (changesSummary.totalFiles === 0) {
      throw new Error("No changes to analyze");
    }

    // Prepare changes for AI analysis
    const changesForAI = changesSummary.all.map((change) => ({
      path: change.path,
      diff: change.diff,
    }));

    // Get AI suggestions
    const suggestions = await this.aiService.analyzeAndGroupChanges(
      changesForAI,
      token,
    );

    // Map suggestions to commit groups
    this._groups = suggestions.map((suggestion, index) => {
      // Find the actual FileChange objects for the suggested files
      const files = changesSummary.all.filter((change) =>
        suggestion.files.includes(change.path),
      );

      return {
        id: this.generateGroupId(index),
        name: suggestion.name,
        message: suggestion.message,
        files,
        reasoning: suggestion.reasoning,
        status: "pending" as const,
      };
    });

    // Fire event
    this._onGroupsChanged.fire(this._groups);

    return this._groups;
  }

  /**
   * Commit a specific group
   *
   * @param groupId - ID of the group to commit
   * @throws Error if group not found or commit fails
   */
  async commitGroup(groupId: string): Promise<void> {
    const group = this._groups.find((g) => g.id === groupId);

    if (!group) {
      throw new Error(`Group not found: ${groupId}`);
    }

    try {
      const paths = group.files.map((f) => f.path);
      await this.gitService.stageAndCommit(paths, group.message);

      // Remove the committed group
      this._groups = this._groups.filter((g) => g.id !== groupId);
      this._onGroupsChanged.fire(this._groups);
    } catch (error) {
      // Set group status to error
      group.status = "error";
      this._onGroupsChanged.fire(this._groups);
      throw error;
    }
  }

  /**
   * Commit all groups in sequence
   *
   * @returns Result with success and failure counts
   */
  async commitAllGroups(): Promise<CommitAllResult> {
    let success = 0;
    let failed = 0;

    // Create a copy of groups to iterate over
    const groupsToCommit = [...this._groups];

    for (const group of groupsToCommit) {
      try {
        await this.commitGroup(group.id);
        success++;
      } catch {
        failed++;
      }
    }

    return { success, failed };
  }

  /**
   * Move a file from one group to another
   *
   * @param filePath - Path of the file to move
   * @param fromGroupId - Source group ID
   * @param toGroupId - Target group ID
   */
  moveFileToGroup(
    filePath: string,
    fromGroupId: string,
    toGroupId: string,
  ): void {
    const fromGroup = this._groups.find((g) => g.id === fromGroupId);
    const toGroup = this._groups.find((g) => g.id === toGroupId);

    if (!fromGroup || !toGroup) {
      return;
    }

    const fileIndex = fromGroup.files.findIndex((f) => f.path === filePath);

    if (fileIndex === -1) {
      return;
    }

    // Remove from source group and add to target group
    const [file] = fromGroup.files.splice(fileIndex, 1);
    toGroup.files.push(file);

    this._onGroupsChanged.fire(this._groups);
  }

  /**
   * Update the commit message for a group
   *
   * @param groupId - ID of the group to update
   * @param message - New commit message
   */
  updateGroupMessage(groupId: string, message: string): void {
    const group = this._groups.find((g) => g.id === groupId);

    if (group) {
      group.message = message;
      this._onGroupsChanged.fire(this._groups);
    }
  }

  /**
   * Clear all groups
   */
  clearGroups(): void {
    this._groups = [];
    this._onGroupsChanged.fire(this._groups);
  }

  /**
   * Discard/remove a group without committing
   *
   * @param groupId - ID of the group to discard
   */
  discardGroup(groupId: string): void {
    this._groups = this._groups.filter((g) => g.id !== groupId);
    this._onGroupsChanged.fire(this._groups);
  }

  /**
   * Get a group by its ID
   *
   * @param groupId - ID of the group to find
   * @returns The group or undefined if not found
   */
  getGroupById(groupId: string): CommitGroup | undefined {
    return this._groups.find((g) => g.id === groupId);
  }

  /**
   * Generate a unique ID for a group
   */
  private generateGroupId(index: number): string {
    return `group-${index}-${Date.now()}`;
  }

  /**
   * Dispose of the engine and clean up resources
   */
  dispose(): void {
    this._onGroupsChanged.dispose();
  }
}
