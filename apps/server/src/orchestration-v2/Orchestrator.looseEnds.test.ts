import { assert, it } from "@effect/vitest";
import {
  CommandId,
  LooseEndId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
} from "@control/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as TestClock from "effect/testing/TestClock";
import * as SqlitePersistence from "../persistence/Sqlite.ts";
import { FULL_PROVIDER_CAPABILITIES } from "./testkit/fullProviderCapabilities.ts";
import * as EventStore from "./EventStore.ts";
import * as Orchestrator from "./Orchestrator.ts";
import * as ProjectionMaintenance from "./ProjectionMaintenance.ts";
import * as ProjectionStore from "./ProjectionStore.ts";
import type { ProviderAdapterV2Shape } from "./ProviderAdapter.ts";
import * as ProviderAdapterRegistry from "./ProviderAdapterRegistry.ts";
import * as ProviderReplayHarness from "./testkit/ProviderReplayHarness.ts";

const instanceId = ProviderInstanceId.make("claudeAgent");
const adapter = {
  instanceId,
  driver: ProviderDriverKind.make("claudeAgent"),
  getCapabilities: () => Effect.succeed(FULL_PROVIDER_CAPABILITIES),
  planSelectionTransition: () => Effect.succeed({ type: "apply_on_next_turn" as const }),
  openSession: () => Effect.die("Loose ends need no provider process"),
} as ProviderAdapterV2Shape;
const layerDatabase = SqlitePersistence.layerMemory;
const layerHarness = ProviderReplayHarness.layerWithRegistry(
  { name: "loose-ends" },
  ProviderAdapterRegistry.layerFromAdapters([adapter]),
  { databaseLayer: layerDatabase, runEffectWorker: false },
);
const layerTest = Layer.mergeAll(
  layerDatabase,
  ProjectionStore.layer.pipe(Layer.provide(layerDatabase)),
  layerHarness,
  ProjectionMaintenance.layer.pipe(
    Layer.provide(
      Layer.merge(EventStore.layer, ProjectionStore.layer).pipe(Layer.provideMerge(layerDatabase)),
    ),
  ),
);

const createThread = (threadId: ThreadId) =>
  Effect.gen(function* () {
    const orchestrator = yield* Orchestrator.OrchestratorV2;
    yield* orchestrator.dispatch({
      type: "thread.create",
      commandId: CommandId.make(`create:${threadId}`),
      threadId,
      projectId: ProjectId.make("project:loose-ends"),
      title: "Loose ends",
      modelSelection: { instanceId, model: "claude-opus-5-5" },
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      createdBy: "user",
      creationSource: "web",
    });
  });

const file = (threadId: ThreadId, id: string, line: string) =>
  Effect.gen(function* () {
    const orchestrator = yield* Orchestrator.OrchestratorV2;
    yield* orchestrator.dispatch({
      type: "loose-end.file",
      commandId: CommandId.make(`file:${id}`),
      threadId,
      looseEndId: LooseEndId.make(id),
      line,
      reason: "Only you can do this.",
      action: id === "accounts" ? { kind: "link", value: "https://forum.example/join" } : null,
    });
  });

const openCount = (threadId: ThreadId) =>
  Effect.gen(function* () {
    const projections = yield* ProjectionStore.ProjectionStoreV2;
    const snapshot = yield* projections.getShellSnapshot();
    return snapshot.threads.find((thread) => thread.id === threadId)?.openLooseEndCount;
  });

