// @vitest-environment jsdom

import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("../ui/sidebar", () => ({
  useSidebar: () => ({ isMobile: false, setOpenMobile: vi.fn(), toggleSidebar: vi.fn() }),
}));

import { SidebarChromeHeader } from "./SidebarChrome";
import { MainAppLocationTracker } from "./mainAppLocation";

let root: Root | undefined;

beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));

afterEach(async () => {
  await act(() => root?.unmount());
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

async function openThread() {
  const shell = createRootRoute({
    component: () => (
      <>
        <MainAppLocationTracker />
        <SidebarChromeHeader isElectron={false} />
        <Outlet />
      </>
    ),
  });
  const router = createRouter({
    routeTree: shell.addChildren([
      createRoute({ getParentRoute: () => shell, path: "/" }),
      createRoute({ getParentRoute: () => shell, path: "/settings" }),
      createRoute({ getParentRoute: () => shell, path: "/$environmentId/$threadId" }),
    ]),
    history: createMemoryHistory({ initialEntries: ["/env-1/thread-1"] }),
  });
  await router.load();
  const container = document.body.appendChild(document.createElement("div"));
  await act(() => {
    root = createRoot(container);
    root.render(<RouterProvider router={router} />);
  });
  return router;
}

const gear = () => document.querySelector<HTMLButtonElement>("button.d-set")!;

describe("the settings gear", () => {
  it("opens Settings, stays held there, and leads back to the thread", async () => {
    const router = await openThread();
    expect(gear().getAttribute("aria-pressed")).toBe("false");

    await act(async () => gear().click());
    expect(router.state.location.pathname).toBe("/settings");
    expect(gear().getAttribute("aria-pressed")).toBe("true");
    expect(gear().getAttribute("aria-label")).toBe("Close settings");

    await act(async () => gear().click());
    expect(router.state.location.pathname).toBe("/env-1/thread-1");
  });
});
