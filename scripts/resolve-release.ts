#!/usr/bin/env node

import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Config from "effect/Config";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { Command, Flag } from "effect/cli";

export interface ReleaseMetadata {
  readonly version: string;
  readonly tag: string;
  readonly name: string;
}

const RunNumberSchema = Schema.FiniteFromString.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(1),
);
const DesktopPackageJsonSchema = Schema.Struct({ version: Schema.NonEmptyString });

export class InvalidDesktopPackageVersionError extends Schema.TaggedError<InvalidDesktopPackageVersionError>()(
  "InvalidDesktopPackageVersionError",
  { version: Schema.String },
) {
  override get message(): string {
    return `Invalid desktop package version '${this.version}'.`;
  }
}

const RepoRoot = Effect.service(Path.Path).pipe(
  Effect.flatMap((path) => path.fromFileUrl(new URL("..", import.meta.url))),
);
const decodeDesktopPackageJson = Schema.decodeUnknownEffect(
  Schema.fromJsonString(DesktopPackageJsonSchema),
);

/**
 * Every push to main is a release, `X.Y.<run>`: X.Y comes from the desktop package, and the
 * workflow's run number only ever grows, so each release sorts above the last.
 */
export const resolveReleaseMetadata = (packageVersion: string, runNumber: number) => {
  const series = /^(\d+\.\d+)\.\d+(?:[-+].*)?$/.exec(packageVersion)?.[1];
  if (series === undefined) {
    return Effect.fail(new InvalidDesktopPackageVersionError({ version: packageVersion }));
  }
  const version = `${series}.${runNumber}`;
  return Effect.succeed({
    version,
    tag: `v${version}`,
    name: `Control ${version}`,
  } satisfies ReleaseMetadata);
};

export const readDesktopPackageVersion = Effect.fn("readDesktopPackageVersion")(function* (
  rootDir: string | undefined,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const workspaceRoot = rootDir ? path.resolve(rootDir) : yield* RepoRoot;
  const source = yield* fs.readFileString(path.join(workspaceRoot, "apps/desktop/package.json"));
  return (yield* decodeDesktopPackageJson(source)).version;
});

export const writeReleaseOutput = Effect.fn("writeReleaseOutput")(function* (
  metadata: ReleaseMetadata,
  writeGithubOutput: boolean,
) {
  const lines = Object.entries(metadata).map(([key, value]) => `${key}=${value}`);
  if (!writeGithubOutput) {
    for (const line of lines) yield* Console.log(line);
    return;
  }
  const fs = yield* FileSystem.FileSystem;
  const githubOutputPath = yield* Config.NonEmptyString("GITHUB_OUTPUT");
  yield* fs.writeFileString(githubOutputPath, lines.map((line) => `${line}\n`).join(""), {
    flag: "a",
  });
});

const command = Command.make(
  "resolve-release",
  {
    runNumber: Flag.String("run-number").pipe(
      Flag.withSchema(RunNumberSchema),
      Flag.withDescription("GitHub Actions run number."),
    ),
    githubOutput: Flag.Boolean("github-output").pipe(
      Flag.withDescription("Write values to GITHUB_OUTPUT instead of stdout."),
      Flag.withDefault(false),
    ),
    root: Flag.String("root").pipe(
      Flag.withDescription("Workspace root used to resolve apps/desktop/package.json."),
      Flag.optional,
    ),
  },
  ({ runNumber, githubOutput, root }) =>
    readDesktopPackageVersion(Option.getOrUndefined(root)).pipe(
      Effect.flatMap((version) => resolveReleaseMetadata(version, runNumber)),
      Effect.flatMap((metadata) => writeReleaseOutput(metadata, githubOutput)),
    ),
).pipe(Command.withDescription("Resolve the version, tag and name of a release."));

if (import.meta.main) {
  Command.run(command, { version: "0.0.0" }).pipe(
    Effect.provide(NodeServices.layer),
    NodeRuntime.runMain,
  );
}
