import * as path from "path";
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

    this.checkboxState = vscode.TreeItemCheckboxState.Unchecked;
  }
}

/**
 * Tree item representing a file within a commit group
 */
export class FileTreeItem extends vscode.TreeItem {
  constructor(
    public readonly filePath: string,
    public readonly relativePath: string,
    public readonly status: string,
    public readonly additions: number,
    public readonly deletions: number,
    public readonly groupId: string,
  ) {
    super(path.basename(relativePath), vscode.TreeItemCollapsibleState.None);

    this.contextValue = "groupFile";
    this.resourceUri = vscode.Uri.file(filePath);

    // Build description: relative directory + additions/deletions
    const dir = path.dirname(relativePath);
    const changes: string[] = [];
    if (additions > 0) {
      changes.push(`+${additions}`);
    }
    if (deletions > 0) {
      changes.push(`-${deletions}`);
    }
    const dirPart = dir !== "." ? `${dir}${path.sep}` : "";
    const changesPart = changes.join(" ");
    this.description = [dirPart, changesPart].filter(Boolean).join(" ");

    // Full path in tooltip for reference
    this.tooltip = filePath;

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
 * Tree item representing the ungrouped files section
 */
export class UngroupedFilesTreeItem extends vscode.TreeItem {
  constructor(public readonly fileCount: number) {
    super("Ungrouped Files", vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = "ungroupedSection";
    this.description = `${fileCount} file${fileCount > 1 ? "s" : ""}`;
    this.iconPath = new vscode.ThemeIcon("question");
  }
}

/**
 * Tree data provider for the Splitify commit groups view
 * Shows groups as parent nodes with files as children
 */
export class CommitGroupsTreeProvider implements vscode.TreeDataProvider<
  CommitGroupTreeItem | FileTreeItem | UngroupedFilesTreeItem
> {
  private _onDidChangeTreeData = new vscode.EventEmitter<
    | CommitGroupTreeItem
    | FileTreeItem
    | UngroupedFilesTreeItem
    | undefined
    | null
    | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private groupingEngine: IGroupingEngine | undefined;
  private workspaceRoot: string;
  private _checkedGroupIds = new Set<string>();

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

  /**
   * Get the IDs of all checked groups
   */
  getCheckedGroupIds(): string[] {
    return [...this._checkedGroupIds];
  }

  /**
   * Set the checkbox state for a group
   */
  setCheckboxState(groupId: string, checked: boolean): void {
    if (checked) {
      this._checkedGroupIds.add(groupId);
    } else {
      this._checkedGroupIds.delete(groupId);
    }
    this.refresh();
  }

  /**
   * Clear all checkbox states
   */
  clearAllCheckboxes(): void {
    this._checkedGroupIds.clear();
    this.refresh();
  }

  getTreeItem(
    element: CommitGroupTreeItem | FileTreeItem | UngroupedFilesTreeItem,
  ): vscode.TreeItem {
    return element;
  }

  getChildren(
    element?: CommitGroupTreeItem | FileTreeItem | UngroupedFilesTreeItem,
  ): Thenable<(CommitGroupTreeItem | FileTreeItem | UngroupedFilesTreeItem)[]> {
    if (!this.groupingEngine) {
      return Promise.resolve([]);
    }

    // Root level: show commit groups and ungrouped files section
    if (!element) {
      const groups = this.groupingEngine.groups.filter(
        (g: CommitGroup) => g.status === "pending",
      );
      const items: (CommitGroupTreeItem | UngroupedFilesTreeItem)[] =
        groups.map((group: CommitGroup) => {
          const item = new CommitGroupTreeItem(
            group,
            vscode.TreeItemCollapsibleState.Expanded,
          );
          item.checkboxState = this._checkedGroupIds.has(group.id)
            ? vscode.TreeItemCheckboxState.Checked
            : vscode.TreeItemCheckboxState.Unchecked;
          return item;
        });

      const ungroupedFiles = this.groupingEngine.ungroupedFiles;
      if (ungroupedFiles.length > 0) {
        items.push(new UngroupedFilesTreeItem(ungroupedFiles.length));
      }

      return Promise.resolve(items);
    }

    // Ungrouped files section: show ungrouped files
    if (element instanceof UngroupedFilesTreeItem) {
      const ungroupedFiles = this.groupingEngine.ungroupedFiles;
      return Promise.resolve(
        ungroupedFiles.map((f: FileChange) => {
          const fullPath = this.workspaceRoot
            ? `${this.workspaceRoot}/${f.path}`
            : f.path;
          const item = new FileTreeItem(
            fullPath,
            f.path,
            f.status,
            f.additions,
            f.deletions,
            "",
          );
          item.contextValue = "ungroupedFile";
          return item;
        }),
      );
    }

    // Group level: show files
    if (element instanceof CommitGroupTreeItem) {
      const files = element.group.files.map((f: FileChange) => {
        const fullPath = this.workspaceRoot
          ? `${this.workspaceRoot}/${f.path}`
          : f.path;
        return new FileTreeItem(
          fullPath,
          f.path,
          f.status,
          f.additions,
          f.deletions,
          element.group.id,
        );
      });
      return Promise.resolve(files);
    }

    return Promise.resolve([]);
  }

  getParent(
    element: CommitGroupTreeItem | FileTreeItem | UngroupedFilesTreeItem,
  ): vscode.ProviderResult<
    CommitGroupTreeItem | FileTreeItem | UngroupedFilesTreeItem
  > {
    // Files don't need parent resolution for now
    return null;
  }
}
