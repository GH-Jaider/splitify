import * as assert from "assert";
import * as vscode from "vscode";
import {
  CommitGroupsTreeProvider,
  CommitGroupTreeItem,
  FileTreeItem,
  UngroupedFilesTreeItem,
} from "../../views/commitGroupsTreeProvider";
import type { IGroupingEngine, CommitGroup, FileChange } from "../../types";

function createMockFile(index: number): FileChange {
  return {
    path: `src/file${index}.ts`,
    status: "modified" as const,
    diff: `diff for file${index}`,
    additions: 10,
    deletions: 5,
  };
}

function createMockGroup(id: string, fileCount: number = 1): CommitGroup {
  const files: FileChange[] = Array.from({ length: fileCount }, (_, i) =>
    createMockFile(i),
  );
  return {
    id,
    name: `group-${id}`,
    message: `feat: ${id}`,
    files,
    reasoning: `Group ${id}`,
    status: "pending" as const,
  };
}

function createMockGroupingEngine(
  groups: CommitGroup[],
  ungroupedFiles: FileChange[] = [],
): IGroupingEngine {
  const emitter = new vscode.EventEmitter<CommitGroup[]>();
  return {
    groups,
    ungroupedFiles,
    onGroupsChanged: emitter.event,
    analyzeChanges: async () => groups,
    commitGroup: async () => {},
    commitAllGroups: async () => ({ success: 0, failed: 0, cancelled: 0 }),
    discardGroup: () => {},
    updateGroupMessage: () => {},
    clearGroups: () => {},
    moveFileToGroup: () => {},
    removeFileFromGroup: () => false,
    addFileToGroup: () => false,
    createGroup: () => groups[0],
    mergeGroups: () => false,
    getGroupById: (id: string) => groups.find((g) => g.id === id),
  };
}

suite("CommitGroupsTreeProvider checkbox state management", () => {
  let provider: CommitGroupsTreeProvider;

  setup(() => {
    provider = new CommitGroupsTreeProvider();
    const engine = createMockGroupingEngine([
      createMockGroup("g1"),
      createMockGroup("g2"),
      createMockGroup("g3"),
    ]);
    provider.setGroupingEngine(engine);
  });

  test("should return empty checked group IDs initially", () => {
    const checked = provider.getCheckedGroupIds();
    assert.deepStrictEqual(checked, []);
  });

  test("should add group ID when setCheckboxState(id, true) is called", () => {
    provider.setCheckboxState("g1", true);
    const checked = provider.getCheckedGroupIds();
    assert.deepStrictEqual(checked, ["g1"]);
  });

  test("should remove group ID when setCheckboxState(id, false) is called", () => {
    provider.setCheckboxState("g1", true);
    provider.setCheckboxState("g1", false);
    const checked = provider.getCheckedGroupIds();
    assert.deepStrictEqual(checked, []);
  });

  test("should be idempotent for duplicate checks", () => {
    provider.setCheckboxState("g1", true);
    provider.setCheckboxState("g1", true);
    const checked = provider.getCheckedGroupIds();
    assert.deepStrictEqual(checked, ["g1"]);
  });

  test("should be idempotent for unchecking an unchecked group", () => {
    provider.setCheckboxState("g1", false);
    const checked = provider.getCheckedGroupIds();
    assert.deepStrictEqual(checked, []);
  });

  test("should track multiple checked groups simultaneously", () => {
    provider.setCheckboxState("g1", true);
    provider.setCheckboxState("g2", true);
    provider.setCheckboxState("g3", true);
    const checked = provider.getCheckedGroupIds();
    assert.strictEqual(checked.length, 3);
    assert.ok(checked.includes("g1"));
    assert.ok(checked.includes("g2"));
    assert.ok(checked.includes("g3"));
  });

  test("should fire tree data refresh on setCheckboxState", () => {
    let fired = false;
    provider.onDidChangeTreeData(() => {
      fired = true;
    });
    provider.setCheckboxState("g1", true);
    assert.strictEqual(fired, true);
  });

  test("should clear all checked state with clearAllCheckboxes", () => {
    provider.setCheckboxState("g1", true);
    provider.setCheckboxState("g2", true);
    provider.clearAllCheckboxes();
    const checked = provider.getCheckedGroupIds();
    assert.deepStrictEqual(checked, []);
  });

  test("should fire tree data refresh on clearAllCheckboxes", () => {
    let fired = false;
    provider.onDidChangeTreeData(() => {
      fired = true;
    });
    provider.clearAllCheckboxes();
    assert.strictEqual(fired, true);
  });

  test("should not error when clearAllCheckboxes called on empty state", () => {
    assert.doesNotThrow(() => {
      provider.clearAllCheckboxes();
    });
    const checked = provider.getCheckedGroupIds();
    assert.deepStrictEqual(checked, []);
  });
});

