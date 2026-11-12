// @vitest-environment jsdom
import { describe, expect, it } from "vite-plus/test";

import {
  createInteractionRecorder,
  describeTarget,
  type TimedInteraction,
} from "./interactionTiming";

function recorder() {
  const reports: TimedInteraction[] = [];
  return {
    reports,
    recorder: createInteractionRecorder((interaction) => reports.push(interaction)),
  };
}

function button(label: string) {
  const element = document.createElement("button");
  element.setAttribute("aria-label", label);
  document.body.append(element);
  return element;
}

const entry = (name: string, interactionId: number, duration: number, target: Node | null) => ({
  name,
  interactionId,
  startTime: 1_000,
  duration,
  target,
});

describe("describeTarget", () => {
  it("names the control an interaction landed in", () => {
    const tab = document.createElement("div");
    tab.setAttribute("role", "tab");
    tab.innerHTML = "<span>Outputs</span>";
    document.body.append(tab);
    expect(describeTarget(tab.querySelector("span"))).toBe('tab "Outputs"');
    expect(describeTarget(button("Open panel"))).toBe('button "Open panel"');
  });

  it("shortens long labels and survives a removed target", () => {
    expect(describeTarget(button("x".repeat(80)))).toBe(`button "${"x".repeat(59)}…"`);
    expect(describeTarget(null)).toBe("a removed element");
  });
});

describe("createInteractionRecorder", () => {
  it("reports a slow click once, at its slowest entry", () => {
    const { reports, recorder: r } = recorder();
    const target = button("Outputs");
    r.events([entry("pointerdown", 7, 72, target), entry("click", 7, 136, target)]);
    r.events([entry("pointerup", 7, 140, target)]);
    expect(reports).toEqual([
      { event: "click", target: 'button "Outputs"', startMs: 1_000, durationMs: 136 },
    ]);
  });

  it("names key presses, and skips fast ones and entries outside an interaction", () => {
    const { reports, recorder: r } = recorder();
    const field = document.createElement("textarea");
    field.setAttribute("placeholder", "Ask anything");
    document.body.append(field);
    r.events([entry("keydown", 3, 104, field), entry("keydown", 4, 24, field)]);
    r.events([entry("pointermove", 0, 300, field)]);
    expect(reports).toEqual([
      { event: "key", target: 'textarea "Ask anything"', startMs: 1_000, durationMs: 104 },
    ]);
  });

  it("reports a drag's slowest frame once the pointer has moved", () => {
    const { reports, recorder: r } = recorder();
    r.pointerDown(button("Resize panel"), 100, 100);
    r.pointerMove(101, 100, 20);
    r.pointerMove(110, 100, 30);
    // Frame timings arrive after their frame; one that started before the pointer moved is the
    // press itself, not the drag.
    r.frames([
      { startTime: 10, duration: 400 },
      { startTime: 40, duration: 64 },
      { startTime: 60, duration: 120 },
      { startTime: 80, duration: 16 },
    ]);
    r.pointerUp();
    expect(reports).toEqual([
      {
        event: "drag",
        target: 'button "Resize panel"',
        startMs: 60,
        durationMs: 120,
        longFrames: 2,
      },
    ]);
  });

  it("reports nothing for a press that never moves or a drag with only quick frames", () => {
    const { reports, recorder: r } = recorder();
    r.pointerDown(button("Outputs"), 0, 0);
    r.frames([{ startTime: 10, duration: 200 }]);
    r.pointerUp();
    r.pointerDown(button("Resize panel"), 0, 0);
    r.pointerMove(20, 0, 5);
    r.frames([{ startTime: 10, duration: 17 }]);
    r.pointerUp();
    expect(reports).toEqual([]);
  });
});
