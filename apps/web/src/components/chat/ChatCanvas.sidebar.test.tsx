// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { Sidebar, SidebarProvider, SidebarTrigger } from "../ui/sidebar";
import { ChatCanvas } from "./ChatCanvas";

let root: Root | undefined;
const animate = vi.fn(() => ({ cancel: vi.fn() }));

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
