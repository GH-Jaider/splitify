/**
 * Extract a group ID from a command argument.
 *
 * Commands invoked from tree-view inline buttons receive the tree item object
 * (which has a `group` property with an `id`), while the command palette or
 * programmatic callers may pass a plain string or nothing at all.
 */
export function extractGroupId(
  arg?: string | { group?: { id?: string } },
): string | undefined {
  if (typeof arg === "string") {
    return arg;
  }
  if (arg && typeof arg === "object" && arg.group?.id) {
    return arg.group.id;
  }
  return undefined;
}
