import type { VcsStatusResult } from "@control/contracts";
import type { GitStatusEntry } from "@pierre/trees";

const TREE_STATUS = {
  A: "added",
  M: "modified",
  D: "deleted",
  R: "renamed",
} as const;

/**
 * The folder tree's Git marks (design §5.4): the working tree's changed files, moved from the
 * repository's paths onto the tree's, which start at `prefix`. Files outside the folder drop.
 */
export function fileTreeGitStatus(
  workingTree: VcsStatusResult["workingTree"],
): ReadonlyArray<GitStatusEntry> {
  const prefix = workingTree.prefix ?? "";
  return workingTree.files
    .filter((file) => file.path.startsWith(prefix) && file.path.length > prefix.length)
    .map((file) => ({
      path: file.path.slice(prefix.length),
      status: TREE_STATUS[file.status ?? "M"],
    }));
}
