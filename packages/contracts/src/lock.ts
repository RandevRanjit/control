import * as Schema from "effect/Schema";

import { GroupId, IsoDateTime } from "./baseSchemas.ts";

/** The longest lock, full or group, as in v1: a lock can be extended but never lifted early. */
export const MAX_LOCK_MS = 12 * 60 * 60 * 1000;

/**
 * CONTROL's full lock (design/hybrid/HANDOFF.md §16): until `until`, the server refuses the
 * owner's sends in every chat, and terminal claude's hook refuses new prompts. Null when no
 * lock is running.
 */
export const ControlLock = Schema.Struct({
  until: Schema.NullOr(IsoDateTime),
});
export type ControlLock = typeof ControlLock.Type;

/** CONTROL's locks as agents read them over MCP (`lock_read`); only the owner sets a lock. */
export const ControlLockRead = Schema.Struct({
  until: Schema.NullOr(IsoDateTime),
  /** Each group lock still running. */
  groups: Schema.Array(
    Schema.Struct({ groupId: GroupId, name: Schema.String, lockedUntil: IsoDateTime }),
  ),
});
export type ControlLockRead = typeof ControlLockRead.Type;

/** Lock everything until `until`, or extend the running lock; nothing ends one early. */
export const ControlLockSetInput = Schema.Struct({
  until: IsoDateTime,
});
export type ControlLockSetInput = typeof ControlLockSetInput.Type;

export class ControlLockError extends Schema.TaggedError<ControlLockError>()("ControlLockError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {}
