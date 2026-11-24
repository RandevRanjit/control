// @effect-diagnostics nodeBuiltinImport:off -- The test checks the packaged images on disk.

import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { DesktopMenubarIconStateSchema } from "@control/contracts";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as TestClock from "effect/testing/TestClock";
import { vi } from "vite-plus/test";

import type * as Electron from "electron";

import * as DesktopAssets from "../app/DesktopAssets.ts";
import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";
import * as ElectronApp from "../electron/ElectronApp.ts";
import * as ElectronWindow from "../electron/ElectronWindow.ts";
import * as DesktopAppSettings from "../settings/DesktopAppSettings.ts";
import * as DesktopWindow from "../window/DesktopWindow.ts";
import * as DesktopMenubar from "./DesktopMenubar.ts";
import { menubarImageName, menubarPanelBounds } from "./DesktopMenubar.ts";

vi.mock("electron", () => ({
  Tray: class {
    setIgnoreDoubleClickEvents() {}
    on() {}
    destroy() {}
  },
  nativeImage: { createEmpty: () => ({}) },
}));

const workArea = { x: 0, y: 24, width: 1512, height: 920 };

describe("menubarPanelBounds", () => {
  it("hangs 6 px under the item, centred on it", () => {
    const item = { x: 1100, y: 0, width: 40, height: 24 };
    assert.deepEqual(menubarPanelBounds({ item, workArea, height: 300 }), {
      x: 940,
      y: 30,
      width: 360,
      height: 300,
    });
  });

  it("stays on screen beside the screen's edge", () => {
    const item = { x: 1490, y: 0, width: 22, height: 24 };
    assert.equal(menubarPanelBounds({ item, workArea, height: 300 }).x, 1152);
  });

  it("grows with its content up to the visible height less 40", () => {
    const item = { x: 700, y: 0, width: 40, height: 24 };
    assert.equal(menubarPanelBounds({ item, workArea, height: 5000 }).height, 880);
  });
});

describe("menu-bar images", () => {
  it("ship for every state, with the update dot on each but off", () => {
    const resources = NodePath.join(import.meta.dirname, "../../resources");
    for (const state of DesktopMenubarIconStateSchema.literals) {
      for (const update of state === "off" ? [false] : [false, true]) {
        const name = menubarImageName({ state, update });
        assert.isTrue(NodeFS.existsSync(NodePath.join(resources, name)), name);
        assert.isTrue(NodeFS.existsSync(NodePath.join(resources, name.replace(".png", "@2x.png"))));
      }
    }
  });
});

describe("DesktopMenubar", () => {
  const calls: string[] = [];
  const layer = DesktopMenubar.layer.pipe(
    Layer.provideMerge(
      Layer.mergeAll(
        Layer.succeed(
          DesktopEnvironment.DesktopEnvironment,
          DesktopEnvironment.DesktopEnvironment.of({
            platform: "linux",
          } as DesktopEnvironment.DesktopEnvironment["Service"]),
        ),
        Layer.mock(DesktopAssets.DesktopAssets, {}),
        DesktopAppSettings.layerTest(),
        Layer.mock(ElectronApp.ElectronApp, { quit: Effect.sync(() => void calls.push("quit")) }),
        Layer.mock(ElectronWindow.ElectronWindow, {}),
        Layer.mock(DesktopWindow.DesktopWindow, {
          activate: Effect.sync(() => void calls.push("activate")),
          dispatchMenuAction: (action) => Effect.sync(() => void calls.push(action)),
        }),
      ),
    ),
  );

  it.effect("sends each click in the panel to the window, or quits", () =>
    Effect.gen(function* () {
      const menubar = yield* DesktopMenubar.DesktopMenubar;
      yield* menubar.act({ type: "thread", environmentId: "env-1", threadId: "thread-1" });
      yield* menubar.act({ type: "lock" });
      yield* menubar.act({ type: "settings" });
      yield* menubar.act({ type: "open" });
      yield* menubar.act({ type: "close" });
      yield* menubar.act({ type: "quit" });
      assert.deepEqual(calls, [
        'open-thread:{"environmentId":"env-1","threadId":"thread-1"}',
        "lock.open",
        "open-settings",
        "activate",
        "quit",
      ]);
    }).pipe(Effect.provide(layer)),
  );

  it.effect("saves the switch, and puts up no item off the Mac", () =>
    Effect.gen(function* () {
      const menubar = yield* DesktopMenubar.DesktopMenubar;
      yield* menubar.setEnabled(false);
      assert.isFalse((yield* (yield* DesktopAppSettings.DesktopAppSettings).get).menuBarIcon);
      yield* menubar.setEnabled(true);
      yield* menubar.start;
      assert.isTrue((yield* (yield* DesktopAppSettings.DesktopAppSettings).get).menuBarIcon);
    }).pipe(Effect.provide(layer)),
  );

  it.effect("loads the panel again when its process is killed", () => {
    const listeners = new Map<string, (...args: readonly unknown[]) => void>();
    const loadURL = vi.fn(() => Promise.resolve());
    const panel = {
      on: () => undefined,
      isDestroyed: () => false,
      loadURL,
      webContents: {
        on: (name: string, listener: (...args: readonly unknown[]) => void) =>
          listeners.set(name, listener),
        setWindowOpenHandler: () => undefined,
      },
    } as unknown as Electron.BrowserWindow;
    const onTheMac = DesktopMenubar.layer.pipe(
      Layer.provideMerge(
        Layer.mergeAll(
          Layer.succeed(
            DesktopEnvironment.DesktopEnvironment,
            DesktopEnvironment.DesktopEnvironment.of({
              platform: "darwin",
              isDevelopment: false,
              displayName: "Control",
              preloadPath: "/preload.js",
            } as DesktopEnvironment.DesktopEnvironment["Service"]),
          ),
          Layer.mock(DesktopAssets.DesktopAssets, {
            resolveResourcePath: () => Effect.succeed(Option.none<string>()),
          }),
          DesktopAppSettings.layerTest(),
          Layer.mock(ElectronApp.ElectronApp, {}),
          Layer.mock(ElectronWindow.ElectronWindow, {
            create: () => Effect.succeed(panel),
            setAuxiliary: () => Effect.void,
          }),
          Layer.mock(DesktopWindow.DesktopWindow, {}),
        ),
      ),
    );
    return Effect.gen(function* () {
      const menubar = yield* DesktopMenubar.DesktopMenubar;
      yield* menubar.start;
      assert.equal(loadURL.mock.calls.length, 1);

      listeners.get("render-process-gone")?.({}, { reason: "killed", exitCode: 15 });
      yield* TestClock.adjust(500);
      assert.deepEqual(loadURL.mock.calls[1], loadURL.mock.calls[0]);
    }).pipe(Effect.provide(onTheMac));
  });
});
