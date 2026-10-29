import * as Effect from "effect/Effect";
import type * as SqlClient from "effect/sql/SqlClient";

/**
 * The messages search indexes: finished, and either written by the user or
 * answered by an agent. User-role notices that agents or the system wrote
 * stay out. Subagent threads stay out too: search never shows them, and
 * subagents rewrite their whole finished answer on every streamed chunk.
 * Migration 65's triggers, the backfill, the rebuild, and the scan all use
 * it; `row` names the message row (a table alias, or `new` in a trigger).
 */
export const indexedMessageCondition = (sql: SqlClient.SqlClient, row = "messages") =>
  sql.literal(`
  ${row}.streaming = 0
  AND (
    ${row}.role = 'assistant'
    OR (
      ${row}.role = 'user'
      AND COALESCE(json_extract(${row}.payload_json, '$.createdBy'), 'user') = 'user'
    )
  )
  AND NOT EXISTS (
    SELECT 1 FROM orchestration_v2_projection_threads AS subagent_threads
    WHERE subagent_threads.thread_id = ${row}.thread_id
      AND json_extract(subagent_threads.payload_json, '$.lineage.relationshipToParent') = 'subagent'
  )
`);

/**
 * What the index stores for a message: its text with curly apostrophes
 * straight, as search folds a query, since iOS keyboards type "’" and others
 * type "'". Migration 65's triggers use it too. `payload` is the message's
 * JSON column.
 */
export const indexedMessageText = (sql: SqlClient.SqlClient, payload: string) =>
  sql.literal(`replace(replace(json_extract(${payload}, '$.text'), '’', ''''), '‘', '''')`);

/**
 * Whether the message row `row` (`new` or `old` in a trigger) is history the
 * backfill has not indexed yet. Triggers leave those rows to it.
 */
export const awaitingBackfill = (sql: SqlClient.SqlClient, row: string) =>
  sql.literal(`EXISTS (
    SELECT 1 FROM orchestration_v2_message_search_backfill AS backfill
    WHERE ${row}.rowid BETWEEN backfill.next_rowid AND backfill.last_rowid
  )`);

/**
 * Whether search can trust the index: it exists and the backfill has indexed
 * the history from before it.
 */
export const messageSearchReady = Effect.fn("MessageSearchIndex.ready")(function* (
  sql: SqlClient.SqlClient,
) {
  const index = yield* sql`
    SELECT 1 FROM sqlite_master WHERE name = 'orchestration_v2_message_search'
  `;
  if (index.length === 0) return false;
  const pending = yield* sql`SELECT 1 FROM orchestration_v2_message_search_backfill LIMIT 1`;
  return pending.length === 0;
});

// Messages read per backfill transaction. node:sqlite runs on the event loop,
// so each batch holds it: about 10 ms for 250 messages of average length, and
// 25 ms once the index holds 300,000.
const BACKFILL_BATCH_SIZE = 250;

/**
 * Adds the messages that existed before migration 65 to the index, one batch
 * per transaction, yielding to the event loop between batches, until none are
 * left. The cursor moves in the same transaction as its batch, so a kill
 * mid-backfill loses at most the batch in flight and the next start resumes
 * there. Triggers index every write since the migration except to rows the
 * backfill has not reached, which it adds as they are by then.
 */
export const backfillMessageSearch = Effect.fn("MessageSearchIndex.backfill")(function* (
  sql: SqlClient.SqlClient,
  batchSize = BACKFILL_BATCH_SIZE,
) {
  const index = yield* sql`
    SELECT 1 FROM sqlite_master WHERE name = 'orchestration_v2_message_search'
  `;
  if (index.length === 0) return;
  while (true) {
    const done = yield* sql.withTransaction(
      Effect.gen(function* () {
        const [cursor] = yield* sql<{ readonly next: number; readonly last: number }>`
          SELECT next_rowid AS next, last_rowid AS last
          FROM orchestration_v2_message_search_backfill
        `;
        if (cursor === undefined) return true;
        const [batch] = yield* sql<{ readonly upper: number | null }>`
          SELECT max(rowid) AS upper FROM (
            SELECT rowid FROM orchestration_v2_projection_messages
            WHERE rowid BETWEEN ${cursor.next} AND ${cursor.last}
            ORDER BY rowid
            LIMIT ${batchSize}
          )
        `;
        const upper = batch?.upper ?? null;
        if (upper === null) {
          yield* sql`DELETE FROM orchestration_v2_message_search_backfill`;
          return true;
        }
        yield* sql`
          INSERT INTO orchestration_v2_message_search (rowid, text)
          SELECT messages.rowid, ${indexedMessageText(sql, "messages.payload_json")}
          FROM orchestration_v2_projection_messages AS messages
          WHERE messages.rowid BETWEEN ${cursor.next} AND ${upper}
            AND ${indexedMessageCondition(sql)}
            AND json_extract(messages.payload_json, '$.text') IS NOT NULL
        `;
        yield* sql`
          UPDATE orchestration_v2_message_search_backfill SET next_rowid = ${upper + 1}
        `;
        return false;
      }),
    );
    if (done) return;
    // node:sqlite blocks the event loop for a whole batch; let sockets and
    // timers run before the next one.
    yield* Effect.yieldNow;
  }
});

/**
 * Refills the search index from the messages table. The index is keyed by
 * message rowid, so anything that may renumber or copy rows (a dev database
 * copy) rebuilds it instead of trusting it. Databases from before migration
 * 65, or on an SQLite without FTS5 trigrams, have no index.
 */
export const rebuildMessageSearch = Effect.fn("MessageSearchIndex.rebuild")(function* (
  sql: SqlClient.SqlClient,
) {
  const index = yield* sql`
    SELECT 1 FROM sqlite_master WHERE name = 'orchestration_v2_message_search'
  `;
  if (index.length === 0) return;
  // One transaction: an interrupt between clear and refill would leave an
  // empty index that nothing repairs.
  yield* sql.withTransaction(
    Effect.gen(function* () {
      yield* sql`DELETE FROM orchestration_v2_message_search_backfill`;
      yield* sql`
        INSERT INTO orchestration_v2_message_search (orchestration_v2_message_search)
        VALUES ('delete-all')
      `;
      yield* sql`
        INSERT INTO orchestration_v2_message_search (rowid, text)
        SELECT messages.rowid, ${indexedMessageText(sql, "messages.payload_json")}
        FROM orchestration_v2_projection_messages AS messages
        WHERE ${indexedMessageCondition(sql)}
          AND json_extract(messages.payload_json, '$.text') IS NOT NULL
      `;
    }),
  );
});
