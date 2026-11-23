import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import {
  readDesktopPackageVersion,
  resolveReleaseMetadata,
  writeReleaseOutput,
} from "./resolve-release.ts";

it.effect("takes X.Y from the package and the patch from the run number", () =>
  Effect.gen(function* () {
    assert.deepStrictEqual(yield* resolveReleaseMetadata("0.1.1", 99), {
      version: "0.1.99",
      tag: "v0.1.99",
      name: "Control 0.1.99",
    });
    assert.equal((yield* resolveReleaseMetadata("9.9.9-smoke.0", 321)).version, "9.9.321");
  }),
);

it.effect("rejects a package version it can't read", () =>
  Effect.gen(function* () {
    const error = yield* resolveReleaseMetadata("nightly", 1).pipe(Effect.flip);
    assert.equal(error.message, "Invalid desktop package version 'nightly'.");
  }),
);

it.layer(NodeServices.layer)("release output", (it) => {
  it.effect("reads the desktop package and appends to GITHUB_OUTPUT", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const output = path.join(root, "github-output");
      yield* fs.makeDirectory(path.join(root, "apps/desktop"), { recursive: true });
      yield* fs.writeFileString(
        path.join(root, "apps/desktop/package.json"),
        '{"version":"0.1.1"}',
      );
      yield* fs.writeFileString(output, "before=1\n");

      const version = yield* readDesktopPackageVersion(root);
      const metadata = yield* resolveReleaseMetadata(version, 7);
      yield* writeReleaseOutput(metadata, true).pipe(
        Effect.provideService(
          ConfigProvider.ConfigProvider,
          ConfigProvider.fromUnknown({ GITHUB_OUTPUT: output }),
        ),
      );

      assert.equal(
        yield* fs.readFileString(output),
        "before=1\nversion=0.1.7\ntag=v0.1.7\nname=Control 0.1.7\n",
      );
    }),
  );
});
