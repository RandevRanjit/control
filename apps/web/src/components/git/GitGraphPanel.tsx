import { whenLabel } from "@control/client-runtime/state/loose-ends";
import type { EnvironmentId, VcsCommit } from "@control/contracts";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

import { RefreshIcon } from "~/components/ui/refresh-icon";
import { useWorkspaceMutationRefresh } from "~/hooks/useWorkspaceMutationRefresh";
import { useEnvironmentQuery } from "~/state/query";
import { vcsEnvironment } from "~/state/vcs";

import { type CommitGraphRow, layoutCommitGraph } from "./commitGraph";

/** `25 Oct, 17:20`, in the rows' `25 Oct` style whatever the machine's locale. */
const COMMIT_TIME = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const LANE = 12;
const PAGE = 60;
const ROW = 28;
/** Lanes take the tool colours in turn, so two branches never share one beside each other. */
const LANE_INKS = [
  "var(--tv-read)",
  "var(--tv-write)",
  "var(--tv-agent)",
  "var(--tv-run)",
  "var(--tv-web)",
];
const ink = (lane: number) => LANE_INKS[lane % LANE_INKS.length];
const laneX = (lane: number) => LANE / 2 + lane * LANE;

/** One row's slice of the graph: lines through it, into and out of its node, and the node. */
function GraphCell({ row, width, head }: { row: CommitGraphRow; width: number; head: boolean }) {
  const mid = ROW / 2;
  const node = laneX(row.lane);
  return (
    <svg width={width} height={ROW} aria-hidden className="shrink-0 overflow-visible">
      {row.lanesIn.map((sha, lane) =>
        sha === null ? null : (
          <path
            key={`in-${lane}`}
            d={
              lane === row.lane || row.joining.includes(lane)
                ? `M${laneX(lane)} 0 C${laneX(lane)} ${mid * 0.6} ${node} ${mid * 0.4} ${node} ${mid}`
                : `M${laneX(lane)} 0 V${mid}`
            }
            stroke={ink(lane)}
            strokeWidth={1.5}
            fill="none"
          />
        ),
      )}
      {row.lanesOut.map((sha, lane) => {
        if (sha === null) return null;
        const fromNode = row.parentLanes.includes(lane);
        if (!fromNode && row.lanesIn[lane] == null) return null;
        return (
          <path
            key={`out-${lane}`}
            d={
              fromNode
                ? `M${node} ${mid} C${node} ${mid + mid * 0.6} ${laneX(lane)} ${mid + mid * 0.4} ${laneX(lane)} ${ROW}`
                : `M${laneX(lane)} ${mid} V${ROW}`
            }
            stroke={ink(fromNode ? Math.max(lane, row.lane) : lane)}
            strokeWidth={1.5}
            fill="none"
          />
        );
      })}
      <circle
        cx={node}
        cy={mid}
        r={head ? 4 : 3.5}
        fill={head ? ink(row.lane) : "var(--deep)"}
        stroke={ink(row.lane)}
        strokeWidth={1.5}
      />
    </svg>
  );
}

