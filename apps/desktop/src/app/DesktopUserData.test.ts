import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";

import { resolveUserDataPath } from "./DesktopUserData.ts";

/** An app data folder holding the pre-rename profile: one browser partition and one other. */
const makeAppData = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const appData = yield* fs.makeTempDirectoryScoped({ prefix: "control-user-data-" });
  const previous = path.join(appData, "t3code-v2");
  yield* fs.makeDirectory(path.join(previous, "Partitions", "t3code-preview-abc"), {
    recursive: true,
  });
  yield* fs.makeDirectory(path.join(previous, "Partitions", "other"));
  yield* fs.writeFileString(path.join(previous, "Local State"), "keys");
  yield* fs.writeFileString(
    path.join(previous, "Partitions", "t3code-preview-abc", "Cookies"),
    "a",
  );
  return { appData, previous, current: path.join(appData, "control-desktop") };
});

it.layer(NodeServices.layer)("resolveUserDataPath", (it) => {
  it.effect("copies the previous profile once, renaming its browser partitions", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const { appData, previous, current } = yield* makeAppData;

      assert.equal(
        yield* resolveUserDataPath({ appDataDirectory: appData, isDevelopment: false }),
        current,
      );
      assert.equal(yield* fs.readFileString(path.join(current, "Local State")), "keys");
      assert.equal(
        yield* fs.readFileString(
          path.join(current, "Partitions", "control-preview-abc", "Cookies"),
        ),
        "a",
      );
      assert.deepEqual((yield* fs.readDirectory(path.join(current, "Partitions"))).toSorted(), [
        "control-preview-abc",
        "other",
      ]);
      // The original stays as it was, as the backup.
      assert.isTrue(yield* fs.exists(path.join(previous, "Partitions", "t3code-preview-abc")));
      assert.isFalse(yield* fs.exists(`${current}.partial`));

      yield* fs.writeFileString(path.join(previous, "written later"), "");
      assert.equal(
        yield* resolveUserDataPath({ appDataDirectory: appData, isDevelopment: false }),
        current,
      );
      assert.isFalse(yield* fs.exists(path.join(current, "written later")));
    }).pipe(Effect.scoped),
  );

  it.effect("runs on the original when the copy fails, and copies on the next launch", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { appData, previous, current } = yield* makeAppData;
      const failingRename: FileSystem.FileSystem = {
        ...fs,
        rename: (oldPath) =>
          Effect.fail(
            PlatformError.systemError({
              _tag: "PermissionDenied",
              module: "FileSystem",
              method: "rename",
              pathOrDescriptor: oldPath,
            }),
          ),
      };

      const fallback = yield* resolveUserDataPath({
        appDataDirectory: appData,
        isDevelopment: false,
      }).pipe(Effect.provideService(FileSystem.FileSystem, failingRename));

      assert.equal(fallback, previous);
      assert.isFalse(yield* fs.exists(current));
      assert.isFalse(yield* fs.exists(`${current}.partial`));
      assert.equal(
        yield* resolveUserDataPath({ appDataDirectory: appData, isDevelopment: false }),
        current,
      );
    }).pipe(Effect.scoped),
  );

  it.effect("starts a fresh profile when there is none to copy", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const appData = yield* fs.makeTempDirectoryScoped({ prefix: "control-user-data-" });

      assert.equal(
        yield* resolveUserDataPath({ appDataDirectory: appData, isDevelopment: true }),
        path.join(appData, "control-dev"),
      );
      assert.deepEqual(yield* fs.readDirectory(appData), []);
    }).pipe(Effect.scoped),
  );
});
