import { vi } from "vite-plus/test";
import { historyResponseItems } from "../ContextHandoffBudget.ts";
import { assert } from "@effect/vitest";
import {
  CommandId,
  type ChatAttachment,
  EventId,
  MessageId,
  type ModelSelection,
  type OrchestrationV2ProviderCapabilities,
  type OrchestrationV2ProviderSession,
  type OrchestrationV2ProviderThread,
  type OrchestrationV2ProviderTurnTokenUsage,
  ProjectId,
  ProviderInstanceId,
  ProviderThreadId,
  ProviderTurnId,
  ThreadId,
  TurnItemId,
  ProviderDriverKind,
} from "@control/contracts";
import { modelSelectionsEqual } from "@control/shared/model";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as PubSub from "effect/PubSub";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";
import * as Schema from "effect/Schema";
import {
  ClaudeBackgroundWorkBlocksQueryReplacementError,
  ClaudeProviderCapabilitiesV2,
} from "../Adapters/ClaudeAdapterV2.ts";
import * as EventSink from "../EventSink.ts";
import * as Orchestrator from "../Orchestrator.ts";
import * as EffectWorker from "../EffectWorker.ts";
import {
  type ProviderAdapterV2Event,
  type ProviderAdapterV2HistoricalContext,
  ProviderAdapterProtocolError,
  ProviderAdapterTurnStartError,
  type ProviderAdapterV2Shape,
  type ProviderAdapterV2SessionRuntime,
} from "../ProviderAdapter.ts";
import * as ProviderAdapterRegistry from "../ProviderAdapterRegistry.ts";
import { makeProviderFailure } from "../ProviderFailure.ts";
import { CLAUDE_MODEL_SELECTION, CODEX_MODEL_SELECTION } from "./fixtures/shared.ts";
import * as ProviderReplayHarness from "./ProviderReplayHarness.ts";
import { checkpointWorkspace } from "./ReplayFixtureWorkspace.ts";
import { FULL_PROVIDER_CAPABILITIES } from "./fullProviderCapabilities.ts";

export const encodeJson = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));

/** Context usage stays valid across a reasoning-effort change, as a native session reports it. */
function canReuseContextUsageIgnoringEffort(previous: ModelSelection, next: ModelSelection) {
  const withoutEffort = (selection: ModelSelection) => ({
    ...selection,
    options: (selection.options ?? []).filter((option) => option.id !== "reasoningEffort"),
  });
  return modelSelectionsEqual(withoutEffort(previous), withoutEffort(next));
}

export const threadId = ThreadId.make("thread:provider-switch");
export const projectId = ProjectId.make("project:provider-switch");
export const firstPrompt = "Respond with exactly: codex before switch";
export const claudePrompt = "Respond with exactly: claude switched response";
export const returnPrompt = "Respond with exactly: codex after return";
export const CODEX_DRIVER = ProviderDriverKind.make("codex");
export const CLAUDE_DRIVER = ProviderDriverKind.make("claudeAgent");

export interface CapturedTurn {
  readonly driver: ProviderDriverKind;
  readonly threadId: ThreadId;
  readonly providerThreadId: ProviderThreadId;
  readonly text: string;
  readonly attachments: ReadonlyArray<ChatAttachment>;
  readonly nativeThreadId?: string | null;
  readonly providerTurnOrdinal?: number;
  readonly nativeThreadHasTurns?: boolean;
}

function unimplemented(driver: ProviderDriverKind, detail: string) {
  return Effect.fail(new ProviderAdapterProtocolError({ driver, detail }));
}

