import { GB, type LocalModelRuntime, type LocalModelsSnapshot } from "@control/contracts";
import { describe, expect, it } from "vite-plus/test";

import { memoryBar, memoryLine, noteFace, rowStatus } from "./localModels.ts";

const NOW = Date.parse("2026-10-13T21:47:00.000Z");
const runtime = (fields: Partial<LocalModelRuntime>): LocalModelRuntime => ({
  modelId: "qwen-27b" as LocalModelRuntime["modelId"],
  state: "asleep",
  since: "2026-10-13T21:46:19.000Z",
  calls: 0,
  ...fields,
});

describe("the sidebar note", () => {
  it("shows waking with the time so far, ready with its memory, in use with its calls", () => {
    expect(noteFace(runtime({ state: "waking" }), NOW)).toEqual({
      lamp: "bg",
      before: "waking · ",
      num: "0:41",
      after: "",
    });
    expect(noteFace(runtime({ state: "ready", footprintBytes: 33.4 * GB }), NOW)).toEqual({
      lamp: "idle",
      before: "ready · ",
      num: "33 GB",
      after: "",
    });
    expect(noteFace(runtime({ state: "ready", calls: 1 }), NOW)).toEqual({
      lamp: "bg",
      before: "in use · ",
      num: "1",
      after: " call",
    });
  });
});

describe("Settings › Local models", () => {
  it("splits the Mac's memory into apps, models and free, with what's kept back", () => {
    const snapshot: LocalModelsSnapshot = {
      models: [
        {
          id: "qwen-27b" as never,
          name: "Qwen 27B",
          file: "/models/q.gguf",
          args: ["llama-server"],
          systemPrompt: "",
          idleMinutes: 10,
        },
      ],
      runtimes: [runtime({ state: "ready", footprintBytes: 33 * GB })],
      memory: {
        totalBytes: 128 * GB,
        availableBytes: 54 * GB,
        keepBytes: 15 * GB,
        swapUsedBytes: 0,
      },
    };
    expect(memoryBar(snapshot)).toEqual({
      total: 128 * GB,
      apps: 41 * GB,
      models: 33 * GB,
      free: 54 * GB,
      keep: 15 * GB,
      swap: 0,
    });
    expect(memoryLine(snapshot)).toBe("54 GB free of 128 GB, with 15 GB kept back and no swap.");
  });

  it("says what each row is doing, and when a big asleep model will ask", () => {
    expect(rowStatus(runtime({ needBytes: 42 * GB }), NOW)).toEqual({
      state: "asleep",
      rest: " · 42 GB",
      second: "asks first: over 40 GB",
    });
    expect(
      rowStatus(runtime({ lastExit: { at: "", code: null, signal: "SIGKILL" } }), NOW).second,
    ).toBe("exited · SIGKILL");
    // An ordinary sleep's SIGTERM isn't news.
    expect(
      rowStatus(runtime({ lastExit: { at: "", code: null, signal: "SIGTERM" } }), NOW).second,
    ).toBeNull();
    expect(
      rowStatus(
        runtime({ state: "ready", pid: 48213, port: 51732, footprintBytes: 33.4 * GB }),
        NOW,
      ),
    ).toEqual({ state: "ready", rest: " · 33.4 GB", second: "PID 48213 · :51732" });
  });
});
