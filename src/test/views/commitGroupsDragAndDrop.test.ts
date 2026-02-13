import * as assert from "assert";
import * as vscode from "vscode";
import type { IGroupingEngine, CommitGroup, FileChange } from "../../types";
import {
  CommitGroupTreeItem,
  FileTreeItem,
  UngroupedFilesTreeItem,
} from "../../views/commitGroupsTreeProvider";
import { CommitGroupsDragAndDropController } from "../../views/dragAndDrop";

function createMockGroup(id: string, fileCount: number = 1): CommitGroup {
  const files: FileChange[] = Array.from({ length: fileCount }, (_, i) => ({
    path: `src/file${i}.ts`,
    status: "modified" as const,
    diff: `diff for file${i}`,
    additions: 10,
    deletions: 5,
  }));
  return {
    id,
    name: `group-${id}`,
    message: `feat: ${id}`,
    files,
    reasoning: `Group ${id}`,
    status: "pending" as const,
  };
}

// Spy-enabled mock that tracks calls
function createSpyGroupingEngine(groups: CommitGroup[] = []) {
  const calls: { method: string; args: unknown[] }[] = [];
  const emitter = new vscode.EventEmitter<CommitGroup[]>();
  return {
    engine: {
      groups,
      ungroupedFiles: [],
      onGroupsChanged: emitter.event,
      analyzeChanges: async () => groups,
      commitGroup: async () => {},
      commitAllGroups: async () => ({ success: 0, failed: 0, cancelled: 0 }),
      discardGroup: () => {},
      updateGroupMessage: () => {},
      clearGroups: () => {},
      moveFileToGroup: (...args: unknown[]) => {
        calls.push({ method: "moveFileToGroup", args });
      },
      removeFileFromGroup: (...args: unknown[]) => {
        calls.push({ method: "removeFileFromGroup", args });
        return true;
      },
      addFileToGroup: (...args: unknown[]) => {
        calls.push({ method: "addFileToGroup", args });
        return true;
      },
      createGroup: () => groups[0],
      mergeGroups: () => false,
      getGroupById: (id: string) => groups.find((g) => g.id === id),
    } as IGroupingEngine,
    calls,
  };
}

// Mock DataTransfer
function createMockDataTransfer(): vscode.DataTransfer {
  const store = new Map<string, vscode.DataTransferItem>();
  return {
    get: (mime: string) => store.get(mime),
    set: (mime: string, item: vscode.DataTransferItem) => store.set(mime, item),
    forEach: (cb: (item: vscode.DataTransferItem, mime: string) => void) =>
      store.forEach((v, k) => cb(v, k)),
    [Symbol.iterator]: () => store.entries(),
  } as unknown as vscode.DataTransfer;
}

function createMockCancellationToken(): vscode.CancellationToken {
  return new vscode.CancellationTokenSource().token;
}

suite("CommitGroupsDragAndDropController contract", () => {
  test("should have correct dropMimeTypes", () => {
    const controller = new CommitGroupsDragAndDropController(() => undefined);
    assert.ok(Array.isArray(controller.dropMimeTypes));
    assert.ok(controller.dropMimeTypes.length > 0);
    assert.ok(
      controller.dropMimeTypes.includes(
        "application/vnd.code.tree.splitifyGroupsView",
      ),
    );
  });

  test("should have correct dragMimeTypes", () => {
    const controller = new CommitGroupsDragAndDropController(() => undefined);
    assert.ok(Array.isArray(controller.dragMimeTypes));
    assert.ok(controller.dragMimeTypes.length > 0);
    assert.ok(
      controller.dragMimeTypes.includes(
        "application/vnd.code.tree.splitifyGroupsView",
      ),
    );
  });

  test("should have handleDrag as a function", () => {
    const controller = new CommitGroupsDragAndDropController(() => undefined);
    assert.strictEqual(typeof controller.handleDrag, "function");
  });

  test("should have handleDrop as a function", () => {
    const controller = new CommitGroupsDragAndDropController(() => undefined);
    assert.strictEqual(typeof controller.handleDrop, "function");
  });
});

