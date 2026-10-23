// @vitest-environment jsdom

import type { DesktopBridge } from "@control/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const settings = vi.hoisted(() => ({ fontSizeTerminal: 12, patches: [] as Array<unknown> }));
vi.mock("../hooks/useSettings", () => ({
  getClientSettings: () => ({ fontSizeTerminal: settings.fontSizeTerminal }),
  persistClientSettingsPatch: (patch: { fontSizeTerminal: number }) => {
    settings.patches.push(patch);
    settings.fontSizeTerminal = patch.fontSizeTerminal;
    return Promise.resolve();
  },
}));

const { installBrowserTerminalZoom, installDesktopZoom } = await import("./terminalZoom");

function mountTerminal() {
  const viewport = document.createElement("div");
  viewport.setAttribute("data-terminal-viewport", "");
  const input = document.createElement("textarea");
  viewport.append(input);
  const composer = document.createElement("textarea");
  document.body.append(viewport, composer);
  return { input, composer };
}

function press(target: HTMLElement, init: KeyboardEventInit) {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  settings.fontSizeTerminal = 12;
  settings.patches = [];
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("terminal zoom in a browser", () => {
  it("grows, shrinks and resets the terminal font while a terminal has focus", () => {
    const uninstall = installBrowserTerminalZoom(window);
    const { input } = mountTerminal();
    input.focus();

    const grow = press(input, { key: "=", ctrlKey: true });
    expect(grow.defaultPrevented).toBe(true);
    expect(settings.fontSizeTerminal).toBe(13);
    press(input, { key: "-", ctrlKey: true });
    press(input, { key: "-", ctrlKey: true });
    expect(settings.fontSizeTerminal).toBe(11);
    press(input, { key: "0", ctrlKey: true });
    expect(settings.fontSizeTerminal).toBe(12);
    uninstall();
  });

  it("leaves the keys to the page outside a terminal", () => {
    const uninstall = installBrowserTerminalZoom(window);
    const { composer } = mountTerminal();
    composer.focus();

    const event = press(composer, { key: "=", ctrlKey: true });
    expect(event.defaultPrevented).toBe(false);
    expect(settings.patches).toEqual([]);
    uninstall();
  });
});

describe("terminal zoom from the desktop View menu", () => {
  function bridge() {
    let listener: (action: string) => void = () => {};
    const zoomWindow = vi.fn(() => Promise.resolve());
    const desktop: Pick<DesktopBridge, "onMenuAction" | "zoomWindow"> = {
      onMenuAction: (next) => {
        listener = next;
        return () => {};
      },
      zoomWindow,
    };
    return { desktop, zoomWindow, menu: (action: string) => listener(action) };
  }

  it("sends the zoom to a focused terminal", () => {
    const { desktop, zoomWindow, menu } = bridge();
    installDesktopZoom(desktop, document);
    mountTerminal().input.focus();

    menu("zoom-in");
    expect(settings.fontSizeTerminal).toBe(13);
    expect(zoomWindow).not.toHaveBeenCalled();
  });

  it("zooms the window when no terminal has focus", () => {
    const { desktop, zoomWindow, menu } = bridge();
    installDesktopZoom(desktop, document);
    mountTerminal().composer.focus();

    menu("zoom-out");
    expect(zoomWindow).toHaveBeenCalledWith("out");
    expect(settings.patches).toEqual([]);
  });
});
