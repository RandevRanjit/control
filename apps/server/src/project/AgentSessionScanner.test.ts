import * as NodeServices from "@effect/platform-node/NodeServices";
import * as NodeOS from "node:os";
import { describe, expect, it } from "@effect/vitest";
import {
  type OrchestrationProjectShell,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerSettings as ContractServerSettings,
} from "@control/contracts";
import { symlinksSupported } from "@control/shared/testing/symlinks";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";

import * as ServerConfig from "../config.ts";
import * as ProjectStore from "../orchestration-v2/ProjectStore.ts";
import * as ServerSettings from "../serverSettings.ts";
import * as AgentSessionScanner from "./AgentSessionScanner.ts";

const makeProjectShell = (workspaceRoot: string): OrchestrationProjectShell => ({
  id: ProjectId.make("project-1"),
  title: "Imported",
  workspaceRoot,
  defaultModelSelection: null,
  scripts: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const layerProjectStore = (importedWorkspaceRoots: ReadonlyArray<string>) =>
  Layer.mock(ProjectStore.ProjectStoreV2)({
    listShells: () =>
      Effect.succeed(
        importedWorkspaceRoots.map((workspaceRoot) => makeProjectShell(workspaceRoot)),
      ),
  });

/**
 * Run a scan against the given homes. Homes are temp dirs created inside the
 * test, so the layer is built per run rather than shared.
 */
interface ScannerTestInput {
  readonly claudeHomePath: string;
  readonly importedWorkspaceRoots?: ReadonlyArray<string>;
  /** Base dir for the test ServerConfig; worktreesDir derives from it. */
  readonly configBaseDir?: string;
  readonly providerInstances?: ContractServerSettings["providerInstances"];
}

const layerScannerTest = (input: ScannerTestInput) =>
  AgentSessionScanner.layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        ServerSettings.layerTest({
          providers: {
            claudeAgent: { homePath: input.claudeHomePath },
          },
          ...(input.providerInstances === undefined
            ? {}
            : { providerInstances: input.providerInstances }),
        }),
        ServerConfig.layerTest(
          input.claudeHomePath,
          input.configBaseDir ?? { prefix: "control-scanner-config-" },
        ),
        layerProjectStore(input.importedWorkspaceRoots ?? []),
      ),
    ),
  );

const runScan = (input: ScannerTestInput) =>
  Effect.gen(function* () {
    const scanner = yield* AgentSessionScanner.AgentSessionScanner;
    return yield* scanner.scan;
  }).pipe(Effect.provide(layerScannerTest(input)));

const runRecentThreadOutcomes = (input: ScannerTestInput & { readonly workspaceRoot: string }) =>
  Effect.gen(function* () {
    const scanner = yield* AgentSessionScanner.AgentSessionScanner;
    return yield* scanner.recentThreads(input.workspaceRoot).pipe(
      Stream.runCollect,
      Effect.map((outcomes) => Array.from(outcomes)),
    );
  }).pipe(Effect.provide(layerScannerTest(input)));

const runRecentThreads = (input: ScannerTestInput & { readonly workspaceRoot: string }) =>
  runRecentThreadOutcomes(input).pipe(
    Effect.map((outcomes) =>
      outcomes.flatMap((outcome) => (outcome._tag === "Importable" ? [outcome.thread] : [])),
    ),
  );

const makeTempDir = Effect.fn("AgentSessionScanner.test.makeTempDir")(function* (prefix: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  return yield* fileSystem.makeTempDirectoryScoped({ prefix });
});

const writeTranscript = Effect.fn("AgentSessionScanner.test.writeTranscript")(function* (input: {
  readonly filePath: string;
  readonly contents: string;
  /** Epoch millis, so ordering assertions never depend on write timing. */
  readonly mtimeMs: number;
}) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fileSystem.makeDirectory(path.dirname(input.filePath), { recursive: true });
  yield* fileSystem.writeFileString(input.filePath, input.contents);
  // Numeric utimes arguments are seconds, not milliseconds.
  const seconds = input.mtimeMs / 1000;
  yield* fileSystem.utimes(input.filePath, seconds, seconds);
});

/** Claude session line: the first record carries the real `cwd`. */
const claudeSessionLine = (cwd: string) =>
  `${JSON.stringify({ type: "user", cwd, sessionId: "s1" })}\n${JSON.stringify({ type: "assistant" })}\n`;

const encodeTranscriptRecord = Schema.encodeUnknownSync(Schema.fromJsonString(Schema.Unknown));

function makeRecordLimitTranscript(cwd: string, overflow: boolean): string {
  const records =
    encodeTranscriptRecord({
      type: "user",
      cwd,
      sessionId: "record-limit-session",
      message: { role: "user", content: "First prompt" },
    }) +
    "\n" +
    "{}\n".repeat(99_999);
  return overflow
    ? records +
        "\n" +
        encodeTranscriptRecord({
          type: "user",
          message: { role: "user", content: "Overflow prompt" },
        }) +
        "\n"
    : records;
}

