import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import type { ContextWindowSnapshot } from "~/lib/contextWindow";
import { ContextBar } from "./ContextBar";

const snapshot = (overrides: Partial<ContextWindowSnapshot>) =>
  ({
    usedTokens: 320_000,
    maxTokens: 1_000_000,
    compactsAutomatically: true,
    autoCompactThreshold: 500_000,
    remainingTokens: 680_000,
    usedPercentage: 32,
    remainingPercentage: 68,
    updatedAt: "2026-10-09T10:00:00.000Z",
    ...overrides,
  }) as ContextWindowSnapshot;

describe("ContextBar", () => {
  it("is one row: the bar with its auto-compact mark, then used / compacts at", () => {
    const markup = renderToStaticMarkup(<ContextBar usage={snapshot({})} />);
    expect(markup).toContain('style="width:32%"');
    expect(markup).toContain('class="d-cmark" style="left:50%"');
    expect(markup).toContain("<b>320k</b> / 500k");
    expect(markup).not.toContain("Free");
  });

  it("drops the mark when the chat never compacts, then reads used / window", () => {
    const manual = renderToStaticMarkup(
      <ContextBar usage={snapshot({ compactsAutomatically: false })} />,
    );
    expect(manual).not.toContain("d-cmark");
    expect(manual).toContain("<b>320k</b> / 1m");
    expect(renderToStaticMarkup(<ContextBar usage={snapshot({ maxTokens: null })} />)).toBe("");
  });
});
