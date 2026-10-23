import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";

import { resolveClaudeHomePath } from "../provider/Drivers/ClaudeHome.ts";
import * as Scheduler from "../scheduling/Scheduler.ts";
import * as ServerSettings from "../serverSettings.ts";

/** `housekeeping.sh`'s rules (HANDOFF-v2 §4.1): files older than this many days go. */
const CLAUDE_HOUSEKEEPING_RULES = [
  { folder: "debug", maxAgeDays: 7 },
  { folder: "session-env", maxAgeDays: 30 },
  { folder: "shell-snapshots", maxAgeDays: 14 },
  { folder: "todos", maxAgeDays: 30 },
] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Apply the rules to one Claude home and remove every `.DS_Store` in it; returns files removed. */
export const runClaudeHousekeeping = Effect.fn("runClaudeHousekeeping")(function* (
  claudeHome: string,
  nowMs: number,
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const listFiles = (folder: string) =>
    fileSystem.readDirectory(folder, { recursive: true }).pipe(
      Effect.map((entries) => entries.map((entry) => path.join(folder, entry))),
      Effect.orElseSucceed(() => [] as ReadonlyArray<string>),
    );
  const removeIf = (file: string, predicate: (info: FileSystem.File.Info) => boolean) =>
    fileSystem.stat(file).pipe(
      Effect.flatMap((info) =>
        info.type === "File" && predicate(info)
          ? fileSystem.remove(file).pipe(Effect.as(1))
          : Effect.succeed(0),
      ),
      Effect.orElseSucceed(() => 0),
    );

  let removed = 0;
  for (const rule of CLAUDE_HOUSEKEEPING_RULES) {
    const cutoffMs = nowMs - rule.maxAgeDays * DAY_MS;
    for (const file of yield* listFiles(path.join(claudeHome, rule.folder))) {
      removed += yield* removeIf(file, (info) =>
        Option.match(info.mtime, {
          onNone: () => false,
          onSome: (mtime) => mtime.getTime() < cutoffMs,
        }),
      );
    }
  }
  for (const file of yield* listFiles(claudeHome)) {
    if (path.basename(file) === ".DS_Store") removed += yield* removeIf(file, () => true);
  }
  return removed;
});

const makeSweep = Effect.gen(function* () {
  const settings = yield* ServerSettings.ServerSettingsService;
  const lastRunDate = yield* Ref.make<string | null>(null);
  return Effect.fn("ClaudeHousekeeping.sweep")(function* () {
    const hour = (yield* settings.getSettings).housekeepingHour;
    if (hour === null) return;
    const now = yield* DateTime.now;
    const local = DateTime.setZone(now, DateTime.zoneMakeLocal());
    const today = DateTime.formatIsoDate(local);
    if (DateTime.toParts(local).hour !== hour || (yield* Ref.get(lastRunDate)) === today) return;
    yield* Ref.set(lastRunDate, today);
    const claudeHome = yield* resolveClaudeHomePath({ homePath: "" }, process.env);
    const removed = yield* runClaudeHousekeeping(claudeHome, DateTime.toEpochMillis(now));
    if (removed > 0) yield* Effect.logInfo("claude-housekeeping.cleaned", { removed });
  });
});

// CONTROL's daily housekeeping (HANDOFF-v2 §4.1), at the hour set in settings.
// A restart inside that hour runs it again, which removes nothing new.
export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const sweep = yield* makeSweep;
    const scheduler = yield* Scheduler.Scheduler;
    yield* scheduler.register("claude-housekeeping", sweep());
  }),
);
