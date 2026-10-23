import { describe, expect, it } from "vite-plus/test";

import { commandText, parseCommand } from "./localModels.logic";

describe("Settings › Local models", () => {
  it("edits the command as text and reads it back into arguments", () => {
    const files = { file: "/Users/me/my models/q.gguf", projector: "/Users/me/my models/mm.gguf" };
    const args = [
      "/opt/homebrew/bin/llama-server",
      "-m",
      files.file,
      "--mmproj",
      files.projector,
      "--chat-template-file",
      "/Users/me/my models/t.jinja",
      "-c",
      "32768",
    ] as const;
    const text = commandText(args, files);
    expect(text).toBe(
      '/opt/homebrew/bin/llama-server -m <file> --mmproj <projector> --chat-template-file "/Users/me/my models/t.jinja" -c 32768',
    );
    expect(parseCommand(text, files)).toEqual(args);
    expect(parseCommand('llama-server -m "unfinished', files)).toBeNull();
    expect(parseCommand("   ", files)).toBeNull();
  });
});