suite("handleDrag", () => {
  test("should serialize a FileTreeItem from a group into data transfer", () => {
    const controller = new CommitGroupsDragAndDropController(() => undefined);
    const fileItem = new FileTreeItem(
      "/workspace/src/foo.ts",
      "src/foo.ts",
      "modified",
      10,
      5,
      "g1",
    );

    const dataTransfer = createMockDataTransfer();
    const token = createMockCancellationToken();

    controller.handleDrag([fileItem], dataTransfer, token);

    const transferItem = dataTransfer.get(
      "application/vnd.code.tree.splitifyGroupsView",
    );
    assert.ok(transferItem, "DataTransfer should contain the MIME type item");

    const data = JSON.parse(transferItem!.value);
    assert.strictEqual(data.filePath, "src/foo.ts");
    assert.strictEqual(data.groupId, "g1");
  });

  test("should serialize an ungrouped FileTreeItem with empty groupId", () => {
    const controller = new CommitGroupsDragAndDropController(() => undefined);
    const fileItem = new FileTreeItem(
      "/workspace/src/bar.ts",
      "src/bar.ts",
      "added",
      20,
      0,
      "",
    );

    const dataTransfer = createMockDataTransfer();
    const token = createMockCancellationToken();

    controller.handleDrag([fileItem], dataTransfer, token);

    const transferItem = dataTransfer.get(
      "application/vnd.code.tree.splitifyGroupsView",
    );
    assert.ok(transferItem, "DataTransfer should contain the MIME type item");

    const data = JSON.parse(transferItem!.value);
    assert.strictEqual(data.filePath, "src/bar.ts");
    assert.strictEqual(data.groupId, "");
  });

  test("should not set data transfer when dragging a CommitGroupTreeItem", () => {
    const controller = new CommitGroupsDragAndDropController(() => undefined);
    const group = createMockGroup("g1");
    const groupItem = new CommitGroupTreeItem(
      group,
      vscode.TreeItemCollapsibleState.Expanded,
    );

    const dataTransfer = createMockDataTransfer();
    const token = createMockCancellationToken();

    controller.handleDrag([groupItem], dataTransfer, token);

    const transferItem = dataTransfer.get(
      "application/vnd.code.tree.splitifyGroupsView",
    );
    assert.strictEqual(
      transferItem,
      undefined,
      "DataTransfer should not contain the MIME type for group items",
    );
  });

  test("should not set data transfer when dragging an UngroupedFilesTreeItem", () => {
    const controller = new CommitGroupsDragAndDropController(() => undefined);
    const ungroupedItem = new UngroupedFilesTreeItem(3);

    const dataTransfer = createMockDataTransfer();
    const token = createMockCancellationToken();

    controller.handleDrag([ungroupedItem], dataTransfer, token);

    const transferItem = dataTransfer.get(
      "application/vnd.code.tree.splitifyGroupsView",
    );
    assert.strictEqual(
      transferItem,
      undefined,
      "DataTransfer should not contain the MIME type for ungrouped section items",
    );
  });

  test("should only serialize FileTreeItems when given mixed items", () => {
    const controller = new CommitGroupsDragAndDropController(() => undefined);
    const fileItem = new FileTreeItem(
      "/workspace/src/foo.ts",
      "src/foo.ts",
      "modified",
      10,
      5,
      "g1",
    );
    const group = createMockGroup("g1");
    const groupItem = new CommitGroupTreeItem(
      group,
      vscode.TreeItemCollapsibleState.Expanded,
    );

    const dataTransfer = createMockDataTransfer();
    const token = createMockCancellationToken();

    controller.handleDrag([fileItem, groupItem], dataTransfer, token);

    const transferItem = dataTransfer.get(
      "application/vnd.code.tree.splitifyGroupsView",
    );
    assert.ok(transferItem, "DataTransfer should contain the MIME type item");

    const data = JSON.parse(transferItem!.value);
    assert.strictEqual(data.filePath, "src/foo.ts");
    assert.strictEqual(data.groupId, "g1");
  });
});