export function makeTestAdapter(input: {
  readonly instanceId: ProviderInstanceId;
  readonly driver: ProviderDriverKind;
  readonly capabilities: OrchestrationV2ProviderCapabilities;
  readonly modelSelection: ModelSelection;
  readonly responseByRunOrdinal: Readonly<Record<number, string>>;
  readonly responseByThreadId?: Readonly<Record<string, Readonly<Record<number, string>>>>;
  readonly capturedTurns: Ref.Ref<ReadonlyArray<CapturedTurn>>;
  readonly injectedHistory?: Ref.Ref<ReadonlyArray<unknown>>;
  readonly failStartOnce?: Ref.Ref<boolean>;
  /** Starts left to refuse the way Claude does while background work runs. */
  readonly refuseStarts?: Ref.Ref<number>;
  readonly failInjectionOnce?: Ref.Ref<boolean>;
  readonly nativeThreadGeneration?: Ref.Ref<number>;
  readonly failResume?: boolean;
  readonly failResumeOnce?: Ref.Ref<boolean>;
  readonly initialContextUsage?: OrchestrationV2ProviderThread["contextUsage"];
  readonly getModelContextWindow?: (selection: ModelSelection) => number | undefined;
  readonly canReuseContextUsage?: ProviderAdapterV2SessionRuntime["canReuseContextUsage"];
  readonly tokenUsageByRunOrdinal?: Readonly<
    Record<number, Omit<OrchestrationV2ProviderTurnTokenUsage, "updatedAt">>
  >;
  readonly failedRunOrdinals?: ReadonlySet<number>;
  readonly interruptedRunOrdinals?: ReadonlySet<number>;
  readonly holdRunOrdinal?: number;
  readonly holdFirstTurn?: Deferred.Deferred<void>;
  readonly releaseFirstTurn?: Deferred.Deferred<void>;
}): ProviderAdapterV2Shape {
  return {
    instanceId: input.instanceId,
    driver: input.driver,
    getCapabilities: () => Effect.succeed(input.capabilities),
    planSelectionTransition: () => Effect.succeed({ type: "apply_on_next_turn" }),
    openSession: (sessionInput) =>
      Effect.gen(function* () {
        const events = yield* PubSub.unbounded<ProviderAdapterV2Event>();
        const now = yield* DateTime.now;
        const providerSession: OrchestrationV2ProviderSession = {
          id: sessionInput.providerSessionId,
          driver: input.driver,
          providerInstanceId: input.instanceId,
          status: "ready",
          cwd: sessionInput.runtimePolicy.cwd ?? process.cwd(),
          model: input.modelSelection.model,
          capabilities: input.capabilities,
          createdAt: now,
          updatedAt: now,
          lastError: null,
        };

        const runtime: ProviderAdapterV2SessionRuntime = {
          instanceId: input.instanceId,
          driver: input.driver,
          providerSessionId: sessionInput.providerSessionId,
          providerSession,
          events: Stream.fromPubSub(events),
          ...(input.getModelContextWindow === undefined
            ? {}
            : { getModelContextWindow: input.getModelContextWindow }),
          ...(input.canReuseContextUsage === undefined
            ? {}
            : { canReuseContextUsage: input.canReuseContextUsage }),
          ensureThread: (threadInput) =>
            Effect.gen(function* () {
              const createdAt = yield* DateTime.now;
              const generation =
                input.nativeThreadGeneration === undefined
                  ? ""
                  : `:${yield* Ref.getAndUpdate(input.nativeThreadGeneration, (value) => value + 1)}`;
              const nativeThreadId = `${input.driver}:${threadInput.threadId}${generation}`;
              return {
                id: ProviderThreadId.make(`provider-thread:${nativeThreadId}`),
                driver: input.driver,
                providerInstanceId: input.instanceId,
                providerSessionId: sessionInput.providerSessionId,
                appThreadId: threadInput.threadId,
                ownerNodeId: null,
                nativeThreadRef: {
                  driver: input.driver,
                  nativeId: nativeThreadId,
                  strength: "strong",
                },
                nativeConversationHeadRef: null,
                status: "idle",
                firstRunOrdinal: null,
                lastRunOrdinal: null,
                handoffIds: [],
                contextUsage: input.initialContextUsage ?? null,
                forkedFrom: null,
                createdAt,
                updatedAt: createdAt,
              } satisfies OrchestrationV2ProviderThread;
            }),
          resumeThread: ({ providerThread }) =>
            Effect.gen(function* () {
              if (
                input.failResume ||
                (input.failResumeOnce !== undefined &&
                  (yield* Ref.getAndSet(input.failResumeOnce, false)))
              )
                return yield* unimplemented(input.driver, "simulated native resume failure");
              return providerThread;
            }),
          ...(input.injectedHistory === undefined
            ? {}
            : {
                injectHistory: (history: ProviderAdapterV2HistoricalContext) =>
                  Ref.update(input.injectedHistory!, (current) => [
                    ...current,
                    ...historyResponseItems(history.messages, history.context),
                  ]).pipe(
                    Effect.andThen(
                      Effect.gen(function* () {
                        if (
                          input.failInjectionOnce !== undefined &&
                          (yield* Ref.getAndSet(input.failInjectionOnce, false))
                        )
                          return yield* unimplemented(
                            input.driver,
                            "lost injection acknowledgement",
                          );
                        return true;
                      }),
                    ),
                  ),
              }),
          compactThread: (turnInput) => runtime.startTurn(turnInput),
          startTurn: (turnInput) =>
            Effect.gen(function* () {
              if (
                input.failStartOnce !== undefined &&
                (yield* Ref.getAndSet(input.failStartOnce, false))
              )
                return yield* unimplemented(input.driver, "turn start failed after injection");
              if (
                input.refuseStarts !== undefined &&
                (yield* Ref.getAndUpdate(input.refuseStarts, (left) => Math.max(0, left - 1))) > 0
              )
                return yield* new ProviderAdapterTurnStartError({
                  driver: input.driver,
                  threadId: turnInput.threadId,
                  providerThreadId: turnInput.providerThread.id,
                  runId: turnInput.runId,
                  cause: new ClaudeBackgroundWorkBlocksQueryReplacementError(),
                });
              yield* Effect.yieldNow;
              yield* Ref.update(input.capturedTurns, (turns) => [
                ...turns,
                {
                  driver: input.driver,
                  threadId: turnInput.threadId,
                  providerThreadId: turnInput.providerThread.id,
                  text: turnInput.message.text,
                  attachments: turnInput.message.attachments,
                  nativeThreadId: turnInput.providerThread.nativeThreadRef?.nativeId ?? null,
                  providerTurnOrdinal: turnInput.providerTurnOrdinal,
                  ...(turnInput.nativeThreadHasTurns === undefined
                    ? {}
                    : { nativeThreadHasTurns: turnInput.nativeThreadHasTurns }),
                },
              ]);
              if (
                turnInput.runOrdinal === (input.holdRunOrdinal ?? 1) &&
                input.holdFirstTurn !== undefined
              ) {
                yield* Deferred.succeed(input.holdFirstTurn, undefined);
                if (input.releaseFirstTurn === undefined) return;
                yield* Deferred.await(input.releaseFirstTurn);
              }
              const eventTime = yield* DateTime.now;
              const providerTurnId = ProviderTurnId.make(
                `provider-turn:${input.driver}:${turnInput.threadId}:${turnInput.runOrdinal}`,
              );
              const terminalStatus = input.failedRunOrdinals?.has(turnInput.runOrdinal)
                ? "failed"
                : input.interruptedRunOrdinals?.has(turnInput.runOrdinal)
                  ? "interrupted"
                  : "completed";
              const response =
                input.responseByThreadId?.[turnInput.threadId]?.[turnInput.runOrdinal] ??
                input.responseByRunOrdinal[turnInput.runOrdinal] ??
                `${input.driver} response for run ${turnInput.runOrdinal}`;
              const providerEvents: ReadonlyArray<ProviderAdapterV2Event> = [
                {
                  type: "provider_turn.updated",
                  driver: input.driver,
                  providerTurn: {
                    id: providerTurnId,
                    providerThreadId: turnInput.providerThread.id,
                    nodeId: turnInput.rootNodeId,
                    runAttemptId: turnInput.attemptId,
                    nativeTurnRef: {
                      driver: input.driver,
                      nativeId: `native-turn:${turnInput.threadId}:${turnInput.runOrdinal}`,
                      strength: "strong",
                    },
                    ordinal: turnInput.runOrdinal,
                    status: terminalStatus,
                    startedAt: eventTime,
                    completedAt: eventTime,
                  },
                },
                {
                  type: "turn_item.updated",
                  driver: input.driver,
                  turnItem: {
                    id: TurnItemId.make(
                      `turn-item:${input.driver}:${turnInput.threadId}:${turnInput.runOrdinal}:assistant`,
                    ),
                    threadId: turnInput.threadId,
                    runId: turnInput.runId,
                    nodeId: turnInput.rootNodeId,
                    providerThreadId: turnInput.providerThread.id,
                    providerTurnId,
                    nativeItemRef: null,
                    parentItemId: null,
                    ordinal: turnInput.runOrdinal * 100 + 1,
                    status: terminalStatus,
                    title: null,
                    startedAt: eventTime,
                    completedAt: eventTime,
                    updatedAt: eventTime,
                    type: "assistant_message",
                    messageId: MessageId.make(
                      `message:${input.driver}:${turnInput.threadId}:${turnInput.runOrdinal}:assistant`,
                    ),
                    text: response,
                    streaming: false,
                  },
                },
                {
                  type: "turn.terminal",
                  driver: input.driver,
                  providerThreadId: turnInput.providerThread.id,
                  providerTurnId,
                  runOrdinal: turnInput.runOrdinal,
                  ...(terminalStatus === "failed"
                    ? {
                        status: terminalStatus,
                        failureItemOrdinal: turnInput.runOrdinal * 100 + 2,
                        failure: makeProviderFailure({
                          message: "Simulated provider failure.",
                          code: "simulated_failure",
                          class: "provider_error",
                        }),
                      }
                    : { status: terminalStatus, failure: null }),
                  threadDisposition: "reusable",
                },
              ];
              const reportedUsage = input.tokenUsageByRunOrdinal?.[turnInput.runOrdinal];
              const turnEvent = providerEvents[0];
              if (reportedUsage && turnEvent?.type === "provider_turn.updated") {
                yield* PubSub.publish(events, {
                  ...turnEvent,
                  providerTurn: {
                    ...turnEvent.providerTurn,
                    status: "running",
                    completedAt: null,
                    tokenUsage: { ...reportedUsage, updatedAt: DateTime.formatIso(eventTime) },
                  },
                });
              }
              for (const event of providerEvents) {
                yield* PubSub.publish(events, event);
              }
            }),
          steerTurn: () => Effect.void,
          interruptTurn: () => Effect.void,
          respondToRuntimeRequest: () => Effect.void,
          readThreadSnapshot: () =>
            unimplemented(input.driver, "readThreadSnapshot unused in provider switch test"),
          rollbackThread: () =>
            unimplemented(input.driver, "rollbackThread unused in provider switch test"),
          forkThread: () =>
            unimplemented(input.driver, "forkThread unused in provider switch test"),
        };
        return runtime;
      }),
  };
}

