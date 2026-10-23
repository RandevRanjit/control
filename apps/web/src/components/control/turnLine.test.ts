import { describe, expect, it } from "vite-plus/test";

import { fitTurnLines } from "./turnLine";

const row = (top: number, height: number, pins: { ask?: number; reply?: number } = {}) => ({
  top,
  height,
  askPin: pins.ask ?? null,
  replyPin: pins.reply ?? null,
});

describe("fitTurnLines", () => {
  it("runs from under the prompt's arrow to the last reply's tail in whole dashes", () => {
    // Line: 10 + 18 + 20 = 48 down to 200 + 1 - 20 = 181, so 133 high: five 13 px dashes, gaps 17.
    const segments = fitTurnLines([
      row(0, 60, { ask: 10 }),
      row(60, 100),
      row(160, 80, { reply: 200 }),
    ]);
    const period = 30;
    expect(segments[0]).toEqual({ top: 48, height: 12, period, offset: 0 });
    expect(segments[1]).toEqual({ top: 0, height: 100, period, offset: -12 });
    expect(segments[2]).toEqual({ top: 0, height: 21, period, offset: -112 });
  });

  it("breaks around a reply's arrow before the last, in whole dashes either side", () => {
    // A reply's ↳ sits 9 into its row. Above it: 48 down to 179 + 1 - 20 = 160, so 112 high.
    // Below it: 179 + 18 + 20 = 217 down to 348 + 1 - 20 = 329, 112 again. Four dashes, gaps 20.
    const segments = fitTurnLines([
      row(0, 60, { ask: 10 }),
      row(60, 110),
      row(170, 80, { reply: 179 }),
      row(250, 89),
      row(339, 80, { reply: 348 }),
    ]);
    const period = 33;
    expect(segments[1]).toEqual({ top: 0, height: 100, period, offset: -12 });
    expect(segments[2]).toEqual({ top: 47, height: 33, period, offset: 0 });
    expect(segments[3]).toEqual({ top: 0, height: 79, period, offset: -33 });
    expect(segments[4]!.height).toBe(0);
  });

  it("ends at the last reply and starts a new line at the next prompt", () => {
    const segments = fitTurnLines([
      row(0, 80, { ask: 0 }),
      row(80, 80, { reply: 100 }),
      row(160, 80, { reply: 200 }),
      row(240, 40),
      row(280, 40, { ask: 280 }),
    ]);
    expect(segments[2]!.height).toBeGreaterThan(0);
    expect(segments[3]!.height).toBe(0);
    // A prompt with no reply yet draws nothing.
    expect(segments[4]!.height).toBe(0);
  });

  it("draws nothing for rows above the first visible prompt", () => {
    const segments = fitTurnLines([row(0, 40, { reply: 10 }), row(40, 40, { ask: 40 })]);
    expect(segments.every((segment) => segment.height === 0)).toBe(true);
  });
});
