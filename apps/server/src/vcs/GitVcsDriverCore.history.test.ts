import { assert, it, describe } from "@effect/vitest";
import * as Effect from "effect/Effect";

import * as GitVcsDriver from "./GitVcsDriver.ts";
import {
  layerTest,
  makeTmpDir,
  writeTextFile,
  git,
  initRepoWithCommit,
} from "./GitVcsDriverCore.testkit.ts";

it.layer(layerTest)("GitVcsDriver history for the panel's Graph", (it) => {
  describe("listCommits and readCommitFiles", () => {
    it.effect("lists HEAD's history beside the remote it left, and a commit's files", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        const remote = yield* makeTmpDir("git-vcs-driver-remote-");
        const { initialBranch } = yield* initRepoWithCommit(cwd);
        yield* git(remote, ["init", "--bare"]);
        yield* git(cwd, ["remote", "add", "origin", remote]);
        yield* git(cwd, ["push", "-u", "origin", initialBranch]);
        yield* git(cwd, ["remote", "set-head", "origin", initialBranch]);
        yield* writeTextFile(cwd, "docs/notes.md", "one\ntwo\n");
        yield* git(cwd, ["add", "."]);
        yield* git(cwd, ["commit", "-m", "Docs: notes", "-m", "Why they exist."]);
        const driver = yield* GitVcsDriver.GitVcsDriver;

        const history = yield* driver.listCommits({ cwd });
        assert.equal(history.isRepo, true);
        assert.equal(history.hasMore, false);
        assert.deepStrictEqual(
          history.commits.map((commit) => [commit.subject, commit.refs]),
          [
            ["Docs: notes", ["HEAD", initialBranch]],
            [history.commits[1]!.subject, [`origin/${initialBranch}`]],
          ],
        );
        assert.deepStrictEqual(history.commits[0]!.parents, [history.commits[1]!.sha]);

        const capped = yield* driver.listCommits({ cwd, limit: 1 });
        assert.equal(capped.commits.length, 1);
        assert.equal(capped.hasMore, true);

        const files = yield* driver.readCommitFiles({ cwd, sha: history.commits[0]!.sha });
        assert.deepStrictEqual(files, {
          body: "Why they exist.",
          files: [{ path: "docs/notes.md", status: "A", additions: 2, deletions: 0 }],
          truncated: false,
        });
        const root = yield* driver.readCommitFiles({ cwd, sha: history.commits[1]!.sha });
        assert.equal(root.files.length > 0, true);
      }),
    );
  });
});
