// @effect-diagnostics globalDate:off -- The item's click and the panel's blur are Electron events, outside any Effect runtime.

import {
  type DesktopMenubarAction,
  type DesktopMenubarIcon,
  OPEN_THREAD_MENU_ACTION,
} from "@control/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import * as Electron from "electron";

import * as DesktopAssets from "../app/DesktopAssets.ts";
import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";
import * as ElectronApp from "../electron/ElectronApp.ts";
import { getDesktopUrl } from "../electron/ElectronProtocol.ts";
import * as ElectronWindow from "../electron/ElectronWindow.ts";
import * as DesktopAppSettings from "../settings/DesktopAppSettings.ts";
import * as DesktopWindow from "../window/DesktopWindow.ts";

const PANEL_WIDTH = 360;
// A click on the item while the panel is open blurs the panel first; that click only closes it.
const REOPEN_AFTER_BLUR_MS = 300;

type Rectangle = Pick<Electron.Rectangle, "x" | "y" | "width" | "height">;

/**
 * Where the panel hangs (design/hybrid/HANDOFF.md §19.2): 6 px under the item, centred on it and
 * kept on screen, as tall as its content up to the screen's visible height less 40.
 */
export function menubarPanelBounds(input: {
  readonly item: Rectangle;
  readonly workArea: Rectangle;
  readonly height: number;
}): Rectangle {
  const { item, workArea } = input;
  const centred = Math.round(item.x + item.width / 2 - PANEL_WIDTH / 2);
  return {
    x: Math.min(Math.max(centred, workArea.x), workArea.x + workArea.width - PANEL_WIDTH),
    y: item.y + item.height + 6,
    width: PANEL_WIDTH,
    height: Math.max(1, Math.min(Math.round(input.height), workArea.height - 40)),
  };
}

const openThreadMenuAction = (environmentId: string, threadId: string) =>
  `${OPEN_THREAD_MENU_ACTION}${JSON.stringify({ environmentId, threadId })}`;

/** The template image for an icon, in `resources/menubar` (§19.1). */
export const menubarImageName = (icon: Pick<DesktopMenubarIcon, "state" | "update">) =>
  `menubar/${icon.state}${icon.update ? "-update" : ""}Template.png`;

export class DesktopMenubar extends Context.Service<
  DesktopMenubar,
  {
    /** Puts the item up when Settings › General's switch is on. The Mac only. */
    readonly start: Effect.Effect<void, ElectronWindow.ElectronWindowCreateError>;
    readonly setEnabled: (
      enabled: boolean,
    ) => Effect.Effect<
      void,
      DesktopAppSettings.DesktopSettingsWriteError | ElectronWindow.ElectronWindowCreateError
    >;
    readonly setIcon: (icon: DesktopMenubarIcon) => Effect.Effect<void>;
    readonly resize: (height: number) => Effect.Effect<void>;
    readonly act: (
      action: DesktopMenubarAction,
    ) => Effect.Effect<void, DesktopWindow.DesktopWindowError>;
  }
>()("@control/desktop/menubar/DesktopMenubar") {}

interface Item {
  readonly tray: Electron.Tray;
  readonly panel: Electron.BrowserWindow;
}

