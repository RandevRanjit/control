import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { HostProcessPlatform } from "@control/shared/hostProcess";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import * as DesktopPreReadyFileSystem from "./DesktopPreReadyFileSystem.ts";
import * as DesktopUserData from "./DesktopUserData.ts";

const resolveUserData = (appDataDirectory: string) =>
  DesktopUserData.resolveUserDataPath({ appDataDirectory, isDevelopment: false }).pipe(
    Effect.provide(DesktopPreReadyFileSystem.layer),
  );

it.layer(NodeServices.layer)("DesktopPreReadyFileSystem", (it) => {
  it.effect("copies the previous profile before Electron is ready", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fileSystem.makeTempDirectoryScoped({ prefix: "control-pre-ready-fs-" });
      const partition = path.join(root, "t3code-v2", "Partitions", "t3code-preview-abc");
      yield* fileSystem.makeDirectory(partition, { recursive: true });
      yield* fileSystem.writeFileString(path.join(partition, "Cookies"), "logins");

      const userData = yield* resolveUserData(root);

      assert.equal(userData, path.join(root, "control-desktop"));
      assert.equal(
        yield* fileSystem.readFileString(
          path.join(userData, "Partitions", "control-preview-abc", "Cookies"),
        ),
        "logins",
      );
      assert.isTrue(yield* fileSystem.exists(path.join(partition, "Cookies")));
    }),
  );

  it.effect.skipIf(HostProcessPlatform.defaultValue() === "win32" || process.getuid?.() === 0)(
    "fails instead of treating an unreadable profile as missing",
    () =>
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const root = yield* fileSystem.makeTempDirectoryScoped({ prefix: "control-pre-ready-fs-" });
        yield* fileSystem.chmod(root, 0o000);
        yield* Effect.addFinalizer(() => fileSystem.chmod(root, 0o700).pipe(Effect.orDie));

        const exit = yield* Effect.exit(resolveUserData(root));

        assert.isTrue(Exit.isFailure(exit));
      }),
  );
});
