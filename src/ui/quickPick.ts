import * as vscode from "vscode";
import type { CommitGroup } from "../types";

/**
 * Show a quick pick to select a commit group
 */
export async function showGroupQuickPick(
  groups: CommitGroup[],
  options: {
    title: string;
    placeholder: string;
  },
): Promise<CommitGroup | undefined> {
  const items = groups.map((g) => ({
    label: g.message,
    description: `${g.files.length} file${g.files.length > 1 ? "s" : ""}`,
    detail: g.reasoning,
    group: g,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    title: options.title,
    placeHolder: options.placeholder,
    matchOnDescription: true,
    matchOnDetail: true,
  });

  return selected?.group;
}

/**
 * Show a quick pick to select multiple commit groups
 */
export async function showMultiGroupQuickPick(
  groups: CommitGroup[],
  options: {
    title: string;
    placeholder: string;
  },
): Promise<CommitGroup[]> {
  const items = groups.map((g) => ({
    label: g.message,
    description: `${g.files.length} file${g.files.length > 1 ? "s" : ""}`,
    detail: g.reasoning,
    picked: true,
    group: g,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    title: options.title,
    placeHolder: options.placeholder,
    canPickMany: true,
    matchOnDescription: true,
    matchOnDetail: true,
  });

  return selected?.map((s) => s.group) || [];
}

/**
 * Show a confirmation dialog for committing groups
 */
export async function showCommitConfirmation(
  groups: CommitGroup[],
): Promise<boolean> {
  const fileCount = groups.reduce((acc, g) => acc + g.files.length, 0);

  const result = await vscode.window.showWarningMessage(
    `Commit ${groups.length} group${groups.length > 1 ? "s" : ""} (${fileCount} file${fileCount > 1 ? "s" : ""})?`,
    { modal: true },
    "Commit",
  );

  return result === "Commit";
}
