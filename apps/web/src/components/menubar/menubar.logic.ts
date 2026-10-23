import type { DesktopMenubarIcon, DesktopMenubarIconState } from "@control/contracts";

import { type LockChat, lockCounts } from "../lock/lock.logic";

/** What the panel shows (§19.2, §19.3). */
export interface MenubarView {
  readonly needs: ReadonlyArray<LockChat>;
  readonly working: ReadonlyArray<LockChat>;
  /** Done, failed or limited since the chat was last opened. */
  readonly done: ReadonlyArray<LockChat>;
  /** During a full lock, what it holds back: `3 working and 1 done behind the lock.` */
  readonly behind: { readonly working: number; readonly done: number } | null;
}

const newestFirst = (chats: ReadonlyArray<LockChat>) =>
  [...chats].sort((a, b) => Date.parse(b.thread.updatedAt) - Date.parse(a.thread.updatedAt));

/** The live chats by section. A chat that needs you comes through any lock (§16.4). */
export function menubarView(input: {
  readonly chats: ReadonlyArray<LockChat>;
  readonly fullLock: boolean;
  /** `environmentId:groupId` of each group under a lock that is still running. */
  readonly lockedGroupKeys: ReadonlySet<string>;
}): MenubarView {
  const live = input.chats.filter((chat) => chat.live);
  const needs = newestFirst(live.filter((chat) => chat.needs));
  if (input.fullLock) {
    const { working, done } = lockCounts(input.chats);
    return { needs, working: [], done: [], behind: { working, done } };
  }
  const open = live.filter(
    (chat) => chat.groupKey === null || !input.lockedGroupKeys.has(chat.groupKey),
  );
  return {
    needs,
    working: newestFirst(open.filter((chat) => chat.working)),
    done: newestFirst(open.filter((chat) => chat.done || chat.failed)),
    behind: null,
  };
}

/** The first state that holds wins (§19.1); the icon counts what the panel shows. */
export function menubarIcon(input: {
  readonly serverUp: boolean;
  readonly fullLock: boolean;
  readonly update: boolean;
  readonly view: MenubarView;
}): DesktopMenubarIcon {
  const { view } = input;
  const failed = view.done.filter((chat) => chat.failed).length;
  const done = view.done.length - failed;
  const [state, count]: [DesktopMenubarIconState, number] = !input.serverUp
    ? ["off", 0]
    : view.needs.length > 0
      ? ["needs", view.needs.length]
      : input.fullLock
        ? ["lock", 0]
        : failed > 0
          ? ["failed", failed]
          : done > 0
            ? ["done", done]
            : view.working.length > 0
              ? ["working", view.working.length]
              : ["idle", 0];
  return {
    state,
    update: input.update && state !== "off",
    title: state === "off" ? "!" : count > 0 ? String(count) : "",
  };
}

const SETTLE_MS = 2000;

/**
 * The item's settle (§19.1): a state goes up only once it has held for 2 s, so a turn that ends
 * and the next that starts doesn't flicker it. `schedule` is the clock, so a test can drive it.
 */
export function settleIcon(
  show: (icon: DesktopMenubarIcon) => void,
  schedule: (run: () => void, ms: number) => () => void,
): (icon: DesktopMenubarIcon) => void {
  let shown: string | null = null;
  let wanted: string | null = null;
  let cancel = () => {};
  return (icon) => {
    const key = JSON.stringify(icon);
    if (key === wanted) return;
    cancel();
    wanted = key;
    cancel =
      key === shown
        ? () => {}
        : schedule(() => {
            shown = key;
            show(icon);
          }, SETTLE_MS);
  };
}
