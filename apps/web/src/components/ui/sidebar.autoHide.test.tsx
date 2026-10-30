// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { Sidebar, SidebarProvider, SidebarRail, SidebarTrigger } from "./sidebar";

let root: Root | undefined;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
  // jsdom has no pointer capture; the rail's drag needs it.
  let captured: number | null = null;
  HTMLElement.prototype.setPointerCapture = (id: number) => void (captured = id);
  HTMLElement.prototype.hasPointerCapture = (id: number) => captured === id;
  HTMLElement.prototype.releasePointerCapture = () => void (captured = null);
});

afterEach(async () => {
  await act(() => root?.unmount());
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

async function renderSidebar() {
  const onResize = vi.fn();
  const container = document.body.appendChild(document.createElement("div"));
  await act(() => {
    root = createRoot(container);
    root.render(
      <SidebarProvider autoHide>
        <Sidebar resizable={{ maxWidth: 600, onResize }}>
          <SidebarTrigger />
          <SidebarRail />
        </Sidebar>
      </SidebarProvider>,
    );
  });
  return { onResize };
}

const slot = (name: string) => document.querySelector<HTMLElement>(`[data-slot='${name}']`)!;

function pointer(type: string, clientX: number) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX });
  Object.defineProperty(event, "pointerId", { value: 1 });
  return event;
}

describe("auto-hidden sidebar rail", () => {
  it("resizes the revealed sidebar without pushing the content", async () => {
    const { onResize } = await renderSidebar();
    await act(() => slot("sidebar-trigger").click());
    expect(slot("sidebar-container").dataset.autoHide).toBe("revealed");

    const rail = slot("sidebar-rail");
    expect(rail.getAttribute("aria-label")).toBe("Resize Sidebar");
    await act(() => {
      rail.dispatchEvent(pointer("pointerdown", 256));
      rail.dispatchEvent(pointer("pointermove", 356));
    });
    // The gap is what pushes the content; an overlay sidebar keeps it at zero.
    expect(slot("sidebar-gap").style.width).toBe("");
    await act(() => rail.dispatchEvent(pointer("pointerup", 356)));

    expect(onResize).toHaveBeenLastCalledWith(356);
    expect(slot("sidebar-wrapper").style.getPropertyValue("--sidebar-width")).toBe("356px");
    expect(slot("sidebar-container").dataset.autoHide).toBe("revealed");
  });

  it("is inert while the sidebar is hidden", async () => {
    await renderSidebar();
    expect(slot("sidebar-container").dataset.autoHide).toBe("hidden");
    expect(slot("sidebar-rail").getAttribute("aria-label")).toBe("Toggle Sidebar");
  });
});
