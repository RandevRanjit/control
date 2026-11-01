// @vitest-environment jsdom

import { afterEach, expect, it, vi } from "vite-plus/test";

import { motionReduced, onMotionChange } from "./motion";

afterEach(() => {
  document.documentElement.dataset.motion = "full";
});

it("reads Reduce motion from the gate and reports each flip until unsubscribed", async () => {
  const flipped = vi.fn();
  const stop = onMotionChange(flipped);

  document.documentElement.dataset.motion = "reduce";
  await Promise.resolve();
  expect(motionReduced()).toBe(true);
  expect(flipped).toHaveBeenCalledTimes(1);

  document.documentElement.dataset.motion = "full";
  await Promise.resolve();
  expect(motionReduced()).toBe(false);
  expect(flipped).toHaveBeenCalledTimes(2);

  stop();
  document.documentElement.dataset.motion = "reduce";
  document.documentElement.dataset.theme = "night";
  await Promise.resolve();
  expect(flipped).toHaveBeenCalledTimes(2);
});
