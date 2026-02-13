import * as assert from "assert";
import * as vscode from "vscode";
import { GroupingEngine } from "../../../services/grouping/groupingEngine";
import { CommitGroup } from "../../../services/grouping/types";
import { FileChange, ChangesSummary } from "../../../services/git/types";
import {
  FileChangeInput,
  GroupingSuggestion,
} from "../../../services/ai/types";
import { IgnoreService } from "../../../services/ignore/ignoreService";

/**
 * Mock GitService for testing
 */
class MockGitService {
  private mockChanges: ChangesSummary = {
    all: [],
    staged: [],
    unstaged: [],
    untracked: [],
    totalFiles: 0,
  };

  private stageAndCommitCalls: Array<{ paths: string[]; message: string }> = [];
  private shouldFailCommit = false;
  private mockRecentCommits: string[] = [
    "feat: add initial feature",
    "fix: resolve login bug",
    "chore: update dependencies",
    "refactor: extract helper function",
    "docs: update README",
  ];

  setMockChanges(changes: ChangesSummary): void {
    this.mockChanges = changes;
  }

  setShouldFailCommit(shouldFail: boolean): void {
    this.shouldFailCommit = shouldFail;
  }

  async getAllChanges(): Promise<ChangesSummary> {
    return this.mockChanges;
  }

  async getRecentCommitMessages(_count: number = 20): Promise<string[]> {
    return this.mockRecentCommits;
  }

  async stageAndCommit(
    paths: string[],
    message: string,
    _noVerify: boolean = false,
  ): Promise<string> {
    if (this.shouldFailCommit) {
      throw new Error("Commit failed");
    }
    this.stageAndCommitCalls.push({ paths, message });
    return `mock-commit-hash-${Date.now()}`;
  }

  async hasPreCommitHook(): Promise<boolean> {
    return false;
  }

  async runPreCommitHook(): Promise<void> {
    // no-op
  }

  async stageFiles(_paths: string[]): Promise<void> {
    // no-op
  }

  async unstageAll(): Promise<void> {
    // no-op
  }

  getStageAndCommitCalls(): Array<{ paths: string[]; message: string }> {
    return this.stageAndCommitCalls;
  }

  resetCalls(): void {
    this.stageAndCommitCalls = [];
  }
}

/**
 * Mock AIService for testing
 */
class MockAIService {
  private mockSuggestions: GroupingSuggestion[] = [];
  private shouldFail = false;
  private lastReceivedChanges: FileChangeInput[] = [];

  setMockSuggestions(suggestions: GroupingSuggestion[]): void {
    this.mockSuggestions = suggestions;
  }

  setShouldFail(shouldFail: boolean): void {
    this.shouldFail = shouldFail;
  }

  getLastReceivedChanges(): FileChangeInput[] {
    return this.lastReceivedChanges;
  }

  async analyzeAndGroupChanges(
    _changes: Array<{ path: string; diff: string }>,
    _token: vscode.CancellationToken,
    _recentCommits?: string[],
  ): Promise<GroupingSuggestion[]> {
    if (this.shouldFail) {
      throw new Error("AI analysis failed");
    }
    return this.mockSuggestions;
  }

  async analyzeAndGroupChangesStreaming(
    changes: FileChangeInput[],
    _token: vscode.CancellationToken,
    _recentCommits?: string[],
    onGroup?: (group: GroupingSuggestion) => void,
  ): Promise<GroupingSuggestion[]> {
    if (this.shouldFail) {
      throw new Error("AI analysis failed");
    }
    this.lastReceivedChanges = changes;
    const suggestions = this.mockSuggestions;
    if (onGroup) {
      for (const suggestion of suggestions) {
        onGroup(suggestion);
      }
    }
    return suggestions;
  }
}

/**
 * Helper to create mock file changes
 */
function createMockFileChange(
  path: string,
  status: FileChange["status"] = "modified",
): FileChange {
  return {
    path,
    status,
    diff: `diff for ${path}`,
    additions: 10,
    deletions: 5,
  };
}

/**
 * Helper to create mock changes summary
 */
function createMockChangesSummary(files: FileChange[]): ChangesSummary {
  return {
    all: files,
    staged: [],
    unstaged: files,
    untracked: [],
    totalFiles: files.length,
  };
}

