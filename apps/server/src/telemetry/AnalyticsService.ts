/**
 * Local telemetry service.
 *
 * Buffers events in memory and appends them, one JSON object per line, to
 * `telemetry.jsonl` in the server's state folder. CONTROL keeps telemetry
 * local only (HANDOFF-v2 §4): nothing leaves the machine, and later sessions
 * read the file to tune CONTROL. The file rotates to `telemetry.1.jsonl` once
 * it passes MAX_FILE_BYTES.
 *
 * @module AnalyticsService
 */
import { HostProcessArchitecture, HostProcessPlatform } from "@control/shared/hostProcess";
import type { ClientOs } from "@control/contracts";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Semaphore from "effect/Semaphore";

import packageJson from "../../package.json" with { type: "json" };
import * as ServerConfig from "../config.ts";

interface BufferedAnalyticsEvent {
  readonly uuid: string;
  readonly event: string;
  readonly properties?: Readonly<Record<string, unknown>>;
  readonly capturedAt: string;
}

const FLUSH_INTERVAL_MS = 1_000;
/** Past this size the file rotates, keeping one previous file. */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const TelemetryEnvConfig = Config.all({
  enabled: Config.Boolean("CONTROL_TELEMETRY_ENABLED").pipe(Config.withDefault(true)),
  maxBufferedEvents: Config.Number("CONTROL_TELEMETRY_MAX_BUFFERED_EVENTS").pipe(
    Config.withDefault(1_000),
  ),
});

export class AnalyticsService extends Context.Service<
  AnalyticsService,
  {
    /** Record an event for best-effort buffered local storage. */
    readonly record: (
      event: string,
      properties?: Readonly<Record<string, unknown>>,
    ) => Effect.Effect<void>;

    /** Write all currently queued telemetry events. */
    readonly flush: Effect.Effect<void>;
  }
>()("@control/server/telemetry/AnalyticsService") {
  /** No-op layer for callers that intentionally disable telemetry. */
  static readonly layerTest = Layer.succeed(
    AnalyticsService,
    AnalyticsService.of({
      record: () => Effect.void,
      flush: Effect.void,
    }),
  );
}

function serverOsFromNodePlatform(platform: string): ClientOs {
  switch (platform) {
    case "darwin":
      return "macOS";
    case "win32":
      return "Windows";
    case "linux":
      return "Linux";
    case "android":
      return "Android";
    default:
      return "other";
  }
}

/** @public Service construction is part of the canonical Effect module API. */
export const make = Effect.gen(function* () {
  const telemetryConfig = yield* TelemetryEnvConfig;
  const serverConfig = yield* ServerConfig.ServerConfig;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const crypto = yield* Crypto.Crypto;
  const bufferRef = yield* Ref.make<ReadonlyArray<BufferedAnalyticsEvent>>([]);
  // The background flush and the shutdown flush must not write the same events twice.
  const flushLock = yield* Semaphore.make(1);
  const clientType = serverConfig.mode === "desktop" ? "desktop-app" : "cli-web-client";
  const hostPlatform = yield* HostProcessPlatform;
  const hostArchitecture = yield* HostProcessArchitecture;
  const filePath = path.join(serverConfig.stateDir, "telemetry.jsonl");
  const previousFilePath = path.join(serverConfig.stateDir, "telemetry.1.jsonl");

  const enqueueBufferedEvent = (
    uuid: string,
    event: string,
    properties?: Readonly<Record<string, unknown>>,
  ) =>
    Effect.flatMap(DateTime.now, (now) =>
      Ref.modify(bufferRef, (current) => {
        const appended = [
          ...current,
          {
            uuid,
            event,
            ...(properties ? { properties } : {}),
            capturedAt: DateTime.formatIso(now),
          } satisfies BufferedAnalyticsEvent,
        ];

        const next =
          appended.length > telemetryConfig.maxBufferedEvents
            ? appended.slice(appended.length - telemetryConfig.maxBufferedEvents)
            : appended;

        return [
          {
            size: next.length,
            dropped: next.length !== appended.length,
          } as const,
          next,
        ] as const;
      }),
    );

  const toLine = (event: BufferedAnalyticsEvent) =>
    JSON.stringify({
      uuid: event.uuid,
      event: event.event,
      timestamp: event.capturedAt,
      properties: {
        ...event.properties,
        platform: hostPlatform,
        arch: hostArchitecture,
        appVersion: packageJson.version,
        clientType,
        serverOs: serverOsFromNodePlatform(hostPlatform),
        serverMode: serverConfig.mode,
      },
    });

  const writeEvents = Effect.fn("AnalyticsService.writeEvents")(function* (
    events: ReadonlyArray<BufferedAnalyticsEvent>,
  ) {
    yield* fileSystem.makeDirectory(serverConfig.stateDir, { recursive: true });
    const size = yield* fileSystem.stat(filePath).pipe(
      Effect.map((info) => Number(info.size)),
      Effect.orElseSucceed(() => 0),
    );
    if (size > MAX_FILE_BYTES) {
      yield* fileSystem.rename(filePath, previousFilePath);
    }
    yield* fileSystem.writeFileString(filePath, `${events.map(toLine).join("\n")}\n`, {
      flag: "a",
    });
  });

  // Writes everything buffered. Telemetry is best effort: a failed write is dropped.
  const flush: AnalyticsService["Service"]["flush"] = Effect.gen(function* () {
    const events = yield* Ref.getAndSet(bufferRef, []);
    if (events.length === 0) return;
    const written = yield* Effect.exit(writeEvents(events));
    if (Exit.isFailure(written)) {
      yield* Effect.logDebug("Failed to write telemetry events; dropped", {
        events: events.length,
        cause: written.cause,
      });
    }
  }).pipe(flushLock.withPermit);

  const record: AnalyticsService["Service"]["record"] = Effect.fn("AnalyticsService.record")(
    function* (event, properties) {
      if (!telemetryConfig.enabled) return;

      // An event without a uuid is not kept. The Node implementation throws
      // (a defect) rather than failing, so catch both.
      const uuid = yield* Effect.exit(crypto.randomUUIDv7);
      if (Exit.isFailure(uuid)) return;

      const enqueueResult = yield* enqueueBufferedEvent(uuid.value, event, properties);
      if (enqueueResult.dropped) {
        yield* Effect.logDebug("analytics buffer full; dropping oldest event", {
          size: enqueueResult.size,
          event,
        });
      }
    },
  );

  yield* Effect.forever(Effect.sleep(FLUSH_INTERVAL_MS).pipe(Effect.flatMap(() => flush)), {
    disableYield: true,
  }).pipe(Effect.forkScoped);

  yield* Effect.addFinalizer(() => flush);

  return AnalyticsService.of({ record, flush });
});

export const layer = Layer.effect(AnalyticsService, make);
