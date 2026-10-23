import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Scope from "effect/Scope";

import { providerAuthReturnUrl } from "@control/shared/providerAuthReturnUrl";
import * as ElectronApp from "../electron/ElectronApp.ts";
import * as ElectronProtocol from "../electron/ElectronProtocol.ts";
import * as ElectronWindow from "../electron/ElectronWindow.ts";
import * as DesktopUserData from "./DesktopUserData.ts";
import * as DesktopEnvironment from "./DesktopEnvironment.ts";

/**
 * Routes provider auth return deep links and second launches to the running
 * app.
 */
export class DesktopDeepLinks extends Context.Service<
  DesktopDeepLinks,
  {
    readonly configure: Effect.Effect<
      void,
      never,
      ElectronApp.ElectronApp | ElectronWindow.ElectronWindow | Scope.Scope
    >;
  }
>()("@control/desktop/app/DesktopDeepLinks") {}

/** @public Service construction is part of the canonical Effect module API. */
export const make = Effect.gen(function* () {
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  const electronApp = yield* ElectronApp.ElectronApp;

  // Must not yield: Electron only forwards second launches to a process that
  // takes the lock before it is ready.
  const userDataPath = yield* DesktopUserData.resolveUserDataPath(environment);
  yield* electronApp.setPath("userData", userDataPath);

  // macOS hands a second launch to the running app as open-url; elsewhere the
  // single-instance lock forwards it as second-instance.
  const isPrimaryInstance = yield* Effect.acquireRelease(
    environment.platform === "darwin"
      ? Effect.succeed(true)
      : electronApp.requestSingleInstanceLock,
    (locked) =>
      locked && environment.platform !== "darwin"
        ? electronApp.releaseSingleInstanceLock
        : Effect.void,
  );
  if (isPrimaryInstance) {
    yield* electronApp.setAsDefaultProtocolClient(
      ElectronProtocol.getDesktopScheme(environment.isDevelopment),
    );
  } else {
    yield* electronApp.quit;
  }

  return DesktopDeepLinks.of({
    configure: Effect.gen(function* () {
      const electronApp = yield* ElectronApp.ElectronApp;
      const electronWindow = yield* ElectronWindow.ElectronWindow;
      const context = yield* Effect.context<ElectronWindow.ElectronWindow>();
      const runPromise = Effect.runPromiseWith(context);

      // A secondary instance has already begun quitting; app.quit() is
      // asynchronous, so stop bootstrap here before whenReady can fire.
      if (!isPrimaryInstance) {
        yield* electronApp.quit;
        return yield* Effect.interrupt;
      }

      const resumeProviderAuth = (value: string | undefined) => {
        const destination = providerAuthReturnUrl(value);
        const expectedOrigin = `${ElectronProtocol.getDesktopScheme(environment.isDevelopment)}://app`;
        if (!destination?.startsWith(`${expectedOrigin}/`)) return false;
        void runPromise(
          Effect.gen(function* () {
            const mainWindow = yield* electronWindow.currentMainOrFirst;
            if (Option.isNone(mainWindow)) return;
            yield* Effect.promise(() => mainWindow.value.loadURL(destination));
            yield* electronWindow.reveal(mainWindow.value);
          }).pipe(
            Effect.catchCause((cause) =>
              Effect.logWarning("Could not return to provider setup", cause),
            ),
          ),
        );
        return true;
      };
      yield* electronApp.on("open-url", (event: { preventDefault: () => void }, url: string) => {
        if (resumeProviderAuth(url)) event.preventDefault();
      });
      yield* electronApp.on("second-instance", (_event: unknown, argv: readonly string[]) => {
        if (argv?.some((value) => resumeProviderAuth(value))) return;
        void runPromise(
          Effect.gen(function* () {
            const mainWindow = yield* electronWindow.currentMainOrFirst;
            if (Option.isSome(mainWindow)) yield* electronWindow.reveal(mainWindow.value);
          }),
        );
      });
    }).pipe(Effect.withSpan("desktop.deepLinks.configure")),
  });
});

export const layer = Layer.effect(DesktopDeepLinks, make);
