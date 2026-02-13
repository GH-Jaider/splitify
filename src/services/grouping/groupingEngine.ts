import * as vscode from "vscode";
import { GitService } from "../git/gitService";
import { AIService } from "../ai/aiService";
import { IgnoreService } from "../ignore/ignoreService";
import { CommitGroup, CommitAllResult } from "./types";
import { FileChange } from "../git/types";

/**
 * Normalize a file path for comparison: strip leading ./, normalize separators, trim whitespace
 */
function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.\//, "").trim();
}

/**
 * Engine for analyzing changes and managing commit groups
 * Coordinates between GitService and AIService to provide intelligent commit grouping
 */
export class GroupingEngine {
  private _groups: CommitGroup[] = [];
  private _ungroupedFiles: FileChange[] = [];
  private readonly _onGroupsChanged = new vscode.EventEmitter<CommitGroup[]>();

  /**
   * Event fired when groups are modified (added, removed, or updated)
   */
  readonly onGroupsChanged = this._onGroupsChanged.event;

  constructor(
    private readonly gitService: GitService,
    private readonly aiService: AIService,
    private readonly ignoreService?: IgnoreService,
  ) {}

  /**
   * Get the current commit groups
   */
  get groups(): CommitGroup[] {
    return this._groups;
  }

  /**
   * Get files that have been removed from groups but not discarded
   */
  get ungroupedFiles(): FileChange[] {
    return this._ungroupedFiles;
  }

