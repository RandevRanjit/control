// @effect-diagnostics nodeBuiltinImport:off - realpathSync.native resolves Windows 8.3 short names, which the Effect realPath does not.
import * as NodeFS from "node:fs";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { HostProcessPlatform } from "@control/shared/hostProcess";
import { assert, it, describe } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as Metric from "effect/Metric";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Result from "effect/Result";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import { gitCommandDuration } from "../observability/Metrics.ts";
import { makeGitVcsDriverCore, windowsLongPathConfigEnv } from "./GitVcsDriverCore.ts";
import * as GitVcsDriver from "./GitVcsDriver.ts";
import {
  encodeGitCommandError,
  layerServerConfig,
  layerTest,
  makeNonRepositoryHandle,
  makeSuccessfulHandle,
  makeTmpDir,
  writeTextFile,
  git,
  initRepoWithCommit,
} from "./GitVcsDriverCore.testkit.ts";

it.effect("bounds Git bursts across drivers without timing out queued commands", () =>
  Effect.gen(function* () {
    const gate = yield* Deferred.make<void>();
    const starts = yield* Queue.unbounded<number>();
    let active = 0;
    let peak = 0;
    const spawner = ChildProcessSpawner.make(() =>
      Effect.acquireRelease(
        Effect.gen(function* () {
          peak = Math.max(peak, ++active);
          yield* Queue.offer(starts, active);
          return ChildProcessSpawner.makeHandle({
            ...makeSuccessfulHandle("ok"),
            exitCode: Deferred.await(gate).pipe(Effect.as(ChildProcessSpawner.ExitCode(0))),
          });
        }),
        () => Effect.sync(() => active--),
      ),
    );
    const drivers = yield* Effect.all(
      Array.from({ length: 16 }, () =>
        makeGitVcsDriverCore().pipe(
          Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
        ),
      ),
    );
    const burst = yield* Effect.forEach(
      drivers,
      (driver, index) =>
        driver.execute({
          operation: "test.gitBurst",
          cwd: "/repo",
          args: ["rev-parse", "HEAD"],
          ...(index < 4 ? {} : { timeoutMs: index < 8 ? 30_000 : 1_000 }),
        }),
      { concurrency: "unbounded" },
    ).pipe(Effect.forkChild);

    yield* TestClock.adjust("2 seconds");
    assert.equal(yield* Queue.size(starts), 8);
    assert.equal(peak, 8);
    yield* Deferred.succeed(gate, undefined);
    const results = yield* Fiber.join(burst);
    assert.equal(results.length, 16);
    assert.isTrue(results.every((result) => result.stdout === "ok" && result.exitCode === 0));
    assert.equal(peak, 8);
    assert.equal(active, 0);
    const duration = yield* Metric.value(
      Metric.withAttributes(gitCommandDuration, [["operation", "test.gitBurst"]]),
    );
    assert.equal(duration.count, 16);
    assert.equal(duration.sum, 16_000);
  }).pipe(Effect.provide(layerServerConfig.pipe(Layer.provideMerge(NodeServices.layer)))),
);

it.effect.each([{ timeoutMs: null }, { timeoutMs: 30_001 }])(
  "keeps all Git slots available with a pending command whose timeout is $timeoutMs",
  ({ timeoutMs }) =>
    Effect.gen(function* () {
      const slowGate = yield* Deferred.make<void>();
      const fastGate = yield* Deferred.make<void>();
      const starts = yield* Queue.unbounded<void>();
      let active = 0;
      const spawner = ChildProcessSpawner.make((command) =>
        Effect.acquireRelease(
          Effect.gen(function* () {
            active++;
            yield* Queue.offer(starts, undefined);
            const gate =
              ChildProcess.isStandardCommand(command) && command.args[0] === "push"
                ? slowGate
                : fastGate;
            return ChildProcessSpawner.makeHandle({
              ...makeSuccessfulHandle("ok"),
              exitCode: Deferred.await(gate).pipe(Effect.as(ChildProcessSpawner.ExitCode(0))),
            });
          }),
          () => Effect.sync(() => active--),
        ),
      );
      const driver = yield* makeGitVcsDriverCore().pipe(
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
      );
      const slow = yield* driver
        .execute({ operation: "test.slowGit", cwd: "/repo", args: ["push"], timeoutMs })
        .pipe(Effect.forkChild);
      yield* Queue.take(starts);
      const burst = yield* Effect.all(
        Array.from({ length: 8 }, () =>
          driver.execute({ operation: "test.fastGit", cwd: "/repo", args: ["status"] }),
        ),
        { concurrency: "unbounded" },
      ).pipe(Effect.forkChild);

      yield* TestClock.adjust("0 seconds");
      assert.equal(yield* Queue.size(starts), 8);
      assert.equal(active, 9);
      yield* Deferred.succeed(fastGate, undefined);
      assert.equal((yield* Fiber.join(burst)).length, 8);
      assert.equal(active, 1);
      yield* Deferred.succeed(slowGate, undefined);
      assert.equal((yield* Fiber.join(slow)).stdout, "ok");
      assert.equal(active, 0);
    }).pipe(Effect.provide(layerServerConfig.pipe(Layer.provideMerge(NodeServices.layer)))),
);

it.effect.each(["root", "nested", "worktree"] as const)(
  "skips clean filters while the %s index is locked and resumes after unlock",
  (location) =>
    Effect.gen(function* () {
      const driver = yield* GitVcsDriver.GitVcsDriver;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const repository = yield* makeTmpDir();
      yield* initRepoWithCommit(repository);
      const cwd = location === "worktree" ? yield* makeTmpDir() : repository;
      if (location === "worktree") {
        yield* git(repository, ["worktree", "add", "--detach", cwd]);
      }
      yield* git(cwd, ["config", "filter.probe.clean", "echo clean >> .filter-runs; cat"]);
      yield* writeTextFile(cwd, ".gitattributes", "asset.bin filter=probe\n");
      yield* writeTextFile(cwd, ".gitignore", ".filter-runs\n");
      yield* writeTextFile(cwd, "asset.bin", "original\n");
      yield* git(cwd, ["add", "."]);
      yield* git(cwd, ["commit", "-m", "filtered asset"]);
      NodeFS.utimesSync(path.join(cwd, "asset.bin"), 1, 1);
      const runsPath = path.join(cwd, ".filter-runs");
      yield* fs.remove(runsPath, { force: true });
      const indexPath = yield* git(cwd, ["rev-parse", "--git-path", "index"]);
      const lockPath = `${path.resolve(cwd, indexPath)}.lock`;
      yield* fs.writeFileString(lockPath, "");
      const statusCwd = location === "nested" ? path.join(cwd, "nested") : cwd;
      yield* fs.makeDirectory(statusCwd, { recursive: true });

      for (let poll = 0; poll < 3; poll++) {
        const result = yield* driver.statusDetailsLocal(statusCwd).pipe(Effect.result);
        assert.isTrue(Result.isFailure(result));
        if (Result.isFailure(result)) assert.include(result.failure.detail, "index is locked");
      }
      assert.isFalse(yield* fs.exists(runsPath));
      assert.isTrue(yield* fs.exists(lockPath));

      yield* fs.remove(lockPath);
      const status = yield* driver.statusDetailsLocal(statusCwd);
      assert.isFalse(status.hasWorkingTreeChanges);
      assert.include(yield* fs.readFileString(runsPath), "clean");
    }).pipe(Effect.provide(layerTest)),
);

