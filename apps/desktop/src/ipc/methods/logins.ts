import { DesktopSavedLogin, DesktopSaveLoginInput } from "@control/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import * as LoginAutofill from "../../logins/LoginAutofill.ts";
import * as LoginVault from "../../logins/LoginVault.ts";
import * as IpcChannels from "../channels.ts";
import * as DesktopIpc from "../DesktopIpc.ts";

const OriginInput = Schema.Struct({ origin: Schema.String });

export const listLogins = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.LOGINS_LIST_CHANNEL,
  payload: Schema.Void,
  result: Schema.Array(DesktopSavedLogin),
  handler: Effect.fn("desktop.ipc.logins.list")(function* () {
    return yield* (yield* LoginVault.LoginVault).list;
  }),
});

export const saveLogin = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.LOGINS_SAVE_CHANNEL,
  payload: DesktopSaveLoginInput,
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.logins.save")(function* (input) {
    const origin = yield* (yield* LoginVault.LoginVault).save(input);
    yield* (yield* LoginAutofill.LoginAutofill).signInOpenTabs(origin);
  }),
});

export const removeLogin = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.LOGINS_REMOVE_CHANNEL,
  payload: OriginInput,
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.logins.remove")(function* ({ origin }) {
    yield* (yield* LoginVault.LoginVault).remove(origin);
  }),
});

export const retryLogin = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.LOGINS_RETRY_CHANNEL,
  payload: OriginInput,
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.logins.retry")(function* ({ origin }) {
    yield* (yield* LoginVault.LoginVault).markRefused(origin, false);
    yield* (yield* LoginAutofill.LoginAutofill).signInOpenTabs(origin);
  }),
});