it.layer(NodeServices.layer)("AgentSessionScanner", (it) => {
  describe("scan", () => {
    it.effect("reads Claude project cwds from transcripts, newest first", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const claudeHomePath = yield* makeTempDir("control-claude-home-");
        const olderWorkspace = yield* makeTempDir("control-workspace-older-");
        const newerWorkspace = yield* makeTempDir("control-workspace-newer-");

        // Slugs are intentionally lossy; the scanner must not decode them.
        yield* writeTranscript({
          filePath: path.join(claudeHomePath, "projects", "-slug-older", "a.jsonl"),
          contents: claudeSessionLine(olderWorkspace),
          mtimeMs: Date.parse("2026-01-01T00:00:00.000Z"),
        });
        yield* writeTranscript({
          filePath: path.join(claudeHomePath, "projects", "-slug-older", "b.jsonl"),
          contents: claudeSessionLine(olderWorkspace),
          mtimeMs: Date.parse("2026-01-02T00:00:00.000Z"),
        });
        yield* writeTranscript({
          filePath: path.join(claudeHomePath, "projects", "-slug-newer", "c.jsonl"),
          contents: claudeSessionLine(newerWorkspace),
          mtimeMs: Date.parse("2026-03-01T00:00:00.000Z"),
        });

        const result = yield* runScan({ claudeHomePath });

        expect(result.candidates).toEqual([
          {
            path: newerWorkspace,
            title: path.basename(newerWorkspace),
            sources: ["claudeAgent"],
            threadCount: 1,
            lastActiveAt: "2026-03-01T00:00:00.000Z",
            alreadyImported: false,
            git: null,
          },
          {
            path: olderWorkspace,
            title: path.basename(olderWorkspace),
            sources: ["claudeAgent"],
            threadCount: 2,
            lastActiveAt: "2026-01-02T00:00:00.000Z",
            alreadyImported: false,
            git: null,
          },
        ]);
      }),
    );

    it.effect("does not open a non-file Claude transcript", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fileSystem = yield* FileSystem.FileSystem;
        const claudeHomePath = yield* makeTempDir("control-claude-home-");
        const transcriptPath = path.join(claudeHomePath, "projects", "-slug", "session.jsonl");
        yield* fileSystem.makeDirectory(transcriptPath, { recursive: true });

        let transcriptOpenCount = 0;
        const simulatedFileSystem = FileSystem.FileSystem.of({
          ...fileSystem,
          open: (filePath, options) => {
            if (filePath === transcriptPath) transcriptOpenCount += 1;
            return fileSystem.open(filePath, options);
          },
        });

        const result = yield* runScan({ claudeHomePath }).pipe(
          Effect.provideService(FileSystem.FileSystem, simulatedFileSystem),
        );

        expect(result.candidates).toEqual([]);
        expect(transcriptOpenCount).toBe(0);
      }),
    );

    it.effect("stops Claude directory reads at the discovery operation budget", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fileSystem = yield* FileSystem.FileSystem;
        const claudeHomePath = yield* makeTempDir("control-claude-home-");
        const discoveryRoot = path.join(claudeHomePath, "projects");
        const emptyDirectories = Array.from(
          { length: 20_001 },
          (_, index) => `empty-${index.toString().padStart(5, "0")}`,
        );
        let directoryReadCount = 0;
        const simulatedFileSystem = FileSystem.FileSystem.of({
          ...fileSystem,
          readDirectory: (directory, options) => {
            if (directory === discoveryRoot) {
              directoryReadCount += 1;
              return Effect.succeed(emptyDirectories);
            }
            if (path.dirname(directory) === discoveryRoot) {
              directoryReadCount += 1;
              return Effect.succeed([]);
            }
            return fileSystem.readDirectory(directory, options);
          },
        });

        const result = yield* runScan({ claudeHomePath }).pipe(
          Effect.provideService(FileSystem.FileSystem, simulatedFileSystem),
        );

        expect(result.candidates).toEqual([]);
        expect(directoryReadCount).toBe(20_000);
      }),
    );

    it.effect("merges the same cwd seen by two Claude homes and flags imported projects", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const claudeHomePath = yield* makeTempDir("control-claude-home-");
        const secondHome = yield* makeTempDir("control-claude-second-");
        const workspace = yield* makeTempDir("control-workspace-");

        yield* writeTranscript({
          filePath: path.join(claudeHomePath, "projects", "-slug", "a.jsonl"),
          contents: claudeSessionLine(workspace),
          mtimeMs: Date.parse("2026-01-01T00:00:00.000Z"),
        });
        yield* writeTranscript({
          filePath: path.join(secondHome, "projects", "-slug", "b.jsonl"),
          contents: claudeSessionLine(workspace),
          mtimeMs: Date.parse("2026-04-01T09:00:00.000Z"),
        });

        const result = yield* runScan({
          claudeHomePath,
          importedWorkspaceRoots: [workspace],
          providerInstances: {
            [ProviderInstanceId.make("claude-work")]: {
              driver: ProviderDriverKind.make("claudeAgent"),
              config: { homePath: secondHome },
            },
          },
        });

        expect(result.candidates).toEqual([
          {
            path: workspace,
            title: path.basename(workspace),
            projectId: ProjectId.make("project-1"),
            sources: ["claudeAgent"],
            threadCount: 2,
            lastActiveAt: "2026-04-01T09:00:00.000Z",
            alreadyImported: true,
            git: null,
          },
        ]);
      }),
    );

    it.effect("returns the imported project ID through a realpath alias", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fileSystem = yield* FileSystem.FileSystem;
        const claudeHomePath = yield* makeTempDir("control-claude-home-");
        const workspace = yield* makeTempDir("control-workspace-");
        const linkParent = yield* makeTempDir("control-scanner-links-");
        const workspaceAlias = path.join(linkParent, "workspace-alias");
        yield* fileSystem.symlink(workspace, workspaceAlias);

        yield* writeTranscript({
          filePath: path.join(claudeHomePath, "projects", "-slug", "a.jsonl"),
          contents: claudeSessionLine(workspaceAlias),
          mtimeMs: Date.parse("2026-01-01T00:00:00.000Z"),
        });

        const result = yield* runScan({
          claudeHomePath,
          importedWorkspaceRoots: [workspace],
        });

        expect(result.candidates[0]).toMatchObject({
          path: workspace,
          projectId: ProjectId.make("project-1"),
          alreadyImported: true,
          git: null,
        });
      }),
    );

    it.effect("matches a persisted project alias to a transcript realpath", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fileSystem = yield* FileSystem.FileSystem;
        const claudeHomePath = yield* makeTempDir("control-claude-home-");
        const workspace = yield* makeTempDir("control-workspace-");
        const linkParent = yield* makeTempDir("control-scanner-links-");
        const workspaceAlias = path.join(linkParent, "workspace-alias");
        yield* fileSystem.symlink(workspace, workspaceAlias);

        yield* writeTranscript({
          filePath: path.join(claudeHomePath, "projects", "-slug", "a.jsonl"),
          contents: claudeSessionLine(workspace),
          mtimeMs: Date.parse("2026-01-01T00:00:00.000Z"),
        });

        const result = yield* runScan({
          claudeHomePath,
          importedWorkspaceRoots: [workspaceAlias],
        });

        expect(result.candidates[0]).toMatchObject({
          path: workspaceAlias,
          projectId: ProjectId.make("project-1"),
          alreadyImported: true,
          git: null,
        });
      }),
    );

    it.effect("merges case aliases and preserves the persisted project path", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fileSystem = yield* FileSystem.FileSystem;
        const claudeHomePath = yield* makeTempDir("control-claude-home-");
        const workspace = yield* makeTempDir("control-workspace-");
        const workspaceAlias = path.join(
          path.dirname(workspace),
          path.basename(workspace).toUpperCase(),
        );

        yield* writeTranscript({
          filePath: path.join(claudeHomePath, "projects", "-slug", "a.jsonl"),
          contents: claudeSessionLine(workspaceAlias),
          mtimeMs: Date.parse("2026-01-01T00:00:00.000Z"),
        });
        yield* writeTranscript({
          filePath: path.join(claudeHomePath, "projects", "-slug-b", "b.jsonl"),
          contents: claudeSessionLine(workspace),
          mtimeMs: Date.parse("2026-01-02T00:00:00.000Z"),
        });

        const simulatedFileSystem = FileSystem.FileSystem.of({
          ...fileSystem,
          stat: (filePath) => fileSystem.stat(filePath === workspaceAlias ? workspace : filePath),
        });
        const result = yield* runScan({
          claudeHomePath,
          importedWorkspaceRoots: [workspace],
        }).pipe(Effect.provideService(FileSystem.FileSystem, simulatedFileSystem));

        expect(result.candidates).toEqual([
          {
            path: workspace,
            title: path.basename(workspace),
            projectId: ProjectId.make("project-1"),
            sources: ["claudeAgent"],
            threadCount: 2,
            lastActiveAt: "2026-01-02T00:00:00.000Z",
            alreadyImported: true,
            git: null,
          },
        ]);
      }),
    );

    it.effect("keeps case variants distinct when the filesystem identities differ", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fileSystem = yield* FileSystem.FileSystem;
        const claudeHomePath = yield* makeTempDir("control-claude-home-");
        const backingUpper = yield* makeTempDir("control-backing-upper-");
        const backingLower = yield* makeTempDir("control-backing-lower-");
        const aliasParent = yield* makeTempDir("control-case-aliases-");
        const upperWorkspace = path.join(aliasParent, "Repo");
        const lowerWorkspace = path.join(aliasParent, "repo");

        yield* writeTranscript({
          filePath: path.join(claudeHomePath, "projects", "-upper", "a.jsonl"),
          contents: claudeSessionLine(upperWorkspace),
          mtimeMs: Date.parse("2026-01-02T00:00:00.000Z"),
        });
        yield* writeTranscript({
          filePath: path.join(claudeHomePath, "projects", "-lower", "b.jsonl"),
          contents: claudeSessionLine(lowerWorkspace),
          mtimeMs: Date.parse("2026-01-01T00:00:00.000Z"),
        });

        const simulatedFileSystem = FileSystem.FileSystem.of({
          ...fileSystem,
          stat: (filePath) =>
            fileSystem.stat(
              filePath === upperWorkspace
                ? backingUpper
                : filePath === lowerWorkspace
                  ? backingLower
                  : filePath,
            ),
        });
        const result = yield* runScan({ claudeHomePath }).pipe(
          Effect.provideService(FileSystem.FileSystem, simulatedFileSystem),
        );

        expect(result.candidates.map((candidate) => candidate.path)).toEqual([
          upperWorkspace,
          lowerWorkspace,
        ]);
      }),
    );

    it.effect("uses explicit provider instance homes instead of overridden legacy homes", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const claudeHomePath = yield* makeTempDir("control-claude-legacy-");
        const claudeInstanceHome = yield* makeTempDir("control-claude-instance-");
        const legacyWorkspace = yield* makeTempDir("control-workspace-legacy-");
        const claudeWorkspace = yield* makeTempDir("control-workspace-claude-");

        yield* writeTranscript({
          filePath: path.join(claudeHomePath, "projects", "-legacy", "session.jsonl"),
          contents: claudeSessionLine(legacyWorkspace),
          mtimeMs: Date.parse("2026-01-01T00:00:00.000Z"),
        });
        yield* writeTranscript({
          filePath: path.join(claudeInstanceHome, "projects", "-actual", "session.jsonl"),
          contents: claudeSessionLine(claudeWorkspace),
          mtimeMs: Date.parse("2026-02-01T00:00:00.000Z"),
        });

        const result = yield* runScan({
          claudeHomePath,
          providerInstances: {
            [ProviderInstanceId.make("claudeAgent")]: {
              driver: ProviderDriverKind.make("claudeAgent"),
              config: { homePath: claudeInstanceHome },
            },
          },
        });

        expect(result.candidates.map((candidate) => candidate.path)).toEqual([claudeWorkspace]);
      }),
    );

    it.effect("scans each distinct home across multiple instances once", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const claudeHomePath = yield* makeTempDir("control-claude-home-");
        const otherClaudeHome = yield* makeTempDir("control-claude-other-");
        const workspace = yield* makeTempDir("control-workspace-");
        const otherWorkspace = yield* makeTempDir("control-workspace-other-");

        for (const [home, cwd] of [
          [claudeHomePath, workspace],
          [otherClaudeHome, otherWorkspace],
        ] as const) {
          yield* writeTranscript({
            filePath: path.join(home, "projects", "-slug", "session.jsonl"),
            contents: claudeSessionLine(cwd),
            mtimeMs: Date.parse("2026-01-01T00:00:00.000Z"),
          });
        }

        const result = yield* runScan({
          claudeHomePath,
          providerInstances: {
            [ProviderInstanceId.make("claude-personal")]: {
              driver: ProviderDriverKind.make("claudeAgent"),
              config: { homePath: claudeHomePath },
            },
            [ProviderInstanceId.make("claude-work")]: {
              driver: ProviderDriverKind.make("claudeAgent"),
              config: { homePath: otherClaudeHome },
            },
          },
        });

        expect(result.candidates).toHaveLength(2);
        expect(result.candidates.map((candidate) => candidate.threadCount)).toEqual([1, 1]);
        expect(result.candidates.map((candidate) => candidate.path).sort()).toEqual(
          [workspace, otherWorkspace].sort(),
        );
      }),
    );

    it.effect("honors provider instance home directory environment variables", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const claudeHomePath = yield* makeTempDir("control-claude-legacy-");
        const claudeEnvironmentHome = yield* makeTempDir("control-claude-env-");
        const claudeWorkspace = yield* makeTempDir("control-workspace-claude-");

        yield* writeTranscript({
          filePath: path.join(claudeEnvironmentHome, "projects", "-actual", "session.jsonl"),
          contents: claudeSessionLine(claudeWorkspace),
          mtimeMs: Date.parse("2026-01-01T00:00:00.000Z"),
        });

        const result = yield* runScan({
          claudeHomePath,
          providerInstances: {
            [ProviderInstanceId.make("claudeAgent")]: {
              driver: ProviderDriverKind.make("claudeAgent"),
              environment: [
                { name: "CLAUDE_CONFIG_DIR", value: claudeEnvironmentHome, sensitive: false },
              ],
              config: {},
            },
          },
        });

        expect(result.candidates.map((candidate) => candidate.path)).toEqual([claudeWorkspace]);
      }),
    );

    it.effect("ignores invalid provider instances while scanning the remaining providers", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const claudeHomePath = yield* makeTempDir("control-claude-home-");
        const workspace = yield* makeTempDir("control-workspace-");

        yield* writeTranscript({
          filePath: path.join(claudeHomePath, "projects", "-actual", "session.jsonl"),
          contents: claudeSessionLine(workspace),
          mtimeMs: Date.parse("2026-01-01T00:00:00.000Z"),
        });

        const result = yield* runScan({
          claudeHomePath,
          providerInstances: {
            [ProviderInstanceId.make("claude-invalid")]: {
              driver: ProviderDriverKind.make("claudeAgent"),
              config: { homePath: 123 },
            },
          },
        });

        expect(result.candidates.map((candidate) => candidate.path)).toEqual([workspace]);
      }),
    );

    it.effect("does not scan provider instances disabled by the envelope or config", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const claudeHomePath = yield* makeTempDir("control-claude-home-");
        const envelopeDisabledHome = yield* makeTempDir("control-claude-disabled-envelope-");
        const configDisabledHome = yield* makeTempDir("control-claude-disabled-config-");
        const envelopeWorkspace = yield* makeTempDir("control-workspace-disabled-envelope-");
        const configWorkspace = yield* makeTempDir("control-workspace-disabled-config-");

        for (const [home, workspace, session] of [
          [envelopeDisabledHome, envelopeWorkspace, "envelope-disabled"],
          [configDisabledHome, configWorkspace, "config-disabled"],
        ] as const) {
          yield* writeTranscript({
            filePath: path.join(home, "projects", "-slug", `${session}.jsonl`),
            contents: claudeSessionLine(workspace),
            mtimeMs: Date.parse("2026-08-24T12:00:00.000Z"),
          });
        }

        const result = yield* runScan({
          claudeHomePath,
          providerInstances: {
            [ProviderInstanceId.make("claude-envelope-disabled")]: {
              driver: ProviderDriverKind.make("claudeAgent"),
              enabled: false,
              config: { homePath: envelopeDisabledHome },
            },
            [ProviderInstanceId.make("claude-config-disabled")]: {
              driver: ProviderDriverKind.make("claudeAgent"),
              config: { enabled: false, homePath: configDisabledHome },
            },
          },
        });

        expect(result.candidates).toEqual([]);
      }),
    );

    it.effect("ignores relative working directories from malformed transcripts", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const claudeHomePath = yield* makeTempDir("control-claude-home-");
        const workspace = yield* makeTempDir("control-workspace-");

        yield* writeTranscript({
          filePath: path.join(claudeHomePath, "projects", "-relative", "session.jsonl"),
          contents: claudeSessionLine(path.relative(path.resolve(), workspace)),
          mtimeMs: Date.parse("2026-01-01T00:00:00.000Z"),
        });

        const result = yield* runScan({ claudeHomePath });

        expect(result.candidates).toEqual([]);
      }),
    );

    it.effect("drops candidates whose directory no longer exists", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const claudeHomePath = yield* makeTempDir("control-claude-home-");

        yield* writeTranscript({
          filePath: path.join(claudeHomePath, "projects", "-slug", "a.jsonl"),
          contents: claudeSessionLine(path.join(claudeHomePath, "does-not-exist")),
          mtimeMs: Date.parse("2026-01-01T00:00:00.000Z"),
        });

        const result = yield* runScan({ claudeHomePath });

        expect(result.candidates).toEqual([]);
      }),
    );

    it.effect("excludes the home directory, temporary root, and Control data directory", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const claudeHomePath = yield* makeTempDir("control-claude-home-");
        const configBaseDir = yield* makeTempDir("control-scanner-base-");
        const workspace = yield* makeTempDir("control-workspace-");

        for (const [index, cwd] of [
          NodeOS.homedir(),
          NodeOS.tmpdir(),
          configBaseDir,
          workspace,
        ].entries()) {
          yield* writeTranscript({
            filePath: path.join(claudeHomePath, "projects", `-slug-${index}`, "session.jsonl"),
            contents: claudeSessionLine(cwd),
            mtimeMs: Date.parse("2026-01-01T00:00:00.000Z") + index,
          });
        }

        const result = yield* runScan({ claudeHomePath, configBaseDir });

        expect(result.candidates.map((candidate) => candidate.path)).toEqual([workspace]);
      }),
    );

    it.effect("excludes Control-managed worktree sandboxes", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const claudeHomePath = yield* makeTempDir("control-claude-home-");
        const fileSystem = yield* FileSystem.FileSystem;

        const worktreeCwd = path.join(claudeHomePath, ".control", "worktrees", "control", "wt-1");
        yield* fileSystem.makeDirectory(worktreeCwd, { recursive: true });
        yield* writeTranscript({
          filePath: path.join(claudeHomePath, "projects", "-slug", "a.jsonl"),
          contents: claudeSessionLine(worktreeCwd),
          mtimeMs: Date.parse("2026-01-01T00:00:00.000Z"),
        });

        const result = yield* runScan({ claudeHomePath });

        expect(result.candidates).toEqual([]);
      }),
    );

    it.effect("excludes Downloads", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fileSystem = yield* FileSystem.FileSystem;
        const claudeHomePath = yield* makeTempDir("control-claude-home-");
        // The exclusion keys off the real home directory, so this fixture
        // must live there. Each run owns a uniquely named subtree and removes
        // only that subtree, never the shared Downloads parent.
        const home = NodeOS.homedir();
        // Borrow a unique suffix from a scoped temp dir instead of reaching for
        // Date.now or Math.random, which the Effect lint rejects.
        const runId = path.basename(yield* makeTempDir("control-scanner-test-"));
        const downloads = path.join(home, "Downloads", runId);
        const keep = yield* makeTempDir("control-workspace-keep-");
        yield* fileSystem.makeDirectory(downloads, { recursive: true });
        yield* Effect.addFinalizer(() =>
          fileSystem.remove(downloads, { recursive: true }).pipe(Effect.ignore),
        );

        for (const [index, cwd] of [downloads, keep].entries()) {
          yield* writeTranscript({
            filePath: path.join(claudeHomePath, "projects", `-slug-${index}`, "session.jsonl"),
            contents: claudeSessionLine(cwd),
            mtimeMs: Date.parse("2026-09-01T00:00:00.000Z"),
          });
        }

        const result = yield* runScan({ claudeHomePath });

        expect(result.candidates.map((candidate) => candidate.path)).toEqual([keep]);
      }),
    );

    it.effect("skips linked git worktrees and reports the origin of real checkouts", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fileSystem = yield* FileSystem.FileSystem;
        const claudeHomePath = yield* makeTempDir("control-claude-home-");
        const repo = yield* makeTempDir("control-workspace-repo-");
        const worktree = yield* makeTempDir("control-workspace-worktree-");
        const plain = yield* makeTempDir("control-workspace-plain-");
        const noRemote = yield* makeTempDir("control-workspace-noremote-");
        const submodule = yield* makeTempDir("control-workspace-submodule-");

        yield* fileSystem.makeDirectory(path.join(repo, ".git"));
        yield* fileSystem.writeFileString(
          path.join(repo, ".git", "config"),
          '[core]\n\tbare = false\n[remote "origin"]\n\turl = git@github.com:acme/control.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n',
        );
        yield* fileSystem.writeFileString(
          path.join(worktree, ".git"),
          `gitdir: ${path.join(repo, ".git", "worktrees", "wt")}\n`,
        );
        yield* fileSystem.makeDirectory(path.join(noRemote, ".git"));
        yield* fileSystem.writeFileString(path.join(noRemote, ".git", "config"), "[core]\n");
        // Submodules also use a gitdir pointer, but into `modules/`, not `worktrees/`.
        const submoduleGitDir = path.join(repo, ".git", "modules", "vendor");
        yield* fileSystem.makeDirectory(submoduleGitDir, { recursive: true });
        yield* fileSystem.writeFileString(
          path.join(submoduleGitDir, "config"),
          '[remote "origin"]\n\turl = ssh://github.com/pingdotgg/vendor.git\n',
        );
        yield* fileSystem.writeFileString(
          path.join(submodule, ".git"),
          `gitdir: ${submoduleGitDir}\n`,
        );

        for (const [index, cwd] of [repo, worktree, plain, noRemote, submodule].entries()) {
          yield* writeTranscript({
            filePath: path.join(claudeHomePath, "projects", `-slug-${index}`, "a.jsonl"),
            contents: claudeSessionLine(cwd),
            mtimeMs: Date.parse(`2026-01-0${index + 1}T00:00:00.000Z`),
          });
        }

        const result = yield* runScan({ claudeHomePath });

        expect(
          result.candidates.map((candidate) => ({ path: candidate.path, git: candidate.git })),
        ).toEqual([
          {
            path: submodule,
            git: { remoteKey: "github.com/pingdotgg/vendor", repository: "pingdotgg/vendor" },
          },
          { path: noRemote, git: { remoteKey: null, repository: null } },
          { path: plain, git: null },
          {
            path: repo,
            git: { remoteKey: "github.com/acme/control", repository: "acme/control" },
          },
        ]);
      }),
    );

    it.effect(
      "excludes sandboxes under the configured worktrees dir without .control in the path",
      () =>
        Effect.gen(function* () {
          const path = yield* Path.Path;
          const claudeHomePath = yield* makeTempDir("control-claude-home-");
          const configBaseDir = yield* makeTempDir("control-scanner-base-");
          const fileSystem = yield* FileSystem.FileSystem;

          // worktreesDir derives as `<baseDir>/worktrees`, and the temp base
          // dir contains no `.control` segment — only the config-based prefix match
          // can exclude this one.
          const worktreeCwd = path.join(configBaseDir, "worktrees", "control", "wt-2");
          yield* fileSystem.makeDirectory(worktreeCwd, { recursive: true });
          yield* writeTranscript({
            filePath: path.join(claudeHomePath, "projects", "-slug", "a.jsonl"),
            contents: claudeSessionLine(worktreeCwd),
            mtimeMs: Date.parse("2026-01-01T00:00:00.000Z"),
          });

          const result = yield* runScan({ claudeHomePath, configBaseDir });

          expect(result.candidates).toEqual([]);
        }),
    );

    it.effect("excludes sandboxes reached through a symlink into the worktrees dir", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const claudeHomePath = yield* makeTempDir("control-claude-home-");
        const configBaseDir = yield* makeTempDir("control-scanner-base-");
        const linkParent = yield* makeTempDir("control-scanner-links-");
        const fileSystem = yield* FileSystem.FileSystem;

        // The recorded cwd is a symlink whose own spelling looks harmless;
        // only its realpath reveals the managed sandbox.
        const worktreeCwd = path.join(configBaseDir, "worktrees", "control", "wt-3");
        yield* fileSystem.makeDirectory(worktreeCwd, { recursive: true });
        const symlinkCwd = path.join(linkParent, "innocent-project");
        yield* fileSystem.symlink(worktreeCwd, symlinkCwd);
        yield* writeTranscript({
          filePath: path.join(claudeHomePath, "projects", "-slug", "a.jsonl"),
          contents: claudeSessionLine(symlinkCwd),
          mtimeMs: Date.parse("2026-01-01T00:00:00.000Z"),
        });

        const result = yield* runScan({ claudeHomePath, configBaseDir });

        expect(result.candidates).toEqual([]);
      }),
    );

    it.effect("finds the cwd on a later line when the first records carry none", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const claudeHomePath = yield* makeTempDir("control-claude-home-");
        const workspace = yield* makeTempDir("control-workspace-");

        // Claude transcripts often open with records that have no cwd.
        const contents = `{"type":"file-history-snapshot","messageId":"m1"}\n{"type":"queue-operation","operation":"enqueue"}\n${claudeSessionLine(workspace)}`;
        yield* writeTranscript({
          filePath: path.join(claudeHomePath, "projects", "-slug", "a.jsonl"),
          contents,
          mtimeMs: Date.parse("2026-01-01T00:00:00.000Z"),
        });

        const result = yield* runScan({ claudeHomePath });

        expect(result.candidates.map((candidate) => candidate.path)).toEqual([workspace]);
      }),
    );

    it.effect("reads a complete transcript record at the exact chunk boundary", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const claudeHomePath = yield* makeTempDir("control-claude-home-");
        const workspace = yield* makeTempDir("control-workspace-");
        const record = claudeSessionLine(workspace).split("\n")[0]!;
        const prefix = '{"padding":"';
        const suffix = `",${record.slice(1)}`;
        const contents = `${prefix}${"x".repeat(32 * 1024 - prefix.length - suffix.length)}${suffix}`;

        yield* writeTranscript({
          filePath: path.join(claudeHomePath, "projects", "-exact", "session.jsonl"),
          contents,
          mtimeMs: Date.parse("2026-01-01T00:00:00.000Z"),
        });

        const result = yield* runScan({ claudeHomePath });

        expect(contents).toHaveLength(32 * 1024);
        expect(result.candidates.map((candidate) => candidate.path)).toEqual([workspace]);
      }),
    );

    it.effect("finds session metadata after a first record larger than one chunk", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const claudeHomePath = yield* makeTempDir("control-claude-home-");
        const workspace = yield* makeTempDir("control-workspace-");
        const history = `{"type":"file-history-snapshot","data":"${"x".repeat(32 * 1024)}"}\n`;

        yield* writeTranscript({
          filePath: path.join(claudeHomePath, "projects", "-large", "session.jsonl"),
          contents: `${history}${claudeSessionLine(workspace)}`,
          mtimeMs: Date.parse("2026-01-01T00:00:00.000Z"),
        });

        const result = yield* runScan({ claudeHomePath });

        expect(result.candidates.map((candidate) => candidate.path)).toEqual([workspace]);
      }),
    );

    it.effect.each([64, 65])("shares metadata bytes across homes for %s one-MiB files", (count) =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fileSystem = yield* FileSystem.FileSystem;
        const claudeHomePath = yield* makeTempDir("control-metadata-home-");
        const secondHome = yield* makeTempDir("control-metadata-second-");
        const firstWorkspace = yield* makeTempDir("control-metadata-first-project-");
        const secondWorkspace = yield* makeTempDir("control-metadata-second-project-");
        const directories = [
          path.join(claudeHomePath, "projects", "p"),
          path.join(secondHome, "projects", "p"),
        ];
        const templates = directories.map((directory) => path.join(directory, "template.jsonl"));
        for (const [index, workspace] of [firstWorkspace, secondWorkspace].entries()) {
          const record = encodeTranscriptRecord({ cwd: workspace });
          yield* writeTranscript({
            filePath: templates[index]!,
            contents:
              " ".repeat(1024 * 1024 - new TextEncoder().encode(record).byteLength) + record,
            mtimeMs: Date.parse("2026-01-01T00:00:00.000Z") - index * 1_000,
          });
        }
        const resolveFile = (filePath: string) => {
          const index = directories.indexOf(path.dirname(filePath));
          return index === -1 ? filePath : templates[index]!;
        };
        let reservedBytes = 0;
        let opens = 0;
        const requests: number[] = [];
        const observedFileSystem = FileSystem.FileSystem.of({
          ...fileSystem,
          readDirectory: (directory, options) => {
            const index = directories.indexOf(directory);
            return index === -1
              ? fileSystem.readDirectory(directory, options)
              : Effect.succeed(
                  Array.from(
                    { length: index === 0 ? 32 : count - 32 },
                    (_, item) => `session-${item}.jsonl`,
                  ),
                );
          },
          stat: (filePath) => fileSystem.stat(resolveFile(filePath)),
          open: (filePath, options) => {
            if (!directories.includes(path.dirname(filePath)))
              return fileSystem.open(filePath, options);
            opens += 1;
            return fileSystem.open(resolveFile(filePath), options).pipe(
              Effect.map((file) => ({
                ...file,
                stat: file.stat,
                readAlloc: (size: number) => {
                  reservedBytes += Number(size);
                  requests.push(Number(size));
                  return file.readAlloc(size);
                },
              })),
            );
          },
        });
        const result = yield* runScan({
          claudeHomePath,
          providerInstances: {
            [ProviderInstanceId.make("claude-work")]: {
              driver: ProviderDriverKind.make("claudeAgent"),
              config: { homePath: secondHome },
            },
          },
        }).pipe(Effect.provideService(FileSystem.FileSystem, observedFileSystem));
        expect(result.candidates.map((candidate) => candidate.path)).toEqual([
          firstWorkspace,
          secondWorkspace,
        ]);
        expect(result.candidates.map((candidate) => candidate.threadCount)).toEqual([32, 32]);
        expect(result.truncated).toBe(count === 65 ? true : undefined);
        expect(opens).toBe(64);
        expect(reservedBytes).toBe(64 * 1024 * 1024);
        expect(requests[0]).toBe(8 * 1024);
        expect(Math.max(...requests)).toBe(8 * 1024);
      }),
    );

    it.effect.each([50, 51])("bounds metadata open/read calls for %s short-read files", (count) =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fileSystem = yield* FileSystem.FileSystem;
        const claudeHomePath = yield* makeTempDir("control-short-metadata-home-");
        const workspace = yield* makeTempDir("control-short-metadata-project-");
        const directory = path.join(claudeHomePath, "projects", "p");
        const template = path.join(directory, "template.jsonl");
        const record = encodeTranscriptRecord({ cwd: workspace });
        const contents = " ".repeat(399 - new TextEncoder().encode(record).byteLength) + record;
        const bytes = new TextEncoder().encode(contents);
        yield* writeTranscript({
          filePath: template,
          contents,
          mtimeMs: Date.parse("2026-01-01T00:00:00.000Z"),
        });
        let operations = 0;
        const observedFileSystem = FileSystem.FileSystem.of({
          ...fileSystem,
          readDirectory: (target, options) =>
            target === directory
              ? Effect.succeed(
                  Array.from({ length: count }, (_, index) => `session-${index}.jsonl`),
                )
              : fileSystem.readDirectory(target, options),
          stat: (filePath) =>
            fileSystem.stat(path.dirname(filePath) === directory ? template : filePath),
          open: (filePath, options) => {
            if (path.dirname(filePath) !== directory) return fileSystem.open(filePath, options);
            operations += 1;
            let offset = 0;
            return fileSystem.open(template, options).pipe(
              Effect.map((file) => ({
                ...file,
                stat: file.stat,
                readAlloc: () =>
                  Effect.sync(() => {
                    operations += 1;
                    if (offset === bytes.length) return Option.none<Uint8Array>();
                    return Option.some(bytes.subarray(offset, ++offset));
                  }),
              })),
            );
          },
        });
        const result = yield* runScan({ claudeHomePath }).pipe(
          Effect.provideService(FileSystem.FileSystem, observedFileSystem),
        );
        expect(operations).toBe(20_000);
        expect(result.candidates[0]?.threadCount).toBe(50);
        expect(result.truncated).toBe(count === 51 ? true : undefined);
      }),
    );

    it.effect("bounds malformed metadata records without excluding another account", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fileSystem = yield* FileSystem.FileSystem;
        const claudeHomePath = yield* makeTempDir("control-record-metadata-home-");
        const secondHome = yield* makeTempDir("control-record-metadata-second-");
        const workspace = yield* makeTempDir("control-record-metadata-project-");
        const directory = path.join(claudeHomePath, "projects", "p");
        const template = path.join(directory, "template.jsonl");
        yield* writeTranscript({
          filePath: template,
          contents: "x\n".repeat(1_001),
          mtimeMs: Date.parse("2026-01-02T00:00:00.000Z"),
        });
        yield* writeTranscript({
          filePath: path.join(secondHome, "projects", "p", "session.jsonl"),
          contents: encodeTranscriptRecord({ cwd: workspace }),
          mtimeMs: Date.parse("2026-01-01T00:00:00.000Z"),
        });
        let malformedOpens = 0;
        const observedFileSystem = FileSystem.FileSystem.of({
          ...fileSystem,
          readDirectory: (target, options) =>
            target === directory
              ? Effect.succeed(Array.from({ length: 102 }, (_, index) => `session-${index}.jsonl`))
              : fileSystem.readDirectory(target, options),
          stat: (filePath) =>
            fileSystem.stat(path.dirname(filePath) === directory ? template : filePath),
          open: (filePath, options) => {
            if (path.dirname(filePath) !== directory) return fileSystem.open(filePath, options);
            malformedOpens += 1;
            return fileSystem.open(template, options);
          },
        });
        const result = yield* runScan({
          claudeHomePath,
          providerInstances: {
            [ProviderInstanceId.make("claude-work")]: {
              driver: ProviderDriverKind.make("claudeAgent"),
              config: { homePath: secondHome },
            },
          },
        }).pipe(Effect.provideService(FileSystem.FileSystem, observedFileSystem));
        expect(result.candidates.map((candidate) => candidate.path)).toEqual([workspace]);
        expect(malformedOpens).toBe(100);
        expect(result.truncated).toBe(true);
      }),
    );

    it.effect.each([19_999, 20_000])(
      "reports unfinished directory work for %s project directories",
      (count) =>
        Effect.gen(function* () {
          const path = yield* Path.Path;
          const fileSystem = yield* FileSystem.FileSystem;
          const claudeHomePath = yield* makeTempDir("control-directory-budget-home-");
          const projectsDir = path.join(claudeHomePath, "projects");
          let reads = 0;
          const observedFileSystem = FileSystem.FileSystem.of({
            ...fileSystem,
            readDirectory: (directory, options) => {
              if (directory === projectsDir) {
                reads += 1;
                return Effect.succeed(
                  Array.from({ length: count }, (_, index) => `project-${index}`),
                );
              }
              if (path.dirname(directory) === projectsDir) {
                reads += 1;
                return Effect.succeed([]);
              }
              return fileSystem.readDirectory(directory, options);
            },
          });
          const result = yield* runScan({ claudeHomePath }).pipe(
            Effect.provideService(FileSystem.FileSystem, observedFileSystem),
          );
          expect(reads).toBe(20_000);
          expect(result.candidates).toEqual([]);
          expect(result.truncated).toBe(count === 20_000 ? true : undefined);
        }),
    );

    it.effect("skips malformed transcripts without failing the scan", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const claudeHomePath = yield* makeTempDir("control-claude-home-");
        const workspace = yield* makeTempDir("control-workspace-");

        yield* writeTranscript({
          filePath: path.join(claudeHomePath, "projects", "-broken", "a.jsonl"),
          contents: "not json at all\n",
          mtimeMs: Date.parse("2026-05-01T00:00:00.000Z"),
        });
        // Valid JSON, but no cwd anywhere in the record.
        yield* writeTranscript({
          filePath: path.join(claudeHomePath, "projects", "-no-cwd", "a.jsonl"),
          contents: `{"type":"summary"}\n`,
          mtimeMs: Date.parse("2026-05-02T00:00:00.000Z"),
        });
        yield* writeTranscript({
          filePath: path.join(claudeHomePath, "projects", "-good", "a.jsonl"),
          contents: claudeSessionLine(workspace),
          mtimeMs: Date.parse("2026-05-03T00:00:00.000Z"),
        });

        const result = yield* runScan({ claudeHomePath });

        expect(result.candidates).toEqual([
          {
            path: workspace,
            title: path.basename(workspace),
            sources: ["claudeAgent"],
            threadCount: 1,
            lastActiveAt: "2026-05-03T00:00:00.000Z",
            alreadyImported: false,
            git: null,
          },
        ]);
      }),
    );

    it.effect("returns an empty result when the home directory does not exist", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const root = yield* makeTempDir("control-missing-homes-");

        const result = yield* runScan({
          claudeHomePath: path.join(root, "no-claude"),
        });

        expect(result.candidates).toEqual([]);
        expect(result.scannedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      }),
    );
  });

  describe("recentThreads", () => {
    it.effect.each([false, true])(
      "counts terminal newlines correctly with record overflow=%s",
      (overflow) =>
        Effect.gen(function* () {
          const path = yield* Path.Path;
          const nowMs = Date.parse("2026-08-24T12:00:00.000Z");
          yield* TestClock.setTime(nowMs);
          const claudeHomePath = yield* makeTempDir("control-record-limit-claude-");
          const workspace = yield* makeTempDir("control-record-limit-project-");
          const directory = path.join(claudeHomePath, "projects", "p");
          yield* writeTranscript({
            filePath: path.join(directory, "records.jsonl"),
            contents: makeRecordLimitTranscript(workspace, overflow),
            mtimeMs: nowMs,
          });
          yield* writeTranscript({
            filePath: path.join(directory, "older.jsonl"),
            contents: encodeTranscriptRecord({
              type: "user",
              cwd: workspace,
              sessionId: "older-session",
              message: { role: "user", content: "Older prompt" },
            }),
            mtimeMs: nowMs - 1_000,
          });
          const outcomes = yield* runRecentThreadOutcomes({
            claudeHomePath,
            workspaceRoot: workspace,
          });
          expect(outcomes.map((outcome) => outcome._tag)).toEqual(
            overflow ? ["Skipped", "Importable"] : ["Importable", "Skipped"],
          );
          expect(
            outcomes.flatMap((outcome) =>
              outcome._tag === "Importable"
                ? outcome.thread.messages.map((message) => message.text)
                : [],
            ),
          ).toEqual([overflow ? "Older prompt" : "First prompt"]);
        }),
    );

    it.effect("imports recent Claude sessions for the selected project only", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const nowMs = Date.parse("2026-08-24T12:00:00.000Z");
        yield* TestClock.setTime(nowMs);
        const claudeHomePath = yield* makeTempDir("control-claude-home-");
        const workspace = yield* makeTempDir("control-workspace-");
        const otherWorkspace = yield* makeTempDir("control-workspace-other-");

        const claudeTranscript = (cwd: string, sessionId: string) =>
          `${JSON.stringify({
            type: "user",
            cwd,
            sessionId,
            timestamp: "2026-08-23T12:00:00.000Z",
            message: { role: "user", content: "Fix the project" },
          })}\n${JSON.stringify({
            type: "assistant",
            sessionId,
            timestamp: "2026-08-23T12:01:00.000Z",
            message: { role: "assistant", content: [{ type: "text", text: "Done" }] },
          })}\n`;

        yield* writeTranscript({
          filePath: path.join(claudeHomePath, "projects", "-selected", "claude-recent.jsonl"),
          contents: claudeTranscript(workspace, "claude-recent"),
          mtimeMs: nowMs - 24 * 60 * 60 * 1000,
        });
        yield* writeTranscript({
          filePath: path.join(claudeHomePath, "projects", "-selected", "claude-old.jsonl"),
          contents: claudeTranscript(workspace, "claude-old"),
          mtimeMs: nowMs - 31 * 24 * 60 * 60 * 1000,
        });
        yield* writeTranscript({
          filePath: path.join(claudeHomePath, "projects", "-other", "claude-other.jsonl"),
          contents: claudeTranscript(otherWorkspace, "claude-other"),
          mtimeMs: nowMs - 24 * 60 * 60 * 1000,
        });

        const threads = yield* runRecentThreads({
          claudeHomePath,
          workspaceRoot: workspace,
        });

        expect(threads.map((thread) => thread.providerSessionId)).toEqual(["claude-recent"]);
        expect(threads.map((thread) => thread.messages.map((message) => message.text))).toEqual([
          ["Fix the project", "Done"],
        ]);
      }),
    );

    it.effect("imports history recorded with a case alias", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fileSystem = yield* FileSystem.FileSystem;
        const nowMs = Date.parse("2026-08-24T12:00:00.000Z");
        yield* TestClock.setTime(nowMs);
        const claudeHomePath = yield* makeTempDir("control-claude-home-");
        const workspace = yield* makeTempDir("control-workspace-");
        const workspaceAlias = path.join(
          path.dirname(workspace),
          path.basename(workspace).toUpperCase(),
        );

        yield* writeTranscript({
          filePath: path.join(claudeHomePath, "projects", "-alias", "case-session.jsonl"),
          contents: [
            encodeTranscriptRecord({
              type: "user",
              cwd: workspaceAlias,
              sessionId: "case-session",
              timestamp: "2026-08-24T10:00:00.000Z",
              message: { role: "user", content: "Import case alias history" },
            }),
            encodeTranscriptRecord({
              type: "assistant",
              sessionId: "case-session",
              timestamp: "2026-08-24T10:01:00.000Z",
              message: { role: "assistant", content: "Imported" },
            }),
          ].join("\n"),
          mtimeMs: nowMs,
        });

        const simulatedFileSystem = FileSystem.FileSystem.of({
          ...fileSystem,
          stat: (filePath) => fileSystem.stat(filePath === workspaceAlias ? workspace : filePath),
        });
        const threads = yield* runRecentThreads({
          claudeHomePath,
          workspaceRoot: workspace,
        }).pipe(Effect.provideService(FileSystem.FileSystem, simulatedFileSystem));

        expect(threads.map((thread) => thread.providerSessionId)).toEqual(["case-session"]);
      }),
    );

    it.effect("keeps the provider instance that owns a custom session home", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const nowMs = Date.parse("2026-08-24T12:00:00.000Z");
        yield* TestClock.setTime(nowMs);
        const claudeHomePath = yield* makeTempDir("control-claude-home-");
        const customHome = yield* makeTempDir("control-claude-custom-");
        const workspace = yield* makeTempDir("control-workspace-");

        yield* writeTranscript({
          filePath: path.join(customHome, "projects", "p", "custom-session.jsonl"),
          contents: encodeTranscriptRecord({
            type: "user",
            cwd: workspace,
            sessionId: "custom-session",
            message: { role: "user", content: "Use my work account" },
          }),
          mtimeMs: nowMs,
        });

        const threads = yield* runRecentThreads({
          claudeHomePath,
          workspaceRoot: workspace,
          providerInstances: {
            [ProviderInstanceId.make("claude-work")]: {
              driver: ProviderDriverKind.make("claudeAgent"),
              config: { homePath: customHome },
            },
          },
        });

        expect(threads[0]?.providerInstanceId).toBe("claude-work");
      }),
    );

    it.effect("suppresses duplicate session copies without reporting a skipped import", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const nowMs = Date.parse("2026-08-24T12:00:00.000Z");
        yield* TestClock.setTime(nowMs);
        const claudeHomePath = yield* makeTempDir("control-claude-home-");
        const workspace = yield* makeTempDir("control-workspace-");
        const contents = encodeTranscriptRecord({
          type: "user",
          cwd: workspace,
          sessionId: "copied-session",
          message: { role: "user", content: "Import this session once" },
        });

        for (const [name, mtimeMs] of [
          ["copy-a.jsonl", nowMs],
          ["copy-b.jsonl", nowMs - 1],
        ] as const) {
          yield* writeTranscript({
            filePath: path.join(claudeHomePath, "projects", "p", name),
            contents,
            mtimeMs,
          });
        }

        const outcomes = yield* runRecentThreadOutcomes({
          claudeHomePath,
          workspaceRoot: workspace,
        });

        expect(outcomes.map((outcome) => outcome._tag)).toEqual(["Importable", "Duplicate"]);
        expect(outcomes[0]).toMatchObject({
          _tag: "Importable",
          thread: { providerSessionId: "copied-session" },
        });
      }),
    );

    it.effect("streams large transcripts without hiding projects", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fileSystem = yield* FileSystem.FileSystem;
        const nowMs = Date.parse("2026-08-24T12:00:00.000Z");
        yield* TestClock.setTime(nowMs);
        const claudeHomePath = yield* makeTempDir("control-budget-claude-");
        const workspace = yield* makeTempDir("control-budget-workspace-");
        const transcriptPaths = new Set<string>();
        for (let index = 0; index < 5; index++) {
          const sessionId = `budget-session-${index}`;
          const filePath = path.join(claudeHomePath, "projects", "selected", `${sessionId}.jsonl`);
          const contents = encodeTranscriptRecord({
            type: "user",
            cwd: workspace,
            sessionId,
            message: { content: "Imported prompt" },
          });
          transcriptPaths.add(filePath);
          yield* writeTranscript({
            filePath,
            contents: `${contents}\n`.padEnd(16 * 1024 * 1024, " "),
            mtimeMs: nowMs - index * 1_000,
          });
        }

        const opens = new Map<string, number>();
        let fullReadBytes = 0;
        const trackedFileSystem = FileSystem.FileSystem.of({
          ...fileSystem,
          open: (filePath, options) => {
            const count = (opens.get(filePath) ?? 0) + 1;
            opens.set(filePath, count);
            return fileSystem.open(filePath, options).pipe(
              Effect.map((file) =>
                !transcriptPaths.has(filePath) || count === 1
                  ? file
                  : {
                      ...file,
                      stat: file.stat,
                      readAlloc: (size: number) =>
                        file.readAlloc(size).pipe(
                          Effect.tap((chunk) =>
                            Effect.sync(() => {
                              if (chunk._tag === "Some") fullReadBytes += chunk.value.byteLength;
                            }),
                          ),
                        ),
                    },
              ),
            );
          },
        });
        const outcomes = yield* Effect.gen(function* () {
          const scanner = yield* AgentSessionScanner.AgentSessionScanner;
          const scan = yield* scanner.scan;
          expect(scan.candidates[0]?.threadCount).toBe(5);
          return yield* scanner.recentThreads(workspace).pipe(Stream.runCollect);
        }).pipe(
          Effect.provide(layerScannerTest({ claudeHomePath })),
          Effect.provideService(FileSystem.FileSystem, trackedFileSystem),
        );

        expect(outcomes.map((outcome) => outcome._tag)).toEqual([
          "Importable",
          "Importable",
          "Importable",
          "Importable",
          "Importable",
        ]);
        expect(fullReadBytes).toBe(80 * 1024 * 1024);
      }),
    );

    it.effect("skips excessive records without blocking an older valid transcript", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const nowMs = Date.parse("2026-08-24T12:00:00.000Z");
        yield* TestClock.setTime(nowMs);
        const claudeHomePath = yield* makeTempDir("control-record-budget-claude-");
        const workspace = yield* makeTempDir("control-record-budget-workspace-");
        for (const [sessionId, padding, mtimeMs] of [
          ["excessive", "\n".repeat(100_001), nowMs],
          ["older", "", nowMs - 1_000],
        ] as const) {
          yield* writeTranscript({
            filePath: path.join(claudeHomePath, "projects", "p", `${sessionId}.jsonl`),
            contents:
              encodeTranscriptRecord({
                type: "user",
                cwd: workspace,
                sessionId,
                message: { role: "user", content: "Imported prompt" },
              }) + padding,
            mtimeMs,
          });
        }
        const outcomes = yield* runRecentThreadOutcomes({
          claudeHomePath,
          workspaceRoot: workspace,
        });
        expect(outcomes.map((outcome) => outcome._tag)).toEqual(["Skipped", "Importable"]);
        expect(outcomes[1]).toMatchObject({ thread: { providerSessionId: "older" } });
      }),
    );

    for (const replacement of [
      "same root",
      "other root",
      "symlink alias",
      "other then same",
    ] as const) {
      it.effect.skipIf(replacement === "symlink alias" && !symlinksSupported)(
        `rechecks claudeAgent snapshot cwd after replacement with ${replacement}`,
        () =>
          Effect.gen(function* () {
            const path = yield* Path.Path;
            const fileSystem = yield* FileSystem.FileSystem;
            const nowMs = Date.parse("2026-08-24T12:00:00.000Z");
            yield* TestClock.setTime(nowMs);
            const fixture = yield* makeTempDir("control-replaced-cwd-");
            const workspace = path.join(fixture, "original");
            const otherWorkspace = path.join(fixture, "other");
            const alias = path.join(fixture, "alias");
            const claudeHomePath = path.join(fixture, "claude");
            yield* fileSystem.makeDirectory(workspace);
            yield* fileSystem.makeDirectory(otherWorkspace);
            if (replacement === "symlink alias") yield* fileSystem.symlink(workspace, alias);
            const filePath = path.join(claudeHomePath, "projects", "p", "replaced.jsonl");
            const makeContents = (cwd: string, text: string, laterCwd?: string) =>
              [
                {
                  type: "user",
                  cwd,
                  sessionId: "replacement-session",
                  message: { content: text },
                },
                ...(laterCwd === undefined ? [] : [{ cwd: laterCwd }]),
              ]
                .map((record) => encodeTranscriptRecord(record))
                .join("\n");
            yield* writeTranscript({
              filePath,
              contents: makeContents(workspace, "Original prompt"),
              mtimeMs: nowMs,
            });

            yield* Effect.gen(function* () {
              const scanner = yield* AgentSessionScanner.AgentSessionScanner;
              const scan = yield* scanner.scan;
              expect(scan.candidates.map((candidate) => candidate.path)).toEqual([workspace]);
              const replacementCwd =
                replacement === "symlink alias"
                  ? alias
                  : replacement === "same root"
                    ? workspace
                    : otherWorkspace;
              yield* fileSystem.remove(filePath);
              yield* writeTranscript({
                filePath,
                contents: makeContents(
                  replacementCwd,
                  "Replacement prompt",
                  replacement === "other then same" ? workspace : undefined,
                ),
                mtimeMs: nowMs,
              });
              const outcomes = yield* scanner.recentThreads(workspace).pipe(Stream.runCollect);
              if (replacement === "same root" || replacement === "symlink alias") {
                expect(outcomes).toHaveLength(1);
                expect(outcomes[0]).toMatchObject({
                  _tag: "Importable",
                  thread: { messages: [{ text: "Replacement prompt" }] },
                });
              } else {
                expect(outcomes).toEqual([{ _tag: "Skipped" }]);
              }
            }).pipe(Effect.provide(layerScannerTest({ claudeHomePath })));
          }),
      );
    }

    it.effect("checks file identity before skipping completed history", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fileSystem = yield* FileSystem.FileSystem;
        const nowMs = Date.parse("2026-08-24T12:00:00.000Z");
        yield* TestClock.setTime(nowMs);
        const claudeHomePath = yield* makeTempDir("control-completed-claude-");
        const workspace = yield* makeTempDir("control-completed-workspace-");
        const filePath = path.join(claudeHomePath, "projects", "p", "replaced.jsonl");
        const contents = (sessionId: string) =>
          encodeTranscriptRecord({
            type: "user",
            cwd: workspace,
            sessionId,
            message: { role: "user", content: "Imported prompt" },
          });
        yield* writeTranscript({
          filePath,
          contents: contents("original-session"),
          mtimeMs: nowMs,
        });

        yield* Effect.gen(function* () {
          const scanner = yield* AgentSessionScanner.AgentSessionScanner;
          const initial = yield* scanner.recentThreads(workspace).pipe(Stream.runCollect);
          const imported = initial[0];
          expect(imported?._tag).toBe("Importable");
          if (imported?._tag !== "Importable") return;
          const completed = yield* scanner
            .recentThreads(workspace, [imported.source])
            .pipe(Stream.runCollect);
          expect(completed[0]?._tag).toBe("AlreadyImported");

          // Keep the old inode allocated while replacing the path with an equal-size file.
          yield* fileSystem.open(filePath);
          yield* fileSystem.remove(filePath);
          yield* writeTranscript({
            filePath,
            contents: contents("replaced-session"),
            mtimeMs: nowMs,
          });
          const replaced = yield* scanner
            .recentThreads(workspace, [imported.source])
            .pipe(Stream.runCollect);
          expect(replaced[0]).toMatchObject({
            _tag: "Importable",
            thread: { providerSessionId: "replaced-session" },
            source: { size: imported.source.size, mtimeMs: imported.source.mtimeMs },
          });
        }).pipe(Effect.provide(layerScannerTest({ claudeHomePath })));
      }),
    );

    it.effect("imports visible history from a transcript with an oversized tool record", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const nowMs = Date.parse("2026-08-24T12:00:00.000Z");
        yield* TestClock.setTime(nowMs);
        const claudeHomePath = yield* makeTempDir("control-claude-home-");
        const workspace = yield* makeTempDir("control-workspace-");
        const transcript = `${encodeTranscriptRecord({
          type: "user",
          cwd: workspace,
          sessionId: "large-session",
          message: { role: "user", content: "Import this large session" },
        })}\n${encodeTranscriptRecord({ type: "tool_result", data: "" }).padEnd(
          16 * 1024 * 1024 + 1,
          " ",
        )}`;
        yield* writeTranscript({
          filePath: path.join(claudeHomePath, "projects", "p", "large-session.jsonl"),
          contents: transcript,
          mtimeMs: nowMs,
        });

        const outcomes = yield* runRecentThreadOutcomes({
          claudeHomePath,
          workspaceRoot: workspace,
        });

        expect(outcomes).toMatchObject([
          {
            _tag: "Importable",
            thread: {
              providerSessionId: "large-session",
              messages: [{ role: "user", text: "Import this large session" }],
            },
          },
        ]);
      }),
    );

    it.effect("reports stat, read, and parse failures as skipped", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fileSystem = yield* FileSystem.FileSystem;
        const nowMs = Date.parse("2026-08-24T12:00:00.000Z");
        yield* TestClock.setTime(nowMs);
        const claudeHomePath = yield* makeTempDir("control-claude-home-");
        const workspace = yield* makeTempDir("control-workspace-");
        const missingPath = path.join(claudeHomePath, "missing.jsonl");
        const transcriptPaths = {
          stat: path.join(claudeHomePath, "projects", "p", "stat.jsonl"),
          read: path.join(claudeHomePath, "projects", "p", "read.jsonl"),
          parse: path.join(claudeHomePath, "projects", "p", "parse.jsonl"),
        };
        const transcriptContents = (sessionId: string) =>
          encodeTranscriptRecord({
            type: "user",
            cwd: workspace,
            sessionId,
            message: { role: "user", content: "Import this session" },
          });

        yield* writeTranscript({
          filePath: transcriptPaths.stat,
          contents: transcriptContents("stat-session"),
          mtimeMs: nowMs,
        });
        yield* writeTranscript({
          filePath: transcriptPaths.read,
          contents: transcriptContents("read-session"),
          mtimeMs: nowMs,
        });
        yield* writeTranscript({
          filePath: transcriptPaths.parse,
          contents: encodeTranscriptRecord({
            type: "assistant",
            cwd: workspace,
            sessionId: "parse-session",
            message: { role: "assistant", content: "No user prompt" },
          }),
          mtimeMs: nowMs,
        });

        let statCount = 0;
        let readOpenCount = 0;
        const simulatedFileSystem = FileSystem.FileSystem.of({
          ...fileSystem,
          stat: (filePath) => {
            if (filePath !== transcriptPaths.stat) return fileSystem.stat(filePath);
            statCount += 1;
            return fileSystem.stat(statCount === 1 ? filePath : missingPath);
          },
          open: (filePath, options) => {
            if (filePath !== transcriptPaths.read) return fileSystem.open(filePath, options);
            readOpenCount += 1;
            return fileSystem.open(readOpenCount === 1 ? filePath : missingPath, options);
          },
        });

        const outcomes = yield* runRecentThreadOutcomes({
          claudeHomePath,
          workspaceRoot: workspace,
        }).pipe(Effect.provideService(FileSystem.FileSystem, simulatedFileSystem));

        expect(outcomes).toEqual([{ _tag: "Skipped" }, { _tag: "Skipped" }, { _tag: "Skipped" }]);
      }),
    );

    it.effect("does not reopen a transcript that becomes a non-file after discovery", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fileSystem = yield* FileSystem.FileSystem;
        const nowMs = Date.parse("2026-08-24T12:00:00.000Z");
        yield* TestClock.setTime(nowMs);
        const claudeHomePath = yield* makeTempDir("control-claude-home-");
        const workspace = yield* makeTempDir("control-workspace-");
        const nonFilePath = yield* makeTempDir("control-non-file-");
        const transcriptPath = path.join(claudeHomePath, "projects", "p", "changed.jsonl");
        yield* writeTranscript({
          filePath: transcriptPath,
          contents: encodeTranscriptRecord({
            type: "user",
            cwd: workspace,
            sessionId: "changed-session",
            message: { role: "user", content: "Do not import this session" },
          }),
          mtimeMs: nowMs,
        });

        let transcriptStatCount = 0;
        let transcriptOpenCount = 0;
        const simulatedFileSystem = FileSystem.FileSystem.of({
          ...fileSystem,
          stat: (filePath) => {
            if (filePath !== transcriptPath) return fileSystem.stat(filePath);
            transcriptStatCount += 1;
            return fileSystem.stat(transcriptStatCount === 1 ? transcriptPath : nonFilePath);
          },
          open: (filePath, options) => {
            if (filePath === transcriptPath) transcriptOpenCount += 1;
            return fileSystem.open(filePath, options);
          },
        });

        const outcomes = yield* runRecentThreadOutcomes({
          claudeHomePath,
          workspaceRoot: workspace,
        }).pipe(Effect.provideService(FileSystem.FileSystem, simulatedFileSystem));

        expect(transcriptStatCount).toBe(2);
        expect(transcriptOpenCount).toBe(1);
        expect(outcomes).toEqual([{ _tag: "Skipped" }]);
      }),
    );

    it.effect("does not import a transcript dated after the current time", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const nowMs = Date.parse("2026-08-24T12:00:00.000Z");
        yield* TestClock.setTime(nowMs);
        const claudeHomePath = yield* makeTempDir("control-claude-home-");
        const workspace = yield* makeTempDir("control-workspace-");
        yield* writeTranscript({
          filePath: path.join(claudeHomePath, "projects", "p", "future.jsonl"),
          contents: encodeTranscriptRecord({
            type: "user",
            cwd: workspace,
            sessionId: "future-session",
            message: { role: "user", content: "Future work" },
          }),
          // Node's BigInt stat (which the Effect file system now uses) floors
          // sub-millisecond precision, so a one-millisecond offset can round
          // back to `nowMs`; use a full second to stay clear of the clock.
          mtimeMs: nowMs + 1_000,
        });

        const outcomes = yield* runRecentThreadOutcomes({
          claudeHomePath,
          workspaceRoot: workspace,
        });

        expect(outcomes).toEqual([]);
      }),
    );

    it.effect("skips growth during reading without exceeding the reserved bytes", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fileSystem = yield* FileSystem.FileSystem;
        const nowMs = Date.parse("2026-08-24T12:00:00.000Z");
        yield* TestClock.setTime(nowMs);
        const claudeHomePath = yield* makeTempDir("control-claude-home-");
        const workspace = yield* makeTempDir("control-workspace-");
        const transcriptPath = path.join(claudeHomePath, "projects", "p", "growing.jsonl");
        const contents = encodeTranscriptRecord({
          type: "user",
          cwd: workspace,
          sessionId: "growing-session",
          message: { role: "user", content: "Do not import a changing file" },
        });
        yield* writeTranscript({ filePath: transcriptPath, contents, mtimeMs: nowMs });
        let transcriptOpenCount = 0;
        let fullReadBytes = 0;
        let grew = false;
        const simulatedFileSystem = FileSystem.FileSystem.of({
          ...fileSystem,
          open: (filePath, options) => {
            if (filePath !== transcriptPath) return fileSystem.open(filePath, options);
            transcriptOpenCount += 1;
            if (transcriptOpenCount === 1) return fileSystem.open(filePath, options);
            return fileSystem.open(filePath, options).pipe(
              Effect.map((file) => ({
                ...file,
                stat: file.stat,
                readAlloc: (size: number) =>
                  file.readAlloc(size).pipe(
                    Effect.tap((chunk) =>
                      Effect.gen(function* () {
                        if (chunk._tag === "None") return;
                        fullReadBytes += chunk.value.byteLength;
                        if (!grew) {
                          grew = true;
                          yield* fileSystem.writeFileString(filePath, `${contents}\nchanged`);
                        }
                      }),
                    ),
                  ),
              })),
            );
          },
        });

        const outcomes = yield* runRecentThreadOutcomes({
          claudeHomePath,
          workspaceRoot: workspace,
        }).pipe(Effect.provideService(FileSystem.FileSystem, simulatedFileSystem));

        expect(transcriptOpenCount).toBe(2);
        expect(fullReadBytes).toBe(new TextEncoder().encode(contents).byteLength);
        expect(outcomes).toEqual([{ _tag: "Skipped" }]);
      }),
    );

    it.effect("skips a transcript that shrinks after its size check", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fileSystem = yield* FileSystem.FileSystem;
        const nowMs = Date.parse("2026-08-24T12:00:00.000Z");
        yield* TestClock.setTime(nowMs);
        const claudeHomePath = yield* makeTempDir("control-claude-home-");
        const workspace = yield* makeTempDir("control-workspace-");
        const transcriptPath = path.join(claudeHomePath, "projects", "p", "shrinking.jsonl");
        const shrunkPath = path.join(claudeHomePath, "shrunk.jsonl");
        const contents = encodeTranscriptRecord({
          type: "user",
          cwd: workspace,
          sessionId: "shrinking-session",
          message: { role: "user", content: "Do not import a changing file" },
        });
        yield* writeTranscript({
          filePath: transcriptPath,
          contents: `${contents}\n${"padding".repeat(100)}`,
          mtimeMs: nowMs,
        });
        yield* writeTranscript({ filePath: shrunkPath, contents, mtimeMs: nowMs });

        let transcriptOpenCount = 0;
        const simulatedFileSystem = FileSystem.FileSystem.of({
          ...fileSystem,
          open: (filePath, options) => {
            if (filePath !== transcriptPath) return fileSystem.open(filePath, options);
            transcriptOpenCount += 1;
            return fileSystem.open(
              transcriptOpenCount === 1 ? transcriptPath : shrunkPath,
              options,
            );
          },
        });

        const outcomes = yield* runRecentThreadOutcomes({
          claudeHomePath,
          workspaceRoot: workspace,
        }).pipe(Effect.provideService(FileSystem.FileSystem, simulatedFileSystem));

        expect(transcriptOpenCount).toBe(2);
        expect(outcomes).toEqual([{ _tag: "Skipped" }]);
      }),
    );

    it.effect("does not read the second transcript when the consumer takes one thread", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fileSystem = yield* FileSystem.FileSystem;
        const nowMs = Date.parse("2026-08-24T12:00:00.000Z");
        yield* TestClock.setTime(nowMs);
        const claudeHomePath = yield* makeTempDir("control-claude-home-");
        const workspace = yield* makeTempDir("control-workspace-");
        const makeClaudeTranscript = (sessionId: string, text: string) =>
          encodeTranscriptRecord({
            type: "user",
            cwd: workspace,
            sessionId,
            message: { role: "user", content: text },
          });
        const olderPath = path.join(claudeHomePath, "projects", "p", "older.jsonl");
        const newerPath = path.join(claudeHomePath, "projects", "p", "newer.jsonl");
        yield* writeTranscript({
          filePath: olderPath,
          contents: makeClaudeTranscript("older-session", "Older prompt"),
          mtimeMs: nowMs - 1_000,
        });
        yield* writeTranscript({
          filePath: newerPath,
          contents: makeClaudeTranscript("newer-session", "Newer prompt"),
          mtimeMs: nowMs,
        });

        const openCounts = new Map<string, number>();
        const contentReads: Array<string> = [];
        const trackedPaths = new Set([olderPath, newerPath]);
        const simulatedFileSystem = FileSystem.FileSystem.of({
          ...fileSystem,
          open: (filePath, options) => {
            if (trackedPaths.has(filePath)) {
              const count = (openCounts.get(filePath) ?? 0) + 1;
              openCounts.set(filePath, count);
              if (count === 2) contentReads.push(filePath);
            }
            return fileSystem.open(filePath, options);
          },
        });

        const threads = yield* Effect.gen(function* () {
          const scanner = yield* AgentSessionScanner.AgentSessionScanner;
          return yield* scanner.recentThreads(workspace).pipe(
            Stream.take(1),
            Stream.runCollect,
            Effect.map((items) => Array.from(items)),
          );
        }).pipe(
          Effect.provide(layerScannerTest({ claudeHomePath })),
          Effect.provideService(FileSystem.FileSystem, simulatedFileSystem),
        );

        expect(
          threads.flatMap((outcome) =>
            outcome._tag === "Importable" ? [outcome.thread.providerSessionId] : [],
          ),
        ).toEqual(["newer-session"]);
        expect(contentReads).toEqual([newerPath]);
        expect(openCounts.get(olderPath)).toBe(1);
      }),
    );

    it.effect("does not import sessions from a Control-managed worktree", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fileSystem = yield* FileSystem.FileSystem;
        const nowMs = Date.parse("2026-08-24T12:00:00.000Z");
        yield* TestClock.setTime(nowMs);
        const claudeHomePath = yield* makeTempDir("control-claude-home-");
        const configBaseDir = yield* makeTempDir("control-scanner-base-");
        const workspace = path.join(configBaseDir, "worktrees", "control", "managed-worktree");
        yield* fileSystem.makeDirectory(workspace, { recursive: true });

        yield* writeTranscript({
          filePath: path.join(claudeHomePath, "projects", "p", "managed.jsonl"),
          contents: encodeTranscriptRecord({
            type: "user",
            cwd: workspace,
            sessionId: "managed-session",
            message: { role: "user", content: "Do not import this session" },
          }),
          mtimeMs: nowMs,
        });

        const threads = yield* runRecentThreads({
          claudeHomePath,
          configBaseDir,
          workspaceRoot: workspace,
        });

        expect(threads).toEqual([]);
      }),
    );

    it.effect("uses one deterministic provider instance for a shared session home", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const nowMs = Date.parse("2026-08-24T12:00:00.000Z");
        yield* TestClock.setTime(nowMs);
        const claudeHomePath = yield* makeTempDir("control-claude-home-");
        const sharedHome = yield* makeTempDir("control-claude-shared-");
        const workspace = yield* makeTempDir("control-workspace-");

        yield* writeTranscript({
          filePath: path.join(sharedHome, "projects", "p", "shared-session.jsonl"),
          contents: encodeTranscriptRecord({
            type: "user",
            cwd: workspace,
            sessionId: "shared-session",
            message: { role: "user", content: "Use the shared session" },
          }),
          mtimeMs: nowMs,
        });

        const threads = yield* runRecentThreads({
          claudeHomePath,
          workspaceRoot: workspace,
          providerInstances: {
            [ProviderInstanceId.make("claudeAgent")]: {
              driver: ProviderDriverKind.make("claudeAgent"),
              config: { homePath: sharedHome },
            },
            [ProviderInstanceId.make("claude-personal")]: {
              driver: ProviderDriverKind.make("claudeAgent"),
              config: { homePath: sharedHome },
            },
            [ProviderInstanceId.make("claude-work")]: {
              driver: ProviderDriverKind.make("claudeAgent"),
              config: { homePath: sharedHome },
            },
          },
        });

        expect(threads.map((thread) => thread.providerInstanceId)).toEqual(["claudeAgent"]);
      }),
    );

    it.effect("uses configured order when custom instances share a session home", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const nowMs = Date.parse("2026-08-24T12:00:00.000Z");
        yield* TestClock.setTime(nowMs);
        const claudeHomePath = yield* makeTempDir("control-claude-home-");
        const sharedHome = yield* makeTempDir("control-claude-shared-");
        const workspace = yield* makeTempDir("control-workspace-");

        yield* writeTranscript({
          filePath: path.join(sharedHome, "projects", "p", "shared-session.jsonl"),
          contents: encodeTranscriptRecord({
            type: "user",
            cwd: workspace,
            sessionId: "shared-session",
            message: { role: "user", content: "Use the first account" },
          }),
          mtimeMs: nowMs,
        });

        const threads = yield* runRecentThreads({
          claudeHomePath,
          workspaceRoot: workspace,
          providerInstances: {
            [ProviderInstanceId.make("claude-work")]: {
              driver: ProviderDriverKind.make("claudeAgent"),
              config: { homePath: sharedHome },
            },
            [ProviderInstanceId.make("claude-personal")]: {
              driver: ProviderDriverKind.make("claudeAgent"),
              config: { homePath: sharedHome },
            },
          },
        });

        expect(threads.map((thread) => thread.providerInstanceId)).toEqual(["claude-work"]);
      }),
    );

    it.effect("keeps a second account when the first has 5000 newer files", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fileSystem = yield* FileSystem.FileSystem;
        const nowMs = Date.parse("2026-08-24T12:00:00.000Z");
        yield* TestClock.setTime(nowMs);
        const claudeHomePath = yield* makeTempDir("control-claude-home-");
        const oldWorkspace = yield* makeTempDir("control-workspace-old-");
        const recentWorkspace = yield* makeTempDir("control-workspace-recent-");
        const recentHome = yield* makeTempDir("control-claude-recent-home-");
        const oldDirectory = path.join(claudeHomePath, "projects", "-aaa-old");
        const oldTranscript = path.join(oldDirectory, "old.jsonl");
        const recentDirectory = path.join(recentHome, "projects", "-zzz-recent");

        yield* writeTranscript({
          filePath: oldTranscript,
          contents: encodeTranscriptRecord({
            type: "user",
            cwd: oldWorkspace,
            sessionId: "old-session",
            message: { role: "user", content: "Old work" },
          }),
          mtimeMs: nowMs,
        });
        yield* writeTranscript({
          filePath: path.join(recentDirectory, "recent.jsonl"),
          contents: encodeTranscriptRecord({
            type: "user",
            cwd: recentWorkspace,
            sessionId: "recent-session",
            message: { role: "user", content: "Recent work" },
          }),
          mtimeMs: nowMs - 1_000,
        });

        const simulatedOldTranscripts = Array.from(
          { length: 5_000 },
          (_, index) => `old-${index}.jsonl`,
        );
        const resolveTranscript = (filePath: string) =>
          path.dirname(filePath) === oldDirectory && path.basename(filePath).startsWith("old-")
            ? oldTranscript
            : filePath;
        const simulatedFileSystem = FileSystem.FileSystem.of({
          ...fileSystem,
          readDirectory: (directory, options) =>
            directory === oldDirectory
              ? Effect.succeed(simulatedOldTranscripts)
              : fileSystem.readDirectory(directory, options),
          stat: (filePath) => fileSystem.stat(resolveTranscript(filePath)),
          open: (filePath, options) => fileSystem.open(resolveTranscript(filePath), options),
        });

        const input = {
          claudeHomePath,
          providerInstances: {
            [ProviderInstanceId.make("claude-work")]: {
              driver: ProviderDriverKind.make("claudeAgent"),
              config: { homePath: recentHome },
            },
          },
        };
        const threads = yield* Effect.gen(function* () {
          const scanner = yield* AgentSessionScanner.AgentSessionScanner;
          const scan = yield* scanner.scan;
          expect(scan.truncated).toBe(true);
          return yield* scanner.recentThreads(recentWorkspace).pipe(Stream.runCollect);
        }).pipe(
          Effect.provide(layerScannerTest(input)),
          Effect.provideService(FileSystem.FileSystem, simulatedFileSystem),
        );

        expect(
          threads.flatMap((outcome) =>
            outcome._tag === "Importable" ? [outcome.thread.providerSessionId] : [],
          ),
        ).toEqual(["recent-session"]);
      }),
    );
  });
});

