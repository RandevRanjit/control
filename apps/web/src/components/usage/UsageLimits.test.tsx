import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("../../hooks/useSettings", () => ({ usePrimarySettings: () => "24h" }));

import { LimitWindows } from "./UsageLimits";

const now = Date.parse("2026-10-27T12:00:00.000Z");

describe("LimitWindows", () => {
  it("shows the share used, as the sidebar does, with the bar filled to it", () => {
    const markup = renderToStaticMarkup(
      <LimitWindows
        driver={"claudeAgent" as never}
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
