import { describe, expect, it } from "vite-plus/test";

import { parseCommitFiles, parseCommitLog, parseCommitRefs } from "./gitHistory.ts";

describe("git history for the panel's Graph", () => {
  it("names the refs on a commit, HEAD first, without the remote's symbolic HEAD", () => {
    expect(parseCommitRefs("HEAD -> design-panel, origin/main, origin/HEAD, tag: v0.1.0")).toEqual([
      "HEAD",
      "design-panel",
      "origin/main",
      "v0.1.0",
    ]);
    expect(parseCommitRefs("")).toEqual([]);
  });

  it("reads commits from the log, merges with both parents and the root with none", () => {
    const log =
      "c3\x1fc2 b1\x1fRandev\x1f2026-10-29T01:00:00+01:00\x1fHEAD -> main\x1fMerge branch 'x'\x1e\n" +
      "c2\x1fc1\x1fAgent\x1f2026-10-28T22:00:00+01:00\x1f\x1fGit: a subject, with \x1e\n" +
      "c1\x1f\x1fRandev\x1f2026-10-27T10:00:00+01:00\x1ftag: v1\x1fFirst\x1e\n";
    expect(parseCommitLog(log)).toEqual([
      {
        sha: "c3",
        parents: ["c2", "b1"],
        subject: "Merge branch 'x'",
        authorName: "Randev",
        authoredAt: "2026-10-29T01:00:00+01:00",
        refs: ["HEAD", "main"],
      },
      {
        sha: "c2",
        parents: ["c1"],
        subject: "Git: a subject, with ",
        authorName: "Agent",
        authoredAt: "2026-10-28T22:00:00+01:00",
        refs: [],
      },
      {
        sha: "c1",
        parents: [],
        subject: "First",
        authorName: "Randev",
        authoredAt: "2026-10-27T10:00:00+01:00",
        refs: ["v1"],
      },
    ]);
  });

  it("pairs each changed file's letter with its counts, binary files counting nothing", () => {
    const nameStatus = "M\0src/app.ts\0A\0docs/a b.md\0D\0old.png\0";
    const numstat = "3\t1\tsrc/app.ts\x002\t0\tdocs/a b.md\x00-\t-\told.png\0";
    expect(parseCommitFiles(nameStatus, numstat, 2)).toEqual({
      files: [
        { path: "src/app.ts", status: "M", additions: 3, deletions: 1 },
        { path: "docs/a b.md", status: "A", additions: 2, deletions: 0 },
      ],
      truncated: true,
    });
    expect(parseCommitFiles(nameStatus, numstat, 10).files[2]).toEqual({
      path: "old.png",
      status: "D",
      additions: null,
      deletions: null,
    });
  });
});
