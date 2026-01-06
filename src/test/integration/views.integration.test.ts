import * as assert from "assert";
import * as vscode from "vscode";
import { waitForExtensionActivation, sleep } from "./helpers";

const EXTENSION_ID = "splitify.splitify";
const VIEW_ID = "splitify.groupsView";

suite("Views Integration Test Suite", () => {
  suiteSetup(async function () {
    this.timeout(30000);
    await waitForExtensionActivation(EXTENSION_ID);
    await sleep(1000);
  });

  suite("CommitGroupsTreeProvider", () => {
    test("should register the groups view", async () => {
      // Check if the view contribution is registered
      const extension = vscode.extensions.getExtension(EXTENSION_ID);

      if (extension) {
        const packageJson = extension.packageJSON;
        const views = packageJson.contributes?.views;

        assert.ok(views, "Extension should contribute views");

        // Check if the SCM view container has our view
        const scmViews = views.scm;
        assert.ok(
          scmViews,
          "Extension should contribute to SCM view container",
        );

        const groupsView = scmViews.find(
          (v: { id: string }) => v.id === VIEW_ID,
        );
        assert.ok(groupsView, "Groups view should be registered");
        assert.strictEqual(
          groupsView.name,
          "Splitify - Commit Groups",
          "View should have correct name",
        );
      }
    });

    test("should have correct view when clause", async () => {
      const extension = vscode.extensions.getExtension(EXTENSION_ID);

      if (extension) {
        const packageJson = extension.packageJSON;
        const scmViews = packageJson.contributes?.views?.scm;
        const groupsView = scmViews?.find(
          (v: { id: string }) => v.id === VIEW_ID,
        );

        assert.ok(
          groupsView?.when?.includes("splitify.hasGroups"),
          "View should only show when hasGroups is true",
        );
      }
    });
  });

  suite("View Menu Contributions", () => {
    test("should register refresh command in view title menu", async () => {
      const extension = vscode.extensions.getExtension(EXTENSION_ID);

      if (extension) {
        const packageJson = extension.packageJSON;
        const viewTitleMenus = packageJson.contributes?.menus?.["view/title"];

        assert.ok(viewTitleMenus, "Should have view/title menu contributions");

        const refreshItem = viewTitleMenus.find(
          (item: { command: string; when: string }) =>
            item.command === "splitify.refresh" && item.when?.includes(VIEW_ID),
        );
        assert.ok(refreshItem, "Refresh command should be in view title menu");
      }
    });

    test("should register commitAll command in view title menu", async () => {
      const extension = vscode.extensions.getExtension(EXTENSION_ID);

      if (extension) {
        const packageJson = extension.packageJSON;
        const viewTitleMenus = packageJson.contributes?.menus?.["view/title"];

        const commitAllItem = viewTitleMenus?.find(
          (item: { command: string; when: string }) =>
            item.command === "splitify.commitAll" &&
            item.when?.includes(VIEW_ID),
        );
        assert.ok(
          commitAllItem,
          "CommitAll command should be in view title menu",
        );
      }
    });
  });

  suite("View Item Context Menus", () => {
    test("should register inline actions for commit groups", async () => {
      const extension = vscode.extensions.getExtension(EXTENSION_ID);

      if (extension) {
        const packageJson = extension.packageJSON;
        const itemContextMenus =
          packageJson.contributes?.menus?.["view/item/context"];

        assert.ok(
          itemContextMenus,
          "Should have view/item/context menu contributions",
        );

        // Check for commitGroup context value
        const commitGroupActions = itemContextMenus.filter(
          (item: { when: string }) =>
            item.when?.includes("viewItem == commitGroup"),
        );

        assert.ok(
          commitGroupActions.length >= 3,
          "Should have at least 3 inline actions for commit groups (commit, edit, discard)",
        );

        const commands = commitGroupActions.map(
          (item: { command: string }) => item.command,
        );
        assert.ok(
          commands.includes("splitify.commitGroup"),
          "Should include commitGroup command",
        );
        assert.ok(
          commands.includes("splitify.editGroupMessage"),
          "Should include editGroupMessage command",
        );
        assert.ok(
          commands.includes("splitify.discardGroup"),
          "Should include discardGroup command",
        );
      }
    });
  });
});
