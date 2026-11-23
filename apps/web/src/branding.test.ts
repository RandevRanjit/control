import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { formatAppDisplayName } from "./branding.logic";

const originalWindow = globalThis.window;

afterEach(() => {
  vi.resetModules();

  if (originalWindow === undefined) {
    Reflect.deleteProperty(globalThis, "window");
    return;
  }

  globalThis.window = originalWindow;
});

describe("branding", () => {
  it("uses injected desktop branding when available", async () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        desktopBridge: {
          getAppBranding: () => ({
            baseName: "Control",
            stageLabel: "Dev",
            displayName: "Control (Dev)",
          }),
        },
      },
    });

    const branding = await import("./branding");

    expect(branding.APP_BASE_NAME).toBe("Control");
    expect(branding.APP_STAGE_LABEL).toBe("Dev");
    expect(branding.APP_DISPLAY_NAME).toBe("Control (Dev)");
  });
});

describe("branding logic", () => {
  it("names a production build plainly and labels a dev one", () => {
    expect(formatAppDisplayName({ baseName: "Control", stageLabel: "Alpha" })).toBe("Control");
    expect(formatAppDisplayName({ baseName: "Control", stageLabel: "Dev" })).toBe("Control (Dev)");
  });
});