export const waitForIdle = Effect.fn("ProviderSwitchTest.waitForIdle")(function* (
  targetThreadId: ThreadId,
) {
  const orchestrator = yield* Orchestrator.OrchestratorV2;
  for (let attempt = 0; attempt < 1_000; attempt += 1) {
    const projection = yield* orchestrator.getThreadProjection(targetThreadId);
    if (
      projection.runs.every(
        (run) => !["queued", "starting", "running", "waiting"].includes(run.status),
      )
    ) {
      return projection;
    }
    yield* Effect.sleep("5 millis");
  }
  return yield* Effect.die(new Error("Provider switch test timed out waiting for idle"));
});

export const handoffScenarios = [
  "compact-native",
  "compact-fallback",
  "compact-legacy",
  "large-current-input",
  "screenshot-native",
  "screenshot-fallback",
  "screenshot-pair-native",
  "screenshot-pair-fallback",
  "screenshot-eight-native",
  "screenshot-eight-fallback",
  "screenshot-large-model-native",
  "screenshot-reported-capacity-native",
  "screenshot-model-change-native",
  "screenshot-option-change-native",
  "screenshot-model-change-retry-native",
  "screenshot-option-change-retry-native",
  "prior-images-reasoning-change-replacement-native",
  "prior-images-reasoning-change-replacement-small-native",
  "prior-images-reasoning-change-native",
  "prior-images-turn-usage-native",
  "prior-images-turn-usage-replacement-native",
  "prior-images-turn-usage-model-change-native",
  "prior-images-turn-usage-option-change-retry-native",
  "prior-images-reasoning-change-retry-native",
  "prior-images-native",
  "prior-images-fallback",
  "imported-prior-images-native",
  "imported-prior-images-fallback",
  "prior-images-telemetry-native",
  "prior-images-unsent-native",
  "prior-images-replacement-native",
  "prior-images-legacy-replacement-native",
  "delivery-write-failure",
] as const;

