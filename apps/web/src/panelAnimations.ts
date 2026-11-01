import {
  createContext,
  type RefObject,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { useMediaQuery } from "./hooks/useMediaQuery";
import { useClientSettings } from "./hooks/useSettings";

/** Bloom's --d-quick (tokens.css), for the timers that wait out a panel's transition. */
const PANEL_ANIMATION_DURATION_MS = 219;

const PanelAnimationSuppressionContext = createContext(false);
const SettingsPaneContext = createContext(false);

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

/** Settings > Reduce motion or the OS: what __root.tsx writes to html[data-motion]. */
export function useReducedMotion(): boolean {
  const reduceMotion = useClientSettings((settings) => settings.reduceMotion);
  const systemReducesMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  return reduceMotion || systemReducesMotion;
}

export function usePanelAnimationSettings(): { active: boolean; durationMs: number } {
  const reducedMotion = useReducedMotion();
  const suppressed = useContext(PanelAnimationSuppressionContext);
  return {
    active: !reducedMotion && !suppressed,
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

// Thread switches and Settings bring their new content in once it is on screen. Nothing is held or
// captured first, so a click shows on the next frame and input is never blocked.
const TAP_DURATION_MS = 109; // Bloom's --d-tap
const ENTER_EASING = "cubic-bezier(.61,1,.88,1)"; // Bloom's --e-out

function enter(element: Element | null, from: Keyframe, durationMs: number): void {
  if (!element || document.documentElement.dataset.motion !== "full") return;
  element.animate([from, { opacity: 1, translate: "0 0" }], {
    duration: durationMs,
    easing: ENTER_EASING,
  });
}

function sidebarThreadIndex(threadKey: string): number {
  return [...document.querySelectorAll("[data-app-sidebar] [data-thread-item]")].findIndex(
    (row) => row.getAttribute("data-thread-item") === threadKey,
  );
}

/** ChatView's timeline: a newly shown thread rises 8 px from where it sits in the list. */
export function useThreadEnter(ref: RefObject<HTMLElement | null>, threadKey: string): void {
  const shownKey = useRef(threadKey);
  useLayoutEffect(() => {
    const fromKey = shownKey.current;
    shownKey.current = threadKey;
    if (fromKey === threadKey) return;
    const fromIndex = sidebarThreadIndex(fromKey);
    const toIndex = sidebarThreadIndex(threadKey);
    const rise = fromIndex < 0 || toIndex < 0 ? 0 : toIndex > fromIndex ? 8 : -8;
    enter(ref.current, { opacity: 0, translate: `0 ${rise}px` }, TAP_DURATION_MS);
  }, [ref, threadKey]);
}

/** Whether the routes beside the sidebar are Settings' (AppSidebarLayout provides it). */
export const SettingsPaneProvider = SettingsPaneContext.Provider;
let shownPaneIsSettings: boolean | null = null;

/**
 * SidebarInset, as it mounts: a pane that opening Settings brings in slides in from the right, and
 * one that closing it brings back slides in from the left. The pane that leaves does not move.
 */
export function usePaneEnter(ref: RefObject<HTMLElement | null>): void {
  const mountedAsSettings = useRef(useContext(SettingsPaneContext)).current;
  useLayoutEffect(() => {
    const shownSettings = shownPaneIsSettings;
    shownPaneIsSettings = mountedAsSettings;
    if (shownSettings === null || shownSettings === mountedAsSettings) return;
    enter(
      ref.current,
      { opacity: 0, translate: mountedAsSettings ? "24px 0" : "-24px 0" },
      PANEL_ANIMATION_DURATION_MS,
    );
  }, [mountedAsSettings, ref]);
}
