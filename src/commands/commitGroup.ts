import * as vscode from "vscode";
import type { IGroupingEngine, CommitGroup } from "../types";
import { showGroupQuickPick } from "../ui/quickPick";
import { extractGroupId } from "./utils";

/**
 * Command: Commit a specific group
 * Stages the group's files and creates a commit with the suggested message
 */
export function createCommitGroupCommand(
  getGroupingEngine: () => IGroupingEngine | undefined,
) {
  return vscode.commands.registerCommand(
    "splitify.commitGroup",
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
          title: "Splitify: Commit Group",
          placeholder: "Select a commit group to commit",
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

      try {
        await groupingEngine.commitGroup(groupId);

        const config = vscode.workspace.getConfiguration("splitify");
        if (config.get<boolean>("showNotifications", true)) {
          vscode.window.showInformationMessage(
            `Splitify: Committed "${group.message}"`,
          );
        }

        // Refresh VS Code's built-in Git extension to reflect the commit
        try {
          await vscode.commands.executeCommand("git.refresh");
        } catch {
          /* Git extension not available */
        }

        // Update context if no more groups
        if (
          groupingEngine.groups.filter(
            (g: CommitGroup) => g.status === "pending",
          ).length === 0
        ) {
          await vscode.commands.executeCommand(
            "setContext",
            "splitify.hasGroups",
            false,
          );
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        vscode.window.showErrorMessage(
          `Splitify: Failed to commit - ${message}`,
        );
      }
    },
  );
}