it.effect("uses stable diagnostics for every parsed non-repository command", () => {
  const commands: Array<{ readonly args: ReadonlyArray<string>; readonly lcAll?: string }> = [];
  const spawner = ChildProcessSpawner.make((command) =>
    Effect.sync(() => {
      if (!ChildProcess.isStandardCommand(command)) {
        return assert.fail("expected a standard Git command");
      }
      commands.push({
        args: command.args,
        ...(command.options.env?.LC_ALL ? { lcAll: command.options.env.LC_ALL } : {}),
      });
      return makeNonRepositoryHandle();
    }),
  );
  const layerNodeServices = Layer.merge(
    NodeServices.layer,
    Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner),
  );
  const layer = GitVcsDriver.layer.pipe(
    Layer.provide(layerServerConfig),
    Layer.provideMerge(layerNodeServices),
  );

  return Effect.gen(function* () {
    const driver = yield* GitVcsDriver.GitVcsDriver;
    const cwd = "/repo";

    yield* driver.statusDetailsLocal(cwd);
    yield* driver.statusDetailsRemote(cwd, { refreshUpstream: false });
    yield* driver.listRefs({ cwd });

    assert.deepStrictEqual(commands, [
      { args: ["rev-parse", "--git-path", "index"], lcAll: "C" },
      { args: ["status", "--porcelain=2", "--branch"], lcAll: "C" },
      { args: ["rev-parse", "--abbrev-ref", "HEAD"], lcAll: "C" },
      { args: ["rev-parse", "--git-common-dir"], lcAll: "C" },
    ]);
  }).pipe(Effect.provide(layer));
});

it.effect("invalidates origin remote cache when a driver mutation adds origin", () =>
  Effect.gen(function* () {
    const driver = yield* GitVcsDriver.GitVcsDriver;
    const cwd = yield* makeTmpDir();
    const remote = yield* makeTmpDir("git-vcs-driver-remote-");
    yield* initRepoWithCommit(cwd);
    yield* git(remote, ["init", "--bare"]);

    const before = yield* driver.statusDetailsLocal(cwd);
    assert.equal(before.hasOriginRemote, false);

    yield* driver.ensureRemote({ cwd, preferredName: "origin", url: remote });

    const after = yield* driver.statusDetailsLocal(cwd);
    assert.equal(after.hasOriginRemote, true);
  }).pipe(Effect.provide(layerTest)),
);

it.effect("re-reads origin remote status after cache TTL expiry and bypassed invalidation", () =>
  Effect.gen(function* () {
    const driver = yield* GitVcsDriver.GitVcsDriver;
    const cwd = yield* makeTmpDir();
    const remote = yield* makeTmpDir("git-vcs-driver-remote-");
    yield* initRepoWithCommit(cwd);
    yield* git(remote, ["init", "--bare"]);

    // First call caches hasOriginRemote = false (5-min TTL)
    assert.equal((yield* driver.statusDetailsLocal(cwd)).hasOriginRemote, false);

    // Add origin via raw git (bypasses invalidation hook)
    yield* git(cwd, ["remote", "add", "origin", remote]);

    // Cache still has the stale false (TTL not yet expired)
    const stillCached = yield* driver.statusDetailsLocal(cwd);
    assert.equal(stillCached.hasOriginRemote, false);

    // Advance past the 5-minute TTL so the cache entry expires
    yield* TestClock.adjust("6 minutes");

    // After expiry, the next call re-executes and picks up the remote
    const afterExpiry = yield* driver.statusDetailsLocal(cwd);
    assert.equal(afterExpiry.hasOriginRemote, true);
  }).pipe(Effect.provide(layerTest)),
);

it.effect("coalesces concurrent ref pages into one repository snapshot", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const delegate = yield* ChildProcessSpawner.ChildProcessSpawner;
      const spawnedArgs = yield* Ref.make<ReadonlyArray<ReadonlyArray<string>>>([]);
      const firstWorktreeScanStarted = yield* Deferred.make<void>();
      const remoteNamesScanCompleted = yield* Deferred.make<void>();
      const delayFirstWorktreeScan = yield* Ref.make(true);
      const countingSpawner = ChildProcessSpawner.make((command) =>
        Effect.gen(function* () {
          if (!ChildProcess.isStandardCommand(command)) {
            return yield* Effect.die("expected a standard Git command");
          }
          yield* Ref.update(spawnedArgs, (current) => [...current, command.args]);
          const isWorktreeScan =
            command.args.includes("worktree") && command.args.includes("--porcelain");
          const shouldDelay =
            isWorktreeScan && (yield* Ref.getAndSet(delayFirstWorktreeScan, false));
          if (shouldDelay) {
            yield* Deferred.succeed(firstWorktreeScanStarted, undefined);
            yield* Effect.sleep("8 seconds");
          }
          const handle = yield* delegate.spawn(command);
          const isRemoteNamesScan =
            command.args.length === 3 &&
            command.args[0] === "--git-dir" &&
            command.args[2] === "remote";
          return isRemoteNamesScan
            ? ChildProcessSpawner.makeHandle({
                ...handle,
                exitCode: handle.exitCode.pipe(
                  Effect.tap(() => Deferred.succeed(remoteNamesScanCompleted, undefined)),
                ),
              })
            : handle;
        }),
      );
      const driver = yield* makeGitVcsDriverCore().pipe(
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, countingSpawner),
      );
      const cwd = yield* makeTmpDir();
      const runGit = (args: ReadonlyArray<string>) =>
        driver.execute({
          operation: "GitVcsDriver.test.coalescedListRefs",
          cwd,
          args,
          timeoutMs: 10_000,
        });

      yield* driver.initRepo({ cwd });
      yield* runGit(["config", "user.email", "test@test.com"]);
      yield* runGit(["config", "user.name", "Test"]);
      yield* writeTextFile(cwd, "README.md", "# test\n");
      yield* runGit(["add", "."]);
      yield* runGit(["commit", "-m", "initial commit"]);
      yield* Ref.set(spawnedArgs, []);

      const initialRequest = yield* driver
        .listRefs({ cwd, refresh: true, limit: 100 })
        .pipe(Effect.forkChild({ startImmediately: true }));
      yield* Deferred.await(firstWorktreeScanStarted);
      yield* Deferred.await(remoteNamesScanCompleted);
      yield* TestClock.adjust("6 seconds");
      const laterRequests = yield* Effect.all(
        Array.from({ length: 30 }, (_, index) =>
          driver.listRefs({
            cwd,
            refresh: true,
            query: `missing-${index}`,
            limit: 100,
          }),
        ),
        { concurrency: "unbounded" },
      ).pipe(Effect.forkChild({ startImmediately: true }));
      yield* TestClock.adjust("2 seconds");
      yield* Fiber.join(initialRequest);
      yield* Fiber.join(laterRequests);
      yield* driver.listRefs({ cwd, cursor: 1, limit: 100 });

      const firstSnapshotCommands = yield* Ref.get(spawnedArgs);
      const snapshotRefScans = firstSnapshotCommands.filter(
        (args) =>
          args.includes("for-each-ref") &&
          args.includes("refs/heads") &&
          args.includes("refs/remotes"),
      );
      const worktreeScans = firstSnapshotCommands.filter(
        (args) => args.includes("worktree") && args.includes("--porcelain"),
      );
      assert.equal(snapshotRefScans.length, 1);
      assert.equal(worktreeScans.length, 1);

      yield* driver.createRef({ cwd, refName: "feature/cache-invalidation" });
      const refreshed = yield* driver.listRefs({ cwd, limit: 100 });
      assert.equal(
        refreshed.refs.some((ref) => ref.name === "feature/cache-invalidation"),
        true,
      );
      const allCommands = yield* Ref.get(spawnedArgs);
      assert.equal(
        allCommands.filter(
          (args) =>
            args.includes("for-each-ref") &&
            args.includes("refs/heads") &&
            args.includes("refs/remotes"),
        ).length,
        2,
      );
    }),
  ).pipe(Effect.provide(layerServerConfig.pipe(Layer.provideMerge(NodeServices.layer)))),
);

