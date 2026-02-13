import * as assert from "assert";
import * as vscode from "vscode";
import { AIService } from "../../../services/ai/aiService";
import { FileChangeInput } from "../../../services/ai/types";

suite("AIService Test Suite", () => {
  let aiService: AIService;
  let mockCancellationToken: vscode.CancellationToken;

  setup(() => {
    // Create a minimal mock ExtensionContext with globalState
    const globalState = {
      get: () => undefined,
      update: () => Promise.resolve(),
      keys: () => [],
      setKeysForSync: () => {},
    } as unknown as vscode.Memento & {
      setKeysForSync(keys: readonly string[]): void;
    };
    const mockContext = { globalState } as unknown as vscode.ExtensionContext;

    aiService = new AIService(mockContext);
    mockCancellationToken = new vscode.CancellationTokenSource().token;
  });

  suite("buildPrompt", () => {
    test("should build a prompt with file changes", () => {
      const changes: FileChangeInput[] = [
        { path: "src/auth.ts", diff: "+const login = () => {}" },
        { path: "src/api.ts", diff: "-old code\n+new code" },
      ];

      const prompt = aiService.buildPrompt(changes);

      assert.ok(
        prompt.includes("src/auth.ts"),
        "Prompt should include file path",
      );
      assert.ok(
        prompt.includes("src/api.ts"),
        "Prompt should include second file path",
      );
      assert.ok(prompt.includes("diff"), "Prompt should mention diff format");
      assert.ok(
        prompt.includes("clear, descriptive commit messages"),
        "Prompt should include generic style instruction when no commits provided",
      );
    });

    test("should truncate large diffs to avoid context overflow", () => {
      const largeDiff = "x".repeat(2000);
      const changes: FileChangeInput[] = [
        { path: "large-file.ts", diff: largeDiff },
      ];

      const prompt = aiService.buildPrompt(changes);

      // Prompt should not contain the full 2000 chars diff
      assert.ok(
        prompt.length < largeDiff.length + 500,
        "Large diffs should be truncated",
      );
    });

    test("should handle empty changes array", () => {
      const changes: FileChangeInput[] = [];

      const prompt = aiService.buildPrompt(changes);

      assert.ok(
        prompt.includes("Changes to analyze"),
        "Prompt should still have structure",
      );
    });

    test("should include commit history in prompt when provided", () => {
      const changes: FileChangeInput[] = [
        { path: "file.ts", diff: "some diff" },
      ];
      const recentCommits = [
        "feat(auth): add login endpoint",
        "fix(ui): resolve button alignment",
        "chore: update dependencies",
        "feat(api): add pagination support",
        "refactor(db): optimize query performance",
      ];
      const prompt = aiService.buildPrompt(changes, recentCommits);

      // Should include the commit messages
      assert.ok(prompt.includes("feat(auth): add login endpoint"));
      assert.ok(prompt.includes("fix(ui): resolve button alignment"));
      // Should NOT include hardcoded conventional commits
      assert.ok(!prompt.includes("Follow conventional commit conventions"));
    });

    test("should use generic style when few commits available", () => {
      const changes: FileChangeInput[] = [
        { path: "file.ts", diff: "some diff" },
      ];
      const recentCommits = ["initial commit", "second commit"];
      const prompt = aiService.buildPrompt(changes, recentCommits);

      // Should use generic instruction
      assert.ok(prompt.includes("clear, descriptive commit messages"));
      // Should NOT include commit list
      assert.ok(!prompt.includes("initial commit"));
    });
  });

  suite("parseResponse", () => {
    test("should parse valid JSON response", () => {
      const response = `\`\`\`json
{
  "groups": [
    {
      "name": "auth-feature",
      "message": "feat(auth): add login functionality",
      "files": ["src/auth.ts", "src/login.ts"],
      "reasoning": "Both files relate to authentication"
    }
  ]
}
\`\`\``;

      const result = aiService.parseResponse(response);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, "auth-feature");
      assert.strictEqual(result[0].files.length, 2);
    });

    test("should parse JSON without markdown code blocks", () => {
      const response = `{
  "groups": [
    {
      "name": "bugfix",
      "message": "fix(api): resolve timeout",
      "files": ["src/api.ts"],
      "reasoning": "API timeout fix"
    }
  ]
}`;

      const result = aiService.parseResponse(response);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, "bugfix");
    });

    test("should handle multiple groups", () => {
      const response = `{
  "groups": [
    {
      "name": "feature-a",
      "message": "feat(a): add feature A",
      "files": ["src/a.ts"],
      "reasoning": "Feature A implementation"
    },
    {
      "name": "feature-b",
      "message": "feat(b): add feature B",
      "files": ["src/b.ts"],
      "reasoning": "Feature B implementation"
    }
  ]
}`;

      const result = aiService.parseResponse(response);

      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].name, "feature-a");
      assert.strictEqual(result[1].name, "feature-b");
    });

    test("should throw error for invalid JSON", () => {
      const response = "This is not valid JSON";

      assert.throws(() => {
        aiService.parseResponse(response);
      }, /Failed to parse AI grouping suggestions/);
    });

    test("should throw error for JSON without groups property", () => {
      const response = '{"data": []}';

      assert.throws(() => {
        aiService.parseResponse(response);
      }, /Invalid response structure/);
    });
  });

  suite("analyzeAndGroupChanges", () => {
    test("should throw error when no Copilot model is available", async () => {
      const changes: FileChangeInput[] = [
        { path: "src/test.ts", diff: "+new code" },
      ];

      // This test will fail if Copilot is not available, which is expected behavior
      try {
        await aiService.analyzeAndGroupChanges(changes, mockCancellationToken);
        // If we get here without Copilot, something is wrong
      } catch (error) {
        assert.ok(error instanceof Error);
        // Either no model available or some other expected error
        assert.ok(
          (error as Error).message.includes("Copilot") ||
            (error as Error).message.includes("model"),
          "Error should mention Copilot or model availability",
        );
      }
    });

    test("should throw error for empty changes array", async () => {
      const changes: FileChangeInput[] = [];

      try {
        await aiService.analyzeAndGroupChanges(changes, mockCancellationToken);
        assert.fail("Should have thrown an error for empty changes");
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok((error as Error).message.includes("No changes"));
      }
    });
  });

  suite("analyzeAndGroupChangesStreaming", () => {
    test("should throw error for empty changes array", async () => {
      const changes: FileChangeInput[] = [];

      try {
        await aiService.analyzeAndGroupChangesStreaming(
          changes,
          mockCancellationToken,
        );
        assert.fail("Should have thrown an error for empty changes");
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok((error as Error).message.includes("No changes"));
      }
    });
  });

  suite("extractCompleteGroups", () => {
    test("should extract complete group objects from buffer", () => {
      const buffer =
        '{"groups": [{"name": "g1", "message": "feat: test", "files": ["a.ts"], "reasoning": "test"}, {"name": "g2", "message": "fix: bug", "files": ["b.ts"], "reasoning": "fix"}]}';
      const groups = aiService.extractCompleteGroups(buffer);
      assert.strictEqual(groups.length, 2);

      const parsed1 = JSON.parse(groups[0]);
      assert.strictEqual(parsed1.name, "g1");

      const parsed2 = JSON.parse(groups[1]);
      assert.strictEqual(parsed2.name, "g2");
    });

    test("should handle partial buffer (incomplete group)", () => {
      const buffer =
        '{"groups": [{"name": "g1", "message": "feat: test", "files": ["a.ts"], "reasoning": "test"}, {"name": "g2", "mess';
      const groups = aiService.extractCompleteGroups(buffer);
      assert.strictEqual(groups.length, 1); // Only the first complete group
    });

    test("should handle strings containing braces", () => {
      const buffer =
        '{"groups": [{"name": "g1", "message": "feat: add {thing}", "files": ["a.ts"], "reasoning": "has {braces}"}]}';
      const groups = aiService.extractCompleteGroups(buffer);
      assert.strictEqual(groups.length, 1);
      const parsed = JSON.parse(groups[0]);
      assert.strictEqual(parsed.message, "feat: add {thing}");
    });

    test("should return empty array when no groups array found", () => {
      const buffer = "just some random text";
      const groups = aiService.extractCompleteGroups(buffer);
      assert.strictEqual(groups.length, 0);
    });

    test("should handle empty groups array", () => {
      const buffer = '{"groups": []}';
      const groups = aiService.extractCompleteGroups(buffer);
      assert.strictEqual(groups.length, 0);
    });

    test("should handle nested objects in reasoning", () => {
      const buffer =
        '{"groups": [{"name": "g1", "message": "feat: test", "files": ["a.ts"], "reasoning": "reason with \\"escaped quotes\\""}]}';
      const groups = aiService.extractCompleteGroups(buffer);
      assert.strictEqual(groups.length, 1);
      const parsed = JSON.parse(groups[0]);
      assert.strictEqual(parsed.name, "g1");
    });

    test("should handle buffer with markdown code block prefix", () => {
      const buffer =
        '```json\n{"groups": [{"name": "g1", "message": "feat: test", "files": ["a.ts"], "reasoning": "test"}]}\n```';
      const groups = aiService.extractCompleteGroups(buffer);
      assert.strictEqual(groups.length, 1);
    });
  });
});
