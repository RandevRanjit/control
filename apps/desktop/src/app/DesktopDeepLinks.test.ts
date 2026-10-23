import * as NodePath from "@effect/platform-node/NodePath";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { vi } from "vite-plus/test";

import * as Option from "effect/Option";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as ElectronApp from "../electron/ElectronApp.ts";
import * as ElectronShell from "../electron/ElectronShell.ts";
import * as ElectronWindow from "../electron/ElectronWindow.ts";
import * as DesktopDeepLinks from "./DesktopDeepLinks.ts";
import * as DesktopEnvironment from "./DesktopEnvironment.ts";
import * as DesktopPreReadyFileSystem from "./DesktopPreReadyFileSystem.ts";

const layerDesktopDeepLinks = (
  isDevelopment = true,
  events: string[] = [],
  platform: NodeJS.Platform = "darwin",
  fileSystemLayer: Layer.Layer<FileSystem.FileSystem> = FileSystem.layerNoop({
    exists: () => Effect.succeed(false),
  }),
  shell: ElectronShell.ElectronShell["Service"] = {
    openExternal: () => Effect.succeed(true),
    openSystemSettings: () => Effect.succeed(false),
    copyText: () => Effect.void,
  },
  lockGranted = true,
) => {
  const environment = DesktopEnvironment.DesktopEnvironment.of({
    stateDir: "/tmp/control-state",
    isDevelopment,
    appDataDirectory: "/tmp/app-data",
    platform,
  } as unknown as DesktopEnvironment.DesktopEnvironment["Service"]);

  const electronApp = {
    setPath: (name: string, value: string) =>
      Effect.sync(() => {
        events.push(`setPath:${name}:${value}`);
      }),
    requestSingleInstanceLock: Effect.sync(() => {
      events.push("requestSingleInstanceLock");
      return lockGranted;
    }),
    releaseSingleInstanceLock: Effect.sync(() => {
      events.push("releaseSingleInstanceLock");
    }),
    setAsDefaultProtocolClient: (protocol: string) =>
      Effect.sync(() => {
        events.push(`setAsDefaultProtocolClient:${protocol}`);
        return true;
      }),
    quit: Effect.sync(() => {
      events.push("quit");
    }),
  } as unknown as ElectronApp.ElectronApp["Service"];

  return DesktopDeepLinks.layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        NodePath.layerPosix,
        Layer.succeed(DesktopEnvironment.DesktopEnvironment, environment),
        Layer.succeed(ElectronApp.ElectronApp, electronApp),
        Layer.succeed(ElectronShell.ElectronShell, shell),
        fileSystemLayer,
      ),
    ),
  );
};

