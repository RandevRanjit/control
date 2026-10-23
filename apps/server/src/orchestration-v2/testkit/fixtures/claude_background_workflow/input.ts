import { claudeBackgroundWakeResultLabel } from "../../../Adapters/ClaudeAdapterV2.testkit.ts";
import type { OrchestratorFixtureInput } from "../shared.ts";

const CLAUDE_BACKGROUND_WORKFLOW_SCRIPT = [
  "export const meta = { name: 'tiny-check', description: 'Two agents say hello', phases: [{ title: 'Hello' }] }",
  "const [a, b] = await parallel([() => agent('Say hello A', { label: 'hello:a', phase: 'Hello' }), () => agent('Say hello B', { label: 'hello:b', phase: 'Hello' })])",
  "return { a, b }",
].join("\n");

export const CLAUDE_BACKGROUND_WORKFLOW_PROMPT = [
  "Live-test a background Workflow wake. You must call the Workflow tool before replying. Do exactly this, with no extra steps.",
  "",
  "1) Call the Workflow tool with this exact script:",
  CLAUDE_BACKGROUND_WORKFLOW_SCRIPT,
  "2) After that tool call returns, reply with exactly STARTED and stop. Do not poll or wait for it.",
  "3) When its completion is reported later, reply with exactly WAKE_DONE and stop.",
].join("\n");

// Same shape as claude_background_task_wake: the workflow ends after the root
// turn settled, and that end wakes Claude.
export function claudeBackgroundWorkflowInput(): OrchestratorFixtureInput {
  return {
    steps: [
      { type: "message", text: CLAUDE_BACKGROUND_WORKFLOW_PROMPT },
      {
        type: "await_run_status",
        targetRunIndex: 2,
        status: "running",
        waitForTurnItemType: "assistant_message",
      },
      { type: "release_replay_gate", label: claudeBackgroundWakeResultLabel(1) },
      { type: "await_run_status", targetRunIndex: 2, status: "completed" },
    ],
  };
}
