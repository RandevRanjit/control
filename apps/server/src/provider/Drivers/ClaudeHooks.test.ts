import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { claudeHooks } from "./ClaudeHooks.ts";

const writeJson = Effect.fn(function* (file: string, contents: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fs.makeDirectory(path.dirname(file), { recursive: true });
  yield* fs.writeFileString(file, contents);
});

const handler = { type: "command", command: "true" };
const prompt = { type: "prompt", prompt: "Is the work done?" };

it.layer(NodeServices.layer)("claudeHooks", (it) => {
  it.effect("lists each handler: user, project and local settings, then plugins", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const tempDir = yield* fs.makeTempDirectoryScoped({ prefix: "claude-hooks-" });
      const claudeHome = path.join(tempDir, "claude-home");
      const cwd = path.join(tempDir, "workspace");
      const plugin = path.join(tempDir, "plugins", "lint");

      // Two events, three handlers; comments and trailing commas as Claude Code allows.
      yield* writeJson(
        path.join(claudeHome, "settings.json"),
        `{
          // hand-edited
          "hooks": {
            "PreToolUse": [{ "matcher": "Bash", "hooks": [${JSON.stringify(handler)}, ${JSON.stringify(handler)}] }],
            "Stop": [{ "hooks": [${JSON.stringify(prompt)}] }],
          },
        }`,
      );
      yield* writeJson(
        path.join(cwd, ".claude", "settings.json"),
        JSON.stringify({ hooks: { SessionStart: [{ hooks: [handler] }] } }),
      );
      // Not JSON: Claude Code skips it, and so does the count.
      yield* writeJson(path.join(cwd, ".claude", "settings.local.json"), "{ hooks: ");
      yield* writeJson(
        path.join(plugin, "hooks", "hooks.json"),
        JSON.stringify({
          hooks: { PostToolUse: [{ matcher: "Edit", hooks: [handler, handler] }] },
        }),
      );

      const hooks = yield* claudeHooks({
        claudeHome,
        cwd,
        // A plugin without hooks adds none.
        plugins: [
          { name: "lint", path: plugin },
          { name: "quiet", path: path.join(tempDir, "plugins", "no-hooks") },
        ],
      });
      assert.deepStrictEqual(hooks, [
        { event: "PreToolUse", matcher: "Bash", command: "true", source: "user" },
        { event: "PreToolUse", matcher: "Bash", command: "true", source: "user" },
        { event: "Stop", command: "Is the work done?", source: "user" },
        { event: "SessionStart", command: "true", source: "project" },
        { event: "PostToolUse", matcher: "Edit", command: "true", source: "lint" },
        { event: "PostToolUse", matcher: "Edit", command: "true", source: "lint" },
      ]);
    }),
  );

  it.effect("reads the user's settings once for a session rooted at the home directory", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const home = yield* fs.makeTempDirectoryScoped({ prefix: "claude-hooks-home-" });
      yield* writeJson(
        path.join(home, ".claude", "settings.json"),
        JSON.stringify({ hooks: { Stop: [{ hooks: [handler] }] } }),
      );

      const hooks = yield* claudeHooks({
        claudeHome: path.join(home, ".claude"),
        cwd: home,
        plugins: [],
      });
      assert.deepStrictEqual(hooks, [{ event: "Stop", command: "true", source: "user" }]);
    }),
  );
});
