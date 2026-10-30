import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createSidebarAutoHide, SIDEBAR_AUTO_HIDE_DELAY_MS } from "./sidebarAutoHide";

function setup(held = { value: false }) {
  const changes: boolean[] = [];
  const autoHide = createSidebarAutoHide({
    onRevealedChange: (revealed) => changes.push(revealed),
    isHeld: () => held.value,
  });
  return { autoHide, changes, held };
}

describe("auto-hidden sidebar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows at the edge and hides once the pointer has been away for the delay", () => {
    const { autoHide, changes } = setup();
    autoHide.edgeEntered();
    expect(changes).toEqual([true]);

    autoHide.pointerEntered();
    vi.advanceTimersByTime(SIDEBAR_AUTO_HIDE_DELAY_MS * 3);
    expect(changes).toEqual([true]);

    autoHide.pointerLeft();
    vi.advanceTimersByTime(SIDEBAR_AUTO_HIDE_DELAY_MS - 1);
    expect(changes).toEqual([true]);
    vi.advanceTimersByTime(1);
    expect(changes).toEqual([true, false]);
  });

  it("stays when the pointer comes back before the delay runs out", () => {
    const { autoHide, changes } = setup();
    autoHide.edgeEntered();
    autoHide.pointerEntered();
    autoHide.pointerLeft();
    vi.advanceTimersByTime(SIDEBAR_AUTO_HIDE_DELAY_MS - 500);
    autoHide.pointerEntered();
    vi.advanceTimersByTime(SIDEBAR_AUTO_HIDE_DELAY_MS * 2);
    expect(changes).toEqual([true]);
  });

  it("hides after the delay when the pointer touches the edge and turns back", () => {
    const { autoHide, changes } = setup();
    autoHide.edgeEntered();
    vi.advanceTimersByTime(SIDEBAR_AUTO_HIDE_DELAY_MS);
    expect(changes).toEqual([true, false]);
  });

  it("waits while a menu or a field in it is in use, then hides", () => {
    const { autoHide, changes, held } = setup({ value: true });
    autoHide.edgeEntered();
    autoHide.pointerEntered();
    autoHide.pointerLeft();
    vi.advanceTimersByTime(SIDEBAR_AUTO_HIDE_DELAY_MS * 4);
    expect(changes).toEqual([true]);

    held.value = false;
    vi.advanceTimersByTime(SIDEBAR_AUTO_HIDE_DELAY_MS);
    expect(changes).toEqual([true, false]);
  });

  it("toggles from the shortcut: shows, then hides on the next press", () => {
    const { autoHide, changes } = setup();
    autoHide.toggle();
    autoHide.pointerEntered();
    autoHide.toggle();
    expect(changes).toEqual([true, false]);
    // A pointer still over the panel as it slides away doesn't bring it back.
    autoHide.pointerLeft();
    vi.advanceTimersByTime(SIDEBAR_AUTO_HIDE_DELAY_MS * 2);
    expect(changes).toEqual([true, false]);
  });
});
