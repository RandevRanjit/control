// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { RESIZABLE_WIDTH_PROPERTY } from "~/hooks/useResizableWidth";
import { PreviewPanelShell } from "./PreviewPanelShell";

let root: Root | undefined;
let frames: FrameRequestCallback[] = [];

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  // jsdom lays nothing out; give the row room for a wide panel.
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(2000);
  vi.stubGlobal("innerWidth", 2000);
  let captured: number | null = null;
  HTMLElement.prototype.setPointerCapture = (id: number) => void (captured = id);
  HTMLElement.prototype.hasPointerCapture = (id: number) => captured === id;
  HTMLElement.prototype.releasePointerCapture = () => void (captured = null);
});

afterEach(async () => {
  await act(() => root?.unmount());
  document.body.innerHTML = "";
  localStorage.clear();
  frames = [];
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function pointer(type: string, clientX: number) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX });
  Object.defineProperty(event, "pointerId", { value: 1 });
  return event;
}

async function nextFrame() {
  const pending = frames;
  frames = [];
  await act(() => pending.forEach((callback) => callback(0)));
}

describe("right panel resize", () => {
  it("holds the panel still during a drag, shows where its edge will land, and applies on release", async () => {
    const container = document.body.appendChild(document.createElement("div"));
    await act(() => {
      root = createRoot(container);
      root.render(
        <PreviewPanelShell mode="inline" open>
          content
        </PreviewPanelShell>,
      );
    });
    const handle = document.querySelector<HTMLElement>("[role='separator']")!;
    const host = handle.parentElement!;
    expect(host.style.getPropertyValue(RESIZABLE_WIDTH_PROPERTY)).toBe("540px");

    await act(() => {
      handle.dispatchEvent(pointer("pointerdown", 1000));
      handle.dispatchEvent(pointer("pointermove", 900));
    });
    await nextFrame();
    // The chat beside the panel keeps its width, so its text does not reflow under the pointer.
    expect(host.style.getPropertyValue(RESIZABLE_WIDTH_PROPERTY)).toBe("540px");
    expect(handle.style.translate).toBe("-100px");

    await act(() => handle.dispatchEvent(pointer("pointerup", 880)));
    expect(host.style.getPropertyValue(RESIZABLE_WIDTH_PROPERTY)).toBe("660px");
    expect(handle.style.translate).toBe("");
  });
});
