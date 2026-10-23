import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as Schema from "effect/Schema";

export class DesktopUserDataInitializationError extends Schema.TaggedError<DesktopUserDataInitializationError>()(
  "DesktopUserDataInitializationError",
  {
    operation: Schema.Literals(["inspect"]),
    resourcePath: Schema.String,
    category: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message() {
    return `Could not initialize Electron user data during ${this.operation} at ${this.resourcePath} (${this.category}).`;
  }

  static fromFileSystem(
    cause: PlatformError.PlatformError,
    operation: DesktopUserDataInitializationError["operation"],
    resourcePath: string,
  ) {
    return new DesktopUserDataInitializationError({
      operation,
      resourcePath,
      category: cause.reason._tag,
      cause,
    });
  }
}

/** Electron's profile folder under app data, and the one the app's old name left behind. */
export const profileNames = (isDevelopment: boolean) =>
  isDevelopment
    ? { current: "control-dev", previous: "t3code-dev" }
    : { current: "control-desktop", previous: "t3code-v2" };

// Browser panel partitions (BrowserSession.ts) are folders under Partitions/.
const PREVIOUS_PARTITION_PREFIX = "t3code-preview-";
const PARTITION_PREFIX = "control-preview-";

/**
 * Selects Electron's profile, apart from the server's CONTROL home. The first
 * launch copies the previous profile (browser panel logins, renderer storage)
 * and keeps the original as the backup. A copy that fails leaves nothing
 * behind, runs this launch on the original and is tried again next launch.
 */
export const resolveUserDataPath = Effect.fn("desktop.userData.resolveUserDataPath")(
  function* (input: { readonly appDataDirectory: string; readonly isDevelopment: boolean }) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const names = profileNames(input.isDevelopment);
    const currentPath = path.join(input.appDataDirectory, names.current);
    const previousPath = path.join(input.appDataDirectory, names.previous);
    const inspect = (resourcePath: string) =>
      fs
        .exists(resourcePath)
        .pipe(
          Effect.mapError((cause) =>
            DesktopUserDataInitializationError.fromFileSystem(cause, "inspect", resourcePath),
          ),
        );
    if (yield* inspect(currentPath)) return currentPath;
    if (!(yield* inspect(previousPath))) return currentPath;
    const partialPath = `${currentPath}.partial`;
    const partitions = path.join(partialPath, "Partitions");
    return yield* Effect.gen(function* () {
      yield* fs.remove(partialPath, { recursive: true, force: true });
      yield* fs.copy(previousPath, partialPath, { preserveTimestamps: true });
      if (yield* fs.exists(partitions)) {
        for (const name of yield* fs.readDirectory(partitions)) {
          if (!name.startsWith(PREVIOUS_PARTITION_PREFIX)) continue;
          yield* fs.rename(
            path.join(partitions, name),
            path.join(partitions, PARTITION_PREFIX + name.slice(PREVIOUS_PARTITION_PREFIX.length)),
          );
        }
      }
      yield* fs.rename(partialPath, currentPath);
      return currentPath;
    }).pipe(
      Effect.catch((error) =>
        Effect.logWarning("Could not copy the previous Electron profile", error).pipe(
          Effect.andThen(fs.remove(partialPath, { recursive: true, force: true })),
          Effect.ignore,
          Effect.as(previousPath),
        ),
      ),
    );
  },
);
