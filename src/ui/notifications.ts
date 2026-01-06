import * as vscode from "vscode";

/**
 * Show a success notification
 */
export function showSuccess(message: string): void {
  const config = vscode.workspace.getConfiguration("splitify");
  if (config.get<boolean>("showNotifications", true)) {
    vscode.window.showInformationMessage(`Splitify: ${message}`);
  }
}

/**
 * Show an error notification
 */
export function showError(message: string): void {
  vscode.window.showErrorMessage(`Splitify: ${message}`);
}

/**
 * Show a warning notification
 */
export function showWarning(message: string): void {
  vscode.window.showWarningMessage(`Splitify: ${message}`);
}

/**
 * Show progress while running an async operation
 */
export async function withProgress<T>(
  title: string,
  task: (
    progress: vscode.Progress<{ message?: string; increment?: number }>,
    token: vscode.CancellationToken,
  ) => Promise<T>,
  options?: {
    cancellable?: boolean;
    location?: vscode.ProgressLocation;
  },
): Promise<T> {
  return vscode.window.withProgress(
    {
      location: options?.location ?? vscode.ProgressLocation.Notification,
      title: `Splitify: ${title}`,
      cancellable: options?.cancellable ?? true,
    },
    task,
  );
}
