import { fromLenientJson } from "@control/shared/schemaJson";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

// Event → matcher entries → handlers, the shape of a settings file's `hooks` and of a
// plugin's hooks/hooks.json. Lenient because these files are hand-edited.
const decodeHookFile = Schema.decodeUnknownEffect(
  fromLenientJson(
    Schema.Struct({
      hooks: Schema.optional(
        Schema.Record(
          Schema.String,
          Schema.Array(
            Schema.Struct({
              matcher: Schema.optional(Schema.String),
              hooks: Schema.Array(Schema.Unknown),
            }),
          ),
        ),
      ),
    }),
  ),
);

/** What a handler runs: a command's line, a prompt's text, a URL, else its type. */
function handlerCommand(handler: unknown): string {
  for (const key of ["command", "prompt", "url", "type"]) {
    const value: unknown =
      typeof handler === "object" && handler !== null ? Reflect.get(handler, key) : undefined;
    if (typeof value === "string" && value.length > 0) return value;
  }
  return "hook";
}

/**
 * Each hook handler a Claude session in `cwd` runs, for the head's Hooks list: the user's,
 * the project's and the local settings, then each loaded plugin's hooks/hooks.json. A
 * missing or unreadable file adds none; a session rooted at the Claude home's parent reads
 * that file once. `source` is user, project, local, or the plugin's name.
 */
export const claudeHooks = Effect.fn("claudeHooks")(function* (input: {
  readonly claudeHome: string;
  readonly cwd: string;
  readonly plugins: ReadonlyArray<{ readonly name: string; readonly path: string }>;
}) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const files = new Map<string, string>();
  for (const [file, source] of [
    [path.join(input.claudeHome, "settings.json"), "user"],
    [path.join(input.cwd, ".claude", "settings.json"), "project"],
    [path.join(input.cwd, ".claude", "settings.local.json"), "local"],
    ...input.plugins.map((plugin) => [path.join(plugin.path, "hooks", "hooks.json"), plugin.name]),
  ] as const) {
    if (!files.has(file)) files.set(file, source);
  }
  const hooks: Array<{
    readonly event: string;
    readonly matcher?: string;
    readonly command: string;
    readonly source: string;
  }> = [];
  for (const [file, source] of files) {
    const parsed = yield* fileSystem.readFileString(file).pipe(
      Effect.flatMap(decodeHookFile),
      Effect.orElseSucceed(() => undefined),
    );
    for (const [event, entries] of Object.entries(parsed?.hooks ?? {})) {
      for (const entry of entries) {
        for (const handler of entry.hooks) {
          hooks.push({
            event,
            ...(entry.matcher === undefined || entry.matcher.length === 0
              ? {}
              : { matcher: entry.matcher }),
            command: handlerCommand(handler),
            source,
          });
        }
      }
    }
  }
  return hooks;
});
