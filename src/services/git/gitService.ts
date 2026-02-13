import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";
import { constants as fsConstants } from "node:fs";
import simpleGit, { Options, SimpleGit, StatusResult } from "simple-git";
import { FileChange, ChangesSummary } from "./types";

/**
 * Interface for workspace folder provider (allows testing)
 */
export interface WorkspaceProvider {
  getWorkspaceRoot(): string | undefined;
}

/**
 * Default workspace provider using VS Code API
 */
export class VSCodeWorkspaceProvider implements WorkspaceProvider {
  getWorkspaceRoot(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }
}

/**
 * Service for interacting with Git repositories
 * Provides methods to get changes, stage files, and create commits
 */
export class GitService {
  private git: SimpleGit | null = null;
  private workspaceRoot: string | undefined;
  private workspaceProvider: WorkspaceProvider;

  constructor(workspaceProvider?: WorkspaceProvider) {
    this.workspaceProvider = workspaceProvider ?? new VSCodeWorkspaceProvider();
    this.workspaceRoot = this.workspaceProvider.getWorkspaceRoot();
  }

  /**
   * Ensure we have a valid git instance
   */
  private ensureGit(): SimpleGit {
    if (!this.workspaceRoot) {
      throw new Error("No workspace folder open");
    }
    if (!this.git) {
      this.git = simpleGit(this.workspaceRoot);
    }
    return this.git;
  }