describe("pull output beyond the output cap", () => {
  // A fast-forward that prints over 1 MB takes thousands of files, so the real pull's output is
  // padded past the cap instead.
  const withPaddedPull = (stream: "stdout" | "stderr") =>
    Effect.gen(function* () {
      const delegate = yield* ChildProcessSpawner.ChildProcessSpawner;
      const padding = new Uint8Array(1_000_001).fill(0x20);
      const paddingSpawner = ChildProcessSpawner.make((command) =>
        Effect.gen(function* () {
          const handle = yield* delegate.spawn(command);
          const isPull =
            ChildProcess.isStandardCommand(command) &&
            command.args.includes("pull") &&
            command.args.includes("--ff-only");
          return isPull
            ? ChildProcessSpawner.makeHandle({
                ...handle,
                [stream]: Stream.concat(handle[stream], Stream.make(padding)),
              })
            : handle;
        }),
      );
      return yield* makeGitVcsDriverCore().pipe(
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, paddingSpawner),
      );
    });

  const cloneBehindRemote = Effect.gen(function* () {
    const cwd = yield* makeTmpDir();
    const remote = yield* makeTmpDir("git-vcs-driver-remote-");
    const updater = yield* makeTmpDir("git-vcs-driver-updater-");
    const { initialBranch } = yield* initRepoWithCommit(cwd);
    yield* git(remote, ["init", "--bare"]);
    yield* git(cwd, ["remote", "add", "origin", remote]);
    yield* git(cwd, ["push", "-u", "origin", initialBranch]);
    yield* git(updater, ["clone", remote, "."]);
    yield* git(updater, ["config", "user.email", "test@test.com"]);
    yield* git(updater, ["config", "user.name", "Test"]);
    yield* writeTextFile(updater, "remote.txt", "remote\n");
    yield* git(updater, ["add", "remote.txt"]);
    yield* git(updater, ["commit", "-m", "remote commit"]);
    yield* git(updater, ["push", "origin", initialBranch]);
    return { cwd, remoteHead: yield* git(updater, ["rev-parse", "HEAD"]) };
  });

  it.effect.each(["stdout", "stderr"] as const)(
    "reports a fast-forward whose %s passes the cap as pulled",
    (stream) =>
      Effect.scoped(
        Effect.gen(function* () {
          const driver = yield* withPaddedPull(stream);
          yield* Effect.gen(function* () {
            const { cwd, remoteHead } = yield* cloneBehindRemote;

            const result = yield* driver.pullCurrentBranch(cwd);

            assert.equal(result.status, "pulled");
            assert.equal(yield* git(cwd, ["rev-parse", "HEAD"]), remoteHead);
          }).pipe(Effect.provideService(GitVcsDriver.GitVcsDriver, driver));
        }),
      ).pipe(Effect.provide(layerServerConfig.pipe(Layer.provideMerge(NodeServices.layer)))),
  );

  it.effect("still fails a pull that Git rejects, whatever its output size", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const driver = yield* withPaddedPull("stderr");
        yield* Effect.gen(function* () {
          const { cwd } = yield* cloneBehindRemote;
          // A local commit the remote lacks: `pull --ff-only` cannot fast-forward and exits 128.
          yield* writeTextFile(cwd, "local.txt", "local\n");
          yield* git(cwd, ["add", "local.txt"]);
          yield* git(cwd, ["commit", "-m", "local commit"]);

          const error = yield* Effect.flip(driver.pullCurrentBranch(cwd));

          assert.equal(error.operation, "GitVcsDriver.pullCurrentBranch.pull");
          assert.equal(error.exitCode, 128);
          assert.notInclude(error.detail, "exceeded");
        }).pipe(Effect.provideService(GitVcsDriver.GitVcsDriver, driver));
      }),
    ).pipe(Effect.provide(layerServerConfig.pipe(Layer.provideMerge(NodeServices.layer)))),
  );
});

it.effect("retries an in-flight ref snapshot invalidated by a mutation", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const delegate = yield* ChildProcessSpawner.ChildProcessSpawner;
      const firstWorktreeScanStarted = yield* Deferred.make<void>();
      const firstRefScanCompleted = yield* Deferred.make<void>();
      const releaseFirstWorktreeScan = yield* Deferred.make<void>();
      const delayFirstWorktreeScan = yield* Ref.make(true);
      const refScans = yield* Ref.make(0);
      const coordinatingSpawner = ChildProcessSpawner.make((command) =>
        Effect.gen(function* () {
          if (!ChildProcess.isStandardCommand(command)) {
            return yield* Effect.die("expected a standard Git command");
          }
          const isWorktreeScan =
            command.args.includes("worktree") && command.args.includes("--porcelain");
          if (isWorktreeScan && (yield* Ref.getAndSet(delayFirstWorktreeScan, false))) {
            yield* Deferred.succeed(firstWorktreeScanStarted, undefined);
            yield* Deferred.await(releaseFirstWorktreeScan);
          }
          const handle = yield* delegate.spawn(command);
          const isRefScan =
            command.args.includes("for-each-ref") &&
            command.args.includes("refs/heads") &&
            command.args.includes("refs/remotes");
          if (!isRefScan) return handle;
          const scan = yield* Ref.updateAndGet(refScans, (count) => count + 1);
          return scan === 1
            ? ChildProcessSpawner.makeHandle({
                ...handle,
                exitCode: handle.exitCode.pipe(
                  Effect.tap(() => Deferred.succeed(firstRefScanCompleted, undefined)),
                ),
              })
            : handle;
        }),
      );
      const driver = yield* makeGitVcsDriverCore().pipe(
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, coordinatingSpawner),
      );
      const cwd = yield* makeTmpDir();
      yield* initRepoWithCommit(cwd).pipe(Effect.provideService(GitVcsDriver.GitVcsDriver, driver));

      const inFlight = yield* driver
        .listRefs({ cwd, refresh: true, limit: 100 })
        .pipe(Effect.forkChild({ startImmediately: true }));
      yield* Deferred.await(firstWorktreeScanStarted);
      yield* Deferred.await(firstRefScanCompleted);

      yield* driver.createRef({ cwd, refName: "feature/during-refresh" });
      yield* Deferred.succeed(releaseFirstWorktreeScan, undefined);

      const refs = yield* Fiber.join(inFlight);
      assert.isTrue(refs.refs.some((ref) => ref.name === "feature/during-refresh"));
      assert.equal(yield* Ref.get(refScans), 2);
    }),
  ).pipe(Effect.provide(layerServerConfig.pipe(Layer.provideMerge(NodeServices.layer)))),
);

