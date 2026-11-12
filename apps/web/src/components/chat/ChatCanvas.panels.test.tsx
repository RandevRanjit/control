// @vitest-environment jsdom

import { act, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { Sidebar, SidebarInset, SidebarProvider, SidebarTrigger } from "../ui/sidebar";
import { ChatCanvas, ChatColumnGlide } from "./ChatCanvas";

let root: Root | undefined;
let finishGlides: (() => void)[] = [];
const animate = vi.fn(() => ({
  cancel: vi.fn(),
  finished: new Promise<void>((resolve) => finishGlides.push(resolve)),
}));
const finishGapWidth = vi.fn();

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("cookieStore", { set: vi.fn() });
  Element.prototype.animate = animate as unknown as Element["animate"];
  // The gap's width transition, as the browser starts it when the sidebar opens or closes.
  Element.prototype.getAnimations = function (this: Element) {
    return this.getAttribute("data-slot") === "sidebar-gap"
      ? [{ finish: finishGapWidth } as unknown as Animation]
      : [];
  };
  // jsdom lays nothing out: the chat sits 128 px right while the sidebar is open and 100 px left
  // while the right panel is.
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const sidebarOpen =
      this.closest("[data-slot='sidebar-wrapper']")?.getAttribute("data-sidebar-state") ===
      "expanded";
    const panelOpen = this.closest("[data-panel-open]") !== null;
    return DOMRect.fromRect({
      x: 300 + (sidebarOpen ? 128 : 0) - (panelOpen ? 100 : 0),
      width: 600,
      height: 20,
    });
  });
});

afterEach(async () => {
  await act(() => root?.unmount());
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  animate.mockClear();
  finishGapWidth.mockClear();
  finishGlides = [];
});

function Thread({ animations }: { animations: boolean }) {
  const column = useRef<HTMLDivElement>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  return (
    <SidebarProvider data-panel-animations={animations ? "true" : "false"}>
      <Sidebar>
        <SidebarTrigger />
      </Sidebar>
      <SidebarInset>
        <div data-row>
          <div ref={column} data-panel-open={panelOpen || undefined}>
            <header data-chat-header>
              <div>loads</div>
              <button
                type="button"
                aria-label="Toggle right panel"
                onClick={() => setPanelOpen((open) => !open)}
              />
            </header>
            <ChatCanvas composerOverlayElement={null}>
              <div className="messages-timeline-scroll">
                <div>
                  <div className="chat-content-lane">reply</div>
                </div>
              </div>
            </ChatCanvas>
            <ChatColumnGlide column={column} rightPanelOpen={panelOpen} />
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

async function renderThread(animations = true) {
  const container = document.body.appendChild(document.createElement("div"));
  await act(() => {
    root = createRoot(container);
    root.render(<Thread animations={animations} />);
  });
}

const click = (selector: string) =>
  act(() => document.querySelector<HTMLElement>(selector)!.click());
const glide = (offset: number) => [
  [{ translate: `${offset}px 0` }, { translate: "0 0" }],
  { duration: 218.75, easing: "cubic-bezier(.61,1,.88,1)" },
];

describe("chat beside the pinned sidebar and the right panel", () => {
  it("takes its new place at once and glides there with the sidebar", async () => {
    await renderThread();

    await click("[data-slot='sidebar-trigger']");
    // The width lands in one layout; the head's controls and the thread glide from where they were.
    expect(finishGapWidth).toHaveBeenCalledTimes(1);
    expect(animate).toHaveBeenCalledTimes(3);
    expect(animate).toHaveBeenCalledWith(...glide(128));

    animate.mockClear();
    await click("[data-slot='sidebar-trigger']");
    expect(animate).toHaveBeenCalledTimes(3);
    expect(animate).toHaveBeenCalledWith(...glide(-128));
  });

  it("glides with the right panel as it opens and closes", async () => {
    await renderThread();

    await click("[aria-label='Toggle right panel']");
    expect(animate).toHaveBeenCalledTimes(3);
    expect(animate).toHaveBeenCalledWith(...glide(100));
    expect(finishGapWidth).not.toHaveBeenCalled();

    animate.mockClear();
    await click("[aria-label='Toggle right panel']");
    expect(animate).toHaveBeenCalledWith(...glide(-100));
  });

  it("shows the chat past the column's new edge until it lands", async () => {
    await renderThread();
    const row = document.querySelector<HTMLElement>("[data-row]")!;
    const column = row.firstElementChild as HTMLElement;
    const inset = row.parentElement!;

    await click("[data-slot='sidebar-trigger']");
    // The timeline's scroller glides whole, so its own clip moves with the thread.
    expect(animate.mock.contexts).toContain(document.querySelector(".messages-timeline-scroll"));
    expect(column.style.overflow).toBe("visible");
    expect(row.style.overflow).toBe("visible");
    expect(inset.style.overflow).toBe("visible");
    // Only the sidebar's edge opens; the panel's side still clips.
    expect(column.style.clipPath).toBe("inset(0 0 0 -100vw)");
    expect(inset.parentElement!.style.overflow).toBe("");

    await act(async () => finishGlides.forEach((finish) => finish()));
    expect(column.style.overflow).toBe("");
    expect(row.style.overflow).toBe("");
    expect(inset.style.overflow).toBe("");
    expect(column.style.clipPath).toBe("");
  });

  it("moves at once without panel animations (Reduce motion)", async () => {
    await renderThread(false);
    await click("[data-slot='sidebar-trigger']");
    await click("[aria-label='Toggle right panel']");
    expect(animate).not.toHaveBeenCalled();
  });
});
