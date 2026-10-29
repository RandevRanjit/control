import { describe, expect, it } from "vite-plus/test";

import { markdownMathSvg } from "./markdownMathSvg";

describe("markdownMathSvg", () => {
  it("sizes a formula in ems around the text baseline", () => {
    const svg = markdownMathSvg("x_i^2", false);
    expect(svg?.xml).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width=/);
    expect(svg?.width).toBeGreaterThan(0.5);
    expect(svg?.height).toBeGreaterThan(svg?.depth ?? Infinity);
    expect(svg?.depth).toBeGreaterThan(0);
  });

  it("returns null for TeX it cannot parse, so the source shows instead", () => {
    expect(markdownMathSvg("\\frac{a", true)).toBeNull();
    expect(markdownMathSvg("\\notamacro", false)).toBeNull();
  });

  it("emits no links, whatever the TeX asks for", () => {
    expect(markdownMathSvg("\\href{https://example.com}{x}", false)).toBeNull();
  });
});
