import {
  ClaudeSettingsFileError,
  type ClaudeSettingsFilePatch,
  type ClaudeSettingsFileView,
} from "@control/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { writeFileStringAtomically } from "../atomicWrite.ts";
import { resolveClaudeHomePath } from "./Drivers/ClaudeHome.ts";

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringOrNull = (value: unknown) => (typeof value === "string" ? value : null);

const entriesOf = <A>(value: unknown, keep: (entry: unknown) => entry is A) =>
  isObject(value)
    ? Object.fromEntries(
        Object.entries(value).filter((entry): entry is [string, A] => keep(entry[1])),
      )
    : {};

/** The covered settings as CONTROL shows them; anything else in the file is left out. */
function claudeSettingsFileView(path: string, json: Json): ClaudeSettingsFileView {
  const hooks = isObject(json.hooks) ? json.hooks : {};
  return {
    path,
    model: stringOrNull(json.model),
    effortLevel: stringOrNull(json.effortLevel),
    defaultMode: isObject(json.permissions) ? stringOrNull(json.permissions.defaultMode) : null,
    autoMemoryDirectory: stringOrNull(json.autoMemoryDirectory),
    env: entriesOf(json.env, (entry): entry is string => typeof entry === "string"),
    enabledPlugins: entriesOf(
      json.enabledPlugins,
      (entry): entry is boolean => typeof entry === "boolean",
    ),
    hookEvents: Object.fromEntries(
      Object.entries(hooks).map(([event, entries]) => [
        event,
        Array.isArray(entries) ? entries.length : 0,
      ]),
    ),
  };
}

/** Apply a patch to the parsed file, keeping every key it does not name. */
function applyClaudeSettingsPatch(json: Json, patch: ClaudeSettingsFilePatch): Json {
  const next: Json = { ...json };
  const setOrDelete = (target: Json, key: string, value: unknown) => {
    if (value === null) delete target[key];
    else target[key] = value;
  };
  if (patch.model !== undefined) setOrDelete(next, "model", patch.model);
  if (patch.effortLevel !== undefined) setOrDelete(next, "effortLevel", patch.effortLevel);
  if (patch.autoMemoryDirectory !== undefined) {
    setOrDelete(next, "autoMemoryDirectory", patch.autoMemoryDirectory);
  }
  if (patch.defaultMode !== undefined) {
    const permissions = { ...(isObject(json.permissions) ? json.permissions : {}) };
    setOrDelete(permissions, "defaultMode", patch.defaultMode);
    next.permissions = permissions;
  }
  if (patch.env !== undefined) next.env = { ...patch.env };
  if (patch.enabledPlugins !== undefined) {
    next.enabledPlugins = {
      ...(isObject(json.enabledPlugins) ? json.enabledPlugins : {}),
      ...patch.enabledPlugins,
    };
  }
  return next;
}

const fileError = (message: string) => new ClaudeSettingsFileError({ message });

// The file is hand-edited, so it is written back in the CLI's own two-space form.
const parseSettingsText = (text: string): unknown => JSON.parse(text);
const formatSettingsJson = (json: Json) => `${JSON.stringify(json, null, 2)}\n`;

const settingsPath = Effect.gen(function* () {
  const path = yield* Path.Path;
  return path.join(yield* resolveClaudeHomePath({ homePath: "" }, process.env), "settings.json");
});

const readJson = Effect.fn("ClaudeSettingsFile.readJson")(function* (file: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  if (!(yield* fileSystem.exists(file).pipe(Effect.orElseSucceed(() => false)))) return {};
  const text = yield* fileSystem
    .readFileString(file)
    .pipe(Effect.mapError(() => fileError(`Could not read ${file}.`)));
  const parsed = yield* Effect.try({
    try: () => parseSettingsText(text),
    catch: () => fileError(`${file} is not valid JSON; fix it before Control edits it.`),
  });
  return isObject(parsed) ? parsed : yield* fileError(`${file} does not hold a JSON object.`);
});

// The owner's file lives outside CONTROL's folder, so a bad write must be undoable by hand:
// the previous copy goes to `backups/` beside it, stamped with the time.
const keepPreviousCopy = Effect.fn("ClaudeSettingsFile.keepPreviousCopy")(function* (file: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  if (!(yield* fileSystem.exists(file).pipe(Effect.orElseSucceed(() => false)))) return;
  const stamp = DateTime.formatIso(yield* DateTime.now).replaceAll(":", "-");
  const backups = path.join(path.dirname(file), "backups");
  yield* fileSystem.makeDirectory(backups, { recursive: true });
  yield* fileSystem.copyFile(file, path.join(backups, `${path.basename(file)}.${stamp}`));
});

/** Keep the previous copy, then replace the file atomically. */
const replaceSettings = Effect.fn("ClaudeSettingsFile.replace")(function* (
  target: string,
  next: Json,
) {
  yield* keepPreviousCopy(target).pipe(
    Effect.mapError(() => fileError(`Could not back up ${target}, so it was left unchanged.`)),
  );
  yield* writeFileStringAtomically({ filePath: target, contents: formatSettingsJson(next) }).pipe(
    Effect.mapError(() => fileError(`Could not write ${target}.`)),
  );
});

/** Read the file at `file` (default: the CLI's `settings.json`). */
export const readClaudeSettingsFile = Effect.fn("ClaudeSettingsFile.read")(function* (
  file?: string,
) {
  const target = file ?? (yield* settingsPath);
  return claudeSettingsFileView(target, yield* readJson(target));
});

/**
 * Re-read the file, apply the patch and replace it atomically, so an edit
 * Claude Code made since CONTROL last read it is kept.
 */
export const updateClaudeSettingsFile = Effect.fn("ClaudeSettingsFile.update")(function* (
  patch: ClaudeSettingsFilePatch,
  file?: string,
) {
  const target = file ?? (yield* settingsPath);
  const next = applyClaudeSettingsPatch(yield* readJson(target), patch);
  yield* replaceSettings(target, next);
  return claudeSettingsFileView(target, next);
});

/**
 * Add a command hook for `event`, unless one with the same command is there, keeping every other
 * key and hook. Returns whether the file changed.
 */
export const addClaudeSettingsHook = Effect.fn("ClaudeSettingsFile.addHook")(function* (
  event: string,
  command: string,
  file?: string,
) {
  const target = file ?? (yield* settingsPath);
  const json = yield* readJson(target);
  const hooks = isObject(json.hooks) ? json.hooks : {};
  const entries: ReadonlyArray<unknown> = Array.isArray(hooks[event]) ? hooks[event] : [];
  const present = entries.some(
    (entry) =>
      isObject(entry) &&
      Array.isArray(entry.hooks) &&
      entry.hooks.some((hook: unknown) => isObject(hook) && hook.command === command),
  );
  if (present) return false;
  yield* replaceSettings(target, {
    ...json,
    hooks: { ...hooks, [event]: [...entries, { hooks: [{ type: "command", command }] }] },
  });
  return true;
});
