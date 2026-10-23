import * as NodeServices from "@effect/platform-node/NodeServices";
import { it, describe, expect } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { resolveFileReference } from "./FileReferences.ts";

/** A project folder with the given files, as an absolute root. */
const project = Effect.fn(function* (files: ReadonlyArray<string>) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fileSystem.makeTempDirectoryScoped({ prefix: "control-file-refs-" });
  for (const file of files) {
    yield* fileSystem.makeDirectory(path.dirname(path.join(root, file)), { recursive: true });
    yield* fileSystem.writeFileString(path.join(root, file), "x");
  }
  return yield* fileSystem.realPath(root);
});

describe("resolveFileReference", () => {
  it.layer(NodeServices.layer)((it) => {
    it.effect("keeps a path that exists as written", () =>
      Effect.gen(function* () {
        const root = yield* project(["docs/a.md"]);
        expect(
          yield* resolveFileReference({
            path: `${root}/docs/a.md`,
            worktreePath: null,
            projectRoot: root,
            otherProjectRoots: [],
          }),
        ).toBe(`${root}/docs/a.md`);
      }),
    );

    it.effect("finds a path written from a subfolder when one file ends with it", () =>
      Effect.gen(function* () {
        const root = yield* project(["Week 6/Lab 3_ CMOS/report/main.pdf", "other/notes.md"]);
        expect(
          yield* resolveFileReference({
            path: `${root}/report/main.pdf`,
            worktreePath: null,
            projectRoot: root,
            otherProjectRoots: [],
          }),
        ).toBe(`${root}/Week 6/Lab 3_ CMOS/report/main.pdf`);
      }),
    );

    it.effect("finds a bare file name the same way", () =>
      Effect.gen(function* () {
        const root = yield* project(["apps/web/src/components/Sidebar.tsx"]);
        expect(
          yield* resolveFileReference({
            path: `${root}/Sidebar.tsx`,
            worktreePath: null,
            projectRoot: root,
            otherProjectRoots: [],
          }),
        ).toBe(`${root}/apps/web/src/components/Sidebar.tsx`);
      }),
    );

    it.effect("skips copies in other worktrees", () =>
      Effect.gen(function* () {
        const root = yield* project([
          "apps/web/src/Sidebar.tsx",
          "worktrees/k5/.git",
          "worktrees/k5/apps/web/src/Sidebar.tsx",
        ]);
        expect(
          yield* resolveFileReference({
            path: `${root}/Sidebar.tsx`,
            worktreePath: null,
            projectRoot: root,
            otherProjectRoots: [],
          }),
        ).toBe(`${root}/apps/web/src/Sidebar.tsx`);
      }),
    );

    it.effect("searches a git clone inside the folder", () =>
      Effect.gen(function* () {
        const root = yield* project(["rng/.git/HEAD", "rng/simulation/notebook.ipynb"]);
        expect(
          yield* resolveFileReference({
            path: "simulation/notebook.ipynb",
            worktreePath: null,
            projectRoot: root,
            otherProjectRoots: [],
          }),
        ).toBe(`${root}/rng/simulation/notebook.ipynb`);
      }),
    );

    it.effect("prefers a file outside hidden folders to a scratch copy", () =>
      Effect.gen(function* () {
        const root = yield* project([
          ".plans/review/sections/05_latch.tex",
          "Week 6/report/sections/05_latch.tex",
        ]);
        expect(
          yield* resolveFileReference({
            path: "05_latch.tex",
            worktreePath: null,
            projectRoot: root,
            otherProjectRoots: [],
          }),
        ).toBe(`${root}/Week 6/report/sections/05_latch.tex`);
      }),
    );

    it.effect("resolves nothing when several files end with the path", () =>
      Effect.gen(function* () {
        const root = yield* project(["a/report/main.pdf", "b/report/main.pdf"]);
        expect(
          yield* resolveFileReference({
            path: `${root}/report/main.pdf`,
            worktreePath: null,
            projectRoot: root,
            otherProjectRoots: [],
          }),
        ).toBeNull();
      }),
    );

    it.effect("reads a removed worktree's paths from the project folder", () =>
      Effect.gen(function* () {
        // design/docs/HANDOFF.md also ends with the path, so only the project folder settles it.
        const root = yield* project(["docs/HANDOFF.md", "design/docs/HANDOFF.md"]);
        const removedWorktree = `${root}-worktrees/rules-review`;
        expect(
          yield* resolveFileReference({
            path: `${removedWorktree}/docs/HANDOFF.md`,
            worktreePath: removedWorktree,
            projectRoot: root,
            otherProjectRoots: [],
          }),
        ).toBe(`${root}/docs/HANDOFF.md`);
      }),
    );

    it.effect("reads the project folder when the chat's worktree lacks the file", () =>
      Effect.gen(function* () {
        // A gitignored .plans lives only in the project folder.
        const root = yield* project([".plans/notes.md", "design/.plans/notes.md"]);
        const worktree = yield* project(["README.md"]);
        expect(
          yield* resolveFileReference({
            path: ".plans/notes.md",
            worktreePath: worktree,
            projectRoot: root,
            otherProjectRoots: [],
          }),
        ).toBe(`${root}/.plans/notes.md`);
      }),
    );

    it.effect("finds a path written from another project's folder when one has it", () =>
      Effect.gen(function* () {
        const root = yield* project(["notes.md"]);
        const bench = yield* project(["content/homework/hw4.py"]);
        const armed = yield* project(["README.md"]);
        expect(
          yield* resolveFileReference({
            path: "content/homework/hw4.py",
            worktreePath: null,
            projectRoot: root,
            otherProjectRoots: [armed, bench],
          }),
        ).toBe(`${bench}/content/homework/hw4.py`);
        const copy = yield* project(["content/homework/hw4.py"]);
        expect(
          yield* resolveFileReference({
            path: "content/homework/hw4.py",
            worktreePath: null,
            projectRoot: root,
            otherProjectRoots: [bench, copy],
          }),
        ).toBeNull();
      }),
    );

    it.effect("resolves nothing outside the chat's folders", () =>
      Effect.gen(function* () {
        const root = yield* project(["notes.md"]);
        expect(
          yield* resolveFileReference({
            path: "/tmp/control-file-refs-gone/notes.md",
            worktreePath: null,
            projectRoot: root,
            otherProjectRoots: [],
          }),
        ).toBeNull();
      }),
    );
  });
});
