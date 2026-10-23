// @effect-diagnostics globalDate:off -- The labels read the local clock, so the times are local.
import { LooseEndId, RunId, ThreadId, type OrchestrationV2LooseEnd } from "@control/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import { actionLabel, closedLabel, filedLabel, splitLooseEnds } from "./looseEnds.ts";

const at = (local: string) => DateTime.makeUnsafe(new Date(local).toISOString());
const nowMs = new Date("2026-10-12T23:30:00").getTime();
const runs = [
  { id: RunId.make("run-12"), ordinal: 12, startedAt: at("2026-10-12T23:10:00") },
  { id: RunId.make("run-13"), ordinal: 13, startedAt: at("2026-10-12T23:25:00") },
];
const item = (
  id: string,
  patch: Partial<OrchestrationV2LooseEnd> = {},
): OrchestrationV2LooseEnd => ({
  id: LooseEndId.make(id),
  threadId: ThreadId.make("thread"),
  runId: RunId.make("run-12"),
  line: id,
  reason: "",
  action: null,
  status: "open",
  closedBy: null,
  closedAt: null,
  createdAt: at("2026-10-12T23:20:00"),
  updatedAt: at("2026-10-12T23:20:00"),
  ...patch,
});

describe("loose ends", () => {
  it("lists open items as filed and closed ones newest first", () => {
    const { open, closed } = splitLooseEnds([
      item("second", { createdAt: at("2026-10-12T23:21:00") }),
      item("first"),
      item("closed-early", {
        status: "done",
        closedBy: "owner",
        closedAt: at("2026-10-12T21:40:00"),
      }),
      item("closed-late", {
        status: "dismissed",
        closedBy: "owner",
        closedAt: at("2026-10-12T22:00:00"),
      }),
    ]);
    expect(open.map((entry) => entry.line)).toEqual(["first", "second"]);
    expect(closed.map((entry) => entry.line)).toEqual(["closed-late", "closed-early"]);
  });

  it("names the turn and time an item was filed", () => {
    expect(filedLabel(item("a"), runs, nowMs)).toBe("T12 · 23:20");
    expect(filedLabel(item("b", { createdAt: at("2026-10-12T23:29:30") }), runs, nowMs)).toBe(
      "T12 · now",
    );
    expect(
      filedLabel(item("c", { runId: null, createdAt: at("2026-10-10T09:00:00") }), runs, nowMs),
    ).toBe("10 Oct");
  });

  it("says who closed an item and when", () => {
    expect(
      closedLabel(
        item("a", { status: "done", closedBy: "owner", closedAt: at("2026-10-12T21:40:00") }),
        runs,
        nowMs,
      ),
    ).toBe("Done by you · 21:40");
    expect(
      closedLabel(
        item("b", { status: "dismissed", closedBy: "owner", closedAt: at("2026-10-12T22:05:00") }),
        runs,
        nowMs,
      ),
    ).toBe("Dismissed by you · 22:05");
    expect(
      closedLabel(
        item("c", { status: "done", closedBy: "agent", closedAt: at("2026-10-12T23:26:00") }),
        runs,
        nowMs,
      ),
    ).toBe("Closed by the agent · T13");
  });

  it("offers Reveal for a file only where the file is", () => {
    expect(actionLabel({ kind: "link", value: "https://example.com" }, true)).toBe("Open");
    expect(actionLabel({ kind: "file", value: "/tmp/a" }, true)).toBe("Reveal");
    expect(actionLabel({ kind: "file", value: "/tmp/a" }, false)).toBe("Copy");
    expect(actionLabel({ kind: "command", value: "make" }, true)).toBe("Copy");
  });
});
