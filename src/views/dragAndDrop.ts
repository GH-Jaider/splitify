import * as vscode from "vscode";
import type { IGroupingEngine } from "../types";
import {
  CommitGroupTreeItem,
  FileTreeItem,
  UngroupedFilesTreeItem,
} from "./commitGroupsTreeProvider";

type TreeItemType = CommitGroupTreeItem | FileTreeItem | UngroupedFilesTreeItem;

const MIME_TYPE = "application/vnd.code.tree.splitifyGroupsView";

/**
 * Drag and drop controller for moving files between commit groups
 */
export class CommitGroupsDragAndDropController implements vscode.TreeDragAndDropController<TreeItemType> {
  readonly dropMimeTypes = [MIME_TYPE];
  readonly dragMimeTypes = [MIME_TYPE];

  constructor(
    private readonly getGroupingEngine: () => IGroupingEngine | undefined,
  ) {}

  handleDrag(
    source: readonly TreeItemType[],
    dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken,
  ): void {
    // Only allow dragging FileTreeItem items
    const fileItems = source.filter(
      (item): item is FileTreeItem => item instanceof FileTreeItem,
    );

    if (fileItems.length === 0) {
      return;
    }

    // Serialize the first dragged file item
    // (VS Code tree DnD typically handles one item at a time)
    const item = fileItems[0];
    const data = JSON.stringify({
      filePath: item.relativePath,
      groupId: item.groupId,
    });
    dataTransfer.set(MIME_TYPE, new vscode.DataTransferItem(data));
  }

  async handleDrop(
    target: TreeItemType | undefined,
    dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    // Get the data transfer item
    const transferItem = dataTransfer.get(MIME_TYPE);
    if (!transferItem) {
      return;
    }

    let data: { filePath: string; groupId: string };
    try {
      data = JSON.parse(transferItem.value);
    } catch {
      return; // Malformed data, ignore
    }

    const groupingEngine = this.getGroupingEngine();
    if (!groupingEngine) {
      return;
    }

    const { filePath, groupId: sourceGroupId } = data;

    // Drop onto a group
    if (target instanceof CommitGroupTreeItem) {
      const targetGroupId = target.group.id;

      if (sourceGroupId === "") {
        // Ungrouped file → group
        groupingEngine.addFileToGroup(filePath, targetGroupId);
      } else {
        // Grouped file → different group
        groupingEngine.moveFileToGroup(filePath, sourceGroupId, targetGroupId);
      }
      return;
    }

    // Drop onto ungrouped section
    if (target instanceof UngroupedFilesTreeItem) {
      if (sourceGroupId !== "") {
        // Grouped file → ungrouped
        groupingEngine.removeFileFromGroup(filePath, sourceGroupId);
      }
      // If already ungrouped, no-op
      return;
    }

    // Drop onto anything else (FileTreeItem, null, etc.) — no-op
  }
}
