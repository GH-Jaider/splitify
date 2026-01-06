import * as vscode from "vscode";
import type { IGroupingEngine, CommitGroup } from "../types";

/**
 * Command: Discard a commit group
 * Removes the group from the list without committing
 */
export function createDiscardGroupCommand(
  getGroupingEngine: () => IGroupingEngine | undefined,
) {
  return vscode.commands.registerCommand(
    "splitify.discardGroup",
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
            placeHolder: "Select a commit group to discard",
            title: "Splitify: Discard Group",
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
