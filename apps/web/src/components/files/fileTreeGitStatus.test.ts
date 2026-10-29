import { describe, expect, it } from "vite-plus/test";

import { fileTreeGitStatus } from "./fileTreeGitStatus";

const file = (path: string, status?: "A" | "M" | "D" | "R") => ({
  path,
  insertions: 1,
  deletions: 0,
  ...(status ? { status } : {}),
});

describe("fileTreeGitStatus", () => {
  it("marks the tree's own paths when the folder is the repository's root", () => {
    expect(
      fileTreeGitStatus({
        files: [file("README.md", "M"), file("notes/", "A"), file("old.txt", "D")],
        insertions: 3,
        deletions: 0,
        prefix: "",
      }),
    ).toEqual([
      { path: "README.md", status: "modified" },
      { path: "notes/", status: "added" },
      { path: "old.txt", status: "deleted" },
    ]);
  });

  it("moves a nested folder's files onto its tree and drops the rest of the repository", () => {
    expect(
      fileTreeGitStatus({
        files: [file("apps/web/src/a.ts", "A"), file("apps/server/b.ts", "M"), file("README.md")],
        insertions: 3,
        deletions: 0,
        prefix: "apps/web/",
      }),
    ).toEqual([{ path: "src/a.ts", status: "added" }]);
  });

  it("reads an older server's unlettered files as modified", () => {
    expect(fileTreeGitStatus({ files: [file("a.ts")], insertions: 1, deletions: 0 })).toEqual([
      { path: "a.ts", status: "modified" },
    ]);
  });
});