suite("handleDrop - source × target matrix", () => {
  test("should call moveFileToGroup when dropping grouped file onto a different group", async () => {
    const groups = [createMockGroup("g1"), createMockGroup("g2")];
    const { engine, calls } = createSpyGroupingEngine(groups);
    const controller = new CommitGroupsDragAndDropController(() => engine);

    const dataTransfer = createMockDataTransfer();
    const payload = JSON.stringify({ filePath: "src/foo.ts", groupId: "g1" });
    dataTransfer.set(
      "application/vnd.code.tree.splitifyGroupsView",
      new vscode.DataTransferItem(payload),
    );

    const targetGroup = new CommitGroupTreeItem(
      groups[1],
      vscode.TreeItemCollapsibleState.Expanded,
    );
    const token = createMockCancellationToken();

    await controller.handleDrop(targetGroup, dataTransfer, token);

    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].method, "moveFileToGroup");
    assert.deepStrictEqual(calls[0].args, ["src/foo.ts", "g1", "g2"]);
  });

  test("should call removeFileFromGroup when dropping grouped file onto ungrouped section", async () => {
    const groups = [createMockGroup("g1")];
    const { engine, calls } = createSpyGroupingEngine(groups);
    const controller = new CommitGroupsDragAndDropController(() => engine);

    const dataTransfer = createMockDataTransfer();
    const payload = JSON.stringify({ filePath: "src/foo.ts", groupId: "g1" });
    dataTransfer.set(
      "application/vnd.code.tree.splitifyGroupsView",
      new vscode.DataTransferItem(payload),
    );

    const ungroupedItem = new UngroupedFilesTreeItem(2);
    const token = createMockCancellationToken();

    await controller.handleDrop(ungroupedItem, dataTransfer, token);

    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].method, "removeFileFromGroup");
    assert.deepStrictEqual(calls[0].args, ["src/foo.ts", "g1"]);
  });

  test("should call addFileToGroup when dropping ungrouped file onto a group", async () => {
    const groups = [createMockGroup("g1")];
    const { engine, calls } = createSpyGroupingEngine(groups);
    const controller = new CommitGroupsDragAndDropController(() => engine);

    const dataTransfer = createMockDataTransfer();
    const payload = JSON.stringify({ filePath: "src/foo.ts", groupId: "" });
    dataTransfer.set(
      "application/vnd.code.tree.splitifyGroupsView",
      new vscode.DataTransferItem(payload),
    );

    const targetGroup = new CommitGroupTreeItem(
      groups[0],
      vscode.TreeItemCollapsibleState.Expanded,
    );
    const token = createMockCancellationToken();

    await controller.handleDrop(targetGroup, dataTransfer, token);

    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].method, "addFileToGroup");
    assert.deepStrictEqual(calls[0].args, ["src/foo.ts", "g1"]);
  });

  test("should be a no-op when dropping ungrouped file onto ungrouped section", async () => {
    const { engine, calls } = createSpyGroupingEngine([]);
    const controller = new CommitGroupsDragAndDropController(() => engine);

    const dataTransfer = createMockDataTransfer();
    const payload = JSON.stringify({ filePath: "src/foo.ts", groupId: "" });
    dataTransfer.set(
      "application/vnd.code.tree.splitifyGroupsView",
      new vscode.DataTransferItem(payload),
    );

    const ungroupedItem = new UngroupedFilesTreeItem(2);
    const token = createMockCancellationToken();

    await controller.handleDrop(ungroupedItem, dataTransfer, token);

    assert.strictEqual(calls.length, 0, "No engine methods should be called");
  });
});