  /**
   * Analyze all changes in the repository and create commit groups
   * Uses streaming to emit groups incrementally as they are parsed from the AI response
   *
   * @param token - Cancellation token for the operation
   * @returns Array of commit groups
   * @throws Error if no changes to analyze or AI analysis fails
   */
  async analyzeChanges(
    token: vscode.CancellationToken,
  ): Promise<CommitGroup[]> {
    // Clear existing groups
    this._groups = [];
    this._ungroupedFiles = [];
    this._onGroupsChanged.fire(this._groups);

    // Get all changes from git
    const changesSummary = await this.gitService.getAllChanges();

    // Filter out ignored files
    let filesToAnalyze = changesSummary.all;
    if (this.ignoreService) {
      filesToAnalyze = filesToAnalyze.filter(
        (change) => !this.ignoreService!.shouldIgnore(change.path),
      );
    }

    if (filesToAnalyze.length === 0) {
      throw new Error("No changes to analyze");
    }

    // Fetch recent commit messages for style inference
    const recentCommits = await this.gitService.getRecentCommitMessages(20);

    // Prepare changes for AI analysis
    const changesForAI = filesToAnalyze.map((change) => ({
      path: change.path,
      diff: change.diff,
    }));

    let groupIndex = 0;

    // Use streaming to get groups as they're parsed
    const suggestions = await this.aiService.analyzeAndGroupChangesStreaming(
      changesForAI,
      token,
      recentCommits,
      (suggestion) => {
        // Map suggestion to CommitGroup and add incrementally
        const normalizedSuggestionFiles = new Set(
          suggestion.files.map(normalizePath),
        );
        const files = filesToAnalyze.filter((change) =>
          normalizedSuggestionFiles.has(normalizePath(change.path)),
        );

        const group: CommitGroup = {
          id: this.generateGroupId(groupIndex++),
          name: suggestion.name,
          message: suggestion.message,
          files,
          reasoning: suggestion.reasoning,
          status: "pending" as const,
        };

        this._groups.push(group);
        this._onGroupsChanged.fire(this._groups);
      },
    );

    // If streaming didn't add all groups (fallback path), add remaining
    if (this._groups.length === 0) {
      this._groups = suggestions.map((suggestion, index) => {
        const normalizedSuggestionFiles = new Set(
          suggestion.files.map(normalizePath),
        );
        const files = filesToAnalyze.filter((change) =>
          normalizedSuggestionFiles.has(normalizePath(change.path)),
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
      this._onGroupsChanged.fire(this._groups);
    }

    // Reconcile: create catch-all group for any files the AI missed
    const groupedPaths = new Set(
      this._groups.flatMap((g) => g.files.map((f) => normalizePath(f.path))),
    );
    const ungroupedFiles = filesToAnalyze.filter(
      (f) => !groupedPaths.has(normalizePath(f.path)),
    );
    if (ungroupedFiles.length > 0) {
      const catchAll: CommitGroup = {
        id: this.generateGroupId(this._groups.length),
        name: "other-changes",
        message: "chore: other changes",
        files: ungroupedFiles,
        reasoning: "Files not assigned to other groups by AI analysis",
        status: "pending" as const,
      };
      this._groups.push(catchAll);
      this._onGroupsChanged.fire(this._groups);
    }

    return this._groups;
  }

  /**
   * Commit a specific group
   *
   * @param groupId - ID of the group to commit
   * @param noVerify - If true, skip pre-commit hooks
   * @throws Error if group not found or commit fails
   */
  async commitGroup(groupId: string, noVerify: boolean = false): Promise<void> {
    const group = this._groups.find((g) => g.id === groupId);

    if (!group) {
      throw new Error(`Group not found: ${groupId}`);
    }

    try {
      const paths = group.files.map((f) => f.path);
      await this.gitService.stageAndCommit(paths, group.message, noVerify);

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
   * Commit all (or selected) groups in sequence
   * Supports different pre-commit hook strategies, cancellation, and progress reporting
   *
   * @param options - Optional configuration for the commit operation
   * @param options.groupIds - If provided, only commit groups with these IDs
   * @param options.token - Cancellation token to abort the operation
   * @param options.onProgress - Callback invoked before each group commit
   * @returns Result with success, failure, and cancellation counts
   */
  async commitAllGroups(options?: {
    groupIds?: string[];
    token?: vscode.CancellationToken;
    onProgress?: (committed: number, total: number, group: CommitGroup) => void;
  }): Promise<CommitAllResult> {
    let success = 0;
    let failed = 0;
    let cancelled = 0;

    const config = vscode.workspace.getConfiguration("splitify");
    const strategy = config.get<string>("preCommitStrategy", "run-once");

    // Determine which groups to commit
    const pendingGroups = this._groups.filter((g) => g.status === "pending");
    const groupsToCommit = options?.groupIds
      ? pendingGroups.filter((g) => options.groupIds!.includes(g.id))
      : [...pendingGroups];

    const total = groupsToCommit.length;

    if (strategy === "run-once") {
      // Stage all files and run pre-commit hook once
      const allPaths = groupsToCommit.flatMap((g) =>
        g.files.map((f) => f.path),
      );

      try {
        await this.gitService.stageFiles(allPaths);
        await this.gitService.runPreCommitHook();
        await this.gitService.unstageAll();
      } catch (error) {
        // Pre-commit hook failed — abort all commits
        await this.gitService.unstageAll();
        throw new Error(
          `Pre-commit hook failed: ${error instanceof Error ? error.message : "Unknown error"}. Fix the issues and try again.`,
        );
      }

      // All hooks passed, commit with --no-verify
      for (const group of groupsToCommit) {
        if (options?.token?.isCancellationRequested) {
          cancelled += total - success - failed;
          break;
        }

        options?.onProgress?.(success, total, group);

        try {
          await this.commitGroup(group.id, true); // noVerify = true
          success++;
        } catch {
          failed++;
        }
      }
    } else {
      // "run-per-group" or "skip"
      const noVerify = strategy === "skip";

      for (const group of groupsToCommit) {
        if (options?.token?.isCancellationRequested) {
          cancelled += total - success - failed;
          break;
        }

        options?.onProgress?.(success, total, group);

        try {
          await this.commitGroup(group.id, noVerify);
          success++;
        } catch {
          failed++;
        }
      }
    }

    return { success, failed, cancelled };
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

    // If source group is now empty, remove it
    if (fromGroup.files.length === 0) {
      this._groups = this._groups.filter((g) => g.id !== fromGroupId);
    }

    this._onGroupsChanged.fire(this._groups);
  }

  /**
   * Remove a file from a group
   * The removed file is tracked in the ungrouped files pool for later reassignment
   *
   * @param filePath - Path of the file to remove
   * @param groupId - Group to remove from
   * @returns true if the file was removed, false if not found
   */
  removeFileFromGroup(filePath: string, groupId: string): boolean {
    const group = this._groups.find((g) => g.id === groupId);
    if (!group) {
      return false;
    }

    const fileIndex = group.files.findIndex((f) => f.path === filePath);
    if (fileIndex === -1) {
      return false;
    }

    const [file] = group.files.splice(fileIndex, 1);
    this._ungroupedFiles.push(file);

    // If group is now empty, remove it
    if (group.files.length === 0) {
      this._groups = this._groups.filter((g) => g.id !== groupId);
    }

    this._onGroupsChanged.fire(this._groups);
    return true;
  }

  /**
   * Add an ungrouped file to a specific group
   *
   * @param filePath - Path of the file in the ungrouped pool
   * @param groupId - Target group ID
   * @returns true if the file was added, false if file or group not found
   */
  addFileToGroup(filePath: string, groupId: string): boolean {
    const fileIndex = this._ungroupedFiles.findIndex(
      (f) => f.path === filePath,
    );
    if (fileIndex === -1) {
      return false;
    }

    const group = this._groups.find((g) => g.id === groupId);
    if (!group) {
      return false;
    }

    const [file] = this._ungroupedFiles.splice(fileIndex, 1);
    group.files.push(file);

    this._onGroupsChanged.fire(this._groups);
    return true;
  }

  /**
   * Create a new empty commit group
   *
   * @param name - Short identifier for the group
   * @param message - Commit message for the group
   * @returns The newly created group
   */
  createGroup(name: string, message: string): CommitGroup {
    const group: CommitGroup = {
      id: this.generateGroupId(this._groups.length),
      name,
      message,
      files: [],
      reasoning: "Manually created group",
      status: "pending" as const,
    };

    this._groups.push(group);
    this._onGroupsChanged.fire(this._groups);
    return group;
  }

  /**
   * Merge two groups into one
   * The target group receives all files from the source group
   * The source group is removed
   *
   * @param sourceGroupId - Group to merge FROM (will be removed)
   * @param targetGroupId - Group to merge INTO (will receive files)
   * @returns true if merge was successful
   */
  mergeGroups(sourceGroupId: string, targetGroupId: string): boolean {
    const sourceGroup = this._groups.find((g) => g.id === sourceGroupId);
    const targetGroup = this._groups.find((g) => g.id === targetGroupId);

    if (!sourceGroup || !targetGroup || sourceGroupId === targetGroupId) {
      return false;
    }

    // Move all files from source to target, avoiding duplicates
    for (const file of sourceGroup.files) {
      if (!targetGroup.files.some((f) => f.path === file.path)) {
        targetGroup.files.push(file);
      }
    }

    // Remove source group
    this._groups = this._groups.filter((g) => g.id !== sourceGroupId);
    this._onGroupsChanged.fire(this._groups);
    return true;
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
    this._ungroupedFiles = [];
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
    this._ungroupedFiles = [];
    this._onGroupsChanged.dispose();
  }
}
