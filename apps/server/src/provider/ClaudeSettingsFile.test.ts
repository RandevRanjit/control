import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import {
  addClaudeSettingsHook,
  readClaudeSettingsFile,
  updateClaudeSettingsFile,
} from "./ClaudeSettingsFile.ts";

const original = {
  model: "opus",
  effortLevel: "high",
  permissions: { allow: ["Bash(git status)"], defaultMode: "auto" },
  env: { A: "1" },
  enabledPlugins: { "one@market": true, "two@market": false },
  hooks: { PreToolUse: [{ matcher: "Bash" }, { matcher: "Edit" }], Stop: [] },
  statusLine: { type: "command", command: "x" },
};

it.layer(NodeServices.layer)("Claude settings file", (it) => {
  it.effect("shows the covered settings and edits only those, keeping the rest", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const home = yield* fileSystem.makeTempDirectoryScoped({ prefix: "claude-settings-" });
      const file = path.join(home, "settings.json");
      yield* fileSystem.writeFileString(file, JSON.stringify(original));

      assert.deepStrictEqual(yield* readClaudeSettingsFile(file), {
        path: file,
        model: "opus",
        effortLevel: "high",
        defaultMode: "auto",
        autoMemoryDirectory: null,
        env: { A: "1" },
        enabledPlugins: { "one@market": true, "two@market": false },
        hookEvents: { PreToolUse: 2, Stop: 0 },
      });

      yield* updateClaudeSettingsFile(
        {
          model: null,
          effortLevel: "max",
          defaultMode: "plan",
          env: { B: "2" },
          enabledPlugins: { "two@market": true },
        },
        file,
      );
      const written = JSON.parse(yield* fileSystem.readFileString(file)) as Record<string, unknown>;
      assert.deepStrictEqual(written, {
        effortLevel: "max",
        permissions: { allow: ["Bash(git status)"], defaultMode: "plan" },
        env: { B: "2" },
        enabledPlugins: { "one@market": true, "two@market": true },
        hooks: original.hooks,
        statusLine: original.statusLine,
      });
    }).pipe(Effect.scoped),
  );

  it.effect("keeps the previous file in backups/ before replacing it", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const home = yield* fileSystem.makeTempDirectoryScoped({ prefix: "claude-settings-" });
      const file = path.join(home, "settings.json");
      const before = JSON.stringify(original);
      yield* fileSystem.writeFileString(file, before);

      yield* updateClaudeSettingsFile({ model: "sonnet" }, file);

      const backups = path.join(home, "backups");
      const copies = yield* Effect.forEach(yield* fileSystem.readDirectory(backups), (name) =>
        fileSystem.readFileString(path.join(backups, name)),
      );
      assert.deepStrictEqual(copies, [before]);
    }).pipe(Effect.scoped),
  );

  it.effect("adds a hook once, beside the ones already there, keeping a copy", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const home = yield* fileSystem.makeTempDirectoryScoped({ prefix: "claude-settings-" });
      const file = path.join(home, "settings.json");
      const mine = { hooks: [{ type: "command", command: "echo mine" }] };
      yield* fileSystem.writeFileString(
        file,
        JSON.stringify({ ...original, hooks: { ...original.hooks, UserPromptSubmit: [mine] } }),
      );

      assert.isTrue(yield* addClaudeSettingsHook("UserPromptSubmit", "sh '/x/lock-hook.sh'", file));
      assert.isFalse(
        yield* addClaudeSettingsHook("UserPromptSubmit", "sh '/x/lock-hook.sh'", file),
      );

      const written = JSON.parse(yield* fileSystem.readFileString(file)) as unknown;
      assert.deepStrictEqual(written, {
        ...original,
        hooks: {
          ...original.hooks,
          UserPromptSubmit: [
            mine,
            { hooks: [{ type: "command", command: "sh '/x/lock-hook.sh'" }] },
          ],
        },
      });
      // One write, one copy: the second call found the hook and left the file alone.
      assert.lengthOf(yield* fileSystem.readDirectory(path.join(home, "backups")), 1);
    }).pipe(Effect.scoped),
  );

  it.effect("never overwrites a file that is not valid JSON", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const home = yield* fileSystem.makeTempDirectoryScoped({ prefix: "claude-settings-" });
      const file = path.join(home, "settings.json");
      yield* fileSystem.writeFileString(file, "{ broken");

      const failure = yield* updateClaudeSettingsFile({ model: "sonnet" }, file).pipe(Effect.flip);
      assert.equal(failure._tag, "ClaudeSettingsFileError");
      assert.equal(yield* fileSystem.readFileString(file), "{ broken");
    }).pipe(Effect.scoped),
  );
});
