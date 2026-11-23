import { assert, describe, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import { vi } from "vite-plus/test";

import * as DesktopIpc from "./DesktopIpc.ts";

const invokeMethod: DesktopIpc.DesktopIpcMethod<never, never> = {
  channel: "desktop.test.invoke",
  handler: () => Effect.void,
};

const syncMethod: DesktopIpc.DesktopSyncIpcMethod<never, never> = {
  channel: "desktop.test.sync",
  handler: () => Effect.void,
};

function makeIpcMain(
  overrides: Partial<DesktopIpc.DesktopIpcMain> = {},
): DesktopIpc.DesktopIpcMain {
  return {
    removeHandler: vi.fn(),
    handle: vi.fn(),
    removeAllListeners: vi.fn(),
    on: vi.fn(),
    ...overrides,
  };
}

describe("DesktopIpc", () => {
  it.effect("preserves invoke registration context and cause", () =>
    Effect.gen(function* () {
      const cause = new Error("invoke registration failed");
      const ipcMain = makeIpcMain({
        handle: () => {
          throw cause;
        },
      });
      const ipc = DesktopIpc.make(ipcMain, () => true);

      const error = yield* Effect.flip(Effect.scoped(ipc.handle(invokeMethod)));

      assert.instanceOf(error, DesktopIpc.DesktopIpcRegistrationError);
      assert.strictEqual(error.handlerKind, "invoke");
      assert.strictEqual(error.channel, invokeMethod.channel);
      assert.strictEqual(error.cause, cause);
      assert.include(error.message, "invoke");
      assert.include(error.message, invokeMethod.channel);
      assert.notInclude(error.message, cause.message);
    }),
  );

  it.effect("forwards the invoke sender to the method", () =>
    Effect.gen(function* () {
      let listener: DesktopIpc.DesktopIpcHandleListener | undefined;
      const ipc = DesktopIpc.make(
        makeIpcMain({
          handle: (_channel, registered) => {
            listener = registered;
          },
        }),
        () => true,
      );
      const sender = { sender: { id: 7 } };
      let received: DesktopIpc.DesktopIpcInvokeEvent | undefined;

      yield* Effect.scoped(
        Effect.gen(function* () {
          yield* ipc.handle({
            channel: "desktop.test.sender",
            handler: (_raw, event) =>
              Effect.sync(() => {
                received = event;
              }),
          });
          yield* Effect.promise(async () => listener!(sender, undefined));
        }),
      );

      assert.strictEqual(received, sender);
    }),
  );

  it.effect("refuses a page's calls and never runs the method", () =>
    Effect.gen(function* () {
      let invoke: DesktopIpc.DesktopIpcHandleListener | undefined;
      let sync: DesktopIpc.DesktopIpcSyncListener | undefined;
      const ran: Array<string> = [];
      const ipc = DesktopIpc.make(
        makeIpcMain({
          handle: (_channel, registered) => {
            invoke = registered;
          },
          on: (_channel, registered) => {
            sync = registered;
          },
        }),
        ({ id }) => id === 1,
      );

      yield* Effect.scoped(
        Effect.gen(function* () {
          yield* ipc.handle({
            channel: "desktop.test.token",
            handler: () => Effect.sync(() => ran.push("invoke")).pipe(Effect.as("token")),
          });
          yield* ipc.handleSync({
            channel: "desktop.test.sync",
            handler: () => Effect.sync(() => ran.push("sync")).pipe(Effect.as("branding")),
          });

          const refused = yield* Effect.promise(() =>
            Promise.resolve(invoke!({ sender: { id: 2 } }, undefined)).catch((error) => error),
          );
          assert.instanceOf(refused, DesktopIpc.DesktopIpcSenderError);
          const page = { sender: { id: 2 }, returnValue: undefined as unknown };
          sync!(page);
          assert.strictEqual(page.returnValue, null);
          assert.deepEqual(ran, []);

          const app = { sender: { id: 1 }, returnValue: undefined as unknown };
          sync!(app);
          assert.strictEqual(app.returnValue, "branding");
          const answered = yield* Effect.promise(() =>
            Promise.resolve(invoke!({ sender: { id: 1 } }, undefined)),
          );
          assert.strictEqual(answered, "token");
          assert.deepEqual(ran, ["sync", "invoke"]);
        }),
      );
    }),
  );

  it.effect("preserves sync unregistration context and cause in the finalizer defect", () =>
    Effect.gen(function* () {
      const cause = new Error("sync unregistration failed");
      let removeCount = 0;
      const ipcMain = makeIpcMain({
        removeAllListeners: () => {
          removeCount += 1;
          if (removeCount === 2) throw cause;
        },
      });
      const ipc = DesktopIpc.make(ipcMain, () => true);

      const exit = yield* Effect.exit(Effect.scoped(ipc.handleSync(syncMethod)));

      assert.isTrue(exit._tag === "Failure");
      if (exit._tag === "Success") return;
      const error = Cause.squash(exit.cause);
      assert.instanceOf(error, DesktopIpc.DesktopIpcUnregistrationError);
      assert.strictEqual(error.handlerKind, "sync");
      assert.strictEqual(error.channel, syncMethod.channel);
      assert.strictEqual(error.cause, cause);
      assert.notInclude(error.message, cause.message);
    }),
  );
});
