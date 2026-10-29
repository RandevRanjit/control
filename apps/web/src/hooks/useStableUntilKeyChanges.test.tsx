// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vite-plus/test";

import { useStableUntilKeyChanges } from "./useStableUntilKeyChanges";

afterEach(() => {
  vi.unstubAllGlobals();
});

it("never hands a render the old value under a new key", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const seen: Array<readonly string[]> = [];
  // The sidebar looks each listed key up in a map built for the same render,
  // so a stale list under a new key reads rows that no longer exist.
  function Probe({ rows }: { rows: readonly string[] }) {
    const kept = useStableUntilKeyChanges(rows, rows.join(","));
    seen.push(kept);
    const present = new Set(rows);
    for (const row of kept) if (!present.has(row)) throw new Error(`stale row ${row}`);
    return null;
  }
  const root = createRoot(document.createElement("div"));
  const first = ["a", "b"];
  await act(async () => root.render(createElement(Probe, { rows: first })));
  // Same order, new array: the first identity stays.
  await act(async () => root.render(createElement(Probe, { rows: ["a", "b"] })));
  expect(seen.at(-1)).toBe(first);
  // An emptied shelf drops both rows in the same render.
  await act(async () => root.render(createElement(Probe, { rows: [] })));
  expect(seen.at(-1)).toEqual([]);
  await act(async () => root.unmount());
});
