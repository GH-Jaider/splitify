import * as vscode from "vscode";
import type { IGroupingEngine } from "../types";

/**
 * Command: Analyze & Group Changes
 * Fetches all uncommitted changes and uses AI to group them into logical commits
 */
export function createAnalyzeCommand(
  getGroupingEngine: () => IGroupingEngine | undefined,
) {
  return vscode.commands.registerCommand("splitify.analyze", async () => {
    const groupingEngine = getGroupingEngine();

    if (!groupingEngine) {
      vscode.window.showErrorMessage(
        "Splitify: Grouping engine not initialized",
      );
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Splitify: Analyzing changes...",
        cancellable: true,
      },
      async (progress, token) => {
        try {
          progress.report({ message: "Fetching uncommitted changes..." });

          const groups = await groupingEngine.analyzeChanges(token);

          if (token.isCancellationRequested) {
            return;
          }

          if (groups.length === 0) {
            vscode.window.showInformationMessage(
              "Splitify: No changes to analyze",
            );
            return;
          }

          // Update context to show the groups view
          await vscode.commands.executeCommand(
            "setContext",
            "splitify.hasGroups",
            true,
          );

          vscode.window.showInformationMessage(
            `Splitify: Found ${groups.length} commit group${groups.length > 1 ? "s" : ""}`,
          );
        } catch (error) {
          if (token.isCancellationRequested) {
            return;
          }
          const message =
            error instanceof Error ? error.message : "Unknown error";
          vscode.window.showErrorMessage(
            `Splitify: Failed to analyze changes - ${message}`,
          );
        }
      },
    );
  });
}
