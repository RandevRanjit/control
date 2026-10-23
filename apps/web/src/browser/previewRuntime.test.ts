import { EnvironmentId } from "@control/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("~/env", () => ({ isElectron: true }));

import { rendersServerTabNatively } from "./previewRuntime";

const desktopServer = EnvironmentId.make("desktop-server");

describe("rendersServerTabNatively", () => {
  it("streams a tab the desktop's server runs headless, so the pane shows the agent's page", () => {
    expect(rendersServerTabNatively(desktopServer, desktopServer, { runtime: "server" })).toBe(
      true,
    );
    expect(
      rendersServerTabNatively(desktopServer, desktopServer, { runtime: "server", headless: true }),
    ).toBe(false);
  });
});
