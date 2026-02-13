import * as vscode from "vscode";
import type { IGroupingEngine, CommitGroup } from "../types";
import { showGroupQuickPick } from "../ui/quickPick";
import { extractGroupId } from "./utils";

/**
 * Command: Discard a commit group
 * Removes the group from the list without committing
 */
export function createDiscardGroupCommand(
  getGroupingEngine: () => IGroupingEngine | undefined,
) {
  return vscode.commands.registerCommand(
    "splitify.discardGroup",
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
          title: "Splitify: Discard Group",
          placeholder: "Select a commit group to discard",
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

      groupingEngine.discardGroup(groupId);

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