it.effect("invalidates a ref snapshot when a mutation fails after changing Git", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const delegate = yield* ChildProcessSpawner.ChildProcessSpawner;
      const partiallyFailingSpawner = ChildProcessSpawner.make((command) =>
        Effect.gen(function* () {
          if (!ChildProcess.isStandardCommand(command)) {
            return yield* Effect.die("expected a standard Git command");
          }
          if (command.args[0] === "branch" && command.args[1] === "feature/partial-failure") {
            const handle = yield* delegate.spawn(command);
            yield* handle.exitCode;
            return makeNonRepositoryHandle();
          }
          return yield* delegate.spawn(command);
        }),
      );
      const driver = yield* makeGitVcsDriverCore().pipe(
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, partiallyFailingSpawner),
      );
      const cwd = yield* makeTmpDir();
      yield* initRepoWithCommit(cwd).pipe(Effect.provideService(GitVcsDriver.GitVcsDriver, driver));
      yield* driver.listRefs({ cwd, refresh: true });

      yield* driver.createRef({ cwd, refName: "feature/partial-failure" }).pipe(Effect.flip);

      const refs = yield* driver.listRefs({ cwd });
      assert.isTrue(refs.refs.some((ref) => ref.name === "feature/partial-failure"));
    }),
  ).pipe(Effect.provide(layerServerConfig.pipe(Layer.provideMerge(NodeServices.layer)))),
);

it.effect("fails a ref snapshot when for-each-ref exits unsuccessfully", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const delegate = yield* ChildProcessSpawner.ChildProcessSpawner;
      const snapshotAttempts = yield* Ref.make(0);
      const failingSnapshotSpawner = ChildProcessSpawner.make((command) =>
        Effect.gen(function* () {
          if (!ChildProcess.isStandardCommand(command)) {
            return yield* Effect.die("expected a standard Git command");
          }
          if (command.args.includes("for-each-ref")) {
            yield* Ref.update(snapshotAttempts, (count) => count + 1);
            return makeNonRepositoryHandle();
          }
          return yield* delegate.spawn(command);
        }),
      );
      const driver = yield* makeGitVcsDriverCore().pipe(
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, failingSnapshotSpawner),
      );
      const cwd = yield* makeTmpDir();
      yield* initRepoWithCommit(cwd).pipe(Effect.provideService(GitVcsDriver.GitVcsDriver, driver));

      const error = yield* driver.listRefs({ cwd, refresh: true }).pipe(Effect.flip);

      assert.deepInclude(error, {
        _tag: "GitCommandError",
        operation: "GitVcsDriver.listRefs.snapshotRefs",
        detail: "Git ref snapshot enumeration failed.",
        exitCode: 128,
      });
      assert.equal(yield* Ref.get(snapshotAttempts), 1);
    }),
  ).pipe(Effect.provide(layerServerConfig.pipe(Layer.provideMerge(NodeServices.layer)))),
);

it.effect("marks the current branch when worktree metadata is unavailable", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const delegate = yield* ChildProcessSpawner.ChildProcessSpawner;
      const incompleteMetadataSpawner = ChildProcessSpawner.make((command) =>
        Effect.gen(function* () {
          if (!ChildProcess.isStandardCommand(command)) {
            return yield* Effect.die("expected a standard Git command");
          }
          const isWorktreeRoot =
            command.args.includes("rev-parse") && command.args.includes("--show-toplevel");
          const isWorktreeList =
            command.args.includes("worktree") && command.args.includes("--porcelain");
          if (isWorktreeRoot || isWorktreeList) {
            return makeNonRepositoryHandle();
          }
          return yield* delegate.spawn(command);
        }),
      );
      const driver = yield* makeGitVcsDriverCore().pipe(
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, incompleteMetadataSpawner),
      );
      const cwd = yield* makeTmpDir();
      const { initialBranch } = yield* initRepoWithCommit(cwd).pipe(
        Effect.provideService(GitVcsDriver.GitVcsDriver, driver),
      );

      const refs = yield* driver.listRefs({ cwd, refresh: true });

      assert.isTrue(refs.isRepo);
      assert.isTrue(refs.refs.find((ref) => ref.name === initialBranch)?.current);
    }),
  ).pipe(Effect.provide(layerServerConfig.pipe(Layer.provideMerge(NodeServices.layer)))),
);

it.effect("ignores worktree metadata for directories that no longer exist", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const delegate = yield* ChildProcessSpawner.ChildProcessSpawner;
      const missingWorktreePath = "/missing/deleted-worktree";
      const staleWorktreeSpawner = ChildProcessSpawner.make((command) =>
        Effect.gen(function* () {
          if (!ChildProcess.isStandardCommand(command)) {
            return yield* Effect.die("expected a standard Git command");
          }
          const isWorktreeList =
            command.args.includes("worktree") && command.args.includes("--porcelain");
          if (isWorktreeList) {
            return makeSuccessfulHandle(
              `worktree ${missingWorktreePath}\0HEAD deadbeef\0branch refs/heads/stale-worktree\0\0`,
            );
          }
          return yield* delegate.spawn(command);
        }),
      );
      const driver = yield* makeGitVcsDriverCore().pipe(
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, staleWorktreeSpawner),
      );
      const cwd = yield* makeTmpDir();
      yield* initRepoWithCommit(cwd).pipe(Effect.provideService(GitVcsDriver.GitVcsDriver, driver));
      yield* git(cwd, ["branch", "stale-worktree"]).pipe(
        Effect.provideService(GitVcsDriver.GitVcsDriver, driver),
      );

      const refs = yield* driver.listRefs({ cwd, refresh: true });

      assert.equal(refs.refs.find((ref) => ref.name === "stale-worktree")?.worktreePath, null);
    }),
  ).pipe(Effect.provide(layerServerConfig.pipe(Layer.provideMerge(NodeServices.layer)))),
);

it.effect("reads worktrees from git that rejects worktree list -z", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const delegate = yield* ChildProcessSpawner.ChildProcessSpawner;
      // Git before 2.36 has no `worktree list -z` and exits with a usage error.
      const oldGitSpawner = ChildProcessSpawner.make((command) =>
        Effect.gen(function* () {
          if (!ChildProcess.isStandardCommand(command)) {
            return yield* Effect.die("expected a standard Git command");
          }
          if (command.args.includes("worktree") && command.args.includes("-z")) {
            return ChildProcessSpawner.makeHandle({
              pid: ChildProcessSpawner.ProcessId(1),
              exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(129)),
              isRunning: Effect.succeed(false),
              kill: () => Effect.void,
              unref: Effect.succeed(Effect.void),
              stdin: Sink.drain,
              stdout: Stream.empty,
              stderr: Stream.encodeText(Stream.make("error: unknown switch `z'")),
              all: Stream.empty,
              getInputFd: () => Sink.drain,
              getOutputFd: () => Stream.empty,
            });
          }
          return yield* delegate.spawn(command);
        }),
      );
      const driver = yield* makeGitVcsDriverCore().pipe(
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, oldGitSpawner),
      );
      const cwd = yield* makeTmpDir();
      yield* initRepoWithCommit(cwd).pipe(Effect.provideService(GitVcsDriver.GitVcsDriver, driver));
      const worktreePath = NodeFS.realpathSync.native(yield* makeTmpDir());
      yield* git(cwd, ["worktree", "add", "-b", "feature/old-git", worktreePath]).pipe(
        Effect.provideService(GitVcsDriver.GitVcsDriver, driver),
      );

      const refs = yield* driver.listRefs({ cwd, refresh: true });
      const listedPath = refs.refs.find((ref) => ref.name === "feature/old-git")?.worktreePath;
      assert.equal(listedPath && NodeFS.realpathSync.native(listedPath), worktreePath);

      const paths = yield* driver.listWorktreePaths(cwd);
      assert.include(
        paths.map((listed) => NodeFS.realpathSync.native(listed)),
        worktreePath,
      );
    }),
  ).pipe(Effect.provide(layerServerConfig.pipe(Layer.provideMerge(NodeServices.layer)))),
);

