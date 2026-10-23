import * as Schema from "effect/Schema";

import { NonNegativeInt, TrimmedNonEmptyString } from "./baseSchemas.ts";

/**
 * CONTROL's front-end for `~/.claude/settings.json` (HANDOFF-v2 §4.1): the
 * settings it covers are read from and written to that file, never copied.
 */
export const ClaudeEffortLevel = Schema.Literals(["low", "medium", "high", "xhigh", "max"]);
export type ClaudeEffortLevel = typeof ClaudeEffortLevel.Type;

export const ClaudePermissionMode = Schema.Literals([
  "default",
  "acceptEdits",
  "plan",
  "auto",
  "dontAsk",
  "bypassPermissions",
]);
export type ClaudePermissionMode = typeof ClaudePermissionMode.Type;

export const ClaudeSettingsFileView = Schema.Struct({
  path: TrimmedNonEmptyString,
  model: Schema.NullOr(Schema.String),
  effortLevel: Schema.NullOr(Schema.String),
  defaultMode: Schema.NullOr(Schema.String),
  autoMemoryDirectory: Schema.NullOr(Schema.String),
  env: Schema.Record(Schema.String, Schema.String),
  enabledPlugins: Schema.Record(Schema.String, Schema.Boolean),
  /** Hook entries per event; hooks are shown, not edited. */
  hookEvents: Schema.Record(Schema.String, NonNegativeInt),
});
export type ClaudeSettingsFileView = typeof ClaudeSettingsFileView.Type;

/** Absent = unchanged; null removes the key. `env` replaces the map; plugins merge per key. */
export const ClaudeSettingsFilePatch = Schema.Struct({
  model: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  effortLevel: Schema.optional(Schema.NullOr(ClaudeEffortLevel)),
  defaultMode: Schema.optional(Schema.NullOr(ClaudePermissionMode)),
  autoMemoryDirectory: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  enabledPlugins: Schema.optional(Schema.Record(Schema.String, Schema.Boolean)),
});
export type ClaudeSettingsFilePatch = typeof ClaudeSettingsFilePatch.Type;

export class ClaudeSettingsFileError extends Schema.TaggedError<ClaudeSettingsFileError>()(
  "ClaudeSettingsFileError",
  { message: TrimmedNonEmptyString },
) {}
