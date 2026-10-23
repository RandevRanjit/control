import { describe, expect, it } from "vite-plus/test";

import { isGroupLocked } from "./group.ts";

describe("isGroupLocked", () => {
  const nowMs = Date.parse("2026-10-09T12:00:00.000Z");

  it("holds until the end time and lifts on its own after it", () => {
    expect(isGroupLocked({ lockedUntil: "2026-10-09T12:00:00.001Z" }, nowMs)).toBe(true);
    expect(isGroupLocked({ lockedUntil: "2026-10-09T12:00:00.000Z" }, nowMs)).toBe(false);
    expect(isGroupLocked({ lockedUntil: null }, nowMs)).toBe(false);
  });
});
