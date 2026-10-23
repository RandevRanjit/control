import { describe, expect, it, vi } from "vite-plus/test";

import { buildHomeListFilterMenu } from "./home-list-filter-menu";

describe("buildHomeListFilterMenu", () => {
  it("filters by environment only; search covers projects, as on desktop", () => {
    const menu = buildHomeListFilterMenu({
      environments: [],
      selectedEnvironmentId: null,
      onEnvironmentChange: vi.fn(),
    });

    expect(menu.items.map((item) => item.title)).toEqual(["Environment"]);
  });
});
