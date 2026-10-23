import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  // A project's identity tint (design v1 §3.4), or null to take one from its id.
  yield* sql`ALTER TABLE projection_projects ADD COLUMN tint TEXT`;
});
