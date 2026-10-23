import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { readClaudeSettingsEnvVar } from "./ClaudeSettingsEnv.ts";

const writeJson = Effect.fn(function* (file: string, contents: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fs.makeDirectory(path.dirname(file), { recursive: true });
  yield* fs.writeFileString(file, contents);
});

const name = "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE";

it.layer(NodeServices.layer)("readClaudeSettingsEnvVar", (it) => {
  it.effect(
    "takes the spawn env, then user, project and local settings, the last set winning",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const tempDir = yield* fs.makeTempDirectoryScoped({ prefix: "claude-settings-env-" });
        const claudeHome = path.join(tempDir, "claude-home");
        const cwd = path.join(tempDir, "workspace");
        const read = readClaudeSettingsEnvVar({
          claudeHome,
          cwd,
          environment: { [name]: "82" },
          name,
        });

        assert.strictEqual(yield* read, "82");
        // Hand-edited: comments and trailing commas, as Claude Code allows.
        yield* writeJson(
          path.join(claudeHome, "settings.json"),
          `{ // mine
          "env": { "${name}": "50", }, }`,
        );
        assert.strictEqual(yield* read, "50");
        yield* writeJson(
          path.join(cwd, ".claude", "settings.json"),
          JSON.stringify({ env: { [name]: 60 } }),
        );
        assert.strictEqual(yield* read, "60");
        // Not JSON: Claude Code skips it, and so does the read.
        yield* writeJson(path.join(cwd, ".claude", "settings.local.json"), "{ env: ");
        assert.strictEqual(yield* read, "60");
        yield* writeJson(
          path.join(cwd, ".claude", "settings.local.json"),
          JSON.stringify({ env: { OTHER: "1" } }),
        );
        assert.strictEqual(yield* read, "60");
      }),
  );
});
