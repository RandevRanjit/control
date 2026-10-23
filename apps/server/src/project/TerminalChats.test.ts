import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import * as TerminalChats from "./TerminalChats.ts";

const record = (value: Record<string, unknown>) => JSON.stringify(value);
const transcript = (entrypoint: string, sessionId: string, texts: ReadonlyArray<string>) =>
  [
    record({ type: "file-history-snapshot" }),
    ...texts.map((text, index) =>
      record({
        type: index % 2 === 0 ? "user" : "assistant",
        entrypoint,
        sessionId,
        timestamp: `2026-10-09T10:0${index}:00.000Z`,
        message: {
          role: index % 2 === 0 ? "user" : "assistant",
          content: index % 2 === 0 ? text : [{ type: "text", text }],
        },
      }),
    ),
  ].join("\n");

describe("TerminalChats", () => {
  it("names Claude Code's project folder", () => {
    assert.equal(
      TerminalChats.claudeProjectFolderName("/Users/me/Documents_Old/My Thesis"),
      "-Users-me-Documents-Old-My-Thesis",
    );
  });

  it("keeps visible text and leaves out meta, sidechains and slash commands", () => {
    const scan = TerminalChats.scanTranscript(
      [
        record({ type: "user", entrypoint: "cli", message: { content: "Fix the build\nplease" } }),
        record({ type: "user", isMeta: true, message: { content: "caveat" } }),
        record({ type: "user", message: { content: "<command-name>/clear</command-name>" } }),
        record({ type: "assistant", isSidechain: true, message: { content: "side" } }),
        record({ type: "assistant", message: { content: [{ type: "tool_use" }] } }),
        "not json",
        record({ type: "assistant", message: { content: [{ type: "text", text: "Done." }] } }),
      ].join("\n"),
    );
    assert.equal(scan.entrypoint, "cli");
    assert.equal(scan.title, "Fix the build");
    assert.deepEqual(
      scan.messages.map((message) => message.text),
      ["Fix the build\nplease", "Done."],
    );
  });

  it.effect("lists and reads only the terminal's own chats", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const claudeHome = yield* fileSystem.makeTempDirectoryScoped({ prefix: "terminal-chats-" });
        const workspaceRoot = "/work/app";
        const folder = path.join(claudeHome, "projects", "-work-app");
        yield* fileSystem.makeDirectory(folder, { recursive: true });
        const write = (sessionId: string, contents: string, mtimeSeconds: number) =>
          Effect.gen(function* () {
            const file = path.join(folder, `${sessionId}.jsonl`);
            yield* fileSystem.writeFileString(file, contents);
            yield* fileSystem.utimes(file, mtimeSeconds, mtimeSeconds);
          });
        yield* write("old-cli", transcript("cli", "old-cli", ["Old task", "Old answer"]), 1_000);
        yield* write("new-cli", transcript("cli", "new-cli", ["New task", "a", "b", "c"]), 2_000);
        yield* write("control", transcript("sdk-cli", "control", ["Control's chat"]), 3_000);
        yield* write("imported", transcript("cli", "imported", ["Moved here"]), 4_000);
        const excludeSessionIds = new Set(["imported"]);

        const chats = yield* TerminalChats.listTerminalChats({
          claudeHome,
          workspaceRoot,
          excludeSessionIds,
          limit: 10,
        });
        assert.deepEqual(
          chats.map((chat) => [chat.sessionId, chat.title]),
          [
            ["new-cli", "New task"],
            ["old-cli", "Old task"],
          ],
        );
        assert.equal(
          (yield* TerminalChats.listTerminalChats({
            claudeHome,
            workspaceRoot,
            excludeSessionIds,
            limit: 1,
          })).length,
          1,
        );

        const read = yield* TerminalChats.readTerminalChat({
          claudeHome,
          workspaceRoot,
          sessionId: "new-cli",
          excludeSessionIds,
          limit: 2,
        });
        assert.equal(read._tag, "Found");
        if (read._tag === "Found") {
          assert.deepEqual(
            read.messages.map((message) => message.text),
            ["b", "c"],
          );
          assert.isTrue(read.truncated);
        }
        for (const sessionId of ["control", "imported", "../projects/-work-app/new-cli", "gone"]) {
          const refused = yield* TerminalChats.readTerminalChat({
            claudeHome,
            workspaceRoot,
            sessionId,
            excludeSessionIds,
            limit: 10,
          });
          assert.equal(refused._tag, "NotFound", sessionId);
        }
      }).pipe(Effect.provide(NodeServices.layer)),
    ),
  );
});
