import type { EnvironmentThreadShell } from "@control/client-runtime/state/models";
import { describe, expect, it } from "vite-plus/test";

import { lockChats } from "../lock/lock.logic";
import { menubarIcon, menubarView, settleIcon } from "./menubar.logic";

const NOW = new Date(2026, 9, 16, 16, 0).getTime();
const NOW_ISO = new Date(NOW).toISOString();
const HOUR = 60 * 60 * 1000;
const ago = (hours: number) => new Date(NOW - hours * HOUR).toISOString();

/** A chat with what the panel reads; `state` sets what its card shows. */
function chat(
  id: string,
  state: "needs" | "working" | "done" | "failed" | "failed-seen" | "idle",
  extra: Partial<EnvironmentThreadShell> = {},
): EnvironmentThreadShell {
  const finished = state === "done" || state === "failed" || state === "failed-seen";
  return {
    id,
    environmentId: "env",
    projectId: "project",
    archivedAt: null,
    lineage: { relationshipToParent: null },
    groupId: null,
    settledOverride: null,
    snoozedUntil: null,
    snoozedAt: null,
    hasPendingApprovals: state === "needs",
    hasPendingUserInput: false,
    runtime:
      state === "working"
        ? { status: "running" }
        : state === "failed" || state === "failed-seen"
          ? { status: "failed", lastErrorClass: "provider" }
          : null,
    pendingBackgroundTasks: [],
    latestRun: finished
      ? { status: state === "done" ? "completed" : "failed", completedAt: ago(1) }
      : null,
    lastVisitedAt: state === "failed-seen" ? ago(0.5) : finished ? ago(2) : null,
    updatedAt: ago(1),
    ...extra,
  } as never;
}

const view = (
  threads: ReadonlyArray<EnvironmentThreadShell>,
  locks: { fullLock?: boolean; lockedGroupKeys?: ReadonlyArray<string> } = {},
) =>
  menubarView({
    chats: lockChats(threads, {}, NOW_ISO),
    fullLock: locks.fullLock ?? false,
    lockedGroupKeys: new Set(locks.lockedGroupKeys ?? []),
  });

const icon = (
  threads: ReadonlyArray<EnvironmentThreadShell>,
  options: { serverUp?: boolean; fullLock?: boolean; update?: boolean; locked?: string[] } = {},
) =>
  menubarIcon({
    serverUp: options.serverUp ?? true,
    fullLock: options.fullLock ?? false,
    update: options.update ?? false,
    view: view(threads, {
      fullLock: options.fullLock ?? false,
      lockedGroupKeys: options.locked ?? [],
    }),
  });

const ids = (chats: ReadonlyArray<{ thread: { id: string } }>) => chats.map((c) => c.thread.id);

describe("menubarView", () => {
  it("sorts each section newest change first and keeps idle and seen failures out", () => {
    const panel = view([
      chat("old-working", "working", { updatedAt: ago(3) }),
      chat("new-working", "working", { updatedAt: ago(0.1) }),
      chat("needs", "needs"),
      chat("done", "done"),
      chat("failed", "failed"),
      chat("failed-seen", "failed-seen"),
      chat("idle", "idle"),
    ]);
    expect(ids(panel.needs)).toEqual(["needs"]);
    expect(ids(panel.working)).toEqual(["new-working", "old-working"]);
    expect(ids(panel.done).sort()).toEqual(["done", "failed"]);
    expect(panel.behind).toBeNull();
  });

  it("leaves snoozed and settled chats out", () => {
    const panel = view([
      chat("snoozed", "working", { snoozedUntil: new Date(NOW + HOUR).toISOString() }),
      chat("settled", "done", { settledOverride: "settled" }),
    ]);
    expect([...panel.needs, ...panel.working, ...panel.done]).toEqual([]);
  });

  it("in a full lock shows only the chats that need you, and counts what is behind it", () => {
    const panel = view(
      [chat("needs", "needs"), chat("a", "working"), chat("b", "working"), chat("c", "done")],
      { fullLock: true },
    );
    expect(ids(panel.needs)).toEqual(["needs"]);
    expect(panel.working).toEqual([]);
    expect(panel.done).toEqual([]);
    expect(panel.behind).toEqual({ working: 2, done: 1 });
  });

  it("hides a locked group's chats except the ones that need you", () => {
    const panel = view(
      [
        chat("orbit-needs", "needs", { groupId: "orbit" } as never),
        chat("orbit-working", "working", { groupId: "orbit" } as never),
        chat("orbit-done", "done", { groupId: "orbit" } as never),
        chat("loose", "working"),
      ],
      { lockedGroupKeys: ["env:orbit"] },
    );
    expect(ids(panel.needs)).toEqual(["orbit-needs"]);
    expect(ids(panel.working)).toEqual(["loose"]);
    expect(panel.done).toEqual([]);
  });
});

