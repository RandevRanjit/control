import {
  type ApplicationGroupEvent,
  type Group,
  GroupId,
  GroupTint,
  IsoDateTime,
  TrimmedNonEmptyString,
} from "@control/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";
import * as SqlSchema from "effect/sql/SqlSchema";

export class GroupStoreV2Error extends Schema.TaggedError<GroupStoreV2Error>()(
  "GroupStoreV2Error",
  {
    operation: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Group store operation '${this.operation}' failed.`;
  }
}

/** One row of `projection_groups`, the durable group read model. */
export const GroupRow = Schema.Struct({
  groupId: GroupId,
  name: TrimmedNonEmptyString,
  tint: GroupTint,
  homeFolder: Schema.NullOr(TrimmedNonEmptyString),
  lockedUntil: Schema.NullOr(IsoDateTime),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  deletedAt: Schema.NullOr(IsoDateTime),
});
export type GroupRow = typeof GroupRow.Type;

function toGroup(row: GroupRow): Group {
  return {
    id: row.groupId,
    name: row.name,
    tint: row.tint,
    homeFolder: row.homeFolder,
    lockedUntil: row.lockedUntil,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class GroupStoreV2 extends Context.Service<
  GroupStoreV2,
  {
    /** Fold one committed group event into its row. Call inside the commit transaction. */
    readonly apply: (event: ApplicationGroupEvent) => Effect.Effect<void, GroupStoreV2Error>;
    readonly get: (
      groupId: GroupId,
      options?: { readonly includeDeleted?: boolean },
    ) => Effect.Effect<Option.Option<GroupRow>, GroupStoreV2Error>;
    /** An active group as clients see it. */
    readonly getGroup: (groupId: GroupId) => Effect.Effect<Option.Option<Group>, GroupStoreV2Error>;
    /** Active groups in creation order. */
    readonly listGroups: () => Effect.Effect<ReadonlyArray<Group>, GroupStoreV2Error>;
  }
>()("@control/server/orchestration-v2/GroupStore/GroupStoreV2") {}

/** @public Service construction is part of the canonical Effect module API. */
export const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const encodeRow = Schema.encodeEffect(GroupRow);

  const selectRows = SqlSchema.findAll({
    Request: Schema.Struct({
      groupId: Schema.optional(GroupId),
      includeDeleted: Schema.Boolean,
    }),
    Result: GroupRow,
    execute: (request) => sql`
      SELECT
        group_id AS "groupId",
        name,
        tint,
        home_folder AS "homeFolder",
        locked_until AS "lockedUntil",
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        deleted_at AS "deletedAt"
      FROM projection_groups
      WHERE ${sql.and([
        ...(request.includeDeleted ? [] : [sql`deleted_at IS NULL`]),
        ...(request.groupId === undefined ? [] : [sql`group_id = ${request.groupId}`]),
      ])}
      ORDER BY created_at ASC, group_id ASC
    `,
  });

  const upsertRow = (row: GroupRow) =>
    encodeRow(row).pipe(
      Effect.flatMap(
        (encoded) => sql`
          INSERT INTO projection_groups (
            group_id,
            name,
            tint,
            home_folder,
            locked_until,
            created_at,
            updated_at,
            deleted_at
          )
          VALUES (
            ${encoded.groupId},
            ${encoded.name},
            ${encoded.tint},
            ${encoded.homeFolder},
            ${encoded.lockedUntil},
            ${encoded.createdAt},
            ${encoded.updatedAt},
            ${encoded.deletedAt}
          )
          ON CONFLICT (group_id)
          DO UPDATE SET
            name = excluded.name,
            tint = excluded.tint,
            home_folder = excluded.home_folder,
            locked_until = excluded.locked_until,
            created_at = excluded.created_at,
            updated_at = excluded.updated_at,
            deleted_at = excluded.deleted_at
        `,
      ),
    );

  const mapError =
    (operation: string) =>
    <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      effect.pipe(Effect.mapError((cause) => new GroupStoreV2Error({ operation, cause })));

  const get: GroupStoreV2["Service"]["get"] = (groupId, options) =>
    selectRows({ groupId, includeDeleted: options?.includeDeleted === true }).pipe(
      Effect.map((rows) => Option.fromUndefinedOr(rows[0])),
      mapError("get"),
    );

  const apply: GroupStoreV2["Service"]["apply"] = Effect.fn("GroupStoreV2.apply")(
    function* (event) {
      if (event.type === "group.created") {
        const payload = event.payload;
        return yield* upsertRow({
          groupId: payload.groupId,
          name: payload.name,
          tint: payload.tint,
          homeFolder: payload.homeFolder,
          lockedUntil: null,
          createdAt: payload.createdAt,
          updatedAt: payload.updatedAt,
          deletedAt: null,
        }).pipe(mapError("apply"));
      }
      const existing = yield* get(event.payload.groupId, { includeDeleted: true });
      if (Option.isNone(existing)) return;
      const row = existing.value;
      if (event.type === "group.deleted") {
        return yield* upsertRow({
          ...row,
          deletedAt: event.payload.deletedAt,
          updatedAt: event.payload.deletedAt,
        }).pipe(mapError("apply"));
      }
      const payload = event.payload;
      yield* upsertRow({
        ...row,
        ...(payload.name === undefined ? {} : { name: payload.name }),
        ...(payload.tint === undefined ? {} : { tint: payload.tint }),
        ...(payload.homeFolder === undefined ? {} : { homeFolder: payload.homeFolder }),
        ...(payload.lockedUntil === undefined ? {} : { lockedUntil: payload.lockedUntil }),
        updatedAt: payload.updatedAt,
      }).pipe(mapError("apply"));
    },
  );

  return GroupStoreV2.of({
    apply,
    get,
    getGroup: (groupId) => get(groupId).pipe(Effect.map(Option.map(toGroup))),
    listGroups: () =>
      selectRows({ includeDeleted: false }).pipe(
        Effect.map((rows) => rows.map(toGroup)),
        mapError("listGroups"),
      ),
  });
});

export const layer = Layer.effect(GroupStoreV2, make);
