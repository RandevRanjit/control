// @vitest-environment jsdom

import { act, createElement, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { SettingsPaneProvider, usePaneEnter, useThreadEnter } from "./panelAnimations";

let root: Root;
let container: HTMLDivElement;
let animations: Array<{ element: Element; from: Keyframe; duration: number }>;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  document.documentElement.dataset.motion = "full";
  animations = [];
  Element.prototype.animate = function (this: Element, keyframes, options) {
    const [from] = keyframes as Keyframe[];
    animations.push({
      element: this,
      from: from!,
      duration: (options as KeyframeAnimationOptions).duration as number,
    });
    return {} as Animation;
  };
  // The sidebar's list, top to bottom.
  document.body.innerHTML = `<nav data-app-sidebar>${["a", "b", "c"]
    .map((key) => `<div data-thread-item="${key}"></div>`)
    .join("")}</nav>`;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
  delete document.documentElement.dataset.motion;
  vi.unstubAllGlobals();
});

function Timeline({ threadKey }: { threadKey: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useThreadEnter(ref, threadKey);
  return createElement("div", { ref, "data-timeline": threadKey });
}

const showThread = (threadKey: string) =>
  act(async () => root.render(createElement(Timeline, { threadKey })));

describe("useThreadEnter", () => {
  it("brings a thread lower in the list in from below, once it is shown", async () => {
    await showThread("a");
    expect(animations).toEqual([]);
    await showThread("c");
    expect(animations).toHaveLength(1);
    expect(animations[0]!.element.getAttribute("data-timeline")).toBe("c");
    expect(animations[0]!.from).toEqual({ opacity: 0, translate: "0 8px" });
    expect(animations[0]!.duration).toBe(109);
  });

  it("brings a thread higher in the list in from above", async () => {
    await showThread("c");
    await showThread("b");
    expect(animations.map((animation) => animation.from)).toEqual([
      { opacity: 0, translate: "0 -8px" },
    ]);
  });

  it("only fades in a thread the list does not show", async () => {
    await showThread("a");
    await showThread("elsewhere");
    expect(animations.map((animation) => animation.from)).toEqual([
      { opacity: 0, translate: "0 0px" },
    ]);
  });

  it("does not move when the same thread renders again", async () => {
    await showThread("a");
    await showThread("a");
    expect(animations).toEqual([]);
  });

  it("switches instantly when motion is reduced", async () => {
    document.documentElement.dataset.motion = "reduce";
    await showThread("a");
    await showThread("c");
    expect(animations).toEqual([]);
  });
});

function Pane({ name }: { name: string }) {
  const ref = useRef<HTMLElement>(null);
  usePaneEnter(ref);
  return createElement("main", { ref, "data-pane": name });
}

// The layout knows Settings opened a render before the route's own pane mounts.
const showPane = (onSettings: boolean, name: string) =>
  act(async () =>
    root.render(
      createElement(
        SettingsPaneProvider,
        { value: onSettings },
        createElement(Pane, { key: name, name }),
      ),
    ),
  );

describe("usePaneEnter", () => {
  it("slides the arriving pane in, from the right into Settings and from the left out of it", async () => {
    await showPane(false, "thread");
    animations = [];
    await showPane(true, "thread");
    expect(animations).toEqual([]);
    await showPane(true, "settings");
    await showPane(false, "settings");
    await showPane(false, "thread");
    expect(
      animations.map((animation) => [
        animation.element.getAttribute("data-pane"),
        animation.from,
        animation.duration,
      ]),
    ).toEqual([
      ["settings", { opacity: 0, translate: "24px 0" }, 219],
      ["thread", { opacity: 0, translate: "-24px 0" }, 219],
    ]);
  });

  it("does not move a pane that replaces another outside Settings", async () => {
    await showPane(false, "thread");
    animations = [];
    await showPane(false, "usage");
    expect(animations).toEqual([]);
  });
});
