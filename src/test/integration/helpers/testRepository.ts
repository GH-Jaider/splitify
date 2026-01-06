import * as fs from "fs";
import * as path from "path";
import simpleGit, { SimpleGit } from "simple-git";

/**
 * Helper class to manage a test Git repository for integration tests.
 * Creates an isolated repository with sample files and changes.
 */
export class TestRepository {
  private git: SimpleGit | null = null;

  constructor(private readonly repoPath: string) {
    // Don't initialize git here - the directory may not exist yet
  }

  /**
   * Ensure git is initialized
   */
  private ensureGit(): SimpleGit {
    if (!this.git) {
      this.git = simpleGit(this.repoPath);
    }
    return this.git;
  }

  /**
   * Initialize a fresh git repository with initial commit
   */
  async init(): Promise<void> {
    // Clean up if exists
    await this.cleanup();

    // Create directory
    fs.mkdirSync(this.repoPath, { recursive: true });

    // Initialize git
    this.git = simpleGit(this.repoPath);
    await this.git.init();
    await this.git.addConfig("user.email", "test@splitify.test");
    await this.git.addConfig("user.name", "Splitify Test");

    // Create initial file and commit
    const readmePath = path.join(this.repoPath, "README.md");
    fs.writeFileSync(readmePath, "# Test Repository\n");
    await this.git.add("README.md");
    await this.git.commit("Initial commit");
  }

  /**
   * Create a new file in the repository
   */
  createFile(relativePath: string, content: string): void {
    const fullPath = path.join(this.repoPath, relativePath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(fullPath, content);
  }

  /**
   * Modify an existing file
   */
  modifyFile(relativePath: string, content: string): void {
    const fullPath = path.join(this.repoPath, relativePath);
    fs.writeFileSync(fullPath, content);
  }

  /**
   * Delete a file from the repository
   */
  deleteFile(relativePath: string): void {
    const fullPath = path.join(this.repoPath, relativePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  }

  /**
   * Stage a file
   */
  async stage(relativePath: string): Promise<void> {
    await this.ensureGit().add(relativePath);
  }

  /**
   * Stage all changes
   */
  async stageAll(): Promise<void> {
    await this.ensureGit().add(".");
  }

  /**
   * Commit staged changes
   */
  async commit(message: string): Promise<void> {
    await this.ensureGit().commit(message);
  }

  /**
   * Get the current status of the repository
   */
  async getStatus(): Promise<{
    staged: string[];
    unstaged: string[];
    untracked: string[];
  }> {
    const status = await this.ensureGit().status();
    return {
      staged: status.staged,
      unstaged: status.modified,
      untracked: status.not_added,
    };
  }

  /**
   * Create a set of sample changes for testing the grouping feature
   */
  async createSampleChanges(): Promise<void> {
    // Feature files (should be grouped together)
    this.createFile(
      "src/auth/login.ts",
      `export function login(username: string, password: string): boolean {
  // TODO: Implement actual authentication
  return username === "admin" && password === "admin";
}
`,
    );

    this.createFile(
      "src/auth/logout.ts",
      `export function logout(): void {
  // Clear session
  console.log("User logged out");
}
`,
    );

    // Bug fix files (should be grouped together)
    this.createFile(
      "src/utils/validation.ts",
      `export function validateEmail(email: string): boolean {
  // Fixed: was not handling empty strings
  if (!email || email.length === 0) {
    return false;
  }
  const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
  return emailRegex.test(email);
}
`,
    );

    // Documentation (should be grouped separately)
    this.modifyFile(
      "README.md",
      `# Test Repository

## Overview
This is a sample repository for testing Splitify.

## Features
- Authentication
- Validation utilities
`,
    );

    // Config change (should be grouped separately)
    this.createFile(
      "config.json",
      `{
  "apiUrl": "https://api.example.com",
  "timeout": 5000
}
`,
    );
  }

  /**
   * Clean up the test repository
   */
  async cleanup(): Promise<void> {
    if (fs.existsSync(this.repoPath)) {
      fs.rmSync(this.repoPath, { recursive: true, force: true });
    }
  }
}
