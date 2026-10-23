import { type Group, GroupId, type GroupMutation } from "@control/contracts";
import * as KeyedLock from "@control/shared/KeyedLock";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

import * as EventSink from "../orchestration-v2/EventSink.ts";
import {
  decodeGroupCommandRejection,
  encodeGroupCommandRejection,
  planGroupCommand,
} from "../orchestration-v2/GroupCommands.ts";
import * as GroupStore from "../orchestration-v2/GroupStore.ts";
import * as IdAllocator from "../orchestration-v2/IdAllocator.ts";

export class GroupNotFoundError extends Schema.TaggedError<GroupNotFoundError>()(
  "GroupNotFoundError",
  { groupId: GroupId },
) {
  override get message(): string {
    return `Group ${this.groupId} was not found.`;
  }
}

export class GroupOperationError extends Schema.TaggedError<GroupOperationError>()(
  "GroupOperationError",
  {
    groupId: GroupId,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Group operation failed for ${this.groupId}.`;
  }
}

export type GroupServiceError = GroupNotFoundError | GroupOperationError;

export class GroupService extends Context.Service<
  GroupService,
  {
    /** Apply one mutation and return the group as it now stands (deleted groups included). */
    readonly mutate: (mutation: GroupMutation) => Effect.Effect<Group, GroupServiceError>;
  }
>()("@control/server/group/GroupService") {}

const make = Effect.gen(function* () {
  const groups = yield* GroupStore.GroupStoreV2;
  const eventSink = yield* EventSink.EventSinkV2;
  const idAllocator = yield* IdAllocator.IdAllocatorV2;
  const groupLocks = yield* KeyedLock.make<GroupId>();

  const mutate: GroupService["Service"]["mutate"] = Effect.fn("GroupService.mutate")(
    function* (command) {
      const { groupId } = command;
      const operationError = (cause: unknown) => new GroupOperationError({ groupId, cause });
      const receipt = yield* groupLocks
        .withLock(
          groupId,
          Effect.gen(function* () {
            const group = Option.getOrUndefined(
              yield* groups.get(groupId, { includeDeleted: true }),
            );
            const now = yield* DateTime.now;
            const eventId = yield* idAllocator.allocate.event({ commandId: command.commandId });
            const planned = planGroupCommand({ command, group, eventId, now });
            if (Result.isSuccess(planned)) {
              const { receipt } = yield* eventSink.commitGroupCommand({
                commandId: command.commandId,
                groupId,
                commandType: command.type,
                acceptedAt: now,
                event: planned.success,
              });
              return receipt;
            }
            return yield* eventSink.commitRejectedGroupCommand({
              commandId: command.commandId,
              groupId,
              commandType: command.type,
              rejectedAt: now,
              error: encodeGroupCommandRejection(planned.failure),
            });
          }),
        )
        .pipe(Effect.mapError(operationError));
      if (receipt.groupId !== groupId || receipt.commandType !== command.type) {
        return yield* operationError(
          `Command ${command.commandId} was already used by ${receipt.commandType} for ${receipt.groupId}.`,
        );
      }
      // A retried command id replays its first receipt, not a fresh plan.
      if (receipt.status === "rejected") {
        const rejection = Option.getOrUndefined(decodeGroupCommandRejection(receipt.error));
        return yield* rejection?._tag === "GroupCommandMissingGroupError"
          ? new GroupNotFoundError({ groupId })
          : operationError(rejection ?? receipt.error ?? "The command was previously rejected.");
      }
      const row = yield* groups
        .get(groupId, { includeDeleted: true })
        .pipe(Effect.mapError(operationError));
      if (Option.isNone(row)) {
        return yield* operationError("The accepted group command did not produce a group row.");
      }
      const { groupId: id, deletedAt: _, ...fields } = row.value;
      return { id, ...fields };
    },
  );

  return GroupService.of({ mutate });
});

export const layer = Layer.effect(GroupService, make);
