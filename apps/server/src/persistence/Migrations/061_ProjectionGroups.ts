import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS projection_groups (
      group_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      tint TEXT NOT NULL,
      home_folder TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    )
  `;

  // Group events join the application log, so the high-water index that every
  // application read is forced through must cover them too. Queries repeat
  // this WHERE clause verbatim so SQLite can use the partial index.
  yield* sql`DROP INDEX IF EXISTS idx_orchestration_events_application_high_water`;
  yield* sql`
    CREATE INDEX idx_orchestration_events_application_high_water
    ON orchestration_events(sequence)
    WHERE aggregate_kind IN ('project', 'group')
      OR (application_event_version = 2 AND aggregate_kind = 'thread')
  `;
});
