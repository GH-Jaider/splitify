import * as vscode from "vscode";
import { minimatch } from "minimatch";

/**
 * Service for filtering files based on ignore patterns.
 * Reads patterns from `.splitifyignore` file and VS Code configuration.
 * Uses .gitignore-style glob syntax via minimatch.
 */
export class IgnoreService {
  private readonly patterns: string[];

  constructor(filePatterns: string[], configPatterns: string[]) {
    this.patterns = [...filePatterns, ...configPatterns]
      .map((p) => p.trim())
      .filter((p) => p.length > 0 && !p.startsWith("#"));
  }

  /**
   * Test whether a file path should be ignored based on loaded patterns.
   * Patterns are evaluated in order — later patterns can override earlier ones.
   * Negation patterns (`!pattern`) un-ignore a previously matched file.
   *
   * @param filePath - Relative file path to test
   * @returns true if the file should be excluded from analysis
   */
  shouldIgnore(filePath: string): boolean {
    const normalized = filePath.replace(/\\/g, "/");

    let ignored = false;
    for (const pattern of this.patterns) {
      if (pattern.startsWith("!")) {
        const negPattern = pattern.slice(1);
        if (minimatch(normalized, negPattern, { matchBase: true, dot: true })) {
          ignored = false;
        }
      } else {
        let p = pattern;
        if (p.endsWith("/")) {
          p = p + "**";
        }
        if (p.startsWith("/")) {
          p = p.slice(1);
        }
        if (minimatch(normalized, p, { matchBase: true, dot: true })) {
          ignored = true;
        }
      }
    }
    return ignored;
  }

  /**
   * Load ignore patterns from the workspace `.splitifyignore` file
   * and the `splitify.ignorePatterns` VS Code configuration setting.
   *
   * @returns A fully initialized IgnoreService
   */
  static async loadFromWorkspace(): Promise<IgnoreService> {
    const filePatterns = await IgnoreService.readIgnoreFile();
    const configPatterns = IgnoreService.readConfigPatterns();
    return new IgnoreService(filePatterns, configPatterns);
  }

  private static async readIgnoreFile(): Promise<string[]> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return [];
    }

    const ignoreUri = vscode.Uri.joinPath(
      workspaceFolder.uri,
      ".splitifyignore",
    );
    try {
      const content = await vscode.workspace.fs.readFile(ignoreUri);
      return Buffer.from(content).toString("utf-8").split("\n");
    } catch {
      return []; // File doesn't exist
    }
  }

  private static readConfigPatterns(): string[] {
    const config = vscode.workspace.getConfiguration("splitify");
    return config.get<string[]>("ignorePatterns", []);
  }
}
