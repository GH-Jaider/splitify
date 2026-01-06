import * as assert from "assert";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import simpleGit, { SimpleGit } from "simple-git";
import {
  GitService,
  getGitService,
  WorkspaceProvider,
} from "../../../services/git/gitService";

suite("GitService Test Suite", () => {
  let testDir: string;
  let git: SimpleGit;
  let mockWorkspaceProvider: WorkspaceProvider;

  /**
   * Creates a temporary git repository for testing
   */
  async function createTestRepo(): Promise<string> {
    const tmpDir = path.join(os.tmpdir(), `splitify-test-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    const testGit = simpleGit(tmpDir);
    await testGit.init();
    await testGit.addConfig("user.email", "test@test.com");
    await testGit.addConfig("user.name", "Test User");

    // Create initial commit so we have a valid repo state
    const readmePath = path.join(tmpDir, "README.md");
    fs.writeFileSync(readmePath, "# Test Repository\n");
    await testGit.add("README.md");
    await testGit.commit("Initial commit");

    return tmpDir;
  }

  /**
   * Cleans up the test repository
   */
  function cleanupTestRepo(dir: string): void {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }

  /**
   * Creates a mock workspace provider for testing
   */
  function createMockWorkspaceProvider(
    dir: string | undefined,
  ): WorkspaceProvider {
    return {
      getWorkspaceRoot: () => dir,
    };
  }

  setup(async () => {
    // Create test repository
    testDir = await createTestRepo();
    git = simpleGit(testDir);

    // Create mock workspace provider
    mockWorkspaceProvider = createMockWorkspaceProvider(testDir);
  });

  teardown(() => {
    // Cleanup test directory
    cleanupTestRepo(testDir);
  });

  suite("isGitRepository", () => {
    test("should return true for valid git repository", async () => {
      const gitService = new GitService(mockWorkspaceProvider);
      const result = await gitService.isGitRepository();
      assert.strictEqual(result, true);
    });

    test("should return false when no workspace is open", async () => {
      const noWorkspaceProvider = createMockWorkspaceProvider(undefined);
      const gitService = new GitService(noWorkspaceProvider);
      const result = await gitService.isGitRepository();
      assert.strictEqual(result, false);
    });
  });

  suite("getAllChanges", () => {
    test("should return empty changes for clean repository", async () => {
      const gitService = new GitService(mockWorkspaceProvider);
      const changes = await gitService.getAllChanges();

      assert.strictEqual(changes.totalFiles, 0);
      assert.strictEqual(changes.staged.length, 0);
      assert.strictEqual(changes.unstaged.length, 0);
      assert.strictEqual(changes.untracked.length, 0);
    });

    test("should detect untracked files", async () => {
      // Create a new untracked file
      const newFile = path.join(testDir, "new-file.ts");
      fs.writeFileSync(newFile, "const x = 1;");

      const gitService = new GitService(mockWorkspaceProvider);
      const changes = await gitService.getAllChanges();

      assert.strictEqual(changes.untracked.length, 1);
      assert.strictEqual(changes.untracked[0].path, "new-file.ts");
      assert.strictEqual(changes.untracked[0].status, "untracked");
    });

    test("should detect modified unstaged files", async () => {
      // Modify an existing tracked file
      const readmePath = path.join(testDir, "README.md");
      fs.writeFileSync(readmePath, "# Test Repository\n\nModified content");

      const gitService = new GitService(mockWorkspaceProvider);
      const changes = await gitService.getAllChanges();

      assert.strictEqual(changes.unstaged.length, 1);
      assert.strictEqual(changes.unstaged[0].path, "README.md");
      assert.strictEqual(changes.unstaged[0].status, "modified");
      assert.ok(changes.unstaged[0].diff.includes("Modified content"));
    });

    test("should detect staged files", async () => {
      // Create and stage a new file
      const newFile = path.join(testDir, "staged-file.ts");
      fs.writeFileSync(newFile, "export const value = 42;");
      await git.add("staged-file.ts");

      const gitService = new GitService(mockWorkspaceProvider);
      const changes = await gitService.getAllChanges();

      assert.strictEqual(changes.staged.length, 1);
      assert.strictEqual(changes.staged[0].path, "staged-file.ts");
      assert.strictEqual(changes.staged[0].status, "added");
    });

    test("should count additions and deletions correctly", async () => {
      // Modify file with known additions/deletions
      const readmePath = path.join(testDir, "README.md");
      fs.writeFileSync(readmePath, "Line 1\nLine 2\nLine 3");

      const gitService = new GitService(mockWorkspaceProvider);
      const changes = await gitService.getAllChanges();

      const modifiedFile = changes.unstaged[0];
      assert.ok(modifiedFile.additions > 0, "Should have additions");
      assert.ok(modifiedFile.deletions > 0, "Should have deletions");
    });

    test("should return all changes combined", async () => {
      // Create various types of changes
      const newFile = path.join(testDir, "new.ts");
      fs.writeFileSync(newFile, "new content");

      const stagedFile = path.join(testDir, "staged.ts");
      fs.writeFileSync(stagedFile, "staged content");
      await git.add("staged.ts");

      const readmePath = path.join(testDir, "README.md");
      fs.writeFileSync(readmePath, "modified");

      const gitService = new GitService(mockWorkspaceProvider);
      const changes = await gitService.getAllChanges();

      assert.strictEqual(changes.all.length, 3);
      assert.strictEqual(changes.totalFiles, 3);
    });
  });

  suite("stageFiles", () => {
    test("should stage specified files", async () => {
      // Create untracked files
      const file1 = path.join(testDir, "file1.ts");
      const file2 = path.join(testDir, "file2.ts");
      fs.writeFileSync(file1, "content 1");
      fs.writeFileSync(file2, "content 2");

      const gitService = new GitService(mockWorkspaceProvider);
      await gitService.stageFiles(["file1.ts"]);

      const status = await git.status();
      assert.ok(
        status.staged.includes("file1.ts"),
        "file1.ts should be staged",
      );
      assert.ok(
        !status.staged.includes("file2.ts"),
        "file2.ts should not be staged",
      );
    });

    test("should stage multiple files at once", async () => {
      const file1 = path.join(testDir, "multi1.ts");
      const file2 = path.join(testDir, "multi2.ts");
      fs.writeFileSync(file1, "content 1");
      fs.writeFileSync(file2, "content 2");

      const gitService = new GitService(mockWorkspaceProvider);
      await gitService.stageFiles(["multi1.ts", "multi2.ts"]);

      const status = await git.status();
      assert.ok(status.staged.includes("multi1.ts"));
      assert.ok(status.staged.includes("multi2.ts"));
    });
  });

  suite("unstageFiles", () => {
    test("should unstage specified files", async () => {
      // Create and stage files
      const file1 = path.join(testDir, "unstage1.ts");
      const file2 = path.join(testDir, "unstage2.ts");
      fs.writeFileSync(file1, "content 1");
      fs.writeFileSync(file2, "content 2");
      await git.add(["unstage1.ts", "unstage2.ts"]);

      const gitService = new GitService(mockWorkspaceProvider);
      await gitService.unstageFiles(["unstage1.ts"]);

      const status = await git.status();
      assert.ok(
        !status.staged.includes("unstage1.ts"),
        "unstage1.ts should be unstaged",
      );
      assert.ok(
        status.staged.includes("unstage2.ts"),
        "unstage2.ts should remain staged",
      );
    });
  });

  suite("unstageAll", () => {
    test("should unstage all files", async () => {
      // Create and stage multiple files
      const file1 = path.join(testDir, "all1.ts");
      const file2 = path.join(testDir, "all2.ts");
      fs.writeFileSync(file1, "content 1");
      fs.writeFileSync(file2, "content 2");
      await git.add(["all1.ts", "all2.ts"]);

      const gitService = new GitService(mockWorkspaceProvider);
      await gitService.unstageAll();

      const status = await git.status();
      assert.strictEqual(status.staged.length, 0, "No files should be staged");
    });
  });

  suite("commit", () => {
    test("should create a commit with staged files", async () => {
      // Create and stage a file
      const file = path.join(testDir, "commit-test.ts");
      fs.writeFileSync(file, "commit content");
      await git.add("commit-test.ts");

      const gitService = new GitService(mockWorkspaceProvider);
      const commitHash = await gitService.commit("test: add commit test file");

      assert.ok(commitHash, "Should return commit hash");
      assert.ok(commitHash.length > 0, "Commit hash should not be empty");

      // Verify commit was created
      const log = await git.log({ maxCount: 1 });
      assert.strictEqual(log.latest?.message, "test: add commit test file");
    });

    test("should throw error when nothing is staged", async () => {
      const gitService = new GitService(mockWorkspaceProvider);

      try {
        await gitService.commit("empty commit");
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.ok(error instanceof Error);
      }
    });
  });

  suite("stageAndCommit", () => {
    test("should stage specific files and commit them", async () => {
      // Create multiple files
      const file1 = path.join(testDir, "sc1.ts");
      const file2 = path.join(testDir, "sc2.ts");
      fs.writeFileSync(file1, "content 1");
      fs.writeFileSync(file2, "content 2");

      const gitService = new GitService(mockWorkspaceProvider);
      const commitHash = await gitService.stageAndCommit(
        ["sc1.ts"],
        "feat: add sc1 only",
      );

      assert.ok(commitHash, "Should return commit hash");

      // Verify only sc1.ts was committed
      const log = await git.log({ maxCount: 1 });
      assert.strictEqual(log.latest?.message, "feat: add sc1 only");

      // sc2.ts should still be untracked
      const status = await git.status();
      assert.ok(
        status.not_added.includes("sc2.ts"),
        "sc2.ts should still be untracked",
      );
    });
  });

  suite("getCurrentBranch", () => {
    test("should return current branch name", async () => {
      const gitService = new GitService(mockWorkspaceProvider);
      const branch = await gitService.getCurrentBranch();

      // Default branch could be 'main' or 'master' depending on git config
      assert.ok(
        branch === "main" || branch === "master",
        `Branch should be main or master, got: ${branch}`,
      );
    });

    test("should return correct branch after switching", async () => {
      await git.checkoutLocalBranch("feature-test");

      const gitService = new GitService(mockWorkspaceProvider);
      const branch = await gitService.getCurrentBranch();

      assert.strictEqual(branch, "feature-test");
    });
  });

  suite("refresh", () => {
    test("should reset internal state", async () => {
      const gitService = new GitService(mockWorkspaceProvider);

      // Call some method to initialize git instance
      await gitService.isGitRepository();

      // Refresh should not throw
      gitService.refresh();

      // Should still work after refresh
      const isRepo = await gitService.isGitRepository();
      assert.strictEqual(isRepo, true);
    });
  });

  suite("getGitService (singleton)", () => {
    test("should return same instance on multiple calls", () => {
      const instance1 = getGitService();
      const instance2 = getGitService();

      assert.strictEqual(
        instance1,
        instance2,
        "Should return same singleton instance",
      );
    });
  });

  suite("error handling", () => {
    test("should throw error when no workspace is open", async () => {
      const noWorkspaceProvider = createMockWorkspaceProvider(undefined);
      const gitService = new GitService(noWorkspaceProvider);

      try {
        await gitService.getAllChanges();
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok((error as Error).message.includes("workspace"));
      }
    });
  });
});
