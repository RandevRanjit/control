import {
  DEFAULT_SERVER_SETTINGS,
  EnvironmentId,
  ProviderInstanceId,
  WS_METHODS,
  type ServerConfig,
  type ServerConfigStreamEvent,
  type ServerSettings,
} from "@control/contracts";
import { expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import { AsyncResult, Atom, AtomRegistry } from "effect/reactivity";

import {
  AVAILABLE_CONNECTION_STATE,
  PrimaryConnectionTarget,
  type PreparedConnection,
  type SupervisorConnectionState,
} from "../connection/model.ts";
import * as EnvironmentRegistry from "../connection/registry.ts";
import * as EnvironmentSupervisor from "../connection/supervisor.ts";
import * as Persistence from "../platform/persistence.ts";
import type { WsRpcProtocolClient } from "../rpc/protocol.ts";
import type { RpcSession } from "../rpc/session.ts";
import { createServerEnvironmentAtoms } from "./server.ts";

const TARGET = new PrimaryConnectionTarget({
  environmentId: EnvironmentId.make("snapshot-environment"),
  label: "Snapshot environment",
  httpBaseUrl: "https://environment.example.test",
  wsBaseUrl: "wss://environment.example.test",
});
const CLAUDE = ProviderInstanceId.make("claudeAgent");
const SNAPSHOT = {
  cwd: "/a",
  checkedAt: "2026-10-25T00:00:00.000Z",
  slashCommands: [{ name: "project" }],
  skills: [],
};
const provider = (workspaceSnapshots?: ReadonlyArray<typeof SNAPSHOT>) =>
  ({
    instanceId: CLAUDE,
    enabled: true,
    slashCommands: [],
    skills: [],
    ...(workspaceSnapshots ? { workspaceSnapshots } : {}),
  }) as unknown as ServerConfig["providers"][number];
const settingsWithHome = (homePath: string): ServerSettings => ({
  ...DEFAULT_SERVER_SETTINGS,
  providerInstances: {
    [CLAUDE]: { driver: "claudeAgent", config: { homePath } },
  } as unknown as ServerSettings["providerInstances"],
});
const CONFIG = {
  settings: settingsWithHome("/home"),
  environment: {
    serverVersion: "0.0.1",
    capabilities: { providerWorkspaceSnapshotsOnDemand: true },
  },
  providers: [provider()],
} as unknown as ServerConfig;

/** A connected environment whose config stream and refreshProviders replies the test drives. */
const makeHarness = Effect.fn("ServerWorkspaceSnapshotsTest.makeHarness")(function* (
  beforeReply: Effect.Effect<void> = Effect.void,
) {
  const events = yield* Queue.unbounded<ServerConfigStreamEvent>();
  const client = {
    [WS_METHODS.subscribeServerConfig]: () =>
      Stream.concat(
        Stream.make({ version: 1 as const, type: "snapshot" as const, config: CONFIG }),
        Stream.fromQueue(events),
      ),
    [WS_METHODS.serverRefreshProviders]: () =>
      beforeReply.pipe(Effect.as({ providers: [provider([SNAPSHOT])] })),
  } as unknown as WsRpcProtocolClient;
  const session: RpcSession = {
    client,
    initialConfig: Effect.succeed(CONFIG),
    subscribeServerConfig: (input) => client.subscribeServerConfig(input),
    ready: Effect.void,
    probe: Effect.void,
    closed: Effect.never,
  };
  const supervisor = EnvironmentSupervisor.EnvironmentSupervisor.of({
    target: TARGET,
    state: yield* SubscriptionRef.make<SupervisorConnectionState>({
      ...AVAILABLE_CONNECTION_STATE,
      phase: "connected",
    }),
    session: yield* SubscriptionRef.make(Option.some(session)),
    prepared: yield* SubscriptionRef.make(Option.none<PreparedConnection>()),
    connect: Effect.void,
    disconnect: Effect.void,
    retryNow: Effect.void,
  });
  const environments = EnvironmentRegistry.EnvironmentRegistry.of({
    run: (_environmentId, effect) =>
      Effect.provideService(effect, EnvironmentSupervisor.EnvironmentSupervisor, supervisor),
    followStream: (_environmentId, stream) =>
      Stream.provideService(stream, EnvironmentSupervisor.EnvironmentSupervisor, supervisor),
  } as EnvironmentRegistry.EnvironmentRegistry["Service"]);
  const cache = Persistence.EnvironmentCacheStore.of({
    loadShell: () => Effect.succeedNone,
    saveShell: () => Effect.void,
    loadThread: () => Effect.succeedNone,
    saveThread: () => Effect.void,
    removeThread: () => Effect.void,
    loadServerConfig: () => Effect.succeedNone,
    saveServerConfig: () => Effect.void,
    loadVcsRefs: () => Effect.succeedNone,
    saveVcsRefs: () => Effect.void,
    removeVcsRefs: () => Effect.void,
    clearVcsRefs: () => Effect.void,
    clear: () => Effect.void,
  });
  const runtime = Atom.runtime(
    Layer.merge(
      Layer.succeed(EnvironmentRegistry.EnvironmentRegistry, environments),
      Layer.succeed(Persistence.EnvironmentCacheStore, cache),
    ),
  );
  const initialConfigValueAtom = Atom.make(CONFIG);
  const atoms = createServerEnvironmentAtoms(runtime, {
    initialConfigValueAtom: () => initialConfigValueAtom,
  });
  const registry = yield* Effect.acquireRelease(Effect.sync(AtomRegistry.make), (registry) =>
    Effect.sync(() => registry.dispose()),
  );
  const config = atoms.configValueAtom(TARGET.environmentId);
  const unmount = registry.mount(config);
  yield* Effect.addFinalizer(() => Effect.sync(unmount));
  const updateSettings = Effect.fn("ServerWorkspaceSnapshotsTest.updateSettings")(function* (
    settings: ServerSettings,
  ) {
    yield* Queue.offer(events, { version: 1, type: "settingsUpdated", payload: { settings } });
    yield* AtomRegistry.toStream(registry, config).pipe(
      Stream.filter((current) => current?.settings === settings),
      Stream.runHead,
    );
  });
  const refresh = () =>
    Effect.promise(() =>
      atoms.refreshProviders.run(registry, {
        environmentId: TARGET.environmentId,
        input: { instanceId: CLAUDE, cwd: "/a" },
      }),
    ).pipe(Effect.map((result) => expect(AsyncResult.isSuccess(result)).toBe(true)));
  const snapshots = () => registry.get(config)?.providers[0]?.workspaceSnapshots;
  return { refresh, snapshots, updateSettings };
});

it.effect("drops a fetched workspace snapshot when its instance is reconfigured", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const harness = yield* makeHarness();
      yield* harness.refresh();
      expect(harness.snapshots()).toEqual([SNAPSHOT]);
      // The provider list is untouched; only the instance's settings change.
      yield* harness.updateSettings(settingsWithHome("/other"));
      expect(harness.snapshots()).toBeUndefined();
    }),
  ),
);

it.effect("discards a snapshot answer that a reconfigure overtook", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const requested = yield* Deferred.make<void>();
      const reply = yield* Deferred.make<void>();
      const harness = yield* makeHarness(
        Deferred.succeed(requested, undefined).pipe(Effect.andThen(Deferred.await(reply))),
      );
      const refresh = yield* Effect.forkChild(harness.refresh());
      yield* Deferred.await(requested);
      yield* harness.updateSettings(settingsWithHome("/other"));
      yield* Deferred.succeed(reply, undefined);
      yield* Fiber.join(refresh);
      expect(harness.snapshots()).toBeUndefined();
    }),
  ),
);
