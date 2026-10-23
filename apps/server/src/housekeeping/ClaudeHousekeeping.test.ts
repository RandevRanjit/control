import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { runClaudeHousekeeping } from "./ClaudeHousekeeping.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

it.layer(NodeServices.layer)("runClaudeHousekeeping", (it) => {
  it.effect("removes only what housekeeping.sh would", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const home = yield* fileSystem.makeTempDirectoryScoped({ prefix: "claude-housekeeping-" });
      const nowMs = Date.parse("2026-10-09T12:00:00.000Z");
      const write = (relative: string, ageDays: number) =>
        Effect.gen(function* () {
          const file = path.join(home, relative);
          yield* fileSystem.makeDirectory(path.dirname(file), { recursive: true });
          yield* fileSystem.writeFileString(file, "x");
          // A number here is seconds, as in node:fs.
          const mtimeSeconds = (nowMs - ageDays * DAY_MS) / 1000;
          yield* fileSystem.utimes(file, mtimeSeconds, mtimeSeconds);
          return file;
        });

      const kept = [
        yield* write("debug/recent.txt", 6),
        yield* write("session-env/a/recent", 29),
        yield* write("shell-snapshots/recent.sh", 13),
        yield* write("todos/recent.json", 29),
        yield* write("projects/old.jsonl", 400),
      ];
      const gone = [
        yield* write("debug/old.txt", 8),
        yield* write("session-env/a/old", 31),
        yield* write("shell-snapshots/old.sh", 15),
        yield* write("todos/old.json", 31),
        yield* write("projects/x/.DS_Store", 0),
      ];

      assert.equal(yield* runClaudeHousekeeping(home, nowMs), gone.length);
      for (const file of kept) assert.isTrue(yield* fileSystem.exists(file), file);
      for (const file of gone) assert.isFalse(yield* fileSystem.exists(file), file);
      // A home without these folders is left alone.
      assert.equal(yield* runClaudeHousekeeping(path.join(home, "missing"), nowMs), 0);
    }).pipe(Effect.scoped),
  );
});
