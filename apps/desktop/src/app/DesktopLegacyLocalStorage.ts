import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";

import { readChromiumLocalStorage } from "./chromiumLocalStorage.ts";
import * as DesktopEnvironment from "./DesktopEnvironment.ts";
import * as DesktopUserData from "./DesktopUserData.ts";

/**
 * Carries the renderer's localStorage (prompt stash, unsent drafts, layout,
 * theme) over from the renderer origin used before the rename to `ctrl://`,
 * which the rename left behind in the previous profile (DesktopUserData), which is only read.
 *
 * `load` runs before the window opens; the preload takes the items once,
 * merges them into the new origin, and calls `complete`, which writes a
 * marker so later launches skip the read. A failed read or merge, or a window
 * that never completes, leaves no marker and retries next launch.
 */
export class DesktopLegacyLocalStorage extends Context.Service<
  DesktopLegacyLocalStorage,
  {
    readonly load: (userDataPath: string) => Effect.Effect<void>;
    readonly take: Effect.Effect<Option.Option<Readonly<Record<string, string>>>>;
    readonly complete: Effect.Effect<void>;
  }
>()("@control/desktop/app/DesktopLegacyLocalStorage") {}

// The copied profile also holds the marker of the earlier V1 import.
const MARKER_FILE_NAME = "previous-origin-local-storage-imported";

const make = Effect.gen(function* () {
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const items = yield* Ref.make(Option.none<Readonly<Record<string, string>>>());
  const markerPath = yield* Ref.make(Option.none<string>());

  const writeMarker = Effect.gen(function* () {
    const marker = yield* Ref.get(markerPath);
    if (Option.isNone(marker)) return;
    yield* fs
      .writeFileString(marker.value, "")
      .pipe(
        Effect.catch((error) =>
          Effect.logWarning("Could not record the previous Local Storage import", error),
        ),
      );
  });

  const load = Effect.fn("desktop.legacyLocalStorage.load")(function* (userDataPath: string) {
    const marker = path.join(userDataPath, MARKER_FILE_NAME);
    if (yield* fs.exists(marker).pipe(Effect.orElseSucceed(() => true))) return;
    yield* Ref.set(markerPath, Option.some(marker));
    const directory = path.join(
      environment.appDataDirectory,
      DesktopUserData.profileNames(environment.isDevelopment).previous,
      "Local Storage",
      "leveldb",
    );
    if (!(yield* fs.exists(directory).pipe(Effect.orElseSucceed(() => false)))) {
      return yield* writeMarker;
    }
    const origin = environment.isDevelopment ? "t3code-dev://app" : "t3code://app";
    const read = yield* readChromiumLocalStorage(directory, origin).pipe(
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
      Effect.tapError((error) =>
        Effect.logWarning(
          "Could not read the previous Local Storage; will retry next launch",
          error,
        ),
      ),
      Effect.option,
    );
    if (Option.isNone(read)) return;
    yield* Effect.logInfo("Previous Local Storage ready to import", {
      directory,
      keys: read.value.size,
    });
    yield* Ref.set(items, Option.some(Object.fromEntries(read.value)));
  });

  return DesktopLegacyLocalStorage.of({
    load,
    // Taking clears the items, so a reload before `complete` cannot merge twice.
    take: Ref.getAndSet(items, Option.none()),
    complete: writeMarker,
  });
});

export const layer = Layer.effect(DesktopLegacyLocalStorage, make);
