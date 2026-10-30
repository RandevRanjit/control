import { scopedThreadKey } from "@control/client-runtime/environment";
import { createContext, useContext, useEffect, useRef, useState } from "react";

import { useMediaQuery } from "./hooks/useMediaQuery";
import { useClientSettings } from "./hooks/useSettings";
import type { AppRouter } from "./router";
import { resolveThreadRouteRef } from "./threadRoutes";

/** Bloom's --d-quick (tokens.css), for the timers that wait out a panel's transition. */
const PANEL_ANIMATION_DURATION_MS = 219;

const PanelAnimationSuppressionContext = createContext(false);

export const PanelAnimationSuppressionProvider = PanelAnimationSuppressionContext.Provider;

/**
 * Suppresses panel motion for the first painted frame of an initial route or navigation.
 * State restored by a route must be visible immediately; later user actions can animate.
 */
export function usePanelNavigationSuppression(navigationKey: string): boolean {
  const [paintedNavigationKey, setPaintedNavigationKey] = useState<string | null>(null);
  const suppressed = paintedNavigationKey !== navigationKey;

  useEffect(() => {
    if (!suppressed) return;
    let releaseFrame = 0;
    const paintFrame = window.requestAnimationFrame(() => {
      releaseFrame = window.requestAnimationFrame(() => setPaintedNavigationKey(navigationKey));
    });
    return () => {
      window.cancelAnimationFrame(paintFrame);
      window.cancelAnimationFrame(releaseFrame);
    };
  }, [navigationKey, suppressed]);

  return suppressed;
}

export function usePanelAnimationSettings(): { active: boolean; durationMs: number } {
  const reduceMotion = useClientSettings((settings) => settings.reduceMotion);
  const prefersReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const suppressed = useContext(PanelAnimationSuppressionContext);
  return {
    active: !reduceMotion && !prefersReducedMotion && !suppressed,
    durationMs: PANEL_ANIMATION_DURATION_MS,
  };
}

/** Keeps closing panel content mounted until its opt-in transition ends. */
export function usePanelPresence<T>(
  open: boolean,
  value: T | null,
  animated: boolean,
  scopeKey: string | null,
  durationMs: number,
): { present: boolean; value: T | null } {
  const [present, setPresent] = useState(open);
  const retainedRef = useRef<{ scopeKey: string | null; value: T | null } | null>(
    open ? { scopeKey, value } : null,
  );

  useEffect(() => {
    if (open) retainedRef.current = { scopeKey, value };
  }, [open, scopeKey, value]);

  useEffect(() => {
    if (open) {
      setPresent(true);
      return;
    }
    if (!animated) {
      setPresent(false);
      return;
    }

    const timeout = window.setTimeout(() => setPresent(false), durationMs);
    return () => window.clearTimeout(timeout);
  }, [animated, durationMs, open]);

  const retainedValue =
    retainedRef.current?.scopeKey === scopeKey ? retainedRef.current.value : null;
  const visible = open || (animated && present && retainedRef.current?.scopeKey === scopeKey);
  return { present: visible, value: open ? value : visible ? retainedValue : null };
}

// Thread switches and Settings move as view transitions (index.css, "Route transitions"). The
// history blocker has the old frame captured before the route changes, lets it change, then holds
// that frame until the new route has painted (or the cap passes), so a switch never shows half of
// each thread.
const ROUTE_PAINT_CAP_MS = 200;
const THREAD_ROUTE_ID = "/_chat/$environmentId/$threadId";
let threadPaint: { threadKey: string; resolve: () => void } | null = null;

/** ChatView calls this once it shows the route's own thread rather than one it holds. */
export function markThreadPainted(threadKey: string): void {
  if (threadPaint?.threadKey !== threadKey) return;
  threadPaint.resolve();
  threadPaint = null;
}

function sidebarThreadIndex(threadKey: string): number {
  return [...document.querySelectorAll("[data-app-sidebar] [data-thread-item]")].findIndex(
    (row) => row.getAttribute("data-thread-item") === threadKey,
  );
}

/** Called once at boot (main.tsx); returns the uninstaller. */
export function installRouteTransitions(router: AppRouter): () => void {
  let running = false;
  // Resolves once the running transition has captured its old frame and let its route through;
  // a navigation made meanwhile waits for it, so the two land in the order they were made.
  let captured = Promise.resolve();
  return router.history.block({
    enableBeforeUnload: false,
    blockerFn: ({ currentLocation, nextLocation }) => {
      const root = document.documentElement;
      if (running) return captured.then(() => false);
      if (root.dataset.motion !== "full" || !document.startViewTransition) return false;
      const from = router.getMatchedRoutes(currentLocation.pathname);
      const to = router.getMatchedRoutes(nextLocation.pathname);
      const fromThread =
        from.foundRoute?.id === THREAD_ROUTE_ID ? resolveThreadRouteRef(from.routeParams) : null;
      const toThread =
        to.foundRoute?.id === THREAD_ROUTE_ID ? resolveThreadRouteRef(to.routeParams) : null;
      const fromSettings = from.foundRoute?.id.startsWith("/settings") ?? false;
      const toSettings = to.foundRoute?.id.startsWith("/settings") ?? false;

      let kind: "down" | "up" | "fade" | "settings-in" | "settings-out";
      let painted: Promise<void>;
      if (fromThread && toThread && currentLocation.pathname !== nextLocation.pathname) {
        const toKey = scopedThreadKey(toThread);
        const fromIndex = sidebarThreadIndex(scopedThreadKey(fromThread));
        const toIndex = sidebarThreadIndex(toKey);
        // The new thread comes from where it sits in the list.
        kind = fromIndex < 0 || toIndex < 0 ? "fade" : toIndex > fromIndex ? "down" : "up";
        painted = new Promise((resolve) => (threadPaint = { threadKey: toKey, resolve }));
      } else if (fromSettings !== toSettings) {
        kind = toSettings ? "settings-in" : "settings-out";
        painted = new Promise((resolve) => {
          const unsubscribe = router.subscribe("onRendered", () => {
            unsubscribe();
            resolve();
          });
        });
      } else {
        return false;
      }

      running = true;
      root.dataset.routeTransition = kind;
      let release = () => {};
      captured = new Promise((resolve) => (release = resolve));
      return new Promise<boolean>((allow) => {
        const transition = document.startViewTransition(async () => {
          allow(false);
          release();
          await Promise.race([
            painted,
            new Promise((resolve) => window.setTimeout(resolve, ROUTE_PAINT_CAP_MS)),
          ]);
        });
        transition.ready.catch(() => undefined);
        void transition.finished
          .catch(() => undefined)
          .then(() => {
            running = false;
            threadPaint = null;
            delete root.dataset.routeTransition;
          });
      });
    },
  });
}
