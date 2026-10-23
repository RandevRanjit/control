import { scopeThreadRef } from "@control/client-runtime/environment";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";

import { useThreadShells } from "../../state/entities";
import { buildThreadRouteParams, resolveThreadRouteRef } from "../../threadRoutes";
import { useUiStateStore } from "../../uiStateStore";
import { type LockChat, lockChats } from "./lock.logic";

/** The sidebar's chats with what the lock counts on each. */
export function useLockChats(): ReadonlyArray<LockChat> {
  const threads = useThreadShells();
  const localVisits = useUiStateStore((state) => state.threadLastVisitedAtById);
  return useMemo(
    () => lockChats(threads, localVisits, new Date().toISOString()),
    [threads, localVisits],
  );
}

/** Puts the desktop window in front without focus; a browser has no window to raise. */
const raiseWindow = () => void window.desktopBridge?.showInactive?.();

/**
 * A break-through (HANDOFF §16.4): while a full lock runs and a chat needs you, the window comes
 * forward without taking focus each time another chat starts needing you, and a needing chat is
 * open.
 */
export function useLockBreakThrough(through: boolean, chats: ReadonlyArray<LockChat>): void {
  const navigate = useNavigate();
  const routeThread = useParams({
    strict: false,
    select: (params) => resolveThreadRouteRef(params),
  });
  const needing = through ? chats.filter((chat) => chat.needs).map((chat) => chat.thread) : [];
  const needingKeys = needing.map((thread) => `${thread.environmentId}:${thread.id}`).join(" ");
  const raisedFor = useRef(new Set<string>());
  useEffect(() => {
    const keys = needingKeys === "" ? [] : needingKeys.split(" ");
    if (keys.some((key) => !raisedFor.current.has(key))) raiseWindow();
    raisedFor.current = new Set(keys);
  }, [needingKeys, raisedFor]);

  const first = needing[0];
  const openNeeds = needing.some(
    (thread) =>
      thread.id === routeThread?.threadId && thread.environmentId === routeThread.environmentId,
  );
  useEffect(() => {
    if (first === undefined || openNeeds) return;
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(scopeThreadRef(first.environmentId, first.id)),
    });
  }, [first, navigate, openNeeds]);
}

/** The offer shows once nothing has needed you for this long (HANDOFF §16.1). */
const OFFER_AFTER_MS = 10 * 60 * 1000;

const useOfferStore = create<{ quietSinceMs: number; later: boolean }>(() => ({
  quietSinceMs: Date.now(),
  later: false,
}));

// The window and the menu-bar panel show one offer (HANDOFF §19.2): Later in either hides it in both.
const OFFER_CHANNEL = "control-lock-offer";

/**
 * Keeps the offer's clock: quiet starts when the last chat stops needing you, and Later holds
 * until something next does. Mounted with the window, so leaving for Settings keeps the clock,
 * and with the menu-bar panel.
 */
export function useTrackLockOffer(needs: boolean): void {
  useEffect(() => {
    useOfferStore.setState(needs ? { later: false } : { quietSinceMs: Date.now() });
  }, [needs]);
  useEffect(() => {
    const channel = new BroadcastChannel(OFFER_CHANNEL);
    channel.addEventListener("message", () => useOfferStore.setState({ later: true }));
    return () => channel.close();
  }, []);
}

/** Hides the offer until a chat next needs you, here and in the other window. */
export const offerLater = () => {
  useOfferStore.setState({ later: true });
  const channel = new BroadcastChannel(OFFER_CHANNEL);
  channel.postMessage("later");
  channel.close();
};

/** Whether to offer a lock now; re-renders when the 10 minutes run out. */
export function useLockOffer(needs: boolean, locked: boolean): boolean {
  const { quietSinceMs, later } = useOfferStore();
  // The quiet stretch whose 10 minutes have run out.
  const [dueFor, setDueFor] = useState<number | null>(null);
  const waiting = !needs && !locked && !later;
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(
      () => setDueFor(quietSinceMs),
      Math.max(0, quietSinceMs + OFFER_AFTER_MS - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [waiting, quietSinceMs]);
  return waiting && dueFor === quietSinceMs;
}