describe("menubarIcon", () => {
  it("shows the first state that holds: off, needs you, lock, failed, done, working, idle", () => {
    const all = [chat("n", "needs"), chat("f", "failed"), chat("d", "done"), chat("w", "working")];
    expect(icon(all, { serverUp: false }).state).toBe("off");
    expect(icon(all, { fullLock: true }).state).toBe("needs");
    expect(icon(all.slice(1), { fullLock: true }).state).toBe("lock");
    expect(icon(all.slice(1)).state).toBe("failed");
    expect(icon(all.slice(2)).state).toBe("done");
    expect(icon(all.slice(3)).state).toBe("working");
    expect(icon([]).state).toBe("idle");
  });

  it("counts the state's own chats in the title, `!` when the server is off and none for lock or idle", () => {
    expect(icon([chat("a", "needs"), chat("b", "needs"), chat("c", "working")]).title).toBe("2");
    expect(icon([chat("a", "done"), chat("b", "failed-seen")]).title).toBe("1");
    expect(icon([chat("a", "working")], { serverUp: false }).title).toBe("!");
    expect(icon([chat("a", "working")], { fullLock: true }).title).toBe("");
    expect(icon([]).title).toBe("");
  });

  it("puts the update dot on every state but off", () => {
    expect(icon([chat("a", "working")], { update: true }).update).toBe(true);
    expect(icon([], { update: true }).update).toBe(true);
    expect(icon([], { update: true, serverUp: false }).update).toBe(false);
  });

  it("does not count a locked group's working or finished chats", () => {
    const orbit = { groupId: "orbit" } as never;
    expect(
      icon([chat("a", "working", orbit), chat("b", "done", orbit)], { locked: ["env:orbit"] }),
    ).toMatchObject({ state: "idle", title: "" });
  });
});

/** A clock the test drives: `advance` runs what has come due. */
function testClock() {
  let now = 0;
  const tasks: Array<{ at: number; run: () => void; live: boolean }> = [];
  return {
    schedule: (run: () => void, ms: number) => {
      const task = { at: now + ms, run, live: true };
      tasks.push(task);
      return () => void (task.live = false);
    },
    advance: (ms: number) => {
      now += ms;
      for (const task of tasks) {
        if (task.live && task.at <= now) {
          task.live = false;
          task.run();
        }
      }
    },
  };
}

describe("settleIcon", () => {
  const working = { state: "working", update: false, title: "1" } as const;
  const done = { state: "done", update: false, title: "1" } as const;

  it("puts a state up once it has held for 2 s", () => {
    const clock = testClock();
    const shown: string[] = [];
    const settle = settleIcon((icon) => shown.push(icon.state), clock.schedule);
    settle(working);
    clock.advance(1999);
    expect(shown).toEqual([]);
    clock.advance(1);
    expect(shown).toEqual(["working"]);
  });

  it("doesn't flicker when a turn ends and the next starts within 2 s", () => {
    const clock = testClock();
    const shown: string[] = [];
    const settle = settleIcon((icon) => shown.push(icon.state), clock.schedule);
    settle(working);
    clock.advance(2000);
    settle(done);
    clock.advance(1500);
    settle(working);
    clock.advance(5000);
    expect(shown).toEqual(["working"]);
  });

  it("starts the hold again when the state changes before it settles", () => {
    const clock = testClock();
    const shown: string[] = [];
    const settle = settleIcon((icon) => shown.push(icon.state), clock.schedule);
    settle(working);
    clock.advance(1500);
    settle(done);
    clock.advance(1500);
    expect(shown).toEqual([]);
    clock.advance(500);
    expect(shown).toEqual(["done"]);
  });
});
