import * as vscode from "vscode";
import type { IGroupingEngine, CommitGroup } from "../types";
import { showGroupQuickPick } from "../ui/quickPick";

/**
 * Command: Move a file from one commit group to another
 * When invoked from the tree view, receives a FileTreeItem as the first argument
 */
export function createMoveFileCommand(
  getGroupingEngine: () => IGroupingEngine | undefined,
) {
  return vscode.commands.registerCommand(
    "splitify.moveFile",
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
      const fromGroupId = treeItem?.groupId;

      if (!filePath || !fromGroupId) {
        vscode.window.showErrorMessage("Splitify: No file selected");
        return;
      }

      // Get available target groups (exclude the source group)
      const targetGroups = groupingEngine.groups.filter(
        (g: CommitGroup) => g.id !== fromGroupId && g.status === "pending",
      );

      if (targetGroups.length === 0) {
        vscode.window.showInformationMessage(
          "Splitify: No other groups to move to. Create a new group first.",
        );
        return;
      }

      const targetGroup = await showGroupQuickPick(targetGroups, {
        title: "Splitify: Move File To Group",
        placeholder: "Select the target group",
      });

      if (!targetGroup) {
        return;
      }

      groupingEngine.moveFileToGroup(filePath, fromGroupId, targetGroup.id);
    },
  );
}
