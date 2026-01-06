import * as vscode from "vscode";
import type { IGroupingEngine } from "../types";

/**
 * Command: Refresh analysis
 * Clears current groups and re-analyzes changes
 */
export function createRefreshCommand(
  getGroupingEngine: () => IGroupingEngine | undefined,
) {
  return vscode.commands.registerCommand("splitify.refresh", async () => {
    const groupingEngine = getGroupingEngine();

    if (!groupingEngine) {
      vscode.window.showErrorMessage(
        "Splitify: Grouping engine not initialized",
      );
      return;
    }

    // Clear existing groups
    groupingEngine.clearGroups();
    await vscode.commands.executeCommand(
      "setContext",
      "splitify.hasGroups",
      false,
    );

    // Re-run analysis
    await vscode.commands.executeCommand("splitify.analyze");
  });
}
