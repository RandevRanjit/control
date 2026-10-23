import { assert, describe, it } from "@effect/vitest";
import { CommandId, EventId, MessageId, type ModelSelection } from "@control/contracts";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";
import { ClaudeProviderCapabilitiesV2 } from "../Adapters/ClaudeAdapterV2.ts";
import * as EventSink from "../EventSink.ts";
import * as Orchestrator from "../Orchestrator.ts";
import * as EffectWorker from "../EffectWorker.ts";
import * as ProviderAdapterRegistry from "../ProviderAdapterRegistry.ts";
import { CLAUDE_MODEL_SELECTION, CODEX_MODEL_SELECTION } from "./fixtures/shared.ts";
import * as ProviderReplayHarness from "./ProviderReplayHarness.ts";
import { checkpointWorkspace } from "./ReplayFixtureWorkspace.ts";
import { FULL_PROVIDER_CAPABILITIES } from "./fullProviderCapabilities.ts";
import {
  encodeJson,
  threadId,
  projectId,
  CODEX_DRIVER,
  CLAUDE_DRIVER,
  type CapturedTurn,
  makeTestAdapter,
} from "./ProviderSwitch.testkit.ts";

describe("orchestration v2 provider switching", () => {
  it.live.each(["turn-start", "injection", "large-missed-request"] as const)(
    "recovers %s failure without duplicating history in the same native thread",
    (failure) =>
      Effect.scoped(
        Effect.gen(function* () {
          const cwd = yield* checkpointWorkspace(`handoff-retry-${failure}`);
          const capturedTurns = yield* Ref.make<ReadonlyArray<CapturedTurn>>([]);
          const injectedHistory = yield* Ref.make<ReadonlyArray<unknown>>([]);
          const failOnce = yield* Ref.make(true);
          const generation = yield* Ref.make(0);
          const layerRegistry = ProviderAdapterRegistry.layerFromAdapters([
            makeTestAdapter({
              instanceId: CODEX_MODEL_SELECTION.instanceId,
              driver: CODEX_DRIVER,
              capabilities: FULL_PROVIDER_CAPABILITIES,
              modelSelection: CODEX_MODEL_SELECTION,
              responseByRunOrdinal: { 1: "Original partial work" },
              capturedTurns,
            }),
            makeTestAdapter({
              instanceId: CLAUDE_MODEL_SELECTION.instanceId,
              driver: CLAUDE_DRIVER,
              capabilities: ClaudeProviderCapabilitiesV2,
              modelSelection: CLAUDE_MODEL_SELECTION,
              responseByRunOrdinal: {},
              capturedTurns,
              injectedHistory,
              nativeThreadGeneration: generation,
              getModelContextWindow: () => 32_000,
              ...(failure !== "injection"
                ? { failStartOnce: failOnce }
                : { failInjectionOnce: failOnce }),
            }),
          ]);
          yield* Effect.gen(function* () {
            const orchestrator = yield* Orchestrator.OrchestratorV2;
            const worker = yield* EffectWorker.OrchestrationEffectWorkerV2;
            const dispatch = (ordinal: number, text: string, selection: ModelSelection) =>
              orchestrator.dispatch({
                type: "message.dispatch",
                commandId: CommandId.make(`retry:${ordinal}`),
                threadId,
                messageId: MessageId.make(`retry:${ordinal}`),
                createdBy: "user",
                creationSource: "web",
                text,
                attachments: [],
                modelSelection: selection,
                dispatchMode: { type: "start_immediately" },
              });
            const wait = (ordinal: number, status: "failed" | "completed") =>
              orchestrator.streamStoredEvents.pipe(
                Stream.filter(
                  ({ event }) =>
                    event.type === "run.updated" &&
                    event.payload.ordinal === ordinal &&
                    (event.payload.status === "completed" || event.payload.status === "failed"),
                ),
                Stream.runHead,
                Effect.andThen(worker.drain()),
                Effect.andThen(
                  Effect.gen(function* () {
                    assert.equal(
                      (yield* orchestrator.getThreadProjection(threadId)).runs.at(-1)?.status,
                      status,
                    );
                  }),
                ),
              );
            yield* orchestrator.dispatch({
              type: "thread.create",
              commandId: CommandId.make("retry:create"),
              threadId,
              projectId,
              createdBy: "user",
              creationSource: "web",
              title: "Handoff retry",
              modelSelection: CODEX_MODEL_SELECTION,
              runtimeMode: "full-access",
              interactionMode: "default",
              branch: null,
              worktreePath: null,
            });
            yield* dispatch(1, "Original request with constraints", CODEX_MODEL_SELECTION);
            yield* wait(1, "completed");
            yield* dispatch(
              2,
              failure === "large-missed-request" ? "x".repeat(7_000) : "First target request",
              CLAUDE_MODEL_SELECTION,
            );
            yield* wait(2, "failed");
            const failed = yield* orchestrator.getThreadProjection(threadId);
            const failedHandoff = failed.contextHandoffs.at(-1)!;
            assert.equal(
              failedHandoff.delivery?.status,
              failure !== "injection" ? "injected" : "pending",
            );
            const historyBeforeRetry = (yield* Ref.get(injectedHistory)).length;
            const retryText =
              failure === "large-missed-request" ? "y".repeat(10_000) : "Retry target request";
            yield* dispatch(3, retryText, CLAUDE_MODEL_SELECTION);
            yield* wait(3, "completed");
            const retried = yield* orchestrator.getThreadProjection(threadId);
            const lastTurn = (yield* Ref.get(capturedTurns)).at(-1)!;
            assert.equal(lastTurn.text, retryText);
            if (failure !== "injection") {
              const delta = yield* encodeJson(
                (yield* Ref.get(injectedHistory)).slice(historyBeforeRetry),
              );
              if (failure === "large-missed-request") {
                assert.include(delta, "omitted 1 items");
                const missedRequest = retried.turnItems.find(
                  (item) => item.type === "user_message" && item.text === "x".repeat(7_000),
                )!;
                const delivery = retried.contextHandoffs.at(-1)!.delivery!;
                assert.include(delivery.omittedItemIds ?? [], missedRequest.id);
                assert.notInclude(delivery.itemIds, missedRequest.id);
              } else assert.include(delta, "First target request");
              assert.notInclude(delta, "Original request with constraints");
              assert.notInclude(delta, "Original partial work");
              assert.equal(yield* Ref.get(generation), 1);
            } else {
              assert.equal(yield* Ref.get(generation), 2);
              assert.notEqual(
                retried.contextHandoffs.at(-1)?.delivery?.nativeThreadId,
                failedHandoff.delivery?.nativeThreadId,
              );
              const newHistory = yield* encodeJson(
                (yield* Ref.get(injectedHistory)).slice(historyBeforeRetry),
              );
              assert.include(newHistory, "Original request with constraints");
              assert.include(newHistory, "Original partial work");
              assert.notInclude(newHistory, "Retry target request");
            }
            const beforeFollowup = yield* Ref.get(injectedHistory);
            const followup = "z".repeat(6_000);
            yield* dispatch(4, followup, CLAUDE_MODEL_SELECTION);
            yield* wait(4, "completed");
            assert.equal((yield* Ref.get(capturedTurns)).at(-1)!.text, followup);
            assert.deepEqual(yield* Ref.get(injectedHistory), beforeFollowup);
            assert.equal(
              (yield* orchestrator.getThreadProjection(threadId)).contextHandoffs.length,
              retried.contextHandoffs.length,
            );
          }).pipe(
            Effect.provide(
              ProviderReplayHarness.layerWithRegistry(
                {
                  name: `handoff-retry-${failure}`,
                  runtimePolicyOverride: {
                    cwd,
                    approvalPolicy: "never",
                    sandboxPolicy: { type: "readOnly" },
                  },
                },
                layerRegistry,
              ),
            ),
          );
        }),
      ),
  );

  it.live.each(["native", "legacy"] as const)(
    "starts a replacement native thread as new after the resume fallback with %s attempts",
    (attempts) =>
      Effect.scoped(
        Effect.gen(function* () {
          const cwd = yield* checkpointWorkspace("resume-fallback-native-turns");
          const capturedTurns = yield* Ref.make<ReadonlyArray<CapturedTurn>>([]);
          const failResumeOnce = yield* Ref.make(false);
          const generation = yield* Ref.make(0);
          const layerRegistry = ProviderAdapterRegistry.layerFromAdapters([
            makeTestAdapter({
              instanceId: CLAUDE_MODEL_SELECTION.instanceId,
              driver: CLAUDE_DRIVER,
              capabilities: ClaudeProviderCapabilitiesV2,
              modelSelection: CLAUDE_MODEL_SELECTION,
              responseByRunOrdinal: {},
              capturedTurns,
              failResumeOnce,
              nativeThreadGeneration: generation,
            }),
          ]);
          yield* Effect.gen(function* () {
            const orchestrator = yield* Orchestrator.OrchestratorV2;
            const worker = yield* EffectWorker.OrchestrationEffectWorkerV2;
            const runToCompletion = Effect.fn("runToCompletion")(function* (ordinal: number) {
              yield* orchestrator.dispatch({
                type: "message.dispatch",
                commandId: CommandId.make(`resume-fallback:${ordinal}`),
                threadId,
                messageId: MessageId.make(`resume-fallback:${ordinal}`),
                createdBy: "user",
                creationSource: "web",
                text: `Request ${ordinal}`,
                attachments: [],
                modelSelection: CLAUDE_MODEL_SELECTION,
                dispatchMode: { type: "start_immediately" },
              });
              yield* orchestrator.streamStoredEvents.pipe(
                Stream.filter(
                  ({ event }) =>
                    event.type === "run.updated" &&
                    event.payload.ordinal === ordinal &&
                    (event.payload.status === "completed" || event.payload.status === "failed"),
                ),
                Stream.runHead,
              );
              yield* worker.drain();
              assert.equal(
                (yield* orchestrator.getThreadProjection(threadId)).runs.at(-1)?.status,
                "completed",
              );
            });
            yield* orchestrator.dispatch({
              type: "thread.create",
              commandId: CommandId.make("resume-fallback:create"),
              threadId,
              projectId,
              createdBy: "user",
              creationSource: "web",
              title: "Resume fallback",
              modelSelection: CLAUDE_MODEL_SELECTION,
              runtimeMode: "full-access",
              interactionMode: "default",
              branch: null,
              worktreePath: null,
            });
            yield* runToCompletion(1);
            // A detached session resumes on the next turn, as after a restart.
            const providerThread = (yield* orchestrator.getThreadProjection(
              threadId,
            )).providerThreads.at(0);
            if (providerThread === undefined || providerThread.providerSessionId === null) {
              return yield* Effect.die("Expected a provider session after the first turn.");
            }
            yield* orchestrator.dispatch({
              type: "provider-session.detach",
              commandId: CommandId.make("resume-fallback:detach"),
              threadId,
              providerSessionId: providerThread.providerSessionId,
            });
            yield* worker.drain();
            if (attempts === "legacy") {
              // Attempts persisted before native identity existed carry no native id.
              const existing = yield* orchestrator.getThreadProjection(threadId);
              yield* (yield* EventSink.EventSinkV2).write({
                events: existing.attempts.map(
                  ({ nativeThreadId: _nativeThreadId, ...legacy }, index) => ({
                    id: EventId.make(`resume-fallback-legacy-attempt:${index}`),
                    type: "run-attempt.updated" as const,
                    threadId,
                    occurredAt: existing.thread.createdAt,
                    payload: legacy,
                  }),
                ),
              });
            }
            yield* Ref.set(failResumeOnce, true);
            yield* runToCompletion(2);
            yield* runToCompletion(3);

            const turns = yield* Ref.get(capturedTurns);
            assert.equal(turns.length, 3);
            assert.equal(yield* Ref.get(generation), 2);
            // The fallback binds a new native thread to a provider thread that
            // already has a turn, so the provider must not resume it.
            assert.notEqual(turns[1]?.nativeThreadId, turns[0]?.nativeThreadId);
            assert.isAbove(turns[1]?.providerTurnOrdinal ?? 0, 1);
            assert.isFalse(turns[1]?.nativeThreadHasTurns);
            assert.equal(turns[2]?.nativeThreadId, turns[1]?.nativeThreadId);
            assert.isTrue(turns[2]?.nativeThreadHasTurns);
          }).pipe(
            Effect.provide(
              ProviderReplayHarness.layerWithRegistry(
                {
                  name: "resume-fallback-native-turns",
                  runtimePolicyOverride: {
                    cwd,
                    approvalPolicy: "never",
                    sandboxPolicy: { type: "readOnly" },
                  },
                },
                layerRegistry,
              ),
            ),
          );
        }),
      ),
  );

  it.live("keeps the native session after turns refused before reaching the provider", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const cwd = yield* checkpointWorkspace("refused-start-keeps-native");
        const capturedTurns = yield* Ref.make<ReadonlyArray<CapturedTurn>>([]);
        const refuseStarts = yield* Ref.make(0);
        const generation = yield* Ref.make(0);
        const registry = ProviderAdapterRegistry.layerFromAdapters([
          makeTestAdapter({
            instanceId: CLAUDE_MODEL_SELECTION.instanceId,
            driver: CLAUDE_DRIVER,
            capabilities: ClaudeProviderCapabilitiesV2,
            modelSelection: CLAUDE_MODEL_SELECTION,
            responseByRunOrdinal: {},
            capturedTurns,
            refuseStarts,
            nativeThreadGeneration: generation,
          }),
        ]);
        yield* Effect.gen(function* () {
          const orchestrator = yield* Orchestrator.OrchestratorV2;
          const worker = yield* EffectWorker.OrchestrationEffectWorkerV2;
          const run = Effect.fn("run")(function* (ordinal: number) {
            yield* orchestrator.dispatch({
              type: "message.dispatch",
              commandId: CommandId.make(`refused-start:${ordinal}`),
              threadId,
              messageId: MessageId.make(`refused-start:${ordinal}`),
              createdBy: "user",
              creationSource: "web",
              text: `Request ${ordinal}`,
              attachments: [],
              modelSelection: CLAUDE_MODEL_SELECTION,
              dispatchMode: { type: "start_immediately" },
            });
            yield* orchestrator.streamStoredEvents.pipe(
              Stream.filter(
                ({ event }) =>
                  event.type === "run.updated" &&
                  event.payload.ordinal === ordinal &&
                  (event.payload.status === "completed" || event.payload.status === "failed"),
              ),
              Stream.runHead,
            );
            yield* worker.drain();
            return (yield* orchestrator.getThreadProjection(threadId)).runs.at(-1)?.status;
          });
          yield* orchestrator.dispatch({
            type: "thread.create",
            commandId: CommandId.make("refused-start:create"),
            threadId,
            projectId,
            createdBy: "user",
            creationSource: "web",
            title: "Refused start",
            modelSelection: CLAUDE_MODEL_SELECTION,
            runtimeMode: "full-access",
            interactionMode: "default",
            branch: null,
            worktreePath: null,
          });
          assert.equal(yield* run(1), "completed");
          // Run 3 carries run 2's missed request as a handoff and is refused too.
          yield* Ref.set(refuseStarts, 2);
          assert.equal(yield* run(2), "failed");
          assert.equal(yield* run(3), "failed");
          assert.equal(yield* run(4), "completed");

          const turns = yield* Ref.get(capturedTurns);
          assert.equal(turns.length, 2);
          // Nothing reached the provider, so the next turn continues the same
          // native session instead of replacing it with a summary.
          assert.equal(yield* Ref.get(generation), 1);
          assert.equal(turns[1]?.nativeThreadId, turns[0]?.nativeThreadId);
          assert.include(turns[1]?.text, "Request 2");
          assert.include(turns[1]?.text, "Request 3");
        }).pipe(
          Effect.provide(
            ProviderReplayHarness.layerWithRegistry(
              {
                name: "refused-start-keeps-native",
                runtimePolicyOverride: {
                  cwd,
                  approvalPolicy: "never",
                  sandboxPolicy: { type: "readOnly" },
                },
              },
              registry,
            ),
          ),
        );
      }),
    ),
  );

  it.live.each(
    (["failed", "interrupted"] as const).flatMap((status) =>
      [false, true].flatMap((queued) =>
        [false, true].flatMap((returning) =>
          [false, true].map(
            (native) =>
              [
                `${status} context ${queued ? "through the queue" : "immediately"} to ${returning ? "a returning" : "a new"} provider via ${native ? "native history" : "text"}`,
                { status, queued, returning, native },
              ] as const,
          ),
        ),
      ),
    ),
  )("hands off %s", ([, { status, queued, returning, native }]) =>
    Effect.scoped(
      Effect.gen(function* () {
        const cwd = yield* checkpointWorkspace(`handoff-${status}-${queued}-${returning}`);
        const capturedTurns = yield* Ref.make<ReadonlyArray<CapturedTurn>>([]);
        const injectedHistory = yield* Ref.make<ReadonlyArray<unknown>>([]);
        const started = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        const sourceOrdinal = returning ? 2 : 1;
        const sourceSelection = returning ? CLAUDE_MODEL_SELECTION : CODEX_MODEL_SELECTION;
        const targetSelection = returning ? CODEX_MODEL_SELECTION : CLAUDE_MODEL_SELECTION;
        const originalPrompt = "Keep the release marker violet and preserve the existing API.";
        const partialResponse = "I checked the API and found the release configuration.";
        const layerRegistry = ProviderAdapterRegistry.layerFromAdapters(
          (
            [
              [CODEX_MODEL_SELECTION, CODEX_DRIVER, FULL_PROVIDER_CAPABILITIES],
              [CLAUDE_MODEL_SELECTION, CLAUDE_DRIVER, ClaudeProviderCapabilitiesV2],
            ] as const
          ).map(([modelSelection, driver, capabilities]) =>
            makeTestAdapter({
              instanceId: modelSelection.instanceId,
              driver,
              capabilities,
              modelSelection,
              responseByRunOrdinal: { [sourceOrdinal]: partialResponse },
              capturedTurns,
              ...(native && modelSelection.instanceId === targetSelection.instanceId
                ? { injectedHistory }
                : {}),
              ...(modelSelection.instanceId === sourceSelection.instanceId
                ? {
                    failedRunOrdinals: new Set(status === "failed" ? [sourceOrdinal] : []),
                    interruptedRunOrdinals: new Set(
                      status === "interrupted" ? [sourceOrdinal] : [],
                    ),
                    holdRunOrdinal: sourceOrdinal,
                    holdFirstTurn: started,
                    releaseFirstTurn: release,
                  }
                : {}),
            }),
          ),
        );
        yield* Effect.gen(function* () {
          const orchestrator = yield* Orchestrator.OrchestratorV2;
          const worker = yield* EffectWorker.OrchestrationEffectWorkerV2;
          const waitForRun = (
            ordinal: number,
            expectedStatus: "completed" | "failed" | "interrupted",
          ) =>
            orchestrator.streamStoredEvents.pipe(
              Stream.filter(
                ({ event }) =>
                  event.type === "run.updated" &&
                  event.threadId === threadId &&
                  event.payload.ordinal === ordinal &&
                  event.payload.status === expectedStatus,
              ),
              Stream.runHead,
              Effect.andThen(worker.drain()),
            );
          const dispatch = (
            key: string,
            text: string,
            modelSelection: ModelSelection,
            queue = false,
          ) =>
            orchestrator.dispatch({
              type: "message.dispatch",
              commandId: CommandId.make(`command:handoff:${key}`),
              threadId,
              messageId: MessageId.make(`message:handoff:${key}`),
              createdBy: "user",
              creationSource: "web",
              text,
              attachments: [],
              modelSelection,
              dispatchMode: { type: queue ? "queue_after_active" : "start_immediately" },
            });
          yield* orchestrator.dispatch({
            type: "thread.create",
            commandId: CommandId.make("command:handoff:create"),
            threadId,
            projectId,
            createdBy: "user",
            creationSource: "web",
            title: "Interrupted provider handoff",
            modelSelection: CODEX_MODEL_SELECTION,
            runtimeMode: "full-access",
            interactionMode: "default",
            branch: null,
            worktreePath: null,
          });
          if (returning) {
            yield* dispatch("initial", "Earlier successful request.", CODEX_MODEL_SELECTION);
            yield* waitForRun(1, "completed");
          }
          yield* dispatch("source", originalPrompt, sourceSelection);
          yield* Deferred.await(started);
          if (queued) {
            yield* dispatch("target", "Continue", targetSelection, true);
            assert.equal(
              (yield* orchestrator.getThreadProjection(threadId)).runs.at(-1)?.status,
              "queued",
            );
          }
          yield* Deferred.succeed(release, undefined);
          yield* waitForRun(sourceOrdinal, status);
          if (!queued) {
            yield* dispatch("target", "Continue", targetSelection);
          }
          yield* waitForRun(sourceOrdinal + 1, "completed");
          const projection = yield* orchestrator.getThreadProjection(threadId);
          const targetRun = projection.runs.at(-1)!;
          const handoff = projection.contextHandoffs.find(
            (candidate) => candidate.id === targetRun.contextHandoffId,
          );
          assert.isDefined(handoff);
          assert.equal(
            handoff?.strategy,
            returning ? "delta_since_target_last_seen" : "full_thread_summary",
          );
          assert.deepEqual(handoff?.coveredRunOrdinals, {
            from: sourceOrdinal,
            to: sourceOrdinal,
          });
          const delivered = (yield* Ref.get(capturedTurns)).at(-1)!;
          const history = yield* Ref.get(injectedHistory);
          const deliveredHistory = native ? yield* encodeJson(history) : delivered.text;
          assert.include(deliveredHistory, originalPrompt);
          assert.include(deliveredHistory, partialResponse);
          assert.include(deliveredHistory, `run-status=${status}`);
          if (native) {
            assert.equal(delivered.text, "Continue");
            assert.notInclude(deliveredHistory, '"text":"Continue"');
            assert.include(deliveredHistory, '"role":"assistant"');
            assert.include(deliveredHistory, '"role":"user"');
            assert.equal(handoff?.delivery?.status, "injected");
          } else {
            assert.include(delivered.text, "User message:\nContinue");
            assert.equal(handoff?.delivery?.status, "inline");
          }
          assert.notInclude(deliveredHistory, "Earlier successful request.");
          // The returning source already has its own failed/interrupted native turn.
          yield* dispatch("back", "Finish the remaining work", sourceSelection);
          yield* waitForRun(sourceOrdinal + 2, "completed");
          const back = (yield* Ref.get(capturedTurns)).at(-1)!;
          assert.notInclude(back.text, originalPrompt);
          assert.notInclude(back.text, partialResponse);
        }).pipe(
          Effect.provide(
            ProviderReplayHarness.layerWithRegistry(
              {
                name: `handoff-${status}-${queued}-${returning}`,
                runtimePolicyOverride: {
                  cwd,
                  approvalPolicy: "never",
                  sandboxPolicy: {
                    type: "readOnly",
                    access: { type: "fullAccess" },
                    networkAccess: false,
                  },
                },
              },
              layerRegistry,
            ),
          ),
        );
      }),
    ),
  );
});