it.effect("refreshes the current branch after an external checkout", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const driver = yield* GitVcsDriver.GitVcsDriver;
      const cwd = yield* makeTmpDir();
      const { initialBranch } = yield* initRepoWithCommit(cwd);
      yield* git(cwd, ["branch", "external-checkout"]);

      const initialRefs = yield* driver.listRefs({ cwd, refresh: true });
      assert.isTrue(initialRefs.refs.find((ref) => ref.name === initialBranch)?.current);

      // Raw execute intentionally bypasses the driver's mutation invalidation,
      // matching a checkout performed by another process.
      yield* driver.execute({
        operation: "GitVcsDriver.test.externalCheckout",
        cwd,
        args: ["checkout", "external-checkout"],
        timeoutMs: 10_000,
      });
      yield* TestClock.adjust("6 seconds");

      const refreshedRefs = yield* driver.listRefs({ cwd, refresh: true });
      assert.isTrue(refreshedRefs.refs.find((ref) => ref.name === "external-checkout")?.current);
      assert.isFalse(refreshedRefs.refs.find((ref) => ref.name === initialBranch)?.current);
    }),
  ).pipe(Effect.provide(layerTest)),
);

it.effect("backs off and logs failed fetch attempts across linked worktrees", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const delegate = yield* ChildProcessSpawner.ChildProcessSpawner;
      const fetchAttempts = yield* Ref.make(0);
      const failingFetchSpawner = ChildProcessSpawner.make((command) =>
        Effect.gen(function* () {
          if (!ChildProcess.isStandardCommand(command)) {
            return yield* Effect.die("expected a standard Git command");
          }
          if (command.args.includes("fetch") && command.args.includes("--quiet")) {
            yield* Ref.update(fetchAttempts, (count) => count + 1);
            return makeNonRepositoryHandle();
          }
          return yield* delegate.spawn(command);
        }),
      );
      const driver = yield* makeGitVcsDriverCore().pipe(
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, failingFetchSpawner),
      );
      const warnings: string[] = [];
      const logger = Logger.make<unknown, void>(({ message }) => {
        warnings.push(String(message));
      });
      const readRemoteStatus = (workingDirectory: string) =>
        driver
          .statusDetailsRemote(workingDirectory)
          .pipe(Effect.provideService(Logger.CurrentLoggers, new Set([logger])));
      const cwd = yield* makeTmpDir();
      const remote = yield* makeTmpDir("git-vcs-driver-remote-");
      const worktreesRoot = yield* makeTmpDir("git-vcs-driver-worktrees-");
      const pathService = yield* Path.Path;
      const worktreePath = pathService.join(worktreesRoot, "linked");
      const runGit = (workingDirectory: string, args: ReadonlyArray<string>) =>
        driver.execute({
          operation: "GitVcsDriver.test.upstreamRefreshBackoff",
          cwd: workingDirectory,
          args,
          timeoutMs: 10_000,
        });

      yield* driver.initRepo({ cwd });
      yield* runGit(cwd, ["config", "user.email", "test@test.com"]);
      yield* runGit(cwd, ["config", "user.name", "Test"]);
      yield* writeTextFile(cwd, "README.md", "# test\n");
      yield* runGit(cwd, ["add", "."]);
      yield* runGit(cwd, ["commit", "-m", "initial commit"]);
      const initialBranch = (yield* runGit(cwd, ["branch", "--show-current"])).stdout.trim();
      yield* runGit(remote, ["init", "--bare"]);
      yield* runGit(cwd, ["remote", "add", "origin", remote]);
      yield* runGit(cwd, ["push", "-u", "origin", initialBranch]);
      yield* runGit(cwd, ["worktree", "add", "-b", "feature/linked", worktreePath]);
      yield* runGit(worktreePath, [
        "branch",
        "--set-upstream-to",
        `origin/${initialBranch}`,
        "feature/linked",
      ]);
      const rootCommonDir = (yield* runGit(cwd, ["rev-parse", "--git-common-dir"])).stdout.trim();
      const linkedCommonDir = (yield* runGit(worktreePath, [
        "rev-parse",
        "--git-common-dir",
      ])).stdout.trim();
      // Native realpath, since git reports the long form of a directory the
      // temp dir may name by its 8.3 short form on Windows.
      assert.equal(
        NodeFS.realpathSync.native(pathService.resolve(cwd, rootCommonDir)),
        NodeFS.realpathSync.native(pathService.resolve(worktreePath, linkedCommonDir)),
      );
      yield* Ref.set(fetchAttempts, 0);

      yield* readRemoteStatus(cwd);
      yield* readRemoteStatus(worktreePath);
      assert.equal(yield* Ref.get(fetchAttempts), 1);
      assert.lengthOf(warnings, 1);
      assert.include(warnings[0], "Background Git fetch failed");

      yield* TestClock.adjust("29 seconds");
      yield* readRemoteStatus(worktreePath);
      assert.equal(yield* Ref.get(fetchAttempts), 1);
      assert.lengthOf(warnings, 1);

      yield* TestClock.adjust("1 second");
      yield* readRemoteStatus(cwd);
      assert.equal(yield* Ref.get(fetchAttempts), 2);
      assert.lengthOf(warnings, 2);

      yield* TestClock.adjust("59 seconds");
      yield* readRemoteStatus(worktreePath);
      assert.equal(yield* Ref.get(fetchAttempts), 2);
      assert.lengthOf(warnings, 2);

      yield* TestClock.adjust("1 second");
      yield* readRemoteStatus(cwd);
      assert.equal(yield* Ref.get(fetchAttempts), 3);
      assert.lengthOf(warnings, 3);
    }),
  ).pipe(Effect.provide(layerServerConfig.pipe(Layer.provideMerge(NodeServices.layer)))),
);

