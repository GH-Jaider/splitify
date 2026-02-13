import * as vscode from "vscode";
import { registerCommands } from "./commands";
import {
  CommitGroupsTreeProvider,
  CommitGroupTreeItem,
  CommitGroupsDragAndDropController,
} from "./views";
import { GroupingEngine } from "./services/grouping";
import { GitService } from "./services/git";
import { AIService } from "./services/ai";
import { IgnoreService } from "./services/ignore";
import type { IGroupingEngine } from "./types";

// Global instances
let groupingEngine: IGroupingEngine | undefined;
let gitService: GitService | undefined;
let aiService: AIService | undefined;

/**
 * Getter for the grouping engine (used by commands)
 */
function getGroupingEngine(): IGroupingEngine | undefined {
  return groupingEngine;
}

/**
 * Called when the extension is activated
 */
export async function activate(context: vscode.ExtensionContext) {
  console.log("Splitify is activating...");

  // Initialize services
  gitService = new GitService();
  aiService = new AIService(context);
  const ignoreService = await IgnoreService.loadFromWorkspace();
  groupingEngine = new GroupingEngine(gitService, aiService, ignoreService);

  // Create and register the tree view provider
  const treeProvider = new CommitGroupsTreeProvider();
  treeProvider.setGroupingEngine(groupingEngine);

  // Register all commands (after treeProvider is created so commitSelected can use checkboxes)
  registerCommands(context, getGroupingEngine, treeProvider);

  // Create drag-and-drop controller
  const dragAndDropController = new CommitGroupsDragAndDropController(
    getGroupingEngine,
  );

  const treeView = vscode.window.createTreeView("splitify.groupsView", {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
    manageCheckboxStateManually: true,
    dragAndDropController,
  });
  context.subscriptions.push(treeView);

  // Subscribe to checkbox state changes
  context.subscriptions.push(
    treeView.onDidChangeCheckboxState((event) => {
      for (const [item, state] of event.items) {
        if (item instanceof CommitGroupTreeItem) {
          treeProvider.setCheckboxState(
            item.group.id,
            state === vscode.TreeItemCheckboxState.Checked,
          );
        }
      }
    }),
  );

  // Initialize context values
  vscode.commands.executeCommand("setContext", "splitify.hasGroups", false);

  console.log("Splitify activated successfully!");
}

/**
 * Called when the extension is deactivated
 */
export function deactivate() {
  groupingEngine = undefined;
  gitService = undefined;
  aiService = undefined;
}