describe("parseAgentSessionTranscript", () => {
  it.each([false, true])(
    "handles the exact record limit and an interior blank overflow=%s",
    (overflow) => {
      const thread = AgentSessionScanner.parseAgentSessionTranscript({
        contents: makeRecordLimitTranscript("/project", overflow),
        source: "claudeAgent",
        providerInstanceId: ProviderInstanceId.make("claudeAgent"),
        fallbackSessionId: "unused",
        lastActiveAtMs: Date.parse("2026-08-24T12:00:00.000Z"),
      });
      if (overflow) expect(thread).toBeNull();
      else expect(thread?.messages.map((message) => message.text)).toEqual(["First prompt"]);
    },
  );

  it("keeps Claude text and titles while dropping malformed and tool records", () => {
    const thread = AgentSessionScanner.parseAgentSessionTranscript({
      contents: [
        "not valid json",
        JSON.stringify({ type: "ai-title", aiTitle: "Fix authentication" }),
        JSON.stringify({
          type: "user",
          sessionId: "claude-session",
          isMeta: true,
          message: { role: "user", content: "Injected skill instructions" },
        }),
        JSON.stringify({
          type: "user",
          sessionId: "claude-session",
          isCompactSummary: true,
          message: { role: "user", content: "Injected compaction summary" },
        }),
        JSON.stringify({
          type: "user",
          sessionId: "claude-session",
          timestamp: "2026-08-24T10:00:00.000Z",
          message: { role: "user", content: [{ type: "text", text: "Fix authentication" }] },
        }),
        JSON.stringify({
          type: "user",
          sessionId: "claude-session",
          message: { role: "user", content: [{ type: "tool_result", text: "hidden" }] },
        }),
        JSON.stringify({
          type: "assistant",
          sessionId: "claude-session",
          message: {
            role: "assistant",
            model: "claude-sonnet-5",
            content: [{ type: "text", text: "Updated the login flow" }],
          },
        }),
        JSON.stringify({
          type: "assistant",
          sessionId: "claude-session",
          message: {
            role: "assistant",
            model: "<synthetic>",
            content: [{ type: "text", text: "The provider request failed" }],
          },
        }),
      ].join("\n"),
      source: "claudeAgent",
      providerInstanceId: ProviderInstanceId.make("claudeAgent"),
      fallbackSessionId: "fallback",
      lastActiveAtMs: Date.parse("2026-08-24T12:00:00.000Z"),
    });

    expect(thread).toMatchObject({
      providerSessionId: "claude-session",
      title: "Fix authentication",
      model: "claude-sonnet-5",
      messages: [
        { role: "user", text: "Fix authentication" },
        { role: "assistant", text: "Updated the login flow" },
        { role: "assistant", text: "The provider request failed" },
      ],
    });
  });

  it("skips sessions without a visible user message", () => {
    const thread = AgentSessionScanner.parseAgentSessionTranscript({
      contents: JSON.stringify({
        type: "assistant",
        message: { role: "assistant", content: "Done" },
      }),
      source: "claudeAgent",
      providerInstanceId: ProviderInstanceId.make("claudeAgent"),
      fallbackSessionId: "claude-session",
      lastActiveAtMs: Date.parse("2026-08-24T12:00:00.000Z"),
    });

    expect(thread).toBeNull();
  });

  it("keeps the first prompt when later assistant output exceeds the message limit", () => {
    const transcript = [
      encodeTranscriptRecord({
        type: "user",
        sessionId: "claude-session",
        message: { role: "user", content: "Keep this prompt" },
      }),
      ...Array.from({ length: 250 }, (_, index) =>
        encodeTranscriptRecord({
          type: "assistant",
          message: { role: "assistant", content: `Assistant update ${index}` },
        }),
      ),
    ].join("\n");

    const thread = AgentSessionScanner.parseAgentSessionTranscript({
      contents: transcript,
      source: "claudeAgent",
      providerInstanceId: ProviderInstanceId.make("claudeAgent"),
      fallbackSessionId: "fallback",
      lastActiveAtMs: Date.parse("2026-08-24T12:00:00.000Z"),
    });

    expect(thread?.messages).toHaveLength(200);
    expect(thread?.messages[0]?.text).toBe("Keep this prompt");
    expect(thread?.messages.at(-1)?.text).toBe("Assistant update 249");
  });
});
