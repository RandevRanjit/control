import { expect, it } from "vite-plus/test";

import { samplesToBase64 } from "./dictationAudio";

const decode = (base64: string) => {
  const bytes = Buffer.from(base64, "base64");
  return Array.from({ length: bytes.length / 2 }, (_, index) => bytes.readInt16LE(index * 2));
};

it("writes 16-bit samples and clips what's too loud", () => {
  expect(decode(samplesToBase64([new Float32Array([0, 1, -1, 0.5, 2, -2])]))).toEqual([
    0, 32767, -32767, 16383, 32767, -32767,
  ]);
});

it("mixes a stereo microphone to one channel", () => {
  expect(decode(samplesToBase64([new Float32Array([1, 0]), new Float32Array([0, 0])]))).toEqual([
    16383, 0,
  ]);
});

it("holds five minutes", () => {
  const samples = samplesToBase64([new Float32Array(300 * 16_000)]);
  expect(decode(samples)).toHaveLength(300 * 16_000);
});

it("is empty for an empty recording", () => {
  expect(samplesToBase64([])).toBe("");
});
