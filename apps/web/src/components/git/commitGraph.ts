import type { VcsCommit } from "@control/contracts";

/**
 * One row of the Graph's lanes. A lane holds the commit it waits for; a row's node sits in
 * `lane`, lanes in `lanesIn` arrive from above and `lanesOut` leave below, and `parentLanes` are
 * where the node's own lines go.
 */
export interface CommitGraphRow {
  lane: number;
  lanesIn: ReadonlyArray<string | null>;
  lanesOut: ReadonlyArray<string | null>;
  /** Lanes that waited for this commit too, so meet at its node (branches that forked here). */
  joining: ReadonlyArray<number>;
  parentLanes: ReadonlyArray<number>;
}

function freeLane(lanes: Array<string | null>): number {
  const free = lanes.indexOf(null);
  return free < 0 ? lanes.length : free;
}

/** Lays newest-first, topologically ordered commits into lanes, as `git log --graph` does. */
export function layoutCommitGraph(commits: ReadonlyArray<Pick<VcsCommit, "sha" | "parents">>) {
  const lanes: Array<string | null> = [];
  const rows: CommitGraphRow[] = [];
  for (const commit of commits) {
    let lane = lanes.indexOf(commit.sha);
    if (lane < 0) {
      lane = freeLane(lanes);
      lanes[lane] = commit.sha;
    }
    const lanesIn = [...lanes];
    const joining = lanes.flatMap((sha, index) =>
      sha === commit.sha && index !== lane ? [index] : [],
    );
    for (const index of joining) lanes[index] = null;
    const [first, ...others] = commit.parents;
    lanes[lane] = first ?? null;
    const parentLanes = first === undefined ? [] : [lane];
    for (const parent of others) {
      let parentLane = lanes.indexOf(parent);
      if (parentLane < 0) {
        parentLane = freeLane(lanes);
        lanes[parentLane] = parent;
      }
      parentLanes.push(parentLane);
    }
    while (lanes.length > 0 && lanes.at(-1) === null) lanes.pop();
    rows.push({ lane, lanesIn, lanesOut: [...lanes], joining, parentLanes });
  }
  return rows;
}
