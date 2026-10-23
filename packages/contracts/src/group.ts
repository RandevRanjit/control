import * as Schema from "effect/Schema";

import { CommandId, GroupId, IsoDateTime, TrimmedNonEmptyString } from "./baseSchemas.ts";

/** Identity tints shared by groups and projects; each theme maps a name to its colour. */
export const GroupTint = Schema.Literals(["mint", "rose", "peri", "butter", "sage", "lilac"]);
export type GroupTint = typeof GroupTint.Type;

/** A user-named group above projects and threads: it holds chats from any folder. */
export const Group = Schema.Struct({
  id: GroupId,
  name: TrimmedNonEmptyString,
  tint: GroupTint,
  /** Optional home folder for new chats started from the group. */
  homeFolder: Schema.NullOr(TrimmedNonEmptyString),
  /** CONTROL's lock (HANDOFF-v2 §4): the owner cannot send into the group's chats before this. */
  lockedUntil: Schema.NullOr(IsoDateTime),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Group = typeof Group.Type;

/** True while `lockedUntil` is still ahead of `nowMs`. */
export function isGroupLocked(group: Pick<Group, "lockedUntil">, nowMs: number): boolean {
  return group.lockedUntil !== null && Date.parse(group.lockedUntil) > nowMs;
}

export const GroupMutation = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("group.create"),
    commandId: CommandId,
    groupId: GroupId,
    name: TrimmedNonEmptyString,
    tint: GroupTint,
    homeFolder: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  }),
  Schema.Struct({
    type: Schema.Literal("group.update"),
    commandId: CommandId,
    groupId: GroupId,
    name: Schema.optional(TrimmedNonEmptyString),
    tint: Schema.optional(GroupTint),
    // Absent = leave unchanged; null = clear.
    homeFolder: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  }),
  /** Lock until `until`, or extend a lock; nothing lifts one early. */
  Schema.Struct({
    type: Schema.Literal("group.lock"),
    commandId: CommandId,
    groupId: GroupId,
    until: IsoDateTime,
  }),
  Schema.Struct({
    type: Schema.Literal("group.delete"),
    commandId: CommandId,
    groupId: GroupId,
  }),
]);
export type GroupMutation = typeof GroupMutation.Type;

export class GroupMutationError extends Schema.TaggedError<GroupMutationError>()(
  "GroupMutationError",
  {
    commandId: CommandId,
    message: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {}
