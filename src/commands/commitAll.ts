import * as vscode from "vscode";
import type { IGroupingEngine, CommitGroup } from "../types";
import { showCommitConfirmation } from "../ui/quickPick";

/**
 * Command: Commit all pending groups
 * Delegates to commitAllGroups() which handles pre-commit hook strategies
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
    const confirmed = await showCommitConfirmation(pendingGroups);
    if (!confirmed) {
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Splitify: Committing groups...",
        cancellable: true,
      },
      async (progress, token) => {
        try {
          const result = await groupingEngine.commitAllGroups({
            token,
            onProgress: (committed, total, group) => {
              progress.report({
                message: `(${committed + 1}/${total}) ${group.message}`,
                increment: (1 / total) * 100,
              });
            },
          });

          const config = vscode.workspace.getConfiguration("splitify");
          if (config.get<boolean>("showNotifications", true)) {
            if (result.cancelled > 0) {
              vscode.window.showInformationMessage(
                `Splitify: Committed ${result.success} of ${result.success + result.cancelled} group${result.success + result.cancelled > 1 ? "s" : ""} (cancelled)`,
              );
            } else {
              vscode.window.showInformationMessage(
                `Splitify: Successfully committed ${result.success} group${result.success > 1 ? "s" : ""}`,
              );
            }
          }

          // Refresh VS Code's built-in Git extension to reflect commits
          try {
            await vscode.commands.executeCommand("git.refresh");
          } catch {
            /* Git extension not available */
          }

          // Update context: check if there are still pending groups
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
            `Splitify: Failed to commit all - ${message}`,
          );
        }
      },
    );
  });
}
