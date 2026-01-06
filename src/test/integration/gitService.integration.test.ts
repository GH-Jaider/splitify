import * as assert from "assert";
import * as path from "path";
import * as fs from "fs";
import { TestRepository } from "./helpers";

suite("GitService Integration Test Suite", () => {
  let testRepo: TestRepository;
  let testRepoPath: string;

  suiteSetup(async function () {
    this.timeout(10000);

    // Create test repository in a temp location
    testRepoPath = path.join(__dirname, "..", "..", "..", ".test-git-repo");
    testRepo = new TestRepository(testRepoPath);
    await testRepo.init();
  });

  suiteTeardown(async () => {
    if (testRepo) {
      await testRepo.cleanup();
    }
  });

  setup(async function () {
    this.timeout(5000);
    // Reset repository before each test
    await testRepo.init();
  });

  suite("Repository Operations", () => {
    test("should initialize a git repository", async () => {
      const gitDir = path.join(testRepoPath, ".git");
      assert.ok(fs.existsSync(gitDir), ".git directory should exist");
    });

    test("should create files in the repository", async () => {
      testRepo.createFile("test-file.ts", "console.log('hello');");

      const filePath = path.join(testRepoPath, "test-file.ts");
      assert.ok(fs.existsSync(filePath), "File should be created");

      const content = fs.readFileSync(filePath, "utf-8");
      assert.strictEqual(content, "console.log('hello');");
    });

    test("should track untracked files", async () => {
      testRepo.createFile("new-file.ts", "export const x = 1;");

      const status = await testRepo.getStatus();
      assert.ok(
        status.untracked.includes("new-file.ts"),
        "New file should be untracked",
      );
    });

    test("should stage files", async () => {
      testRepo.createFile("staged-file.ts", "export const y = 2;");
      await testRepo.stage("staged-file.ts");

      const status = await testRepo.getStatus();
      assert.ok(
        status.staged.includes("staged-file.ts"),
        "File should be staged",
      );
    });

    test("should detect modified files", async () => {
      // Create and commit a file first
      testRepo.createFile("modifiable.ts", "original content");
      await testRepo.stageAll();
      await testRepo.commit("Add modifiable file");

      // Modify the file
      testRepo.modifyFile("modifiable.ts", "modified content");

      const status = await testRepo.getStatus();
      assert.ok(
        status.unstaged.includes("modifiable.ts"),
        "Modified file should be unstaged",
      );
    });

    test("should create sample changes for grouping tests", async () => {
      await testRepo.createSampleChanges();

      const status = await testRepo.getStatus();

      // Should have auth files
      assert.ok(
        status.untracked.some((f) => f.includes("auth/login.ts")),
        "Should have login file",
      );
      assert.ok(
        status.untracked.some((f) => f.includes("auth/logout.ts")),
        "Should have logout file",
      );

      // Should have validation file
      assert.ok(
        status.untracked.some((f) => f.includes("validation.ts")),
        "Should have validation file",
      );

      // Should have modified README
      assert.ok(
        status.unstaged.includes("README.md"),
        "README should be modified",
      );

      // Should have config file
      assert.ok(
        status.untracked.some((f) => f.includes("config.json")),
        "Should have config file",
      );
    });
  });

  suite("Commit Operations", () => {
    test("should commit staged files", async () => {
      testRepo.createFile("commit-test.ts", "export const z = 3;");
      await testRepo.stageAll();
      await testRepo.commit("Test commit");

      const status = await testRepo.getStatus();
      assert.strictEqual(status.staged.length, 0, "No files should be staged");
      assert.ok(
        !status.untracked.includes("commit-test.ts"),
        "File should not be untracked",
      );
    });
  });
});
