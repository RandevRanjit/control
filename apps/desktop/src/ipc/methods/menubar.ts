import { DesktopMenubarActionSchema, DesktopMenubarIconSchema } from "@control/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import * as DesktopMenubar from "../../menubar/DesktopMenubar.ts";
import * as DesktopAppSettings from "../../settings/DesktopAppSettings.ts";
import * as IpcChannels from "../channels.ts";
import { makeIpcMethod, makeSyncIpcMethod } from "../DesktopIpc.ts";

export const getMenubarEnabled = makeSyncIpcMethod({
  channel: IpcChannels.MENUBAR_GET_ENABLED_CHANNEL,
  result: Schema.Boolean,
  handler: Effect.fn("desktop.ipc.menubar.getEnabled")(function* () {
    return (yield* (yield* DesktopAppSettings.DesktopAppSettings).get).menuBarIcon;
  }),
});

export const setMenubarEnabled = makeIpcMethod({
  channel: IpcChannels.MENUBAR_SET_ENABLED_CHANNEL,
  payload: Schema.Boolean,
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.menubar.setEnabled")(function* (enabled) {
    yield* (yield* DesktopMenubar.DesktopMenubar).setEnabled(enabled);
  }),
});

export const setMenubarIcon = makeIpcMethod({
  channel: IpcChannels.MENUBAR_SET_ICON_CHANNEL,
  payload: DesktopMenubarIconSchema,
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.menubar.setIcon")(function* (icon) {
    yield* (yield* DesktopMenubar.DesktopMenubar).setIcon(icon);
  }),
});

export const resizeMenubar = makeIpcMethod({
  channel: IpcChannels.MENUBAR_RESIZE_CHANNEL,
  payload: Schema.Number.check(Schema.isBetween({ minimum: 1, maximum: 10_000 })),
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.menubar.resize")(function* (height) {
    yield* (yield* DesktopMenubar.DesktopMenubar).resize(height);
  }),
});

export const actMenubar = makeIpcMethod({
  channel: IpcChannels.MENUBAR_ACT_CHANNEL,
  payload: DesktopMenubarActionSchema,
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.menubar.act")(function* (action) {
    yield* (yield* DesktopMenubar.DesktopMenubar).act(action);
  }),
});
