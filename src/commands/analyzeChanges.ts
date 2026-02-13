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

          // Subscribe to group changes for real-time progress updates
          let groupCount = 0;
          const groupListener = groupingEngine.onGroupsChanged((groups) => {
            if (groups.length > groupCount) {
              groupCount = groups.length;
              progress.report({
                message: `Found ${groupCount} group${groupCount > 1 ? "s" : ""}...`,
              });

              // Set context as soon as first group arrives
              if (groupCount === 1) {
                vscode.commands.executeCommand(
                  "setContext",
                  "splitify.hasGroups",
                  true,
                );
                // Auto-focus the tree view
                Promise.resolve(
                  vscode.commands.executeCommand("splitify.groupsView.focus"),
                ).catch(() => {});
              }
            }
          });

          const groups = await groupingEngine.analyzeChanges(token);

          // Clean up listener
          groupListener.dispose();

          if (token.isCancellationRequested) {
            return;
          }

          if (groups.length === 0) {
            vscode.window.showInformationMessage(
              "Splitify: No changes to analyze",
            );
            return;
          }

          // Ensure context is set (in case streaming didn't trigger it)
          await vscode.commands.executeCommand(
            "setContext",
            "splitify.hasGroups",
            true,
          );

          vscode.window.showInformationMessage(
            `Splitify: Found ${groups.length} commit group${groups.length > 1 ? "s" : ""}`,
          );

          // Auto-focus the Splitify tree view so it expands in the SCM panel
          try {
            await vscode.commands.executeCommand("splitify.groupsView.focus");
          } catch {
            // View focus may fail if SCM panel is not visible; ignore
          }
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
