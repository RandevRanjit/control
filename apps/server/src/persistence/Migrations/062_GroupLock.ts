import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  // CONTROL's lock (HANDOFF-v2 §4): the end of a group's lock, or null.
  yield* sql`ALTER TABLE projection_groups ADD COLUMN locked_until TEXT`;
});
