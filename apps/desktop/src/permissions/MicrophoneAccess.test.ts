import type * as Electron from "electron";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("electron", () => ({ systemPreferences: { askForMediaAccess: vi.fn() } }));

import { limitMicrophone } from "./MicrophoneAccess.ts";

type RequestHandler = NonNullable<Parameters<Electron.Session["setPermissionRequestHandler"]>[0]>;
type CheckHandler = NonNullable<Parameters<Electron.Session["setPermissionCheckHandler"]>[0]>;

describe("limitMicrophone", () => {
  const askOwner = vi.fn<() => Promise<boolean>>();
  let request: (permission: string, isMainFrame: boolean) => Promise<boolean>;
  let check: (permission: string, isMainFrame: boolean) => boolean;

  beforeEach(() => {
    askOwner.mockReset().mockResolvedValue(true);
    const contents = {} as Electron.WebContents;
    limitMicrophone(
      {
        setPermissionRequestHandler: (handler) => {
          request = (permission, isMainFrame) =>
            new Promise((resolve) =>
              handler!(contents, permission as Parameters<RequestHandler>[1], resolve, {
                isMainFrame,
              } as Parameters<RequestHandler>[3]),
            );
        },
        setPermissionCheckHandler: (handler) => {
          check = (permission, isMainFrame) =>
            handler!(contents, permission as Parameters<CheckHandler>[1], "ctrl://app", {
              isMainFrame,
            } as Parameters<CheckHandler>[3]);
        },
      },
      askOwner,
    );
  });

  it("gives Control's page the microphone once macOS's prompt is answered", async () => {
    expect(await request("media", true)).toBe(true);
    expect(askOwner).toHaveBeenCalledOnce();
    expect(check("media", true)).toBe(true);

    askOwner.mockResolvedValue(false);
    expect(await request("media", true)).toBe(false);
    askOwner.mockRejectedValue(new Error("no usage description"));
    expect(await request("media", true)).toBe(false);
  });

  it("never gives it to a page inside a chat, and doesn't ask", async () => {
    expect(await request("media", false)).toBe(false);
    expect(check("media", false)).toBe(false);
    expect(askOwner).not.toHaveBeenCalled();
  });

  it("leaves every other permission as it was", async () => {
    for (const isMainFrame of [true, false]) {
      expect(await request("notifications", isMainFrame)).toBe(true);
      expect(check("local-fonts", isMainFrame)).toBe(true);
    }
  });
});