describe("DesktopDeepLinks", () => {
  it.effect("takes the lock after userData and releases it with the layer", () => {
    const events: string[] = [];

    return Effect.gen(function* () {
      yield* Effect.scoped(Layer.build(layerDesktopDeepLinks(true, events, "linux")));

      // The lock both lives in and creates the userData directory, so the
      // real path must be set before it is taken.
      assert.deepEqual(events, [
        "setPath:userData:/tmp/app-data/control-dev",
        "requestSingleInstanceLock",
        "setAsDefaultProtocolClient:ctrl-dev",
        "releaseSingleInstanceLock",
      ]);
    });
  });

  it.effect("leaves second launches to open-url on macOS", () => {
    const events: string[] = [];

    return Effect.gen(function* () {
      yield* Effect.scoped(Layer.build(layerDesktopDeepLinks(false, events, "darwin")));

      assert.deepEqual(events, [
        "setPath:userData:/tmp/app-data/control-desktop",
        "setAsDefaultProtocolClient:ctrl",
      ]);
    });
  });

  it.effect("quits a secondary instance without claiming the scheme", () => {
    const events: string[] = [];

    return Effect.gen(function* () {
      yield* Effect.scoped(
        Layer.build(layerDesktopDeepLinks(true, events, "linux", undefined, undefined, false)),
      );

      assert.deepEqual(events, [
        "setPath:userData:/tmp/app-data/control-dev",
        "requestSingleInstanceLock",
        "quit",
      ]);
    });
  });

  it.each([
    {
      name: "packaged Windows",
      isDevelopment: false,
      platform: "win32" as const,
      userData: "/tmp/app-data/control-desktop",
      scheme: "ctrl",
    },
    {
      name: "development",
      isDevelopment: true,
      platform: "win32" as const,
      userData: "/tmp/app-data/control-dev",
      scheme: "ctrl-dev",
    },
  ])(
    "takes the lock before startup can yield to the event loop ($name)",
    ({ isDevelopment, platform, userData, scheme }) => {
      const events: string[] = [];
      // runSync throws if the layer ever suspends, which would let Electron emit
      // ready before the lock is held. main.ts provides the same FileSystem.
      // oxlint-disable-next-line control/no-manual-effect-runtime-in-tests -- The assertion IS that the layer builds synchronously; it.effect would mask a regression to async.
      Effect.runSync(
        Effect.scoped(
          Layer.build(
            layerDesktopDeepLinks(isDevelopment, events, platform, DesktopPreReadyFileSystem.layer),
          ),
        ),
      );

      assert.deepEqual(events.slice(0, 3), [
        `setPath:userData:${userData}`,
        "requestSingleInstanceLock",
        `setAsDefaultProtocolClient:${scheme}`,
      ]);
    },
  );

  it.effect("registers the second-instance handler in the primary instance", () => {
    const quit = vi.fn();
    const registeredEvents: string[] = [];
    const electronApp = {
      quit: Effect.sync(quit),
      on: (eventName: string) =>
        Effect.sync(() => {
          registeredEvents.push(eventName);
        }),
    } as unknown as ElectronApp.ElectronApp["Service"];
    const electronWindow = {} as ElectronWindow.ElectronWindow["Service"];

    return Effect.gen(function* () {
      const deepLinks = yield* DesktopDeepLinks.DesktopDeepLinks;
      const exit = yield* Effect.exit(Effect.scoped(deepLinks.configure));

      assert.isTrue(Exit.isSuccess(exit));
      assert.equal(quit.mock.calls.length, 0);
      assert.deepEqual(registeredEvents, ["open-url", "second-instance"]);
    }).pipe(
      Effect.provide(layerDesktopDeepLinks()),
      Effect.provideService(ElectronApp.ElectronApp, electronApp),
      Effect.provideService(ElectronWindow.ElectronWindow, electronWindow),
    );
  });

  it.effect("quits and interrupts startup in a secondary instance", () => {
    const quit = vi.fn();
    const registeredEvents: string[] = [];
    const electronApp = {
      quit: Effect.sync(quit),
      on: (eventName: string) =>
        Effect.sync(() => {
          registeredEvents.push(eventName);
        }),
    } as unknown as ElectronApp.ElectronApp["Service"];
    const electronWindow = {} as ElectronWindow.ElectronWindow["Service"];

    return Effect.gen(function* () {
      const deepLinks = yield* DesktopDeepLinks.DesktopDeepLinks;
      const exit = yield* Effect.exit(Effect.scoped(deepLinks.configure));

      assert.isTrue(Exit.hasInterrupts(exit));
      assert.equal(quit.mock.calls.length, 1);
      assert.deepEqual(registeredEvents, []);
    }).pipe(
      Effect.provide(layerDesktopDeepLinks(true, [], "linux", undefined, undefined, false)),
      Effect.provideService(ElectronApp.ElectronApp, electronApp),
      Effect.provideService(ElectronWindow.ElectronWindow, electronWindow),
    );
  });
});

it.effect(
  "provider auth deep links navigate and reveal the running desktop without handling other URLs",
  () => {
    const listeners = new Map<string, (...args: unknown[]) => void>();
    const revealed = Promise.withResolvers<void>();
    const loadURL = vi.fn(async (_url: string) => undefined);
    const window = { loadURL };
    const electronApp = {
      on: (name: string, listener: (...args: unknown[]) => void) =>
        Effect.sync(() => {
          listeners.set(name, listener);
        }),
    } as unknown as ElectronApp.ElectronApp["Service"];
    const electronWindow = {
      currentMainOrFirst: Effect.succeed(Option.some(window)),
      reveal: () => Effect.sync(() => revealed.resolve()),
    } as unknown as ElectronWindow.ElectronWindow["Service"];
    return Effect.gen(function* () {
      const deepLinks = yield* DesktopDeepLinks.DesktopDeepLinks;
      yield* deepLinks.configure;
      const event = { preventDefault: vi.fn() };
      listeners.get("open-url")!(event, "ctrl-dev://app/auth/callback?code=other-code");
      listeners.get("open-url")!(event, "ctrl://app/welcome");
      assert.equal(loadURL.mock.calls.length, 0);
      assert.equal(event.preventDefault.mock.calls.length, 0);
      listeners.get("second-instance")!({}, [
        "control",
        "ctrl-dev://app/settings/providers?instanceId=work&code=never-forward",
      ]);
      yield* Effect.promise(() => revealed.promise);
      assert.deepEqual(loadURL.mock.calls, [["ctrl-dev://app/settings/providers?instanceId=work"]]);
      listeners.get("open-url")!(event, "ctrl-dev://app/welcome#agents:machine-id");
      assert.equal(event.preventDefault.mock.calls.length, 1);
    }).pipe(
      Effect.scoped,
      Effect.provide(layerDesktopDeepLinks()),
      Effect.provideService(ElectronApp.ElectronApp, electronApp),
      Effect.provideService(ElectronWindow.ElectronWindow, electronWindow),
    );
  },
);
