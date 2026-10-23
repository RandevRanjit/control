// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFSP from "node:fs/promises";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { expandHomePathWith } from "../pathExpansion.ts";

// Folders a file a chat names never lives in, or that hold other copies of the same tree.
const SKIPPED_FOLDERS = new Set([
  "node_modules",
  ".git",
  ".repos",
  "dist",
  "build",
  "target",
  ".venv",
  "venv",
  "__pycache__",
  ".next",
  ".cache",
  ".turbo",
]);
// The control repo is about 43k files (150 ms); past this the walk gives up.
const MAX_WALKED_FILES = 200_000;

/**
 * The files under `root` whose path ends with `suffix` ("/"-separated, relative), best first:
 * a copy in a hidden folder (`.plans` scratch) or with casing that drifted from disk counts only
 * when nothing better matches. Linked worktrees (a folder whose `.git` is a file) are other copies
 * of the tree, so they are skipped; a full clone inside the folder is searched.
 */
async function filesEndingWith(root: string, suffix: string): Promise<ReadonlyArray<string>> {
  const name = suffix.slice(suffix.lastIndexOf("/") + 1).toLowerCase();
  const folded = suffix.toLowerCase();
  const found: Array<{ path: string; rank: number }> = [];
  let walked = 0;
  const walk = async (directory: string, relative: string, hidden: boolean) => {
    if (walked > MAX_WALKED_FILES) return;
    const children = await NodeFSP.readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const child of children) {
      walked += 1;
      const childRelative = relative === "" ? child.name : `${relative}/${child.name}`;
      if (child.isDirectory()) {
        if (SKIPPED_FOLDERS.has(child.name)) continue;
        const childPath = `${directory}/${child.name}`;
        const worktree = await NodeFSP.stat(`${childPath}/.git`).then(
          (stat) => stat.isFile(),
          () => false,
        );
        if (!worktree) await walk(childPath, childRelative, hidden || child.name.startsWith("."));
      } else if (child.name.toLowerCase() === name) {
        const ends = (path: string, target: string) =>
          path === target || path.endsWith(`/${target}`);
        const rank = hidden ? 2 : 0;
        if (ends(childRelative, suffix)) found.push({ path: childRelative, rank });
        else if (ends(childRelative.toLowerCase(), folded))
          found.push({ path: childRelative, rank: rank + 1 });
      }
    }
  };
  await walk(root, "", false);
  const best = Math.min(...found.map((match) => match.rank));
  return found.filter((match) => match.rank === best).map((match) => match.path);
}

/**
 * Finds what a path in a chat's message names, so its file chip opens what the agent meant.
 * Tried in order: the path as written; the same path in the chat's worktree or project folder
 * (a removed worktree, or a gitignored file only the project folder has); the one file under
 * the folder whose path ends with it, as `report/main.pdf` written after naming its folder, or
 * a bare `Sidebar.tsx`; the same path in one other project's folder, for an agent working in
 * another repo. Several matches find nothing rather than a guess. Used by `projects.resolveFile`
 * (ws.ts).
 */
export const resolveFileReference = Effect.fn("FileReferences.resolve")(function* (input: {
  /** Absolute, or relative to the chat's folder; no :line suffix. */
  readonly path: string;
  /** The chat's worktree, or null when it works in the project folder. */
  readonly worktreePath: string | null;
  readonly projectRoot: string;
  readonly otherProjectRoots: ReadonlyArray<string>;
}) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const exists = (candidate: string) =>
    fileSystem.exists(candidate).pipe(Effect.orElseSucceed(() => false));

  const chatFolder = input.worktreePath ?? input.projectRoot;
  const written = path.resolve(chatFolder, expandHomePathWith(input.path, path));
  if (yield* exists(written)) return written;

  const relative = [chatFolder, input.projectRoot]
    .map((folder) => path.relative(folder, written))
    .find(
      (candidate) => candidate !== "" && !candidate.startsWith("..") && !path.isAbsolute(candidate),
    );
  if (relative === undefined) return null;

  const searchRoot =
    input.worktreePath !== null && (yield* exists(input.worktreePath))
      ? input.worktreePath
      : input.projectRoot;
  for (const folder of [searchRoot, input.projectRoot]) {
    if (yield* exists(path.join(folder, relative))) return path.join(folder, relative);
  }

  const matches = yield* Effect.promise(() =>
    filesEndingWith(searchRoot, relative.split(path.sep).join("/")),
  );
  if (matches.length > 0) return matches.length === 1 ? path.join(searchRoot, matches[0]!) : null;

  const elsewhere: Array<string> = [];
  for (const root of input.otherProjectRoots) {
    if (yield* exists(path.join(root, relative))) elsewhere.push(path.join(root, relative));
  }
  return elsewhere.length === 1 ? elsewhere[0]! : null;
});
