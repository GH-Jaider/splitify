import * as assert from "assert";
import { extractGroupId } from "../../commands/utils";

suite("extractGroupId", () => {
  test("returns the string when passed a plain string", () => {
    assert.strictEqual(extractGroupId("group-1"), "group-1");
  });

  test("returns the group id when passed a tree-item-shaped object", () => {
    assert.strictEqual(extractGroupId({ group: { id: "group-1" } }), "group-1");
  });

  test("returns undefined when passed undefined", () => {
    assert.strictEqual(extractGroupId(undefined), undefined);
  });

  test("returns undefined when passed an object without group.id", () => {
    assert.strictEqual(extractGroupId({ group: {} }), undefined);
  });

  test("returns undefined when passed an empty object", () => {
    assert.strictEqual(extractGroupId({} as never), undefined);
  });

  test("returns the string for an empty-string argument", () => {
    // An empty string is still a string — callers decide whether to treat "" as missing
    assert.strictEqual(extractGroupId(""), "");
  });
});
