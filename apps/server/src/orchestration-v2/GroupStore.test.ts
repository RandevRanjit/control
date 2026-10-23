import { assert, it } from "@effect/vitest";
import { type ApplicationGroupEvent, EventId, GroupId } from "@control/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import * as SqlitePersistence from "../persistence/Sqlite.ts";
import * as GroupStore from "./GroupStore.ts";

const groupId = GroupId.make("group-store");
const base = {
  eventId: EventId.make("event-group-store"),
  aggregateKind: "group",
  aggregateId: groupId,
  commandId: null,
  causationEventId: null,
  correlationId: null,
  metadata: {},
} as const;

const events: ReadonlyArray<ApplicationGroupEvent> = [
  {
    ...base,
    sequence: 1,
    occurredAt: "2026-10-09T00:00:00.000Z",
    type: "group.created",
    payload: {
      groupId,
      name: "Research",
      tint: "lilac",
      homeFolder: "/work/research",
      createdAt: "2026-10-09T00:00:00.000Z",
      updatedAt: "2026-10-09T00:00:00.000Z",
    },
  },
  {
    ...base,
    sequence: 2,
    occurredAt: "2026-10-09T01:00:00.000Z",
    type: "group.meta-updated",
    payload: { groupId, name: "Thesis", homeFolder: null, updatedAt: "2026-10-09T01:00:00.000Z" },
  },
];

it.layer(GroupStore.layer.pipe(Layer.provideMerge(SqlitePersistence.layerMemory)))(
  "GroupStoreV2",
  (it) => {
    it.effect("folds create, update and delete into one row", () =>
      Effect.gen(function* () {
        const groups = yield* GroupStore.GroupStoreV2;
        yield* Effect.forEach(events, groups.apply, { discard: true });

        assert.deepStrictEqual(yield* groups.listGroups(), [
          {
            id: groupId,
            name: "Thesis",
            tint: "lilac",
            homeFolder: null,
            lockedUntil: null,
            createdAt: "2026-10-09T00:00:00.000Z",
            updatedAt: "2026-10-09T01:00:00.000Z",
          },
        ]);

        // A lock end survives later updates that do not name it.
        yield* groups.apply({
          ...base,
          sequence: 3,
          occurredAt: "2026-10-09T01:30:00.000Z",
          type: "group.meta-updated",
          payload: {
            groupId,
            lockedUntil: "2026-10-09T03:30:00.000Z",
            updatedAt: "2026-10-09T01:30:00.000Z",
          },
        });
        yield* groups.apply({
          ...base,
          sequence: 4,
          occurredAt: "2026-10-09T01:40:00.000Z",
          type: "group.meta-updated",
          payload: { groupId, tint: "mint", updatedAt: "2026-10-09T01:40:00.000Z" },
        });
        assert.equal(
          Option.getOrNull(yield* groups.getGroup(groupId))?.lockedUntil,
          "2026-10-09T03:30:00.000Z",
        );

        yield* groups.apply({
          ...base,
          sequence: 5,
          occurredAt: "2026-10-09T02:00:00.000Z",
          type: "group.deleted",
          payload: { groupId, deletedAt: "2026-10-09T02:00:00.000Z" },
        });
        assert.deepStrictEqual(yield* groups.listGroups(), []);
        assert.isTrue(Option.isNone(yield* groups.getGroup(groupId)));
        const kept = yield* groups.get(groupId, { includeDeleted: true });
        assert.equal(Option.getOrNull(kept)?.deletedAt, "2026-10-09T02:00:00.000Z");
      }),
    );
  },
);
