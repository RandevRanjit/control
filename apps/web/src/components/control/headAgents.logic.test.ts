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

const userMessage = (runId: string, text: string) =>
  ({
    ...itemBase(`message-${runId}`, "2026-10-21T09:59:00Z"),
    runId: RunId.make(runId),
    type: "user_message",
    text,
  }) as OrchestrationV2TurnItem;

const runs = [
  { id: RunId.make("run-1"), ordinal: 1 },
  { id: RunId.make("run-2"), ordinal: 2 },
];

describe("headAgents", () => {
  it("nests each subagent under the message that started it, and under its parent subagent", () => {
    const agents = headAgents({
      subagents: [
        subagent("a"),
        subagent("b", {
          status: "completed",
          completedAt: at("2026-10-21T10:05:00Z"),
          updatedAt: at("2026-10-21T10:05:00Z"),
        }),
        // Started by b.
        subagent("b1", { parentNodeId: NodeId.make("b"), startedAt: at("2026-10-21T10:01:00Z") }),
        subagent("c", {
          runId: RunId.make("run-2"),
          status: "failed",
          completedAt: at("2026-10-21T10:02:00Z"),
        }),
        subagent("d", {
          runId: RunId.make("run-2"),
          status: "interrupted",
          completedAt: at("2026-10-21T10:01:00Z"),
        }),
      ],
      runs,
      providerThreads: [],
      turnItems: [
        userMessage("run-1", "Review the diff\nand the tests"),
        userMessage("run-2", "  Fix what they found  "),
      ],
    });

    expect(agents.started).toBe(5);
    expect(agents.running).toBe(2);
    const tree = agents.turns.map((turn) => [
      turn.ordinal,
      turn.label,
      turn.agents.map((row) => [
        row.name,
        row.outcome,
        row.childThreadId,
        row.children.map((child) => child.name),
      ]),
    ]);
    expect(tree).toEqual([
      [
        2,
        "Fix what they found",
        [
          ["Agent c", "failed", "child-c", []],
          ["Agent d", "stopped", "child-d", []],
        ],
      ],
      [
        1,
        "Review the diff",
        [
          // Running first.
          ["Agent a", null, "child-a", []],
          ["Agent b", "done", "child-b", ["Agent b1"]],
        ],
      ],
    ]);
  });

  it("lists workflows apart: running ones, then the done ones newest first", () => {
    const agents = headAgents({
      subagents: [],
      runs,
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
        workflowNotice("notice-2", "2026-10-21T10:04:00Z", "failed"),
      ],
    });
    expect(agents.started).toBe(2);
    expect(agents.running).toBe(1);
    expect(agents.workflows.map(({ name, outcome }) => [name, outcome])).toEqual([
      ["Review the diff", null],
      // A notice that reports several is named by its summary.
      ["Workflow finished", "failed"],
      ["Two agents say hello", "done"],
    ]);
  });
});
