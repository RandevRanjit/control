import { scopeThreadRef, scopedThreadKey } from "@control/client-runtime/environment";
import { effectiveSnoozed } from "@control/client-runtime/state/thread-settled";
import type {
  EnvironmentGroup,
  EnvironmentThreadShell,
} from "@control/client-runtime/state/models";
import { MAX_LOCK_MS } from "@control/contracts";

import { resolveCardState } from "../control/cardState";
import {
  filterSidebarV2VisibleThreads,
  hasUnseenCompletion,
  resolveSidebarThreadStatus,
  resolveThreadLastVisitedAt,
} from "../Sidebar.logic";

/** A chat as the lock sees it (design/hybrid/HANDOFF.md §16). */
export interface LockChat {
  readonly thread: EnvironmentThreadShell;
  /** `environmentId:groupId`, or null for a loose chat. */
  readonly groupKey: string | null;
  /** A question or an approval is waiting; a failure is not. */
  readonly needs: boolean;
  /** A running turn or background work. */
  readonly working: boolean;
  /** Finished and not yet opened. */
  readonly done: boolean;
  /** Failed or hit a limit, and not yet opened. */
  readonly failed: boolean;
  /** In the sidebar's live list: neither snoozed nor settled. */
  readonly live: boolean;
}

/** The sidebar's chats, less archived ones and subagents, with what the lock counts on each. */
export function lockChats(
  threads: ReadonlyArray<EnvironmentThreadShell>,
  localVisits: Readonly<Record<string, string>>,
  nowIso: string,
): ReadonlyArray<LockChat> {
  return filterSidebarV2VisibleThreads(threads).map((thread) => {
    const status = resolveSidebarThreadStatus(thread);
    const lastVisitedAt = resolveThreadLastVisitedAt(
      thread.lastVisitedAt,
      localVisits[scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id))],
    );
    const unseen = hasUnseenCompletion({ ...thread, lastVisitedAt });
    const card = resolveCardState({
      status,
      isUnread: unseen,
      hasBackgroundWork: thread.pendingBackgroundTasks.length > 0,
      latestRunStatus: thread.latestRun?.status ?? null,
    });
    return {
      thread,
      groupKey: thread.groupId === null ? null : `${thread.environmentId}:${thread.groupId}`,
      needs: card.st === "needs",
      working: card.st === "working" || card.st === "bg",
      done: card.st === "done",
      failed: card.st === "failed" && unseen,
      live: !effectiveSnoozed(thread, { now: nowIso }) && thread.settledOverride !== "settled",
    };
  });
}

export const groupKeyOf = (group: Pick<EnvironmentGroup, "environmentId" | "id">) =>
  `${group.environmentId}:${group.id}`;

/** What the sheet and the plate count: the live chats, the working ones and the finished unread ones. */
export function lockCounts(chats: ReadonlyArray<LockChat>) {
  const live = chats.filter((chat) => chat.live);
  return {
    all: live.length,
    working: live.filter((chat) => chat.working).length,
    done: live.filter((chat) => chat.done).length,
  };
}

const chatsWord = (count: number) => (count === 1 ? "1 chat" : `${count} chats`);

/** The sheet's line under the question in Full mode. */
export function fullLockSummary(chats: ReadonlyArray<LockChat>): string {
  const { all, working } = lockCounts(chats);
  if (working === 0) return `${chatsWord(all)}, none of them working.`;
  return `${chatsWord(all)}, ${working} of them working. Their turns run on.`;
}

/** A group row's count, `3 chats · 1 working`. */
export function groupRowCount(chats: ReadonlyArray<LockChat>): string {
  const live = chats.filter((chat) => chat.live);
  const working = live.filter((chat) => chat.working).length;
  return `${chatsWord(live.length)}${working > 0 ? ` · ${working} working` : ""}`;
}

/** `A`, `A and B`, `A, B and C`. */
export function joinNames(names: ReadonlyArray<string>): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** The sheet's line under the question in Group mode: what it holds, and what stays open. */
export function groupLockSummary(
  ticked: ReadonlyArray<LockChat>,
  openNames: ReadonlyArray<string>,
): string {
  const live = ticked.filter((chat) => chat.live);
  const working = live.filter((chat) => chat.working).length;
  const runs =
    working === 0 ? "none" : working === live.length && working > 1 ? "all" : `${working}`;
  const held = `${chatsWord(live.length)}, ${runs} working.`;
  return openNames.length === 0 ? held : `${held} ${joinNames(openNames)} stay open.`;
}

/** Group mode starts with the groups that have a working chat, less the open chat's group. */
export function defaultTickedGroups(
  groups: ReadonlyArray<EnvironmentGroup>,
  chats: ReadonlyArray<LockChat>,
  openGroupKey: string | null,
): ReadonlyArray<string> {
  return groups
    .map(groupKeyOf)
    .filter(
      (key) => key !== openGroupKey && chats.some((chat) => chat.groupKey === key && chat.working),
    );
}

export const LOCK_PRESETS = [
  { label: "30 min", minutes: 30 },
  { label: "1 h", minutes: 60 },
  { label: "2 h", minutes: 120 },
] as const;
export type LockPreset = (typeof LOCK_PRESETS)[number]["label"];

/** `18:00` in local time. */
export function clockLabel(ms: number): string {
  const at = new Date(ms);
  return [at.getHours(), at.getMinutes()].map((n) => String(n).padStart(2, "0")).join(":");
}

/** A typed `18:00` as the next time the clock shows it; null when it isn't a time. */
export function parseClock(text: string, nowMs: number): number | null {
  const match = /^(\d{1,2})[:.](\d{2})$/.exec(text.trim());
  if (match === null) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  const at = new Date(nowMs);
  at.setHours(hours, minutes, 0, 0);
  if (at.getTime() <= nowMs) at.setDate(at.getDate() + 1);
  return at.getTime();
}

/**
 * Whether a lock may end at `endMs`: ahead of now, at most 12 h ahead, and never before the
 * running lock it would replace. The server holds the same rules.
 */
export function canLockUntil(endMs: number, nowMs: number, runningUntilMs: number | null): boolean {
  return (
    endMs > nowMs &&
    endMs - nowMs <= MAX_LOCK_MS &&
    (runningUntilMs === null || endMs > runningUntilMs)
  );
}
