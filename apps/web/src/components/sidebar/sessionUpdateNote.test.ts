import { describe, expect, it } from "vite-plus/test";

import { sessionUpdateNoteView } from "./sessionUpdateNote";

describe("sessionUpdateNoteView", () => {
  it("hides when every session runs the installed CLI", () => {
    expect(sessionUpdateNoteView(null, false)).toBeNull();
    expect(
      sessionUpdateNoteView({ installedVersion: null, outdated: 0, waiting: 0 }, false),
    ).toBeNull();
  });

  it("offers the update while any chat is on an older CLI", () => {
    expect(
      sessionUpdateNoteView({ installedVersion: "2.1.300", outdated: 2, waiting: 1 }, false),
    ).toEqual({ kind: "out", version: "2.1.300" });
  });

  it("reports queued chats once all are queued", () => {
    expect(
      sessionUpdateNoteView({ installedVersion: "2.1.300", outdated: 0, waiting: 1 }, false),
    ).toEqual({ kind: "waiting", text: "1 chat update when idle" });
  });

  it("has nothing to press while a Claude install runs, whichever prompt started it", () => {
    expect(
      sessionUpdateNoteView({ installedVersion: "2.1.300", outdated: 2, waiting: 0 }, true),
    ).toEqual({ kind: "waiting", text: "Updating Claude…" });
  });
});
