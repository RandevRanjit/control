import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { writeFileStringAtomically } from "../atomicWrite.ts";
import * as ServerConfig from "../config.ts";
import { addClaudeSettingsHook } from "../provider/ClaudeSettingsFile.ts";

/** Set in the environment of CONTROL's own Claude chats, so the lock's hook lets them pass. */
export const CONTROL_CHAT_ENV = "CONTROL_CHAT";

const shellQuote = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`;

/**
 * The hook terminal claude runs on each new prompt (design/hybrid/HANDOFF.md §16.5): while the
 * lock file holds a time ahead, it refuses the prompt with JSON on stdout, since Claude Code
 * prints an exit-2 block behind the hook's path. POSIX sh, so it needs no runtime; `date -j` and
 * `-r` are BSD's, `-d` GNU's.
 */
export const lockHookScript = (lockPath: string) => `#!/bin/sh
# CONTROL's lock, written by CONTROL: terminal claude runs this on each new prompt.
[ -n "$${CONTROL_CHAT_ENV}" ] && exit 0
until=$(sed -n 's/.*"until"[[:space:]]*:[[:space:]]*"\\([0-9T:-]\\{19\\}\\).*/\\1/p' ${shellQuote(lockPath)} 2>/dev/null)
[ -n "$until" ] || exit 0
end=$(date -j -u -f '%Y-%m-%dT%H:%M:%S' "$until" +%s 2>/dev/null || date -u -d "\${until}Z" +%s 2>/dev/null) || exit 0
[ "$end" -gt "$(date +%s)" ] || exit 0
at=$(date -r "$end" +%H:%M 2>/dev/null || date -d "@$end" +%H:%M)
day=$(date -r "$end" +%Y%m%d 2>/dev/null || date -d "@$end" +%Y%m%d)
[ "$day" = "$(date +%Y%m%d)" ] || at="$at tomorrow"
printf '{"decision":"block","reason":"CONTROL is locked until %s. Nothing lifts it early."}\\n' "$at"
`;

export class ClaudeLockHookError extends Schema.TaggedError<ClaudeLockHookError>()(
  "ClaudeLockHookError",
  { cause: Schema.Defect() },
) {
  override get message(): string {
    const detail = this.cause instanceof Error ? ` ${this.cause.message}` : "";
    return `Failed to add the lock's hook for terminal claude.${detail}`;
  }
}

export class ClaudeLockHook extends Context.Service<
  ClaudeLockHook,
  {
    /** Writes the hook beside the lock file and adds it to Claude's user settings if missing. */
    readonly install: Effect.Effect<void, ClaudeLockHookError>;
  }
>()("@control/server/lock/ClaudeLockHook") {}

const make = Effect.gen(function* () {
  const { lockPath } = yield* ServerConfig.ServerConfig;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const scriptPath = path.join(path.dirname(lockPath), "lock-hook.sh");
  return ClaudeLockHook.of({
    install: Effect.gen(function* () {
      yield* writeFileStringAtomically({
        filePath: scriptPath,
        contents: lockHookScript(lockPath),
      });
      yield* addClaudeSettingsHook("UserPromptSubmit", `sh ${shellQuote(scriptPath)}`);
    }).pipe(
      Effect.provideService(FileSystem.FileSystem, fileSystem),
      Effect.provideService(Path.Path, path),
      Effect.mapError((cause) => new ClaudeLockHookError({ cause })),
    ),
  });
});

export const layer = Layer.effect(ClaudeLockHook, make);
