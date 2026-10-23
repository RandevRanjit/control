import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, it, assert, expect } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";
import {
  EnvironmentId,
  ClaudeSettings,
  DEFAULT_SERVER_SETTINGS,
  PROVIDER_WORKSPACE_SNAPSHOT_TTL_MS,
  ProviderDriverKind,
  ProviderInstanceId,
  ServerSettings,
  type ServerProvider,
  type ServerProviderSlashCommand,
  type ServerSettings as ContractServerSettings,
} from "@control/contracts";
import * as PlatformError from "effect/PlatformError";
import { HttpClient, HttpClientResponse } from "effect/http";
import { ChildProcessSpawner } from "effect/process";
import { deepMerge } from "@control/shared/Struct";
import { createModelCapabilities } from "@control/shared/model";
import { applyServerSettingsPatch } from "@control/shared/serverSettings";

import { checkClaudeProviderStatus } from "./ClaudeProvider.ts";
import * as BackgroundPolicy from "../background/BackgroundPolicy.ts";
import * as ModelManifest from "./ModelManifest.ts";
import { applyProviderCompatibility } from "./providerCompatibility.ts";
import * as ResetCreditCoordinator from "./resetCreditCoordinator.ts";
import * as ProviderEventLoggers from "./ProviderEventLoggers.ts";
import * as ProviderInstanceRegistryHydration from "./ProviderInstanceRegistryHydration.ts";
import * as ServerConfig from "../config.ts";
import * as ServerSettingsModule from "../serverSettings.ts";
import { readProviderStatusCache, resolveProviderStatusCachePath } from "./providerStatusCache.ts";
import { COMPACT_SLASH_COMMAND } from "./providerSnapshot.ts";
import type { ProviderInstance, ProviderWorkspaceSnapshot } from "./ProviderDriver.ts";
import * as ProviderInstanceRegistry from "./ProviderInstanceRegistry.ts";
import * as ProviderRegistry from "./ProviderRegistry.ts";
import { makeManualOnlyProviderMaintenanceCapabilities } from "./providerMaintenance.ts";
const decodeServerSettings = Schema.decodeSync(ServerSettings);
const encodeServerSettings = Schema.encodeSync(ServerSettings);
const encodedDefaultServerSettings = encodeServerSettings(DEFAULT_SERVER_SETTINGS);

const defaultClaudeSettings: ClaudeSettings = Schema.decodeSync(ClaudeSettings)({});

// ── Test helpers ────────────────────────────────────────────────────

const encoder = new TextEncoder();
const TEST_EPOCH = DateTime.makeUnsafe("1970-01-01T00:00:00.000Z");
const withBundledCompatibility = (snapshot: ServerProvider) =>
  applyProviderCompatibility(
    snapshot,
    undefined,
    ModelManifest.BUNDLED_MODEL_MANIFEST.compatibility,
  );

// Provider metadata checks use a bundled manifest and stubbed HTTP.
const layerTestHttpClient = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make((request) =>
    Effect.succeed(HttpClientResponse.fromWeb(request, Response.json({ version: "0.0.0" }))),
  ),
).pipe(Layer.provideMerge(ModelManifest.layerTest));

const layerBackgroundPolicyAlwaysRun = Layer.mock(BackgroundPolicy.BackgroundPolicy)({
  reportClientActivity: () => Effect.void,
  removeRpcClient: () => Effect.void,
  reportHostPowerState: () => Effect.void,
  snapshot: Effect.succeed({
    hostPower: {
      source: "unknown",
      idle: "unknown",
      idleSeconds: null,
      locked: "unknown",
      suspended: false,
      onBattery: "unknown",
      lowPowerMode: "unknown",
      thermalState: "unknown",
      stale: true,
      updatedAt: TEST_EPOCH,
    },
    leases: [],
    activeForegroundLeaseCount: 0,
    activeScopeKeys: [],
    shouldRunOpportunisticWork: true,
    updatedAt: TEST_EPOCH,
  }),
  streamChanges: Stream.empty,
  hasDemand: () => Effect.succeed(true),
  shouldRunScopeWork: () => Effect.succeed(true),
  shouldRunOpportunisticWork: Effect.succeed(true),
});

function selectDescriptor(
  id: string,
  label: string,
  options: ReadonlyArray<{ id: string; label: string; isDefault?: boolean }>,
) {
  return {
    id,
    label,
    type: "select" as const,
    options: [...options],
    ...(options.find((option) => option.isDefault)?.id
      ? { currentValue: options.find((option) => option.isDefault)?.id }
      : {}),
  };
}

function booleanDescriptor(id: string, label: string) {
  return {
    id,
    label,
    type: "boolean" as const,
  };
}

type TestClaudeCapabilities = {
  readonly email: string | undefined;
  readonly subscriptionType: string | undefined;
  readonly tokenSource: string | undefined;
  readonly apiProvider: string | undefined;
  readonly slashCommands: ReadonlyArray<ServerProviderSlashCommand>;
};

function claudeCapabilities(overrides: Partial<TestClaudeCapabilities> = {}) {
  return () =>
    Effect.succeed({
      email: undefined,
      subscriptionType: undefined,
      tokenSource: undefined,
      apiProvider: undefined,
      slashCommands: [],
      ...overrides,
    });
}

const noClaudeCapabilities = () =>
  Effect.sync(() => undefined as TestClaudeCapabilities | undefined);

function mockHandle(result: { stdout: string; stderr: string; code: number }) {
  return ChildProcessSpawner.makeHandle({
    pid: ChildProcessSpawner.ProcessId(1),
    exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(result.code)),
    isRunning: Effect.succeed(false),
    kill: () => Effect.void,
    unref: Effect.succeed(Effect.void),
    stdin: Sink.drain,
    stdout: Stream.make(encoder.encode(result.stdout)),
    stderr: Stream.make(encoder.encode(result.stderr)),
    all: Stream.empty,
    getInputFd: () => Sink.drain,
    getOutputFd: () => Stream.empty,
  });
}

function layerMockSpawner(
  handler: (args: ReadonlyArray<string>) => {
    stdout: string;
    stderr: string;
    code: number;
  },
) {
  return Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make((command) => {
      const cmd = command as unknown as { args: ReadonlyArray<string> };
      return Effect.succeed(mockHandle(handler(cmd.args)));
    }),
  );
}

function recordingMockSpawnerLayer(
  handler: (args: ReadonlyArray<string>) => {
    stdout: string;
    stderr: string;
    code: number;
  },
) {
  const commands: Array<{
    readonly args: ReadonlyArray<string>;
    readonly env: NodeJS.ProcessEnv | undefined;
  }> = [];
  const layer = Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make((command) => {
      const cmd = command as unknown as {
        args: ReadonlyArray<string>;
        options?: {
          readonly env?: NodeJS.ProcessEnv;
        };
      };
      commands.push({ args: cmd.args, env: cmd.options?.env });
      return Effect.succeed(mockHandle(handler(cmd.args)));
    }),
  );
  return { layer, commands };
}

function layerMockCommandSpawner(
  handler: (
    command: string,
    args: ReadonlyArray<string>,
  ) => { stdout: string; stderr: string; code: number },
) {
  return Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make((command) => {
      const cmd = command as unknown as {
        command: string;
        args: ReadonlyArray<string>;
      };
      return Effect.succeed(mockHandle(handler(cmd.command, cmd.args)));
    }),
  );
}

function layerFailingSpawner(description: string) {
  return Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make(() =>
      Effect.fail(
        PlatformError.systemError({
          _tag: "NotFound",
          module: "ChildProcess",
          method: "spawn",
          description,
        }),
      ),
    ),
  );
}

function makeMutableServerSettingsService(
  initial: ContractServerSettings = DEFAULT_SERVER_SETTINGS,
) {
  return Effect.gen(function* () {
    const settingsRef = yield* Ref.make(initial);
    const changes = yield* PubSub.unbounded<ContractServerSettings>();

    return {
      start: Effect.void,
      ready: Effect.void,
      getSettings: Ref.get(settingsRef),
      updateSettings: (patch) =>
        Effect.gen(function* () {
          const current = yield* Ref.get(settingsRef);
          const next = applyServerSettingsPatch(current, patch);
          encodeServerSettings(next);
          yield* Ref.set(settingsRef, next);
          yield* PubSub.publish(changes, next);
          return next;
        }),
      updateProviderInstance: (mutation, patch = {}) =>
        Effect.gen(function* () {
          const current = yield* Ref.get(settingsRef);
          const next = ServerSettingsModule.applyProviderInstanceMutation(
            applyServerSettingsPatch(current, patch),
            mutation,
          );
          encodeServerSettings(next);
          yield* Ref.set(settingsRef, next);
          yield* PubSub.publish(changes, next);
          return next;
        }),
      withSettingsSnapshot: (use) => Ref.get(settingsRef).pipe(Effect.flatMap(use)),
      get streamChanges() {
        return Stream.fromPubSub(changes);
      },
      get subscribeChanges() {
        return PubSub.subscribe(changes).pipe(
          Effect.map((subscription) => Stream.fromSubscription(subscription)),
        );
      },
    } satisfies ServerSettingsModule.ServerSettingsService["Service"];
  });
}

// The registry writes the status cache and only then publishes the change, so
// a subscriber that sees `checkedAt` on the stream knows the file is on disk.
// Subscribed before the publish that triggers it; a spin on the file would
// race the write and lose on a slow host.
const awaitPersistedProvider = (
  registry: ProviderRegistry.ProviderRegistry["Service"],
  checkedAt: string,
) =>
  registry.streamChanges.pipe(
    Stream.filter((providers) => providers.some((provider) => provider.checkedAt === checkedAt)),
    Stream.take(1),
    Stream.runDrain,
    Effect.forkScoped,
  );

