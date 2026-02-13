import * as vscode from "vscode";
import type { IGroupingEngine, CommitGroup } from "../types";

/**
 * Command: Add an ungrouped file to a commit group
 * When invoked from the tree view, receives a FileTreeItem as the first argument.
 * Shows a QuickPick of pending groups plus a "Create New Group" option.
 */
export function createAddFileToGroupCommand(
  getGroupingEngine: () => IGroupingEngine | undefined,
) {
  return vscode.commands.registerCommand(
    "splitify.addFileToGroup",
    async (treeItem?: { relativePath?: string }) => {
      const groupingEngine = getGroupingEngine();
      if (!groupingEngine) {
        vscode.window.showErrorMessage(
          "Splitify: Grouping engine not initialized",
        );
        return;
      }

      const filePath = treeItem?.relativePath;
      if (!filePath) {
        vscode.window.showErrorMessage("Splitify: No file selected");
        return;
      }

      const pendingGroups = groupingEngine.groups.filter(
        (g: CommitGroup) => g.status === "pending",
      );

      const quickPickItems = pendingGroups.map((g) => ({
        label: g.message,
        description: `${g.files.length} file${g.files.length !== 1 ? "s" : ""}`,
        groupId: g.id,
      }));

      quickPickItems.push({
        label: "$(add) Create New Group...",
        description: "",
        groupId: "__create_new__",
      });

      const selected = await vscode.window.showQuickPick(quickPickItems, {
        title: "Splitify: Add File to Group",
        placeHolder: "Select the target group or create a new one",
      });

      if (!selected) {
        return;
      }

      let targetGroupId = selected.groupId;

      if (targetGroupId === "__create_new__") {
        const name = await vscode.window.showInputBox({
          prompt: "Group name",
          placeHolder: "e.g., bug-fix, feature-x",
        });
        if (!name) {
          return;
        }

        const message = await vscode.window.showInputBox({
          prompt: "Commit message",
          placeHolder: "e.g., fix: resolve login issue",
        });
        if (!message) {
          return;
        }

        const newGroup = groupingEngine.createGroup(name, message);
        targetGroupId = newGroup.id;
      }

      const success = groupingEngine.addFileToGroup(filePath, targetGroupId);
      if (!success) {
        vscode.window.showErrorMessage("Splitify: Failed to add file to group");
      }
    },
  );
}
