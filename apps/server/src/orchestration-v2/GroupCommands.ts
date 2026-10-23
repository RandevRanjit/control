import { type EventId, GroupId, type GroupMutation, MAX_LOCK_MS } from "@control/contracts";
import * as DateTime from "effect/DateTime";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

import type { UnsequencedGroupEvent } from "../persistence/OrchestrationEventStore.ts";
import type { GroupRow } from "./GroupStore.ts";

export class GroupCommandInvariantError extends Schema.TaggedError<GroupCommandInvariantError>()(
  "GroupCommandInvariantError",
  {
    commandType: Schema.String,
    detail: Schema.String,
  },
) {
  override get message(): string {
    return `Group command invariant failed (${this.commandType}): ${this.detail}`;
  }
}

/** The command targets a group that does not exist or was deleted. */
export class GroupCommandMissingGroupError extends Schema.TaggedError<GroupCommandMissingGroupError>()(
  "GroupCommandMissingGroupError",
  {
    commandType: Schema.String,
    groupId: GroupId,
  },
) {
  override get message(): string {
    return `Group '${this.groupId}' does not exist for command '${this.commandType}'.`;
  }
}

export const GroupCommandRejection = Schema.Union([
  GroupCommandInvariantError,
  GroupCommandMissingGroupError,
]);
export type GroupCommandRejection = typeof GroupCommandRejection.Type;

const GroupCommandRejectionJson = Schema.fromJsonString(GroupCommandRejection);
/** A rejected receipt stores its rejection so a retried command id replays the same error. */
export const encodeGroupCommandRejection = Schema.encodeSync(GroupCommandRejectionJson);
export const decodeGroupCommandRejection = Schema.decodeUnknownOption(GroupCommandRejectionJson);

/**
 * Decide one group command against its row, including a soft-deleted one. The
 * caller reads `group` under the group's lock and commits the planned event.
 */
export function planGroupCommand(input: {
  readonly command: GroupMutation;
  readonly group: GroupRow | undefined;
  readonly eventId: EventId;
  readonly now: DateTime.Utc;
}): Result.Result<UnsequencedGroupEvent, GroupCommandRejection> {
  const { command, group } = input;
  const activeGroup = group?.deletedAt === null ? group : undefined;
  const missingGroup = () =>
    Result.fail(
      new GroupCommandMissingGroupError({ commandType: command.type, groupId: command.groupId }),
    );
  const occurredAt = DateTime.formatIso(input.now);
  const base = {
    eventId: input.eventId,
    aggregateKind: "group" as const,
    aggregateId: command.groupId,
    occurredAt,
    commandId: command.commandId,
    causationEventId: null,
    correlationId: command.commandId,
    metadata: {},
  };

  switch (command.type) {
    case "group.create": {
      // Ids are never reused, so a thread still naming a deleted group stays loose.
      if (group !== undefined) {
        return Result.fail(
          new GroupCommandInvariantError({
            commandType: command.type,
            detail: `Group '${command.groupId}' already exists and cannot be created twice.`,
          }),
        );
      }
      return Result.succeed({
        ...base,
        type: "group.created",
        payload: {
          groupId: command.groupId,
          name: command.name,
          tint: command.tint,
          homeFolder: command.homeFolder ?? null,
          createdAt: occurredAt,
          updatedAt: occurredAt,
        },
      });
    }

    case "group.update": {
      if (activeGroup === undefined) return missingGroup();
      return Result.succeed({
        ...base,
        type: "group.meta-updated",
        payload: {
          groupId: command.groupId,
          ...(command.name === undefined ? {} : { name: command.name }),
          ...(command.tint === undefined ? {} : { tint: command.tint }),
          ...(command.homeFolder === undefined ? {} : { homeFolder: command.homeFolder }),
          updatedAt: occurredAt,
        },
      });
    }

    case "group.lock": {
      if (activeGroup === undefined) return missingGroup();
      const untilMs = Date.parse(command.until);
      const nowMs = DateTime.toEpochMillis(input.now);
      const reject = (detail: string) =>
        Result.fail(new GroupCommandInvariantError({ commandType: command.type, detail }));
      if (!Number.isFinite(untilMs) || untilMs <= nowMs) {
        return reject("A lock must end in the future.");
      }
      if (untilMs - nowMs > MAX_LOCK_MS) return reject("A lock lasts at most 12 hours.");
      if (activeGroup.lockedUntil !== null && Date.parse(activeGroup.lockedUntil) > untilMs) {
        return reject("A lock can be extended but never shortened.");
      }
      return Result.succeed({
        ...base,
        type: "group.meta-updated",
        payload: {
          groupId: command.groupId,
          lockedUntil: DateTime.formatIso(DateTime.makeUnsafe(untilMs)),
          updatedAt: occurredAt,
        },
      });
    }

    case "group.delete": {
      if (activeGroup === undefined) return missingGroup();
      if (
        activeGroup.lockedUntil !== null &&
        Date.parse(activeGroup.lockedUntil) > DateTime.toEpochMillis(input.now)
      ) {
        return Result.fail(
          new GroupCommandInvariantError({
            commandType: command.type,
            detail: "A locked group cannot be deleted until its lock ends.",
          }),
        );
      }
      return Result.succeed({
        ...base,
        type: "group.deleted",
        payload: { groupId: command.groupId, deletedAt: occurredAt },
      });
    }
  }
}
