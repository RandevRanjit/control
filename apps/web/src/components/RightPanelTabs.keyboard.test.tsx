// @vitest-environment jsdom

import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  compileResolvedKeybindingsConfig,
  DEFAULT_RESOLVED_KEYBINDINGS,
} from "@control/shared/keybindings";

import type { PanelTab } from "~/rightPanelStore";

import { RightPanelTabs } from "./RightPanelTabs";

vi.mock("~/hooks/useTheme", () => ({ useTheme: () => ({ resolvedTheme: "light" }) }));
vi.mock("~/browser/browserDefaults", () => ({ useBrowserDefaults: () => ({ profiles: [] }) }));

let root: Root;
let container: HTMLDivElement;
const addBrowser = vi.fn();
const addTerminal = vi.fn();
const noop = () => undefined;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  Object.defineProperty(Element.prototype, "getAnimations", {
    configurable: true,
    value: () => [],
  });
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: () => undefined,
  });
  vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
  addBrowser.mockClear();
  addTerminal.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const browserA = { id: "browser:a" as const, kind: "preview" as const, resourceId: "a" };
const browserB = { id: "browser:b" as const, kind: "preview" as const, resourceId: "b" };
const terminal = {
  id: "terminal:term-1" as const,
  kind: "terminal" as const,
  resourceId: "term-1",
  terminalIds: ["term-1"],
  activeTerminalId: "term-1",
};

async function renderPanel(
  overrides: Partial<ComponentProps<typeof RightPanelTabs>> = {},
  selected: PanelTab = "git",
) {
  await act(() =>
    root.render(
      <RightPanelTabs
        mode="inline"
        open
        keybindings={DEFAULT_RESOLVED_KEYBINDINGS}
        getShortcutContext={() => ({
          terminalFocus: false,
          terminalOpen: false,
          previewFocus: false,
          previewOpen: false,
          isWeb: true,
          isDesktop: false,
        })}
        surfaces={[]}
        environmentId={null}
        activeSurfaceId={null}
        pendingSurfaceIds={new Set()}
        previewSessions={{}}
        desktopByTabId={{}}
        terminalLabelsById={new Map()}
        onActivate={noop}
        onCloseSurface={noop}
        onCloseOtherSurfaces={noop}
        onCloseSurfacesToRight={noop}
        onCloseAllSurfaces={noop}
        onCopyFilePath={noop}
        onAddBrowser={addBrowser}
        onAddBrowserInProfile={noop}
        onAddTerminal={addTerminal}
        onAddPullRequest={noop}
        onAddPullRequests={noop}
        onAddDevice={noop}
        browserAvailable
        terminalAvailable
        pullRequestAvailable={false}
        pullRequestsAvailable={false}
        deviceAvailable={false}
        tabs={{ selected, unavailable: {}, onSelect: noop }}
        {...overrides}
      >
        content
      </RightPanelTabs>,
    ),
  );
  await act(() => vi.advanceTimersByTimeAsync(0));
  await act(() => vi.advanceTimersToNextFrame());
}

async function press(key: string, options: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options });
  await act(() => (document.activeElement ?? document.body).dispatchEvent(event));
  await act(() => vi.advanceTimersByTimeAsync(0));
  await act(() => vi.advanceTimersToNextFrame());
  return event;
}

const chipTitles = () =>
  [...container.querySelectorAll("[data-right-panel-subtabs] [role='tab']")].map(
    (chip) => chip.textContent,
  );

describe("right panel new-tab shortcut", () => {
  it.each(["MacIntel", "Win32", "Linux x86_64"])("opens a page on %s", async (platform) => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);
    await renderPanel();
    const event = await press("t", platform === "MacIntel" ? { metaKey: true } : { ctrlKey: true });
    expect(event.defaultPrevented).toBe(true);
    expect(addBrowser).toHaveBeenCalledOnce();
    await press("t", {
      metaKey: platform === "MacIntel",
      ctrlKey: platform !== "MacIntel",
      repeat: true,
    });
    expect(addBrowser).toHaveBeenCalledOnce();
  });

  it("opens a shell while Terminal is on show", async () => {
    await renderPanel({ surfaces: [terminal], activeSurfaceId: terminal.id }, "terminal");
    await press("t", { metaKey: true });
    expect(addTerminal).toHaveBeenCalledOnce();
    expect(addBrowser).not.toHaveBeenCalled();
  });

  it("leaves the shortcut alone while the mounted panel is closed", async () => {
    await renderPanel({ open: false });
    expect((await press("t", { metaKey: true })).defaultPrevented).toBe(false);
    expect(addBrowser).not.toHaveBeenCalled();
  });

  it.each(["Win32", "Linux x86_64"])(
    "leaves Ctrl+T for the focused terminal on %s",
    async (platform) => {
      vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);
      await renderPanel({
        getShortcutContext: () => ({
          terminalFocus: true,
          terminalOpen: true,
          previewFocus: false,
          previewOpen: false,
          isWeb: true,
          isDesktop: false,
        }),
      });
      const shell = document.createElement("textarea");
      const onKeyDown = vi.fn();
      shell.addEventListener("keydown", onKeyDown);
      container.append(shell);
      await act(() => shell.focus());
      const event = await press("t", { ctrlKey: true });
      expect(event.defaultPrevented).toBe(false);
      expect(onKeyDown).toHaveBeenCalledWith(event);
      expect(addBrowser).not.toHaveBeenCalled();
    },
  );

  it("follows a custom binding", async () => {
    await renderPanel({
      keybindings: compileResolvedKeybindingsConfig([{ key: "mod+y", command: "rightPanel.new" }]),
    });
    expect((await press("t", { metaKey: true })).defaultPrevented).toBe(false);
    await press("y", { metaKey: true });
    expect(addBrowser).toHaveBeenCalledOnce();
  });

  it("does not act over another popup or during text composition", async () => {
    await renderPanel();
    expect((await press("t", { metaKey: true, isComposing: true })).defaultPrevented).toBe(false);
    const dialog = document.createElement("div");
    dialog.dataset.slot = "dialog-popup";
    container.append(dialog);
    expect((await press("t", { metaKey: true })).defaultPrevented).toBe(false);
    expect(addBrowser).not.toHaveBeenCalled();
  });
});

describe("right panel tabs", () => {
  it("shows a tab's views as chips only once it holds more than one", async () => {
    await renderPanel({ surfaces: [terminal, browserA], activeSurfaceId: terminal.id }, "terminal");
    expect(container.querySelector("[data-right-panel-subtabs]")).toBeNull();
    await renderPanel(
      {
        surfaces: [terminal, browserA, browserB],
        activeSurfaceId: browserA.id,
        deviceAvailable: false,
        browserAvailable: false,
      },
      "browser",
    );
    expect(chipTitles()).toEqual(["Browser", "Browser"]);
  });

  it("offers a new page from the Browser tab's chips", async () => {
    await renderPanel({ surfaces: [browserA], activeSurfaceId: browserA.id }, "browser");
    expect(container.querySelector('[aria-label="Add to Browser"]')).not.toBeNull();
  });
});
