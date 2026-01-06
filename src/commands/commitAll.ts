import * as vscode from "vscode";
import type { IGroupingEngine, CommitGroup } from "../types";

/**
 * Command: Commit all pending groups
 * Iterates through all groups and commits them sequentially
 */
export function createCommitAllCommand(
  getGroupingEngine: () => IGroupingEngine | undefined,
) {
  return vscode.commands.registerCommand("splitify.commitAll", async () => {
    const groupingEngine = getGroupingEngine();

    if (!groupingEngine) {
      vscode.window.showErrorMessage(
        "Splitify: Grouping engine not initialized",
      );
      return;
    }

    const pendingGroups = groupingEngine.groups.filter(
      (g: CommitGroup) => g.status === "pending",
    );

    if (pendingGroups.length === 0) {
      vscode.window.showInformationMessage(
        "Splitify: No pending commit groups",
      );
      return;
    }

    // Confirm before committing all
    const confirm = await vscode.window.showWarningMessage(
      `Splitify: Commit ${pendingGroups.length} group${pendingGroups.length > 1 ? "s" : ""}?`,
      { modal: true },
      "Commit All",
    );

    if (confirm !== "Commit All") {
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Splitify: Committing groups...",
        cancellable: false,
      },
      async (progress) => {
        try {
          const total = pendingGroups.length;
          let current = 0;

          for (const group of pendingGroups) {
            current++;
            progress.report({
              message: `(${current}/${total}) ${group.message}`,
              increment: (1 / total) * 100,
            });

            await groupingEngine.commitGroup(group.id);
          }

          const config = vscode.workspace.getConfiguration("splitify");
          if (config.get<boolean>("showNotifications", true)) {
            vscode.window.showInformationMessage(
              `Splitify: Successfully committed ${total} group${total > 1 ? "s" : ""}`,
            );
          }

          // Clear the groups view
          await vscode.commands.executeCommand(
            "setContext",
            "splitify.hasGroups",
            false,
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unknown error";
          vscode.window.showErrorMessage(
            `Splitify: Failed to commit all - ${message}`,
          );
        }
      },
    );
  });
}
