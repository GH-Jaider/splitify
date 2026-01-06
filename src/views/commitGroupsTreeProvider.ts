import * as vscode from "vscode";
import type { CommitGroup, IGroupingEngine, FileChange } from "../types";

/**
 * Tree item representing a commit group in the SCM view
 */
export class CommitGroupTreeItem extends vscode.TreeItem {
  constructor(
    public readonly group: CommitGroup,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
  ) {
    super(group.message, collapsibleState);

    this.id = group.id;
    this.contextValue = "commitGroup";
    this.description = `${group.files.length} file${group.files.length > 1 ? "s" : ""}`;

    // Build tooltip
    const tooltip = new vscode.MarkdownString();
    tooltip.appendMarkdown(`**${group.message}**\n\n`);
    tooltip.appendMarkdown(`*${group.reasoning}*\n\n`);
    tooltip.appendMarkdown(`**Files:**\n`);
    group.files.forEach((f: FileChange) => {
      tooltip.appendMarkdown(`- \`${f.path}\` (${f.status})\n`);
    });
    this.tooltip = tooltip;

    // Icon based on status
    switch (group.status) {
      case "committed":
        this.iconPath = new vscode.ThemeIcon(
          "check",
          new vscode.ThemeColor("testing.iconPassed"),
        );
        break;
      case "error":
        this.iconPath = new vscode.ThemeIcon(
          "error",
          new vscode.ThemeColor("testing.iconFailed"),
        );
        break;
      default:
        this.iconPath = new vscode.ThemeIcon("git-commit");
    }
  }
}

/**
 * Tree item representing a file within a commit group
 */
export class FileTreeItem extends vscode.TreeItem {
  constructor(
    public readonly filePath: string,
    public readonly status: string,
    public readonly additions: number,
    public readonly deletions: number,
  ) {
    super(filePath, vscode.TreeItemCollapsibleState.None);

    this.contextValue = "groupFile";
    this.resourceUri = vscode.Uri.file(filePath);

    // Show additions/deletions in description
    const changes: string[] = [];
    if (additions > 0) {
      changes.push(`+${additions}`);
    }
    if (deletions > 0) {
      changes.push(`-${deletions}`);
    }
    this.description = changes.join(" ");

    // Icon based on status
    switch (status) {
      case "added":
      case "untracked":
        this.iconPath = new vscode.ThemeIcon(
          "diff-added",
          new vscode.ThemeColor("gitDecoration.addedResourceForeground"),
        );
        break;
      case "deleted":
        this.iconPath = new vscode.ThemeIcon(
          "diff-removed",
          new vscode.ThemeColor("gitDecoration.deletedResourceForeground"),
        );
        break;
      case "renamed":
        this.iconPath = new vscode.ThemeIcon(
          "diff-renamed",
          new vscode.ThemeColor("gitDecoration.renamedResourceForeground"),
        );
        break;
      default:
        this.iconPath = new vscode.ThemeIcon(
          "diff-modified",
          new vscode.ThemeColor("gitDecoration.modifiedResourceForeground"),
        );
    }

    // Click to open diff
    this.command = {
      command: "vscode.open",
      title: "Open File",
      arguments: [vscode.Uri.file(filePath)],
    };
  }
}

/**
 * Tree data provider for the Splitify commit groups view
 * Shows groups as parent nodes with files as children
 */
export class CommitGroupsTreeProvider implements vscode.TreeDataProvider<
  CommitGroupTreeItem | FileTreeItem
> {
  private _onDidChangeTreeData = new vscode.EventEmitter<
    CommitGroupTreeItem | FileTreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private groupingEngine: IGroupingEngine | undefined;
  private workspaceRoot: string;

  constructor() {
    this.workspaceRoot =
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
  }

  /**
   * Set the grouping engine and subscribe to changes
   */
  setGroupingEngine(engine: IGroupingEngine): void {
    this.groupingEngine = engine;

    // Subscribe to group changes
    engine.onGroupsChanged(() => {
      this.refresh();
    });
  }

  /**
   * Refresh the tree view
   */
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: CommitGroupTreeItem | FileTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(
    element?: CommitGroupTreeItem | FileTreeItem,
  ): Thenable<(CommitGroupTreeItem | FileTreeItem)[]> {
    if (!this.groupingEngine) {
      return Promise.resolve([]);
    }

    // Root level: show commit groups
    if (!element) {
      const groups = this.groupingEngine.groups.filter(
        (g: CommitGroup) => g.status === "pending",
      );
      return Promise.resolve(
        groups.map(
          (group: CommitGroup) =>
            new CommitGroupTreeItem(
              group,
              vscode.TreeItemCollapsibleState.Expanded,
            ),
        ),
      );
    }

    // Group level: show files
    if (element instanceof CommitGroupTreeItem) {
      const files = element.group.files.map((f: FileChange) => {
        const fullPath = this.workspaceRoot
          ? `${this.workspaceRoot}/${f.path}`
          : f.path;
        return new FileTreeItem(fullPath, f.status, f.additions, f.deletions);
      });
      return Promise.resolve(files);
    }

    return Promise.resolve([]);
  }

  getParent(
    element: CommitGroupTreeItem | FileTreeItem,
  ): vscode.ProviderResult<CommitGroupTreeItem | FileTreeItem> {
    // Files don't need parent resolution for now
    return null;
  }
}
