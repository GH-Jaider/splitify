import * as vscode from "vscode";
import type { IGroupingEngine, CommitGroup } from "../types";

/**
 * Command: Edit a commit group's message
 * Opens an input box to modify the commit message
 */
export function createEditGroupMessageCommand(
  getGroupingEngine: () => IGroupingEngine | undefined,
) {
  return vscode.commands.registerCommand(
    "splitify.editGroupMessage",
    async (groupId?: string) => {
      const groupingEngine = getGroupingEngine();

      if (!groupingEngine) {
        vscode.window.showErrorMessage(
          "Splitify: Grouping engine not initialized",
        );
        return;
      }

      // If no groupId provided, show a quick pick to select one
      if (!groupId) {
        const groups = groupingEngine.groups.filter(
          (g: CommitGroup) => g.status === "pending",
        );

        if (groups.length === 0) {
          vscode.window.showInformationMessage(
            "Splitify: No pending commit groups",
          );
          return;
        }

        const selected = await vscode.window.showQuickPick(
          groups.map((g: CommitGroup) => ({
            label: g.message,
            description: `${g.files.length} file${g.files.length > 1 ? "s" : ""}`,
            groupId: g.id,
          })),
          {
            placeHolder: "Select a commit group to edit",
            title: "Splitify: Edit Commit Message",
          },
        );

        if (!selected) {
          return;
        }

        groupId = selected.groupId;
      }

      const group = groupingEngine.groups.find(
        (g: CommitGroup) => g.id === groupId,
      );
      if (!group) {
        vscode.window.showErrorMessage("Splitify: Group not found");
        return;
      }

      const newMessage = await vscode.window.showInputBox({
        prompt: "Edit commit message",
        value: group.message,
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return "Commit message cannot be empty";
          }
          return null;
        },
      });

      if (newMessage && newMessage !== group.message) {
        groupingEngine.updateGroupMessage(groupId, newMessage);
        vscode.window.showInformationMessage(
          "Splitify: Commit message updated",
        );
      }
    },
  );
}