function CommitFiles(props: {
  /** The commit's lane carries on below it, so the line runs past its files. */
  continues: boolean;
  /** The graph's width, so the commit's details line up under its subject. */
  graphWidth: number;
  environmentId: EnvironmentId;
  cwd: string;
  commit: VcsCommit;
  onOpenFile: (path: string) => void;
}) {
  const { data, error } = useEnvironmentQuery(
    vcsEnvironment.readCommitFiles({
      environmentId: props.environmentId,
      input: { cwd: props.cwd, sha: props.commit.sha },
    }),
  );
  if (error) return <p className="s-gg-note">{error}</p>;
  if (data === null) return <p className="s-gg-note">Reading the commit…</p>;
  return (
    <div
      className="s-gg-open"
      data-continues={props.continues ? "" : undefined}
      style={{ paddingLeft: props.graphWidth - 5 }}
    >
      <p className="s-gg-by">
        {props.commit.authorName} · {COMMIT_TIME.format(new Date(props.commit.authoredAt))} ·{" "}
        {props.commit.sha.slice(0, 7)}
      </p>
      {data.body ? <p className="s-gg-body">{data.body}</p> : null}
      {data.files.map((file) => (
        <button
          key={file.path}
          type="button"
          className="dp-o w-full cursor-pointer text-left disabled:cursor-default"
          disabled={file.status === "D"}
          onClick={() => props.onOpenFile(file.path)}
        >
          <span className="dp-gs" data-g={file.status === "T" ? "M" : file.status}>
            {file.status}
          </span>
          <span className="dp-nm">{file.path}</span>
          <span className="dp-mt">
            {file.additions === null
              ? "binary"
              : [
                  file.additions > 0 ? `+${file.additions}` : null,
                  file.deletions && file.deletions > 0 ? `−${file.deletions}` : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
          </span>
        </button>
      ))}
      {data.truncated ? <p className="s-gg-note">More files than shown here.</p> : null}
    </div>
  );
}

function CommitRefs({ refs }: { refs: VcsCommit["refs"] }) {
  const shown = refs.filter((ref) => ref !== "HEAD");
  if (shown.length === 0) return null;
  return (
    <span className="s-gg-refs">
      {shown.map((ref) => (
        <span key={ref} className="s-gg-ref" data-remote={ref.includes("/") ? "" : undefined}>
          {ref}
        </span>
      ))}
    </span>
  );
}

/**
 * Git's Graph (design §5.2, F33): the branch's history newest first, its upstream and the default
 * branch beside it in their own lanes. A commit opens to its message and files; a file opens in
 * Folder.
 */
export function GitGraphPanel(props: {
  environmentId: EnvironmentId;
  cwd: string;
  workspaceMutationId: string | null;
  onOpenFile: (path: string) => void;
}) {
  const [limit, setLimit] = useState(PAGE);
  const history = useEnvironmentQuery(
    vcsEnvironment.listCommits({
      environmentId: props.environmentId,
      input: { cwd: props.cwd, limit },
    }),
  );
  useWorkspaceMutationRefresh({
    mutationId: props.workspaceMutationId,
    refresh: history.refresh,
    resourceKey: `graph:${props.environmentId}:${props.cwd}`,
  });
  const commits = history.data?.commits ?? [];
  const rows = useMemo(() => layoutCommitGraph(commits), [commits]);
  const width = Math.min(6, Math.max(1, ...rows.map((row) => row.lanesIn.length + 1))) * LANE;
  const [openSha, setOpenSha] = useState<string | null>(null);
  const nowMs = Date.now();
  const branch = commits[0]?.refs.find((ref) => ref !== "HEAD" && !ref.includes("/"));

  return (
    <div className="pane hy-v dp-v flex min-h-0 flex-1 flex-col" data-git-graph>
      <div className="hy-vh">
        <b>{branch ?? "HEAD"}</b>
        <span>
          {history.data?.hasMore ? `latest ${commits.length}` : `${commits.length} commits`}
        </span>
        <span className="sp" />
        <button
          type="button"
          className="hy-ib cursor-pointer"
          aria-label="Refresh history"
          onClick={history.refresh}
        >
          <RefreshIcon size="sm" refreshing={history.isPending} />
        </button>
      </div>
      {history.error ? (
        <p className="s-gg-note">{history.error}</p>
      ) : history.data?.isRepo === false ? (
        <p className="s-gg-note">This folder is not a Git repository.</p>
      ) : history.data !== null && commits.length === 0 ? (
        <p className="s-gg-note">No commits yet.</p>
      ) : (
        <div className="s-gg-list" role="list" aria-label="Commits">
          {commits.map((commit, index) => {
            const open = openSha === commit.sha;
            return (
              <div key={commit.sha} role="listitem">
                <button
                  type="button"
                  className="s-gg-row"
                  aria-expanded={open}
                  data-on={open ? "" : undefined}
                  onClick={() => setOpenSha(open ? null : commit.sha)}
                >
                  <GraphCell row={rows[index]!} width={width} head={commit.refs.includes("HEAD")} />
                  <span className="s-gg-sub">{commit.subject}</span>
                  <CommitRefs refs={commit.refs} />
                  <span className="dp-mt">{whenLabel(Date.parse(commit.authoredAt), nowMs)}</span>
                  {open ? (
                    <ChevronDown className="s-gg-cv size-3" />
                  ) : (
                    <ChevronRight className="s-gg-cv size-3" />
                  )}
                </button>
                {open ? (
                  <CommitFiles
                    continues={commit.parents.length > 0}
                    graphWidth={width}
                    environmentId={props.environmentId}
                    cwd={props.cwd}
                    commit={commit}
                    onOpenFile={props.onOpenFile}
                  />
                ) : null}
              </div>
            );
          })}
          {history.data?.hasMore ? (
            <button
              type="button"
              className="s-gg-more cursor-pointer"
              onClick={() => setLimit((current) => Math.min(200, current + PAGE))}
              disabled={limit >= 200}
            >
              {limit >= 200 ? "The panel shows the latest 200" : "Show older"}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
