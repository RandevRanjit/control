import { HostProcessPlatform } from "@control/shared/hostProcess";
import { assert, it, describe } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import { ReviewDiffPreviewInput, type ReviewDiffPreviewResult } from "@control/contracts";
import { makeGitVcsDriverCore, splitNullSeparatedGitStdoutPaths } from "./GitVcsDriverCore.ts";
import * as GitVcsDriver from "./GitVcsDriver.ts";
import {
  layerServerConfig,
  layerTest,
  makeNonRepositoryHandle,
  makeSuccessfulHandle,
  makeTmpDir,
  writeTextFile,
  makeReviewDiffFileContentsInput,
  git,
  initRepoWithCommit,
} from "./GitVcsDriverCore.testkit.ts";

it.layer(layerTest)("GitVcsDriver core integration", (it) => {
  describe("review diff previews", () => {
    it.effect("loads repository-relative files from a nested project directory", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        const { initialBranch } = yield* initRepoWithCommit(cwd);
        yield* git(cwd, ["checkout", "-b", "feature/nested"]);
        yield* writeTextFile(cwd, "nested/tracked.txt", "committed\n");
        yield* git(cwd, ["add", "."]);
        yield* git(cwd, ["commit", "-m", "nested file"]);
        yield* writeTextFile(cwd, "nested/tracked.txt", "changed\n");
        yield* writeTextFile(cwd, "untracked.txt", "new\n");
        const path = yield* Path.Path;
        const driver = yield* GitVcsDriver.GitVcsDriver;
        const nestedCwd = path.join(cwd, "nested");
        const preview = yield* driver.getReviewDiffPreview({
          cwd: nestedCwd,
          baseRef: initialBranch,
        });
        assert.equal(
          preview.sources.find((source) => source.kind === "working-tree")!.files!.length,
          2,
        );
        for (const source of preview.sources) {
          for (const file of source.files ?? []) {
            const scoped = yield* driver.getReviewDiffPreview({
              cwd: nestedCwd,
              baseRef: initialBranch,
              file: { path: file.path, previousPath: file.previousPath, sourceKind: source.kind },
            });
            const patch = scoped.sources.find((item) => item.kind === source.kind)!;
            assert.deepStrictEqual(patch.files, [file]);
            assert.include(patch.diff, `b/${file.path}`);
          }
        }
      }),
    );

    it.effect("reads complete tracked and untracked manifests beyond 1 MB", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        const { initialBranch } = yield* initRepoWithCommit(cwd);
        const mergeBase = yield* git(cwd, ["rev-parse", "HEAD"]);
        yield* writeTextFile(cwd, "untracked.txt", "untracked content\n");
        const paths = Array.from({ length: 5000 }, (_, index) => `${"a".repeat(220)}-${index}.txt`);
        const stats = paths.map((path) => `1\t0\t${path}\0`).join("");
        const untracked = [...paths, "untracked.txt"].join("\0") + "\0";
        assert.isAbove(stats.length, 1024 * 1024);
        assert.isAbove(untracked.length, 1024 * 1024);
        let readLargeUntracked = false;
        const delegate = yield* ChildProcessSpawner.ChildProcessSpawner;
        const spawner = ChildProcessSpawner.make((command) => {
          if (ChildProcess.isStandardCommand(command)) {
            if (command.args.includes("--numstat") && command.args.includes(mergeBase)) {
              return Effect.succeed(makeSuccessfulHandle(stats));
            }
            if (command.args.includes("ls-files") && command.args.includes("--others")) {
              return Effect.succeed(makeSuccessfulHandle(readLargeUntracked ? untracked : ""));
            }
          }
          return delegate.spawn(command);
        });
        const driver = yield* makeGitVcsDriverCore().pipe(
          Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
          Effect.provide(layerServerConfig),
        );
        const branch = yield* driver.getReviewDiffPreview({
          cwd,
          baseRef: initialBranch,
        });
        const files = branch.sources.find((source) => source.kind === "branch-range")!.files!;
        assert.equal(files.length, paths.length);
        assert.equal(files.at(-1)?.path, paths.at(-1));
        assert.equal(
          files.reduce((total, file) => total + file.additions, 0),
          paths.length,
        );
        readLargeUntracked = true;
        const dirty = yield* driver.getReviewDiffPreview({
          cwd,
          file: { path: "untracked.txt", previousPath: null, sourceKind: "working-tree" },
        });
        const source = dirty.sources.find((source) => source.kind === "working-tree")!;
        assert.deepStrictEqual(source.files, [
          { path: "untracked.txt", previousPath: null, additions: 1, deletions: 0 },
        ]);
        assert.include(source.diff, "+untracked content");
      }),
    );

    it.effect("propagates patch failures instead of reporting an empty complete diff", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        yield* initRepoWithCommit(cwd);
        yield* writeTextFile(cwd, "README.md", "changed\n");
        const delegate = yield* ChildProcessSpawner.ChildProcessSpawner;
        const spawner = ChildProcessSpawner.make((command) =>
          ChildProcess.isStandardCommand(command) && command.args.includes("--patch")
            ? Effect.succeed(makeNonRepositoryHandle())
            : delegate.spawn(command),
        );
        const driver = yield* makeGitVcsDriverCore().pipe(
          Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
          Effect.provide(layerServerConfig),
        );
        const result = yield* driver.getReviewDiffPreview({ cwd }).pipe(Effect.result);
        assert.isTrue(Result.isFailure(result));
        if (Result.isFailure(result)) {
          assert.equal(result.failure.operation, "GitVcsDriver.getReviewDiffPreview.patch");
        }
      }),
    );

    it.effect("drops an unterminated path from truncated NUL-separated git output", () =>
      Effect.sync(() => {
        const paths = splitNullSeparatedGitStdoutPaths({
          stdout: "complete.txt\0partial",
          stdoutTruncated: true,
        });

        assert.deepStrictEqual(paths, ["complete.txt"]);
      }),
    );

    it.effect("keeps the final path when NUL-separated git output is complete", () =>
      Effect.sync(() => {
        const paths = splitNullSeparatedGitStdoutPaths({
          stdout: "complete.txt\0final.txt",
          stdoutTruncated: false,
        });

        assert.deepStrictEqual(paths, ["complete.txt", "final.txt"]);
      }),
    );

    it.effect("honors whitespace filtering for worktree and branch previews", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        const { initialBranch } = yield* initRepoWithCommit(cwd);
        const driver = yield* GitVcsDriver.GitVcsDriver;
        yield* git(cwd, ["checkout", "-b", "feature/whitespace"]);
        yield* writeTextFile(cwd, "README.md", "#  test\n");
        yield* git(cwd, ["add", "README.md"]);
        yield* git(cwd, ["commit", "-m", "change whitespace"]);
        yield* writeTextFile(cwd, "README.md", "#   test\n");

        const included = yield* driver.getReviewDiffPreview({
          cwd,
          baseRef: initialBranch,
          ignoreWhitespace: false,
        });
        const ignored = yield* driver.getReviewDiffPreview({
          cwd,
          baseRef: initialBranch,
          ignoreWhitespace: true,
        });

        assert.isNotEmpty(included.sources.find((source) => source.kind === "working-tree")?.diff);
        assert.isNotEmpty(included.sources.find((source) => source.kind === "branch-range")?.diff);
        assert.strictEqual(
          ignored.sources.find((source) => source.kind === "working-tree")?.diff,
          "",
        );
        assert.deepStrictEqual(
          ignored.sources.find((source) => source.kind === "working-tree")?.files,
          [],
        );
        assert.deepStrictEqual(
          ignored.sources.find((source) => source.kind === "branch-range")?.files,
          [],
        );
        assert.strictEqual(
          ignored.sources.find((source) => source.kind === "branch-range")?.diff,
          "",
        );
      }),
    );

    it.effect("keeps a/ and b/ patch prefixes when the repository disables them", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        const { initialBranch } = yield* initRepoWithCommit(cwd);
        const driver = yield* GitVcsDriver.GitVcsDriver;
        yield* git(cwd, ["config", "diff.noprefix", "true"]);
        yield* git(cwd, ["config", "diff.mnemonicPrefix", "true"]);
        yield* git(cwd, ["checkout", "-b", "feature/noprefix"]);
        yield* writeTextFile(cwd, "README.md", "# committed change\n");
        yield* git(cwd, ["add", "README.md"]);
        yield* git(cwd, ["commit", "-m", "committed change"]);
        yield* writeTextFile(cwd, "README.md", "# dirty change\n");
        yield* writeTextFile(cwd, "untracked.txt", "untracked\n");

        const preview = yield* driver.getReviewDiffPreview({
          cwd,
          baseRef: initialBranch,
          ignoreWhitespace: false,
        });

        const workingTree = preview.sources.find((source) => source.kind === "working-tree")?.diff;
        const branchRange = preview.sources.find((source) => source.kind === "branch-range")?.diff;
        assert.include(workingTree, "diff --git a/README.md b/README.md");
        assert.include(workingTree, "+++ b/untracked.txt");
        assert.include(branchRange, "diff --git a/README.md b/README.md");
      }),
    );

    it.effect("keeps untracked filenames with pathspec magic in the review", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        yield* initRepoWithCommit(cwd);
        const driver = yield* GitVcsDriver.GitVcsDriver;
        yield* writeTextFile(cwd, ":(exclude)after.ts", "literal pathspec contents\n");
        yield* writeTextFile(cwd, "ordinary.ts", "ordinary contents\n");
        const indexBefore = yield* git(cwd, ["ls-files", "--stage"]);

        const preview = yield* driver.getReviewDiffPreview({ cwd, ignoreWhitespace: false });
        const diff = preview.sources.find((source) => source.kind === "working-tree")?.diff ?? "";

        assert.include(diff, "+literal pathspec contents");
        assert.include(diff, "+ordinary contents");
        const scoped = yield* driver.getReviewDiffPreview({
          cwd,
          file: {
            path: ":(exclude)after.ts",
            previousPath: null,
            sourceKind: "working-tree",
          },
        });
        const scopedSource = scoped.sources.find((source) => source.kind === "working-tree")!;
        assert.deepStrictEqual(scopedSource.files, [
          { path: ":(exclude)after.ts", previousPath: null, additions: 1, deletions: 0 },
        ]);
        assert.include(scopedSource.diff, "+literal pathspec contents");
        assert.notInclude(scopedSource.diff, "ordinary.ts");
        assert.strictEqual(yield* git(cwd, ["ls-files", "--stage"]), indexBefore);
      }),
    );

    it.effect("detects an unstaged rename with edits without mutating a split index", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        yield* initRepoWithCommit(cwd);
        const driver = yield* GitVcsDriver.GitVcsDriver;
        const fileSystem = yield* FileSystem.FileSystem;
        const pathService = yield* Path.Path;
        yield* writeTextFile(cwd, "before.ts", "one\ntwo\nthree\nfour\nfive\n");
        yield* git(cwd, ["add", "before.ts"]);
        yield* git(cwd, ["commit", "-m", "add source file"]);
        yield* git(cwd, ["config", "core.splitIndex", "true"]);
        yield* git(cwd, ["config", "splitIndex.sharedIndexExpire", "now"]);
        yield* git(cwd, ["update-index", "--split-index"]);
        const indexPath = yield* git(cwd, ["rev-parse", "--git-path", "index"]);
        const indexHashBefore = yield* git(cwd, ["hash-object", indexPath]);
        const gitDirValue = yield* git(cwd, ["rev-parse", "--git-dir"]);
        const gitDir = pathService.isAbsolute(gitDirValue)
          ? gitDirValue
          : pathService.resolve(cwd, gitDirValue);
        const sharedIndexesBefore = (yield* fileSystem.readDirectory(gitDir))
          .filter((entry) => entry.startsWith("sharedindex."))
          .sort();
        yield* fileSystem.rename(
          pathService.join(cwd, "before.ts"),
          pathService.join(cwd, "after.ts"),
        );
        yield* writeTextFile(cwd, "after.ts", "one\ntwo\nTHREE\nfour\nfive\n");

        const preview = yield* driver.getReviewDiffPreview({ cwd, ignoreWhitespace: false });
        const diff = preview.sources.find((source) => source.kind === "working-tree")?.diff ?? "";
        const indexHashAfter = yield* git(cwd, ["hash-object", indexPath]);
        const sharedIndexesAfter = (yield* fileSystem.readDirectory(gitDir))
          .filter((entry) => entry.startsWith("sharedindex."))
          .sort();

        const source = preview.sources.find((candidate) => candidate.kind === "working-tree")!;
        assert.deepStrictEqual(source.files, [
          { path: "after.ts", previousPath: "before.ts", additions: 1, deletions: 1 },
        ]);
        const scoped = yield* driver.getReviewDiffPreview({
          cwd,
          file: { path: "after.ts", previousPath: "before.ts", sourceKind: "working-tree" },
        });
        const scopedSource = scoped.sources.find((candidate) => candidate.kind === "working-tree")!;
        assert.deepStrictEqual(scopedSource.files, source.files);
        assert.equal(scopedSource.diff, diff);
        assert.include(diff, "rename from before.ts");
        assert.include(diff, "rename to after.ts");
        assert.include(diff, "-three");
        assert.include(diff, "+THREE");
        assert.strictEqual(diff.match(/^diff --git /gm)?.length, 1);
        assert.strictEqual(indexHashAfter, indexHashBefore);
        assert.deepStrictEqual(sharedIndexesAfter, sharedIndexesBefore);
      }),
    );

    it.effect("keeps tracked changes visible when untracked discovery fails", () =>
      Effect.gen(function* () {
        const delegate = yield* ChildProcessSpawner.ChildProcessSpawner;
        const failingLsFilesSpawner = ChildProcessSpawner.make((command) => {
          if (!ChildProcess.isStandardCommand(command)) {
            return Effect.die("expected a standard Git command");
          }
          return command.args[0] === "ls-files" && command.args[1] === "--others"
            ? Effect.succeed(makeNonRepositoryHandle())
            : delegate.spawn(command);
        });
        const driver = yield* makeGitVcsDriverCore().pipe(
          Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, failingLsFilesSpawner),
          Effect.provide(layerServerConfig),
        );
        const cwd = yield* makeTmpDir();
        yield* initRepoWithCommit(cwd).pipe(
          Effect.provideService(GitVcsDriver.GitVcsDriver, driver),
        );
        yield* writeTextFile(cwd, "README.md", "# tracked change\n");

        const preview = yield* driver.getReviewDiffPreview({ cwd, ignoreWhitespace: false });
        const diff = preview.sources.find((source) => source.kind === "working-tree")?.diff ?? "";

        assert.include(diff, "-# test");
        assert.include(diff, "+# tracked change");
      }),
    );

    it.effect("preserves a staged deletion when the removed path still exists", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        yield* initRepoWithCommit(cwd);
        const driver = yield* GitVcsDriver.GitVcsDriver;
        yield* writeTextFile(cwd, "removed.txt", "remove me\n");
        yield* git(cwd, ["add", "removed.txt"]);
        yield* git(cwd, ["commit", "-m", "add removable file"]);
        yield* git(cwd, ["rm", "--cached", "removed.txt"]);

        const preview = yield* driver.getReviewDiffPreview({ cwd, ignoreWhitespace: false });
        const diff = preview.sources.find((source) => source.kind === "working-tree")?.diff ?? "";

        assert.include(diff, "deleted file mode");
        assert.include(diff, "-remove me");
        assert.notInclude(diff, "new file mode");
      }),
    );

    it.effect("keeps untracked files visible before the first commit", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        const driver = yield* GitVcsDriver.GitVcsDriver;
        yield* driver.initRepo({ cwd });
        yield* writeTextFile(cwd, "untracked.txt", "visible before HEAD\n");

        const preview = yield* driver.getReviewDiffPreview({ cwd, ignoreWhitespace: false });
        const source = preview.sources.find((candidate) => candidate.kind === "working-tree");

        assert.include(source?.diff, "visible before HEAD");
        assert.equal(source?.truncated, false);
      }),
    );

    it.effect.each([false, true])(
      "keeps the preceding second cached in review previews (split: %s)",
      (splitIndex) =>
        Effect.gen(function* () {
          const cwd = yield* makeTmpDir();
          yield* initRepoWithCommit(cwd);
          const driver = yield* GitVcsDriver.GitVcsDriver;
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          yield* writeTextFile(cwd, ".gitattributes", "stable.txt filter=probe\n");
          yield* writeTextFile(cwd, "stable.txt", "unchanged\n");
          yield* writeTextFile(
            cwd,
            ".git/filter.cjs",
            'require("node:fs").appendFileSync(".git/filter-runs", "read\\n"); process.stdin.pipe(process.stdout);',
          );
          yield* git(cwd, ["config", "filter.probe.clean", "node .git/filter.cjs"]);
          yield* fs.utimes(path.join(cwd, "stable.txt"), 1_699_999_999.5, 1_699_999_999.5);
          yield* git(cwd, ["add", "."]);
          yield* git(cwd, ["commit", "-m", "cache stable file"]);
          if (splitIndex) yield* git(cwd, ["update-index", "--split-index"]);
          const indexPath = path.join(cwd, ".git", "index");
          yield* fs.utimes(indexPath, 1_700_000_000, 1_700_000_000);
          const originalIndex = yield* fs.readFile(indexPath);
          const originalMtime = (yield* fs.stat(indexPath)).mtime;
          yield* writeTextFile(cwd, ".git/filter-runs", "");
          yield* writeTextFile(cwd, "untracked.txt", "new\n");
          const preview = yield* driver.getReviewDiffPreview({ cwd });
          assert.deepStrictEqual(
            preview.sources.find((source) => source.kind === "working-tree")!.files,
            [{ path: "untracked.txt", previousPath: null, additions: 1, deletions: 0 }],
          );
          assert.strictEqual(yield* fs.readFileString(path.join(cwd, ".git/filter-runs")), "");
          assert.deepStrictEqual(yield* fs.readFile(indexPath), originalIndex);
          assert.deepStrictEqual((yield* fs.stat(indexPath)).mtime, originalMtime);
        }),
    );

    it.effect.each([
      [1_700_000_000, false],
      [1_700_000_000.9999, false],
      [1_700_000_000, true],
      [1_700_000_000.9999, true],
    ] as const)(
      "preserves same-size edits with a racy review index (%s, split: %s)",
      ([timestamp, splitIndex]) =>
        Effect.gen(function* () {
          const cwd = yield* makeTmpDir();
          yield* initRepoWithCommit(cwd);
          const driver = yield* GitVcsDriver.GitVcsDriver;
          const fileSystem = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const filePath = path.join(cwd, "tracked.txt");
          const indexPath = path.join(cwd, ".git", "index");
          // Reproduce a same-timestamp edit without relying on filesystem clock resolution.
          yield* git(cwd, ["config", "core.trustctime", "false"]);
          yield* writeTextFile(cwd, "tracked.txt", "before\n");
          yield* fileSystem.utimes(filePath, timestamp, timestamp);
          yield* git(cwd, ["add", "tracked.txt"]);
          yield* git(cwd, ["commit", "-m", "record racy file"]);
          if (splitIndex) yield* git(cwd, ["update-index", "--split-index"]);
          yield* fileSystem.utimes(indexPath, timestamp, timestamp);
          const originalIndex = yield* fileSystem.readFile(indexPath);
          const originalIndexMtime = (yield* fileSystem.stat(indexPath)).mtime;
          yield* writeTextFile(cwd, "tracked.txt", "after!\n");
          yield* fileSystem.utimes(filePath, timestamp, timestamp);
          yield* writeTextFile(cwd, "untracked.txt", "new\n");

          const preview = yield* driver.getReviewDiffPreview({ cwd });
          const dirty = preview.sources.find((source) => source.kind === "working-tree")!;
          assert.deepStrictEqual(dirty.files, [
            { path: "tracked.txt", previousPath: null, additions: 1, deletions: 1 },
            { path: "untracked.txt", previousPath: null, additions: 1, deletions: 0 },
          ]);
          assert.include(dirty.diff, "-before");
          assert.include(dirty.diff, "+after!");
          assert.deepStrictEqual(yield* fileSystem.readFile(indexPath), originalIndex);
          assert.deepStrictEqual((yield* fileSystem.stat(indexPath)).mtime, originalIndexMtime);
        }),
    );

    it.effect("keeps complete stats for files beyond the combined patch limit", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        const { initialBranch } = yield* initRepoWithCommit(cwd);
        const driver = yield* GitVcsDriver.GitVcsDriver;
        const largeContents = "a long line of changed content for the diff preview\n".repeat(4000);
        yield* git(cwd, ["checkout", "-b", "feature/large"]);
        yield* writeTextFile(cwd, "a-large.txt", largeContents);
        yield* writeTextFile(cwd, "z-last.txt", "last file\n");
        yield* git(cwd, ["add", "."]);
        yield* git(cwd, ["commit", "-m", "large change"]);
        yield* writeTextFile(cwd, "a-large.txt", largeContents.replaceAll("changed", "updated"));
        yield* writeTextFile(cwd, "z-last.txt", "last file updated\n");
        yield* writeTextFile(cwd, "untracked.txt", largeContents);

        const preview = yield* driver.getReviewDiffPreview({ cwd, baseRef: initialBranch });
        const branch = preview.sources.find((source) => source.kind === "branch-range")!;
        const dirty = preview.sources.find((source) => source.kind === "working-tree")!;
        assert.isTrue(branch.truncated);
        assert.isTrue(dirty.truncated);
        assert.notInclude(branch.diff, "z-last.txt");
        for (const source of [branch, dirty]) {
          for (const file of source.files ?? []) {
            const individual = yield* driver.getReviewDiffPreview({
              cwd,
              baseRef: initialBranch,
              file: { path: file.path, previousPath: file.previousPath, sourceKind: source.kind },
            });
            const patch = individual.sources.find((candidate) => candidate.kind === source.kind)!;
            assert.isFalse(patch.truncated);
            assert.deepStrictEqual(patch.files, [file]);
            assert.include(patch.diff, `b/${file.path}`);
            assert.isEmpty(
              individual.sources.find((candidate) => candidate.kind !== source.kind)!.diff,
            );
          }
        }

        assert.deepStrictEqual(branch.files, [
          { path: "a-large.txt", previousPath: null, additions: 4000, deletions: 0 },
          { path: "untracked.txt", previousPath: null, additions: 4000, deletions: 0 },
          { path: "z-last.txt", previousPath: null, additions: 1, deletions: 0 },
        ]);
        assert.deepStrictEqual(dirty.files, [
          { path: "a-large.txt", previousPath: null, additions: 4000, deletions: 4000 },
          { path: "untracked.txt", previousPath: null, additions: 4000, deletions: 0 },
          { path: "z-last.txt", previousPath: null, additions: 1, deletions: 1 },
        ]);
      }),
    );

    it.effect("preserves renames, unusual paths, modes, and binary statistics", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        const { initialBranch } = yield* initRepoWithCommit(cwd);
        const driver = yield* GitVcsDriver.GitVcsDriver;
        yield* writeTextFile(cwd, "mode-only.sh", "echo unchanged\n");
        yield* git(cwd, ["add", "mode-only.sh"]);
        yield* git(cwd, ["commit", "-m", "add executable candidate"]);
        yield* git(cwd, ["checkout", "-b", "feature/paths"]);
        yield* git(cwd, ["mv", "README.md", "renamed.md"]);
        yield* writeTextFile(cwd, "[literal].txt", "literal\n");
        yield* writeTextFile(cwd, " leading.txt", "whitespace path\n");
        yield* writeTextFile(cwd, "l.txt", "other\n");
        yield* writeTextFile(cwd, "binary.dat", "binary\0data");
        if ((yield* HostProcessPlatform) !== "win32") {
          yield* writeTextFile(cwd, "tab\tand\nnewline.txt", "unusual path\n");
        }
        yield* git(cwd, ["add", "."]);
        yield* git(cwd, ["update-index", "--chmod=+x", "mode-only.sh"]);
        yield* git(cwd, ["commit", "-m", "rename and add files"]);
        const preview = yield* driver.getReviewDiffPreview({
          cwd,
          baseRef: initialBranch,
        });
        const branch = preview.sources.find((source) => source.kind === "branch-range")!;
        for (const path of ["renamed.md", "[literal].txt", " leading.txt", "mode-only.sh"]) {
          const stat = branch.files!.find((file) => file.path === path)!;
          const request = yield* Schema.decodeEffect(ReviewDiffPreviewInput)({
            cwd,
            baseRef: initialBranch,
            file: { path, previousPath: stat.previousPath, sourceKind: "branch-range" },
          });
          const result = yield* driver.getReviewDiffPreview(request);
          const scoped = result.sources.find((source) => source.kind === "branch-range")!;
          assert.deepStrictEqual(scoped.files, [stat]);
          assert.notInclude(scoped.diff, "b/l.txt");
          if (path === "renamed.md") assert.include(scoped.diff, "rename from README.md");
          if (path === "mode-only.sh") {
            assert.include(scoped.diff, "old mode 100644");
            assert.include(scoped.diff, "new mode 100755");
          }
        }
        assert.include(branch.diff, "rename from README.md");
        assert.include(branch.diff, "rename to renamed.md");
        assert.deepInclude(branch.files ?? [], {
          path: "renamed.md",
          previousPath: "README.md",
          additions: 0,
          deletions: 0,
        });
        assert.deepInclude(branch.files ?? [], {
          path: "binary.dat",
          previousPath: null,
          additions: 0,
          deletions: 0,
        });
        if ((yield* HostProcessPlatform) !== "win32") {
          assert.deepInclude(branch.files ?? [], {
            path: "tab\tand\nnewline.txt",
            previousPath: null,
            additions: 1,
            deletions: 0,
          });
        }
      }),
    );

    it.effect("reports staged and untracked changes before the first commit", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        yield* git(cwd, ["init"]);
        yield* writeTextFile(cwd, "staged.txt", "staged\n");
        yield* git(cwd, ["add", "staged.txt"]);
        yield* writeTextFile(cwd, "untracked.txt", "untracked\n");
        const driver = yield* GitVcsDriver.GitVcsDriver;
        const preview = yield* driver.getReviewDiffPreview({ cwd });
        const dirty = preview.sources.find((source) => source.kind === "working-tree")!;
        assert.deepStrictEqual(dirty.files, [
          { path: "staged.txt", previousPath: null, additions: 1, deletions: 0 },
          { path: "untracked.txt", previousPath: null, additions: 1, deletions: 0 },
        ]);
        assert.include(dirty.diff, "b/staged.txt");
        assert.include(dirty.diff, "b/untracked.txt");
      }),
    );

    it.effect("loads full file contents for working-tree diff expansion", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        yield* initRepoWithCommit(cwd);
        const driver = yield* GitVcsDriver.GitVcsDriver;
        const pathService = yield* Path.Path;
        yield* writeTextFile(cwd, "nested/.keep", "");
        yield* writeTextFile(cwd, "README.md", "# changed\nunchanged context\n");

        const contents = yield* driver.getReviewDiffFileContents(
          makeReviewDiffFileContentsInput(pathService.join(cwd, "nested")),
        );

        assert.strictEqual(contents.oldContents, "# test\n");
        assert.strictEqual(contents.newContents, "# changed\nunchanged context\n");
      }),
    );

    it.effect("attributes working-tree filesystem failures to the failing operation", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        yield* initRepoWithCommit(cwd);
        const driver = yield* GitVcsDriver.GitVcsDriver;

        const error = yield* driver
          .getReviewDiffFileContents(
            makeReviewDiffFileContentsInput(cwd, {
              changeType: "new",
              oldPath: "missing.ts",
              newPath: "missing.ts",
            }),
          )
          .pipe(Effect.flip);

        assert.deepInclude(error, {
          _tag: "GitCommandError",
          operation: "GitVcsDriver.getReviewDiffFileContents.workingTree.fs.realPath",
          command: "fs.realPath",
          cwd,
          detail: "Could not resolve diff file 'missing.ts'.",
        });
      }),
    );

    it.effect("loads new and deleted files without reading their missing side", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        yield* initRepoWithCommit(cwd);
        const driver = yield* GitVcsDriver.GitVcsDriver;
        const fileSystem = yield* FileSystem.FileSystem;
        const pathService = yield* Path.Path;
        yield* writeTextFile(cwd, "added.ts", "export const added = true;\n");
        yield* fileSystem.remove(pathService.join(cwd, "README.md"));

        const [added, deleted] = yield* Effect.all([
          driver.getReviewDiffFileContents(
            makeReviewDiffFileContentsInput(cwd, {
              changeType: "new",
              oldPath: "added.ts",
              newPath: "added.ts",
            }),
          ),
          driver.getReviewDiffFileContents(
            makeReviewDiffFileContentsInput(cwd, { changeType: "deleted" }),
          ),
        ]);

        assert.deepStrictEqual(added, {
          oldContents: "",
          newContents: "export const added = true;\n",
        });
        assert.deepStrictEqual(deleted, {
          oldContents: "# test\n",
          newContents: "",
        });
      }),
    );

    it.effect("loads merge-base and disk contents for Changes expansion", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        const { initialBranch } = yield* initRepoWithCommit(cwd);
        const driver = yield* GitVcsDriver.GitVcsDriver;
        yield* git(cwd, ["checkout", "-b", "feature/context"]);
        yield* writeTextFile(cwd, "README.md", "# branch change\nunchanged context\n");
        yield* git(cwd, ["add", "README.md"]);
        yield* git(cwd, ["commit", "-m", "change readme"]);
        yield* writeTextFile(cwd, "README.md", "# dirty change\nunchanged context\n");

        const contents = yield* driver.getReviewDiffFileContents(
          makeReviewDiffFileContentsInput(cwd, {
            sourceKind: "branch-range",
            baseRef: initialBranch,
            headRef: "feature/context",
          }),
        );

        assert.strictEqual(contents.oldContents, "# test\n");
        assert.strictEqual(contents.newContents, "# dirty change\nunchanged context\n");
      }),
    );

    it.effect("Changes combines commits, uncommitted edits, and untracked files", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        const { initialBranch } = yield* initRepoWithCommit(cwd);
        const driver = yield* GitVcsDriver.GitVcsDriver;
        const sourceFiles = (
          preview: ReviewDiffPreviewResult,
          kind: "working-tree" | "branch-range",
        ) => preview.sources.find((source) => source.kind === kind)!.files;
        yield* git(cwd, ["checkout", "-b", "feature/combined"]);
        yield* writeTextFile(cwd, "README.md", "# test\ncommitted\n");
        yield* git(cwd, ["commit", "-am", "commit edit"]);

        // A fully committed branch has no uncommitted work, but Changes still shows it.
        const clean = yield* driver.getReviewDiffPreview({ cwd, baseRef: initialBranch });
        assert.deepStrictEqual(sourceFiles(clean, "working-tree"), []);
        assert.deepStrictEqual(sourceFiles(clean, "branch-range"), [
          { path: "README.md", previousPath: null, additions: 1, deletions: 0 },
        ]);

        yield* writeTextFile(cwd, "README.md", "# test\ncommitted\ndirty\n");
        yield* writeTextFile(cwd, "new.txt", "new\n");
        const dirty = yield* driver.getReviewDiffPreview({ cwd, baseRef: initialBranch });
        const changes = dirty.sources.find((source) => source.kind === "branch-range")!;
        assert.deepStrictEqual(changes.files, [
          { path: "README.md", previousPath: null, additions: 2, deletions: 0 },
          { path: "new.txt", previousPath: null, additions: 1, deletions: 0 },
        ]);
        assert.strictEqual(changes.diff.match(/^diff --git a\/README\.md /gm)?.length, 1);
        assert.include(changes.diff, "+dirty");
        assert.deepStrictEqual(sourceFiles(dirty, "working-tree"), [
          { path: "README.md", previousPath: null, additions: 1, deletions: 0 },
          { path: "new.txt", previousPath: null, additions: 1, deletions: 0 },
        ]);
      }),
    );

    it.effect("Changes on the default branch compares with its remote copy", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        const remote = yield* makeTmpDir();
        yield* initRepoWithCommit(cwd);
        const driver = yield* GitVcsDriver.GitVcsDriver;
        yield* git(cwd, ["branch", "-M", "main"]);
        yield* writeTextFile(cwd, "unpushed.txt", "unpushed\n");
        yield* git(cwd, ["add", "unpushed.txt"]);
        yield* git(cwd, ["commit", "-m", "unpushed"]);

        // Without a remote there is no base, so Changes equals Uncommitted.
        const local = yield* driver.getReviewDiffPreview({ cwd });
        const localChanges = local.sources.find((source) => source.kind === "branch-range")!;
        assert.isNull(localChanges.baseRef);
        assert.deepStrictEqual(localChanges.files, []);

        yield* git(remote, ["init", "--bare"]);
        yield* git(cwd, ["remote", "add", "origin", remote]);
        yield* git(cwd, ["push", "origin", "HEAD~1:refs/heads/main"]);
        yield* git(cwd, ["fetch", "origin"]);
        const preview = yield* driver.getReviewDiffPreview({ cwd });
        const changes = preview.sources.find((source) => source.kind === "branch-range")!;
        assert.strictEqual(changes.baseRef, "origin/main");
        assert.deepStrictEqual(changes.files, [
          { path: "unpushed.txt", previousPath: null, additions: 1, deletions: 0 },
        ]);
      }),
    );

    it.effect("Changes accepts an explicit base on a detached HEAD and rejects a bad one", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        const { initialBranch } = yield* initRepoWithCommit(cwd);
        const driver = yield* GitVcsDriver.GitVcsDriver;
        yield* git(cwd, ["checkout", "--detach"]);
        yield* writeTextFile(cwd, "detached.txt", "detached\n");
        yield* git(cwd, ["add", "detached.txt"]);
        yield* git(cwd, ["commit", "-m", "detached work"]);

        const explicit = yield* driver.getReviewDiffPreview({ cwd, baseRef: initialBranch });
        assert.deepStrictEqual(
          explicit.sources.find((source) => source.kind === "branch-range")!.files,
          [{ path: "detached.txt", previousPath: null, additions: 1, deletions: 0 }],
        );
        const implicit = yield* driver.getReviewDiffPreview({ cwd });
        assert.deepStrictEqual(
          implicit.sources.find((source) => source.kind === "branch-range")!.files,
          [],
        );
        const error = yield* driver
          .getReviewDiffPreview({ cwd, baseRef: "missing-base" })
          .pipe(Effect.flip);
        assert.strictEqual(error.operation, "GitVcsDriver.resolveReviewMergeBase");
      }),
    );

    it.effect("Changes compares with the empty tree before the first commit", () =>
      Effect.gen(function* () {
        const upstream = yield* makeTmpDir();
        yield* initRepoWithCommit(upstream);
        yield* git(upstream, ["branch", "-M", "main"]);
        const cwd = yield* makeTmpDir();
        const driver = yield* GitVcsDriver.GitVcsDriver;
        // An unborn main whose remote copy exists must not fail on merge-base.
        yield* git(cwd, ["init", "-b", "main"]);
        yield* git(cwd, ["remote", "add", "origin", upstream]);
        yield* git(cwd, ["fetch", "origin"]);
        yield* writeTextFile(cwd, "new.txt", "one\ntwo\n");

        const preview = yield* driver.getReviewDiffPreview({ cwd });
        const changes = preview.sources.find((source) => source.kind === "branch-range")!;
        assert.isNull(changes.baseRef);
        assert.deepStrictEqual(changes.files, [
          { path: "new.txt", previousPath: null, additions: 2, deletions: 0 },
        ]);
        const status = yield* driver.statusDetailsLocal(cwd, { includeBranchChanges: true });
        assert.deepStrictEqual(status.branchChanges, {
          baseRef: null,
          insertions: 2,
          deletions: 0,
        });
      }),
    );

    it.effect("skips Changes totals instead of indexing thousands of untracked files", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        yield* initRepoWithCommit(cwd);
        const driver = yield* GitVcsDriver.GitVcsDriver;
        yield* Effect.forEach(
          Array.from({ length: 5_001 }, (_, index) => `bulk/${index}.txt`),
          (file) => writeTextFile(cwd, file, "x\n"),
          { concurrency: 32, discard: true },
        );
        yield* writeTextFile(cwd, "README.md", "changed\n");

        const status = yield* driver.statusDetailsLocal(cwd, { includeBranchChanges: true });
        assert.isTrue(status.hasWorkingTreeChanges);
        assert.isUndefined(status.branchChanges);

        const preview = yield* driver.getReviewDiffPreview({ cwd });
        assert.isNotEmpty(preview.sources);
        assert.isTrue(preview.sources.every((source) => source.truncated));
      }),
    );

    it.effect("Changes does not show newer base commits as deletions", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        const { initialBranch } = yield* initRepoWithCommit(cwd);
        const driver = yield* GitVcsDriver.GitVcsDriver;
        yield* git(cwd, ["checkout", "-b", "feature/rebased"]);
        yield* writeTextFile(cwd, "feature.txt", "feature\n");
        yield* git(cwd, ["add", "feature.txt"]);
        yield* git(cwd, ["commit", "-m", "feature work"]);
        yield* git(cwd, ["checkout", initialBranch]);
        yield* writeTextFile(cwd, "upstream.txt", "upstream\n");
        yield* git(cwd, ["add", "upstream.txt"]);
        yield* git(cwd, ["commit", "-m", "base moves"]);
        yield* git(cwd, ["checkout", "feature/rebased"]);

        for (const rebase of [false, true]) {
          if (rebase) yield* git(cwd, ["rebase", initialBranch]);
          const preview = yield* driver.getReviewDiffPreview({ cwd, baseRef: initialBranch });
          assert.deepStrictEqual(
            preview.sources.find((source) => source.kind === "branch-range")!.files,
            [{ path: "feature.txt", previousPath: null, additions: 1, deletions: 0 }],
          );
        }
      }),
    );
  });

  describe("repository status", () => {
    it.effect("reads Changes totals with untracked files when requested", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        yield* initRepoWithCommit(cwd);
        const driver = yield* GitVcsDriver.GitVcsDriver;
        const pathService = yield* Path.Path;
        yield* git(cwd, ["branch", "-M", "main"]);
        yield* git(cwd, ["checkout", "-b", "feature/totals"]);
        yield* writeTextFile(cwd, "README.md", "# test\ncommitted\n");
        yield* git(cwd, ["commit", "-am", "commit edit"]);
        yield* writeTextFile(cwd, "nested/untracked.txt", "one\ntwo\n");

        const status = yield* driver.statusDetailsLocal(pathService.join(cwd, "nested"), {
          includeBranchChanges: true,
        });
        assert.deepStrictEqual(status.branchChanges, {
          baseRef: "main",
          insertions: 3,
          deletions: 0,
        });
        assert.isUndefined((yield* driver.statusDetailsLocal(cwd)).branchChanges);
      }),
    );

    it.effect("reports non-repository directories without failing", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        const driver = yield* GitVcsDriver.GitVcsDriver;

        const refs = yield* driver.listRefs({ cwd });
        assert.equal(refs.isRepo, false);
        assert.deepStrictEqual(refs.refs, []);
      }),
    );

    it.effect("reports refName and dirty state for a repository", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        const { initialBranch } = yield* initRepoWithCommit(cwd);
        yield* writeTextFile(cwd, "feature.ts", "export const value = 1;\n");

        const status = yield* (yield* GitVcsDriver.GitVcsDriver).statusDetails(cwd);

        assert.equal(status.isRepo, true);
        assert.equal(status.branch, initialBranch);
        assert.equal(status.hasWorkingTreeChanges, true);
        assert.include(
          status.workingTree.files.map((file) => file.path),
          "feature.ts",
        );
      }),
    );

    it.effect("reports changes to a file named HEAD", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        yield* initRepoWithCommit(cwd);
        yield* writeTextFile(cwd, "HEAD", "first line\n");
        yield* git(cwd, ["add", "HEAD"]);
        yield* git(cwd, ["commit", "-m", "add HEAD file"]);
        yield* writeTextFile(cwd, "HEAD", "first line\nsecond line\n");

        const status = yield* (yield* GitVcsDriver.GitVcsDriver).statusDetails(cwd);

        assert.equal(status.isRepo, true);
        assert.equal(status.hasWorkingTreeChanges, true);
        assert.deepInclude(status.workingTree.files, {
          path: "HEAD",
          insertions: 1,
          deletions: 0,
        });
      }),
    );

    it.effect("reports default-branch delta separately from upstream delta", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        const remote = yield* makeTmpDir("git-vcs-driver-remote-");
        const { initialBranch } = yield* initRepoWithCommit(cwd);
        yield* git(remote, ["init", "--bare"]);
        yield* git(cwd, ["remote", "add", "origin", remote]);
        yield* git(cwd, ["push", "-u", "origin", initialBranch]);
        yield* git(cwd, ["checkout", "-b", "feature/synced"]);
        yield* writeTextFile(cwd, "feature.txt", "feature\n");
        yield* git(cwd, ["add", "feature.txt"]);
        yield* git(cwd, ["commit", "-m", "feature commit"]);
        yield* git(cwd, ["push", "-u", "origin", "feature/synced"]);

        const status = yield* (yield* GitVcsDriver.GitVcsDriver).statusDetails(cwd);

        assert.equal(status.hasUpstream, true);
        assert.equal(status.aheadCount, 0);
        assert.equal(status.behindCount, 0);
        assert.equal(status.aheadOfDefaultCount, 1);
      }),
    );

    it.effect("can read local files without traversing revision history", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        const remote = yield* makeTmpDir("git-vcs-driver-remote-");
        const { initialBranch } = yield* initRepoWithCommit(cwd);
        yield* git(remote, ["init", "--bare"]);
        yield* git(cwd, ["remote", "add", "origin", remote]);
        yield* git(cwd, ["push", "-u", "origin", initialBranch]);
        yield* git(cwd, ["checkout", "-b", "feature/local-only"]);
        yield* writeTextFile(cwd, "feature.txt", "feature\n");
        yield* git(cwd, ["add", "feature.txt"]);
        yield* git(cwd, ["commit", "-m", "feature commit"]);
        yield* writeTextFile(cwd, "feature.txt", "feature\nlocal edit\n");
        yield* writeTextFile(cwd, "untracked.txt", "untracked\n");

        const delegate = yield* ChildProcessSpawner.ChildProcessSpawner;
        const commands: ReadonlyArray<string>[] = [];
        const spawner = ChildProcessSpawner.make((command) =>
          Effect.gen(function* () {
            if (!ChildProcess.isStandardCommand(command)) {
              return yield* Effect.die("expected a standard Git command");
            }
            commands.push(command.args);
            return yield* delegate.spawn(command);
          }),
        );
        const driver = yield* makeGitVcsDriverCore().pipe(
          Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
          Effect.provide(layerServerConfig),
        );

        for (const hasUpstream of [false, true]) {
          if (hasUpstream) {
            yield* git(cwd, ["push", "-u", "origin", "feature/local-only"]);
          }
          commands.length = 0;
          const local = yield* driver.statusDetailsLocal(cwd, { includeDivergence: false });
          assert.isFalse(commands.some((args) => args.includes("rev-list")));
          assert.isTrue(commands.some((args) => args.includes("--no-ahead-behind")));
          assert.equal(local.hasUpstream, hasUpstream);
          assert.isTrue(local.hasWorkingTreeChanges);
          assert.deepEqual(local.workingTree.files, [
            { path: "feature.txt", insertions: 1, deletions: 0 },
            { path: "untracked.txt", insertions: 0, deletions: 0 },
          ]);

          commands.length = 0;
          const full = yield* driver.statusDetailsLocal(cwd);
          assert.isTrue(commands.some((args) => args.includes("rev-list")));
          assert.equal(full.aheadCount, hasUpstream ? 0 : 1);
          assert.equal(full.aheadOfDefaultCount, 1);
          assert.deepEqual(local, {
            ...full,
            aheadCount: 0,
            behindCount: 0,
            aheadOfDefaultCount: 0,
          });
        }
      }),
    );

    it.effect("reports remote divergence without reading working-tree details", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        const remote = yield* makeTmpDir("git-vcs-driver-remote-");
        const { initialBranch } = yield* initRepoWithCommit(cwd);
        yield* git(remote, ["init", "--bare"]);
        yield* git(cwd, ["remote", "add", "origin", remote]);
        yield* git(cwd, ["push", "-u", "origin", initialBranch]);
        yield* git(cwd, ["checkout", "-b", "feature/remote-status"]);
        yield* writeTextFile(cwd, "feature.txt", "feature\n");
        yield* git(cwd, ["add", "feature.txt"]);
        yield* git(cwd, ["commit", "-m", "feature commit"]);
        yield* git(cwd, ["push", "-u", "origin", "feature/remote-status"]);
        yield* writeTextFile(cwd, "untracked.txt", "local-only\n");

        const status = yield* (yield* GitVcsDriver.GitVcsDriver).statusDetailsRemote(cwd);

        assert.equal(status.isRepo, true);
        assert.equal(status.branch, "feature/remote-status");
        assert.equal(status.hasUpstream, true);
        assert.equal(status.aheadCount, 0);
        assert.equal(status.behindCount, 0);
        assert.equal(status.aheadOfDefaultCount, 1);
        assert.notProperty(status, "workingTree");
        assert.notProperty(status, "hasWorkingTreeChanges");
      }),
    );

    it.effect("reports remote status on unborn HEAD without failing", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        const driver = yield* GitVcsDriver.GitVcsDriver;
        yield* driver.initRepo({ cwd });
        const initialBranch = yield* git(cwd, ["symbolic-ref", "--short", "HEAD"]);

        const status = yield* driver.statusDetailsRemote(cwd, { refreshUpstream: false });

        assert.equal(status.isRepo, true);
        assert.equal(status.branch, initialBranch);
        assert.equal(status.hasUpstream, false);
        assert.equal(status.aheadCount, 0);
        assert.equal(status.behindCount, 0);
      }),
    );

    it.effect("can read cached remote divergence without fetching upstream", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        const remote = yield* makeTmpDir("git-vcs-driver-remote-");
        const updater = yield* makeTmpDir("git-vcs-driver-updater-");
        const { initialBranch } = yield* initRepoWithCommit(cwd);
        yield* git(remote, ["init", "--bare"]);
        yield* git(cwd, ["remote", "add", "origin", remote]);
        yield* git(cwd, ["push", "-u", "origin", initialBranch]);

        yield* git(updater, ["clone", remote, "."]);
        yield* git(updater, ["config", "user.email", "test@test.com"]);
        yield* git(updater, ["config", "user.name", "Test"]);
        yield* writeTextFile(updater, "remote.txt", "remote\n");
        yield* git(updater, ["add", "remote.txt"]);
        yield* git(updater, ["commit", "-m", "remote commit"]);
        yield* git(updater, ["push", "origin", initialBranch]);

        const driver = yield* GitVcsDriver.GitVcsDriver;
        const cachedStatus = yield* driver.statusDetailsRemote(cwd, {
          refreshUpstream: false,
        });
        const refreshedStatus = yield* driver.statusDetailsRemote(cwd);

        assert.equal(cachedStatus.behindCount, 0);
        assert.equal(refreshedStatus.behindCount, 1);
      }),
    );

    it.effect("does not start Git auto-maintenance from background upstream fetches", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        const remote = yield* makeTmpDir("git-vcs-driver-remote-");
        const { initialBranch } = yield* initRepoWithCommit(cwd);
        yield* git(remote, ["init", "--bare"]);
        yield* git(cwd, ["remote", "add", "origin", remote]);
        yield* git(cwd, ["push", "-u", "origin", initialBranch]);
        yield* git(cwd, ["repack", "-d"]);
        yield* writeTextFile(cwd, "second.txt", "second\n");
        yield* git(cwd, ["add", "second.txt"]);
        yield* git(cwd, ["commit", "-m", "second commit"]);
        yield* git(cwd, ["push"]);
        yield* git(cwd, ["repack", "-d"]);
        // Two packs make `git gc --auto` due, and without detaching it would run inside the fetch.
        yield* git(cwd, ["config", "gc.autoPackLimit", "1"]);
        yield* git(cwd, ["config", "gc.autoDetach", "false"]);
        yield* git(cwd, ["config", "maintenance.autoDetach", "false"]);
        const packCount = git(cwd, ["count-objects", "-v"]).pipe(
          Effect.map((stdout) => stdout.match(/^packs: (\d+)$/m)?.[1]),
        );
        assert.equal(yield* packCount, "2");

        yield* (yield* GitVcsDriver.GitVcsDriver).statusDetailsRemote(cwd);

        assert.equal(yield* packCount, "2");
      }),
    );

    it.effect("uses origin HEAD for default-branch detection with a non-origin upstream", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        const origin = yield* makeTmpDir("git-vcs-driver-origin-");
        const upstream = yield* makeTmpDir("git-vcs-driver-upstream-");
        yield* initRepoWithCommit(cwd);
        yield* git(origin, ["init", "--bare"]);
        yield* git(upstream, ["init", "--bare"]);
        yield* git(cwd, ["branch", "-M", "main"]);
        yield* git(cwd, ["remote", "add", "origin", origin]);
        yield* git(cwd, ["remote", "add", "upstream", upstream]);
        yield* git(cwd, ["push", "origin", "main"]);
        yield* git(cwd, ["push", "upstream", "main"]);
        yield* git(cwd, ["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"]);
        yield* git(cwd, ["checkout", "-b", "release"]);
        yield* writeTextFile(cwd, "release.txt", "release\n");
        yield* git(cwd, ["add", "release.txt"]);
        yield* git(cwd, ["commit", "-m", "release commit"]);
        yield* git(cwd, ["push", "-u", "upstream", "release"]);
        yield* git(cwd, [
          "symbolic-ref",
          "refs/remotes/upstream/HEAD",
          "refs/remotes/upstream/release",
        ]);

        const status = yield* (yield* GitVcsDriver.GitVcsDriver).statusDetailsRemote(cwd);

        assert.equal(status.branch, "release");
        assert.equal(status.upstreamRef, "upstream/release");
        assert.equal(status.isDefaultBranch, false);
      }),
    );

    it.effect("makes background upstream status fetches non-interactive", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        const tempDir = yield* makeTmpDir("git-vcs-driver-ssh-env-");
        const { initialBranch } = yield* initRepoWithCommit(cwd);
        const fileSystem = yield* FileSystem.FileSystem;
        const pathService = yield* Path.Path;
        const sshLogPath = pathService.join(tempDir, "ssh-env.txt");
        const sshWrapperPath = yield* pathService.fromFileUrl(
          new URL("./testing/GitVcsDriverCore.fixture.sh", import.meta.url),
        );
        const envKeys = [
          "GCM_INTERACTIVE",
          "GIT_ASKPASS",
          "GIT_SSH",
          "GIT_TERMINAL_PROMPT",
          "SSH_ASKPASS",
          "SSH_ASKPASS_REQUIRE",
          "CONTROL_TEST_SSH_ASKPASS_LOG",
        ] as const;
        const previousEnv = new Map(envKeys.map((key) => [key, process.env[key]]));

        yield* git(cwd, ["remote", "add", "origin", "ssh://example.invalid/repo.git"]);
        yield* git(cwd, ["update-ref", `refs/remotes/origin/${initialBranch}`, "HEAD"]);
        yield* git(cwd, ["branch", "--set-upstream-to", `origin/${initialBranch}`]);

        yield* Effect.gen(function* () {
          process.env.GIT_SSH = sshWrapperPath;
          process.env.GCM_INTERACTIVE = "always";
          process.env.GIT_ASKPASS = "git-askpass";
          process.env.GIT_TERMINAL_PROMPT = "1";
          process.env.SSH_ASKPASS = "ssh-askpass";
          process.env.SSH_ASKPASS_REQUIRE = "force";
          process.env.CONTROL_TEST_SSH_ASKPASS_LOG = sshLogPath;

          yield* (yield* GitVcsDriver.GitVcsDriver).statusDetails(cwd);

          assert.deepEqual((yield* fileSystem.readFileString(sshLogPath)).trim().split(/\r?\n/), [
            "GCM_INTERACTIVE=never",
            "GIT_ASKPASS=",
            "GIT_TERMINAL_PROMPT=0",
            "SSH_ASKPASS=",
            "SSH_ASKPASS_REQUIRE=never",
          ]);
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => {
              for (const key of envKeys) {
                const previous = previousEnv.get(key);
                if (previous === undefined) {
                  delete process.env[key];
                } else {
                  process.env[key] = previous;
                }
              }
            }),
          ),
        );
      }),
    );

    it.effect("reuses the no-upstream fallback ahead count for default-branch delta", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        const remote = yield* makeTmpDir("git-vcs-driver-remote-");
        const { initialBranch } = yield* initRepoWithCommit(cwd);
        yield* git(remote, ["init", "--bare"]);
        yield* git(cwd, ["remote", "add", "origin", remote]);
        yield* git(cwd, ["push", "-u", "origin", initialBranch]);
        yield* git(cwd, ["checkout", "-b", "feature/no-upstream"]);
        yield* writeTextFile(cwd, "feature.txt", "feature\n");
        yield* git(cwd, ["add", "feature.txt"]);
        yield* git(cwd, ["commit", "-m", "feature commit"]);

        const status = yield* (yield* GitVcsDriver.GitVcsDriver).statusDetails(cwd);

        assert.equal(status.hasUpstream, false);
        assert.equal(status.aheadCount, 1);
        assert.equal(status.behindCount, 0);
        assert.equal(status.aheadOfDefaultCount, 1);
      }),
    );

    it.effect("reports combined staged and unstaged edits to the same file", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        yield* initRepoWithCommit(cwd);
        yield* writeTextFile(cwd, "feature.ts", "// line one\n");
        yield* git(cwd, ["add", "feature.ts"]);
        yield* git(cwd, ["commit", "-m", "add feature"]);
        yield* writeTextFile(cwd, "feature.ts", "// line one\n// line two\n");
        yield* git(cwd, ["add", "feature.ts"]);
        yield* writeTextFile(cwd, "feature.ts", "// line one\n// line two\n// line three\n");

        const status = yield* (yield* GitVcsDriver.GitVcsDriver).statusDetails(cwd);

        assert.equal(status.isRepo, true);
        assert.equal(status.hasWorkingTreeChanges, true);
        const file = status.workingTree.files.find((f) => f.path === "feature.ts");
        assert.ok(file);
        // HEAD has 1 line. Staged has 2 lines (+1). Unstaged has 3 lines (+2 from HEAD).
        // Combined net from HEAD: +2 insertions.
        assert.equal(file.insertions, 2);
        assert.equal(file.deletions, 0);
      }),
    );

    it.effect("reports staged file counts on unborn HEAD without failing", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        const driver = yield* GitVcsDriver.GitVcsDriver;
        yield* driver.initRepo({ cwd });
        yield* git(cwd, ["config", "user.email", "test@test.com"]);
        yield* git(cwd, ["config", "user.name", "Test"]);
        yield* writeTextFile(cwd, "initial.ts", "// first file\n");
        yield* git(cwd, ["add", "initial.ts"]);

        const status = yield* driver.statusDetails(cwd);

        assert.equal(status.isRepo, true);
        assert.equal(status.workingTree.files.length, 1);
        const file = status.workingTree.files[0];
        if (file) {
          assert.equal(file.path, "initial.ts");
          assert.equal(file.insertions, 1);
        }
      }),
    );
  });
});
