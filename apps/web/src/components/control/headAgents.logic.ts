import {
  isActiveSubagentStatus,
  projectedSubagentsToRuntime,
  type RuntimeSubagent,
} from "@control/client-runtime/state/subagentRuntime";
import { formatSubagentDisplayTitle } from "@control/client-runtime/state/subagent-display";
import type { ThreadStructure } from "@control/client-runtime/state/shell";
import type { OrchestrationV2ThreadProjection } from "@control/contracts";
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
}

export interface HeadAgents {
  readonly started: number;
  readonly running: ReadonlyArray<HeadAgentRow>;
  readonly done: ReadonlyArray<HeadAgentRow>;
}

function subagentOutcome(status: RuntimeSubagent["status"]): Outcome {
  if (status === "failed") return "failed";
  if (status === "cancelled" || status === "interrupted") return "stopped";
  return "done";
}

/**
 * The head's Agents pill (HeadLoads): the subagents and workflows this chat started. A
 * workflow is its Workflow call; it runs while on the provider thread's roster and is done
 * once its notification lands. Done rows come newest first.
 */
export function headAgents(projection: {
  readonly subagents: Projection["subagents"];
  readonly providerThreads: ReadonlyArray<
    Pick<Projection["providerThreads"][number], "pendingBackgroundTasks">
  >;
  readonly turnItems: ThreadStructure["turnItems"];
}): HeadAgents {
  const subagents = projectedSubagentsToRuntime(projection.subagents).map(
    (agent): HeadAgentRow & { readonly at: string } => ({
      id: agent.id,
      kind: "subagent",
      name: formatSubagentDisplayTitle(agent.title),
      timing: agent,
      outcome: isActiveSubagentStatus(agent.status) ? null : subagentOutcome(agent.status),
      at: agent.completedAt ?? agent.updatedAt,
    }),
  );
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
            },
          ]
        : [],
    ),
  );
  const doneWorkflows = projection.turnItems.flatMap(
    (item): Array<HeadAgentRow & { readonly at: string }> =>
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
              at: DateTime.formatIso(item.updatedAt),
            },
          ]
        : [],
  );
  const launches = projection.turnItems.filter(
    (item) =>
      item.type === "dynamic_tool" && item.toolName === "Workflow" && item.status !== "failed",
  ).length;
  return {
    started: subagents.length + launches,
    running: [...subagents.filter((row) => row.outcome === null), ...runningWorkflows],
    done: [...subagents.filter((row) => row.outcome !== null), ...doneWorkflows]
      .toSorted((a, b) => b.at.localeCompare(a.at))
      .map(({ at: _at, ...row }) => row),
  };
}