suite("GroupingEngine Test Suite", () => {
  let mockGitService: MockGitService;
  let mockAIService: MockAIService;
  let groupingEngine: GroupingEngine;
  let mockCancellationToken: vscode.CancellationToken;

  setup(() => {
    mockGitService = new MockGitService();
    mockAIService = new MockAIService();
    groupingEngine = new GroupingEngine(
      mockGitService as any,
      mockAIService as any,
    );
    mockCancellationToken = new vscode.CancellationTokenSource().token;
  });

  suite("analyzeChanges", () => {
    test("should throw error when no changes to analyze", async () => {
      mockGitService.setMockChanges(createMockChangesSummary([]));

      try {
        await groupingEngine.analyzeChanges(mockCancellationToken);
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok((error as Error).message.includes("No changes"));
      }
    });

    test("should create commit groups from AI suggestions", async () => {
      const files = [
        createMockFileChange("src/auth.ts"),
        createMockFileChange("src/login.ts"),
        createMockFileChange("src/api.ts"),
      ];
      mockGitService.setMockChanges(createMockChangesSummary(files));

      mockAIService.setMockSuggestions([
        {
          name: "auth-feature",
          message: "feat(auth): add authentication",
          files: ["src/auth.ts", "src/login.ts"],
          reasoning: "Auth related files",
        },
        {
          name: "api-fix",
          message: "fix(api): resolve issue",
          files: ["src/api.ts"],
          reasoning: "API fix",
        },
      ]);

      const groups = await groupingEngine.analyzeChanges(mockCancellationToken);

      assert.strictEqual(groups.length, 2);
      assert.strictEqual(groups[0].name, "auth-feature");
      assert.strictEqual(groups[0].files.length, 2);
      assert.strictEqual(groups[1].name, "api-fix");
      assert.strictEqual(groups[1].files.length, 1);
    });

    test("should set all groups to pending status", async () => {
      const files = [createMockFileChange("src/test.ts")];
      mockGitService.setMockChanges(createMockChangesSummary(files));

      mockAIService.setMockSuggestions([
        {
          name: "test",
          message: "test: add tests",
          files: ["src/test.ts"],
          reasoning: "Test files",
        },
      ]);

      const groups = await groupingEngine.analyzeChanges(mockCancellationToken);

      assert.strictEqual(groups[0].status, "pending");
    });

    test("should generate unique IDs for each group", async () => {
      const files = [
        createMockFileChange("src/a.ts"),
        createMockFileChange("src/b.ts"),
      ];
      mockGitService.setMockChanges(createMockChangesSummary(files));

      mockAIService.setMockSuggestions([
        { name: "a", message: "feat: a", files: ["src/a.ts"], reasoning: "A" },
        { name: "b", message: "feat: b", files: ["src/b.ts"], reasoning: "B" },
      ]);

      const groups = await groupingEngine.analyzeChanges(mockCancellationToken);

      assert.notStrictEqual(groups[0].id, groups[1].id);
      assert.ok(groups[0].id.startsWith("group-"));
      assert.ok(groups[1].id.startsWith("group-"));
    });

    test("should propagate AI service errors", async () => {
      const files = [createMockFileChange("src/test.ts")];
      mockGitService.setMockChanges(createMockChangesSummary(files));
      mockAIService.setShouldFail(true);

      try {
        await groupingEngine.analyzeChanges(mockCancellationToken);
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok((error as Error).message.includes("AI analysis failed"));
      }
    });

    test("should update groups property after analysis", async () => {
      const files = [createMockFileChange("src/test.ts")];
      mockGitService.setMockChanges(createMockChangesSummary(files));

      mockAIService.setMockSuggestions([
        {
          name: "test",
          message: "test: add tests",
          files: ["src/test.ts"],
          reasoning: "Test files",
        },
      ]);

      assert.strictEqual(groupingEngine.groups.length, 0);

      await groupingEngine.analyzeChanges(mockCancellationToken);

      assert.strictEqual(groupingEngine.groups.length, 1);
    });
  });

  suite("commitGroup", () => {
    test("should commit a specific group", async () => {
      const files = [createMockFileChange("src/test.ts")];
      mockGitService.setMockChanges(createMockChangesSummary(files));

      mockAIService.setMockSuggestions([
        {
          name: "test",
          message: "test: add tests",
          files: ["src/test.ts"],
          reasoning: "Test files",
        },
      ]);

      const groups = await groupingEngine.analyzeChanges(mockCancellationToken);
      const groupId = groups[0].id;

      await groupingEngine.commitGroup(groupId);

      const calls = mockGitService.getStageAndCommitCalls();
      assert.strictEqual(calls.length, 1);
      assert.deepStrictEqual(calls[0].paths, ["src/test.ts"]);
      assert.strictEqual(calls[0].message, "test: add tests");
    });

    test("should remove group after successful commit", async () => {
      const files = [createMockFileChange("src/test.ts")];
      mockGitService.setMockChanges(createMockChangesSummary(files));

      mockAIService.setMockSuggestions([
        {
          name: "test",
          message: "test: add tests",
          files: ["src/test.ts"],
          reasoning: "Test files",
        },
      ]);

      const groups = await groupingEngine.analyzeChanges(mockCancellationToken);
      const groupId = groups[0].id;

      assert.strictEqual(groupingEngine.groups.length, 1);

      await groupingEngine.commitGroup(groupId);

      assert.strictEqual(groupingEngine.groups.length, 0);
    });

    test("should throw error for non-existent group", async () => {
      try {
        await groupingEngine.commitGroup("non-existent-id");
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok((error as Error).message.includes("not found"));
      }
    });

    test("should set group status to error on commit failure", async () => {
      const files = [createMockFileChange("src/test.ts")];
      mockGitService.setMockChanges(createMockChangesSummary(files));

      mockAIService.setMockSuggestions([
        {
          name: "test",
          message: "test: add tests",
          files: ["src/test.ts"],
          reasoning: "Test files",
        },
      ]);

      await groupingEngine.analyzeChanges(mockCancellationToken);
      const groupId = groupingEngine.groups[0].id;

      mockGitService.setShouldFailCommit(true);

      try {
        await groupingEngine.commitGroup(groupId);
        assert.fail("Should have thrown an error");
      } catch {
        assert.strictEqual(groupingEngine.groups[0].status, "error");
      }
    });
  });

  suite("commitAllGroups", () => {
    test("should commit all groups", async () => {
      const files = [
        createMockFileChange("src/a.ts"),
        createMockFileChange("src/b.ts"),
      ];
      mockGitService.setMockChanges(createMockChangesSummary(files));

      mockAIService.setMockSuggestions([
        { name: "a", message: "feat: a", files: ["src/a.ts"], reasoning: "A" },
        { name: "b", message: "feat: b", files: ["src/b.ts"], reasoning: "B" },
      ]);

      await groupingEngine.analyzeChanges(mockCancellationToken);

      const result = await groupingEngine.commitAllGroups();

      assert.strictEqual(result.success, 2);
      assert.strictEqual(result.failed, 0);
      assert.strictEqual(result.cancelled, 0);
      assert.strictEqual(groupingEngine.groups.length, 0);
    });

    test("should return correct count on partial failure", async () => {
      const files = [
        createMockFileChange("src/a.ts"),
        createMockFileChange("src/b.ts"),
      ];
      mockGitService.setMockChanges(createMockChangesSummary(files));

      mockAIService.setMockSuggestions([
        { name: "a", message: "feat: a", files: ["src/a.ts"], reasoning: "A" },
        { name: "b", message: "feat: b", files: ["src/b.ts"], reasoning: "B" },
      ]);

      await groupingEngine.analyzeChanges(mockCancellationToken);

      // Make commits fail after first one
      let commitCount = 0;
      mockGitService.stageAndCommit = async () => {
        commitCount++;
        if (commitCount > 1) {
          throw new Error("Commit failed");
        }
        return "hash";
      };

      const result = await groupingEngine.commitAllGroups();

      assert.strictEqual(result.success, 1);
      assert.strictEqual(result.failed, 1);
    });

    test("should return zero counts when no groups", async () => {
      const result = await groupingEngine.commitAllGroups();

      assert.strictEqual(result.success, 0);
      assert.strictEqual(result.failed, 0);
      assert.strictEqual(result.cancelled, 0);
    });

    test("should only commit specified groupIds when provided", async () => {
      const files = [
        createMockFileChange("src/a.ts"),
        createMockFileChange("src/b.ts"),
        createMockFileChange("src/c.ts"),
      ];
      mockGitService.setMockChanges(createMockChangesSummary(files));

      mockAIService.setMockSuggestions([
        { name: "a", message: "feat: a", files: ["src/a.ts"], reasoning: "A" },
        { name: "b", message: "feat: b", files: ["src/b.ts"], reasoning: "B" },
        { name: "c", message: "feat: c", files: ["src/c.ts"], reasoning: "C" },
      ]);

      await groupingEngine.analyzeChanges(mockCancellationToken);

      const groupBId = groupingEngine.groups[1].id;

      const result = await groupingEngine.commitAllGroups({
        groupIds: [groupBId],
      });

      assert.strictEqual(result.success, 1);
      assert.strictEqual(result.failed, 0);
      assert.strictEqual(result.cancelled, 0);
      // groups a and c should remain
      assert.strictEqual(groupingEngine.groups.length, 2);
      assert.ok(!groupingEngine.groups.some((g) => g.id === groupBId));
    });

    test("should call onProgress before each commit", async () => {
      const files = [
        createMockFileChange("src/a.ts"),
        createMockFileChange("src/b.ts"),
      ];
      mockGitService.setMockChanges(createMockChangesSummary(files));

      mockAIService.setMockSuggestions([
        { name: "a", message: "feat: a", files: ["src/a.ts"], reasoning: "A" },
        { name: "b", message: "feat: b", files: ["src/b.ts"], reasoning: "B" },
      ]);

      await groupingEngine.analyzeChanges(mockCancellationToken);

      const progressCalls: Array<{
        committed: number;
        total: number;
        message: string;
      }> = [];

      await groupingEngine.commitAllGroups({
        onProgress: (committed, total, group) => {
          progressCalls.push({ committed, total, message: group.message });
        },
      });

      assert.strictEqual(progressCalls.length, 2);
      assert.strictEqual(progressCalls[0].committed, 0);
      assert.strictEqual(progressCalls[0].total, 2);
      assert.strictEqual(progressCalls[1].committed, 1);
      assert.strictEqual(progressCalls[1].total, 2);
    });
  });

  suite("moveFileToGroup", () => {
    test("should move file between groups", async () => {
      const files = [
        createMockFileChange("src/a.ts"),
        createMockFileChange("src/b.ts"),
        createMockFileChange("src/c.ts"),
      ];
      mockGitService.setMockChanges(createMockChangesSummary(files));

      mockAIService.setMockSuggestions([
        {
          name: "group1",
          message: "feat: group1",
          files: ["src/a.ts", "src/b.ts"],
          reasoning: "Group 1",
        },
        {
          name: "group2",
          message: "feat: group2",
          files: ["src/c.ts"],
          reasoning: "Group 2",
        },
      ]);

      await groupingEngine.analyzeChanges(mockCancellationToken);

      const fromGroupId = groupingEngine.groups[0].id;
      const toGroupId = groupingEngine.groups[1].id;

      groupingEngine.moveFileToGroup("src/b.ts", fromGroupId, toGroupId);

      assert.strictEqual(groupingEngine.groups[0].files.length, 1);
      assert.strictEqual(groupingEngine.groups[1].files.length, 2);
      assert.ok(
        groupingEngine.groups[1].files.some((f) => f.path === "src/b.ts"),
      );
    });

    test("should do nothing if file not found in source group", async () => {
      const files = [
        createMockFileChange("src/a.ts"),
        createMockFileChange("src/b.ts"),
      ];
      mockGitService.setMockChanges(createMockChangesSummary(files));

      mockAIService.setMockSuggestions([
        {
          name: "group1",
          message: "feat: group1",
          files: ["src/a.ts"],
          reasoning: "Group 1",
        },
        {
          name: "group2",
          message: "feat: group2",
          files: ["src/b.ts"],
          reasoning: "Group 2",
        },
      ]);

      await groupingEngine.analyzeChanges(mockCancellationToken);

      const fromGroupId = groupingEngine.groups[0].id;
      const toGroupId = groupingEngine.groups[1].id;

      groupingEngine.moveFileToGroup(
        "src/nonexistent.ts",
        fromGroupId,
        toGroupId,
      );

      assert.strictEqual(groupingEngine.groups[0].files.length, 1);
      assert.strictEqual(groupingEngine.groups[1].files.length, 1);
    });

    test("should do nothing if groups not found", async () => {
      groupingEngine.moveFileToGroup("src/a.ts", "invalid1", "invalid2");
      // Should not throw, just silently fail
      assert.strictEqual(groupingEngine.groups.length, 0);
    });

    test("should remove empty source group after moving last file", async () => {
      const files = [
        createMockFileChange("src/a.ts"),
        createMockFileChange("src/b.ts"),
      ];
      mockGitService.setMockChanges(createMockChangesSummary(files));

      mockAIService.setMockSuggestions([
        {
          name: "group1",
          message: "feat: group1",
          files: ["src/a.ts"],
          reasoning: "Group 1",
        },
        {
          name: "group2",
          message: "feat: group2",
          files: ["src/b.ts"],
          reasoning: "Group 2",
        },
      ]);

      await groupingEngine.analyzeChanges(mockCancellationToken);

      assert.strictEqual(groupingEngine.groups.length, 2);

      const fromGroupId = groupingEngine.groups[0].id;
      const toGroupId = groupingEngine.groups[1].id;

      // Move the only file from group1 to group2
      groupingEngine.moveFileToGroup("src/a.ts", fromGroupId, toGroupId);

      // group1 should be removed since it's now empty
      assert.strictEqual(groupingEngine.groups.length, 1);
      assert.strictEqual(groupingEngine.groups[0].id, toGroupId);
      assert.strictEqual(groupingEngine.groups[0].files.length, 2);
    });
  });

  suite("updateGroupMessage", () => {
    test("should update group message", async () => {
      const files = [createMockFileChange("src/test.ts")];
      mockGitService.setMockChanges(createMockChangesSummary(files));

      mockAIService.setMockSuggestions([
        {
          name: "test",
          message: "test: original message",
          files: ["src/test.ts"],
          reasoning: "Test files",
        },
      ]);

      await groupingEngine.analyzeChanges(mockCancellationToken);
      const groupId = groupingEngine.groups[0].id;

      groupingEngine.updateGroupMessage(groupId, "test: updated message");

      assert.strictEqual(
        groupingEngine.groups[0].message,
        "test: updated message",
      );
    });

    test("should do nothing for non-existent group", async () => {
      groupingEngine.updateGroupMessage("non-existent", "new message");
      // Should not throw
      assert.strictEqual(groupingEngine.groups.length, 0);
    });
  });

  suite("clearGroups", () => {
    test("should clear all groups", async () => {
      const files = [createMockFileChange("src/test.ts")];
      mockGitService.setMockChanges(createMockChangesSummary(files));

      mockAIService.setMockSuggestions([
        {
          name: "test",
          message: "test: add tests",
          files: ["src/test.ts"],
          reasoning: "Test files",
        },
      ]);

      await groupingEngine.analyzeChanges(mockCancellationToken);
      assert.strictEqual(groupingEngine.groups.length, 1);

      groupingEngine.clearGroups();
      assert.strictEqual(groupingEngine.groups.length, 0);
    });
  });

  suite("onGroupsChanged event", () => {
    test("should fire event when groups are analyzed", async () => {
      const files = [createMockFileChange("src/test.ts")];
      mockGitService.setMockChanges(createMockChangesSummary(files));

      mockAIService.setMockSuggestions([
        {
          name: "test",
          message: "test: add tests",
          files: ["src/test.ts"],
          reasoning: "Test files",
        },
      ]);

      let eventFired = false;
      groupingEngine.onGroupsChanged(() => {
        eventFired = true;
      });

      await groupingEngine.analyzeChanges(mockCancellationToken);

      assert.strictEqual(eventFired, true);
    });

    test("should fire event when group is committed", async () => {
      const files = [createMockFileChange("src/test.ts")];
      mockGitService.setMockChanges(createMockChangesSummary(files));

      mockAIService.setMockSuggestions([
        {
          name: "test",
          message: "test: add tests",
          files: ["src/test.ts"],
          reasoning: "Test files",
        },
      ]);

      await groupingEngine.analyzeChanges(mockCancellationToken);

      let eventCount = 0;
      groupingEngine.onGroupsChanged(() => {
        eventCount++;
      });

      await groupingEngine.commitGroup(groupingEngine.groups[0].id);

      assert.ok(eventCount > 0);
    });

    test("should fire event when file is moved", async () => {
      const files = [
        createMockFileChange("src/a.ts"),
        createMockFileChange("src/b.ts"),
      ];
      mockGitService.setMockChanges(createMockChangesSummary(files));

      mockAIService.setMockSuggestions([
        {
          name: "group1",
          message: "feat: group1",
          files: ["src/a.ts"],
          reasoning: "Group 1",
        },
        {
          name: "group2",
          message: "feat: group2",
          files: ["src/b.ts"],
          reasoning: "Group 2",
        },
      ]);

      await groupingEngine.analyzeChanges(mockCancellationToken);

      let eventFired = false;
      groupingEngine.onGroupsChanged(() => {
        eventFired = true;
      });

      groupingEngine.moveFileToGroup(
        "src/a.ts",
        groupingEngine.groups[0].id,
        groupingEngine.groups[1].id,
      );

      assert.strictEqual(eventFired, true);
    });
  });

  suite("getGroupById", () => {
    test("should return group by ID", async () => {
      const files = [createMockFileChange("src/test.ts")];
      mockGitService.setMockChanges(createMockChangesSummary(files));

      mockAIService.setMockSuggestions([
        {
          name: "test",
          message: "test: add tests",
          files: ["src/test.ts"],
          reasoning: "Test files",
        },
      ]);

      await groupingEngine.analyzeChanges(mockCancellationToken);
      const groupId = groupingEngine.groups[0].id;

      const group = groupingEngine.getGroupById(groupId);

      assert.ok(group);
      assert.strictEqual(group?.id, groupId);
    });

    test("should return undefined for non-existent ID", () => {
      const group = groupingEngine.getGroupById("non-existent");
      assert.strictEqual(group, undefined);
    });
  });

  suite("removeFileFromGroup", () => {
    test("should remove a file from a group", async () => {
      const files = [
        createMockFileChange("src/auth.ts"),
        createMockFileChange("src/login.ts"),
        createMockFileChange("src/api.ts"),
      ];
      mockGitService.setMockChanges(createMockChangesSummary(files));

      mockAIService.setMockSuggestions([
        {
          name: "auth-feature",
          message: "feat(auth): add authentication",
          files: ["src/auth.ts", "src/login.ts"],
          reasoning: "Auth related files",
        },
        {
          name: "api-fix",
          message: "fix(api): resolve issue",
          files: ["src/api.ts"],
          reasoning: "API fix",
        },
      ]);

      await groupingEngine.analyzeChanges(mockCancellationToken);
      const group = groupingEngine.groups[0];
      const filePath = group.files[0].path;
      const result = groupingEngine.removeFileFromGroup(filePath, group.id);
      assert.strictEqual(result, true);
      assert.ok(!group.files.some((f) => f.path === filePath));
    });

    test("should remove empty group after last file is removed", async () => {
      const files = [
        createMockFileChange("src/auth.ts"),
        createMockFileChange("src/login.ts"),
        createMockFileChange("src/api.ts"),
      ];
      mockGitService.setMockChanges(createMockChangesSummary(files));

      mockAIService.setMockSuggestions([
        {
          name: "auth-feature",
          message: "feat(auth): add authentication",
          files: ["src/auth.ts", "src/login.ts"],
          reasoning: "Auth related files",
        },
        {
          name: "api-fix",
          message: "fix(api): resolve issue",
          files: ["src/api.ts"],
          reasoning: "API fix",
        },
      ]);

      await groupingEngine.analyzeChanges(mockCancellationToken);
      const group = groupingEngine.groups[0];
      const initialGroupCount = groupingEngine.groups.length;
      // Remove all files from the group
      const filePaths = group.files.map((f) => f.path);
      for (const fp of filePaths) {
        groupingEngine.removeFileFromGroup(fp, group.id);
      }
      assert.strictEqual(groupingEngine.groups.length, initialGroupCount - 1);
    });

    test("should return false for non-existent file", async () => {
      const files = [createMockFileChange("src/test.ts")];
      mockGitService.setMockChanges(createMockChangesSummary(files));

      mockAIService.setMockSuggestions([
        {
          name: "test",
          message: "test: add tests",
          files: ["src/test.ts"],
          reasoning: "Test files",
        },
      ]);

      await groupingEngine.analyzeChanges(mockCancellationToken);
      const group = groupingEngine.groups[0];
      const result = groupingEngine.removeFileFromGroup(
        "nonexistent.ts",
        group.id,
      );
      assert.strictEqual(result, false);
    });

    test("should return false for non-existent group", () => {
      const result = groupingEngine.removeFileFromGroup(
        "src/test.ts",
        "non-existent",
      );
      assert.strictEqual(result, false);
    });

    test("should fire onGroupsChanged event", async () => {
      const files = [
        createMockFileChange("src/a.ts"),
        createMockFileChange("src/b.ts"),
      ];
      mockGitService.setMockChanges(createMockChangesSummary(files));

      mockAIService.setMockSuggestions([
        {
          name: "group1",
          message: "feat: group1",
          files: ["src/a.ts", "src/b.ts"],
          reasoning: "Group 1",
        },
      ]);

      await groupingEngine.analyzeChanges(mockCancellationToken);

      let eventFired = false;
      groupingEngine.onGroupsChanged(() => {
        eventFired = true;
      });

      groupingEngine.removeFileFromGroup(
        "src/a.ts",
        groupingEngine.groups[0].id,
      );

      assert.strictEqual(eventFired, true);
    });
  });

  suite("createGroup", () => {
    test("should create a new empty group", () => {
      const group = groupingEngine.createGroup("test-group", "feat: test");
      assert.strictEqual(group.name, "test-group");
      assert.strictEqual(group.message, "feat: test");
      assert.strictEqual(group.files.length, 0);
      assert.strictEqual(group.status, "pending");
      assert.ok(groupingEngine.groups.includes(group));
    });

    test("should generate a unique ID", () => {
      const group1 = groupingEngine.createGroup("group-1", "feat: first");
      const group2 = groupingEngine.createGroup("group-2", "feat: second");
      assert.notStrictEqual(group1.id, group2.id);
      assert.ok(group1.id.startsWith("group-"));
      assert.ok(group2.id.startsWith("group-"));
    });

    test("should set reasoning to manually created", () => {
      const group = groupingEngine.createGroup("manual", "fix: manual");
      assert.strictEqual(group.reasoning, "Manually created group");
    });

    test("should fire onGroupsChanged event", () => {
      let eventFired = false;
      groupingEngine.onGroupsChanged(() => {
        eventFired = true;
      });

      groupingEngine.createGroup("test", "feat: test");

      assert.strictEqual(eventFired, true);
    });

    test("should add group to groups array", () => {
      assert.strictEqual(groupingEngine.groups.length, 0);
      groupingEngine.createGroup("test", "feat: test");
      assert.strictEqual(groupingEngine.groups.length, 1);
    });
  });

  suite("mergeGroups", () => {
    test("should merge source group into target group", async () => {
      const files = [
        createMockFileChange("src/a.ts"),
        createMockFileChange("src/b.ts"),
        createMockFileChange("src/c.ts"),
      ];
      mockGitService.setMockChanges(createMockChangesSummary(files));

      mockAIService.setMockSuggestions([
        {
          name: "group1",
          message: "feat: group1",
          files: ["src/a.ts", "src/b.ts"],
          reasoning: "Group 1",
        },
        {
          name: "group2",
          message: "feat: group2",
          files: ["src/c.ts"],
          reasoning: "Group 2",
        },
      ]);

      await groupingEngine.analyzeChanges(mockCancellationToken);

      const source = groupingEngine.groups[0];
      const target = groupingEngine.groups[1];
      const sourceId = source.id;
      const sourceFiles = [...source.files];
      const targetFilesBefore = target.files.length;

      const result = groupingEngine.mergeGroups(sourceId, target.id);

      assert.strictEqual(result, true);
      assert.ok(!groupingEngine.groups.some((g) => g.id === sourceId));
      assert.strictEqual(
        target.files.length,
        targetFilesBefore + sourceFiles.length,
      );
    });

    test("should avoid duplicate files when merging", async () => {
      const files = [
        createMockFileChange("src/a.ts"),
        createMockFileChange("src/b.ts"),
      ];
      mockGitService.setMockChanges(createMockChangesSummary(files));

      mockAIService.setMockSuggestions([
        {
          name: "group1",
          message: "feat: group1",
          files: ["src/a.ts"],
          reasoning: "Group 1",
        },
        {
          name: "group2",
          message: "feat: group2",
          files: ["src/a.ts", "src/b.ts"],
          reasoning: "Group 2",
        },
      ]);

      await groupingEngine.analyzeChanges(mockCancellationToken);

      const source = groupingEngine.groups[0];
      const target = groupingEngine.groups[1];

      // target already has src/a.ts, so merging source shouldn't duplicate
      const result = groupingEngine.mergeGroups(source.id, target.id);

      assert.strictEqual(result, true);
      const aPaths = target.files.filter((f) => f.path === "src/a.ts");
      assert.strictEqual(aPaths.length, 1);
    });

    test("should return false when merging group with itself", async () => {
      const files = [createMockFileChange("src/a.ts")];
      mockGitService.setMockChanges(createMockChangesSummary(files));

      mockAIService.setMockSuggestions([
        {
          name: "group1",
          message: "feat: group1",
          files: ["src/a.ts"],
          reasoning: "Group 1",
        },
      ]);

      await groupingEngine.analyzeChanges(mockCancellationToken);
      const group = groupingEngine.groups[0];
      const result = groupingEngine.mergeGroups(group.id, group.id);
      assert.strictEqual(result, false);
    });

    test("should return false for non-existent groups", () => {
      const result = groupingEngine.mergeGroups(
        "non-existent-1",
        "non-existent-2",
      );
      assert.strictEqual(result, false);
    });

    test("should fire onGroupsChanged event", async () => {
      const files = [
        createMockFileChange("src/a.ts"),
        createMockFileChange("src/b.ts"),
      ];
      mockGitService.setMockChanges(createMockChangesSummary(files));

      mockAIService.setMockSuggestions([
        {
          name: "group1",
          message: "feat: group1",
          files: ["src/a.ts"],
          reasoning: "Group 1",
        },
        {
          name: "group2",
          message: "feat: group2",
          files: ["src/b.ts"],
          reasoning: "Group 2",
        },
      ]);

      await groupingEngine.analyzeChanges(mockCancellationToken);

      let eventFired = false;
      groupingEngine.onGroupsChanged(() => {
        eventFired = true;
      });

      groupingEngine.mergeGroups(
        groupingEngine.groups[0].id,
        groupingEngine.groups[1].id,
      );

      assert.strictEqual(eventFired, true);
    });
  });

  suite("analyzeChanges with ignore filtering", () => {
    test("should not send ignored files to AI for analysis", async () => {
      const files = [
        createMockFileChange("src/app.ts"),
        createMockFileChange("dist/bundle.js"),
        createMockFileChange("src/utils.ts"),
      ];
      mockGitService.setMockChanges(createMockChangesSummary(files));

      mockAIService.setMockSuggestions([
        {
          name: "app-changes",
          message: "feat: update app",
          files: ["src/app.ts", "src/utils.ts"],
          reasoning: "Application files",
        },
      ]);

      const ignoreService = new IgnoreService(["dist/**"], []);
      const engineWithIgnore = new GroupingEngine(
        mockGitService as any,
        mockAIService as any,
        ignoreService,
      );

      await engineWithIgnore.analyzeChanges(mockCancellationToken);

      const receivedChanges = mockAIService.getLastReceivedChanges();
      assert.strictEqual(receivedChanges.length, 2);
      assert.ok(receivedChanges.some((c) => c.path === "src/app.ts"));
      assert.ok(receivedChanges.some((c) => c.path === "src/utils.ts"));
      assert.ok(!receivedChanges.some((c) => c.path === "dist/bundle.js"));
    });

    test("should throw 'No changes' when all files are ignored", async () => {
      const files = [
        createMockFileChange("dist/bundle.js"),
        createMockFileChange("dist/styles.css"),
      ];
      mockGitService.setMockChanges(createMockChangesSummary(files));

      const ignoreService = new IgnoreService(["dist/**"], []);
      const engineWithIgnore = new GroupingEngine(
        mockGitService as any,
        mockAIService as any,
        ignoreService,
      );

      try {
        await engineWithIgnore.analyzeChanges(mockCancellationToken);
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok((error as Error).message.includes("No changes"));
      }
    });

    test("should include files that don't match any ignore pattern", async () => {
      const files = [
        createMockFileChange("src/app.ts"),
        createMockFileChange("src/utils.ts"),
        createMockFileChange("package.json"),
      ];
      mockGitService.setMockChanges(createMockChangesSummary(files));

      mockAIService.setMockSuggestions([
        {
          name: "all-changes",
          message: "feat: update all",
          files: ["src/app.ts", "src/utils.ts", "package.json"],
          reasoning: "All files",
        },
      ]);

      const ignoreService = new IgnoreService(["*.log"], []);
      const engineWithIgnore = new GroupingEngine(
        mockGitService as any,
        mockAIService as any,
        ignoreService,
      );

      const groups = await engineWithIgnore.analyzeChanges(
        mockCancellationToken,
      );

      const receivedChanges = mockAIService.getLastReceivedChanges();
      assert.strictEqual(receivedChanges.length, 3);
      assert.strictEqual(groups[0].files.length, 3);
    });
  });

  suite("analyzeChanges catch-all group and path normalization", () => {
    test("should create catch-all group when AI omits a file", async () => {
      const files = [
        createMockFileChange("src/auth.ts"),
        createMockFileChange("src/login.ts"),
        createMockFileChange("src/forgotten.ts"),
      ];
      mockGitService.setMockChanges(createMockChangesSummary(files));

      // AI only groups 2 of 3 files
      mockAIService.setMockSuggestions([
        {
          name: "auth-feature",
          message: "feat(auth): add authentication",
          files: ["src/auth.ts", "src/login.ts"],
          reasoning: "Auth related files",
        },
      ]);

      const groups = await groupingEngine.analyzeChanges(mockCancellationToken);

      assert.strictEqual(groups.length, 2);
      const catchAll = groups.find((g) => g.name === "other-changes");
      assert.ok(catchAll, "Expected a catch-all group to be created");
      assert.strictEqual(catchAll!.files.length, 1);
      assert.strictEqual(catchAll!.files[0].path, "src/forgotten.ts");
      assert.strictEqual(catchAll!.message, "chore: other changes");
      assert.strictEqual(catchAll!.status, "pending");
    });

    test("should NOT create catch-all group when AI includes all files", async () => {
      const files = [
        createMockFileChange("src/auth.ts"),
        createMockFileChange("src/login.ts"),
      ];
      mockGitService.setMockChanges(createMockChangesSummary(files));

      mockAIService.setMockSuggestions([
        {
          name: "auth-feature",
          message: "feat(auth): add authentication",
          files: ["src/auth.ts", "src/login.ts"],
          reasoning: "Auth related files",
        },
      ]);

      const groups = await groupingEngine.analyzeChanges(mockCancellationToken);

      assert.strictEqual(groups.length, 1);
      assert.ok(!groups.some((g) => g.name === "other-changes"));
    });

    test("should match files with leading ./ prefix via path normalization", async () => {
      const files = [
        createMockFileChange("src/auth.ts"),
        createMockFileChange("src/login.ts"),
      ];
      mockGitService.setMockChanges(createMockChangesSummary(files));

      // AI returns paths with ./ prefix
      mockAIService.setMockSuggestions([
        {
          name: "auth-feature",
          message: "feat(auth): add authentication",
          files: ["./src/auth.ts", "./src/login.ts"],
          reasoning: "Auth related files",
        },
      ]);

      const groups = await groupingEngine.analyzeChanges(mockCancellationToken);

      assert.strictEqual(groups.length, 1);
      assert.strictEqual(groups[0].files.length, 2);
      // No catch-all group created since paths normalized
      assert.ok(!groups.some((g) => g.name === "other-changes"));
    });

    test("should match files with backslash separators via path normalization", async () => {
      const files = [createMockFileChange("src/services/auth.ts")];
      mockGitService.setMockChanges(createMockChangesSummary(files));

      // AI returns Windows-style path
      mockAIService.setMockSuggestions([
        {
          name: "auth",
          message: "feat: auth",
          files: ["src\\services\\auth.ts"],
          reasoning: "Auth",
        },
      ]);

      const groups = await groupingEngine.analyzeChanges(mockCancellationToken);

      assert.strictEqual(groups.length, 1);
      assert.strictEqual(groups[0].files.length, 1);
      assert.ok(!groups.some((g) => g.name === "other-changes"));
    });

    test("should match files with trailing whitespace via path normalization", async () => {
      const files = [createMockFileChange("src/app.ts")];
      mockGitService.setMockChanges(createMockChangesSummary(files));

      // AI returns path with trailing whitespace
      mockAIService.setMockSuggestions([
        {
          name: "app",
          message: "feat: app",
          files: ["src/app.ts  "],
          reasoning: "App",
        },
      ]);

      const groups = await groupingEngine.analyzeChanges(mockCancellationToken);

      assert.strictEqual(groups.length, 1);
      assert.strictEqual(groups[0].files.length, 1);
      assert.ok(!groups.some((g) => g.name === "other-changes"));
    });

    test("catch-all group should contain multiple missed files", async () => {
      const files = [
        createMockFileChange("src/a.ts"),
        createMockFileChange("src/b.ts"),
        createMockFileChange("src/c.ts"),
        createMockFileChange("src/d.ts"),
      ];
      mockGitService.setMockChanges(createMockChangesSummary(files));

      // AI only groups 2 of 4 files
      mockAIService.setMockSuggestions([
        {
          name: "group1",
          message: "feat: group1",
          files: ["src/a.ts", "src/b.ts"],
          reasoning: "Group 1",
        },
      ]);

      const groups = await groupingEngine.analyzeChanges(mockCancellationToken);

      assert.strictEqual(groups.length, 2);
      const catchAll = groups.find((g) => g.name === "other-changes");
      assert.ok(catchAll);
      assert.strictEqual(catchAll!.files.length, 2);
      const catchAllPaths = catchAll!.files.map((f) => f.path).sort();
      assert.deepStrictEqual(catchAllPaths, ["src/c.ts", "src/d.ts"]);
    });
  });

  suite("ungroupedFiles pool", () => {
    test("should start with an empty ungroupedFiles array", () => {
      assert.deepStrictEqual(groupingEngine.ungroupedFiles, []);
      assert.strictEqual(groupingEngine.ungroupedFiles.length, 0);
    });

    test("should add file to ungroupedFiles when removed from a group", async () => {
      const files = [
        createMockFileChange("src/a.ts"),
        createMockFileChange("src/b.ts"),
      ];
      mockGitService.setMockChanges(createMockChangesSummary(files));

      mockAIService.setMockSuggestions([
        {
          name: "group1",
          message: "feat: group1",
          files: ["src/a.ts", "src/b.ts"],
          reasoning: "Group 1",
        },
      ]);

      await groupingEngine.analyzeChanges(mockCancellationToken);

      groupingEngine.removeFileFromGroup(
        "src/a.ts",
        groupingEngine.groups[0].id,
      );

      assert.strictEqual(groupingEngine.ungroupedFiles.length, 1);
      assert.strictEqual(groupingEngine.ungroupedFiles[0].path, "src/a.ts");
    });

    test("should not add file to ungroupedFiles when file not found", async () => {
      const files = [createMockFileChange("src/a.ts")];
      mockGitService.setMockChanges(createMockChangesSummary(files));

      mockAIService.setMockSuggestions([
        {
          name: "group1",
          message: "feat: group1",
          files: ["src/a.ts"],
          reasoning: "Group 1",
        },
      ]);

      await groupingEngine.analyzeChanges(mockCancellationToken);

      groupingEngine.removeFileFromGroup(
        "src/nonexistent.ts",
        groupingEngine.groups[0].id,
      );

      assert.strictEqual(groupingEngine.ungroupedFiles.length, 0);
    });

    test("should not add file to ungroupedFiles when group not found", () => {
      groupingEngine.removeFileFromGroup("src/a.ts", "bad-group-id");

      assert.strictEqual(groupingEngine.ungroupedFiles.length, 0);
    });

    test("should accumulate multiple removed files", async () => {
      const files = [
        createMockFileChange("src/a.ts"),
        createMockFileChange("src/b.ts"),
        createMockFileChange("src/c.ts"),
      ];
      mockGitService.setMockChanges(createMockChangesSummary(files));

      mockAIService.setMockSuggestions([
        {
          name: "group1",
          message: "feat: group1",
          files: ["src/a.ts", "src/b.ts", "src/c.ts"],
          reasoning: "Group 1",
        },
      ]);

      await groupingEngine.analyzeChanges(mockCancellationToken);
      const groupId = groupingEngine.groups[0].id;

      groupingEngine.removeFileFromGroup("src/a.ts", groupId);
      groupingEngine.removeFileFromGroup("src/b.ts", groupId);

      assert.strictEqual(groupingEngine.ungroupedFiles.length, 2);
      assert.strictEqual(groupingEngine.ungroupedFiles[0].path, "src/a.ts");
      assert.strictEqual(groupingEngine.ungroupedFiles[1].path, "src/b.ts");
    });
  });

  suite("addFileToGroup", () => {
    test("should move file from ungroupedFiles to target group", async () => {
      const files = [
        createMockFileChange("src/a.ts"),
        createMockFileChange("src/b.ts"),
      ];
      mockGitService.setMockChanges(createMockChangesSummary(files));

      mockAIService.setMockSuggestions([
        {
          name: "group1",
          message: "feat: group1",
          files: ["src/a.ts"],
          reasoning: "Group 1",
        },
        {
          name: "group2",
          message: "feat: group2",
          files: ["src/b.ts"],
          reasoning: "Group 2",
        },
      ]);

      await groupingEngine.analyzeChanges(mockCancellationToken);
      const targetGroupId = groupingEngine.groups[1].id;

      // Remove file from group1 → goes to ungrouped
      groupingEngine.removeFileFromGroup(
        "src/a.ts",
        groupingEngine.groups[0].id,
      );
      assert.strictEqual(groupingEngine.ungroupedFiles.length, 1);

      // Add ungrouped file to group2
      const result = groupingEngine.addFileToGroup("src/a.ts", targetGroupId);

      assert.strictEqual(result, true);
      assert.strictEqual(groupingEngine.ungroupedFiles.length, 0);
      const targetGroup = groupingEngine.getGroupById(targetGroupId);
      assert.ok(targetGroup!.files.some((f) => f.path === "src/a.ts"));
    });

    test("should return false when file not in ungroupedFiles", () => {
      const group = groupingEngine.createGroup("test", "feat: test");
      const result = groupingEngine.addFileToGroup(
        "src/nonexistent.ts",
        group.id,
      );
      assert.strictEqual(result, false);
    });

    test("should return false when target group does not exist", async () => {
      const files = [
        createMockFileChange("src/a.ts"),
        createMockFileChange("src/b.ts"),
      ];
      mockGitService.setMockChanges(createMockChangesSummary(files));

      mockAIService.setMockSuggestions([
        {
          name: "group1",
          message: "feat: group1",
          files: ["src/a.ts", "src/b.ts"],
          reasoning: "Group 1",
        },
      ]);

      await groupingEngine.analyzeChanges(mockCancellationToken);
      const groupId = groupingEngine.groups[0].id;

      groupingEngine.removeFileFromGroup("src/a.ts", groupId);
      assert.strictEqual(groupingEngine.ungroupedFiles.length, 1);

      const result = groupingEngine.addFileToGroup("src/a.ts", "bad-group-id");
      assert.strictEqual(result, false);
      // File should still be in ungrouped
      assert.strictEqual(groupingEngine.ungroupedFiles.length, 1);
    });

    test("should fire onGroupsChanged on success", async () => {
      const files = [
        createMockFileChange("src/a.ts"),
        createMockFileChange("src/b.ts"),
      ];
      mockGitService.setMockChanges(createMockChangesSummary(files));

      mockAIService.setMockSuggestions([
        {
          name: "group1",
          message: "feat: group1",
          files: ["src/a.ts"],
          reasoning: "Group 1",
        },
        {
          name: "group2",
          message: "feat: group2",
          files: ["src/b.ts"],
          reasoning: "Group 2",
        },
      ]);

      await groupingEngine.analyzeChanges(mockCancellationToken);
      const targetGroupId = groupingEngine.groups[1].id;

      groupingEngine.removeFileFromGroup(
        "src/a.ts",
        groupingEngine.groups[0].id,
      );

      let eventFired = false;
      groupingEngine.onGroupsChanged(() => {
        eventFired = true;
      });

      groupingEngine.addFileToGroup("src/a.ts", targetGroupId);

      assert.strictEqual(eventFired, true);
    });

    test("should not fire onGroupsChanged on failure", () => {
      let eventFired = false;
      groupingEngine.onGroupsChanged(() => {
        eventFired = true;
      });

      groupingEngine.addFileToGroup("src/nonexistent.ts", "bad-group-id");

      assert.strictEqual(eventFired, false);
    });

    test("should handle adding the last ungrouped file", async () => {
      const files = [
        createMockFileChange("src/a.ts"),
        createMockFileChange("src/b.ts"),
      ];
      mockGitService.setMockChanges(createMockChangesSummary(files));

      mockAIService.setMockSuggestions([
        {
          name: "group1",
          message: "feat: group1",
          files: ["src/a.ts", "src/b.ts"],
          reasoning: "Group 1",
        },
      ]);

      await groupingEngine.analyzeChanges(mockCancellationToken);
      const groupId = groupingEngine.groups[0].id;

      groupingEngine.removeFileFromGroup("src/a.ts", groupId);
      assert.strictEqual(groupingEngine.ungroupedFiles.length, 1);

      groupingEngine.addFileToGroup("src/a.ts", groupId);

      assert.strictEqual(groupingEngine.ungroupedFiles.length, 0);
      assert.deepStrictEqual(groupingEngine.ungroupedFiles, []);
    });

    test("should preserve full FileChange data", async () => {
      const originalFile: FileChange = {
        path: "src/special.ts",
        status: "added",
        diff: "diff for src/special.ts",
        additions: 42,
        deletions: 7,
      };
      const files = [originalFile, createMockFileChange("src/other.ts")];
      mockGitService.setMockChanges(createMockChangesSummary(files));

      mockAIService.setMockSuggestions([
        {
          name: "group1",
          message: "feat: group1",
          files: ["src/special.ts"],
          reasoning: "Group 1",
        },
        {
          name: "group2",
          message: "feat: group2",
          files: ["src/other.ts"],
          reasoning: "Group 2",
        },
      ]);

      await groupingEngine.analyzeChanges(mockCancellationToken);
      const sourceGroupId = groupingEngine.groups[0].id;
      const targetGroupId = groupingEngine.groups[1].id;

      // Remove → ungrouped → add to group2
      groupingEngine.removeFileFromGroup("src/special.ts", sourceGroupId);
      groupingEngine.addFileToGroup("src/special.ts", targetGroupId);

      const targetGroup = groupingEngine.getGroupById(targetGroupId);
      const movedFile = targetGroup!.files.find(
        (f) => f.path === "src/special.ts",
      );

      assert.ok(movedFile);
      assert.strictEqual(movedFile!.status, "added");
      assert.strictEqual(movedFile!.additions, 42);
      assert.strictEqual(movedFile!.deletions, 7);
      assert.strictEqual(movedFile!.diff, "diff for src/special.ts");
    });
  });

  suite("ungroupedFiles lifecycle", () => {
    test("should clear ungroupedFiles on analyzeChanges", async () => {
      const files = [
        createMockFileChange("src/a.ts"),
        createMockFileChange("src/b.ts"),
      ];
      mockGitService.setMockChanges(createMockChangesSummary(files));

      mockAIService.setMockSuggestions([
        {
          name: "group1",
          message: "feat: group1",
          files: ["src/a.ts", "src/b.ts"],
          reasoning: "Group 1",
        },
      ]);

      await groupingEngine.analyzeChanges(mockCancellationToken);
      const groupId = groupingEngine.groups[0].id;

      // Remove a file → goes to ungrouped
      groupingEngine.removeFileFromGroup("src/a.ts", groupId);
      assert.strictEqual(groupingEngine.ungroupedFiles.length, 1);

      // Re-analyze → should clear ungrouped
      await groupingEngine.analyzeChanges(mockCancellationToken);

      assert.strictEqual(groupingEngine.ungroupedFiles.length, 0);
    });

    test("should clear ungroupedFiles on clearGroups", async () => {
      const files = [
        createMockFileChange("src/a.ts"),
        createMockFileChange("src/b.ts"),
      ];
      mockGitService.setMockChanges(createMockChangesSummary(files));

      mockAIService.setMockSuggestions([
        {
          name: "group1",
          message: "feat: group1",
          files: ["src/a.ts", "src/b.ts"],
          reasoning: "Group 1",
        },
      ]);

      await groupingEngine.analyzeChanges(mockCancellationToken);
      const groupId = groupingEngine.groups[0].id;

      // Remove a file → goes to ungrouped
      groupingEngine.removeFileFromGroup("src/a.ts", groupId);
      assert.strictEqual(groupingEngine.ungroupedFiles.length, 1);

      // Clear groups → should also clear ungrouped
      groupingEngine.clearGroups();

      assert.strictEqual(groupingEngine.ungroupedFiles.length, 0);
    });
  });
});
