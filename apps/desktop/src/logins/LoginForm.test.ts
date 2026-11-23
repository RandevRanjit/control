import * as NodeModule from "node:module";

import { describe, expect, it } from "vite-plus/test";

import { loginFormCode, type LoginFormKind, type LoginFormRequest } from "./LoginForm.ts";

type PageWindow = Window & typeof globalThis;
const require = NodeModule.createRequire(import.meta.url);
const { JSDOM } = require("jsdom") as {
  readonly JSDOM: new (
    html: string,
    options: {
      readonly url: string;
      readonly runScripts: "outside-only";
      readonly pretendToBeVisual: boolean;
    },
  ) => { readonly window: PageWindow };
};

const ORIGIN = "https://login.example.com";
const fill = (kind: LoginFormKind) => ({ kind, username: "ada", password: "Sw0rdfish!" });

/** A page the code runs in. `[hidden]` is not shown; `submitted` holds each form it sent. */
function page(html: string, url = `${ORIGIN}/sso`) {
  const { window } = new JSDOM(html, { url, runScripts: "outside-only", pretendToBeVisual: true });
  window.Element.prototype.checkVisibility = function (this: Element) {
    return this.closest("[hidden]") === null;
  };
  const submitted: Array<Record<string, FormDataEntryValue>> = [];
  window.document.addEventListener("submit", (event) => {
    event.preventDefault();
    submitted.push(Object.fromEntries(new window.FormData(event.target as HTMLFormElement)));
  });
  return {
    window,
    submitted,
    run: (request: Partial<LoginFormRequest> = {}): Promise<LoginFormKind | null> =>
      window.eval(loginFormCode({ origin: ORIGIN, waitMs: 0, ...request })),
  };
}

const LOGIN = `<form action="/login" method="post">
  <input type="search" name="q"><input type="hidden" name="token" value="t">
  <input name="username" type="text"><input name="password" type="password">
  <button type="button">Show</button><button>Log in</button></form>`;

describe("loginFormCode", () => {
  it("fills the saved login and sends the form as the page would", async () => {
    const { run, submitted, window } = page(LOGIN);
    const seen: string[] = [];
    window.document.addEventListener("input", (event) =>
      seen.push((event.target as HTMLInputElement).name),
    );
    expect(await run()).toBe("credentials");
    expect(submitted).toEqual([]);
    expect(await run({ fill: fill("credentials") })).toBe("credentials");
    expect(submitted).toEqual([{ q: "", token: "t", username: "ada", password: "Sw0rdfish!" }]);
    expect(seen).toEqual(["username", "password"]);
  });

  it("signs in a step at a time", async () => {
    const name = page(`<form><input type="text" autocomplete="username webauthn" name="u">
      <button>Next</button></form>`);
    expect(await name.run({ fill: fill("username") })).toBe("username");
    expect(name.submitted).toEqual([{ u: "ada" }]);
    const password = page(`<form><input type="password" name="p"><input type="submit"></form>`);
    expect(await password.run({ fill: fill("password") })).toBe("password");
    expect(password.submitted).toEqual([{ p: "Sw0rdfish!" }]);
  });

  it("works without a form, leaving the button to whoever is driving", async () => {
    const { run, window } = page(
      `<input name="u"><input type="password" name="p"><button>Go</button>`,
    );
    expect(await run({ fill: fill("credentials") })).toBe("credentials");
    const value = (name: string) =>
      window.document.querySelector<HTMLInputElement>(`[name=${name}]`)?.value;
    expect([value("u"), value("p")]).toEqual(["ada", "Sw0rdfish!"]);
  });

  it.each([
    [
      "a sign-up form",
      `<form><input name="u"><input type="password" autocomplete="new-password"></form>`,
    ],
    ["a change-password form", `<form><input type="password"><input type="password"></form>`],
    [
      "a password someone typed",
      `<form><input name="u"><input type="password" value="mine"></form>`,
    ],
    ["a name someone typed", `<form><input autocomplete="username" value="me"></form>`],
    ["a hidden form", `<form hidden><input name="u"><input type="password"></form>`],
    ["a disabled field", `<form><input name="u"><input type="password" disabled></form>`],
    ["a newsletter box", `<form><input type="email" autocomplete="email"></form>`],
    ["no form at all", `<p>Welcome back</p>`],
  ])("leaves %s alone", async (_name, html) => {
    const { run, submitted } = page(html);
    expect(await run()).toBeNull();
    for (const kind of ["credentials", "password", "username"] as const) {
      expect(await run({ fill: fill(kind) })).toBeNull();
    }
    expect(submitted).toEqual([]);
  });

  it("never types on another origin, or into a form that posts without https", async () => {
    const values = (window: PageWindow) =>
      [...window.document.querySelectorAll("input")].map((input) => input.value).join("");
    const elsewhere = page(LOGIN, "https://evil.example/sso");
    expect(await elsewhere.run({ fill: fill("credentials") })).toBeNull();
    expect(values(elsewhere.window)).toBe("t");
    for (const action of ["http://login.example.com/", "javascript:steal()"]) {
      const insecure = page(LOGIN.replace("/login", action));
      expect(await insecure.run({ fill: fill("credentials") })).toBeNull();
      expect(values(insecure.window)).toBe("t");
    }
  });

  it("waits for a form the page draws later, and for its button", async () => {
    const { run, submitted, window } = page(`<main></main>`);
    const looking = run({ waitMs: 5_000, fill: fill("credentials") });
    window.document.querySelector("main")!.innerHTML = LOGIN.replace(
      "<button>",
      "<button disabled>",
    );
    const button = window.document.querySelector<HTMLButtonElement>("button:not([type])")!;
    window.document.addEventListener("input", () => {
      window.setTimeout(() => (button.disabled = false), 10);
    });
    expect(await looking).toBe("credentials");
    expect(submitted).toHaveLength(1);
  });
});
