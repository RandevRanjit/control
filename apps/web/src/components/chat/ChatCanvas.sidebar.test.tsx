// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { Sidebar, SidebarProvider, SidebarTrigger } from "../ui/sidebar";
import { ChatCanvas } from "./ChatCanvas";

let root: Root | undefined;
const animate = vi.fn(
  (_keyframes: Keyframe[], _options: KeyframeAnimationOptions): Partial<Animation> => ({
    cancel: vi.fn(),
  }),
);

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
  Element.prototype.animate = animate as unknown as Element["animate"];
  // jsdom lays nothing out: a lane sits 128 px further right while the chat makes room.
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const canvas = this.closest<HTMLElement>("[data-chat-canvas]");
    const pushed = canvas?.style.getPropertyValue("--chat-lane-push") === "var(--sidebar-width)";
    return DOMRect.fromRect({ x: pushed ? 428 : 300, width: 600, height: 20 });
  });
  document.documentElement.dataset.motion = "full";
});

afterEach(async () => {
  await act(() => root?.unmount());
  document.body.innerHTML = "";
  delete document.documentElement.dataset.motion;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  animate.mockClear();
});

async function renderThread(makesRoom: boolean) {
  const container = document.body.appendChild(document.createElement("div"));
  await act(() => {
    root = createRoot(container);
    root.render(
      <SidebarProvider autoHide autoHideMakesRoom={makesRoom}>
        <Sidebar>
          <SidebarTrigger />
        </Sidebar>
        <ChatCanvas composerOverlayElement={null}>
          <div className="messages-timeline-scroll">
            <div>
              <div className="chat-content-lane">reply</div>
            </div>
          </div>
          <div className="chat-composer-lane">
            <form>composer</form>
          </div>
        </ChatCanvas>
      </SidebarProvider>,
    );
  });
  return document.querySelector<HTMLElement>("[data-chat-canvas]")!;
}

const trigger = () => document.querySelector<HTMLElement>("[data-slot='sidebar-trigger']")!;

describe("chat beside an auto-hidden sidebar", () => {
  it("makes room as the sidebar comes out, gliding from where it was", async () => {
    const canvas = await renderThread(true);
    expect(canvas.style.getPropertyValue("--chat-lane-push")).toBe("0px");

    await act(() => trigger().click());
    expect(canvas.style.getPropertyValue("--chat-lane-push")).toBe("var(--sidebar-width)");
    expect(animate).toHaveBeenCalledTimes(2);
    expect(animate).toHaveBeenCalledWith([{ translate: "-128px 0" }, { translate: "0 0" }], {
      duration: 218.75,
      easing: "cubic-bezier(.61,1,.88,1)",
    });

    animate.mockClear();
    await act(() => trigger().click());
    expect(canvas.style.getPropertyValue("--chat-lane-push")).toBe("0px");
    expect(animate).toHaveBeenCalledWith([{ translate: "128px 0" }, { translate: "0 0" }], {
      duration: 218.75,
      easing: "cubic-bezier(.12,0,.39,0)",
    });
  });

  it("moves at once when motion is reduced", async () => {
    document.documentElement.dataset.motion = "reduce";
    const canvas = await renderThread(true);
    await act(() => trigger().click());
    expect(canvas.style.getPropertyValue("--chat-lane-push")).toBe("var(--sidebar-width)");
    expect(animate).not.toHaveBeenCalled();
  });

  it("stays put under the sidebar unless it makes room", async () => {
    const canvas = await renderThread(false);
    await act(() => trigger().click());
    expect(canvas.style.getPropertyValue("--chat-lane-push")).toBe("0px");
    expect(animate).not.toHaveBeenCalled();
  });
});