it.effect.each([
  {
    name: "HTTPS credentials",
    stderr: "fatal: Authentication failed for",
    expected: "could not authenticate",
  },
  {
    name: "SSH credentials",
    stderr: "git@example.com: Permission denied (publickey).",
    expected: "could not authenticate",
  },
  {
    name: "disabled prompts",
    stderr: "fatal: could not read Username: terminal prompts disabled",
    expected: "could not authenticate",
  },
  {
    name: "DNS failure",
    stderr: "fatal: Could not resolve host: example.com",
    expected: "could not reach the remote",
  },
  {
    name: "connection failure",
    stderr: "ssh: connect to host example.com port 22: Connection refused",
    expected: "could not reach the remote",
  },
  {
    name: "missing remote",
    stderr: "remote: Repository not found.",
    expected: "could not access the remote repository",
  },
  {
    name: "invalid remote",
    stderr: "fatal: remote does not appear to be a git repository",
    expected: "could not access the remote repository",
  },
  {
    name: "reference lock",
    stderr: "error: cannot lock ref 'refs/remotes/origin/main': is at abc but expected def",
    expected: "could not update a local reference",
  },
  {
    name: "lock file",
    stderr: "fatal: Unable to create '/repo/.git/FETCH_HEAD.lock': File exists.",
    expected: "could not update a local reference",
  },
  {
    name: "unrelated remote chatter",
    stderr:
      "remote: Help: authentication failed, connection refused, cannot lock ref\nremote: unrelated service error",
    expected: "git fetch origin failed",
  },
  {
    name: "HTTPS DNS failure",
    stderr:
      "fatal: unable to access 'https://example.com/repo.git/': Could not resolve host: example.com",
    expected: "could not reach the remote",
  },
  {
    name: "unknown failure",
    stderr: "fatal: unexpected remote failure",
    expected: "git fetch origin failed",
  },
] as const)("reports $name during fetch without retaining remote output", (scenario) =>
  Effect.gen(function* () {
    const secret = "secret-fetch-token";
    const stderr = `${scenario.stderr}\nhttps://user:${secret}@example.com/private?token=${secret}`;
    const attempts = yield* Ref.make(0);
    const spawner = ChildProcessSpawner.make((command) =>
      Effect.gen(function* () {
        if (!ChildProcess.isStandardCommand(command))
          return yield* Effect.die("expected Git command");
        if (command.args[0] !== "fetch") return makeNonRepositoryHandle();
        assert.deepEqual(command.args, ["fetch", "--quiet", "origin"]);
        assert.equal(command.options.env?.LC_ALL, "C");
        assert.equal(command.options.env?.GIT_TERMINAL_PROMPT, "0");
        yield* Ref.update(attempts, (count) => count + 1);
        return ChildProcessSpawner.makeHandle({
          pid: ChildProcessSpawner.ProcessId(1),
          exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(128)),
          isRunning: Effect.succeed(false),
          kill: () => Effect.void,
          unref: Effect.succeed(Effect.void),
          stdin: Sink.drain,
          stdout: Stream.encodeText(Stream.make(secret)),
          stderr: Stream.encodeText(Stream.make(stderr)),
          all: Stream.empty,
          getInputFd: () => Sink.drain,
          getOutputFd: () => Stream.empty,
        });
      }),
    );
    const driver = yield* makeGitVcsDriverCore().pipe(
      Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
    );
    const cwd = yield* makeTmpDir();
    const error = yield* driver.fetchRemote({ cwd, remoteName: "origin" }).pipe(Effect.flip);
    assert.include(error.detail, scenario.expected);
    assert.equal(error.exitCode, 128);
    assert.equal(error.stderrLength, stderr.length);
    assert.equal(error.stdoutLength, secret.length);
    assert.notInclude(error.message, secret);
    assert.notInclude(yield* encodeGitCommandError(error), secret);
    assert.notProperty(error, "stderr");
    assert.notProperty(error, "args");
    assert.equal(yield* Ref.get(attempts), 1);
  }).pipe(Effect.provide(layerServerConfig.pipe(Layer.provideMerge(NodeServices.layer)))),
);

