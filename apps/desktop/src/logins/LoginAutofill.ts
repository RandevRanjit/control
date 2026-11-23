import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type * as Electron from "electron";

import { loginFormCode, type LoginFormKind, type LoginFormRequest } from "./LoginForm.ts";
import * as LoginVault from "./LoginVault.ts";

const LOGIN_WORLD_ID = 1003;
const FORM_WAIT_MS = 10_000;
const FILL_WAIT_MS = 2_000;
/** A page asking for the same thing again this soon turned the login down. */
const REFUSAL_WINDOW_MS = 30_000;

interface Attempt {
  readonly origin: string;
  readonly at: number;
  readonly kinds: ReadonlyArray<LoginFormKind>;
}

const FORM_KINDS: ReadonlyArray<unknown> = [
  "credentials",
  "password",
  "username",
] satisfies ReadonlyArray<LoginFormKind>;
const isFormKind = (value: unknown): value is LoginFormKind => FORM_KINDS.includes(value);

const pageOrigin = (contents: Electron.WebContents) => {
  if (contents.isDestroyed()) return null;
  const url = URL.parse(contents.getURL());
  return url?.protocol === "https:" ? url.origin : null;
};

/**
 * Signs browser tabs in with the owner's saved logins, whoever is driving the tab: the saved
 * origin's own page over https, never a frame, never Incognito. One try per page. A site that asks
 * for the same thing again within half a minute has turned the login down, and it is left alone
 * until the owner saves it again or retries it.
 */
export class LoginAutofill extends Context.Service<
  LoginAutofill,
  {
    /** Follows a tab, and any popup it opens, until it closes. */
    readonly watch: (contents: Electron.WebContents) => void;
    /** Signs in the tabs already waiting on this origin, after its login was saved or retried. */
    readonly signInOpenTabs: (origin: string) => Effect.Effect<void>;
  }
>()("@control/desktop/logins/LoginAutofill") {}

/** @public Service construction is part of the canonical Effect module API. */
export const make = Effect.gen(function* () {
  const vault = yield* LoginVault.LoginVault;
  const runFork = Effect.runForkWith(yield* Effect.context<never>());
  const tabs = new Map<Electron.WebContents, { readonly signInAgain: () => void }>();

  // A page that navigates away never settles its script, so the wait ends here.
  const ask = (contents: Electron.WebContents, request: LoginFormRequest) =>
    Effect.tryPromise(() =>
      contents.executeJavaScriptInIsolatedWorld(LOGIN_WORLD_ID, [{ code: loginFormCode(request) }]),
    ).pipe(
      Effect.timeoutOption(Duration.millis(request.waitMs + FILL_WAIT_MS)),
      Effect.map(Option.filter(isFormKind)),
      Effect.orElseSucceed(() => Option.none<LoginFormKind>()),
    );

  const watch = (contents: Electron.WebContents) => {
    if (tabs.has(contents) || !contents.session.isPersistent()) return;
    let attempt: Attempt | null = null;
    let running: Fiber.Fiber<void> | null = null;

    const signIn = Effect.fn("LoginAutofill.signIn")(function* (
      newDocument: boolean,
    ): Effect.fn.Return<void, LoginVault.LoginVaultError> {
      const origin = pageOrigin(contents);
      if (origin === null) return;
      if (!(yield* vault.list).some((login) => login.origin === origin)) return;

      const form = yield* ask(contents, { origin, waitMs: FORM_WAIT_MS });
      if (Option.isNone(form)) return;
      const kind = form.value;
      const now = yield* Clock.currentTimeMillis;
      const recent =
        attempt?.origin === origin && now - attempt.at < REFUSAL_WINDOW_MS ? attempt : null;
      if (recent?.kinds.includes(kind)) {
        if (newDocument) yield* vault.markRefused(origin, true);
        return;
      }

      const credentials = yield* vault.credentials(origin);
      if (Option.isNone(credentials)) return;
      attempt = { origin, at: now, kinds: [...(recent?.kinds ?? []), kind] };
      yield* ask(contents, {
        origin,
        waitMs: FILL_WAIT_MS,
        fill: { kind, ...credentials.value },
      });
      // Some pages ask for the password in place, without loading another.
      if (kind === "username") yield* signIn(false);
    });

    const start = (newDocument: boolean) => {
      if (running && newDocument) runFork(Fiber.interrupt(running));
      const fiber = runFork(
        signIn(newDocument).pipe(
          Effect.catchCause((cause) => Effect.logWarning("A saved login was not used.", cause)),
        ),
      );
      running = fiber;
      fiber.addObserver(() => {
        if (running === fiber) running = null;
      });
    };

    contents.on("dom-ready", () => start(true));
    contents.on("did-navigate-in-page", (_event, _url, isMainFrame) => {
      if (isMainFrame && running === null) start(false);
    });
    contents.on("did-create-window", (window) => watch(window.webContents));
    contents.once("destroyed", () => tabs.delete(contents));
    tabs.set(contents, {
      signInAgain: () => {
        attempt = null;
        start(true);
      },
    });
  };

  return LoginAutofill.of({
    watch,
    signInOpenTabs: (origin) =>
      Effect.sync(() => {
        for (const [contents, tab] of tabs) if (pageOrigin(contents) === origin) tab.signInAgain();
      }),
  });
});

export const layer = Layer.effect(LoginAutofill, make);
