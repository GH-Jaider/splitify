import * as vscode from "vscode";
import type { IGroupingEngine } from "../types";
import { createAnalyzeCommand } from "./analyzeChanges";
import { createCommitGroupCommand } from "./commitGroup";
import { createCommitAllCommand } from "./commitAll";
import { createDiscardGroupCommand } from "./discardGroup";
import { createEditGroupMessageCommand } from "./editGroupMessage";
import { createRefreshCommand } from "./refresh";

/**
 * Register all Splitify commands
 * @param context Extension context for subscriptions
 * @param getGroupingEngine Function to get the grouping engine instance
 */
export function registerCommands(
  context: vscode.ExtensionContext,
  getGroupingEngine: () => IGroupingEngine | undefined,
): void {
  context.subscriptions.push(
    createAnalyzeCommand(getGroupingEngine),
    createCommitGroupCommand(getGroupingEngine),
    createCommitAllCommand(getGroupingEngine),
    createDiscardGroupCommand(getGroupingEngine),
    createEditGroupMessageCommand(getGroupingEngine),
    createRefreshCommand(getGroupingEngine),
  );
}

export { createAnalyzeCommand } from "./analyzeChanges";
export { createCommitGroupCommand } from "./commitGroup";
export { createCommitAllCommand } from "./commitAll";
export { createDiscardGroupCommand } from "./discardGroup";
export { createEditGroupMessageCommand } from "./editGroupMessage";
export { createRefreshCommand } from "./refresh";
