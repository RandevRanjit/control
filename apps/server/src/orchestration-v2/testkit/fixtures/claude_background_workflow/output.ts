import { assert } from "@effect/vitest";
import type { ProviderReplayTranscript } from "@control/contracts";

import type { OrchestratorV2ScenarioResult } from "../../OrchestratorScenario.ts";
import {
  assertBaseProjection,
  assertSemanticProjectionIntegrity,
  assertUserMessagesInclude,
  backgroundNotifications,
  projectionFor,
} from "../shared.ts";
import { CLAUDE_BACKGROUND_WORKFLOW_PROMPT } from "./input.ts";

const WORKFLOW_TASK_ID = "wly7b99gi";

// Claude reports a Workflow as a local_workflow task. Its agents arrive only as
// task_progress entries, so it is one piece of background work: on the roster
// while it runs, and a workflow notification when it ends. Not a subagent.
export function assertClaudeBackgroundWorkflowOutput(
  result: OrchestratorV2ScenarioResult,
  transcript: ProviderReplayTranscript,
) {
  assertBaseProjection({
    result,
    transcript,
    runCount: 2,
    runStatuses: ["completed", "completed"],
  });
  assert.equal(result.projections.size, 1, "A workflow must not create child app threads");
  const projection = projectionFor(result, transcript.scenario);
  assertSemanticProjectionIntegrity(projection);
  assertUserMessagesInclude(projection, [CLAUDE_BACKGROUND_WORKFLOW_PROMPT]);

  const rosterTasks = result.domainEvents
    .flatMap((event) =>
      event.type === "provider-thread.updated" ? (event.payload.pendingBackgroundTasks ?? []) : [],
    )
    .filter((task) => task.taskId === WORKFLOW_TASK_ID);
  assert.isAbove(rosterTasks.length, 0);
  for (const task of rosterTasks) {
    assert.deepEqual(task, {
      taskId: WORKFLOW_TASK_ID,
      description: "Two agents say hello",
      kind: "workflow",
    });
  }
  assert.deepEqual(projection.providerThreads[0]?.pendingBackgroundTasks ?? [], []);

  assert.deepEqual(backgroundNotifications(projection), [
    {
      summary: 'Workflow "Two agents say hello" finished',
      outcome: "completed",
      source: { kind: "workflow", label: "Two agents say hello" },
    },
  ]);

  const [rootRun, wakeRun] = projection.runs;
  const assistantTexts = (runId: string | undefined) =>
    projection.turnItems.flatMap((item) =>
      item.runId === runId && item.type === "assistant_message" ? [item.text.trim()] : [],
    );
  assert.deepEqual(assistantTexts(rootRun?.id), ["STARTED"]);
  assert.deepEqual(assistantTexts(wakeRun?.id), ["WAKE_DONE"]);

  assert.lengthOf(projection.subagents, 0);
  // The launch is the Workflow tool call, which settles as soon as the run starts.
  assert.deepEqual(
    projection.turnItems.flatMap((item) =>
      item.type === "dynamic_tool" ? [[item.toolName, item.status]] : [],
    ),
    [["Workflow", "completed"]],
  );
}
