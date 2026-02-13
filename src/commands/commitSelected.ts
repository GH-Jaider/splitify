import * as vscode from "vscode";
import type { IGroupingEngine, CommitGroup } from "../types";
import { showMultiGroupQuickPick } from "../ui/quickPick";

/**
 * Command: Commit selected groups
 * Uses checkbox selection if available, otherwise shows a multi-select quick pick
 * Delegates to commitAllGroups() with groupIds filter for pre-commit hook strategy
 */
export function createCommitSelectedCommand(
  getGroupingEngine: () => IGroupingEngine | undefined,
  treeProvider?: { getCheckedGroupIds(): string[]; clearAllCheckboxes(): void },
) {
  return vscode.commands.registerCommand(
    "splitify.commitSelected",
    async () => {
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

      // Check if groups are selected via checkboxes
      const checkedIds = treeProvider?.getCheckedGroupIds() ?? [];
      const checkedPendingIds = checkedIds.filter((id) =>
        pendingGroups.some((g) => g.id === id),
      );

      let selectedIds: string[];

      if (checkedPendingIds.length > 0) {
        // Use checkbox selection directly
        selectedIds = checkedPendingIds;
      } else {
        // Fall back to QuickPick
        const selected = await showMultiGroupQuickPick(pendingGroups, {
          title: "Splitify: Select Groups to Commit",
          placeholder: "Select the groups you want to commit",
        });

        if (selected.length === 0) {
          return;
        }

        selectedIds = selected.map((g) => g.id);
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Splitify: Committing selected groups...",
          cancellable: true,
        },
        async (progress, token) => {
          try {
            const result = await groupingEngine.commitAllGroups({
              groupIds: selectedIds,
              token,
              onProgress: (committed, total, group) => {
                progress.report({
                  message: `(${committed + 1}/${total}) ${group.message}`,
                  increment: (1 / total) * 100,
                });
              },
            });

            // Clear checkbox state after commit
            treeProvider?.clearAllCheckboxes();

            const config = vscode.workspace.getConfiguration("splitify");
            if (config.get<boolean>("showNotifications", true)) {
              if (result.cancelled > 0) {
                vscode.window.showInformationMessage(
                  `Splitify: Committed ${result.success} of ${result.success + result.cancelled} group${result.success + result.cancelled > 1 ? "s" : ""} (cancelled)`,
                );
              } else if (result.failed > 0) {
                vscode.window.showInformationMessage(
                  `Splitify: Committed ${result.success} of ${result.success + result.failed} group${result.success + result.failed > 1 ? "s" : ""}`,
                );
              } else {
                vscode.window.showInformationMessage(
                  `Splitify: Committed ${result.success} group${result.success > 1 ? "s" : ""}`,
                );
              }
            }

            // Refresh VS Code's built-in Git extension to reflect commits
            try {
              await vscode.commands.executeCommand("git.refresh");
            } catch {
              /* Git extension not available */
            }

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
              `Splitify: Failed to commit selected groups - ${message}`,
            );
          }
        },
      );
    },
  );
}
