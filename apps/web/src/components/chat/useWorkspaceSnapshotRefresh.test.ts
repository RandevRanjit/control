// @vitest-environment jsdom
// The same scan state machine as mobile's composer menu, driven through the web hook.
import {
  EnvironmentId,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
} from "@control/contracts";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const refreshProviders = vi.hoisted(() => vi.fn());
// The merged config the composer reads once a scan answers; null is a server without on-demand snapshots.
const mergedConfig = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("../../state/server", async () => {
  const { Atom } = await import("effect/reactivity");
  return {
    serverEnvironment: {
      refreshProviders: Symbol("refreshProviders"),
      configValueAtom: () => Atom.make(() => mergedConfig.value),
    },
  };
});
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: () => refreshProviders,
}));

import { useWorkspaceSnapshotRefresh } from "./useWorkspaceSnapshotRefresh";

describe("workspace command discovery retry", () => {
  let root: Root;
  const environmentId = EnvironmentId.make("test-environment");
  const instanceId = ProviderInstanceId.make("claude");
  const provider = {
    instanceId,
    driver: ProviderDriverKind.make("claude"),
    enabled: true,
    installed: true,
    version: "1.0.0",
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-01-01T00:00:00.000Z",
    models: [],
    slashCommands: [],
    skills: [],
    workspaceSnapshots: [
      {
        cwd: "/project-a",
        checkedAt: "2026-01-01T00:00:00.000Z",
        slashCommandsPending: true,
        slashCommands: [{ name: "compact" }],
        skills: [],
      },
    ],
  } satisfies ServerProvider;

  function Probe({ cwd, status = provider }: { cwd: string; status?: ServerProvider }) {
    useWorkspaceSnapshotRefresh({
      environmentId,
      instanceId: status.instanceId,
      cwd,
      providerStatus: status,
      draft: "/project",
    });
    return null;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    mergedConfig.value = null;
    refreshProviders.mockReset();
    refreshProviders.mockResolvedValue({ _tag: "Success", value: { providers: [provider] } });
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    root = createRoot(document.createElement("div"));
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("retries partial commands after the cooldown without editing the draft", async () => {
    const recovered = {
      ...provider,
      workspaceSnapshots: [{ ...provider.workspaceSnapshots[0], slashCommandsPending: false }],
    };
    refreshProviders.mockResolvedValueOnce({ _tag: "Success", value: { providers: [provider] } });
    refreshProviders.mockResolvedValue({ _tag: "Success", value: { providers: [recovered] } });
    await act(async () => {
      root.render(createElement(Probe, { cwd: "/project-a" }));
    });
    expect(refreshProviders).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(9_999));
    expect(refreshProviders).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(refreshProviders).toHaveBeenCalledTimes(2);
    expect(refreshProviders).toHaveBeenLastCalledWith({
      environmentId,
      input: { instanceId, cwd: "/project-a" },
    });
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(refreshProviders).toHaveBeenCalledTimes(2);
  });

  it.each(["pi", "acpRegistry"])(
    "does not poll a healthy %s workspace without discovery",
    async (driver) => {
      const unsupported = {
        ...provider,
        driver: ProviderDriverKind.make(driver),
        workspaceSnapshots: [],
      };
      refreshProviders.mockResolvedValue({ _tag: "Success", value: { providers: [unsupported] } });
      await act(async () => {
        root.render(createElement(Probe, { cwd: "/project-a", status: unsupported }));
      });
      expect(refreshProviders).toHaveBeenCalledTimes(1);
      await act(() => vi.advanceTimersByTimeAsync(30_000));
      expect(refreshProviders).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("arms the remaining cooldown when a concurrent scan publishes partial commands", async () => {
    const missing = { ...provider, workspaceSnapshots: [] };
    const recovered = {
      ...provider,
      workspaceSnapshots: provider.workspaceSnapshots.map((snapshot) => ({
        ...snapshot,
        slashCommandsPending: false,
      })),
    };
    refreshProviders.mockResolvedValueOnce({ _tag: "Success", value: { providers: [missing] } });
    refreshProviders.mockResolvedValue({ _tag: "Success", value: { providers: [recovered] } });
    await act(async () => {
      root.render(createElement(Probe, { cwd: "/project-a", status: missing }));
    });
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(refreshProviders).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => {
      root.render(createElement(Probe, { cwd: "/project-a", status: provider }));
    });
    await act(() => vi.advanceTimersByTimeAsync(4_999));
    expect(refreshProviders).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(refreshProviders).toHaveBeenCalledTimes(2);
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(refreshProviders).toHaveBeenCalledTimes(2);
  });

  it("does not retry when a concurrent scan publishes a complete workspace", async () => {
    const missing = { ...provider, workspaceSnapshots: [] };
    const recovered = {
      ...provider,
      workspaceSnapshots: provider.workspaceSnapshots.map((snapshot) => ({
        ...snapshot,
        slashCommandsPending: false,
      })),
    };
    refreshProviders.mockResolvedValue({ _tag: "Success", value: { providers: [missing] } });
    await act(async () => {
      root.render(createElement(Probe, { cwd: "/project-a", status: missing }));
    });
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    await act(async () => {
      root.render(createElement(Probe, { cwd: "/project-a", status: recovered }));
    });
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(refreshProviders).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("retries a rejected refresh while published discovery remains pending", async () => {
    const recovered = {
      ...provider,
      workspaceSnapshots: provider.workspaceSnapshots.map((snapshot) => ({
        ...snapshot,
        slashCommandsPending: false,
      })),
    };
    refreshProviders.mockRejectedValueOnce(new Error("Connection lost"));
    refreshProviders.mockResolvedValue({ _tag: "Success", value: { providers: [recovered] } });
    await act(async () => {
      root.render(createElement(Probe, { cwd: "/project-a" }));
    });
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(refreshProviders).toHaveBeenCalledTimes(2);
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(refreshProviders).toHaveBeenCalledTimes(2);
  });

  it("cancels the old workspace retry and does not duplicate an in-flight request", async () => {
    await act(async () => {
      root.render(createElement(Probe, { cwd: "/project-a" }));
    });
    refreshProviders.mockImplementationOnce(() => new Promise(() => {}));
    await act(async () => {
      root.render(createElement(Probe, { cwd: "/project-b" }));
    });
    expect(refreshProviders).toHaveBeenCalledTimes(2);
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(refreshProviders).toHaveBeenCalledTimes(2);
    expect(refreshProviders).toHaveBeenLastCalledWith({
      environmentId,
      input: { instanceId, cwd: "/project-b" },
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rescans when the client discarded a complete answer", async () => {
    const recovered = {
      ...provider,
      workspaceSnapshots: [{ ...provider.workspaceSnapshots[0], slashCommandsPending: false }],
    };
    const missing = { ...provider, workspaceSnapshots: [] };
    refreshProviders.mockResolvedValue({ _tag: "Success", value: { providers: [recovered] } });
    // A reconfigure overtook the scan, so its answer never reached the merged config,
    // which the composer also reads its status from.
    mergedConfig.value = {
      environment: { capabilities: { providerWorkspaceSnapshotsOnDemand: true } },
      providers: [missing],
    };
    await act(async () => {
      root.render(createElement(Probe, { cwd: "/project-a", status: missing }));
    });
    expect(refreshProviders).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(refreshProviders).toHaveBeenCalledTimes(2);
  });

  it("retries a first scan that never reached the server", async () => {
    const missing = { ...provider, workspaceSnapshots: [] };
    refreshProviders.mockRejectedValueOnce(new Error("Connection lost"));
    await act(async () => {
      root.render(createElement(Probe, { cwd: "/project-a", status: missing }));
    });
    expect(refreshProviders).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(refreshProviders).toHaveBeenCalledTimes(2);
  });

  it("starts over when a reconfigure removes a pending snapshot after the last attempt", async () => {
    const missing = { ...provider, workspaceSnapshots: [] };
    await act(async () => {
      root.render(createElement(Probe, { cwd: "/project-a" }));
    });
    for (let step = 0; step < 3; step += 1) {
      await act(() => vi.advanceTimersByTimeAsync(10_000));
    }
    expect(refreshProviders).toHaveBeenCalledTimes(3);
    await act(async () => {
      root.render(createElement(Probe, { cwd: "/project-a", status: missing }));
    });
    expect(refreshProviders).toHaveBeenCalledTimes(4);
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(refreshProviders).toHaveBeenCalledTimes(5);
  });

  it("forgets a cwd's failed scans once its snapshot completes", async () => {
    await act(async () => {
      root.render(createElement(Probe, { cwd: "/project-a" }));
    });
    for (let step = 0; step < 3; step += 1) {
      await act(() => vi.advanceTimersByTimeAsync(10_000));
    }
    expect(refreshProviders).toHaveBeenCalledTimes(3);
    // Another composer's scan completes it.
    const complete = {
      ...provider,
      workspaceSnapshots: provider.workspaceSnapshots.map((snapshot) => ({
        ...snapshot,
        checkedAt: new Date(Date.now()).toISOString(),
        slashCommandsPending: false,
      })),
    };
    await act(async () => {
      root.render(createElement(Probe, { cwd: "/project-a", status: complete }));
    });
    // Once it is stale, a rescan that fails gets its cooldown retry again.
    await act(() => vi.advanceTimersByTimeAsync(6 * 60_000));
    await act(async () => {
      root.render(createElement(Probe, { cwd: "/project-a", status: { ...complete } }));
    });
    expect(refreshProviders).toHaveBeenCalledTimes(4);
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(refreshProviders).toHaveBeenCalledTimes(5);
  });

  it("keeps a cwd's attempt limit across a successful scan of another cwd", async () => {
    const withB = {
      ...provider,
      workspaceSnapshots: [
        ...provider.workspaceSnapshots,
        { cwd: "/project-b", checkedAt: new Date().toISOString(), slashCommands: [], skills: [] },
      ],
    };
    refreshProviders.mockImplementation(({ input }: { input: { cwd: string } }) =>
      Promise.resolve({
        _tag: "Success",
        value: { providers: [input.cwd === "/project-b" ? withB : provider] },
      }),
    );
    await act(async () => {
      root.render(createElement(Probe, { cwd: "/project-a" }));
    });
    for (let step = 0; step < 3; step += 1) {
      await act(() => vi.advanceTimersByTimeAsync(10_000));
    }
    expect(refreshProviders).toHaveBeenCalledTimes(3);
    await act(async () => {
      root.render(createElement(Probe, { cwd: "/project-b" }));
    });
    expect(refreshProviders).toHaveBeenCalledTimes(4);
    // Back on the cwd that never answers: one more scan, then no retries.
    await act(async () => {
      root.render(createElement(Probe, { cwd: "/project-a" }));
    });
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(refreshProviders).toHaveBeenCalledTimes(5);
  });

  it("keeps a cwd's attempt limit when another cwd's snapshot changes", async () => {
    const current = {
      ...provider,
      workspaceSnapshots: [
        ...provider.workspaceSnapshots,
        {
          cwd: "/project-b",
          checkedAt: new Date().toISOString(),
          slashCommands: [{ name: "compact" }],
          skills: [],
        },
      ],
    };
    await act(async () => {
      root.render(createElement(Probe, { cwd: "/project-a" }));
    });
    for (let step = 0; step < 3; step += 1) {
      await act(() => vi.advanceTimersByTimeAsync(10_000));
    }
    expect(refreshProviders).toHaveBeenCalledTimes(3);
    // /project-b's snapshot is complete and current, so it needs no scan.
    await act(async () => {
      root.render(createElement(Probe, { cwd: "/project-b", status: current }));
    });
    await act(async () => {
      root.render(createElement(Probe, { cwd: "/project-a", status: current }));
    });
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(refreshProviders).toHaveBeenCalledTimes(3);
  });

  it("stops rescanning a cwd that never answers, such as a deleted worktree", async () => {
    await act(async () => {
      root.render(createElement(Probe, { cwd: "/project-a" }));
    });
    for (let step = 0; step < 6; step += 1) {
      await act(() => vi.advanceTimersByTimeAsync(10_000));
    }
    expect(refreshProviders).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("gives a cwd fresh scan attempts after a snapshot it had is invalidated", async () => {
    const complete = {
      ...provider,
      workspaceSnapshots: provider.workspaceSnapshots.map((snapshot) => ({
        ...snapshot,
        slashCommandsPending: false,
      })),
    };
    await act(async () => {
      root.render(createElement(Probe, { cwd: "/project-a" }));
    });
    for (let step = 0; step < 3; step += 1) {
      await act(() => vi.advanceTimersByTimeAsync(10_000));
    }
    expect(refreshProviders).toHaveBeenCalledTimes(3);
    // Another composer's scan supplies the snapshot, then a reconfigure invalidates it.
    await act(async () => {
      root.render(createElement(Probe, { cwd: "/project-a", status: complete }));
    });
    await act(async () => {
      root.render(createElement(Probe, { cwd: "/project-a" }));
    });
    expect(refreshProviders).toHaveBeenCalledTimes(4);
    // That scan fails too, and still gets its cooldown retry.
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(refreshProviders).toHaveBeenCalledTimes(5);
  });

  it("cancels a scheduled retry when the composer unmounts", async () => {
    await act(async () => {
      root.render(createElement(Probe, { cwd: "/project-a" }));
    });
    await act(async () => {
      root.unmount();
    });
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(refreshProviders).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
