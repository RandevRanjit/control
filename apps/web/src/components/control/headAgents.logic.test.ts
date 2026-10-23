import {
  NodeId,
  ProviderDriverKind,
  ProviderInstanceId,
  RunId,
  ThreadId,
  TurnItemId,
  type OrchestrationV2Subagent,
  type OrchestrationV2TurnItem,
} from "@control/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import { headAgents } from "./headAgents.logic";

const at = (iso: string) => DateTime.makeUnsafe(iso);

function subagent(
  id: string,
  overrides: Partial<OrchestrationV2Subagent> = {},
): OrchestrationV2Subagent {
  return {
    id: NodeId.make(id),
    threadId: ThreadId.make("thread-1"),
    runId: RunId.make("run-1"),
    parentNodeId: NodeId.make("node-1"),
    origin: "provider_native",
    createdBy: "agent",
    driver: ProviderDriverKind.make("claudeAgent"),
    providerInstanceId: ProviderInstanceId.make("claudeAgent"),
    providerThreadId: null,
    childThreadId: ThreadId.make(`child-${id}`),
    nativeTaskRef: null,
    prompt: `Prompt ${id}`,
    title: `Agent ${id}`,
    model: null,
    status: "running",
    result: null,
    startedAt: at("2026-10-21T10:00:00Z"),
    completedAt: null,
    updatedAt: at("2026-10-21T10:00:00Z"),
    ...overrides,
  };
}

const itemBase = (id: string, updatedAt: string) => ({
  id: TurnItemId.make(id),
  threadId: ThreadId.make("thread-1"),
  runId: RunId.make("run-1"),
  nodeId: null,
  providerThreadId: null,
  providerTurnId: null,
  nativeItemRef: null,
  parentItemId: null,
  ordinal: 0,
  status: "completed" as const,
  title: null,
  startedAt: at(updatedAt),
  completedAt: at(updatedAt),
  updatedAt: at(updatedAt),
});

const workflowCall = (id: string, status: "completed" | "failed" = "completed") =>
  ({
    ...itemBase(id, "2026-10-21T10:00:00Z"),
    status,
    type: "dynamic_tool",
    toolName: "Workflow",
    input: { script: "export const meta = {}" },
  }) as OrchestrationV2TurnItem;

const workflowNotice = (
  id: string,
  updatedAt: string,
  outcome: "completed" | "failed" | "cancelled",
  label?: string,
) =>
  ({
    ...itemBase(id, updatedAt),
    type: "notification",
    outcome,
    summary: "Workflow finished",
    source: label === undefined ? { kind: "workflow" } : { kind: "workflow", label },
  }) as OrchestrationV2TurnItem;

describe("headAgents", () => {
  it("counts the subagents and workflows a chat started, running ones apart", () => {
    const agents = headAgents({
      subagents: [
        subagent("a"),
        subagent("b", {
          status: "completed",
          completedAt: at("2026-10-21T10:05:00Z"),
          updatedAt: at("2026-10-21T10:05:00Z"),
        }),
        subagent("c", {
          status: "failed",
          completedAt: at("2026-10-21T10:02:00Z"),
          updatedAt: at("2026-10-21T10:02:00Z"),
        }),
        subagent("d", {
          status: "interrupted",
          completedAt: at("2026-10-21T10:01:00Z"),
          updatedAt: at("2026-10-21T10:01:00Z"),
        }),
      ],
      providerThreads: [
        {
          pendingBackgroundTasks: [
            { taskId: "wf-running", description: "Review the diff", kind: "workflow" },
            { taskId: "bash-1", description: "npm test", kind: "command" },
          ],
        },
      ],
      turnItems: [
        workflowCall("call-1"),
        workflowCall("call-2"),
        // A Workflow call the tool refused never ran.
        workflowCall("call-3", "failed"),
        workflowNotice("notice-1", "2026-10-21T10:03:00Z", "completed", "Two agents say hello"),
      ],
    });

    expect(agents.started).toBe(6);
    expect(agents.running.map(({ kind, name, outcome }) => [kind, name, outcome])).toEqual([
      ["subagent", "Agent a", null],
      ["workflow", "Review the diff", null],
    ]);
    expect(agents.done.map(({ kind, name, outcome }) => [kind, name, outcome])).toEqual([
      ["subagent", "Agent b", "done"],
      ["workflow", "Two agents say hello", "done"],
      ["subagent", "Agent c", "failed"],
      ["subagent", "Agent d", "stopped"],
    ]);
  });

  it("names a workflow notice that reports several by its summary", () => {
    const agents = headAgents({
      subagents: [],
      providerThreads: [],
      turnItems: [workflowNotice("notice-1", "2026-10-21T10:03:00Z", "failed")],
    });
    expect(agents.done).toEqual([
      {
        id: "notice-1",
        kind: "workflow",
        name: "Workflow finished",
        timing: null,
        outcome: "failed",
      },
    ]);
  });
});
