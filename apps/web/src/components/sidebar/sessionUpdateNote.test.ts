import { describe, expect, it } from "vite-plus/test";

import { ProviderDriverKind, ProviderInstanceId, type ServerProvider } from "@control/contracts";

import { claudeUpdateOffer, sessionUpdateNoteView } from "./sessionUpdateNote";

const current = { installedVersion: "2.1.300", outdated: 0, waiting: 0 };

function claude(input: {
  readonly status?: "current" | "behind_latest";
  readonly canUpdate?: boolean;
  readonly updateState?: ServerProvider["updateState"];
}): ServerProvider {
  const checkedAt = "2026-11-12T10:00:00.000Z";
  return {
    instanceId: ProviderInstanceId.make("claudeAgent"),
    driver: ProviderDriverKind.make("claudeAgent"),
    enabled: true,
    installed: true,
    version: "2.1.300",
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt,
    models: [],
    slashCommands: [],
    skills: [],
    versionAdvisory: {
      status: input.status ?? "behind_latest",
      currentVersion: "2.1.300",
      latestVersion: "2.1.318",
      updateCommand: "claude update",
      canUpdate: input.canUpdate ?? true,
      checkedAt,
      message: null,
    },
    ...(input.updateState ? { updateState: input.updateState } : {}),
  };
}

const updateState = (status: "running" | "failed", message: string | null = null) => ({
  status,
  startedAt: "2026-11-12T10:00:00.000Z",
  finishedAt: status === "failed" ? "2026-11-12T10:01:00.000Z" : null,
  message,
  output: null,
});

describe("claudeUpdateOffer", () => {
  it("offers the newer Claude its installer fetches in one go", () => {
    expect(claudeUpdateOffer([claude({})])).toEqual({ version: "2.1.318", failure: null });
  });

  it("carries why the last install failed", () => {
    expect(
      claudeUpdateOffer([claude({ updateState: updateState("failed", "npm exited 1") })]),
    ).toEqual({ version: "2.1.318", failure: "npm exited 1" });
  });

  it("offers nothing when Claude is current, can't update in one go, or is updating", () => {
    expect(claudeUpdateOffer([claude({ status: "current" })])).toBeNull();
    expect(claudeUpdateOffer([claude({ canUpdate: false })])).toBeNull();
    expect(claudeUpdateOffer([claude({ updateState: updateState("running") })])).toBeNull();
  });
});

describe("sessionUpdateNoteView", () => {
  it("hides when every session runs the installed CLI and nothing newer is on offer", () => {
    expect(sessionUpdateNoteView(null, false, null)).toBeNull();
    expect(
      sessionUpdateNoteView({ installedVersion: null, outdated: 0, waiting: 0 }, false, null),
    ).toBeNull();
    expect(sessionUpdateNoteView(current, false, null)).toBeNull();
  });

  it("offers the update while any chat is on an older CLI", () => {
    expect(
      sessionUpdateNoteView({ installedVersion: "2.1.300", outdated: 2, waiting: 1 }, false, null),
    ).toEqual({ kind: "out", version: "2.1.300", failure: null });
  });

  it("offers a newer Claude when one is on offer, with every chat current", () => {
    expect(sessionUpdateNoteView(current, false, { version: "2.1.318", failure: null })).toEqual({
      kind: "out",
      version: "2.1.318",
      failure: null,
    });
  });

  it("says a failed install didn't take, and offers it again", () => {
    expect(
      sessionUpdateNoteView(current, false, { version: "2.1.318", failure: "npm exited 1" }),
    ).toEqual({ kind: "out", version: "2.1.318", failure: "npm exited 1" });
  });

  it("reports queued chats once all are queued", () => {
    expect(
      sessionUpdateNoteView({ installedVersion: "2.1.300", outdated: 0, waiting: 1 }, false, null),
    ).toEqual({ kind: "waiting", text: "1 thread update when idle" });
  });

  it("has nothing to press while a Claude install runs, whichever prompt started it", () => {
    expect(
      sessionUpdateNoteView({ installedVersion: "2.1.300", outdated: 2, waiting: 0 }, true, null),
    ).toEqual({ kind: "waiting", text: "Updating Claude…" });
    expect(sessionUpdateNoteView(current, true, null)).toEqual({
      kind: "waiting",
      text: "Updating Claude…",
    });
  });
});
