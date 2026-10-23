import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { ProviderDriverKind } from "@control/contracts";

import {
  ClaudeOrchestratorReplayHarness,
  makeClaudeRestartReplayHarness,
} from "../Adapters/ClaudeAdapterV2.testkit.ts";
import * as IdAllocator from "../IdAllocator.ts";
import * as SqlitePersistence from "../../persistence/Sqlite.ts";
import { provideDeterministicTestRuntime } from "./DeterministicRuntime.ts";
import {
  CLAUDE_MODEL_SELECTION,
  materializeFixtureInput,
  type MaterializedOrchestratorFixtureInput,
} from "./fixtures/shared.ts";
import { assertSemanticProjectionIntegrity, projectionFor } from "./fixtures/shared.ts";
import { runOrchestratorV2ProviderReplayScenario } from "./ProviderReplayHarness.ts";
import { checkpointWorkspace } from "./ReplayFixtureWorkspace.ts";
import { readProviderReplayTranscript } from "./ReplayTranscriptNdjson.ts";

const readRawTranscript = Effect.fn("readRecoveryTranscript")(function* (file: URL) {
  return yield* readProviderReplayTranscript(file);
});
const decodePromptPair = Schema.decodeUnknownEffect(Schema.Tuple([Schema.String, Schema.String]));
const readClaudeSubagentResumeTranscript = Effect.fn("readClaudeSubagentResumeTranscript")(
  function* () {
    return yield* ClaudeOrchestratorReplayHarness.decodeTranscript(
      yield* readRawTranscript(
        new URL(
          "./fixtures/claude_subagent_resume_after_restart/claude_transcript.ndjson",
          import.meta.url,
        ),
      ),
    );
  },
);
function splitAfterFirstIdle(materialized: MaterializedOrchestratorFixtureInput) {
  const splitIndex = materialized.steps.findIndex((step) => step.type === "await_thread_idle");
  if (splitIndex < 0) {
    throw new Error("Expected fixture to contain await_thread_idle after the first turn.");
  }

  const phase1Steps = materialized.steps.slice(0, splitIndex + 1);
  const phase2Steps = materialized.steps.slice(splitIndex + 1);
  return {
    phase1Steps,
    phase2Steps,
    phase1Commands: phase1Steps.flatMap((step) => (step.type === "dispatch" ? [step.command] : [])),
    phase2Commands: phase2Steps.flatMap((step) => (step.type === "dispatch" ? [step.command] : [])),
  };
}

describe("orchestrator replay recovery", () => {
  it.effect("keeps a Claude subagent resumed after a server restart in its own thread", () =>
    Effect.scoped(
      Effect.gen(function* () {
        // The math.ts subagent from thread 42e302f0 (2026-09-25): launched,
        // finished, then resumed by SendMessage after the server restarted.
        const transcript = yield* readClaudeSubagentResumeTranscript();
        const [launchPrompt, resumePrompt] = yield* decodePromptPair(transcript.metadata?.prompts);
        const workspace = yield* checkpointWorkspace(transcript.scenario);
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const tempDir = yield* Effect.acquireRelease(
          fs.makeTempDirectory({ prefix: "control-orchestration-v2-claude-recovery-" }),
          (directory) => fs.remove(directory, { recursive: true, force: true }).pipe(Effect.orDie),
        );
        const materialized = yield* materializeFixtureInput({
          scenario: transcript.scenario,
          fixtureInput: {
            steps: [
              { type: "message", text: launchPrompt },
              { type: "message", text: resumePrompt },
            ],
          },
          driver: ProviderDriverKind.make("claudeAgent"),
          modelSelection: CLAUDE_MODEL_SELECTION,
        });
        const { phase1Commands, phase1Steps, phase2Commands, phase2Steps } =
          splitAfterFirstIdle(materialized);
        const { harness, assertComplete } = makeClaudeRestartReplayHarness(transcript);
        const options = {
          databaseLayer: SqlitePersistence.layerFromPath(path.join(tempDir, "state.sqlite")).pipe(
            Layer.provide(NodeServices.layer),
          ),
        };

        yield* Effect.scoped(
          runOrchestratorV2ProviderReplayScenario(
            {
              name: `${transcript.scenario}:first-runtime`,
              transcript,
              commands: phase1Commands,
              steps: phase1Steps,
              projectionThreadIds: materialized.projectionThreadIds,
              runtimePolicyOverride: { cwd: workspace },
            },
            harness,
            options,
          ),
        );
        const result = yield* Effect.scoped(
          runOrchestratorV2ProviderReplayScenario(
            {
              name: `${transcript.scenario}:second-runtime`,
              transcript,
              commands: phase2Commands,
              steps: phase2Steps,
              projectionThreadIds: materialized.projectionThreadIds,
              runtimePolicyOverride: { cwd: workspace },
            },
            harness,
            options,
          ),
        );
        yield* assertComplete;

        const projection = projectionFor(result, transcript.scenario);
        assertSemanticProjectionIntegrity(projection);
        assert.lengthOf(projection.subagents, 1);
        const subagent = projection.subagents[0];
        assert.equal(subagent?.status, "completed");
        const childThreads = [...result.projections.values()].filter(
          (candidate) => candidate.thread.lineage.parentThreadId === projection.thread.id,
        );
        assert.lengthOf(childThreads, 1);
        const child = childThreads[0];
        assert.equal(child?.thread.id, subagent?.childThreadId);

        const conversation = (child?.turnItems ?? [])
          .toSorted((left, right) => left.ordinal - right.ordinal)
          .flatMap((item) =>
            item.type === "user_message" || item.type === "assistant_message"
              ? [`${item.type === "user_message" ? "user" : "assistant"}:${item.text}`]
              : [],
          );
        const launchTask = conversation[0];
        assert.deepEqual(
          conversation.map((entry) => entry.slice(0, entry.indexOf(":"))),
          ["user", "assistant", "user", "assistant"],
        );
        assert.include(launchTask, "Your job is just the file");
        assert.include(conversation[1], "is 1 line long");
        assert.include(conversation[2], "Look again at");
        assert.include(conversation[3], "Bug/edge case found and fixed");
        // The resumed run's own tool calls land in the child thread too.
        const childCommands = (child?.turnItems ?? []).filter(
          (item) => item.type === "command_execution",
        );
        assert.lengthOf(childCommands, 3);
        assert.isFalse(
          projection.turnItems.some(
            (item) =>
              item.type === "assistant_message" && item.text.includes("Bug/edge case found"),
          ),
          "the resumed subagent's reply leaked into the parent thread",
        );
      }).pipe(
        provideDeterministicTestRuntime,
        Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer)),
      ),
    ),
  );
});