suite("CommitGroupsTreeProvider getChildren() checkbox integration", () => {
  let provider: CommitGroupsTreeProvider;

  setup(() => {
    provider = new CommitGroupsTreeProvider();
  });

  test("should return CommitGroupTreeItems with Unchecked state by default", async () => {
    const engine = createMockGroupingEngine([
      createMockGroup("g1"),
      createMockGroup("g2"),
    ]);
    provider.setGroupingEngine(engine);

    const children = await provider.getChildren();
    const groupItems = children.filter((c) => c instanceof CommitGroupTreeItem);

    assert.strictEqual(groupItems.length, 2);
    for (const item of groupItems) {
      assert.strictEqual(
        item.checkboxState,
        vscode.TreeItemCheckboxState.Unchecked,
        `Group ${(item as CommitGroupTreeItem).group.id} should be unchecked`,
      );
    }
  });

  test("should return Checked state for checked groups", async () => {
    const engine = createMockGroupingEngine([
      createMockGroup("g1"),
      createMockGroup("g2"),
    ]);
    provider.setGroupingEngine(engine);
    provider.setCheckboxState("g1", true);

    const children = await provider.getChildren();
    const groupItems = children.filter(
      (c) => c instanceof CommitGroupTreeItem,
    ) as CommitGroupTreeItem[];

    const g1 = groupItems.find((item) => item.group.id === "g1");
    const g2 = groupItems.find((item) => item.group.id === "g2");

    assert.strictEqual(g1?.checkboxState, vscode.TreeItemCheckboxState.Checked);
    assert.strictEqual(
      g2?.checkboxState,
      vscode.TreeItemCheckboxState.Unchecked,
    );
  });

  test("should not set checkboxState on FileTreeItems", async () => {
    const engine = createMockGroupingEngine([createMockGroup("g1", 2)]);
    provider.setGroupingEngine(engine);

    const children = await provider.getChildren();
    const groupItem = children.find(
      (c) => c instanceof CommitGroupTreeItem,
    ) as CommitGroupTreeItem;
    assert.ok(groupItem, "Should have a group item");

    const fileChildren = await provider.getChildren(groupItem);
    const fileItems = fileChildren.filter((c) => c instanceof FileTreeItem);

    assert.strictEqual(fileItems.length, 2);
    for (const item of fileItems) {
      assert.strictEqual(
        item.checkboxState,
        undefined,
        "FileTreeItem should not have checkboxState set",
      );
    }
  });

  test("should not set checkboxState on UngroupedFilesTreeItem", async () => {
    const ungroupedFiles = [createMockFile(0), createMockFile(1)];
    const engine = createMockGroupingEngine(
      [createMockGroup("g1")],
      ungroupedFiles,
    );
    provider.setGroupingEngine(engine);

    const children = await provider.getChildren();
    const ungroupedItem = children.find(
      (c) => c instanceof UngroupedFilesTreeItem,
    );

    assert.ok(ungroupedItem, "Should have an ungrouped files item");
    assert.strictEqual(
      ungroupedItem!.checkboxState,
      undefined,
      "UngroupedFilesTreeItem should not have checkboxState set",
    );
  });

  test("should preserve checkbox state across refresh cycles", async () => {
    const engine = createMockGroupingEngine([
      createMockGroup("g1"),
      createMockGroup("g2"),
    ]);
    provider.setGroupingEngine(engine);
    provider.setCheckboxState("g2", true);

    // First fetch
    let children = await provider.getChildren();
    let groupItems = children.filter(
      (c) => c instanceof CommitGroupTreeItem,
    ) as CommitGroupTreeItem[];
    let g2 = groupItems.find((item) => item.group.id === "g2");
    assert.strictEqual(g2?.checkboxState, vscode.TreeItemCheckboxState.Checked);

    // Trigger refresh
    provider.refresh();

    // Second fetch
    children = await provider.getChildren();
    groupItems = children.filter(
      (c) => c instanceof CommitGroupTreeItem,
    ) as CommitGroupTreeItem[];
    g2 = groupItems.find((item) => item.group.id === "g2");
    assert.strictEqual(
      g2?.checkboxState,
      vscode.TreeItemCheckboxState.Checked,
      "Checkbox state should be preserved after refresh",
    );
  });
});
