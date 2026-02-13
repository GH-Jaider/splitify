import * as vscode from "vscode";
import type { IGroupingEngine, CommitGroup } from "../types";
import { showGroupQuickPick } from "../ui/quickPick";
import { extractGroupId } from "./utils";

/**
 * Command: Edit a commit group's message
 * Opens an input box to modify the commit message
 */
export function createEditGroupMessageCommand(
  getGroupingEngine: () => IGroupingEngine | undefined,
) {
  return vscode.commands.registerCommand(
    "splitify.editGroupMessage",
    async (groupIdOrTreeItem?: string | { group?: { id?: string } }) => {
      const groupingEngine = getGroupingEngine();

      if (!groupingEngine) {
        vscode.window.showErrorMessage(
          "Splitify: Grouping engine not initialized",
        );
        return;
      }

      // Extract groupId from tree item if needed (inline buttons pass the tree item object)
      let groupId = extractGroupId(groupIdOrTreeItem);

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

        const selected = await showGroupQuickPick(groups, {
          title: "Splitify: Edit Commit Message",
          placeholder: "Select a commit group to edit",
        });

        if (!selected) {
          return;
        }

        groupId = selected.id;
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
