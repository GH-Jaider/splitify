import * as assert from "assert";
import * as vscode from "vscode";
import { GroupingEngine } from "../../../services/grouping/groupingEngine";
import { CommitGroup } from "../../../services/grouping/types";
import { FileChange, ChangesSummary } from "../../../services/git/types";
import { GroupingSuggestion } from "../../../services/ai/types";

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

  setMockChanges(changes: ChangesSummary): void {
    this.mockChanges = changes;
  }

  setShouldFailCommit(shouldFail: boolean): void {
    this.shouldFailCommit = shouldFail;
  }

  async getAllChanges(): Promise<ChangesSummary> {
    return this.mockChanges;
  }

  async stageAndCommit(paths: string[], message: string): Promise<string> {
    if (this.shouldFailCommit) {
      throw new Error("Commit failed");
    }
    this.stageAndCommitCalls.push({ paths, message });
    return `mock-commit-hash-${Date.now()}`;
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

  setMockSuggestions(suggestions: GroupingSuggestion[]): void {
    this.mockSuggestions = suggestions;
  }

  setShouldFail(shouldFail: boolean): void {
    this.shouldFail = shouldFail;
  }

  async analyzeAndGroupChanges(
    _changes: Array<{ path: string; diff: string }>,
    _token: vscode.CancellationToken,
  ): Promise<GroupingSuggestion[]> {
    if (this.shouldFail) {
      throw new Error("AI analysis failed");
    }
    return this.mockSuggestions;
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
});
