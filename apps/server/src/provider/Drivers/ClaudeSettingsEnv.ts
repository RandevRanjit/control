import { fromLenientJson } from "@control/shared/schemaJson";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

const decodeSettingsEnv = Schema.decodeUnknownEffect(
  fromLenientJson(
    Schema.Struct({
      env: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
    }),
  ),
);

/**
 * The value a Claude session in `cwd` sees for env var `name`. The CLI copies each settings
 * file's `env` over the env it was spawned with: the user's, then the project's, then the
 * local settings. A missing or unreadable file changes nothing.
 */
export const readClaudeSettingsEnvVar = Effect.fn("readClaudeSettingsEnvVar")(function* (input: {
  readonly claudeHome: string;
  readonly cwd: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly name: string;
}) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  let value = input.environment[input.name];
  for (const file of [
    path.join(input.claudeHome, "settings.json"),
    path.join(input.cwd, ".claude", "settings.json"),
    path.join(input.cwd, ".claude", "settings.local.json"),
  ]) {
    const parsed = yield* fileSystem.readFileString(file).pipe(
      Effect.flatMap(decodeSettingsEnv),
      Effect.orElseSucceed(() => undefined),
    );
    const set = parsed?.env?.[input.name];
    if (typeof set === "string" || typeof set === "number") value = String(set);
  }
  return value;
});