export const preservesHandoffsThrough = (scenario: (typeof handoffScenarios)[number]) =>
  Effect.scoped(
    Effect.gen(function* () {
      const cwd = yield* checkpointWorkspace(`handoff-${scenario}`);
      const capturedTurns = yield* Ref.make<ReadonlyArray<CapturedTurn>>([]);
      const injectedHistory = yield* Ref.make<ReadonlyArray<unknown>>([]);
      const reasoningScenario = scenario.includes("reasoning-change");
      const turnUsageScenario = reasoningScenario || scenario.includes("turn-usage");
      const modelScenario =
        scenario.includes("model") || scenario.includes("option-change") || reasoningScenario;
      const failStartOnce = yield* Ref.make(false);
      const failResumeOnce = yield* Ref.make(false);
      const generation = yield* Ref.make(0);
      const priorImages = scenario.includes("prior-images");
      const replaceNative = scenario.includes("replacement");
      const capacityScenario = modelScenario || scenario.includes("reported-capacity");
      const returning =
        scenario === "large-current-input" || scenario.includes("-change-") || priorImages;
      const targetSelection: ModelSelection = !modelScenario
        ? CLAUDE_MODEL_SELECTION
        : {
            ...CLAUDE_MODEL_SELECTION,
            ...(reasoningScenario
              ? { options: [{ id: "reasoningEffort", value: "low" }] }
              : scenario.includes("option-change")
                ? { options: [{ id: "contextWindow", value: "1m" }] }
                : { model: `${CLAUDE_MODEL_SELECTION.model}-large` }),
          };
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
          ...(scenario.includes("retry") || scenario.includes("unsent") ? { failStartOnce } : {}),
          ...(replaceNative ? { failResumeOnce, nativeThreadGeneration: generation } : {}),
          ...(scenario.includes("reported-capacity")
            ? { initialContextUsage: { usedTokens: 999_999, maxTokens: 1_000_000 } }
            : {}),
          ...(turnUsageScenario
            ? {
                canReuseContextUsage: canReuseContextUsageIgnoringEffort,
                tokenUsageByRunOrdinal: {
                  2: {
                    usedTokens: replaceNative ? 30_000 : 37_321,
                    maxTokens: replaceNative
                      ? scenario.includes("small")
                        ? 32_000
                        : 64_000
                      : 258_400,
                  },
                },
              }
            : modelScenario
              ? {
                  getModelContextWindow: (selection: ModelSelection) =>
                    selection.model.endsWith("-large") ||
                    selection.options?.some(
                      (option) => option.id === "contextWindow" && option.value === "1m",
                    )
                      ? 1_000_000
                      : 32_000,
                }
              : scenario === "large-current-input" || priorImages
                ? { getModelContextWindow: () => 32_000 }
                : {}),
          ...(scenario.endsWith("-native") || scenario === "large-current-input"
            ? { injectedHistory }
            : {}),
        }),
      ]);
      yield* Effect.gen(function* () {
        const orchestrator = yield* Orchestrator.OrchestratorV2;
        const worker = yield* EffectWorker.OrchestrationEffectWorkerV2;
        const eventSink = yield* EventSink.EventSinkV2;
        const screenshot: ChatAttachment = {
          type: "image",
          id: "screenshot",
          name: "screenshot.png",
          mimeType: "image/png",
          sizeBytes: 100_000,
        };
        const screenshots = Array.from(
          {
            length:
              scenario.includes("eight") || capacityScenario
                ? 8
                : scenario.includes("pair")
                  ? 2
                  : 1,
          },
          (_, index) => ({ ...screenshot, id: `screenshot-${index}` }),
        );
        const targetOrdinal = returning ? 4 : 2;
        const dispatch = (ordinal: number, text: string, selection: ModelSelection) =>
          orchestrator.dispatch({
            type: "message.dispatch",
            commandId: CommandId.make(`regression:${ordinal}`),
            threadId,
            messageId: MessageId.make(`regression:${ordinal}`),
            createdBy: "user",
            creationSource: "web",
            text,
            attachments:
              turnUsageScenario && ordinal === 2
                ? Array.from({ length: 8 }, (_, index) => ({
                    ...screenshot,
                    id: `prior-${index}`,
                  }))
                : turnUsageScenario && ordinal >= targetOrdinal
                  ? [screenshot, { ...screenshot, id: "current-2" }]
                  : scenario.startsWith("screenshot") && ordinal >= targetOrdinal
                    ? screenshots
                    : priorImages && ordinal === (scenario.startsWith("imported") ? 1 : 2)
                      ? [screenshot]
                      : [],
            modelSelection: selection,
            dispatchMode: { type: "start_immediately" },
          });
        const wait = (ordinal: number) =>
          orchestrator.streamStoredEvents.pipe(
            Stream.filter(
              ({ event }) =>
                event.type === "run.updated" &&
                event.payload.ordinal === ordinal &&
                (event.payload.status === "completed" || event.payload.status === "failed"),
            ),
            Stream.runHead,
            Effect.andThen(worker.drain()),
          );
        yield* orchestrator.dispatch({
          type: "thread.create",
          commandId: CommandId.make("regression:create"),
          threadId,
          projectId,
          createdBy: "user",
          creationSource: "web",
          title: "Handoff regression",
          modelSelection: CODEX_MODEL_SELECTION,
          runtimeMode: "full-access",
          interactionMode: "default",
          branch: null,
          worktreePath: null,
        });
        yield* dispatch(1, "Original request with constraints", CODEX_MODEL_SELECTION);
        yield* wait(1);
        const write = eventSink.write;
        const spy =
          scenario === "delivery-write-failure"
            ? vi.spyOn(eventSink, "write").mockImplementation((input) =>
                input.events.some(
                  (event) =>
                    event.type === "context-handoff.updated" &&
                    event.payload.delivery?.status === "inline",
                )
                  ? Effect.fail(
                      new EventSink.EventSinkWriteError({
                        eventCount: input.events.length,
                        cause: "bookkeeping unavailable",
                      }),
                    )
                  : write(input),
              )
            : undefined;
        yield* Effect.addFinalizer(() => Effect.sync(() => spy?.mockRestore()));
        const current = scenario.startsWith("compact")
          ? "/compact"
          : capacityScenario && !turnUsageScenario
            ? "x".repeat(70_000)
            : scenario === "large-current-input"
              ? "x".repeat(9_000)
              : "Continue work";
        // First establish the returning native thread: the current request must
        // not be charged as existing context on the subsequent handoff.
        if (returning) {
          if (scenario.includes("unsent")) yield* Ref.set(failStartOnce, true);
          yield* dispatch(
            2,
            turnUsageScenario ? "x".repeat(27_460) : "Establish target",
            CLAUDE_MODEL_SELECTION,
          );
          yield* wait(2);
          if (modelScenario && !turnUsageScenario) {
            const target = (yield* orchestrator.getThreadProjection(threadId)).providerThreads.find(
              (thread) => thread.providerInstanceId === CLAUDE_MODEL_SELECTION.instanceId,
            )!;
            yield* eventSink.write({
              events: [
                {
                  id: EventId.make("old-model-usage"),
                  type: "provider-thread.updated",
                  threadId,
                  occurredAt: yield* DateTime.now,
                  payload: {
                    ...target,
                    contextUsage: {
                      usedTokens: 30_000,
                      maxTokens: 32_000,
                      autoCompactThreshold: 31_000,
                    },
                  },
                },
              ],
            });
          }
          if (scenario.includes("legacy-replacement")) {
            const existing = yield* orchestrator.getThreadProjection(threadId);
            yield* eventSink.write({
              events: existing.attempts.map(
                ({ nativeThreadId: _nativeThreadId, ...legacy }, index) => ({
                  id: EventId.make(`legacy-attempt:${index}`),
                  type: "run-attempt.updated" as const,
                  threadId,
                  occurredAt: existing.thread.createdAt,
                  payload: legacy,
                }),
              ),
            });
          }
          if (scenario.includes("telemetry")) {
            const target = (yield* orchestrator.getThreadProjection(threadId)).providerThreads.find(
              (thread) => thread.providerInstanceId === CLAUDE_MODEL_SELECTION.instanceId,
            )!;
            yield* eventSink.write({
              events: [
                {
                  id: EventId.make("compacted-context-usage"),
                  type: "provider-thread.updated",
                  threadId,
                  occurredAt: yield* DateTime.now,
                  payload: { ...target, contextUsage: { usedTokens: 100, maxTokens: 32_000 } },
                },
              ],
            });
          }
          yield* dispatch(
            3,
            priorImages && !replaceNative
              ? "New source constraint " + "q".repeat(9_000)
              : "New source constraint",
            CODEX_MODEL_SELECTION,
          );
          yield* wait(3);
        }
        if (replaceNative) {
          const target = (yield* orchestrator.getThreadProjection(threadId)).providerThreads.find(
            (thread) => thread.providerInstanceId === CLAUDE_MODEL_SELECTION.instanceId,
          )!;
          yield* orchestrator.dispatch({
            type: "provider-session.detach",
            commandId: CommandId.make("detach-for-native-replacement"),
            threadId,
            providerSessionId: target.providerSessionId!,
          });
          yield* worker.drain();
          yield* Ref.set(failResumeOnce, true);
        }
        if (scenario.includes("retry")) yield* Ref.set(failStartOnce, true);
        yield* dispatch(targetOrdinal, current, targetSelection);
        yield* wait(targetOrdinal);
        if (scenario.includes("retry")) {
          const failed = yield* orchestrator.getThreadProjection(threadId);
          assert.equal(failed.runs.at(-1)?.status, "failed");
          const failedUsage = failed.providerThreads.find(
            (thread) => thread.providerInstanceId === CLAUDE_MODEL_SELECTION.instanceId,
          )!.contextUsage;
          if (reasoningScenario || scenario.includes("turn-usage")) {
            assert.deepEqual(failedUsage, { usedTokens: 37_321, maxTokens: 258_400 });
          } else {
            assert.deepEqual(failedUsage, { usedTokens: 30_000, maxTokens: 1_000_000 });
          }
          if (reasoningScenario) {
            const target = failed.providerThreads.find(
              (thread) => thread.providerInstanceId === CLAUDE_MODEL_SELECTION.instanceId,
            )!;
            yield* orchestrator.dispatch({
              type: "provider-session.detach",
              commandId: CommandId.make("detach-before-reasoning-retry"),
              threadId,
              providerSessionId: target.providerSessionId!,
            });
            yield* worker.drain();
          }
          yield* dispatch(targetOrdinal + 1, current, targetSelection);
          yield* wait(targetOrdinal + 1);
        }
        if (reasoningScenario && replaceNative) {
          const replaced = yield* orchestrator.getThreadProjection(threadId);
          assert.equal(
            replaced.runs.at(-1)?.status,
            scenario.includes("small") ? "failed" : "completed",
          );
          const target = replaced.providerThreads.find(
            (thread) => thread.providerInstanceId === CLAUDE_MODEL_SELECTION.instanceId,
          )!;
          assert.isNull(target.contextUsage);
          assert.equal(yield* Ref.get(generation), 2);
          assert.equal(
            (yield* Ref.get(capturedTurns)).at(-1)!.driver,
            scenario.includes("small") ? CODEX_DRIVER : CLAUDE_DRIVER,
          );
          return;
        }
        if (replaceNative) {
          if (scenario.includes("legacy-replacement")) {
            const recovered = yield* orchestrator.getThreadProjection(threadId);
            const handoff = recovered.contextHandoffs.at(-1)!;
            const { history: _history, ...legacyHandoff } = handoff;
            yield* eventSink.write({
              events: [
                {
                  id: EventId.make("legacy-replacement-handoff"),
                  type: "context-handoff.updated",
                  threadId,
                  occurredAt: yield* DateTime.now,
                  payload: {
                    ...legacyHandoff,
                    delivery: {
                      nativeThreadId: handoff.delivery!.nativeThreadId,
                      status: handoff.delivery!.status,
                      itemIds: [],
                    },
                  },
                },
              ],
            });
          }
          yield* dispatch(
            targetOrdinal + 1,
            "Continue after native replacement",
            CLAUDE_MODEL_SELECTION,
          );
          yield* wait(targetOrdinal + 1);
          yield* dispatch(
            targetOrdinal + 2,
            "Another source constraint " + "q".repeat(9_000),
            CODEX_MODEL_SELECTION,
          );
          yield* wait(targetOrdinal + 2);
          yield* dispatch(targetOrdinal + 3, current, CLAUDE_MODEL_SELECTION);
          yield* wait(targetOrdinal + 3);
        }
        const projection = yield* orchestrator.getThreadProjection(threadId);
        assert.equal(projection.runs.at(-1)?.status, "completed");
        if (priorImages) {
          const handoff = projection.contextHandoffs.at(-1)!;
          const context = scenario.endsWith("-native")
            ? yield* encodeJson(yield* Ref.get(injectedHistory))
            : (yield* Ref.get(capturedTurns)).at(-1)!.text;
          const shouldFit =
            turnUsageScenario ||
            scenario.startsWith("imported") ||
            scenario.includes("telemetry") ||
            scenario.includes("unsent") ||
            replaceNative;
          const sourceText =
            `${replaceNative ? "Another" : "New"} source constraint ` + "q".repeat(9_000);
          const sourceItem = projection.turnItems.find(
            (item) => item.type === "user_message" && item.text === sourceText,
          )!;
          assert.isDefined(sourceItem);
          if (shouldFit) {
            assert.include(context, sourceText);
            assert.include(
              projection.contextHandoffs
                .filter(
                  (record) =>
                    record.targetRunId ===
                    (scenario.includes("retry")
                      ? projection.runs.find((run) => run.ordinal === targetOrdinal)!.id
                      : projection.runs.at(-1)!.id),
                )
                .flatMap((record) => record.delivery?.itemIds ?? []),
              sourceItem.id,
            );
          } else {
            assert.notInclude(context, "q".repeat(9_000));
            assert.isAbove(handoff.delivery!.omittedItemIds!.length, 0);
          }
          const latestRun = projection.runs.at(-1)!;
          const latestAttempt = projection.attempts.find(
            (attempt) => attempt.id === latestRun.activeAttemptId,
          )!;
          const target = projection.providerThreads.find(
            (thread) => thread.id === latestAttempt.providerThreadId,
          )!;
          assert.equal(latestAttempt.nativeThreadId, target.nativeThreadRef!.nativeId);
          if (turnUsageScenario) {
            if (replaceNative) assert.isNull(target.contextUsage);
            else assert.deepEqual(target.contextUsage, { usedTokens: 37_321, maxTokens: 258_400 });
            assert.lengthOf((yield* Ref.get(capturedTurns)).at(-1)!.attachments, 2);
          }
          if (replaceNative) assert.equal(yield* Ref.get(generation), 2);
          return;
        }
        const handoff = projection.contextHandoffs.at(-1)!;
        if (scenario.startsWith("screenshot")) {
          assert.deepEqual((yield* Ref.get(capturedTurns)).at(-1)!.attachments, screenshots);
        }
        if (scenario === "compact-fallback" || scenario === "compact-legacy") {
          if (scenario === "compact-legacy") {
            const { history: _history, ...legacyHandoff } = handoff;
            yield* eventSink.write({
              events: [
                {
                  id: EventId.make("legacy-handoff-shape"),
                  type: "context-handoff.updated",
                  threadId,
                  runId: handoff.targetRunId,
                  occurredAt: yield* DateTime.now,
                  payload: legacyHandoff,
                },
              ],
            });
          }
          assert.isUndefined(handoff.delivery);
          yield* dispatch(3, "Continue after compact", CLAUDE_MODEL_SELECTION);
          yield* wait(3);
          assert.include(
            (yield* Ref.get(capturedTurns)).at(-1)!.text,
            "Original request with constraints",
          );
          assert.equal(
            (yield* orchestrator.getThreadProjection(threadId)).contextHandoffs.at(-1)?.delivery
              ?.status,
            "inline",
          );
        } else if (
          scenario === "delivery-write-failure" ||
          (scenario.startsWith("screenshot") && scenario.endsWith("fallback"))
        ) {
          assert.equal(
            handoff.delivery?.status,
            scenario.startsWith("screenshot") ? "inline" : "pending",
          );
          assert.include(
            (yield* Ref.get(capturedTurns)).at(-1)!.text,
            "Original request with constraints",
          );
        } else {
          assert.equal(handoff.delivery?.status, "injected");
          assert.equal((yield* Ref.get(capturedTurns)).at(-1)!.text, current);
          assert.include(
            yield* encodeJson(yield* Ref.get(injectedHistory)),
            "Original request with constraints",
          );
        }
      }).pipe(
        Effect.provide(
          ProviderReplayHarness.layerWithRegistry(
            {
              name: `handoff-${scenario}`,
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
  );
