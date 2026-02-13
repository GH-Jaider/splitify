import * as assert from "assert";
import { IgnoreService } from "../../../services/ignore/ignoreService";

suite("IgnoreService Test Suite", () => {
  suite("shouldIgnore — basic patterns", () => {
    test("should ignore exact filename match", () => {
      const service = new IgnoreService(["secret.env"], []);
      assert.strictEqual(service.shouldIgnore("secret.env"), true);
    });

    test("should not ignore non-matching filename", () => {
      const service = new IgnoreService(["secret.env"], []);
      assert.strictEqual(service.shouldIgnore("config.env"), false);
    });

    test("should ignore by extension glob", () => {
      const service = new IgnoreService(["*.log"], []);
      assert.strictEqual(service.shouldIgnore("debug.log"), true);
    });

    test("should ignore nested file by extension glob", () => {
      const service = new IgnoreService(["*.log"], []);
      assert.strictEqual(service.shouldIgnore("logs/debug.log"), true);
    });

    test("should ignore directory glob", () => {
      const service = new IgnoreService(["node_modules/**"], []);
      assert.strictEqual(
        service.shouldIgnore("node_modules/lib/index.js"),
        true,
      );
    });

    test("should not ignore partial directory name match", () => {
      const service = new IgnoreService(["node_modules/**"], []);
      assert.strictEqual(
        service.shouldIgnore("my_node_modules/index.js"),
        false,
      );
    });

    test("should ignore with double-star in middle", () => {
      const service = new IgnoreService(["src/**/test/**"], []);
      assert.strictEqual(
        service.shouldIgnore("src/services/test/helper.ts"),
        true,
      );
    });

    test("should handle deeply nested paths", () => {
      const service = new IgnoreService(["**/*.test.ts"], []);
      assert.strictEqual(
        service.shouldIgnore("src/services/deep/nested/thing.test.ts"),
        true,
      );
    });
  });

  suite("shouldIgnore — combining multiple sources", () => {
    test("should combine file patterns and config patterns", () => {
      const service = new IgnoreService(["*.log"], ["*.tmp"]);
      assert.strictEqual(service.shouldIgnore("debug.log"), true);
      assert.strictEqual(service.shouldIgnore("cache.tmp"), true);
      assert.strictEqual(service.shouldIgnore("index.ts"), false);
    });

    test("should work with empty file patterns", () => {
      const service = new IgnoreService([], ["*.log"]);
      assert.strictEqual(service.shouldIgnore("debug.log"), true);
      assert.strictEqual(service.shouldIgnore("index.ts"), false);
    });

    test("should work with empty config patterns", () => {
      const service = new IgnoreService(["*.log"], []);
      assert.strictEqual(service.shouldIgnore("debug.log"), true);
      assert.strictEqual(service.shouldIgnore("index.ts"), false);
    });

    test("should return false when no patterns configured", () => {
      const service = new IgnoreService([], []);
      assert.strictEqual(service.shouldIgnore("anything.ts"), false);
    });
  });

  suite("shouldIgnore — edge cases", () => {
    test("should handle empty string file path", () => {
      const service = new IgnoreService(["*.log"], []);
      assert.strictEqual(service.shouldIgnore(""), false);
    });

    test("should handle patterns with comments", () => {
      const service = new IgnoreService(["# comment", "*.log"], []);
      // Only *.log should be active; the comment is stripped
      assert.strictEqual(service.shouldIgnore("debug.log"), true);
      assert.strictEqual(service.shouldIgnore("# comment"), false);
    });

    test("should handle blank lines in patterns", () => {
      const service = new IgnoreService(["", "  ", "*.log"], []);
      assert.strictEqual(service.shouldIgnore("debug.log"), true);
      assert.strictEqual(service.shouldIgnore("index.ts"), false);
    });

    test("should handle negation patterns", () => {
      const service = new IgnoreService(["*.log", "!important.log"], []);
      assert.strictEqual(service.shouldIgnore("debug.log"), true);
      assert.strictEqual(service.shouldIgnore("important.log"), false);
    });

    test("should be case-sensitive", () => {
      const service = new IgnoreService(["*.LOG"], []);
      assert.strictEqual(service.shouldIgnore("debug.log"), false);
    });

    test("should handle Windows-style backslash paths", () => {
      const service = new IgnoreService(["dist/**"], []);
      assert.strictEqual(service.shouldIgnore("dist\\bundle.js"), true);
    });

    test("should handle patterns with trailing slashes", () => {
      const service = new IgnoreService(["logs/"], []);
      assert.strictEqual(service.shouldIgnore("logs/debug.log"), true);
    });
  });

  suite("pattern parsing", () => {
    test("should parse multi-line content correctly", () => {
      // Simulates reading a .splitifyignore file split by newlines
      const fileContent = "# Ignore logs\n*.log\n\n# Ignore dist\ndist/**\n";
      const filePatterns = fileContent.split("\n");
      const service = new IgnoreService(filePatterns, []);

      assert.strictEqual(service.shouldIgnore("debug.log"), true);
      assert.strictEqual(service.shouldIgnore("dist/bundle.js"), true);
      assert.strictEqual(service.shouldIgnore("src/index.ts"), false);
    });

    test("should return empty patterns for empty input", () => {
      const service = new IgnoreService([], []);
      assert.strictEqual(service.shouldIgnore("anything.ts"), false);
      assert.strictEqual(service.shouldIgnore("secret.env"), false);
    });
  });
});