suite("handleDrop - invalid targets", () => {
  test("should not call any engine method when target is a FileTreeItem", async () => {
    const groups = [createMockGroup("g1")];
    const { engine, calls } = createSpyGroupingEngine(groups);
    const controller = new CommitGroupsDragAndDropController(() => engine);

    const dataTransfer = createMockDataTransfer();
    const payload = JSON.stringify({ filePath: "src/foo.ts", groupId: "g1" });
    dataTransfer.set(
      "application/vnd.code.tree.splitifyGroupsView",
      new vscode.DataTransferItem(payload),
    );

    const fileTarget = new FileTreeItem(
      "/workspace/src/bar.ts",
      "src/bar.ts",
      "modified",
      5,
      3,
      "g1",
    );
    const token = createMockCancellationToken();

    await controller.handleDrop(fileTarget, dataTransfer, token);

    assert.strictEqual(
      calls.length,
      0,
      "No engine methods should be called for FileTreeItem target",
    );
  });

  test("should not call any engine method when target is null/undefined", async () => {
    const groups = [createMockGroup("g1")];
    const { engine, calls } = createSpyGroupingEngine(groups);
    const controller = new CommitGroupsDragAndDropController(() => engine);

    const dataTransfer = createMockDataTransfer();
    const payload = JSON.stringify({ filePath: "src/foo.ts", groupId: "g1" });
    dataTransfer.set(
      "application/vnd.code.tree.splitifyGroupsView",
      new vscode.DataTransferItem(payload),
    );

    const token = createMockCancellationToken();

    await controller.handleDrop(undefined, dataTransfer, token);

    assert.strictEqual(
      calls.length,
      0,
      "No engine methods should be called for undefined target",
    );
  });

  test("should not call any engine method when data transfer has no matching MIME type", async () => {
    const groups = [createMockGroup("g1")];
    const { engine, calls } = createSpyGroupingEngine(groups);
    const controller = new CommitGroupsDragAndDropController(() => engine);

    const dataTransfer = createMockDataTransfer();
    // No MIME type set at all

    const targetGroup = new CommitGroupTreeItem(
      groups[0],
      vscode.TreeItemCollapsibleState.Expanded,
    );
    const token = createMockCancellationToken();

    await controller.handleDrop(targetGroup, dataTransfer, token);

    assert.strictEqual(
      calls.length,
      0,
      "No engine methods should be called when MIME type is missing",
    );
  });

  test("should not call any engine method when data transfer contains malformed JSON", async () => {
    const groups = [createMockGroup("g1")];
    const { engine, calls } = createSpyGroupingEngine(groups);
    const controller = new CommitGroupsDragAndDropController(() => engine);

    const dataTransfer = createMockDataTransfer();
    dataTransfer.set(
      "application/vnd.code.tree.splitifyGroupsView",
      new vscode.DataTransferItem("invalid json{"),
    );

    const targetGroup = new CommitGroupTreeItem(
      groups[0],
      vscode.TreeItemCollapsibleState.Expanded,
    );
    const token = createMockCancellationToken();

    // Should not throw
    await controller.handleDrop(targetGroup, dataTransfer, token);

    assert.strictEqual(
      calls.length,
      0,
      "No engine methods should be called for malformed JSON",
    );
  });
});

suite("handleDrop - edge case", () => {
  test("should call moveFileToGroup when dropping grouped file onto its own group", async () => {
    const groups = [createMockGroup("g1")];
    const { engine, calls } = createSpyGroupingEngine(groups);
    const controller = new CommitGroupsDragAndDropController(() => engine);

    const dataTransfer = createMockDataTransfer();
    const payload = JSON.stringify({ filePath: "src/foo.ts", groupId: "g1" });
    dataTransfer.set(
      "application/vnd.code.tree.splitifyGroupsView",
      new vscode.DataTransferItem(payload),
    );

    const targetGroup = new CommitGroupTreeItem(
      groups[0],
      vscode.TreeItemCollapsibleState.Expanded,
    );
    const token = createMockCancellationToken();

    await controller.handleDrop(targetGroup, dataTransfer, token);

    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].method, "moveFileToGroup");
    assert.deepStrictEqual(
      calls[0].args,
      ["src/foo.ts", "g1", "g1"],
      "Should delegate to engine even for same-group drop",
    );
  });
});
