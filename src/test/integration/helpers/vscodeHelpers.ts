import * as vscode from "vscode";

/**
 * Wait for the extension to be activated
 */
export async function waitForExtensionActivation(
  extensionId: string,
  timeoutMs = 10000,
): Promise<vscode.Extension<unknown> | undefined> {
  const extension = vscode.extensions.getExtension(extensionId);
  if (!extension) {
    return undefined;
  }

  if (extension.isActive) {
    return extension;
  }

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (extension.isActive) {
      return extension;
    }
    await sleep(100);
  }

  // Try to activate manually
  await extension.activate();
  return extension;
}

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeoutMs = 5000,
  intervalMs = 100,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await condition()) {
      return true;
    }
    await sleep(intervalMs);
  }
  return false;
}

/**
 * Sleep for a specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a VS Code command and return the result
 */
export async function executeCommand<T>(
  command: string,
  ...args: unknown[]
): Promise<T> {
  return vscode.commands.executeCommand<T>(command, ...args);
}

/**
 * Get all registered commands matching a prefix
 */
export async function getCommandsWithPrefix(prefix: string): Promise<string[]> {
  const allCommands = await vscode.commands.getCommands();
  return allCommands.filter((cmd) => cmd.startsWith(prefix));
}

/**
 * Clear all notifications
 */
export async function clearNotifications(): Promise<void> {
  // This is a workaround as there's no direct API to clear notifications
  // We just wait a bit for any existing notifications to be shown
  await sleep(100);
}

/**
 * Get the workspace folder path
 */
export function getWorkspaceFolder(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

/**
 * Open a file in the editor
 */
export async function openFile(filePath: string): Promise<vscode.TextEditor> {
  const document = await vscode.workspace.openTextDocument(filePath);
  return vscode.window.showTextDocument(document);
}

/**
 * Close all editors
 */
export async function closeAllEditors(): Promise<void> {
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
}

/**
 * Get the tree view by ID
 */
export function getTreeView(
  viewId: string,
): vscode.TreeView<unknown> | undefined {
  // Note: This is a simplified approach; actual implementation may need
  // to use extension API if the view is not directly accessible
  return undefined;
}
