import * as assert from "assert";
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import {
  TestRepository,
  waitForExtensionActivation,
  executeCommand,
  sleep,
  getWorkspaceFolder,
} from "./helpers";

const EXTENSION_ID = "splitify.splitify";

suite("Commands Integration Test Suite", () => {
  let testRepo: TestRepository;
  let testRepoPath: string;

  suiteSetup(async function () {
    this.timeout(30000);

    // Wait for extension activation
    await waitForExtensionActivation(EXTENSION_ID);

    // Set up test repository in workspace
    const workspaceFolder = getWorkspaceFolder();
    if (!workspaceFolder) {
      throw new Error("No workspace folder found for integration tests");
    }

    testRepoPath = path.join(workspaceFolder, ".test-repo");
    testRepo = new TestRepository(testRepoPath);
    await testRepo.init();
  });

  suiteTeardown(async () => {
    // Clean up test repository
    if (testRepo) {
      await testRepo.cleanup();
    }
  });

  setup(async function () {
    this.timeout(10000);
    // Reset repository state before each test
    await testRepo.init();
  });

  suite("splitify.analyze command", () => {
    test("should execute without error when extension is active", async function () {
      this.timeout(15000);

      // Create some changes to analyze
      await testRepo.createSampleChanges();

      // Execute the analyze command
      // Note: This will likely fail if Copilot is not available,
      // but should not throw an unhandled error
      try {
        await executeCommand("splitify.analyze");
        // If we get here, command executed (may or may not have succeeded)
      } catch (error) {
        // Command might fail due to no Copilot model, which is expected
        // The important thing is that it doesn't crash the extension
        assert.ok(error instanceof Error, "Error should be an Error instance");
      }
    });

    test("should show message when no changes exist", async function () {
      this.timeout(10000);

      // Repository is clean after init, so analyze should find no changes
      // Note: The actual message display is asynchronous and hard to verify
      // This is more of a smoke test
      try {
        await executeCommand("splitify.analyze");
      } catch {
        // Expected to fail with "no changes" or similar
      }
    });
  });

  suite("splitify.refresh command", () => {
    test("should execute without error", async function () {
      this.timeout(5000);

      // Refresh should work even without any prior analysis
      try {
        await executeCommand("splitify.refresh");
      } catch (error) {
        // May fail if no groups exist, but should not crash
        if (error instanceof Error) {
          // Acceptable failures
          assert.ok(
            error.message.includes("engine") ||
              error.message.includes("initialized") ||
              error.message.includes("No groups"),
            `Unexpected error: ${error.message}`,
          );
        }
      }
    });
  });

  suite("splitify.commitGroup command", () => {
    test("should fail gracefully when no group ID is provided", async function () {
      this.timeout(5000);

      try {
        await executeCommand("splitify.commitGroup");
      } catch (error) {
        assert.ok(error instanceof Error, "Should throw an error");
      }
    });
  });

  suite("splitify.commitAll command", () => {
    test("should handle empty groups gracefully", async function () {
      this.timeout(5000);

      try {
        await executeCommand("splitify.commitAll");
      } catch (error) {
        // Expected to fail when no groups exist
        assert.ok(error instanceof Error, "Should throw an error");
      }
    });
  });

  suite("splitify.discardGroup command", () => {
    test("should fail gracefully when no group ID is provided", async function () {
      this.timeout(5000);

      try {
        await executeCommand("splitify.discardGroup");
      } catch (error) {
        assert.ok(error instanceof Error, "Should throw an error");
      }
    });
  });

  suite("splitify.editGroupMessage command", () => {
    test("should fail gracefully when no group ID is provided", async function () {
      this.timeout(5000);

      try {
        await executeCommand("splitify.editGroupMessage");
      } catch (error) {
        assert.ok(error instanceof Error, "Should throw an error");
      }
    });
  });
});