/** @public Service construction is part of the canonical Effect module API. */
export const make = Effect.gen(function* () {
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  const assets = yield* DesktopAssets.DesktopAssets;
  const settings = yield* DesktopAppSettings.DesktopAppSettings;
  const electronApp = yield* ElectronApp.ElectronApp;
  const electronWindow = yield* ElectronWindow.ElectronWindow;
  const desktopWindow = yield* DesktopWindow.DesktopWindow;
  let item: Item | null = null;
  let height = 120;
  let hiddenAt = 0;

  const imagePath = (icon: Pick<DesktopMenubarIcon, "state" | "update">) =>
    assets.resolveResourcePath(menubarImageName(icon)).pipe(
      Effect.map(Option.getOrNull),
      Effect.orElseSucceed(() => null),
    );

  /** Moves the panel under the item; a window already there isn't touched. Says whether it moved. */
  const place = ({ tray, panel }: Item) => {
    const itemBounds = tray.getBounds();
    const { workArea } = Electron.screen.getDisplayMatching(itemBounds);
    const next = menubarPanelBounds({ item: itemBounds, workArea, height });
    const current = panel.getBounds();
    if (
      next.x === current.x &&
      next.y === current.y &&
      next.width === current.width &&
      next.height === current.height
    ) {
      return false;
    }
    panel.setBounds(next);
    return true;
  };

  const hide = (panel: Electron.BrowserWindow) => {
    if (panel.isDestroyed() || !panel.isVisible()) return;
    panel.hide();
    hiddenAt = Date.now();
  };

  const show = Effect.gen(function* () {
    if (item !== null) return;
    const idle = yield* imagePath({ state: "idle", update: false });
    const panel = yield* electronWindow.create({
      width: PANEL_WIDTH,
      height,
      show: false,
      frame: false,
      transparent: true,
      // An NSPanel that doesn't activate the app, so the window stays where it is.
      type: "panel",
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: true,
      title: environment.displayName,
      webPreferences: {
        preload: environment.preloadPath,
        // Hidden nearly all the time, yet it keeps the item current and times its 2 s settle.
        backgroundThrottling: false,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    yield* electronWindow.setAuxiliary(panel);
    const tray = new Electron.Tray(idle ?? Electron.nativeImage.createEmpty());
    tray.setIgnoreDoubleClickEvents(true);
    const created: Item = { tray, panel };
    item = created;

    panel.on("blur", () => hide(panel));
    tray.on("click", () => {
      if (panel.isDestroyed()) return;
      if (panel.isVisible()) return hide(panel);
      if (Date.now() - hiddenAt < REOPEN_AFTER_BLUR_MS) return;
      place(created);
      panel.show();
    });
    panel.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    panel.webContents.on("will-navigate", (event) => event.preventDefault());
    // The renderer routes on the hash in Electron (apps/web/src/main.tsx).
    void panel
      .loadURL(`${getDesktopUrl(environment.isDevelopment)}#/menubar`)
      .catch(() => undefined);
  });

  const destroy = Effect.sync(() => {
    if (item === null) return;
    item.tray.destroy();
    if (!item.panel.isDestroyed()) item.panel.destroy();
    item = null;
  });

  const closePanel = Effect.sync(() => {
    if (item !== null) hide(item.panel);
  });

  return DesktopMenubar.of({
    start: Effect.gen(function* () {
      if (environment.platform !== "darwin" || !(yield* settings.get).menuBarIcon) return;
      yield* show;
    }).pipe(Effect.withSpan("desktop.menubar.start")),
    setEnabled: Effect.fn("desktop.menubar.setEnabled")(function* (enabled) {
      yield* settings.setMenuBarIcon(enabled);
      if (environment.platform !== "darwin") return;
      yield* enabled ? show : destroy;
    }),
    setIcon: Effect.fn("desktop.menubar.setIcon")(function* (icon) {
      const path = yield* imagePath(icon);
      if (item === null || path === null) return;
      item.tray.setImage(path);
      item.tray.setTitle(icon.title, { fontType: "monospacedDigit" });
    }),
    resize: (next) =>
      Effect.gen(function* () {
        height = next;
        const moved = item !== null && !item.panel.isDestroyed() && place(item);
        yield* Effect.annotateCurrentSpan({ "menubar.height": next, "menubar.moved": moved });
      }),
    act: Effect.fn("desktop.menubar.act")(function* (action) {
      yield* Effect.annotateCurrentSpan({ action: action.type });
      yield* closePanel;
      switch (action.type) {
        case "thread":
          return yield* desktopWindow.dispatchMenuAction(
            openThreadMenuAction(action.environmentId, action.threadId),
          );
        case "lock":
          return yield* desktopWindow.dispatchMenuAction("lock.open");
        case "settings":
          return yield* desktopWindow.dispatchMenuAction("open-settings");
        case "open":
          return yield* desktopWindow.activate;
        case "quit":
          return yield* electronApp.quit;
        case "close":
          return;
      }
    }),
  });
});

export const layer = Layer.effect(DesktopMenubar, make);
