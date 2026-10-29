import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("../../hooks/useSettings", () => ({ usePrimarySettings: () => "24h" }));

import { LimitWindows, limitName, usedColor } from "./UsageLimits";

const now = Date.parse("2026-10-27T12:00:00.000Z");

describe("LimitWindows", () => {
  it("shows the share used, as the sidebar does, with the bar filled to it", () => {
    const markup = renderToStaticMarkup(
      <LimitWindows
        now={now}
        windows={[
          {
            id: "five_hour",
            kind: "session",
            label: "Session",
            usedPercent: 71,
            windowDurationMins: 300,
            resetsAt: "2026-10-27T14:00:00.000Z",
          },
        ]}
      />,
    );
    expect(markup).toContain("71% used");
    expect(markup).not.toContain("% left");
    expect(markup).toContain("width:71%");
    // Three of the window's five hours have gone, so even spending sits at 60%.
    expect(markup).toContain("left:60%");
  });
});

describe("limit looks", () => {
  it("takes the sidebar's names: 5H and 7D, a model's week after it", () => {
    expect(limitName({ kind: "session", label: "Session" })).toBe("5H");
    expect(limitName({ kind: "weekly", label: "Weekly" })).toBe("7D");
    expect(limitName({ kind: "weekly", label: "Weekly · Fable" })).toBe("7D · Fable");
    expect(limitName({ kind: "monthly", label: "Monthly spend" })).toBe("Monthly spend");
  });

  it("stays neutral until 70% used, then amber to 90%, then red", () => {
    expect(usedColor(69)).toBe("var(--text-secondary)");
    expect(usedColor(70)).toBe("var(--amber-base)");
    expect(usedColor(89)).toBe("var(--amber-base)");
    expect(usedColor(90)).toBe("var(--danger)");
  });
});
