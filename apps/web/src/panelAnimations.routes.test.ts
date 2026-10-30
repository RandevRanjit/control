// @vitest-environment jsdom

import { scopedThreadKey, scopeThreadRef } from "@control/client-runtime/environment";
import type { EnvironmentId, ThreadId } from "@control/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { installRouteTransitions, markThreadPainted } from "./panelAnimations";
import type { AppRouter } from "./router";

type BlockerFn = (input: {
  currentLocation: { pathname: string };
  nextLocation: { pathname: string };
  action: "PUSH";
}) => boolean | Promise<boolean>;

const threadKey = (threadId: string) =>
  scopedThreadKey(scopeThreadRef("env" as EnvironmentId, threadId as ThreadId));

let blockerFn: BlockerFn | null = null;
let rendered = new Set<() => void>();
let updates: Array<() => Promise<void>> = [];
let uninstall: () => void = () => undefined;

const router = {
  history: {
    block: ({ blockerFn: fn }: { blockerFn: BlockerFn }) => {
      blockerFn = fn;
      return () => (blockerFn = null);
    },
  },
  getMatchedRoutes: (pathname: string) => {
    const [, first, second] = pathname.split("/");
    return first === "settings"
      ? { foundRoute: { id: `/settings/${second}` }, routeParams: {} }
      : {
          foundRoute: { id: "/_chat/$environmentId/$threadId" },
          routeParams: { environmentId: first, threadId: second },
        };
  },
  subscribe: (_event: "onRendered", listener: () => void) => {
    rendered.add(listener);
    return () => rendered.delete(listener);
  },
} as unknown as AppRouter;

// Where each allowed navigation lands, in order.
let landed: string[] = [];

function navigate(from: string, to: string) {
  let allowed: boolean | null = null;
  void Promise.resolve(
    blockerFn!({
      currentLocation: { pathname: from },
      nextLocation: { pathname: to },
      action: "PUSH",
    }),
  ).then((blocked) => {
    allowed = !blocked;
    if (allowed) landed.push(to);
  });
  return () => allowed;
}

function track(promise: Promise<void>) {
  let done = false;
  void promise.then(() => (done = true));
  return () => done;
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  landed = [];
  rendered = new Set();
  updates = [];
  document.documentElement.dataset.motion = "full";
  document.body.innerHTML = `<nav data-app-sidebar>${["a", "b", "c"]
    .map((id) => `<div data-thread-item="${threadKey(id)}"></div>`)
    .join("")}</nav>`;
  Object.assign(document, {
    startViewTransition: vi.fn((update: () => Promise<void>) => {
      updates.push(update);
      return { ready: Promise.resolve(), finished: new Promise(() => undefined) };
    }),
  });
  uninstall = installRouteTransitions(router);
});

afterEach(() => {
  uninstall();
  delete (document as { startViewTransition?: unknown }).startViewTransition;
  delete document.documentElement.dataset.routeTransition;
  vi.useRealTimers();
});

describe("route transitions", () => {
  it("holds the old thread until the next one paints, entering from below when it sits lower", async () => {
    const allowed = navigate("/env/a", "/env/c");
    await flush();
    expect(document.documentElement.dataset.routeTransition).toBe("down");
    // The old frame is captured before the route may change.
    expect(allowed()).toBe(null);

    const updated = track(updates[0]!());
    await flush();
    expect(allowed()).toBe(true);
    expect(updated()).toBe(false);

    markThreadPainted(threadKey("b"));
    await flush();
    expect(updated()).toBe(false);

    markThreadPainted(threadKey("c"));
    await flush();
    expect(updated()).toBe(true);
  });

  it("enters from above for a thread higher in the list", async () => {
    navigate("/env/c", "/env/a");
    await flush();
    expect(document.documentElement.dataset.routeTransition).toBe("up");
  });

  it("fades when the next thread is not in the sidebar", async () => {
    navigate("/env/a", "/env/z");
    await flush();
    expect(document.documentElement.dataset.routeTransition).toBe("fade");
  });

  it("stops holding after a cap when the thread is slow to load", async () => {
    navigate("/env/a", "/env/b");
    await flush();
    vi.useFakeTimers();
    const updated = track(updates[0]!());
    await vi.advanceTimersByTimeAsync(199);
    expect(updated()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(updated()).toBe(true);
  });

  it("slides Settings in once the route has rendered", async () => {
    navigate("/env/a", "/settings/general");
    await flush();
    expect(document.documentElement.dataset.routeTransition).toBe("settings-in");
    const updated = track(updates[0]!());
    await flush();
    expect(updated()).toBe(false);
    for (const listener of rendered) listener();
    await flush();
    expect(updated()).toBe(true);
  });

  it("slides Settings back out", async () => {
    navigate("/settings/general", "/env/a");
    await flush();
    expect(document.documentElement.dataset.routeTransition).toBe("settings-out");
  });

  it("lets navigation straight through when motion is reduced", async () => {
    document.documentElement.dataset.motion = "reduce";
    const allowed = navigate("/env/a", "/env/b");
    await flush();
    expect(allowed()).toBe(true);
    expect(document.startViewTransition).not.toHaveBeenCalled();
  });

  it("keeps a second navigation behind one still capturing its old frame", async () => {
    navigate("/env/a", "/env/b");
    await flush();
    navigate("/env/a", "/env/c");
    await flush();
    // The old frame isn't captured yet, so neither may land, and the second must not overtake.
    expect(landed).toEqual([]);

    void updates[0]!();
    await flush();
    expect(landed).toEqual(["/env/b", "/env/c"]);
  });
});
