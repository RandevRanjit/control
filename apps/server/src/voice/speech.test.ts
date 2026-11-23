import { expect, it } from "@effect/vitest";

import { keepSpeech } from "./speech.ts";

/** A recording at ten samples a second, whose samples count up. */
const RATE = 10;
const recording = (seconds: number) => {
  const pcm = Buffer.alloc(seconds * RATE * 2);
  for (let index = 0; index < seconds * RATE; index += 1) pcm.writeInt16LE(index, index * 2);
  return pcm;
};
const kept = (seconds: number, segments: Parameters<typeof keepSpeech>[2]) => {
  const pcm = keepSpeech(recording(seconds), RATE, segments);
  return Array.from({ length: pcm.byteLength / 2 }, (_, index) => pcm.readInt16LE(index * 2));
};
const range = (from: number, to: number) =>
  Array.from({ length: to - from }, (_, index) => from + index);

it("keeps speech with a third of a second on each side and drops the silence around it", () => {
  expect(kept(60, [{ t0: 1000, t1: 1200 }])).toEqual(range(97, 123));
});

it("shortens a long pause and leaves a short one whole", () => {
  expect(
    kept(60, [
      { t0: 100, t1: 200 },
      { t0: 240, t1: 300 },
      { t0: 4000, t1: 4100 },
    ]),
  ).toEqual([...range(7, 33), ...range(397, 413)]);
});

it("stays inside the recording", () => {
  expect(kept(2, [{ t0: 0, t1: 250 }])).toEqual(range(0, 20));
});

it("keeps nothing when nobody spoke", () => {
  expect(kept(5, [])).toEqual([]);
});