describe("a Wide or Full thread re-wrapping as the sidebar makes room", () => {
  // jsdom lays nothing out. While the chat makes room its lane is 128 px narrower, so the reply
  // re-wraps and the line being read sits 66 px lower, less however far the thread is scrolled.
  // The thread follows its own inset where something set one, else the canvas's push.
  function layOut(scroller: HTMLElement) {
    let scrollTop = 1000;
    Object.defineProperties(scroller, {
      scrollTop: { get: () => scrollTop, set: (value: number) => void (scrollTop = value) },
      scrollHeight: { value: 5000 },
      clientHeight: { value: 700 },
    });
    const pushed = (element: Element) => {
      const thread = element.closest<HTMLElement>(".messages-timeline-scroll");
      const inset = thread?.style.getPropertyValue("--chat-lane-inset-start");
      if (thread && inset) return inset.includes("sidebar-width");
      const canvas = element.closest<HTMLElement>("[data-chat-canvas]");
      return canvas?.style.getPropertyValue("--chat-lane-push") === "var(--sidebar-width)";
    };
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
      this: Element,
    ) {
      const push = pushed(this);
      if (this.tagName === "P") {
        return DOMRect.fromRect({
          x: 300,
          y: 400 + (push ? 66 : 0) - (scrollTop - 1000),
          width: 1,
        });
      }
      return DOMRect.fromRect({ x: push ? 428 : 300, width: push ? 472 : 600, height: 700 });
    });
    const computed = window.getComputedStyle;
    vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) =>
      element === scroller
        ? ({
            getPropertyValue: () =>
              pushed(scroller) ? "calc(20px + var(--sidebar-width))" : "calc(20px + 0px)",
          } as unknown as CSSStyleDeclaration)
        : computed(element, pseudo),
    );
    const text = scroller.querySelector("p")!.firstChild!;
    Object.assign(document, { caretPositionFromPoint: () => ({ offsetNode: text, offset: 3 }) });
    Range.prototype.getBoundingClientRect = function (this: Range) {
      return this.startContainer.parentElement!.getBoundingClientRect();
    };
    return {
      readingLineTop: () => scroller.querySelector("p")!.getBoundingClientRect().top,
      setScrollTop: (value: number) => void (scrollTop = value),
    };
  }

  async function renderWideThread(chatWidth: "comfortable" | "wide" | "full") {
    document.documentElement.dataset.chatWidth = chatWidth;
    animate.mockImplementation(function (this: Animation) {
      return { cancel: vi.fn(), finished: Promise.resolve(this) };
    });
    frames.length = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      frames.push(callback),
    );
    const container = document.body.appendChild(document.createElement("div"));
    await act(() => {
      root = createRoot(container);
      root.render(
        <SidebarProvider autoHide autoHideMakesRoom>
          <Sidebar>
            <SidebarTrigger />
          </Sidebar>
          <ChatCanvas composerOverlayElement={null}>
            <div className="messages-timeline-scroll">
              <div>
                <div className="chat-content-lane">
                  <p>The line being read, long enough to re-wrap.</p>
                </div>
              </div>
            </div>
            <div className="chat-composer-lane">
              <form>composer</form>
            </div>
          </ChatCanvas>
        </SidebarProvider>,
      );
    });
    const scroller = document.querySelector<HTMLElement>(".messages-timeline-scroll")!;
    return { scroller, ...layOut(scroller) };
  }

  // Animation frames run when a test says the browser drew them.
  const frames: FrameRequestCallback[] = [];
  const drawFrames = (count: number) =>
    act(() => {
      for (let frame = 0; frame < count; frame++) {
        for (const callback of frames.splice(0)) callback(frame * 16);
      }
    });
  const toggleSidebar = async () => {
    await act(() => trigger().click());
    await drawFrames(10);
  };

  const glides = () =>
    animate.mock.calls.filter(([keyframes]) =>
      keyframes.some((keyframe) => "translate" in keyframe),
    );
  const fadedElements = () =>
    animate.mock.contexts.filter((_, index) =>
      animate.mock.calls[index]?.[0].some((keyframe) => "opacity" in keyframe),
    );

  afterEach(() => {
    delete document.documentElement.dataset.chatWidth;
    delete (document as { caretPositionFromPoint?: unknown }).caretPositionFromPoint;
  });

  it.each(["wide", "full"] as const)(
    "keeps the line being read where it was at %s, and fades the thread instead of sliding it",
    async (chatWidth) => {
      const { scroller, readingLineTop } = await renderWideThread(chatWidth);
      expect(readingLineTop()).toBe(400);

      await toggleSidebar();
      expect(readingLineTop()).toBe(400);
      expect(scroller.scrollTop).toBe(1066);
      expect(fadedElements()).toEqual([scroller, scroller]);
      // The composer still glides beside the sidebar; the re-wrapped thread does not slide.
      expect(glides()).toHaveLength(1);
      expect(scroller.style.getPropertyValue("--chat-lane-inset-start")).toBe("");

      animate.mockClear();
      await toggleSidebar();
      expect(readingLineTop()).toBe(400);
      expect(scroller.scrollTop).toBe(1000);
    },
  );

  it("hands the thread back as soon as the reader scrolls", async () => {
    const { scroller, setScrollTop } = await renderWideThread("wide");
    await act(() => trigger().click());
    scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: 120 }));
    setScrollTop(1200);
    await drawFrames(10);
    expect(scroller.scrollTop).toBe(1200);
  });

  it("stays pinned to the end of the thread", async () => {
    const { scroller, setScrollTop } = await renderWideThread("wide");
    setScrollTop(4300);
    await toggleSidebar();
    expect(scroller.scrollTop).toBe(4300);
  });

  it("keeps the line in place at once when motion is reduced", async () => {
    document.documentElement.dataset.motion = "reduce";
    const { scroller, readingLineTop } = await renderWideThread("wide");
    await toggleSidebar();
    expect(readingLineTop()).toBe(400);
    expect(scroller.scrollTop).toBe(1066);
    expect(animate).not.toHaveBeenCalled();
  });

  it("leaves Comfortable as it was: the lanes only glide, even where the lane narrows", async () => {
    const { scroller } = await renderWideThread("comfortable");
    await toggleSidebar();
    expect(scroller.scrollTop).toBe(1000);
    expect(fadedElements()).toEqual([]);
    expect(glides()).toHaveLength(2);
    expect(animate).toHaveBeenCalledWith([{ translate: "-128px 0" }, { translate: "0 0" }], {
      duration: 218.75,
      easing: "cubic-bezier(.61,1,.88,1)",
    });
  });
});
