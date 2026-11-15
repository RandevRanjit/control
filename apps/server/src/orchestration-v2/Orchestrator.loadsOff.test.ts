import { assert, it } from "@effect/vitest";
import {
  CommandId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationV2ThreadLoadSwitch,
} from "@control/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as TestClock from "effect/testing/TestClock";
import * as SqlitePersistence from "../persistence/Sqlite.ts";
import { FULL_PROVIDER_CAPABILITIES } from "./testkit/fullProviderCapabilities.ts";
import * as Orchestrator from "./Orchestrator.ts";
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
  openSession: () => Effect.die("A switch needs no provider process"),
} as ProviderAdapterV2Shape;
const layerDatabase = SqlitePersistence.layerMemory;
const layerTest = Layer.mergeAll(
  layerDatabase,
  ProjectionStore.layer.pipe(Layer.provide(layerDatabase)),
  ProviderReplayHarness.layerWithRegistry(
    { name: "loads-off" },
    ProviderAdapterRegistry.layerFromAdapters([adapter]),
    { databaseLayer: layerDatabase, runEffectWorker: false },
  ),
);

it.layer(layerTest)("a chat's switched-off loads", (it) => {
  it.effect("switch MCP servers and plugins off and back on, one at a time", () =>
    Effect.gen(function* () {
      const orchestrator = yield* Orchestrator.OrchestratorV2;
      const projections = yield* ProjectionStore.ProjectionStoreV2;
      const threadId = ThreadId.make("thread:loads-off");
      yield* orchestrator.dispatch({
        type: "thread.create",
        commandId: CommandId.make("create:loads-off"),
        threadId,
        projectId: ProjectId.make("project:loads-off"),
        title: "Loads",
        modelSelection: { instanceId, model: "claude-opus-5-5" },
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: null,
        worktreePath: null,
        createdBy: "user",
        creationSource: "web",
      });
      let step = 0;
      const flip = (loadSwitch: OrchestrationV2ThreadLoadSwitch) =>
        orchestrator.dispatch({
          type: "thread.metadata.update",
          commandId: CommandId.make(`switch:${++step}`),
          threadId,
          loadSwitch,
        });
      const loadsOff = () =>
        projections.getThreadProjection(threadId).pipe(Effect.map(({ thread }) => thread.loadsOff));

      assert.isUndefined(yield* loadsOff());
      const createdAt = (yield* projections.getThreadProjection(threadId)).thread.updatedAt;
      yield* TestClock.adjust("1 minute");
      yield* flip({ kind: "mcpServer", name: "claude.ai Gmail", on: false });
      yield* flip({ kind: "plugin", name: "playwright@claude-plugins-official", on: false });
      // Two devices switching the same server off leave it listed once.
      yield* flip({ kind: "mcpServer", name: "tavily", on: false });
      yield* flip({ kind: "mcpServer", name: "tavily", on: false });
      assert.deepEqual(yield* loadsOff(), {
        mcpServers: ["claude.ai Gmail", "tavily"],
        plugins: ["playwright@claude-plugins-official"],
      });

      yield* flip({ kind: "mcpServer", name: "claude.ai Gmail", on: true });
      yield* flip({ kind: "plugin", name: "playwright@claude-plugins-official", on: true });
      assert.deepEqual(yield* loadsOff(), { mcpServers: ["tavily"], plugins: [] });
      // A switch is a setting, not activity: the chat keeps its place in the sidebar.
      assert.deepEqual(
        (yield* projections.getThreadProjection(threadId)).thread.updatedAt,
        createdAt,
      );
    }),
  );
});
