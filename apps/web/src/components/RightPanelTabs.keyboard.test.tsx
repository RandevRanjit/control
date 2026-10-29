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
        onAddDiff={noop}
        onAddGraph={noop}
        onAddPullRequests={noop}
        onAddDevice={noop}
        browserAvailable
        terminalAvailable
        pullRequestsAvailable={false}
        deviceAvailable={false}
        tabs={{
          selected,
          shownKind:
            overrides.surfaces?.find((surface) => surface.id === overrides.activeSurfaceId)?.kind ??
            "diff",
          unavailable: {},
          onSelect: noop,
        }}
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
    await renderPanel(
      {
        surfaces: [terminal, browserA],
        activeSurfaceId: browserA.id,
        deviceAvailable: false,
        browserAvailable: false,
      },
      "browser",
    );
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

  it("switches Git between Diff and PR, and shows the pull request already open", async () => {
    const diff = { id: "diff" as const, kind: "diff" as const };
    const pullRequest = {
      id: "pull-request:project-a:acme%2Fapi:7" as const,
      kind: "pull-request" as const,
      projectId: "project-a",
      repository: "acme/api",
      number: 7,
    };
    const onActivate = vi.fn();
    const onAddPullRequests = vi.fn();
    const onAddDiff = vi.fn();
    const seg = (label: string) =>
      [...container.querySelectorAll<HTMLButtonElement>('[aria-label="Git view"] button')].find(
        (button) => button.textContent === label,
      )!;

    await renderPanel({
      surfaces: [diff],
      activeSurfaceId: diff.id,
      pullRequestsAvailable: true,
      onActivate,
      onAddPullRequests,
      onAddDiff,
    });
    expect(chipTitles()).toEqual([]);
    expect(seg("Diff").getAttribute("aria-pressed")).toBe("true");
    await act(() => seg("PR").click());
    expect(onAddPullRequests).toHaveBeenCalledOnce();

    await renderPanel({
      surfaces: [diff, pullRequest],
      activeSurfaceId: diff.id,
      pullRequestsAvailable: true,
      onActivate,
      onAddPullRequests,
      onAddDiff,
    });
    await act(() => seg("PR").click());
    expect(onActivate).toHaveBeenCalledWith(pullRequest);
    expect(onAddPullRequests).toHaveBeenCalledOnce();

    await renderPanel({
      surfaces: [pullRequest],
      activeSurfaceId: pullRequest.id,
      pullRequestsAvailable: true,
      onActivate,
      onAddPullRequests,
      onAddDiff,
    });
    expect(seg("PR").getAttribute("aria-pressed")).toBe("true");
    await act(() => seg("Diff").click());
    expect(onAddDiff).toHaveBeenCalledOnce();
  });

  it("marks Diff while Git shows its default view with nothing open, even where PR is offered", async () => {
    await renderPanel({ surfaces: [], activeSurfaceId: null, pullRequestsAvailable: true });
    const pressed = [
      ...container.querySelectorAll<HTMLButtonElement>('[aria-label="Git view"] button'),
    ].find((button) => button.getAttribute("aria-pressed") === "true");
    expect(pressed?.textContent).toBe("Diff");
  });

  it("opens Git's Graph from the switch, and offers Graph and Diff where pull requests cannot be read", async () => {
    const onAddGraph = vi.fn();
    const onActivate = vi.fn();
    const views = () =>
      [...container.querySelectorAll<HTMLButtonElement>('[aria-label="Git view"] button')].map(
        (button) => button.textContent,
      );
    await renderPanel({
      surfaces: [{ id: "diff", kind: "diff" }],
      activeSurfaceId: "diff",
      onAddGraph,
    });
    expect(views()).toEqual(["Graph", "Diff"]);
    await act(() =>
      container.querySelector<HTMLButtonElement>('[aria-label="Git view"] button')!.click(),
    );
    expect(onAddGraph).toHaveBeenCalledOnce();

    const graph = { id: "graph" as const, kind: "graph" as const };
    await renderPanel({
      surfaces: [{ id: "diff", kind: "diff" }, graph],
      activeSurfaceId: "graph",
      pullRequestsAvailable: true,
      onAddGraph,
      onActivate,
    });
    expect(views()).toEqual(["Graph", "Diff", "PR"]);
    expect(
      container
        .querySelector<HTMLButtonElement>('[aria-label="Git view"] button')!
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });
});

describe("Folder's tabs", () => {
  const tree = { id: "files" as const, kind: "files" as const };
  const file = {
    id: "file:src/app.ts" as const,
    kind: "file" as const,
    relativePath: "src/app.ts",
    revealLine: null,
    revealRequestId: 1,
  };

  it("keep the tree as a first tab without a close, and go back to it on a click", async () => {
    const onActivate = vi.fn();
    const onCloseSurface = vi.fn();
    await renderPanel(
      { surfaces: [tree, file], activeSurfaceId: file.id, onActivate, onCloseSurface },
      "folder",
    );
    expect(chipTitles()).toEqual(["Files", "app.ts"]);
    expect(container.querySelector('[aria-label="Close Files"]')).toBeNull();
    expect(container.querySelector('[aria-label="Close app.ts"]')).not.toBeNull();

    const treeChip = [
      ...container.querySelectorAll<HTMLElement>("[data-right-panel-subtabs] button"),
    ].find((button) => button.textContent === "Files")!;
    await act(() => treeChip.click());
    expect(onActivate).toHaveBeenCalledWith(tree);
  });

  it("show the row with the tree alone, so the first file doesn't move it", async () => {
    await renderPanel({ surfaces: [tree], activeSurfaceId: tree.id }, "folder");
    expect(chipTitles()).toEqual(["Files"]);
  });
});

describe("Terminal's tabs", () => {
  it("show the one shell as a tab, so the row says which shell is on show", async () => {
    await renderPanel({ surfaces: [terminal], activeSurfaceId: terminal.id }, "terminal");
    expect(chipTitles()).toHaveLength(1);
  });
});
