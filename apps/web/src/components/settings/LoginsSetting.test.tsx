// @vitest-environment jsdom

import type { DesktopSavedLogin, DesktopSaveLoginInput } from "@control/contracts";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const desktop = vi.hoisted(() => {
  const desktop = {
    logins: [] as DesktopSavedLogin[],
    saved: [] as DesktopSaveLoginInput[],
    saveError: null as Error | null,
  };
  // Read once, when the page's modules load.
  Object.assign(window, {
    desktopBridge: {
      logins: {
        list: async () => desktop.logins,
        save: async (input: DesktopSaveLoginInput) => {
          if (desktop.saveError) throw desktop.saveError;
          desktop.saved.push(input);
          desktop.logins = [
            ...desktop.logins.filter((login) => login.origin !== input.site),
            { origin: input.site, username: input.username, lastUsedAt: null, refusedAt: null },
          ];
        },
        remove: async (origin: string) => {
          desktop.logins = desktop.logins.filter((login) => login.origin !== origin);
        },
        retry: async (origin: string) => {
          desktop.logins = desktop.logins.map((login) =>
            login.origin === origin ? { ...login, refusedAt: null } : login,
          );
        },
      },
    },
  });
  return desktop;
});

import { LoginsSetting } from "./LoginsSetting";

let root: Root;
let container: HTMLDivElement;

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  Object.defineProperty(Element.prototype, "getAnimations", {
    configurable: true,
    value: () => [],
  });
  desktop.logins = [
    {
      origin: "https://login.example.com",
      username: "ada",
      lastUsedAt: null,
      refusedAt: "2026-11-23T10:00:00.000Z",
    },
  ];
  desktop.saved = [];
  desktop.saveError = null;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<LoginsSetting disabled={false} />));
});

afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const press = (element: Element | null | undefined) =>
  act(async () => {
    expect(element).toBeTruthy();
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      element!.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }));
    }
  });
const named = (selector: string, text: string) =>
  [...document.querySelectorAll(selector)].find((element) => element.textContent?.trim() === text);
const write = (id: string, value: string) =>
  act(async () => {
    const input = document.getElementById(id) as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
const menuItem = async (text: string) => {
  await press(document.querySelector('[aria-label="login.example.com options"]'));
  await press(named('[role="menuitem"]', text));
};

describe("LoginsSetting", () => {
  it("saves a login for the sign-in page's own origin and lists it without the password", async () => {
    await press(named("button", "Add"));
    const save = () => named("button", "Save") as HTMLButtonElement;
    await write("saved-login-site", "http://sso.example.org");
    await write("saved-login-username", " grace ");
    await write("saved-login-password", "Sw0rdfish!");
    expect(save().disabled).toBe(true);
    await write("saved-login-site", "sso.example.org/login?next=/home");
    expect(save().disabled).toBe(false);
    await act(async () => {
      document
        .getElementById("saved-login")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(desktop.saved).toEqual([
      { site: "https://sso.example.org", username: "grace", password: "Sw0rdfish!" },
    ]);
    expect(document.getElementById("saved-login")).toBeNull();
    expect(container.textContent).toContain("sso.example.org");
    expect(document.documentElement.innerHTML).not.toContain("Sw0rdfish!");
  });

  it("keeps the dialog and says so when the login isn't saved", async () => {
    desktop.saveError = new Error("keychain");
    await menuItem("Update");
    const site = document.getElementById("saved-login-site") as HTMLInputElement;
    expect([site.value, site.disabled]).toEqual(["https://login.example.com", true]);
    expect((document.getElementById("saved-login-password") as HTMLInputElement).value).toBe("");
    await write("saved-login-password", "new");
    await act(async () => {
      document
        .getElementById("saved-login")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("wasn't saved");
    expect((document.getElementById("saved-login-password") as HTMLInputElement).value).toBe("new");
  });

  it("shows a login the site turned down, and retries or removes it", async () => {
    expect(container.textContent).toContain("Turned down");
    await menuItem("Retry");
    expect(container.textContent).not.toContain("Turned down");
    await menuItem("Remove");
    expect(container.textContent).not.toContain("login.example.com");
    expect(desktop.logins).toEqual([]);
  });
});
