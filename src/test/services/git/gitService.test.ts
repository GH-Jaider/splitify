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
    test("should commit specific files with the correct message", async () => {
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

    test("should preserve staging state of other files", async () => {
      // Create multiple files
      const fileA = path.join(testDir, "fileA.ts");
      const fileB = path.join(testDir, "fileB.ts");
      const fileC = path.join(testDir, "fileC.ts");
      fs.writeFileSync(fileA, "content A");
      fs.writeFileSync(fileB, "content B");
      fs.writeFileSync(fileC, "content C");

      // Stage fileA manually
      await git.add("fileA.ts");

      // Verify fileA is staged before commit
      const statusBefore = await git.status();
      assert.ok(
        statusBefore.staged.includes("fileA.ts"),
        "fileA.ts should be staged before stageAndCommit",
      );

      // Commit only fileB via stageAndCommit
      const gitService = new GitService(mockWorkspaceProvider);
      const commitHash = await gitService.stageAndCommit(
        ["fileB.ts"],
        "feat: add fileB only",
      );

      assert.ok(commitHash, "Should return commit hash");

      // Verify fileB was committed
      const log = await git.log({ maxCount: 1 });
      assert.strictEqual(log.latest?.message, "feat: add fileB only");

      // fileA should STILL be staged (staging state preserved)
      const statusAfter = await git.status();
      assert.ok(
        statusAfter.staged.includes("fileA.ts"),
        "fileA.ts should still be staged after stageAndCommit",
      );

      // fileC should still be untracked
      assert.ok(
        statusAfter.not_added.includes("fileC.ts"),
        "fileC.ts should still be untracked",
      );
    });

    test("should commit multiple files at once", async () => {
      const file1 = path.join(testDir, "multi-sc1.ts");
      const file2 = path.join(testDir, "multi-sc2.ts");
      fs.writeFileSync(file1, "content 1");
      fs.writeFileSync(file2, "content 2");

      const gitService = new GitService(mockWorkspaceProvider);
      const commitHash = await gitService.stageAndCommit(
        ["multi-sc1.ts", "multi-sc2.ts"],
        "feat: add both files",
      );

      assert.ok(commitHash, "Should return commit hash");

      // Verify both files were committed
      const log = await git.log({ maxCount: 1 });
      assert.strictEqual(log.latest?.message, "feat: add both files");

      // Both files should no longer be untracked
      const status = await git.status();
      assert.ok(
        !status.not_added.includes("multi-sc1.ts"),
        "multi-sc1.ts should have been committed",
      );
      assert.ok(
        !status.not_added.includes("multi-sc2.ts"),
        "multi-sc2.ts should have been committed",
      );
    });

    test("should commit multiple groups sequentially with correct files", async () => {
      // Create files for multiple groups
      fs.writeFileSync(path.join(testDir, "group1-file1.ts"), "content1");
      fs.writeFileSync(path.join(testDir, "group1-file2.ts"), "content2");
      fs.writeFileSync(path.join(testDir, "group2-file1.ts"), "content3");
      fs.writeFileSync(path.join(testDir, "group2-file2.ts"), "content4");
      fs.writeFileSync(path.join(testDir, "group3-file1.ts"), "content5");

      const gitService = new GitService(mockWorkspaceProvider);

      // Commit group 1
      await gitService.stageAndCommit(
        ["group1-file1.ts", "group1-file2.ts"],
        "feat: group 1 changes",
      );

      // Commit group 2
      await gitService.stageAndCommit(
        ["group2-file1.ts", "group2-file2.ts"],
        "fix: group 2 changes",
      );

      // Commit group 3
      await gitService.stageAndCommit(
        ["group3-file1.ts"],
        "docs: group 3 changes",
      );

      // Verify all 3 commits exist (plus initial commit = 4 total)
      const log = await git.log();
      // Should have initial + 3 group commits
      assert.ok(
        log.all.length >= 4,
        `Expected at least 4 commits, got ${log.all.length}`,
      );

      // Verify commit messages
      const messages = log.all.map((c) => c.message);
      assert.ok(messages.includes("docs: group 3 changes"));
      assert.ok(messages.includes("fix: group 2 changes"));
      assert.ok(messages.includes("feat: group 1 changes"));
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

  suite("hasPreCommitHook", () => {
    test("should return false when no pre-commit hook exists", async () => {
      const gitService = new GitService(mockWorkspaceProvider);
      const hasHook = await gitService.hasPreCommitHook();
      assert.strictEqual(hasHook, false);
    });

    test("should return true when pre-commit hook exists", async () => {
      const hooksDir = path.join(testDir, ".git", "hooks");
      fs.mkdirSync(hooksDir, { recursive: true });
      fs.writeFileSync(path.join(hooksDir, "pre-commit"), "#!/bin/sh\nexit 0", {
        mode: 0o755,
      });

      const gitService = new GitService(mockWorkspaceProvider);
      const hasHook = await gitService.hasPreCommitHook();
      assert.strictEqual(hasHook, true);
    });

    test("should return false when pre-commit hook exists but is not executable", async () => {
      const hooksDir = path.join(testDir, ".git", "hooks");
      fs.mkdirSync(hooksDir, { recursive: true });
      fs.writeFileSync(path.join(hooksDir, "pre-commit"), "#!/bin/sh\nexit 0", {
        mode: 0o644,
      });

      const gitService = new GitService(mockWorkspaceProvider);
      const hasHook = await gitService.hasPreCommitHook();
      assert.strictEqual(hasHook, false);
    });
  });

  suite("getRecentCommitMessages", () => {
    test("should return recent commit messages", async () => {
      // The test repo has an initial commit already
      // Add a few more commits
      fs.writeFileSync(path.join(testDir, "msg-test1.ts"), "content1");
      await git.add("msg-test1.ts");
      await git.commit("feat: add message test 1");

      fs.writeFileSync(path.join(testDir, "msg-test2.ts"), "content2");
      await git.add("msg-test2.ts");
      await git.commit("fix: resolve message test 2");

      const gitService = new GitService(mockWorkspaceProvider);
      const messages = await gitService.getRecentCommitMessages(5);

      assert.ok(
        messages.length >= 3,
        `Expected at least 3 messages, got ${messages.length}`,
      );
      assert.ok(messages.includes("fix: resolve message test 2"));
      assert.ok(messages.includes("feat: add message test 1"));
      assert.ok(messages.includes("Initial commit"));
    });

    test("should return empty array for new repo with no commits", async () => {
      // Create a brand new repo with no commits
      const emptyDir = path.join(os.tmpdir(), `splitify-empty-${Date.now()}`);
      fs.mkdirSync(emptyDir, { recursive: true });
      const emptyGit = simpleGit(emptyDir);
      await emptyGit.init();

      const emptyProvider = createMockWorkspaceProvider(emptyDir);
      const gitService = new GitService(emptyProvider);
      const messages = await gitService.getRecentCommitMessages(10);

      assert.deepStrictEqual(messages, []);

      // Cleanup
      fs.rmSync(emptyDir, { recursive: true, force: true });
    });

    test("should respect the count parameter", async () => {
      // Add multiple commits
      for (let i = 0; i < 5; i++) {
        fs.writeFileSync(
          path.join(testDir, `count-test-${i}.ts`),
          `content${i}`,
        );
        await git.add(`count-test-${i}.ts`);
        await git.commit(`commit ${i}`);
      }

      const gitService = new GitService(mockWorkspaceProvider);
      const messages = await gitService.getRecentCommitMessages(3);

      assert.strictEqual(messages.length, 3, "Should only return 3 messages");
    });
  });

  suite("stageAndCommit --no-verify", () => {
    test("should pass --no-verify flag when specified", async () => {
      // Create a pre-commit hook that would fail
      const hooksDir = path.join(testDir, ".git", "hooks");
      fs.mkdirSync(hooksDir, { recursive: true });
      fs.writeFileSync(
        path.join(hooksDir, "pre-commit"),
        "#!/bin/sh\nexit 1", // Hook that always rejects
        { mode: 0o755 },
      );

      const file = path.join(testDir, "no-verify-test.ts");
      fs.writeFileSync(file, "no-verify content");

      const gitService = new GitService(mockWorkspaceProvider);

      // Without --no-verify, commit should fail (hook rejects)
      try {
        await gitService.stageAndCommit(["no-verify-test.ts"], "should fail");
        assert.fail("Should have thrown due to pre-commit hook");
      } catch (error) {
        assert.ok(error instanceof Error);
      }

      // With --no-verify, commit should succeed
      const commitHash = await gitService.stageAndCommit(
        ["no-verify-test.ts"],
        "feat: no-verify test",
        true, // noVerify = true
      );

      assert.ok(commitHash, "Should return commit hash with --no-verify");

      const log = await git.log({ maxCount: 1 });
      assert.strictEqual(log.latest?.message, "feat: no-verify test");
    });
  });
});