it.layer(layerTest)("GitVcsDriver core integration", (it) => {
  describe("process environment", () => {
    it.effect("preserves the caller locale for general Git subprocesses", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();

        const locale = yield* git(
          cwd,
          ["-c", 'alias.print-locale=!printf "%s" "$LC_ALL"', "print-locale"],
          { LC_ALL: "zh_CN.UTF-8" },
        );

        assert.equal(locale, "zh_CN.UTF-8");
      }),
    );
  });

  describe("structured errors", () => {
    it.effect("preserves structured spawn context and the platform cause", () =>
      Effect.gen(function* () {
        const parent = yield* makeTmpDir();
        const pathService = yield* Path.Path;
        const cwd = pathService.join(parent, "missing");
        const driver = yield* GitVcsDriver.GitVcsDriver;

        const error = yield* driver
          .execute({
            operation: "GitVcsDriver.test.missingCwd",
            cwd,
            args: ["status", "--short"],
          })
          .pipe(Effect.flip);

        assert.deepInclude(error, {
          _tag: "GitCommandError",
          operation: "GitVcsDriver.test.missingCwd",
          command: "git",
          argumentCount: 2,
          cwd,
          detail: "Failed to spawn Git process.",
        });
        if (!(error.cause instanceof PlatformError.PlatformError)) {
          return assert.fail("expected the original platform error cause");
        }
        assert.equal(error.cause.reason._tag, "NotFound");
        assert.notInclude(error.detail, error.cause.message);
      }),
    );

    it.effect("does not retain git arguments or stderr in command failures", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        const driver = yield* GitVcsDriver.GitVcsDriver;
        yield* driver.initRepo({ cwd });

        const secret = "secret-token-value";
        const error = yield* driver
          .execute({
            operation: "GitVcsDriver.test.redactedFailure",
            cwd,
            args: ["status", `--unknown-option=${secret}`],
          })
          .pipe(Effect.flip);

        assert.deepInclude(error, {
          _tag: "GitCommandError",
          operation: "GitVcsDriver.test.redactedFailure",
          command: "git",
          argumentCount: 2,
          cwd,
        });
        assert.isNumber(error.exitCode);
        assert.isAbove(error.stderrLength ?? 0, 0);
        assert.notInclude(error.detail, secret);
        assert.notInclude(error.message, secret);
        assert.notProperty(error, "args");
        assert.notProperty(error, "stderr");
        assert.notProperty(error, "reason");
      }),
    );

    it.effect("names the branch conflict behind a failed worktree add", () =>
      Effect.gen(function* () {
        const parent = yield* makeTmpDir();
        const pathService = yield* Path.Path;
        const cwd = pathService.join(parent, "repo");
        const fileSystem = yield* FileSystem.FileSystem;
        yield* fileSystem.makeDirectory(cwd);
        const driver = yield* GitVcsDriver.GitVcsDriver;
        yield* initRepoWithCommit(cwd);
        const firstWorktree = pathService.join(parent, "first");
        yield* git(cwd, ["worktree", "add", firstWorktree, "-b", "shared-branch"]);

        const error = yield* driver
          .execute({
            operation: "GitVcsDriver.test.worktreeAddConflict",
            cwd,
            args: ["worktree", "add", pathService.join(parent, "second"), "shared-branch"],
            env: { LC_ALL: "C" },
          })
          .pipe(Effect.flip);

        assert.deepInclude(error, {
          _tag: "GitCommandError",
          operation: "GitVcsDriver.test.worktreeAddConflict",
          reason: "branch_checked_out_in_worktree",
        });
        assert.include(error.message, "(branch_checked_out_in_worktree)");
        assert.notInclude(error.message, firstWorktree);
      }),
    );

    it.effect("names a missing repository behind a failed command", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        const driver = yield* GitVcsDriver.GitVcsDriver;

        const error = yield* driver
          .execute({
            operation: "GitVcsDriver.test.notARepository",
            cwd,
            args: ["rev-parse", "--abbrev-ref", "HEAD"],
            env: { LC_ALL: "C" },
          })
          .pipe(Effect.flip);

        assert.deepInclude(error, {
          _tag: "GitCommandError",
          operation: "GitVcsDriver.test.notARepository",
          reason: "not_a_repository",
        });
        assert.include(error.message, "(not_a_repository)");
      }),
    );

    it.effect("appends the reason tag to a caller-supplied detail", () =>
      Effect.gen(function* () {
        const parent = yield* makeTmpDir();
        const pathService = yield* Path.Path;
        const cwd = pathService.join(parent, "repo");
        const fileSystem = yield* FileSystem.FileSystem;
        yield* fileSystem.makeDirectory(cwd);
        const driver = yield* GitVcsDriver.GitVcsDriver;
        yield* initRepoWithCommit(cwd);
        yield* git(cwd, [
          "worktree",
          "add",
          pathService.join(parent, "taken"),
          "-b",
          "taken-branch",
        ]);

        const error = yield* driver
          .createWorktree({
            cwd,
            refName: "taken-branch",
            path: pathService.join(parent, "second"),
          })
          .pipe(Effect.flip);

        assert.equal(error.detail, "git worktree add failed");
        assert.include(error.message, "git worktree add failed (branch_checked_out_in_worktree)");
      }),
    );

    it.effect.each([
      {
        label: "a refused key",
        sshMessage: "git@example.invalid: Permission denied (publickey).",
        expectedReason: "authentication_failed" as const,
        expectedText: "(authentication_failed)",
      },
      {
        label: "a refused key among several methods",
        sshMessage: "git@example.invalid: Permission denied (publickey,password).",
        expectedReason: "authentication_failed" as const,
        expectedText: "(authentication_failed)",
      },
      {
        label: "a refused keyboard-interactive attempt",
        sshMessage: "git@example.invalid: Permission denied (keyboard-interactive).",
        expectedReason: "authentication_failed" as const,
        expectedText: "(authentication_failed)",
      },
      {
        label: "a rejected password",
        sshMessage: "Permission denied, please try again.",
        expectedReason: "authentication_failed" as const,
        expectedText: "(authentication_failed)",
      },
      {
        label: "an untrusted host key",
        sshMessage: "Host key verification failed.",
        expectedReason: "host_key_unverified" as const,
        expectedText: "(host_key_unverified)",
      },
    ])(
      "names $label rather than an unreachable remote",
      ({ sshMessage, expectedReason, expectedText }) =>
        Effect.gen(function* () {
          const parent = yield* makeTmpDir();
          const pathService = yield* Path.Path;
          const cwd = pathService.join(parent, "repo");
          const fileSystem = yield* FileSystem.FileSystem;
          const driver = yield* GitVcsDriver.GitVcsDriver;
          yield* fileSystem.makeDirectory(cwd);
          yield* initRepoWithCommit(cwd);
          yield* git(cwd, ["remote", "add", "origin", "git@example.invalid:owner/repo.git"]);
          // Stands in for ssh, which prints its refusal unprefixed and leaves
          // git to add only a generic "could not read" line after it.
          const fakeSsh = pathService.join(parent, "fake-ssh");
          yield* writeTextFile(
            parent,
            "fake-ssh",
            `#!/bin/sh\necho "${sshMessage}" >&2\nexit 255\n`,
          );
          yield* fileSystem.chmod(fakeSsh, 0o755);

          const error = yield* driver
            .execute({
              operation: "GitVcsDriver.test.sshRefusal",
              cwd,
              args: ["fetch", "origin"],
              env: { LC_ALL: "C", GIT_SSH_COMMAND: fakeSsh },
            })
            .pipe(Effect.flip);

          assert.deepInclude(error, { reason: expectedReason });
          assert.include(error.message, expectedText);
        }),
    );

    it.effect("does not read a filesystem permission error as an ssh refusal", () =>
      Effect.gen(function* () {
        const parent = yield* makeTmpDir();
        const pathService = yield* Path.Path;
        const cwd = pathService.join(parent, "repo");
        const fileSystem = yield* FileSystem.FileSystem;
        const driver = yield* GitVcsDriver.GitVcsDriver;
        yield* fileSystem.makeDirectory(cwd);
        yield* initRepoWithCommit(cwd);
        yield* git(cwd, ["remote", "add", "origin", "git@example.invalid:owner/repo.git"]);
        const fakeSsh = pathService.join(parent, "fake-ssh");
        yield* writeTextFile(
          parent,
          "fake-ssh",
          '#!/bin/sh\necho "fatal: cannot open backup file: Permission denied (os error 13)" >&2\nexit 255\n',
        );
        yield* fileSystem.chmod(fakeSsh, 0o755);

        const error = yield* driver
          .execute({
            operation: "GitVcsDriver.test.osPermission",
            cwd,
            args: ["fetch", "origin"],
            env: { LC_ALL: "C", GIT_SSH_COMMAND: fakeSsh },
          })
          .pipe(Effect.flip);

        assert.notInclude(error.message, "(authentication_failed)");
      }),
    );

    it.effect("does not read remote hook output as a git failure reason", () =>
      Effect.gen(function* () {
        const parent = yield* makeTmpDir();
        const pathService = yield* Path.Path;
        const remote = pathService.join(parent, "origin.git");
        const cwd = pathService.join(parent, "work");
        const fileSystem = yield* FileSystem.FileSystem;
        const driver = yield* GitVcsDriver.GitVcsDriver;
        yield* fileSystem.makeDirectory(cwd);
        yield* initRepoWithCommit(cwd);
        yield* git(cwd, ["init", "--bare", remote]);
        yield* git(cwd, ["remote", "add", "origin", remote]);
        // Git prefixes everything the server says with `remote:`, so a remote
        // hook can put arbitrary text in front of the classifier.
        const preReceive = pathService.join(remote, "hooks", "pre-receive");
        yield* writeTextFile(
          remote,
          "hooks/pre-receive",
          '#!/bin/sh\necho "authentication failed" >&2\necho "Permission denied (publickey)." >&2\necho "Host key verification failed." >&2\nexit 1\n',
        );
        yield* fileSystem.chmod(preReceive, 0o755);

        const error = yield* driver
          .execute({
            operation: "GitVcsDriver.test.remoteHookOutput",
            cwd,
            args: ["push", "origin", "HEAD"],
            env: { LC_ALL: "C" },
          })
          .pipe(Effect.flip);

        assert.notProperty(error, "reason");
        assert.notInclude(error.message, "(authentication_failed)");
      }),
    );

    it.effect("does not read hook output as a git failure reason", () =>
      Effect.gen(function* () {
        const parent = yield* makeTmpDir();
        const pathService = yield* Path.Path;
        const remote = pathService.join(parent, "origin.git");
        const cwd = pathService.join(parent, "work");
        const fileSystem = yield* FileSystem.FileSystem;
        const driver = yield* GitVcsDriver.GitVcsDriver;
        yield* fileSystem.makeDirectory(cwd);
        yield* initRepoWithCommit(cwd);
        yield* git(cwd, ["init", "--bare", remote]);
        yield* git(cwd, ["remote", "add", "origin", remote]);
        yield* writeTextFile(
          cwd,
          ".git/hooks/pre-push",
          '#!/bin/sh\necho "authentication failed" >&2\nexit 1\n',
        );
        yield* fileSystem.chmod(pathService.join(cwd, ".git/hooks/pre-push"), 0o755);

        const error = yield* driver
          .execute({
            operation: "GitVcsDriver.test.hookOutput",
            cwd,
            args: ["push", "origin", "HEAD"],
            env: { LC_ALL: "C" },
          })
          .pipe(Effect.flip);

        assert.notProperty(error, "reason");
        assert.notInclude(error.message, "(authentication_failed)");
      }),
    );

    it.effect("leaves a tag collision unclassified rather than calling it a path", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        const driver = yield* GitVcsDriver.GitVcsDriver;
        yield* initRepoWithCommit(cwd);
        yield* git(cwd, ["tag", "v1"]);

        const error = yield* driver
          .execute({
            operation: "GitVcsDriver.test.tagCollision",
            cwd,
            args: ["tag", "v1"],
            env: { LC_ALL: "C" },
          })
          .pipe(Effect.flip);

        assert.notProperty(error, "reason");
        assert.notInclude(error.message, "(path_already_exists)");
      }),
    );

    it.effect("keeps line callbacks flowing past the output cap when asked", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        const driver = yield* GitVcsDriver.GitVcsDriver;
        // 4 KiB of multi-byte lines, well past a 512-byte cap; the last line
        // is the one a failure surface would need.
        const lines: Array<string> = [];
        const result = yield* driver.execute({
          operation: "GitVcsDriver.test.callbacksPastCap",
          cwd,
          args: [
            "-c",
            'alias.spew=!for i in $(seq 1 128); do printf "é%03d\\n" $i >&2; done; echo fatal: last line >&2',
            "spew",
          ],
          maxOutputBytes: 512,
          appendTruncationMarker: true,
          keepLineCallbacksAfterTruncation: true,
          progress: { onStderrLine: (line) => Effect.sync(() => void lines.push(line)) },
        });

        assert.isTrue(result.stderrTruncated);
        assert.isAtMost(result.stderr.length, 600);
        assert.equal(lines.length, 129);
        assert.equal(lines[0], "é001");
        assert.equal(lines[127], "é128");
        assert.equal(lines.at(-1), "fatal: last line");
        // No replacement characters: the cap landing inside "é" is invisible to callbacks.
        assert.isFalse(lines.some((line) => line.includes("\uFFFD")));
      }),
    );

    it.effect("recovers a structurally identified missing cwd as a non-repository", () =>
      Effect.gen(function* () {
        const parent = yield* makeTmpDir();
        const pathService = yield* Path.Path;
        const cwd = pathService.join(parent, "missing");
        const driver = yield* GitVcsDriver.GitVcsDriver;

        const [localStatus, remoteStatus, refs] = yield* Effect.all([
          driver.statusDetails(cwd),
          driver.statusDetailsRemote(cwd, { refreshUpstream: false }),
          driver.listRefs({ cwd }),
        ]);

        assert.equal(localStatus.isRepo, false);
        assert.equal(remoteStatus.isRepo, false);
        assert.equal(refs.isRepo, false);
        assert.deepStrictEqual(refs.refs, []);
      }),
    );

    it.effect("does not wrap a remove-worktree command failure in a synthetic error", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        const pathService = yield* Path.Path;
        const fileSystem = yield* FileSystem.FileSystem;
        const notAWorktree = pathService.join(cwd, "not-a-worktree");
        yield* fileSystem.makeDirectory(notAWorktree);
        const driver = yield* GitVcsDriver.GitVcsDriver;
        yield* driver.initRepo({ cwd });

        const error = yield* driver.removeWorktree({ cwd, path: notAWorktree }).pipe(Effect.flip);

        assert.deepInclude(error, {
          _tag: "GitCommandError",
          operation: "GitVcsDriver.removeWorktree",
          command: "git",
          argumentCount: 5,
          cwd,
        });
        assert.notProperty(error, "cause");
        assert.notProperty(error, "stderr");
        assert.notInclude(error.detail, "Git command failed in");
      }),
    );
  });
});

