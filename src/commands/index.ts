import * as vscode from "vscode";
import type { IGroupingEngine } from "../types";
import { createAnalyzeCommand } from "./analyzeChanges";
import { createCommitGroupCommand } from "./commitGroup";
import { createCommitAllCommand } from "./commitAll";
import { createCommitSelectedCommand } from "./commitSelected";
import { createDiscardGroupCommand } from "./discardGroup";
import { createEditGroupMessageCommand } from "./editGroupMessage";
import { createRefreshCommand } from "./refresh";
import { createMoveFileCommand } from "./moveFile";
import { createRemoveFileCommand } from "./removeFile";
import { createCreateGroupCommand } from "./createGroup";
import { createAddFileToGroupCommand } from "./addFileToGroup";
import { createSelectModelCommand } from "./selectModel";

/**
 * Register all Splitify commands
 * @param context Extension context for subscriptions
 * @param getGroupingEngine Function to get the grouping engine instance
 * @param treeProvider Optional tree provider for checkbox state management
 */
export function registerCommands(
  context: vscode.ExtensionContext,
  getGroupingEngine: () => IGroupingEngine | undefined,
  treeProvider?: { getCheckedGroupIds(): string[]; clearAllCheckboxes(): void },
): void {
  context.subscriptions.push(
    createAnalyzeCommand(getGroupingEngine),
    createCommitGroupCommand(getGroupingEngine),
    createCommitAllCommand(getGroupingEngine),
    createCommitSelectedCommand(getGroupingEngine, treeProvider),
    createDiscardGroupCommand(getGroupingEngine),
    createEditGroupMessageCommand(getGroupingEngine),
    createRefreshCommand(getGroupingEngine),
    createMoveFileCommand(getGroupingEngine),
    createRemoveFileCommand(getGroupingEngine),
    createCreateGroupCommand(getGroupingEngine),
    createAddFileToGroupCommand(getGroupingEngine),
    createSelectModelCommand(context),
  );
}

export { createAnalyzeCommand } from "./analyzeChanges";
export { createCommitGroupCommand } from "./commitGroup";
export { createCommitAllCommand } from "./commitAll";
export { createCommitSelectedCommand } from "./commitSelected";
export { createDiscardGroupCommand } from "./discardGroup";
export { createEditGroupMessageCommand } from "./editGroupMessage";
export { createRefreshCommand } from "./refresh";
export { createMoveFileCommand } from "./moveFile";
export { createRemoveFileCommand } from "./removeFile";
export { createCreateGroupCommand } from "./createGroup";
export { createAddFileToGroupCommand } from "./addFileToGroup";
export { createSelectModelCommand } from "./selectModel";
export { extractGroupId } from "./utils";
