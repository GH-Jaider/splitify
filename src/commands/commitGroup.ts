import * as vscode from "vscode";
import type { IGroupingEngine, CommitGroup } from "../types";

/**
 * Command: Commit a specific group
 * Stages the group's files and creates a commit with the suggested message
 */
export function createCommitGroupCommand(
  getGroupingEngine: () => IGroupingEngine | undefined,
) {
  return vscode.commands.registerCommand(
    "splitify.commitGroup",
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
            detail: g.reasoning,
            groupId: g.id,
          })),
          {
            placeHolder: "Select a commit group to commit",
            title: "Splitify: Commit Group",
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

      try {
        await groupingEngine.commitGroup(groupId);

        const config = vscode.workspace.getConfiguration("splitify");
        if (config.get<boolean>("showNotifications", true)) {
          vscode.window.showInformationMessage(
            `Splitify: Committed "${group.message}"`,
          );
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
