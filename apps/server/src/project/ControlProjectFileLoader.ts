/**
 * ControlProjectFileLoader - Effect service that loads the checked-in `control.json`
 * project file from a workspace root.
 *
 * Loading is best-effort: a missing file resolves to `Option.none`, and
 * unreadable or invalid files are logged and treated as absent so callers
 * can fall back to their defaults.
 *
 * @module ControlProjectFileLoader
 */
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { CONTROL_PROJECT_FILE_NAME, type ControlProjectFile } from "@control/contracts";
import { ControlProjectFileFromJson } from "@control/shared/controlProjectFile";

const decodeControlProjectFileJson = Schema.decodeEffect(ControlProjectFileFromJson);

export class ControlProjectFileLoadError extends Schema.TaggedError<ControlProjectFileLoadError>()(
  "ControlProjectFileLoadError",
  {
    operation: Schema.Literals(["read", "decode"]),
    workspaceRoot: Schema.String,
    filePath: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to ${this.operation} ${CONTROL_PROJECT_FILE_NAME} at ${this.filePath}.`;
  }
}

/** Service tag for control.json project file loading. */
export class ControlProjectFileLoader extends Context.Service<
  ControlProjectFileLoader,
  {
    /**
     * Load and decode `control.json` at the workspace root.
     *
     * Never fails: missing, unreadable, or invalid files resolve to
     * `Option.none` (invalid files are logged as warnings).
     */
    readonly load: (workspaceRoot: string) => Effect.Effect<Option.Option<ControlProjectFile>>;
  }
>()("@control/server/project/ControlProjectFileLoader") {}

const logControlProjectFileLoadError = (error: ControlProjectFileLoadError) =>
  Effect.logWarning(error).pipe(
    Effect.annotateLogs({
      operation: error.operation,
      workspaceRoot: error.workspaceRoot,
      filePath: error.filePath,
      errorTag: error._tag,
    }),
  );

/** @public Service construction is part of the canonical Effect module API. */
export const make = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const load: ControlProjectFileLoader["Service"]["load"] = Effect.fn(
    "ControlProjectFileLoader.load",
  )(function* (workspaceRoot) {
    const filePath = path.join(workspaceRoot, CONTROL_PROJECT_FILE_NAME);
    const raw = yield* fileSystem.readFileString(filePath).pipe(
      Effect.asSome,
      Effect.catchTags({
        PlatformError: (error) =>
          error.reason._tag === "NotFound"
            ? Effect.succeed(Option.none<string>())
            : logControlProjectFileLoadError(
                new ControlProjectFileLoadError({
                  operation: "read",
                  workspaceRoot,
                  filePath,
                  cause: error,
                }),
              ).pipe(Effect.as(Option.none<string>())),
      }),
    );
    if (Option.isNone(raw)) {
      return Option.none<ControlProjectFile>();
    }
    return yield* decodeControlProjectFileJson(raw.value).pipe(
      Effect.asSome,
      Effect.catchTags({
        SchemaError: (error) =>
          logControlProjectFileLoadError(
            new ControlProjectFileLoadError({
              operation: "decode",
              workspaceRoot,
              filePath,
              cause: error,
            }),
          ).pipe(Effect.as(Option.none<ControlProjectFile>())),
      }),
    );
  });

  return ControlProjectFileLoader.of({ load });
});

export const layer = Layer.effect(ControlProjectFileLoader, make);