it.layer(layerTest)("loose ends", (it) => {
  it.effect("are filed, closed, dismissed and reopened, and the shell counts the open ones", () =>
    Effect.gen(function* () {
      const orchestrator = yield* Orchestrator.OrchestratorV2;
      const projections = yield* ProjectionStore.ProjectionStoreV2;
      const threadId = ThreadId.make("thread:loose-ends");
      yield* createThread(threadId);
      const createdAt = (yield* projections.getThreadProjection(threadId)).thread.updatedAt;
      // Later than the chat's last activity, so a bump would show.
      yield* TestClock.adjust("1 minute");

      yield* file(threadId, "accounts", "Make the forum accounts");
      yield* file(threadId, "emails", "Send the drafted emails");
      assert.equal(yield* openCount(threadId), 2);

      yield* orchestrator.dispatch({
        type: "loose-end.close",
        commandId: CommandId.make("close:accounts"),
        threadId,
        looseEndId: LooseEndId.make("accounts"),
        outcome: "done",
      });
      yield* orchestrator.dispatch({
        type: "loose-end.agent-close",
        commandId: CommandId.make("agent-close:emails"),
        threadId,
        looseEndId: LooseEndId.make("emails"),
      });
      assert.equal(yield* openCount(threadId), 0);

      yield* orchestrator.dispatch({
        type: "loose-end.reopen",
        commandId: CommandId.make("reopen:accounts"),
        threadId,
        looseEndId: LooseEndId.make("accounts"),
      });
      yield* orchestrator.dispatch({
        type: "loose-end.close",
        commandId: CommandId.make("dismiss:accounts"),
        threadId,
        looseEndId: LooseEndId.make("accounts"),
        outcome: "dismissed",
      });

      const projection = yield* projections.getThreadProjection(threadId);
      const byId = new Map((projection.looseEnds ?? []).map((item) => [item.id, item]));
      assert.deepEqual(
        [...byId.values()].map(({ id, line, status, closedBy, action }) => ({
          id,
          line,
          status,
          closedBy,
          action,
        })),
        [
          {
            id: LooseEndId.make("accounts"),
            line: "Make the forum accounts",
            status: "dismissed",
            closedBy: "owner",
            action: { kind: "link", value: "https://forum.example/join" },
          },
          {
            id: LooseEndId.make("emails"),
            line: "Send the drafted emails",
            status: "done",
            closedBy: "agent",
            action: null,
          },
        ],
      );
      assert.isNotNull(byId.get(LooseEndId.make("emails"))!.closedAt);
      // Nothing pings: the chat keeps its place in the list.
      assert.deepEqual(projection.thread.updatedAt, createdAt);
    }),
  );

  it.effect("refuses to close what is closed or belongs to another chat", () =>
    Effect.gen(function* () {
      const orchestrator = yield* Orchestrator.OrchestratorV2;
      const threadId = ThreadId.make("thread:loose-ends-refusals");
      const otherThreadId = ThreadId.make("thread:loose-ends-other");
      yield* createThread(threadId);
      yield* createThread(otherThreadId);
      yield* file(threadId, "meter", "Send a photo of the meter");
      const close = (target: ThreadId, commandId: string) =>
        Effect.exit(
          orchestrator.dispatch({
            type: "loose-end.close",
            commandId: CommandId.make(commandId),
            threadId: target,
            looseEndId: LooseEndId.make("meter"),
            outcome: "done",
          }),
        );

      assert.equal((yield* close(otherThreadId, "close:other"))._tag, "Failure");
      assert.equal((yield* close(threadId, "close:first"))._tag, "Success");
      assert.equal((yield* close(threadId, "close:again"))._tag, "Failure");
      assert.equal(yield* openCount(otherThreadId), 0);
    }),
  );

  it.effect("rebuild from the event log to the same state", () =>
    Effect.gen(function* () {
      const projections = yield* ProjectionStore.ProjectionStoreV2;
      const maintenance = yield* ProjectionMaintenance.ProjectionMaintenanceV2;
      const threadId = ThreadId.make("thread:loose-ends-rebuild");
      yield* createThread(threadId);
      yield* file(threadId, "forums", "Say which forums to post on");
      const before = (yield* projections.getThreadProjection(threadId)).looseEnds;

      assert.isTrue((yield* maintenance.rebuild).valid);

      assert.deepEqual((yield* projections.getThreadProjection(threadId)).looseEnds, before);
      assert.equal(yield* openCount(threadId), 1);
    }),
  );
});