describe("Windows long path configuration", () => {
  const readGitConfig = Effect.fn("readGitConfig")(function* (
    platform: NodeJS.Platform,
    key: string,
  ) {
    const layer = GitVcsDriver.layer.pipe(
      Layer.provide(layerServerConfig),
      Layer.provideMerge(NodeServices.layer),
      Layer.provide(Layer.succeed(HostProcessPlatform, platform)),
    );
    return yield* Effect.gen(function* () {
      const driver = yield* GitVcsDriver.GitVcsDriver;
      const cwd = yield* makeTmpDir("git-longpath-test-");
      const result = yield* driver.execute({
        operation: "GitVcsDriverTest.readGitConfig",
        cwd,
        args: ["config", "--get", key],
        // Replaces the suite's own core.longpaths=true so it cannot mask a
        // missing injection. Entry 2 sits past the count and must stay unread.
        env: {
          GIT_CONFIG_COUNT: "2",
          GIT_CONFIG_KEY_0: "user.name",
          GIT_CONFIG_VALUE_0: "inherited-name",
          GIT_CONFIG_KEY_1: "core.longpaths",
          GIT_CONFIG_VALUE_1: "false",
          GIT_CONFIG_KEY_2: "user.name",
          GIT_CONFIG_VALUE_2: "outside-count",
        },
      });
      return result.stdout.trim();
    }).pipe(Effect.provide(layer), Effect.scoped);
  });

  it.effect("enables long paths for every Git command on Windows", () =>
    Effect.gen(function* () {
      assert.equal(yield* readGitConfig("win32", "core.longpaths"), "true");
      assert.equal(yield* readGitConfig("win32", "user.name"), "inherited-name");
    }),
  );

  it.effect("leaves Git config untouched on other platforms", () =>
    Effect.gen(function* () {
      assert.equal(yield* readGitConfig("linux", "core.longpaths"), "false");
      assert.equal(yield* readGitConfig("linux", "user.name"), "inherited-name");
    }),
  );

  it("extends an inherited count spelled in a different case", () => {
    // Two spellings collapse to one on spawn (the uppercase one wins), so the
    // count must be bumped under the spelling that is already there.
    assert.deepStrictEqual(windowsLongPathConfigEnv("win32", { git_config_count: "2" }), {
      git_config_count: "3",
      GIT_CONFIG_KEY_2: "core.longpaths",
      GIT_CONFIG_VALUE_2: "true",
    });
  });

  it("appends after inherited entries, parsing the count as Git does", () => {
    for (const [count, next] of [
      [undefined, 0],
      ["", 0],
      ["0", 0],
      ["-0", 0],
      ["2", 2],
      [" 2", 2],
      ["+2", 2],
      ["02", 2],
    ] as const) {
      assert.deepStrictEqual(
        windowsLongPathConfigEnv("win32", count === undefined ? {} : { GIT_CONFIG_COUNT: count }),
        {
          GIT_CONFIG_COUNT: String(next + 1),
          [`GIT_CONFIG_KEY_${next}`]: "core.longpaths",
          [`GIT_CONFIG_VALUE_${next}`]: "true",
        },
        `GIT_CONFIG_COUNT=${JSON.stringify(count)}`,
      );
    }
  });

  it("leaves a count Git would reject for Git to report", () => {
    for (const count of ["nope", "2x", "-1", "1.5", "  ", "1 "]) {
      assert.deepStrictEqual(
        windowsLongPathConfigEnv("win32", { GIT_CONFIG_COUNT: count }),
        {},
        `GIT_CONFIG_COUNT=${JSON.stringify(count)}`,
      );
    }
  });
});
