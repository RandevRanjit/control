import { describe, expect, it } from "vite-plus/test";

import { fontFacesForStacks } from "./htmlRenderLiveTheme";

describe("fontFacesForStacks", () => {
  it("hands a framed page the faces its fonts name, at absolute URLs", () => {
    const faces = fontFacesForStacks(
      [
        {
          family: '"BloomRegrade"',
          src: 'url("/assets/NeueRegrade-Variable.ttf") format("truetype")',
          weight: "300 800",
          style: "normal",
          base: "http://127.0.0.1:3773/",
        },
        {
          family: "BloomPlex",
          src: "url(fonts/IBMPlexMono-Medium.otf) format('opentype')",
          weight: "500",
          style: "normal",
          base: "http://127.0.0.1:3773/assets/index.css",
        },
        {
          family: "Departure",
          src: 'url("/assets/DepartureMono.woff2") format("woff2")',
          weight: "400",
          style: "normal",
          base: "http://127.0.0.1:3773/",
        },
      ],
      ['BloomRegrade, -apple-system, "system-ui", sans-serif', '"BloomPlex", ui-monospace'],
    );

    expect(faces).toEqual([
      {
        family: "BloomRegrade",
        url: "http://127.0.0.1:3773/assets/NeueRegrade-Variable.ttf",
        format: "truetype",
        weight: "300 800",
        style: "normal",
      },
      {
        family: "BloomPlex",
        url: "http://127.0.0.1:3773/assets/fonts/IBMPlexMono-Medium.otf",
        format: "opentype",
        weight: "500",
        style: "normal",
      },
    ]);
  });
});
