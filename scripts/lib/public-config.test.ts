// @effect-diagnostics nodeBuiltinImport:off - Tests exercise root env file precedence directly.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { loadRepoEnv } from "./public-config.ts";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    NodeFS.rmSync(directory, { recursive: true, force: true });
  }
});

describe("loadRepoEnv", () => {
  it("applies process, root local, and root precedence in that order", () => {
    const repoRoot = makeTemporaryDirectory();
    NodeFS.writeFileSync(NodePath.join(repoRoot, ".env"), "APP_VARIANT=root\nROOT_ONLY=1\n");
    NodeFS.writeFileSync(NodePath.join(repoRoot, ".env.local"), "APP_VARIANT=local\n");

    expect(loadRepoEnv({ baseEnv: {}, repoRoot })).toEqual({
      APP_VARIANT: "local",
      ROOT_ONLY: "1",
    });
    expect(loadRepoEnv({ baseEnv: { APP_VARIANT: "ci" }, repoRoot }).APP_VARIANT).toBe("ci");
  });

  it("returns only the process environment for a clone without env files", () => {
    expect(
      loadRepoEnv({ baseEnv: { APP_VARIANT: "ci" }, repoRoot: makeTemporaryDirectory() }),
    ).toEqual({ APP_VARIANT: "ci" });
  });
});

function makeTemporaryDirectory() {
  const directory = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "control-public-config-"));
  temporaryDirectories.push(directory);
  return directory;
}
