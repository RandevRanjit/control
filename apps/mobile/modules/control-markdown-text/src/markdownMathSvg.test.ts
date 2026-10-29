import { describe, expect, it } from "vite-plus/test";

import { markdownMathSvg } from "./markdownMathSvg";
import { inlineMathLayout } from "./nativeMarkdownText";

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

describe("inlineMathLayout", () => {
  // Thread body text: 16 pt on a 23 pt line.
  it("pads the text for a fraction reaching past the line, so a table cell keeps it", () => {
    const fraction = markdownMathSvg("\\varphi = \\frac{1+\\sqrt5}{2}", false)!;
    const layout = inlineMathLayout([fraction], 16, 23);
    expect(layout.paddingTop).toBeGreaterThan(3);
    expect(layout.paddingBottom).toBeGreaterThan(0);
  });

  it("leaves a formula that fits the line unpadded", () => {
    const symbol = markdownMathSvg("\\pi r^2", false)!;
    expect(inlineMathLayout([symbol], 16, 23)).toMatchObject({ paddingTop: 0, paddingBottom: 0 });
  });
});