const layerTestNodeServices = Layer.mergeAll(
  NodeServices.layer,
  Layer.mock(ServerSecretStore.ServerSecretStore)({}),
  Layer.succeed(ServerEnvironment.ServerEnvironmentIdentity, {
    getEnvironmentId: Effect.succeed(EnvironmentId.make("00000000-0000-4000-8000-000000000001")),
  }),
);

it.layer(
  Layer.mergeAll(layerTestNodeServices, ServerSettingsModule.layerTest(), layerTestHttpClient),
)("ProviderRegistry", (it) => {
  describe("ProviderRegistry.layer", () => {
    it("stores workspace skills and commands without changing machine metadata", () => {
      const provider = {
        instanceId: ProviderInstanceId.make("codex"),
        driver: ProviderDriverKind.make("codex"),
        status: "ready",
        enabled: true,
        installed: true,
        auth: { status: "authenticated" },
        checkedAt: "2026-03-25T00:00:00.000Z",
        version: "1.0.0",
        models: [],
        slashCommands: [{ name: "global" }],
        skills: [{ name: "global", path: "/global/SKILL.md", enabled: true }],
      } satisfies ServerProvider;
      const scopedSnapshot = {
        ...provider,
        checkedAt: "2026-03-25T00:01:00.000Z",
        slashCommands: [{ name: "project" }],
        skills: [{ name: "project", path: "/project/SKILL.md", enabled: true }],
      } satisfies ServerProvider;

      const result = ProviderRegistry.upsertProviderWorkspaceSnapshot(
        provider,
        "/project",
        scopedSnapshot,
      );

      assert.deepStrictEqual(result.slashCommands, provider.slashCommands);
      assert.deepStrictEqual(result.skills, provider.skills);
      assert.deepStrictEqual(result.workspaceSnapshots, [
        {
          cwd: "/project",
          checkedAt: scopedSnapshot.checkedAt,
          slashCommands: scopedSnapshot.slashCommands,
          skills: scopedSnapshot.skills,
        },
      ]);

      const pendingSnapshot = {
        ...scopedSnapshot,
        slashCommands: [COMPACT_SLASH_COMMAND],
        slashCommandsPending: true,
      } satisfies ProviderWorkspaceSnapshot;
      const partial = ProviderRegistry.upsertProviderWorkspaceSnapshot(
        result,
        "/project",
        pendingSnapshot,
      );
      assert.deepStrictEqual(partial.workspaceSnapshots?.[0]?.slashCommands, [{ name: "project" }]);
      assert.strictEqual(partial.workspaceSnapshots?.[0]?.slashCommandsPending, true);
      const otherProject = ProviderRegistry.upsertProviderWorkspaceSnapshot(
        partial,
        "/other-project",
        pendingSnapshot,
      );
      assert.deepStrictEqual(otherProject.workspaceSnapshots?.[1]?.slashCommands, [
        COMPACT_SLASH_COMMAND,
      ]);
      const recovered = ProviderRegistry.upsertProviderWorkspaceSnapshot(partial, "/project", {
        ...scopedSnapshot,
        slashCommands: [COMPACT_SLASH_COMMAND, { name: "replacement" }],
      });
      assert.deepStrictEqual(recovered.workspaceSnapshots?.[0]?.slashCommands, [
        COMPACT_SLASH_COMMAND,
        { name: "replacement" },
      ]);
      assert.strictEqual(recovered.workspaceSnapshots?.[0]?.slashCommandsPending, undefined);
    });

    it("preserves previously discovered provider models when a refresh returns none", () => {
      const previousProvider = {
        instanceId: ProviderInstanceId.make("cursor"),
        driver: ProviderDriverKind.make("cursor"),
        status: "ready",
        enabled: true,
        installed: true,
        auth: { status: "authenticated" },
        checkedAt: "2026-04-14T00:00:00.000Z",
        version: "2026.04.09-f2b0fcd",
        models: [
          {
            slug: "claude-opus-4-6",
            name: "Opus 4.6",
            isCustom: false,
            capabilities: createModelCapabilities({
              optionDescriptors: [
                selectDescriptor("reasoning", "Reasoning", [
                  { id: "high", label: "High", isDefault: true },
                ]),
                booleanDescriptor("fastMode", "Fast Mode"),
                booleanDescriptor("thinking", "Thinking"),
              ],
            }),
          },
        ],
        slashCommands: [{ name: "review", description: "Review changes" }],
        skills: [
          {
            name: "typescript",
            description: "TypeScript help",
            path: "/skills/typescript/SKILL.md",
            enabled: true,
          },
        ],
      } as const satisfies ServerProvider;
      const refreshedProvider = {
        ...previousProvider,
        checkedAt: "2026-04-14T00:01:00.000Z",
        models: [],
        slashCommands: [],
        skills: [],
      } satisfies ServerProvider;

      assert.deepStrictEqual(
        ProviderRegistry.mergeProviderSnapshot(previousProvider, refreshedProvider).models,
        [...previousProvider.models],
      );
      assert.deepStrictEqual(
        ProviderRegistry.mergeProviderSnapshot(previousProvider, refreshedProvider).slashCommands,
        [],
      );
      assert.deepStrictEqual(
        ProviderRegistry.mergeProviderSnapshot(previousProvider, refreshedProvider).skills,
        [],
      );
    });

    it("drops custom models the refreshed snapshot no longer carries", () => {
      const previousProvider = {
        instanceId: ProviderInstanceId.make("claudeAgent"),
        driver: ProviderDriverKind.make("claudeAgent"),
        status: "ready",
        enabled: true,
        installed: true,
        auth: { status: "authenticated" },
        checkedAt: "2026-04-14T00:00:00.000Z",
        version: "2.1.0",
        models: [
          {
            slug: "claude-sonnet-4-6",
            name: "Sonnet 4.6",
            isCustom: false,
            capabilities: null,
          },
          {
            slug: "removed-custom",
            name: "removed-custom",
            isCustom: true,
            capabilities: null,
          },
        ],
        slashCommands: [],
        skills: [],
      } as const satisfies ServerProvider;
      const refreshedProvider = {
        ...previousProvider,
        checkedAt: "2026-04-14T00:01:00.000Z",
        models: [previousProvider.models[0]],
      } satisfies ServerProvider;

      assert.deepStrictEqual(
        ProviderRegistry.mergeProviderSnapshot(previousProvider, refreshedProvider).models,
        [...refreshedProvider.models],
      );
    });

    it("fills missing capabilities from the previous provider snapshot", () => {
      const previousProvider = {
        instanceId: ProviderInstanceId.make("cursor"),
        driver: ProviderDriverKind.make("cursor"),
        status: "ready",
        enabled: true,
        installed: true,
        auth: { status: "authenticated" },
        checkedAt: "2026-04-14T00:00:00.000Z",
        version: "2026.04.09-f2b0fcd",
        models: [
          {
            slug: "claude-opus-4-6",
            name: "Opus 4.6",
            isCustom: false,
            capabilities: createModelCapabilities({
              optionDescriptors: [
                selectDescriptor("reasoning", "Reasoning", [
                  { id: "high", label: "High", isDefault: true },
                ]),
                booleanDescriptor("fastMode", "Fast Mode"),
                booleanDescriptor("thinking", "Thinking"),
              ],
            }),
          },
        ],
        slashCommands: [],
        skills: [],
      } as const satisfies ServerProvider;
      const refreshedProvider = {
        ...previousProvider,
        checkedAt: "2026-04-14T00:01:00.000Z",
        models: [
          {
            slug: "claude-opus-4-6",
            name: "Opus 4.6",
            isCustom: false,
            capabilities: createModelCapabilities({
              optionDescriptors: [],
            }),
          },
        ],
      } satisfies ServerProvider;

      assert.deepStrictEqual(
        ProviderRegistry.mergeProviderSnapshot(previousProvider, refreshedProvider).models,
        [...previousProvider.models],
      );
    });

    it.effect("does not run provider probes during layer construction", () =>
      Effect.gen(function* () {
        const codexDriver = ProviderDriverKind.make("codex");
        const codexInstanceId = ProviderInstanceId.make("codex");
        const initialProvider = {
          instanceId: codexInstanceId,
          driver: codexDriver,
          status: "warning",
          enabled: true,
          installed: false,
          auth: { status: "unknown" },
          checkedAt: "2026-06-10T00:00:00.000Z",
          version: null,
          message: "Checking Codex provider status.",
          models: [],
          slashCommands: [],
          skills: [],
        } as const satisfies ServerProvider;
        const refreshCalls = yield* Ref.make(0);
        const instance = {
          instanceId: codexInstanceId,
          driverKind: codexDriver,
          continuationIdentity: {
            driverKind: codexDriver,
            continuationKey: "codex:instance:codex",
          },
          displayName: undefined,
          enabled: true,
          snapshot: {
            resolveMaintenance: () =>
              Effect.succeed(
                makeManualOnlyProviderMaintenanceCapabilities({
                  provider: codexDriver,
                  packageName: null,
                }),
              ),
            getSnapshot: Effect.succeed(initialProvider),
            refresh: Ref.update(refreshCalls, (count) => count + 1).pipe(
              Effect.andThen(Effect.never),
            ),
            streamChanges: Stream.empty,
            applyUsageLimits: () => Effect.void,
          },
          orchestrationAdapter: {} as ProviderInstance["orchestrationAdapter"],
          textGeneration: {} as ProviderInstance["textGeneration"],
        } satisfies ProviderInstance;
        const layerInstanceRegistry = Layer.succeed(
          ProviderInstanceRegistry.ProviderInstanceRegistry,
          {
            getInstance: (instanceId) =>
              Effect.succeed(instanceId === codexInstanceId ? instance : undefined),
            listInstances: Effect.succeed([instance]),
            listUnavailable: Effect.succeed([]),
            streamChanges: Stream.empty,
            subscribeChanges: Effect.flatMap(PubSub.unbounded<void>(), PubSub.subscribe),
          },
        );
        const scope = yield* Scope.make();
        yield* Effect.addFinalizer(() => Scope.close(scope, Exit.void));
        const runtimeServices = yield* Layer.build(
          ProviderRegistry.layer.pipe(
            Layer.provideMerge(layerInstanceRegistry),
            Layer.provideMerge(
              ServerConfig.layerTest(process.cwd(), {
                prefix: "control-provider-registry-background-refresh-",
              }),
            ),
            Layer.provideMerge(NodeServices.layer),
          ),
        ).pipe(Scope.provide(scope));
        yield* Effect.gen(function* () {
          const registry = yield* ProviderRegistry.ProviderRegistry;
          assert.deepStrictEqual(yield* registry.getProviders, [initialProvider]);
          assert.strictEqual(yield* Ref.get(refreshCalls), 0);
        }).pipe(Effect.provide(runtimeServices));
      }),
    );

    it.effect("deduplicates cwd probes and clears snapshots when an instance rebuilds", () =>
      Effect.gen(function* () {
        const driver = ProviderDriverKind.make("codex");
        const instanceId = ProviderInstanceId.make("codex");
        const machineProvider = {
          instanceId,
          driver,
          status: "ready",
          enabled: true,
          installed: true,
          auth: { status: "authenticated" },
          checkedAt: "2026-06-10T00:00:00.000Z",
          version: "1.0.0",
          models: [],
          slashCommands: [{ name: "global" }],
          skills: [{ name: "global", path: "/global/SKILL.md", enabled: true }],
        } as const satisfies ServerProvider;
        const scopedProvider = {
          ...machineProvider,
          checkedAt: "2026-06-10T00:01:00.000Z",
          slashCommands: [{ name: "project" }],
          skills: [{ name: "project", path: "/workspace/SKILL.md", enabled: true }],
        } as const satisfies ServerProvider;
        const pendingScopedProvider = {
          ...scopedProvider,
          status: "error",
          installed: false,
          slashCommands: [],
        } as const satisfies ServerProvider;
        const snapshotCalls = yield* Ref.make(0);
        const scopedResult = yield* Ref.make<ProviderWorkspaceSnapshot>({
          ...scopedProvider,
          status: "error",
          slashCommands: [COMPACT_SLASH_COMMAND],
          slashCommandsPending: true,
        });
        const cacheInvalidations = yield* Ref.make(0);
        const scanGate = yield* Ref.make<{
          readonly started: Deferred.Deferred<void>;
          readonly release: Deferred.Deferred<void>;
        } | null>(null);
        const returnPendingSnapshot = yield* Ref.make(true);
        const probeStarted = yield* Deferred.make<void>();
        const releaseProbe = yield* Deferred.make<void>();
        const makeInstance = (
          provider: ServerProvider,
          snapshotForCwd: NonNullable<ProviderInstance["snapshotForCwd"]>,
        ): ProviderInstance => ({
          instanceId,
          driverKind: driver,
          continuationIdentity: {
            driverKind: driver,
            continuationKey: "codex:instance:codex",
          },
          displayName: undefined,
          enabled: true,
          snapshot: {
            resolveMaintenance: () =>
              Effect.succeed(
                makeManualOnlyProviderMaintenanceCapabilities({
                  provider: driver,
                  packageName: null,
                }),
              ),
            getSnapshot: Effect.succeed(provider),
            refresh: Effect.succeed(provider),
            streamChanges: Stream.empty,
            applyUsageLimits: () => Effect.void,
          },
          snapshotForCwd,
          invalidateCaches: Ref.update(cacheInvalidations, (count) => count + 1),
          orchestrationAdapter: {} as ProviderInstance["orchestrationAdapter"],
          textGeneration: {} as ProviderInstance["textGeneration"],
        });
        const firstInstance = makeInstance(machineProvider, () =>
          Effect.gen(function* () {
            yield* Ref.update(snapshotCalls, (count) => count + 1);
            if (yield* Ref.get(returnPendingSnapshot)) return pendingScopedProvider;
            yield* Deferred.succeed(probeStarted, undefined);
            yield* Deferred.await(releaseProbe);
            const result = yield* Ref.get(scopedResult);
            const gate = yield* Ref.getAndSet(scanGate, null);
            if (gate) {
              yield* Deferred.succeed(gate.started, undefined);
              yield* Deferred.await(gate.release);
            }
            return result;
          }),
        );
        const rebuiltProvider = {
          ...machineProvider,
          checkedAt: "2026-06-10T00:02:00.000Z",
          status: "warning",
          installed: false,
          auth: { status: "unknown" },
        } satisfies ServerProvider;
        const rebuiltInstance = makeInstance(rebuiltProvider, () =>
          Ref.update(snapshotCalls, (count) => count + 1).pipe(Effect.as(scopedProvider)),
        );
        const registryChanges = yield* PubSub.unbounded<void>();
        const instancesRef = yield* Ref.make<ReadonlyArray<ProviderInstance>>([firstInstance]);
        const layerInstanceRegistry = Layer.succeed(
          ProviderInstanceRegistry.ProviderInstanceRegistry,
          {
            getInstance: (requestedId) =>
              Ref.get(instancesRef).pipe(
                Effect.map((instances) =>
                  instances.find((instance) => instance.instanceId === requestedId),
                ),
              ),
            listInstances: Ref.get(instancesRef),
            listUnavailable: Effect.succeed([]),
            streamChanges: Stream.fromPubSub(registryChanges),
            subscribeChanges: PubSub.subscribe(registryChanges),
          },
        );
        const scope = yield* Scope.make();
        yield* Effect.addFinalizer(() => Scope.close(scope, Exit.void));
        const runtimeServices = yield* Layer.build(
          ProviderRegistry.layer.pipe(
            Layer.provideMerge(layerInstanceRegistry),
            Layer.provideMerge(
              ServerConfig.layerTest(process.cwd(), {
                prefix: "control-provider-registry-workspace-snapshot-",
              }),
            ),
            Layer.provideMerge(NodeServices.layer),
          ),
        ).pipe(Scope.provide(scope));

        yield* Effect.gen(function* () {
          const registry = yield* ProviderRegistry.ProviderRegistry;
          yield* registry.refreshWorkspaceSnapshot({ instanceId, cwd: "/workspace" });
          assert.strictEqual((yield* registry.getProviders)[0]?.workspaceSnapshots, undefined);
          yield* Ref.set(returnPendingSnapshot, false);
          const workspaceUpdate = yield* registry.streamChanges.pipe(
            Stream.runHead,
            Effect.forkChild,
          );
          yield* Effect.yieldNow;
          const firstRefresh = yield* registry
            .refreshWorkspaceSnapshot({ instanceId, cwd: "/workspace" })
            .pipe(Effect.forkChild);
          yield* Deferred.await(probeStarted);
          const duplicateRefresh = yield* registry
            .refreshWorkspaceSnapshot({ instanceId, cwd: "/workspace" })
            .pipe(Effect.forkChild);
          yield* Effect.yieldNow;
          assert.strictEqual(yield* Ref.get(snapshotCalls), 2);
          yield* Deferred.succeed(releaseProbe, undefined);
          yield* Fiber.join(firstRefresh);
          yield* Fiber.join(duplicateRefresh);
          const published = yield* Fiber.join(workspaceUpdate);
          assert.strictEqual(published._tag, "Some");
          const providers = yield* registry.getProviders;
          assert.deepStrictEqual(providers[0]?.skills, machineProvider.skills);
          assert.deepStrictEqual(
            providers[0]?.workspaceSnapshots?.[0]?.skills,
            scopedProvider.skills,
          );
          assert.deepStrictEqual(providers[0]?.workspaceSnapshots?.[0]?.slashCommands, [
            COMPACT_SLASH_COMMAND,
          ]);
          assert.strictEqual(providers[0]?.workspaceSnapshots?.[0]?.slashCommandsPending, true);
          yield* Ref.set(scopedResult, {
            ...scopedProvider,
            status: "error",
            slashCommandsPending: false,
          });
          yield* registry.refreshWorkspaceSnapshot({ instanceId, cwd: "/workspace" });
          assert.strictEqual(yield* Ref.get(snapshotCalls), 3);
          assert.deepStrictEqual(
            (yield* registry.getProviders)[0]?.workspaceSnapshots?.[0]?.slashCommands,
            scopedProvider.slashCommands,
          );
          assert.strictEqual(
            (yield* registry.getProviders)[0]?.workspaceSnapshots?.[0]?.slashCommandsPending,
            undefined,
          );
          yield* registry.refreshWorkspaceSnapshot({ instanceId, cwd: "/workspace" });
          assert.strictEqual(yield* Ref.get(snapshotCalls), 3);
          // Nothing watches skill directories, so an expired scan is redone on use.
          yield* TestClock.adjust(PROVIDER_WORKSPACE_SNAPSHOT_TTL_MS - 1);
          yield* registry.refreshWorkspaceSnapshot({ instanceId, cwd: "/workspace" });
          assert.strictEqual(yield* Ref.get(snapshotCalls), 3);
          yield* TestClock.adjust(1);
          yield* registry.refreshWorkspaceSnapshot({ instanceId, cwd: "/workspace" });
          assert.strictEqual(yield* Ref.get(snapshotCalls), 4);
          const newSkills = [
            ...scopedProvider.skills,
            { name: "added", path: "/workspace/added/SKILL.md", enabled: true },
          ];
          yield* Ref.set(scopedResult, { ...scopedProvider, skills: newSkills });
          yield* registry.refreshWorkspaceSnapshot({
            instanceId,
            cwd: "/workspace",
            fresh: true,
          });
          assert.strictEqual(yield* Ref.get(snapshotCalls), 5);
          assert.strictEqual(yield* Ref.get(cacheInvalidations), 1);
          assert.deepStrictEqual(
            (yield* registry.getProviders)[0]?.workspaceSnapshots?.map((s) => s.skills),
            [newSkills],
          );

          // A slow fresh scan that read older files must not overwrite a
          // newer scan that finished first.
          const slowStarted = yield* Deferred.make<void>();
          const releaseSlow = yield* Deferred.make<void>();
          yield* Ref.set(scanGate, { started: slowStarted, release: releaseSlow });
          yield* Ref.set(scopedResult, scopedProvider);
          const slowScan = yield* registry
            .refreshWorkspaceSnapshot({ instanceId, cwd: "/workspace", fresh: true })
            .pipe(Effect.forkChild);
          yield* Deferred.await(slowStarted);
          const latestSkills = [
            ...newSkills,
            { name: "latest", path: "/workspace/latest/SKILL.md", enabled: true },
          ];
          yield* Ref.set(scopedResult, { ...scopedProvider, skills: latestSkills });
          yield* registry.refreshWorkspaceSnapshot({
            instanceId,
            cwd: "/workspace",
            fresh: true,
          });
          yield* Deferred.succeed(releaseSlow, undefined);
          yield* Fiber.join(slowScan);
          assert.deepStrictEqual(
            (yield* registry.getProviders)[0]?.workspaceSnapshots?.map((s) => s.skills),
            [latestSkills],
          );

          yield* Ref.set(instancesRef, [rebuiltInstance]);
          yield* PubSub.publish(registryChanges, undefined);
          let rebuilt = yield* registry.getProviders;
          for (
            let attempt = 0;
            attempt < 50 && rebuilt[0]?.checkedAt !== rebuiltProvider.checkedAt;
            attempt += 1
          ) {
            yield* Effect.yieldNow;
            rebuilt = yield* registry.getProviders;
          }
          assert.strictEqual(rebuilt[0]?.checkedAt, rebuiltProvider.checkedAt);
          assert.strictEqual(rebuilt[0]?.workspaceSnapshots, undefined);
        }).pipe(Effect.provide(runtimeServices));
      }),
    );

    it("persists merged provider snapshots for the providers that were refreshed", () => {
      const previousProviders = [
        {
          instanceId: ProviderInstanceId.make("cursor"),
          driver: ProviderDriverKind.make("cursor"),
          status: "ready",
          enabled: true,
          installed: true,
          auth: { status: "authenticated" },
          checkedAt: "2026-04-14T00:00:00.000Z",
          version: "2026.04.09-f2b0fcd",
          models: [
            {
              slug: "claude-opus-4-6",
              name: "Opus 4.6",
              isCustom: false,
              capabilities: createModelCapabilities({
                optionDescriptors: [
                  selectDescriptor("reasoning", "Reasoning", [
                    { id: "high", label: "High", isDefault: true },
                  ]),
                  booleanDescriptor("fastMode", "Fast Mode"),
                  booleanDescriptor("thinking", "Thinking"),
                ],
              }),
            },
          ],
          slashCommands: [],
          skills: [],
        },
        {
          instanceId: ProviderInstanceId.make("codex"),
          driver: ProviderDriverKind.make("codex"),
          status: "ready",
          enabled: true,
          installed: true,
          auth: { status: "authenticated" },
          checkedAt: "2026-04-14T00:00:00.000Z",
          version: "1.0.0",
          models: [],
          slashCommands: [],
          skills: [],
        },
      ] as const satisfies ReadonlyArray<ServerProvider>;
      const refreshedCursor = {
        ...previousProviders[0],
        checkedAt: "2026-04-14T00:01:00.000Z",
        models: [],
      } satisfies ServerProvider;

      const mergedProviders = ProviderRegistry.mergeProviderSnapshots(previousProviders, [
        refreshedCursor,
      ]);
      const persistedProviders = ProviderRegistry.selectProvidersByKind(
        mergedProviders,
        new Set([ProviderDriverKind.make("cursor")]),
      );

      assert.deepStrictEqual(persistedProviders, [
        {
          ...refreshedCursor,
          models: [...previousProviders[0].models],
        },
      ]);
    });

    it.effect("shares one in-flight pass between concurrent untargeted refreshes", () =>
      Effect.gen(function* () {
        const driver = ProviderDriverKind.make("codex");
        const instanceId = ProviderInstanceId.make("codex");
        const provider = {
          instanceId,
          driver,
          status: "ready",
          enabled: true,
          installed: true,
          auth: { status: "authenticated" },
          checkedAt: "2026-06-10T00:00:00.000Z",
          version: "1.0.0",
          models: [],
          slashCommands: [],
          skills: [],
        } as const satisfies ServerProvider;
        const refreshCalls = yield* Ref.make(0);
        const probeStarted = yield* Deferred.make<void>();
        const releaseProbe = yield* Deferred.make<void>();
        const instances = [
          {
            instanceId,
            driverKind: driver,
            continuationIdentity: { driverKind: driver, continuationKey: "codex:instance:codex" },
            displayName: undefined,
            enabled: true,
            snapshot: {
              resolveMaintenance: () =>
                Effect.succeed(
                  makeManualOnlyProviderMaintenanceCapabilities({
                    provider: driver,
                    packageName: null,
                  }),
                ),
              getSnapshot: Effect.succeed(provider),
              refresh: Effect.gen(function* () {
                yield* Ref.update(refreshCalls, (count) => count + 1);
                yield* Deferred.succeed(probeStarted, undefined);
                yield* Deferred.await(releaseProbe);
                return provider;
              }),
              streamChanges: Stream.empty,
              applyUsageLimits: () => Effect.void,
            },
            orchestrationAdapter: {} as ProviderInstance["orchestrationAdapter"],
            textGeneration: {} as ProviderInstance["textGeneration"],
          },
        ] satisfies ReadonlyArray<ProviderInstance>;
        const instanceRegistryLayer = Layer.succeed(
          ProviderInstanceRegistry.ProviderInstanceRegistry,
          {
            getInstance: (requestedId) =>
              Effect.succeed(instances.find((instance) => instance.instanceId === requestedId)),
            listInstances: Effect.succeed(instances),
            listUnavailable: Effect.succeed([]),
            streamChanges: Stream.empty,
            subscribeChanges: Effect.flatMap(PubSub.unbounded<void>(), PubSub.subscribe),
          },
        );
        const scope = yield* Scope.make();
        yield* Effect.addFinalizer(() => Scope.close(scope, Exit.void));
        const runtimeServices = yield* Layer.build(
          ProviderRegistry.layer.pipe(
            Layer.provideMerge(instanceRegistryLayer),
            Layer.provideMerge(
              ServerConfig.layerTest(process.cwd(), {
                prefix: "control-provider-registry-shared-refresh-",
              }),
            ),
            Layer.provideMerge(NodeServices.layer),
          ),
        ).pipe(Scope.provide(scope));

        yield* Effect.gen(function* () {
          const registry = yield* ProviderRegistry.ProviderRegistry;
          const first = yield* registry.refresh().pipe(Effect.forkChild);
          yield* Deferred.await(probeStarted);
          const second = yield* registry.refresh().pipe(Effect.forkChild);
          yield* Effect.yieldNow;
          assert.strictEqual(yield* Ref.get(refreshCalls), 1);
          yield* Deferred.succeed(releaseProbe, undefined);
          expect(yield* Fiber.join(first)).toEqual([expect.objectContaining(provider)]);
          expect(yield* Fiber.join(second)).toEqual([expect.objectContaining(provider)]);
          assert.strictEqual(yield* Ref.get(refreshCalls), 1);

          yield* registry.refresh();
          assert.strictEqual(yield* Ref.get(refreshCalls), 2);
        }).pipe(Effect.provide(runtimeServices));
      }),
    );

    it.effect("persists the merged snapshot when a live update has empty models", () =>
      Effect.gen(function* () {
        const cursorDriver = ProviderDriverKind.make("cursor");
        const cursorInstanceId = ProviderInstanceId.make("cursor");
        const initialProvider = {
          instanceId: cursorInstanceId,
          driver: cursorDriver,
          status: "ready",
          enabled: true,
          installed: true,
          auth: { status: "authenticated" },
          checkedAt: "2026-04-14T00:00:00.000Z",
          version: "2026.04.09-f2b0fcd",
          models: [
            {
              slug: "claude-opus-4-6",
              name: "Opus 4.6",
              isCustom: false,
              capabilities: createModelCapabilities({
                optionDescriptors: [
                  selectDescriptor("reasoning", "Reasoning", [
                    { id: "high", label: "High", isDefault: true },
                  ]),
                ],
              }),
            },
          ],
          slashCommands: [],
          skills: [],
        } as const satisfies ServerProvider;
        const refreshedProvider = {
          ...initialProvider,
          checkedAt: "2026-04-14T00:01:00.000Z",
          models: [],
        } satisfies ServerProvider;
        const changes = yield* PubSub.unbounded<ServerProvider>();
        const instance = {
          instanceId: cursorInstanceId,
          driverKind: cursorDriver,
          continuationIdentity: {
            driverKind: cursorDriver,
            continuationKey: "cursor:instance:cursor",
          },
          displayName: undefined,
          enabled: true,
          snapshot: {
            resolveMaintenance: () =>
              Effect.succeed(
                makeManualOnlyProviderMaintenanceCapabilities({
                  provider: cursorDriver,
                  packageName: null,
                }),
              ),
            getSnapshot: Effect.succeed(initialProvider),
            refresh: Effect.succeed(refreshedProvider),
            streamChanges: Stream.fromPubSub(changes),
            applyUsageLimits: () => Effect.void,
          },
          orchestrationAdapter: {} as ProviderInstance["orchestrationAdapter"],
          textGeneration: {} as ProviderInstance["textGeneration"],
        } satisfies ProviderInstance;
        const layerInstanceRegistry = Layer.succeed(
          ProviderInstanceRegistry.ProviderInstanceRegistry,
          {
            getInstance: (instanceId) =>
              Effect.succeed(instanceId === cursorInstanceId ? instance : undefined),
            listInstances: Effect.succeed([instance]),
            listUnavailable: Effect.succeed([]),
            streamChanges: Stream.empty,
            subscribeChanges: Effect.flatMap(PubSub.unbounded<void>(), (pubsub) =>
              PubSub.subscribe(pubsub),
            ),
          },
        );
        const scope = yield* Scope.make();
        yield* Effect.addFinalizer(() => Scope.close(scope, Exit.void));
        const runtimeServices = yield* Layer.build(
          ProviderRegistry.layer.pipe(
            Layer.provideMerge(layerInstanceRegistry),
            Layer.provideMerge(
              ServerConfig.layerTest(process.cwd(), {
                prefix: "control-provider-registry-merged-persist-",
              }),
            ),
            Layer.provideMerge(layerBackgroundPolicyAlwaysRun),
            Layer.provideMerge(NodeServices.layer),
          ),
        ).pipe(Scope.provide(scope));

        yield* Effect.gen(function* () {
          const registry = yield* ProviderRegistry.ProviderRegistry;
          const config = yield* ServerConfig.ServerConfig;
          const filePath = yield* resolveProviderStatusCachePath({
            cacheDir: config.providerStatusCacheDir,
            instanceId: cursorInstanceId,
          });

          assert.deepStrictEqual((yield* registry.getProviders)[0]?.models, [
            ...initialProvider.models,
          ]);
          const persisted = yield* awaitPersistedProvider(registry, refreshedProvider.checkedAt);
          yield* PubSub.publish(changes, refreshedProvider);
          yield* Fiber.join(persisted);
          const cachedProvider = yield* readProviderStatusCache(filePath);

          assert.deepStrictEqual(
            cachedProvider,
            withBundledCompatibility({
              ...refreshedProvider,
              models: [...initialProvider.models],
            }),
          );
        }).pipe(Effect.provide(runtimeServices));
      }),
    );

    it.effect("returns the cached provider list when a manual refresh fails", () =>
      Effect.gen(function* () {
        const codexDriver = ProviderDriverKind.make("codex");
        const codexInstanceId = ProviderInstanceId.make("codex");
        const cachedProvider = {
          instanceId: codexInstanceId,
          driver: codexDriver,
          status: "ready",
          enabled: true,
          installed: true,
          auth: { status: "authenticated" },
          checkedAt: "2026-04-29T10:00:00.000Z",
          version: "1.0.0",
          models: [],
          slashCommands: [],
          skills: [],
        } as const satisfies ServerProvider;
        const instance = {
          instanceId: codexInstanceId,
          driverKind: codexDriver,
          continuationIdentity: {
            driverKind: codexDriver,
            continuationKey: "codex:instance:codex",
          },
          displayName: undefined,
          enabled: true,
          snapshot: {
            resolveMaintenance: () =>
              Effect.succeed(
                makeManualOnlyProviderMaintenanceCapabilities({
                  provider: codexDriver,
                  packageName: null,
                }),
              ),
            getSnapshot: Effect.succeed(cachedProvider),
            refresh: Effect.die(new Error("simulated refresh failure")),
            streamChanges: Stream.empty,
            applyUsageLimits: () => Effect.void,
          },
          orchestrationAdapter: {} as ProviderInstance["orchestrationAdapter"],
          textGeneration: {} as ProviderInstance["textGeneration"],
        } satisfies ProviderInstance;
        const layerInstanceRegistry = Layer.succeed(
          ProviderInstanceRegistry.ProviderInstanceRegistry,
          {
            getInstance: (instanceId) =>
              Effect.succeed(instanceId === codexInstanceId ? instance : undefined),
            listInstances: Effect.succeed([instance]),
            listUnavailable: Effect.succeed([]),
            streamChanges: Stream.empty,
            subscribeChanges: Effect.flatMap(PubSub.unbounded<void>(), (pubsub) =>
              PubSub.subscribe(pubsub),
            ),
          },
        );
        const scope = yield* Scope.make();
        yield* Effect.addFinalizer(() => Scope.close(scope, Exit.void));
        const runtimeServices = yield* Layer.build(
          ProviderRegistry.layer.pipe(
            Layer.provideMerge(layerInstanceRegistry),
            Layer.provideMerge(
              ServerConfig.layerTest(process.cwd(), {
                prefix: "control-provider-registry-refresh-failure-",
              }),
            ),
            Layer.provideMerge(layerBackgroundPolicyAlwaysRun),
            Layer.provideMerge(NodeServices.layer),
          ),
        ).pipe(Scope.provide(scope));

        yield* Effect.gen(function* () {
          const registry = yield* ProviderRegistry.ProviderRegistry;

          assert.deepStrictEqual(yield* registry.getProviders, [
            withBundledCompatibility(cachedProvider),
          ]);
          assert.deepStrictEqual(yield* registry.refresh(codexDriver), [
            withBundledCompatibility(cachedProvider),
          ]);
          assert.deepStrictEqual(yield* registry.refreshInstance(codexInstanceId), [
            withBundledCompatibility(cachedProvider),
          ]);
        }).pipe(Effect.provide(runtimeServices));
      }),
    );

    it.effect("keeps consuming registry changes after one sync fails", () =>
      Effect.gen(function* () {
        const codexDriver = ProviderDriverKind.make("codex");
        const codexInstanceId = ProviderInstanceId.make("codex");
        const claudeDriver = ProviderDriverKind.make("claudeAgent");
        const claudeInstanceId = ProviderInstanceId.make("claudeAgent");
        const codexProvider = {
          instanceId: codexInstanceId,
          driver: codexDriver,
          status: "ready",
          enabled: true,
          installed: true,
          auth: { status: "authenticated" },
          checkedAt: "2026-04-29T10:00:00.000Z",
          version: "1.0.0",
          models: [],
          slashCommands: [],
          skills: [],
        } as const satisfies ServerProvider;
        const claudeProvider = {
          instanceId: claudeInstanceId,
          driver: claudeDriver,
          status: "ready",
          enabled: true,
          installed: true,
          auth: { status: "authenticated" },
          checkedAt: "2026-04-29T10:01:00.000Z",
          version: "1.0.0",
          models: [],
          slashCommands: [],
          skills: [],
        } as const satisfies ServerProvider;
        const makeInstance = (provider: ServerProvider): ProviderInstance => ({
          instanceId: provider.instanceId,
          driverKind: provider.driver,
          continuationIdentity: {
            driverKind: provider.driver,
            continuationKey: `${provider.driver}:instance:${provider.instanceId}`,
          },
          displayName: undefined,
          enabled: true,
          snapshot: {
            resolveMaintenance: () =>
              Effect.succeed(
                makeManualOnlyProviderMaintenanceCapabilities({
                  provider: provider.driver,
                  packageName: null,
                }),
              ),
            getSnapshot: Effect.succeed(provider),
            refresh: Effect.succeed(provider),
            streamChanges: Stream.empty,
            applyUsageLimits: () => Effect.void,
          },
          orchestrationAdapter: {} as ProviderInstance["orchestrationAdapter"],
          textGeneration: {} as ProviderInstance["textGeneration"],
        });
        const codexInstance = makeInstance(codexProvider);
        const claudeInstance = makeInstance(claudeProvider);
        const changes = yield* PubSub.unbounded<void>();
        const instancesRef = yield* Ref.make<ReadonlyArray<ProviderInstance>>([codexInstance]);
        const failNextList = yield* Ref.make(false);
        const wait = () => Effect.yieldNow;
        const layerInstanceRegistry = Layer.succeed(
          ProviderInstanceRegistry.ProviderInstanceRegistry,
          {
            getInstance: (instanceId) =>
              Ref.get(instancesRef).pipe(
                Effect.map((instances) =>
                  instances.find((instance) => instance.instanceId === instanceId),
                ),
              ),
            listInstances: Effect.gen(function* () {
              const shouldFail = yield* Ref.get(failNextList);
              if (shouldFail) {
                yield* Ref.set(failNextList, false);
                return yield* Effect.die(new Error("simulated registry list failure"));
              }
              return yield* Ref.get(instancesRef);
            }),
            listUnavailable: Effect.succeed([]),
            streamChanges: Stream.fromPubSub(changes),
            subscribeChanges: PubSub.subscribe(changes),
          },
        );
        const scope = yield* Scope.make();
        yield* Effect.addFinalizer(() => Scope.close(scope, Exit.void));
        const runtimeServices = yield* Layer.build(
          ProviderRegistry.layer.pipe(
            Layer.provideMerge(layerInstanceRegistry),
            Layer.provideMerge(
              ServerConfig.layerTest(process.cwd(), {
                prefix: "control-provider-registry-sync-failure-",
              }),
            ),
            Layer.provideMerge(layerBackgroundPolicyAlwaysRun),
            Layer.provideMerge(NodeServices.layer),
          ),
        ).pipe(Scope.provide(scope));

        yield* Effect.gen(function* () {
          const registry = yield* ProviderRegistry.ProviderRegistry;
          assert.deepStrictEqual(yield* registry.getProviders, [
            withBundledCompatibility(codexProvider),
          ]);

          yield* Ref.set(failNextList, true);
          yield* PubSub.publish(changes, undefined);

          yield* Ref.set(instancesRef, [codexInstance, claudeInstance]);
          yield* PubSub.publish(changes, undefined);

          let providers = yield* registry.getProviders;
          for (
            let attempt = 0;
            attempt < 50 && !providers.some((provider) => provider.instanceId === claudeInstanceId);
            attempt += 1
          ) {
            yield* wait();
            providers = yield* registry.getProviders;
          }

          assert.deepStrictEqual(
            providers.map((provider) => provider.instanceId).toSorted(),
            [codexInstanceId, claudeInstanceId].toSorted(),
          );
        }).pipe(Effect.provide(runtimeServices));
      }),
    );

    // This test intentionally avoids `mockCommandSpawnerLayer` so the real
    // `checkClaudeProviderStatus` path runs its `claude --version` probe.
    // We point `binaryPath` at a name that cannot exist on any machine so
    // the real `ChildProcessSpawner` deterministically returns ENOENT, which
    // `checkClaudeProviderStatus` turns into the user-visible "not
    // installed" error snapshot. If the aggregator's `syncLiveSources`
    // breaks — the custom-instance-never-probes bug we are guarding
    // against — that snapshot never lands in `getProviders` and the
    // assertions below fail.
    it.effect("propagates real Claude probe failures to the aggregator at boot", () =>
      Effect.gen(function* () {
        const missingBinary = `control_claude_missing_`;
        const serverSettings = yield* makeMutableServerSettingsService(
          decodeServerSettings(
            deepMerge(encodedDefaultServerSettings, {
              providers: {
                // Disable every built-in probe that would otherwise spawn
                // on the CI host. `enabled: false` short-circuits each
                // driver's probe *before* it touches the spawner, so the
                // test environment stays isolated from the dev
                // machine's PATH.
                claudeAgent: { enabled: false },
              },
              // `providerInstances` keys are branded `ProviderInstanceId`;
              // the branded index signature rejects plain string literals
              // at the TS level even though the runtime schema happily
              // accepts + decodes them. Cast the patch to `unknown` so
              // the `Schema.decodeSync` below does the real validation.
              providerInstances: {
                // Matches the shape the user had in `.control/dev/settings.json`
                // when the bug was reported: a custom enabled instance
                // pointing at a binary the server has to actually spawn.
                claude_personal: {
                  driver: "claudeAgent",
                  displayName: "Claude Personal",
                  enabled: true,
                  config: {
                    binaryPath: missingBinary,
                    homePath: `/tmp/${missingBinary}_home`,
                  },
                },
              } as unknown as ContractServerSettings["providerInstances"],
            }),
          ),
        );
        const scope = yield* Scope.make();
        yield* Effect.addFinalizer(() => Scope.close(scope, Exit.void));
        const layerProviderRegistry = ProviderRegistry.layer.pipe(
          Layer.provideMerge(ProviderInstanceRegistryHydration.layer),
          Layer.provideMerge(
            Layer.succeed(ServerSettingsModule.ServerSettingsService, serverSettings),
          ),
          Layer.provideMerge(ServerSecretStore.layer),
          Layer.provideMerge(
            ServerConfig.layerTest(process.cwd(), {
              prefix: "control-provider-registry-",
            }),
          ),
          Layer.provideMerge(layerTestHttpClient),
          Layer.provideMerge(
            Layer.succeed(
              ProviderEventLoggers.ProviderEventLoggers,
              ProviderEventLoggers.NoOpProviderEventLoggers,
            ),
          ),
          Layer.provideMerge(ModelManifest.layerTest),
          Layer.provideMerge(ResetCreditCoordinator.layerTest),
          Layer.provideMerge(layerBackgroundPolicyAlwaysRun),
          // NO spawner mock — `ChildProcessSpawner` is supplied by the
          // outer `NodeServices.layer` on `it.layer(...)` and will
          // genuinely spawn a subprocess. The missing-binary ENOENT is
          // what exercises the same failure mode as a misconfigured
          // production `binaryPath`.
        );
        const runtimeServices = yield* Layer.build(layerProviderRegistry).pipe(
          Scope.provide(scope),
        );

        yield* Effect.gen(function* () {
          const registry = yield* ProviderRegistry.ProviderRegistry;
          let providers = yield* registry.getProviders;
          for (
            let attempts = 0;
            attempts < 50 &&
            providers.find((provider) => provider.instanceId === "claude_personal")?.status !==
              "error";
            attempts += 1
          ) {
            yield* Effect.yieldNow;
            providers = yield* registry.getProviders;
          }
          const claudePersonal = providers.find(
            (provider) => provider.instanceId === "claude_personal",
          );
          assert.notStrictEqual(
            claudePersonal,
            undefined,
            `Expected the aggregator to know about claude_personal; instead saw: ${providers
              .map((provider) => provider.instanceId)
              .join(", ")}`,
          );
          assert.strictEqual(
            claudePersonal?.status,
            "error",
            "Real Claude probe against a missing binary should surface as 'error' in the aggregator",
          );
          assert.strictEqual(claudePersonal?.installed, false);
          assert.strictEqual(
            claudePersonal?.message,
            "Claude Agent CLI (`claude`) was not found on PATH.",
          );
        }).pipe(Effect.provide(runtimeServices));
      }),
    );

    // A binary path change must rebuild Claude and publish its new probe result.
    it.effect("re-probes when settings change the claude binaryPath", () =>
      Effect.gen(function* () {
        const firstMissing = `control_claude_first_`;
        const secondMissing = `control_claude_second_`;
        const spawnedCommands: Array<string> = [];
        const secondProbeStarted = yield* Deferred.make<void>();
        const releaseSecondProbe = yield* Deferred.make<void>();
        const allowLazySettingsStream = yield* Deferred.make<void>();
        const mutableServerSettings = yield* makeMutableServerSettingsService(
          decodeServerSettings(
            deepMerge(encodedDefaultServerSettings, {
              providers: {
                claudeAgent: { enabled: true, binaryPath: firstMissing },
              },
            }),
          ),
        );
        const serverSettings = {
          ...mutableServerSettings,
          streamChanges: Stream.unwrap(
            Deferred.await(allowLazySettingsStream).pipe(
              Effect.as(mutableServerSettings.streamChanges),
            ),
          ),
        } satisfies ServerSettingsModule.ServerSettingsService["Service"];
        const scope = yield* Scope.make();
        yield* Effect.addFinalizer(() => Scope.close(scope, Exit.void));
        const layerProviderRegistry = ProviderRegistry.layer.pipe(
          Layer.provideMerge(ProviderInstanceRegistryHydration.layer),
          Layer.provideMerge(
            Layer.succeed(ServerSettingsModule.ServerSettingsService, serverSettings),
          ),
          Layer.provideMerge(ServerSecretStore.layer),
          Layer.provideMerge(
            ServerConfig.layerTest(process.cwd(), {
              prefix: "control-provider-registry-",
            }),
          ),
          Layer.provideMerge(layerTestHttpClient),
          Layer.provideMerge(
            Layer.succeed(
              ProviderEventLoggers.ProviderEventLoggers,
              ProviderEventLoggers.NoOpProviderEventLoggers,
            ),
          ),
          Layer.provideMerge(ModelManifest.layerTest),
          Layer.provideMerge(ResetCreditCoordinator.layerTest),
          Layer.updateService(ChildProcessSpawner.ChildProcessSpawner, (spawner) =>
            ChildProcessSpawner.make((command) => {
              if (command._tag !== "StandardCommand") return spawner.spawn(command);
              spawnedCommands.push(command.command);
              const beforeSpawn =
                command.command === secondMissing
                  ? Deferred.succeed(secondProbeStarted, undefined).pipe(
                      Effect.andThen(Deferred.await(releaseSecondProbe)),
                    )
                  : Effect.void;
              return beforeSpawn.pipe(Effect.andThen(spawner.spawn(command)));
            }),
          ),
          Layer.provideMerge(NodeServices.layer),
          Layer.provideMerge(layerBackgroundPolicyAlwaysRun),
        );
        const runtimeServices = yield* Layer.build(layerProviderRegistry).pipe(
          Scope.provide(scope),
        );

        yield* Effect.gen(function* () {
          const registry = yield* ProviderRegistry.ProviderRegistry;
          const claudeSnapshots = registry.streamChanges.pipe(
            Stream.map((providers) =>
              providers.find((provider) => provider.instanceId === "claudeAgent"),
            ),
            Stream.filter((provider): provider is ServerProvider => provider !== undefined),
          );
          const firstError = yield* Stream.toPull(
            claudeSnapshots.pipe(Stream.filter((provider) => provider.status === "error")),
          );
          const currentClaude = (yield* registry.getProviders).find(
            (provider) => provider.instanceId === "claudeAgent",
          );
          const initialClaude =
            currentClaude?.status === "error" ? currentClaude : (yield* firstError)[0];
          assert.strictEqual(initialClaude?.status, "error");
          assert.strictEqual(initialClaude?.installed, false);
          assert.deepStrictEqual(spawnedCommands, [firstMissing]);

          const pendingRebuild = yield* Stream.toPull(
            claudeSnapshots.pipe(
              Stream.filter((provider) => provider.status === "warning" && !provider.installed),
            ),
          );
          yield* serverSettings.updateSettings({
            providers: {
              claudeAgent: { enabled: true, binaryPath: secondMissing },
            },
          });
          // Start the lazy stream only after publishing. A watcher that did
          // not subscribe before forking has already lost this update.
          yield* Deferred.succeed(allowLazySettingsStream, undefined);

          // Hold the second probe until the aggregator sees the rebuilt
          // instance. Its next error must come from the new executable.
          yield* Deferred.await(secondProbeStarted);
          yield* pendingRebuild;
          const rebuiltError = yield* Stream.toPull(
            claudeSnapshots.pipe(Stream.filter((provider) => provider.status === "error")),
          );
          yield* Deferred.succeed(releaseSecondProbe, undefined);
          const [reprobedClaude] = yield* rebuiltError;
          assert.deepStrictEqual(spawnedCommands, [firstMissing, secondMissing]);
          assert.strictEqual(reprobedClaude?.status, "error");
          assert.strictEqual(reprobedClaude?.installed, false);
        }).pipe(Effect.provide(runtimeServices));
      }),
    );

    it.effect("includes unavailable instance snapshots in getProviders", () =>
      Effect.gen(function* () {
        const serverSettings = yield* makeMutableServerSettingsService(
          decodeServerSettings(
            deepMerge(encodedDefaultServerSettings, {
              providers: {
                claudeAgent: { enabled: false },
              },
              providerInstances: {
                ghost_main: {
                  driver: "ghostDriver",
                  displayName: "A fork-only driver we don't ship",
                  enabled: false,
                  config: { arbitrary: "payload" },
                },
              } as unknown as ContractServerSettings["providerInstances"],
            }),
          ),
        );
        const scope = yield* Scope.make();
        yield* Effect.addFinalizer(() => Scope.close(scope, Exit.void));
        const layerProviderRegistry = ProviderRegistry.layer.pipe(
          Layer.provideMerge(ProviderInstanceRegistryHydration.layer),
          Layer.provideMerge(
            Layer.succeed(ServerSettingsModule.ServerSettingsService, serverSettings),
          ),
          Layer.provideMerge(ServerSecretStore.layer),
          Layer.provideMerge(
            ServerConfig.layerTest(process.cwd(), {
              prefix: "control-provider-registry-",
            }),
          ),
          Layer.provideMerge(layerTestHttpClient),
          Layer.provideMerge(
            Layer.succeed(
              ProviderEventLoggers.ProviderEventLoggers,
              ProviderEventLoggers.NoOpProviderEventLoggers,
            ),
          ),
          Layer.provideMerge(ModelManifest.layerTest),
          Layer.provideMerge(ResetCreditCoordinator.layerTest),
          Layer.provideMerge(NodeServices.layer),
          Layer.provideMerge(layerBackgroundPolicyAlwaysRun),
        );
        const runtimeServices = yield* Layer.build(layerProviderRegistry).pipe(
          Scope.provide(scope),
        );

        yield* Effect.gen(function* () {
          const registry = yield* ProviderRegistry.ProviderRegistry;
          const providers = yield* registry.getProviders;
          const ghost = providers.find((provider) => provider.instanceId === "ghost_main");

          assert.notStrictEqual(ghost, undefined);
          assert.strictEqual(ghost?.driver, "ghostDriver");
          assert.strictEqual(ghost?.availability, "unavailable");
          assert.match(ghost?.unavailableReason ?? "", /ghostDriver/);
        }).pipe(Effect.provide(runtimeServices));
      }),
    );

    it.effect("lists the default providers when settings use their defaults", () =>
      Effect.gen(function* () {
        const serverSettings = yield* makeMutableServerSettingsService(
          decodeServerSettings(encodedDefaultServerSettings),
        );
        const scope = yield* Scope.make();
        yield* Effect.addFinalizer(() => Scope.close(scope, Exit.void));
        const layerProviderRegistry = ProviderRegistry.layer.pipe(
          Layer.provideMerge(ProviderInstanceRegistryHydration.layer),
          Layer.provideMerge(
            Layer.succeed(ServerSettingsModule.ServerSettingsService, serverSettings),
          ),
          Layer.provideMerge(ServerSecretStore.layer),
          Layer.provideMerge(
            ServerConfig.layerTest(process.cwd(), {
              prefix: "control-provider-registry-",
            }),
          ),
          Layer.provideMerge(layerTestHttpClient),
          Layer.provideMerge(
            Layer.succeed(
              ProviderEventLoggers.ProviderEventLoggers,
              ProviderEventLoggers.NoOpProviderEventLoggers,
            ),
          ),
          Layer.provideMerge(ModelManifest.layerTest),
          Layer.provideMerge(ResetCreditCoordinator.layerTest),
          Layer.provideMerge(layerBackgroundPolicyAlwaysRun),
          Layer.provideMerge(
            layerMockCommandSpawner((command, args) => {
              const joined = args.join(" ");
              if (joined === "--version") {
                return {
                  stdout: `${command} 1.0.0\n`,
                  stderr: "",
                  code: 0,
                };
              }
              if (joined === "auth status") {
                return {
                  stdout: '{"authenticated":true}\n',
                  stderr: "",
                  code: 0,
                };
              }
              throw new Error(`Unexpected args: ${command} ${joined}`);
            }),
          ),
        );
        const runtimeServices = yield* Layer.build(
          Layer.mergeAll(
            Layer.succeed(ServerSettingsModule.ServerSettingsService, serverSettings),
            layerProviderRegistry,
          ),
        ).pipe(Scope.provide(scope));

        yield* Effect.gen(function* () {
          const registry = yield* ProviderRegistry.ProviderRegistry;
          const providers = yield* registry.getProviders;
          assert.deepStrictEqual(providers.map((provider) => provider.instanceId).toSorted(), [
            "claudeAgent",
          ]);
        }).pipe(Effect.provide(runtimeServices));
      }),
    );
  });

  // ── checkClaudeProviderStatus tests ──────────────────────────

  describe("checkClaudeProviderStatus", () => {
    it.effect("returns ready when claude is installed and authenticated", () =>
      Effect.gen(function* () {
        const status = yield* checkClaudeProviderStatus(
          defaultClaudeSettings,
          claudeCapabilities(),
        );
        assert.strictEqual(status.status, "ready");
        assert.strictEqual(status.installed, true);
        assert.strictEqual(status.auth.status, "authenticated");
      }).pipe(
        Effect.provide(
          layerMockSpawner((args) => {
            const joined = args.join(" ");
            if (joined === "--version") return { stdout: "1.0.0\n", stderr: "", code: 0 };
            if (joined === "auth status")
              return {
                stdout: '{"loggedIn":true,"authMethod":"claude.ai"}\n',
                stderr: "",
                code: 0,
              };
            throw new Error(`Unexpected args: ${joined}`);
          }),
        ),
      ),
    );

    it.effect("returns ready and labels Bedrock-backed Claude as authenticated", () =>
      Effect.gen(function* () {
        // Bedrock authenticates via external AWS credentials, so the SDK init
        // reports only `apiProvider` with no subscription or token.
        const status = yield* checkClaudeProviderStatus(
          defaultClaudeSettings,
          claudeCapabilities({ apiProvider: "bedrock" }),
        );
        assert.strictEqual(status.status, "ready");
        assert.strictEqual(status.installed, true);
        assert.strictEqual(status.auth.status, "authenticated");
        assert.strictEqual(status.auth.type, "bedrock");
        assert.strictEqual(status.auth.label, "Amazon Bedrock");
      }).pipe(
        Effect.provide(
          layerMockSpawner((args) => {
            const joined = args.join(" ");
            if (joined === "--version") return { stdout: "1.0.0\n", stderr: "", code: 0 };
            throw new Error(`Unexpected args: ${joined}`);
          }),
        ),
      ),
    );

    it.effect("returns a display label for claude subscription types", () =>
      Effect.gen(function* () {
        const status = yield* checkClaudeProviderStatus(
          defaultClaudeSettings,
          claudeCapabilities({ subscriptionType: "maxplan" }),
        );
        assert.strictEqual(status.status, "ready");
        assert.strictEqual(status.auth.status, "authenticated");
        assert.strictEqual(status.auth.type, "maxplan");
        assert.strictEqual(status.auth.label, "Claude Max Subscription");
      }).pipe(
        Effect.provide(
          layerMockSpawner((args) => {
            const joined = args.join(" ");
            if (joined === "--version") return { stdout: "1.0.0\n", stderr: "", code: 0 };
            if (joined === "auth status")
              return {
                stdout: '{"loggedIn":true,"authMethod":"claude.ai"}\n',
                stderr: "",
                code: 0,
              };
            throw new Error(`Unexpected args: ${joined}`);
          }),
        ),
      ),
    );

    it.effect("reads banked resets only for subscription logins", () =>
      Effect.gen(function* () {
        const check = (overrides: Partial<TestClaudeCapabilities>) =>
          checkClaudeProviderStatus(
            defaultClaudeSettings,
            () =>
              Effect.succeed({
                email: undefined,
                subscriptionType: undefined,
                tokenSource: undefined,
                apiProvider: undefined,
                slashCommands: [],
                usage: { rate_limits_available: true, rate_limits: {} },
                ...overrides,
              }),
            undefined,
            undefined,
            undefined,
            undefined,
            () => Effect.succeed({ availableCount: 2 }),
          );
        const subscription = yield* check({ subscriptionType: "max" });
        const bedrock = yield* check({ apiProvider: "bedrock" });
        assert.deepStrictEqual(subscription.usageLimits?.resetCredits, { availableCount: 2 });
        assert.strictEqual(bedrock.usageLimits?.resetCredits, undefined);
      }).pipe(
        Effect.provide(
          layerMockSpawner((args) => {
            const joined = args.join(" ");
            if (joined === "--version") return { stdout: "1.0.0\n", stderr: "", code: 0 };
            throw new Error(`Unexpected args: ${joined}`);
          }),
        ),
      ),
    );

    it.effect("does not duplicate Claude in full subscription labels", () =>
      Effect.gen(function* () {
        const status = yield* checkClaudeProviderStatus(
          defaultClaudeSettings,
          claudeCapabilities({
            subscriptionType: "Claude Max Subscription",
          }),
        );
        assert.strictEqual(status.auth.status, "authenticated");
        assert.strictEqual(status.auth.type, "Claude Max Subscription");
        assert.strictEqual(status.auth.label, "Claude Max Subscription");
      }).pipe(
        Effect.provide(
          layerMockSpawner((args) => {
            const joined = args.join(" ");
            if (joined === "--version") return { stdout: "1.0.0\n", stderr: "", code: 0 };
            throw new Error(`Unexpected args: ${joined}`);
          }),
        ),
      ),
    );

    it.effect("does not duplicate Claude in provider-prefixed subscription names", () =>
      Effect.gen(function* () {
        const status = yield* checkClaudeProviderStatus(
          defaultClaudeSettings,
          claudeCapabilities({
            subscriptionType: "Claude Max",
          }),
        );
        assert.strictEqual(status.auth.status, "authenticated");
        assert.strictEqual(status.auth.type, "Claude Max");
        assert.strictEqual(status.auth.label, "Claude Max Subscription");
      }).pipe(
        Effect.provide(
          layerMockSpawner((args) => {
            const joined = args.join(" ");
            if (joined === "--version") return { stdout: "1.0.0\n", stderr: "", code: 0 };
            throw new Error(`Unexpected args: ${joined}`);
          }),
        ),
      ),
    );

    it.effect("returns claude auth email from initialization result", () =>
      Effect.gen(function* () {
        const status = yield* checkClaudeProviderStatus(
          defaultClaudeSettings,
          claudeCapabilities({ email: "claude@example.com" }),
        );
        assert.strictEqual(status.auth.status, "authenticated");
        assert.strictEqual(status.auth.email, "claude@example.com");
      }).pipe(
        Effect.provide(
          layerMockSpawner((args) => {
            const joined = args.join(" ");
            if (joined === "--version") return { stdout: "1.0.0\n", stderr: "", code: 0 };
            if (joined === "auth status")
              return {
                stdout:
                  '{"loggedIn":true,"authMethod":"claude.ai","account":{"email":"claude@example.com"}}\n',
                stderr: "",
                code: 0,
              };
            throw new Error(`Unexpected args: ${joined}`);
          }),
        ),
      ),
    );

    it.effect("runs Claude status probes with the configured CLAUDE_CONFIG_DIR", () => {
      const claudeConfigDir = "/tmp/control-claude-home";
      const recorded = recordingMockSpawnerLayer((args) => {
        const joined = args.join(" ");
        if (joined === "--version") return { stdout: "1.0.0\n", stderr: "", code: 0 };
        if (joined === "auth status")
          return {
            stdout: '{"loggedIn":true,"authMethod":"claude.ai"}\n',
            stderr: "",
            code: 0,
          };
        throw new Error(`Unexpected args: ${joined}`);
      });

      return Effect.gen(function* () {
        const status = yield* checkClaudeProviderStatus(
          {
            ...defaultClaudeSettings,
            homePath: claudeConfigDir,
          },
          claudeCapabilities(),
        );
        assert.strictEqual(status.status, "ready");
        // The home is resolved through the host Path before it reaches the env.
        assert.deepStrictEqual(
          recorded.commands.map((command) => command.env?.CLAUDE_CONFIG_DIR),
          [(yield* Path.Path).resolve(claudeConfigDir)],
        );
      }).pipe(Effect.provide(recorded.layer));
    });

    it.effect("includes probed claude slash commands in the provider snapshot", () =>
      Effect.gen(function* () {
        const status = yield* checkClaudeProviderStatus(
          defaultClaudeSettings,
          claudeCapabilities({
            subscriptionType: "maxplan",
            slashCommands: [
              {
                name: "review",
                description: "Review a pull request",
                input: { hint: "pr-or-branch" },
              },
            ],
          }),
        );

        assert.deepStrictEqual(status.slashCommands.slice(1), [
          {
            name: "review",
            description: "Review a pull request",
            input: { hint: "pr-or-branch" },
          },
        ]);
      }).pipe(
        Effect.provide(
          layerMockSpawner((args) => {
            const joined = args.join(" ");
            if (joined === "--version") return { stdout: "1.0.0\n", stderr: "", code: 0 };
            if (joined === "auth status")
              return {
                stdout: '{"loggedIn":true,"authMethod":"claude.ai"}\n',
                stderr: "",
                code: 0,
              };
            throw new Error(`Unexpected args: ${joined}`);
          }),
        ),
      ),
    );

    it.effect("deduplicates probed claude slash commands by name", () =>
      Effect.gen(function* () {
        const status = yield* checkClaudeProviderStatus(
          defaultClaudeSettings,
          claudeCapabilities({
            subscriptionType: "maxplan",
            slashCommands: [
              {
                name: "ui",
                description: "Explore and refine UI",
              },
              {
                name: "ui",
                input: { hint: "component-or-screen" },
              },
            ],
          }),
        );

        assert.deepStrictEqual(status.slashCommands, [
          COMPACT_SLASH_COMMAND,
          {
            name: "ui",
            description: "Explore and refine UI",
            input: { hint: "component-or-screen" },
          },
        ]);
      }).pipe(
        Effect.provide(
          layerMockSpawner((args) => {
            const joined = args.join(" ");
            if (joined === "--version") return { stdout: "1.0.0\n", stderr: "", code: 0 };
            if (joined === "auth status")
              return {
                stdout: '{"loggedIn":true,"authMethod":"claude.ai"}\n',
                stderr: "",
                code: 0,
              };
            throw new Error(`Unexpected args: ${joined}`);
          }),
        ),
      ),
    );

    it.effect("returns an api key label for claude api key auth", () =>
      Effect.gen(function* () {
        const status = yield* checkClaudeProviderStatus(
          defaultClaudeSettings,
          claudeCapabilities({ tokenSource: "ANTHROPIC_AUTH_TOKEN" }),
        );
        assert.strictEqual(status.status, "ready");
        assert.strictEqual(status.auth.status, "authenticated");
        assert.strictEqual(status.auth.type, "apiKey");
        assert.strictEqual(status.auth.label, "Claude API Key");
      }).pipe(
        Effect.provide(
          layerMockSpawner((args) => {
            const joined = args.join(" ");
            if (joined === "--version") return { stdout: "1.0.0\n", stderr: "", code: 0 };
            if (joined === "auth status")
              return {
                stdout: '{"loggedIn":true,"authMethod":"api-key"}\n',
                stderr: "",
                code: 0,
              };
            throw new Error(`Unexpected args: ${joined}`);
          }),
        ),
      ),
    );

    it.effect("returns unavailable when claude is missing", () =>
      Effect.gen(function* () {
        const status = yield* checkClaudeProviderStatus(
          defaultClaudeSettings,
          claudeCapabilities(),
        );
        assert.strictEqual(status.status, "error");
        assert.strictEqual(status.installed, false);
        assert.strictEqual(status.auth.status, "unknown");
        assert.strictEqual(status.message, "Claude Agent CLI (`claude`) was not found on PATH.");
      }).pipe(Effect.provide(layerFailingSpawner("spawn claude ENOENT"))),
    );

    it.effect("returns error when version check fails with non-zero exit code", () => {
      const secretStderr = "Something went wrong: secret-token-value";
      return Effect.gen(function* () {
        const status = yield* checkClaudeProviderStatus(
          defaultClaudeSettings,
          claudeCapabilities(),
        );
        assert.strictEqual(status.status, "error");
        assert.strictEqual(status.installed, true);
        assert.strictEqual(status.message, "Claude Agent CLI is installed but failed to run.");
        assert.ok(!(status.message ?? "").includes(secretStderr));
      }).pipe(
        Effect.provide(
          layerMockSpawner((args) => {
            const joined = args.join(" ");
            if (joined === "--version")
              return {
                stdout: "",
                stderr: secretStderr,
                code: 1,
              };
            throw new Error(`Unexpected args: ${joined}`);
          }),
        ),
      );
    });

    it.effect("returns warning when the Claude initialization result is unavailable", () =>
      Effect.gen(function* () {
        const status = yield* checkClaudeProviderStatus(
          defaultClaudeSettings,
          noClaudeCapabilities,
        );
        assert.strictEqual(status.status, "warning");
        assert.strictEqual(status.installed, true);
        assert.strictEqual(status.auth.status, "unknown");
        assert.strictEqual(
          status.message,
          "Could not verify Claude authentication status from initialization result.",
        );
      }).pipe(
        Effect.provide(
          layerMockSpawner((args) => {
            const joined = args.join(" ");
            if (joined === "--version") return { stdout: "1.0.0\n", stderr: "", code: 0 };
            if (joined === "auth status")
              return {
                stdout: '{"loggedIn":false}\n',
                stderr: "",
                code: 1,
              };
            throw new Error(`Unexpected args: ${joined}`);
          }),
        ),
      ),
    );
  });
});
