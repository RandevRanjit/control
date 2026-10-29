import { assert, it } from "@effect/vitest";
import * as NodeSqliteClient from "@control/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

import {
  backfillMessageSearch,
  messageSearchReady,
} from "../../orchestration-v2/messageSearchIndex.ts";
import { runMigrations } from "../Migrations.ts";

const layer = it.layer(NodeSqliteClient.layer({ filename: ":memory:" }));

const insertMessage = (
  id: string,
  role: string,
  streaming: number,
  text: string,
  createdBy: string | undefined = role === "user" ? "user" : "agent",
) =>
  Effect.flatMap(
    SqlClient.SqlClient,
    (sql) => sql`
      INSERT INTO orchestration_v2_projection_messages (
        message_id, thread_id, run_id, node_id, role, streaming, created_at, updated_at, payload_json
      )
      VALUES (
        ${id}, 'thread-1', NULL, NULL, ${role}, ${streaming},
        '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z', ${JSON.stringify({ text, createdBy })}
      )
    `,
  );

const indexed = (word: string) =>
  Effect.flatMap(SqlClient.SqlClient, (sql) =>
    sql<{ readonly messageId: string }>`
      SELECT messages.message_id AS "messageId"
      FROM orchestration_v2_message_search AS search
      INNER JOIN orchestration_v2_projection_messages AS messages
        ON messages.rowid = search.rowid
      WHERE orchestration_v2_message_search MATCH ${`"${word}"`}
      ORDER BY messages.message_id
    `.pipe(Effect.map((rows) => rows.map((row) => row.messageId))),
  );

layer("065_ThreadMessageSearch", (it) => {
  it.effect(
    "leaves history to the backfill, which indexes what users wrote and agents answered",
    () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* runMigrations({ toMigrationInclusive: 64 });
        yield* insertMessage("user", "user", 0, "needle from the user");
        yield* insertMessage("assistant", "assistant", 0, "needle from the agent");
        yield* insertMessage("streaming", "assistant", 1, "needle still streaming");
        yield* insertMessage("system", "system", 0, "needle in a system prompt");
        yield* insertMessage("notice", "user", 0, "needle in a pull request update", "agent");
        // Older rows carry no author; they were the user's.
        yield* insertMessage("legacy", "user", 0, "needle from before authors", undefined);

        yield* runMigrations();

        // The migration indexes nothing itself, so startup does not wait on history.
        assert.deepEqual(yield* indexed("needle"), []);
        assert.isFalse(yield* messageSearchReady(sql));
        // Written after the migration: the triggers index it straight away.
        yield* insertMessage("later", "user", 0, "needle written after the update");
        assert.deepEqual(yield* indexed("needle"), ["later"]);

        yield* backfillMessageSearch(sql, 2);
        assert.deepEqual(yield* indexed("needle"), ["assistant", "later", "legacy", "user"]);
        assert.isTrue(yield* messageSearchReady(sql));

        yield* sql`DELETE FROM orchestration_v2_projection_messages WHERE message_id = 'user'`;
        assert.deepEqual(yield* indexed("needle"), ["assistant", "later", "legacy"]);
        // A second run finds nothing to do.
        yield* backfillMessageSearch(sql, 2);
        assert.deepEqual(yield* indexed("needle"), ["assistant", "later", "legacy"]);
      }),
  );
});

layer("065_ThreadMessageSearch backfill after a crash", (it) => {
  it.effect("keeps finished batches, resumes where it stopped, and indexes each message once", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 64 });
      yield* insertMessage("a", "user", 0, "haystack one");
      yield* insertMessage("b", "assistant", 0, "haystack two");
      // A row the backfill cannot read stops it partway, like a kill would.
      yield* sql`
        INSERT INTO orchestration_v2_projection_messages (
          message_id, thread_id, run_id, node_id, role, streaming, created_at, updated_at, payload_json
        )
        VALUES ('broken', 'thread-1', NULL, NULL, 'user', 0, '2026-09-01T00:00:00.000Z',
          '2026-09-01T00:00:00.000Z', '{not json')
      `;
      yield* insertMessage("c", "user", 0, "haystack three");
      yield* runMigrations();

      // Edited before the backfill reaches it: left to the backfill, which adds it as edited.
      yield* sql`
        UPDATE orchestration_v2_projection_messages
        SET payload_json = json_set(payload_json, '$.text', 'haystack three, edited')
        WHERE message_id = 'c'
      `;
      const failed = yield* Effect.flip(backfillMessageSearch(sql, 2));
      assert.isDefined(failed);
      // The first batch committed; the one with the bad row rolled back whole.
      assert.deepEqual(yield* indexed("haystack"), ["a", "b"]);
      assert.isFalse(yield* messageSearchReady(sql));

      yield* sql`DELETE FROM orchestration_v2_projection_messages WHERE message_id = 'broken'`;
      yield* backfillMessageSearch(sql, 2);
      assert.isTrue(yield* messageSearchReady(sql));
      assert.deepEqual(yield* indexed("haystack"), ["a", "b", "c"]);
      assert.deepEqual(yield* indexed("edited"), ["c"]);
      const [rows] = yield* sql<{ readonly count: number }>`
        SELECT count(*) AS count FROM orchestration_v2_message_search
      `;
      assert.equal(rows?.count, 3);
    }),
  );
});
