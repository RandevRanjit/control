import type { DesktopBridge } from "@control/contracts";
import {
  DEFAULT_CLIENT_SETTINGS,
  MAX_TERMINAL_FONT_SIZE,
  MIN_TERMINAL_FONT_SIZE,
} from "@control/contracts/settings";

import { getClientSettings, persistClientSettingsPatch } from "../hooks/useSettings";
import { isMacPlatform } from "./utils";

type ZoomDirection = "in" | "out" | "reset";

const ZOOM_ACTIONS: Readonly<Record<string, ZoomDirection>> = {
  "zoom-in": "in",
  "zoom-out": "out",
  "zoom-reset": "reset",
};

/** Whether the focus is in a terminal (TerminalViewport), in this window. */
function terminalHasFocus(document: Document): boolean {
  return document.hasFocus() && document.activeElement?.closest("[data-terminal-viewport]") != null;
}

/** ⌘+ / ⌘− / ⌘0 in a terminal: its font size, a point at a time, for every terminal. */
function zoomTerminal(direction: ZoomDirection): void {
  const current = getClientSettings().fontSizeTerminal;
  const next =
    direction === "reset"
      ? DEFAULT_CLIENT_SETTINGS.fontSizeTerminal
      : Math.min(
          MAX_TERMINAL_FONT_SIZE,
          Math.max(MIN_TERMINAL_FONT_SIZE, current + (direction === "in" ? 1 : -1)),
        );
  if (next !== current) void persistClientSettingsPatch({ fontSizeTerminal: next });
}

/**
 * The desktop's View menu owns ⌘+ / ⌘− / ⌘0 and sends them here: a focused terminal takes
 * them, as in Ghostty, and anything else zooms the window.
 */
export function installDesktopZoom(
  bridge: Pick<DesktopBridge, "onMenuAction" | "zoomWindow"> | undefined,
  document: Document,
): (() => void) | undefined {
  return bridge?.onMenuAction((action) => {
    const direction = ZOOM_ACTIONS[action];
    if (direction === undefined) return;
    if (terminalHasFocus(document)) zoomTerminal(direction);
    else void bridge.zoomWindow?.(direction);
  });
}

/** In a browser there is no menu: the keys come to the page, and a focused terminal keeps them. */
export function installBrowserTerminalZoom(window: Window): () => void {
  const mac = isMacPlatform(window.navigator.platform);
  const onKeyDown = (event: KeyboardEvent) => {
    // The platform's own modifier only: on a Mac, Ctrl+− belongs to the shell.
    if (!(mac ? event.metaKey : event.ctrlKey) || event.altKey) return;
    const direction =
      event.key === "=" || event.key === "+"
        ? "in"
        : event.key === "-"
          ? "out"
          : event.key === "0"
            ? "reset"
            : null;
    if (direction === null || !terminalHasFocus(window.document)) return;
    event.preventDefault();
    zoomTerminal(direction);
  };
  window.addEventListener("keydown", onKeyDown, true);
  return () => window.removeEventListener("keydown", onKeyDown, true);
}
