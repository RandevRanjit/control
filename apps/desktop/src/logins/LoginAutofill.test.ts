import * as NodeEvents from "node:events";

import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as TestClock from "effect/testing/TestClock";
import type * as Electron from "electron";

import * as LoginAutofill from "./LoginAutofill.ts";
import type { LoginFormKind, LoginFormRequest } from "./LoginForm.ts";
import * as LoginVault from "./LoginVault.ts";

const ORIGIN = "https://login.example.com";

/** A tab whose page shows the given form; `fills` holds what was typed into it. */
class FakeTab extends NodeEvents.EventEmitter {
  url: string;
  form: LoginFormKind | null = "credentials";
  readonly fills: Array<NonNullable<LoginFormRequest["fill"]> & { readonly origin: string }> = [];
  readonly session: { readonly isPersistent: () => boolean };
  /** Answers the next look at the page instead of `form`, for a page that changes in place. */
  afterFill: (() => void) | null = null;

  constructor(url = `${ORIGIN}/sso`, persistent = true) {
    super();
    this.url = url;
    this.session = { isPersistent: () => persistent };
  }

  readonly isDestroyed = () => false;
  readonly getURL = () => this.url;
  readonly executeJavaScriptInIsolatedWorld = async (
    _world: number,
    [script]: ReadonlyArray<{ readonly code: string }>,
  ) => {
    const request: LoginFormRequest = JSON.parse(
      script!.code.slice(script!.code.lastIndexOf("})(") + 3, -1),
    );
    if (request.fill && request.fill.kind === this.form) {
      this.fills.push({ ...request.fill, origin: request.origin });
      this.afterFill?.();
      return request.fill.kind;
    }
    return request.fill ? null : this.form;
  };
}

const asContents = (tab: FakeTab) => tab as unknown as Electron.WebContents;

const makeVault = (origins: ReadonlyArray<string> = [ORIGIN]) => {
  const refused = new Set<string>();
  const layer = Layer.mock(LoginVault.LoginVault)({
    list: Effect.sync(() =>
      origins.map((origin) => ({
        origin,
        username: "ada",
        lastUsedAt: null,
        refusedAt: refused.has(origin) ? "now" : null,
      })),
    ),
    credentials: (origin) =>
      Effect.sync(() =>
        refused.has(origin)
          ? Option.none()
          : Option.some({ username: "ada", password: "Sw0rdfish!" }),
      ),
    markRefused: (origin, value) =>
      Effect.sync(() => {
        if (value) refused.add(origin);
        else refused.delete(origin);
      }),
  });
  return { refused, layer };
};

const settle = Effect.gen(function* () {
  for (let turn = 0; turn < 20; turn += 1) yield* Effect.promise(() => Promise.resolve());
});

const withAutofill = <A, E>(
  vault: ReturnType<typeof makeVault>,
  body: (autofill: LoginAutofill.LoginAutofill["Service"]) => Effect.Effect<A, E>,
) =>
  Effect.flatMap(LoginAutofill.LoginAutofill, body).pipe(
    Effect.provide(LoginAutofill.layer.pipe(Layer.provide(vault.layer))),
  );

describe("LoginAutofill", () => {
  it.effect("signs in on the saved origin", () =>
    withAutofill(makeVault(), (autofill) =>
      Effect.gen(function* () {
        const tab = new FakeTab();
        autofill.watch(asContents(tab));
        tab.emit("dom-ready");
        yield* settle;
        assert.deepEqual(tab.fills, [
          { origin: ORIGIN, kind: "credentials", username: "ada", password: "Sw0rdfish!" },
        ]);
      }),
    ),
  );

  it.effect("never fills another origin, plain http, or Incognito", () =>
    withAutofill(makeVault([ORIGIN, "http://login.example.com"]), (autofill) =>
      Effect.gen(function* () {
        const tabs = [
          new FakeTab("https://example.com/"),
          new FakeTab("https://login.example.com.evil.example/"),
          new FakeTab("https://login.example.com:8443/"),
          new FakeTab("http://login.example.com/"),
          new FakeTab("about:blank"),
          new FakeTab(`data:text/html,${ORIGIN}`),
          new FakeTab(`${ORIGIN}/`, false),
        ];
        for (const tab of tabs) {
          autofill.watch(asContents(tab));
          tab.emit("dom-ready");
        }
        yield* settle;
        for (const tab of tabs) assert.deepEqual(tab.fills, [], tab.url);
      }),
    ),
  );

  it.effect("tries once, and stops everywhere when the page comes back asking again", () =>
    Effect.gen(function* () {
      const vault = makeVault();
      yield* withAutofill(vault, (autofill) =>
        Effect.gen(function* () {
          const tab = new FakeTab();
          const other = new FakeTab();
          autofill.watch(asContents(tab));
          autofill.watch(asContents(other));
          tab.emit("dom-ready");
          yield* settle;
          tab.emit("did-navigate-in-page", {}, tab.url, true);
          yield* settle;
          assert.equal(tab.fills.length, 1);
          assert.equal(vault.refused.size, 0, "the same page is not a second answer");

          yield* TestClock.adjust("5 seconds");
          tab.emit("dom-ready");
          yield* settle;
          assert.deepEqual([...vault.refused], [ORIGIN]);
          other.emit("dom-ready");
          tab.emit("dom-ready");
          yield* settle;
          assert.equal(tab.fills.length, 1);
          assert.equal(other.fills.length, 0);

          vault.refused.clear();
          yield* autofill.signInOpenTabs(ORIGIN);
          yield* settle;
          assert.equal(tab.fills.length, 2);
          assert.equal(other.fills.length, 1);
        }),
      );
    }),
  );

  it.effect("signs in again when the site's own session runs out later", () =>
    Effect.gen(function* () {
      const vault = makeVault();
      yield* withAutofill(vault, (autofill) =>
        Effect.gen(function* () {
          const tab = new FakeTab();
          autofill.watch(asContents(tab));
          tab.emit("dom-ready");
          yield* settle;
          yield* TestClock.adjust("31 seconds");
          tab.emit("dom-ready");
          yield* settle;
          assert.equal(tab.fills.length, 2);
          assert.equal(vault.refused.size, 0);
        }),
      );
    }),
  );

  it.effect("gives the name, then the password, when the site asks one at a time", () =>
    Effect.gen(function* () {
      const vault = makeVault();
      yield* withAutofill(vault, (autofill) =>
        Effect.gen(function* () {
          const inPlace = new FakeTab();
          inPlace.form = "username";
          inPlace.afterFill = () => {
            inPlace.form = "password";
            inPlace.afterFill = null;
          };
          autofill.watch(asContents(inPlace));
          inPlace.emit("dom-ready");
          yield* settle;
          assert.deepEqual(
            inPlace.fills.map((fill) => fill.kind),
            ["username", "password"],
          );
          assert.equal(vault.refused.size, 0);
        }),
      );
    }),
  );

  it.effect("follows the popup a sign-in opens", () =>
    withAutofill(makeVault(), (autofill) =>
      Effect.gen(function* () {
        const tab = new FakeTab("https://app.example.com/");
        const popup = new FakeTab();
        autofill.watch(asContents(tab));
        tab.emit("did-create-window", { webContents: asContents(popup) });
        popup.emit("dom-ready");
        yield* settle;
        assert.equal(popup.fills.length, 1);
      }),
    ),
  );
});
