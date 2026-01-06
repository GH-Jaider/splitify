import * as vscode from "vscode";
import { registerCommands } from "./commands";
import { CommitGroupsTreeProvider } from "./views";
import { GroupingEngine } from "./services/grouping";
import { GitService } from "./services/git";
import { AIService } from "./services/ai";
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
export function activate(context: vscode.ExtensionContext) {
  console.log("Splitify is activating...");

  // Initialize services
  gitService = new GitService();
  aiService = new AIService();
  groupingEngine = new GroupingEngine(gitService, aiService);

  // Register all commands
  registerCommands(context, getGroupingEngine);

  // Create and register the tree view provider
  const treeProvider = new CommitGroupsTreeProvider();
  treeProvider.setGroupingEngine(groupingEngine);

  const treeView = vscode.window.createTreeView("splitify.groupsView", {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

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
