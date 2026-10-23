import { describe, it, assert } from "@effect/vitest";
import {
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
  type ServerProviderUpdateState,
} from "@control/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";

import * as ProviderSessionManager from "../orchestration-v2/ProviderSessionManager.ts";
import * as ProviderMaintenanceRunner from "./providerMaintenanceRunner.ts";
import * as ProviderRegistry from "./ProviderRegistry.ts";
import * as ProviderSessionUpdates from "./ProviderSessionUpdates.ts";

const CLAUDE = ProviderDriverKind.make("claudeAgent");
const INSTANCE = ProviderInstanceId.make("claudeAgent");
const RUNNING = "2.1.300";
const LATEST = "2.1.305";

/** Claude installed at 2.1.304 with 2.1.305 on offer; the live chats run 2.1.300. */
const claude: ServerProvider = {
  instanceId: INSTANCE,
  driver: CLAUDE,
  enabled: true,
  installed: true,
  version: "2.1.304",
  status: "ready",
  auth: { status: "authenticated" },
  checkedAt: "2026-10-20T10:00:00.000Z",
  models: [],
  slashCommands: [],
  skills: [],
  versionAdvisory: {
    status: "behind_latest",
    currentVersion: "2.1.304",
    latestVersion: LATEST,
    updateCommand: "claude update",
    canUpdate: true,
    checkedAt: "2026-10-20T10:00:00.000Z",
    message: null,
  },
};

const updateState = (status: ServerProviderUpdateState["status"]): ServerProviderUpdateState => ({
  status,
  startedAt: null,
  finishedAt: null,
  message: null,
  output: null,
});

const unused = () => Effect.die("unused");

/**
 * The registry, live sessions and installer around the service. An install either lands LATEST or
 * fails; `moves` records the installed version each Update moved the chats onto.
 */
const run = <A, E>(
  provider: ServerProvider,
  installSucceeds: boolean,
  body: (service: ProviderSessionUpdates.ProviderSessionUpdates["Service"]) => Effect.Effect<A, E>,
) =>
  Effect.gen(function* () {
    const providers = yield* Ref.make<ReadonlyArray<ServerProvider>>([provider]);
    const installs = yield* Ref.make(0);
    const moves = yield* Ref.make<ReadonlyArray<string>>([]);
    const result = yield* Effect.gen(function* () {
      return yield* body(yield* ProviderSessionUpdates.ProviderSessionUpdates);
    }).pipe(
      Effect.provide(
        ProviderSessionUpdates.layer.pipe(
          Layer.provide(
            Layer.mergeAll(
              Layer.succeed(ProviderRegistry.ProviderRegistry, {
                getProviders: Ref.get(providers),
                refresh: unused,
                refreshInstance: unused,
                refreshWorkspaceSnapshot: unused,
                getProviderMaintenanceCapabilitiesForInstance: unused,
                setProviderMaintenanceActionState: unused,
                streamChanges: Stream.empty,
              }),
              Layer.succeed(
                ProviderSessionManager.ProviderSessionManagerV2,
                ProviderSessionManager.ProviderSessionManagerV2.of({
                  shutdown: Effect.void,
                  open: unused,
                  get: unused,
                  close: unused,
                  closeInstance: unused,
                  release: unused,
                  detach: unused,
                  updateOutdated: ({ installedVersion, apply }) =>
                    Effect.gen(function* () {
                      if (apply) yield* Ref.update(moves, (list) => [...list, installedVersion]);
                      const behind = installedVersion !== RUNNING && !apply;
                      return { outdated: behind ? 1 : 0, waiting: 0, runningVersion: RUNNING };
                    }),
                }),
              ),
              Layer.succeed(ProviderMaintenanceRunner.ProviderMaintenanceRunner, {
                updateProvider: () =>
                  Effect.gen(function* () {
                    yield* Ref.update(installs, (count) => count + 1);
                    const next = yield* Ref.updateAndGet(providers, (list) =>
                      list.map((entry) =>
                        installSucceeds
                          ? { ...entry, version: LATEST, updateState: updateState("succeeded") }
                          : { ...entry, updateState: updateState("failed") },
                      ),
                    );
                    return { providers: next };
                  }),
              }),
            ),
          ),
        ),
      ),
    );
    return { result, installs: yield* Ref.get(installs), moves: yield* Ref.get(moves) };
  });

describe("ProviderSessionUpdates", () => {
  it.effect("the note's Update installs the newer Claude on offer, then moves chats onto it", () =>
    Effect.gen(function* () {
      const { installs, moves } = yield* run(claude, true, (service) => service.update);
      assert.strictEqual(installs, 1);
      assert.strictEqual(moves.at(-1), LATEST);
    }),
  );

  it.effect("the note's Update starts no second install while one is running", () =>
    Effect.gen(function* () {
      const { installs, moves } = yield* run(
        { ...claude, updateState: updateState("running") },
        true,
        (service) => service.update,
      );
      assert.strictEqual(installs, 0);
      assert.deepStrictEqual(moves, ["2.1.304"]);
    }),
  );

  it.effect("an install from the toast moves the chats once it succeeds", () =>
    Effect.gen(function* () {
      const { moves } = yield* run(claude, true, (service) =>
        service.updateProvider({ provider: CLAUDE, instanceId: INSTANCE }),
      );
      assert.deepStrictEqual(moves, [LATEST]);
    }),
  );

  it.effect("a failed install leaves the chats where they are", () =>
    Effect.gen(function* () {
      const { moves } = yield* run(claude, false, (service) =>
        service.updateProvider({ provider: CLAUDE, instanceId: INSTANCE }),
      );
      assert.deepStrictEqual(moves, []);
    }),
  );
});
