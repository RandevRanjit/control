import {
  isActiveSubagentStatus,
  projectedSubagentsToRuntime,
  type RuntimeSubagent,
} from "@control/client-runtime/state/subagentRuntime";
import { formatSubagentDisplayTitle } from "@control/client-runtime/state/subagent-display";
import type { ThreadStructure } from "@control/client-runtime/state/shell";
import type { OrchestrationV2ThreadProjection, ThreadId } from "@control/contracts";
import * as DateTime from "effect/DateTime";

type Projection = OrchestrationV2ThreadProjection;
type Outcome = "done" | "failed" | "stopped";

export interface HeadAgentRow {
  readonly id: string;
  readonly kind: "subagent" | "workflow";
  readonly name: string;
  /** A subagent's timer; Claude reports no start time for a workflow. */
  readonly timing: Pick<RuntimeSubagent, "status" | "startedAt" | "completedAt"> | null;
  /** Null while it runs. */
  readonly outcome: Outcome | null;
  /** The subagent's own thread, which a click opens. */
  readonly childThreadId: ThreadId | null;
  /** Subagents this one started. */
  readonly children: ReadonlyArray<HeadAgentRow>;
}

/** One of the owner's messages and the agents its turn started. */
export interface HeadAgentTurn {
  readonly id: string;
  readonly ordinal: number | null;
  /** The message's first line. */
  readonly label: string;
  readonly agents: ReadonlyArray<HeadAgentRow>;
}

export interface HeadAgents {
  readonly started: number;
  readonly running: number;
  /** Newest turn first. */
  readonly turns: ReadonlyArray<HeadAgentTurn>;
  /** Workflows: running first, then newest done. Claude doesn't say which turn ran one. */
  readonly workflows: ReadonlyArray<HeadAgentRow>;
}

function subagentOutcome(status: RuntimeSubagent["status"]): Outcome {
  if (status === "failed") return "failed";
  if (status === "cancelled" || status === "interrupted") return "stopped";
  return "done";
}

/** Running before done; then the order they started in. */
const runningFirst = (
  a: HeadAgentRow & { readonly at: string },
  b: HeadAgentRow & { readonly at: string },
) => Number(a.outcome !== null) - Number(b.outcome !== null) || a.at.localeCompare(b.at);

/**
 * The head's Agents pill (HeadLoads): the subagents and workflows this chat started, as a
 * tree. Each subagent sits under the message whose turn started it, and under the subagent
 * that started it when one did. A workflow is its Workflow call; it runs while on the
 * provider thread's roster and is done once its notification lands.
 */
export function headAgents(projection: {
  readonly subagents: Projection["subagents"];
  readonly runs: ReadonlyArray<Pick<Projection["runs"][number], "id" | "ordinal">>;
  readonly providerThreads: ReadonlyArray<
    Pick<Projection["providerThreads"][number], "pendingBackgroundTasks">
  >;
  readonly turnItems: ThreadStructure["turnItems"];
}): HeadAgents {
  const runtime = new Map(
    projectedSubagentsToRuntime(projection.subagents).map((agent) => [agent.id, agent]),
  );
  const ids = new Set(projection.subagents.map((agent) => agent.id as string));
  const childrenOf = new Map<string, Array<(typeof projection.subagents)[number]>>();
  for (const agent of projection.subagents) {
    const parent = ids.has(agent.parentNodeId) ? agent.parentNodeId : `run:${agent.runId ?? ""}`;
    childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), agent]);
  }
  const rows = (parent: string): Array<HeadAgentRow> =>
    (childrenOf.get(parent) ?? [])
      .map((agent) => {
        const timing = runtime.get(agent.id)!;
        return {
          id: agent.id,
          kind: "subagent" as const,
          name: formatSubagentDisplayTitle(timing.title),
          timing,
          outcome: isActiveSubagentStatus(timing.status) ? null : subagentOutcome(timing.status),
          childThreadId: agent.childThreadId,
          children: rows(agent.id),
          at: timing.firstSeenAt,
        };
      })
      .toSorted(runningFirst)
      .map(({ at: _at, ...row }) => row);

  const messages = new Map(
    projection.turnItems.flatMap((item) =>
      item.type === "user_message" && item.runId !== null
        ? [[item.runId as string, item.text]]
        : [],
    ),
  );
  const ordinals = new Map(projection.runs.map((run) => [run.id as string, run.ordinal]));
  const turns = [...childrenOf.keys()]
    .filter((key) => key.startsWith("run:"))
    .map((key): HeadAgentTurn => {
      const runId = key.slice(4);
      const text = messages.get(runId)?.trim().split("\n")[0]?.trim();
      return {
        id: key,
        ordinal: ordinals.get(runId) ?? null,
        label: text || "This chat",
        agents: rows(key),
      };
    })
    .toSorted((a, b) => (b.ordinal ?? 0) - (a.ordinal ?? 0));

  const runningWorkflows = projection.providerThreads.flatMap((thread) =>
    (thread.pendingBackgroundTasks ?? []).flatMap((task): Array<HeadAgentRow> =>
      task.kind === "workflow"
        ? [
            {
              id: task.taskId,
              kind: "workflow",
              name: task.description ?? "Workflow",
              timing: null,
              outcome: null,
              childThreadId: null,
              children: [],
            },
          ]
        : [],
    ),
  );
  const doneWorkflows = projection.turnItems
    .flatMap((item): Array<HeadAgentRow & { readonly at: string }> =>
      item.type === "notification" && item.source.kind === "workflow"
        ? [
            {
              id: item.id,
              kind: "workflow",
              name: item.source.label ?? item.summary,
              timing: null,
              outcome:
                item.outcome === "failed"
                  ? "failed"
                  : item.outcome === "cancelled"
                    ? "stopped"
                    : "done",
              childThreadId: null,
              children: [],
              at: DateTime.formatIso(item.updatedAt),
            },
          ]
        : [],
    )
    .toSorted((a, b) => b.at.localeCompare(a.at))
    .map(({ at: _at, ...row }) => row);
  const launches = projection.turnItems.filter(
    (item) =>
      item.type === "dynamic_tool" && item.toolName === "Workflow" && item.status !== "failed",
  ).length;
  return {
    started: projection.subagents.length + launches,
    running:
      [...runtime.values()].filter((agent) => isActiveSubagentStatus(agent.status)).length +
      runningWorkflows.length,
    turns,
    workflows: [...runningWorkflows, ...doneWorkflows],
  };
}
