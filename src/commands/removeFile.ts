import * as vscode from "vscode";
import type { IGroupingEngine, CommitGroup } from "../types";

/**
 * Command: Remove a file from a commit group
 * When invoked from the tree view, receives a FileTreeItem as the first argument
 */
export function createRemoveFileCommand(
  getGroupingEngine: () => IGroupingEngine | undefined,
) {
  return vscode.commands.registerCommand(
    "splitify.removeFile",
    async (treeItem?: { relativePath?: string; groupId?: string }) => {
      const groupingEngine = getGroupingEngine();

      if (!groupingEngine) {
        vscode.window.showErrorMessage(
          "Splitify: Grouping engine not initialized",
        );
        return;
      }

      // When called from tree view, treeItem is a FileTreeItem
      const filePath = treeItem?.relativePath;
      const groupId = treeItem?.groupId;

      if (!filePath || !groupId) {
        vscode.window.showErrorMessage("Splitify: No file selected");
        return;
      }

      groupingEngine.removeFileFromGroup(filePath, groupId);

      vscode.window.showInformationMessage(
        "Splitify: File moved to Ungrouped Files. Use 'Add to Group' to reassign it.",
      );

      // Update context if no more groups
      if (
        groupingEngine.groups.filter((g: CommitGroup) => g.status === "pending")
          .length === 0
      ) {
        await vscode.commands.executeCommand(
          "setContext",
          "splitify.hasGroups",
          false,
        );
      }
    },
  );
}
