import { MessageId, RunId } from "@control/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import type { ChatMessage, TurnDiffSummary } from "../../types";
import { deriveThreadOutputs } from "./threadOutputs";

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
): ChatMessage => ({
  id: MessageId.make(id),
  role,
  text: "",
  attachments,
  runId: RunId.make(runId),
  streaming: false,
  createdAt: "2026-10-27T20:00:00.000Z",
  updatedAt: "2026-10-27T20:00:00.000Z",
});
const checkpoint = (runId: string, files: TurnDiffSummary["files"]) =>
  ({ runId: RunId.make(runId), checkpointTurnCount: 1, files }) as unknown as TurnDiffSummary;

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
      checkpoints: [
        checkpoint("r14", [
          { path: "lib/release.ts", kind: "modified", additions: 2, deletions: 1 },
          { path: "docs/RELEASE.md", kind: "modified", additions: 4, deletions: 10 },
          { path: "app/admin/page.tsx", kind: "added", additions: 31, deletions: 0 },
          { path: "public/hero.png", kind: "added", additions: 0, deletions: 0 },
        ]),
      ],
      nowMs: Date.parse("2026-10-27T20:00:30.000Z"),
    });

    expect(turns.map((turn) => turn.ordinal)).toEqual([14, 12]);
    expect(turns[0]!.label).toBe("T14 · now");
    expect(turns[0]!.items.map(({ kind, name, meta }) => [kind, name, meta])).toEqual([
      ["shot", "button.cta.png", "PNG · 41 KB"],
      ["file", "DESIGN.md", "Markdown"],
      ["page", "Release size", "Page"],
      // Code the turn changed is Git's; the documents and pictures it wrote are outputs.
      ["change", "docs/RELEASE.md", "+4 −10"],
      ["change", "public/hero.png", "new"],
    ]);
    // The user's own picture is not an output; the build is.
    expect(turns[1]!.items.map(({ kind, name, meta }) => [kind, name, meta])).toEqual([
      ["out", "ORBIT-0.2.3.dmg", "DMG · 11.7 MB"],
    ]);
  });

  it("leaves out turns that only changed code", () => {
    expect(
      deriveThreadOutputs({
        runs: [run("r1", 1, "2026-10-27T18:20:00.000Z")],
        messages: [message("a1", "assistant", "r1", [])],
        htmlRenders: [],
        checkpoints: [
          checkpoint("r1", [
            { path: "src/app.tsx", kind: "modified", additions: 3, deletions: 1 },
            { path: "package.json", kind: "modified", additions: 1, deletions: 1 },
            { path: "site/index.html", kind: "modified", additions: 1, deletions: 1 },
          ]),
        ],
        nowMs: Date.parse("2026-10-27T20:00:00.000Z"),
      }),
    ).toEqual([]);
  });

  it("leaves out turns that made nothing", () => {
    expect(
      deriveThreadOutputs({
        runs: [run("r1", 1, "2026-10-27T18:20:00.000Z")],
        messages: [message("a1", "assistant", "r1", [])],
        htmlRenders: [],
        checkpoints: [checkpoint("r1", [])],
        nowMs: Date.parse("2026-10-27T20:00:00.000Z"),
      }),
    ).toEqual([]);
  });
});
