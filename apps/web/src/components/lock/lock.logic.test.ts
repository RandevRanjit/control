import type {
  EnvironmentGroup,
  EnvironmentThreadShell,
} from "@control/client-runtime/state/models";
import { describe, expect, it } from "vite-plus/test";

import {
  canLockUntil,
  clockLabel,
  defaultTickedGroups,
  fullLockSummary,
  groupLockSummary,
  groupRowCount,
  lockChats,
  lockCounts,
  parseClock,
} from "./lock.logic";

const NOW = new Date(2026, 9, 11, 16, 0).getTime();
const NOW_ISO = new Date(NOW).toISOString();
const HOUR = 60 * 60 * 1000;

/** A chat with only what the lock reads; `state` sets what its card shows. */
function chat(
  id: string,
  state: "needs" | "failed" | "working" | "background" | "done" | "idle",
  extra: Partial<EnvironmentThreadShell> = {},
): EnvironmentThreadShell {
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
        : state === "failed"
          ? { status: "failed", lastErrorClass: "provider" }
          : null,
    pendingBackgroundTasks: state === "background" ? [{}] : [],
    latestRun:
      state === "done"
        ? { status: "completed", completedAt: new Date(NOW - HOUR).toISOString() }
        : null,
    lastVisitedAt: state === "done" ? new Date(NOW - 2 * HOUR).toISOString() : null,
    ...extra,
  } as never;
}

const group = (id: string, name: string, lockedUntil: string | null = null) =>
  ({ environmentId: "env", id, name, tint: "rose", lockedUntil }) as never as EnvironmentGroup;

describe("lockChats", () => {
  it("counts a question or an approval as needing you, never a failure", () => {
    const chats = lockChats(
      [chat("a", "needs"), chat("b", "failed"), chat("c", "idle")],
      {},
      NOW_ISO,
    );
    expect(chats.map((each) => each.needs)).toEqual([true, false, false]);
  });

  it("counts running turns and background work as working, unread finishes as done", () => {
    const chats = lockChats(
      [chat("a", "working"), chat("b", "background"), chat("c", "done"), chat("d", "idle")],
      {},
      NOW_ISO,
    );
    expect(lockCounts(chats)).toEqual({ all: 4, working: 2, done: 1 });
  });

  it("leaves snoozed and settled chats out of the counts, and archived ones and subagents out", () => {
    const chats = lockChats(
      [
        chat("live", "working"),
        chat("snoozed", "working", {
          snoozedUntil: new Date(NOW + HOUR).toISOString(),
          snoozedAt: NOW_ISO,
        }),
        chat("settled", "idle", { settledOverride: "settled" }),
        chat("archived", "working", { archivedAt: NOW_ISO }),
        chat("agent", "working", { lineage: { relationshipToParent: "subagent" } as never }),
      ],
      {},
      NOW_ISO,
    );
    expect(chats.map((each) => each.thread.id)).toEqual(["live", "snoozed", "settled"]);
    expect(lockCounts(chats)).toEqual({ all: 1, working: 1, done: 0 });
  });
});

describe("the sheet's words", () => {
  it("says what a full lock holds", () => {
    const chats = lockChats(
      [chat("a", "working"), chat("b", "working"), chat("c", "idle")],
      {},
      NOW_ISO,
    );
    expect(fullLockSummary(chats)).toBe("3 threads, 2 of them working. Their turns run on.");
    expect(fullLockSummary(lockChats([chat("a", "idle")], {}, NOW_ISO))).toBe(
      "1 thread, none of them working.",
    );
  });

  it("says what a group lock holds and what stays open", () => {
    const working = lockChats(
      [chat("a", "working"), chat("b", "working"), chat("c", "working")],
      {},
      NOW_ISO,
    );
    expect(groupLockSummary(working, ["THESIS", "ORBIT", "Loose"])).toBe(
      "3 threads, all working. THESIS, ORBIT and Loose stay open.",
    );
    expect(groupRowCount(working.slice(0, 1))).toBe("1 thread · 1 working");
    expect(groupRowCount(lockChats([chat("a", "idle")], {}, NOW_ISO))).toBe("1 thread");
  });

  it("ticks the groups with a working chat, less the open chat's", () => {
    const groups = [group("ctrl", "CONTROL"), group("orbit", "ORBIT"), group("thesis", "THESIS")];
    const chats = lockChats(
      [
        chat("a", "working", { groupId: "ctrl" as never }),
        chat("b", "working", { groupId: "orbit" as never }),
        chat("c", "idle", { groupId: "thesis" as never }),
      ],
      {},
      NOW_ISO,
    );
    expect(defaultTickedGroups(groups, chats, "env:orbit")).toEqual(["env:ctrl"]);
  });
});

describe("the lock's end", () => {
  it("reads a typed time as the next time the clock shows it", () => {
    expect(clockLabel(parseClock("18:00", NOW)!)).toBe("18:00");
    expect(parseClock("18:00", NOW)! - NOW).toBe(2 * HOUR);
    // Earlier than now: tomorrow.
    expect(parseClock("9:30", NOW)! - NOW).toBe(17.5 * HOUR);
    expect(parseClock("25:00", NOW)).toBeNull();
    expect(parseClock("soon", NOW)).toBeNull();
  });

  it("ends ahead, within 12 hours, and during a lock only later than it", () => {
    expect(canLockUntil(NOW + 2 * HOUR, NOW, null)).toBe(true);
    expect(canLockUntil(NOW - 1, NOW, null)).toBe(false);
    expect(canLockUntil(NOW + 13 * HOUR, NOW, null)).toBe(false);
    expect(canLockUntil(NOW + HOUR, NOW, NOW + 2 * HOUR)).toBe(false);
    expect(canLockUntil(NOW + 3 * HOUR, NOW, NOW + 2 * HOUR)).toBe(true);
  });
});
