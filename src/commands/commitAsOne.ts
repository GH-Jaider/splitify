import * as vscode from "vscode";
import type { CommitGroup, IGroupingEngine } from "../types";
import { showMultiGroupQuickPick } from "../ui/quickPick";

/**
 * Command: Commit selected groups as a single commit
 */
export function createCommitAsOneCommand(
  getGroupingEngine: () => IGroupingEngine | undefined,
  treeProvider?: { getCheckedGroupIds(): string[]; clearAllCheckboxes(): void },
) {
  return vscode.commands.registerCommand("splitify.commitAsOne", async () => {
    const groupingEngine = getGroupingEngine();

    if (!groupingEngine) {
      vscode.window.showErrorMessage(
        "Splitify: Grouping engine not initialized",
      );
      return;
    }

    const pendingGroups = groupingEngine.groups.filter(
      (group: CommitGroup) => group.status === "pending",
    );

    if (pendingGroups.length === 0) {
      vscode.window.showInformationMessage(
        "Splitify: No pending commit groups",
      );
      return;
    }

    const checkedIds = treeProvider?.getCheckedGroupIds() ?? [];
    const checkedPendingIds = checkedIds.filter((id) =>
      pendingGroups.some((group) => group.id === id),
    );

    const selectedGroups =
      checkedPendingIds.length > 0
        ? pendingGroups.filter((group) => checkedPendingIds.includes(group.id))
        : await showMultiGroupQuickPick(pendingGroups, {
            title: "Splitify: Commit as One",
            placeholder:
              "Select the groups you want to collapse into one commit",
          });

    if (selectedGroups.length === 0) {
      return;
    }

    const suggestedCommitMessage = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Splitify: Suggesting commit message...",
        cancellable: true,
      },
      async (_progress, token) =>
        groupingEngine.suggestCombinedCommitMessage({
          groupIds: selectedGroups.map((group) => group.id),
          token,
        }),
    );

    const commitMessage = await vscode.window.showInputBox({
      title: "Splitify: Commit as One",
      prompt: "Enter the commit message for the combined commit",
      placeHolder: "feat: turn the current chaos into one respectable commit",
      value: suggestedCommitMessage,
      ignoreFocusOut: true,
      validateInput: (value) =>
        value.trim().length === 0 ? "A commit message is required" : undefined,
    });

    if (!commitMessage) {
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Splitify: Creating one commit...",
        cancellable: false,
      },
      async () => {
        try {
          const result = await groupingEngine.commitAsSingleCommit({
            message: commitMessage,
            groupIds: selectedGroups.map((group) => group.id),
          });

          treeProvider?.clearAllCheckboxes();

          const config = vscode.workspace.getConfiguration("splitify");
          if (config.get<boolean>("showNotifications", true)) {
            vscode.window.showInformationMessage(
              `Splitify: Committed ${selectedGroups.length} group${selectedGroups.length > 1 ? "s" : ""} as one commit`,
            );
          }

          try {
            await vscode.commands.executeCommand("git.refresh");
          } catch {
            /* Git extension not available */
          }

          if (
            result.success > 0 &&
            groupingEngine.groups.filter(
              (group: CommitGroup) => group.status === "pending",
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
            `Splitify: Failed to create a single commit - ${message}`,
          );
        }
      },
    );
  });
}
