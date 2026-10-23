import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS orchestration_v2_projection_loose_ends (
      loose_end_id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      payload_json TEXT NOT NULL
    )
  `;

  // The shell counts a thread's open loose ends on every read.
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_orchestration_v2_projection_loose_ends_thread_status
    ON orchestration_v2_projection_loose_ends(thread_id, status)
  `;
});
