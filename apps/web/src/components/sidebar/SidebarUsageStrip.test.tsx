import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vite-plus/test";

const now = Date.parse("2026-10-29T12:00:00.000Z");
vi.mock("@effect/atom-react", () => ({
  useAtomValue: () => [
    {
      usageLimits: {
        windows: [
          {
            id: "five_hour",
            kind: "session",
            label: "Session",
            usedPercent: 22,
            resetsAt: new Date(now + (3 * 60 + 5) * 60_000).toISOString(),
          },
        ],
      },
    },
  ],
}));

import { SidebarUsageStrip } from "./SidebarChrome";

afterEach(() => vi.useRealTimers());

it("writes the time to a reset as Usage does", () => {
  vi.useFakeTimers({ now });
  const markup = renderToStaticMarkup(<SidebarUsageStrip />);
  expect(markup).toContain('<span class="hy-ur">3h 5m</span>');
});
