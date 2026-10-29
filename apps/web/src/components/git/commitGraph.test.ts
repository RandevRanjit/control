import { describe, expect, it } from "vite-plus/test";

import { layoutCommitGraph } from "./commitGraph";

const commit = (sha: string, ...parents: string[]) => ({ sha, parents });

describe("layoutCommitGraph", () => {
  it("keeps a straight history in one lane", () => {
    expect(
      layoutCommitGraph([commit("c", "b"), commit("b", "a"), commit("a")]).map((row) => row.lane),
    ).toEqual([0, 0, 0]);
  });

  it("opens a lane for a merged branch and closes it where the branch forked", () => {
    // m merges x (a side branch off a) into b.
    const rows = layoutCommitGraph([
      commit("m", "b", "x"),
      commit("x", "a"),
      commit("b", "a"),
      commit("a"),
    ]);
    expect(rows.map(({ lane, parentLanes, joining }) => ({ lane, parentLanes, joining }))).toEqual([
      { lane: 0, parentLanes: [0, 1], joining: [] },
      { lane: 1, parentLanes: [1], joining: [] },
      { lane: 0, parentLanes: [0], joining: [] },
      // Both lanes waited for a: the side branch's lane meets the main one here.
      { lane: 0, parentLanes: [], joining: [1] },
    ]);
    expect(rows[3]!.lanesOut).toEqual([]);
  });

  it("starts a tip that nothing above waits for in a free lane", () => {
    // origin/main is ahead of HEAD's branch: two tips over a shared base.
    const rows = layoutCommitGraph([
      commit("head", "base"),
      commit("remote", "base"),
      commit("base"),
    ]);
    expect(rows.map((row) => row.lane)).toEqual([0, 1, 0]);
    expect(rows[2]!.joining).toEqual([1]);
  });
});