  /**
   * Check if the current workspace is a git repository
   */
  async isGitRepository(): Promise<boolean> {
    try {
      const git = this.ensureGit();
      await git.status();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get all uncommitted changes (staged, unstaged, and untracked)
   */
  async getAllChanges(): Promise<ChangesSummary> {
    const git = this.ensureGit();
    const status: StatusResult = await git.status();

    const staged: FileChange[] = [];
    const unstaged: FileChange[] = [];
    const untracked: FileChange[] = [];

    // Process staged files
    for (const file of status.staged) {
      const diff = await this.getFileDiff(file, true);
      staged.push(this.createFileChange(file, diff, "staged", status));
    }

    // Process modified (unstaged) files
    for (const file of status.modified) {
      // Skip if already in staged (file can be partially staged)
      if (!status.staged.includes(file)) {
        const diff = await this.getFileDiff(file, false);
        unstaged.push(this.createFileChange(file, diff, "unstaged", status));
      }
    }

    // Process untracked files
    for (const file of status.not_added) {
      untracked.push({
        path: file,
        status: "untracked",
        diff: "", // Untracked files don't have a diff
        additions: 0,
        deletions: 0,
      });
    }

    const all = [...staged, ...unstaged, ...untracked];

    return {
      all,
      staged,
      unstaged,
      untracked,
      totalFiles: all.length,
    };
  }

  /**
   * Get the diff for a specific file
   */
  private async getFileDiff(
    filePath: string,
    staged: boolean,
  ): Promise<string> {
    const git = this.ensureGit();
    try {
      if (staged) {
        return await git.diff(["--cached", "--", filePath]);
      } else {
        return await git.diff(["--", filePath]);
      }
    } catch {
      return "";
    }
  }

  /**
   * Create a FileChange object from git status info
   */
  private createFileChange(
    filePath: string,
    diff: string,
    _source: "staged" | "unstaged",
    status: StatusResult,
  ): FileChange {
    let changeStatus: FileChange["status"] = "modified";

    if (status.created.includes(filePath)) {
      changeStatus = "added";
    } else if (status.deleted.includes(filePath)) {
      changeStatus = "deleted";
    } else if (status.renamed.some((r) => r.to === filePath)) {
      changeStatus = "renamed";
    }

    // Count additions and deletions from diff
    const additions = (diff.match(/^\+[^+]/gm) || []).length;
    const deletions = (diff.match(/^-[^-]/gm) || []).length;

    const fileChange: FileChange = {
      path: filePath,
      status: changeStatus,
      diff,
      additions,
      deletions,
    };

    // Add original path for renamed files
    const renamedEntry = status.renamed.find((r) => r.to === filePath);
    if (renamedEntry) {
      fileChange.originalPath = renamedEntry.from;
    }

    return fileChange;
  }

  /**
   * Stage specific files
   */
  async stageFiles(paths: string[]): Promise<void> {
    const git = this.ensureGit();
    await git.add(paths);
  }

  /**
   * Unstage specific files
   */
  async unstageFiles(paths: string[]): Promise<void> {
    const git = this.ensureGit();
    await git.reset(["HEAD", ...paths]);
  }

  /**
   * Unstage all files
   */
  async unstageAll(): Promise<void> {
    const git = this.ensureGit();
    await git.reset(["HEAD"]);
  }

  /**
   * Create a commit with the currently staged files
   */
  async commit(message: string, noVerify: boolean = false): Promise<string> {
    const git = this.ensureGit();
    const options: Options = noVerify ? { "--no-verify": null } : {};
    const result = await git.commit(message, undefined, options);
    return result.commit;
  }

  /**
   * Commit specific files with a message.
   * Stages the specified files then uses git's --only behavior to commit
   * only those files without disturbing other staged files.
   */
  async stageAndCommit(
    paths: string[],
    message: string,
    noVerify: boolean = false,
  ): Promise<string> {
    const git = this.ensureGit();
    // Stage the files first so untracked files become known to git
    await git.add(paths);
    const options: Options = noVerify ? { "--no-verify": null } : {};
    const result = await git.commit(message, paths, options);
    return result.commit;
  }

  /**
   * Get recent commit messages from the repository
   * Used to infer commit style preferences
   *
   * @param count - Number of recent commits to retrieve (default 20)
   * @returns Array of commit message strings
   */
  async getRecentCommitMessages(count: number = 20): Promise<string[]> {
    const git = this.ensureGit();
    try {
      const log = await git.log({ maxCount: count });
      return log.all.map((entry) => entry.message);
    } catch {
      // Return empty array if log fails (e.g., no commits yet)
      return [];
    }
  }

  /**
   * Check if a pre-commit hook is configured
   * Checks both standard .git/hooks/pre-commit and core.hooksPath
   */
  async hasPreCommitHook(): Promise<boolean> {
    const git = this.ensureGit();
    try {
      // Check if core.hooksPath is configured (e.g., husky)
      let hooksPath: string;
      try {
        const configResult = await git.raw([
          "config",
          "--get",
          "core.hooksPath",
        ]);
        const trimmed = configResult.trim();
        if (trimmed) {
          hooksPath = path.join(this.workspaceRoot!, trimmed, "pre-commit");
        } else {
          hooksPath = path.join(
            this.workspaceRoot!,
            ".git",
            "hooks",
            "pre-commit",
          );
        }
      } catch {
        // No core.hooksPath configured, use default
        hooksPath = path.join(
          this.workspaceRoot!,
          ".git",
          "hooks",
          "pre-commit",
        );
      }

      // Check if the hook file exists and is executable
      await fs.access(hooksPath, fsConstants.X_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Run the pre-commit hook against currently staged files
   * Uses `git hook run` (requires git 2.36+)
   *
   * @throws Error if the hook rejects the commit
   */
  async runPreCommitHook(): Promise<void> {
    const git = this.ensureGit();
    await git.raw(["hook", "run", "--ignore-missing", "pre-commit"]);
  }

  /**
   * Get the current branch name
   */
  async getCurrentBranch(): Promise<string> {
    const git = this.ensureGit();
    const branchSummary = await git.branch();
    return branchSummary.current;
  }

  /**
   * Refresh the git instance (useful after workspace changes)
   */
  refresh(): void {
    this.workspaceRoot = this.workspaceProvider.getWorkspaceRoot();
    this.git = null;
  }
}

// Singleton instance
let gitServiceInstance: GitService | null = null;

/**
 * Get the GitService singleton instance
 */
export function getGitService(): GitService {
  if (!gitServiceInstance) {
    gitServiceInstance = new GitService();
  }
  return gitServiceInstance;
}
