import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { HostProcessArchitecture, HostProcessPlatform } from "@control/shared/hostProcess";

import * as ServerConfig from "../config.ts";
import * as AnalyticsService from "./AnalyticsService.ts";

const layerAnalytics = (prefix: string, enabled: boolean) =>
  AnalyticsService.layer.pipe(
    Layer.provideMerge(ServerConfig.ServerConfig.layerTest(process.cwd(), { prefix })),
    Layer.provide(
      ConfigProvider.layer(ConfigProvider.fromUnknown({ CONTROL_TELEMETRY_ENABLED: enabled })),
    ),
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(HostProcessPlatform, "darwin"),
        Layer.succeed(HostProcessArchitecture, "arm64"),
      ),
    ),
  );

const telemetryFile = Effect.gen(function* () {
  const config = yield* ServerConfig.ServerConfig;
  const path = yield* Path.Path;
  return {
    current: path.join(config.stateDir, "telemetry.jsonl"),
    previous: path.join(config.stateDir, "telemetry.1.jsonl"),
  };
});

it.layer(NodeServices.layer)("AnalyticsService", (it) => {
  it.effect("writes every recorded event to the local file as a JSON line", () =>
    Effect.gen(function* () {
      const analytics = yield* AnalyticsService.AnalyticsService;
      const fileSystem = yield* FileSystem.FileSystem;
      const files = yield* telemetryFile;
      for (let index = 0; index < 3; index += 1) {
        yield* analytics.record("test.local", { index });
      }
      yield* analytics.flush;

      const lines = (yield* fileSystem.readFileString(files.current)).trim().split("\n");
      assert.equal(lines.length, 3);
      const events = lines.map(
        (line) =>
          JSON.parse(line) as {
            event: string;
            uuid: string;
            properties: { index: number; serverOs: string; serverMode: string };
          },
      );
      assert.deepEqual(
        events.map((event) => [event.event, event.properties.index]),
        [
          ["test.local", 0],
          ["test.local", 1],
          ["test.local", 2],
        ],
      );
      assert.equal(events[0]!.properties.serverOs, "macOS");
      assert.equal(new Set(events.map((event) => event.uuid)).size, 3);

      // A second flush appends; it never rewrites earlier events.
      yield* analytics.record("test.local", { index: 3 });
      yield* analytics.flush;
      const after = (yield* fileSystem.readFileString(files.current)).trim().split("\n");
      assert.equal(after.length, 4);
    }).pipe(Effect.provide(layerAnalytics("control-telemetry-local-", true))),
  );

  it.effect("writes nothing when telemetry is disabled", () =>
    Effect.gen(function* () {
      const analytics = yield* AnalyticsService.AnalyticsService;
      const fileSystem = yield* FileSystem.FileSystem;
      const files = yield* telemetryFile;
      yield* analytics.record("test.disabled");
      yield* analytics.flush;
      assert.isFalse(yield* fileSystem.exists(files.current));
    }).pipe(Effect.provide(layerAnalytics("control-telemetry-disabled-", false))),
  );

  it.effect("rotates a full file, keeping one previous file", () =>
    Effect.gen(function* () {
      const analytics = yield* AnalyticsService.AnalyticsService;
      const fileSystem = yield* FileSystem.FileSystem;
      const config = yield* ServerConfig.ServerConfig;
      const files = yield* telemetryFile;
      yield* fileSystem.makeDirectory(config.stateDir, { recursive: true });
      yield* fileSystem.writeFileString(files.current, "x".repeat(10 * 1024 * 1024 + 1));

      yield* analytics.record("test.rotated");
      yield* analytics.flush;

      const current = (yield* fileSystem.readFileString(files.current)).trim().split("\n");
      assert.equal(current.length, 1);
      assert.equal((JSON.parse(current[0]!) as { event: string }).event, "test.rotated");
      assert.isTrue(yield* fileSystem.exists(files.previous));
    }).pipe(Effect.provide(layerAnalytics("control-telemetry-rotate-", true))),
  );
});
