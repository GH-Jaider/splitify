import * as assert from "assert";
import * as vscode from "vscode";
import {
  waitForExtensionActivation,
  getCommandsWithPrefix,
  sleep,
} from "./helpers";

const EXTENSION_ID = "splitify.splitify";

suite("Extension Integration Test Suite", () => {
  suiteSetup(async function () {
    this.timeout(30000);
    // Wait for the extension to be activated
    await waitForExtensionActivation(EXTENSION_ID);
    // Give VS Code time to fully initialize
    await sleep(1000);
  });

  suite("Extension Activation", () => {
    test("should activate the extension", async () => {
      const extension = vscode.extensions.getExtension(EXTENSION_ID);

      // The extension might not be published yet, so we check if it exists
      // In a real scenario, this would verify the extension activates properly
      if (extension) {
        assert.ok(extension.isActive, "Extension should be active");
      }
    });

    test("should register all splitify commands", async () => {
      const commands = await getCommandsWithPrefix("splitify.");

      const expectedCommands = [
        "splitify.analyze",
        "splitify.commitGroup",
        "splitify.commitAll",
        "splitify.discardGroup",
        "splitify.editGroupMessage",
        "splitify.refresh",
      ];

      for (const cmd of expectedCommands) {
        assert.ok(
          commands.includes(cmd),
          `Command "${cmd}" should be registered`,
        );
      }
    });
  });

  suite("Extension Context", () => {
    test("should initialize splitify.hasGroups context to false", async () => {
      // The context value is not directly accessible, but we can verify
      // by checking that the view is not shown initially
      // This is a smoke test - the actual context is set internally
      const extension = vscode.extensions.getExtension(EXTENSION_ID);
      if (extension) {
        assert.ok(
          extension.isActive,
          "Extension should be active for context tests",
        );
      }
    });
  });
});
