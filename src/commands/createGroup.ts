import * as vscode from "vscode";
import type { IGroupingEngine } from "../types";

/**
 * Command: Create a new empty commit group
 * Prompts the user for a commit message and creates an empty group
 */
export function createCreateGroupCommand(
  getGroupingEngine: () => IGroupingEngine | undefined,
) {
  return vscode.commands.registerCommand("splitify.createGroup", async () => {
    const groupingEngine = getGroupingEngine();

    if (!groupingEngine) {
      vscode.window.showErrorMessage(
        "Splitify: Grouping engine not initialized",
      );
      return;
    }

    const message = await vscode.window.showInputBox({
      title: "Splitify: Create New Group",
      prompt: "Enter the commit message for the new group",
      placeHolder: "feat(scope): description",
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return "Commit message cannot be empty";
        }
        return null;
      },
    });

    if (!message) {
      return;
    }

    // Generate a name from the message (first word or conventional prefix)
    const name = message
      .split(/[:(]/)[0]
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-");

    groupingEngine.createGroup(name, message.trim());

    // Ensure groups view is visible
    await vscode.commands.executeCommand(
      "setContext",
      "splitify.hasGroups",
      true,
    );
  });
}
