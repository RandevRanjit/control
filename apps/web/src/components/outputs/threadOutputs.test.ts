import { MessageId, RunId } from "@control/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import type { TimelineEntry } from "../../session-logic";
import type { ChatMessage } from "../../types";
import { deriveThreadOutputs, filedOutputsFromTimeline } from "./threadOutputs";

const at = (iso: string) => DateTime.makeUnsafe(iso);
const run = (id: string, ordinal: number, completedAt: string) => ({
  id: RunId.make(id),
  ordinal,
  requestedAt: at(completedAt),
  startedAt: at(completedAt),
  completedAt: at(completedAt),
});
const message = (
  id: string,
  role: ChatMessage["role"],
  runId: string,
  attachments: ChatMessage["attachments"],
  text = "",
): ChatMessage => ({
  id: MessageId.make(id),
  role,
  text,
  attachments,
  runId: RunId.make(runId),
  streaming: false,
  createdAt: "2026-10-27T20:00:00.000Z",
  updatedAt: "2026-10-27T20:00:00.000Z",
});
const toolCall = (toolName: string, runId: string, status: string, output: unknown) =>
  ({
    id: `call-${toolName}-${runId}`,
    kind: "work",
    createdAt: "2026-10-27T20:00:00.000Z",
    entry: {
      structuredPayload: {
        type: "dynamic_tool",
        toolName,
        runId: RunId.make(runId),
        status,
        output,
      },
    },
  }) as unknown as TimelineEntry;

describe("deriveThreadOutputs", () => {
  it("lists what the agent made, by turn, newest turn first", () => {
    const turns = deriveThreadOutputs({
      runs: [
        run("r12", 12, "2026-10-27T18:20:00.000Z"),
        run("r14", 14, "2026-10-27T20:00:00.000Z"),
      ],
      messages: [
        message("u12", "user", "r12", [
          { type: "image", id: "pasted", name: "mine.png", mimeType: "image/png", sizeBytes: 900 },
        ]),
        message("a12", "assistant", "r12", [
          {
            type: "file",
            id: "dmg",
            name: "ORBIT-0.2.3.dmg",
            mimeType: "application/x-apple-diskimage",
            sizeBytes: 12_268_339,
          },
        ]),
        message("a14", "assistant", "r14", [
          {
            type: "image",
            id: "shot",
            name: "button.cta.png",
            mimeType: "image/png",
            sizeBytes: 41_000,
          },
          { type: "file", id: "md", name: "DESIGN.md", mimeType: "text/markdown", sizeBytes: 812 },
        ]),
      ],
      htmlRenders: [{ runId: RunId.make("r14"), attachmentId: "page", title: "Release size" }],
      filed: [
        { runId: RunId.make("r14"), path: "docs/RELEASE.md" },
        { runId: RunId.make("r14"), path: "public/v1.2/hero.png" },
      ],
      nowMs: Date.parse("2026-10-27T20:00:30.000Z"),
    });

    expect(turns.map((turn) => turn.ordinal)).toEqual([14, 12]);
    expect(turns[0]!.label).toBe("T14 · now");
    expect(turns[0]!.items.map(({ kind, name, meta }) => [kind, name, meta])).toEqual([
      ["shot", "button.cta.png", "PNG · 41 KB"],
      ["file", "DESIGN.md", "Markdown"],
      ["page", "Release size", "Page"],
      ["filed", "docs/RELEASE.md", "MD"],
      ["filed", "public/v1.2/hero.png", "PNG"],
    ]);
    // The user's own picture is not an output; the build is.
    expect(turns[1]!.items.map(({ kind, name, meta }) => [kind, name, meta])).toEqual([
      ["out", "ORBIT-0.2.3.dmg", "DMG · 11.7 MB"],
    ]);
  });

  it("leaves out a turn that filed nothing, whatever its reply links", () => {
    expect(
      deriveThreadOutputs({
        runs: [run("r1", 1, "2026-10-27T18:20:00.000Z")],
        messages: [message("a1", "assistant", "r1", [], "Built [the pack](/repo/pack.pdf).")],
        htmlRenders: [],
        filed: [],
        nowMs: Date.parse("2026-10-27T20:00:00.000Z"),
      }),
    ).toEqual([]);
  });

  it("lists a file once however many times a turn files it, and again in a later turn", () => {
    const pack = { path: "Exam pack/HF R.pdf" };
    const turns = deriveThreadOutputs({
      runs: [run("r1", 1, "2026-11-03T15:45:00.000Z"), run("r2", 2, "2026-11-03T16:45:00.000Z")],
      messages: [],
      htmlRenders: [],
      filed: [
        { runId: RunId.make("r1"), ...pack },
        { runId: RunId.make("r1"), ...pack },
        { runId: RunId.make("r2"), ...pack },
      ],
      nowMs: Date.parse("2026-11-03T17:00:00.000Z"),
    });

    expect(turns.map((turn) => turn.items.map((item) => item.id))).toEqual([
      ["filed:r2:Exam pack/HF R.pdf"],
      ["filed:r1:Exam pack/HF R.pdf"],
    ]);
  });
});

describe("filedOutputsFromTimeline", () => {
  it("reads completed output_add calls, in any provider's spelling of the name", () => {
    const filed = { filedOutputs: ["a.pdf", "b/c.png"] };
    expect(
      filedOutputsFromTimeline([
        toolCall("mcp__control__output_add", "r1", "completed", filed),
        toolCall("control.output_add", "r2", "completed", { filedOutputs: ["d.csv"] }),
      ]),
    ).toEqual([
      { runId: RunId.make("r1"), path: "a.pdf" },
      { runId: RunId.make("r1"), path: "b/c.png" },
      { runId: RunId.make("r2"), path: "d.csv" },
    ]);
  });

  it("ignores a failed call, a running one and another tool that returns the same shape", () => {
    const filed = { filedOutputs: ["a.pdf"] };
    expect(
      filedOutputsFromTimeline([
        toolCall("mcp__control__output_add", "r1", "failed", filed),
        toolCall("mcp__control__output_add", "r1", "completed", { ...filed, isError: true }),
        toolCall("mcp__control__output_add", "r1", "running", filed),
        toolCall("mcp__other__output_add", "r1", "completed", filed),
      ]),
    ).toEqual([]);
  });
});
