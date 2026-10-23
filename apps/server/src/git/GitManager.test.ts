// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import { it } from "@effect/vitest";
import * as Duration from "effect/Duration";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as References from "effect/References";
import * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";
import { TestClock } from "effect/testing";
import { expect } from "vite-plus/test";
import type { GitManagerServiceError } from "@control/contracts";
import * as GitLabCli from "../sourceControl/GitLabCli.ts";
import * as VcsProcess from "../vcs/VcsProcess.ts";
import * as VcsDriverRegistry from "../vcs/VcsDriverRegistry.ts";
import * as VcsProjectConfig from "../vcs/VcsProjectConfig.ts";
import * as VcsStatusBroadcaster from "../vcs/VcsStatusBroadcaster.ts";
import * as BackgroundPolicy from "../background/BackgroundPolicy.ts";
import * as GitWorkflowService from "./GitWorkflowService.ts";
import * as GitLabSourceControlProvider from "../sourceControl/GitLabSourceControlProvider.ts";
import * as GitManager from "./GitManager.ts";
import {
  encodeCliJson,
  fakeGhOutput,
  makeTempDir,
  removePath,
  makeDirectory,
  runGit,
  initRepo,
  createBareRemote,
  configureRemote,
  configureVisibleRemoteUrlWithLocalRewrite,
  makeManager,
  layerGitManagerTest,
} from "./GitManager.testkit.ts";

it.layer(layerGitManagerTest)("GitManager", (it) => {
  it.effect("passive worktree status streams do not start remote refreshes", () =>
    Effect.gen(function* () {
      const repoDir = yield* makeTempDir("control-passive-vcs-");
      yield* initRepo(repoDir);
      const remoteDir = yield* createBareRemote();
      yield* runGit(repoDir, ["remote", "add", "origin", remoteDir]);
      yield* runGit(repoDir, ["push", "-u", "origin", "main"]);
      const worktreeDir = NodePath.join(repoDir, "worktree");
      yield* runGit(repoDir, ["worktree", "add", "-b", "feature/passive", worktreeDir]);
      yield* runGit(worktreeDir, ["push", "-u", "origin", "feature/passive"]);

      const { manager } = yield* makeManager();
      let remoteReads = 0;
      const workflowContext = yield* Layer.build(
        GitWorkflowService.layer.pipe(
          Layer.provide(
            Layer.succeed(GitManager.GitManager, {
              ...manager,
              remoteStatus: (input, options) =>
                manager.remoteStatus(input, options).pipe(
                  Effect.tap(() =>
                    Effect.sync(() => {
                      remoteReads += 1;
                    }),
                  ),
                ),
            }),
          ),
          Layer.provide(
            VcsDriverRegistry.layer.pipe(
              Layer.provide(VcsProjectConfig.layer),
              Layer.provide(VcsProcess.layer),
            ),
          ),
        ),
      );
      const broadcasterContext = yield* Layer.build(
        VcsStatusBroadcaster.layer.pipe(
          Layer.provide(
            Layer.succeed(
              GitWorkflowService.GitWorkflowService,
              Context.get(workflowContext, GitWorkflowService.GitWorkflowService),
            ),
          ),
          Layer.provide(
            Layer.mock(BackgroundPolicy.BackgroundPolicy)({
              hasDemand: () => Effect.succeed(true),
              shouldRunScopeWork: () => Effect.succeed(true),
            }),
          ),
        ),
      );
      const broadcaster = Context.get(
        broadcasterContext,
        VcsStatusBroadcaster.VcsStatusBroadcaster,
      );
      const passiveScope = yield* Scope.make();
      const snapshots = yield* Deferred.make<void, GitManagerServiceError>();
      const localUpdated = yield* Deferred.make<void>();
      const remoteUpdated = yield* Deferred.make<void>();
      let snapshotCount = 0;
      for (const cwd of [repoDir, worktreeDir]) {
        yield* Stream.runForEach(
          broadcaster.streamStatus(
            { cwd, includeRemote: false },
            { automaticRemoteRefreshInterval: Effect.succeed(Duration.seconds(1)) },
          ),
          (event) => {
            if (
              cwd === worktreeDir &&
              event._tag === "localUpdated" &&
              event.local.hasWorkingTreeChanges
            ) {
              return Deferred.succeed(localUpdated, undefined);
            }
            if (cwd === worktreeDir && event._tag === "remoteUpdated") {
              expect(event.remote?.hasUpstream).toBe(true);
              return Deferred.succeed(remoteUpdated, undefined);
            }
            if (event._tag !== "snapshot") return Effect.void;
            expect(event.local.isRepo).toBe(true);
            expect(event.local.refName).toBe(cwd === repoDir ? "main" : "feature/passive");
            snapshotCount += 1;
            return snapshotCount === 2 ? Deferred.succeed(snapshots, undefined) : Effect.void;
          },
        ).pipe(
          Effect.catchCause((cause) => Deferred.failCause(snapshots, cause)),
          Effect.forkIn(passiveScope),
        );
      }
      yield* Deferred.await(snapshots);
      expect(remoteReads).toBe(0);
      yield* TestClock.adjust("1 minute");
      expect(remoteReads).toBe(0);

      const fs = yield* FileSystem.FileSystem;
      yield* fs.writeFileString(NodePath.join(worktreeDir, "README.md"), "changed\n");
      yield* broadcaster.refreshLocalStatus(worktreeDir);
      yield* Deferred.await(localUpdated);
      expect(remoteReads).toBe(0);

      const activeScope = yield* Scope.make();
      yield* Stream.runDrain(broadcaster.streamStatus({ cwd: worktreeDir })).pipe(
        Effect.forkIn(activeScope),
      );
      yield* Deferred.await(remoteUpdated);
      expect(remoteReads).toBe(1);
      yield* Scope.close(activeScope, Exit.void);
      yield* TestClock.adjust("1 minute");
      expect(remoteReads).toBe(1);
      yield* Scope.close(passiveScope, Exit.void);
    }),
  );

  it.effect("status includes draft PR metadata when branch already has a draft PR", () =>
    Effect.gen(function* () {
      const repoDir = yield* makeTempDir("control-git-manager-");
      yield* initRepo(repoDir);
      yield* runGit(repoDir, ["checkout", "-b", "feature/status-open-pr"]);
      const remoteDir = yield* createBareRemote();
      yield* runGit(repoDir, ["remote", "add", "origin", remoteDir]);
      yield* runGit(repoDir, ["push", "-u", "origin", "feature/status-open-pr"]);

      const { manager } = yield* makeManager({
        ghScenario: {
          prListSequence: [
            JSON.stringify([
              {
                number: 13,
                title: "Existing PR",
                url: "https://github.com/pingdotgg/codething-mvp/pull/13",
                baseRefName: "main",
                headRefName: "feature/status-open-pr",
                isDraft: true,
              },
            ]),
          ],
        },
      });

      const status = yield* manager.status({ cwd: repoDir });
      expect(status.isRepo).toBe(true);
      expect(status.hasPrimaryRemote).toBe(true);
      expect(status.isDefaultRef).toBe(false);
      expect(status.refName).toBe("feature/status-open-pr");
      expect(status.pr).toEqual({
        number: 13,
        title: "Existing PR",
        url: "https://github.com/pingdotgg/codething-mvp/pull/13",
        baseRef: "main",
        headRef: "feature/status-open-pr",
        state: "open",
        isDraft: true,
        updatedAt: null,
      });
    }),
  );

  it.effect("status trims PR metadata returned by gh before publishing it", () =>
    Effect.gen(function* () {
      const repoDir = yield* makeTempDir("control-git-manager-");
      yield* initRepo(repoDir);
      yield* runGit(repoDir, ["checkout", "-b", "feature/status-trimmed-pr"]);
      const remoteDir = yield* createBareRemote();
      yield* runGit(repoDir, ["remote", "add", "origin", remoteDir]);
      yield* runGit(repoDir, ["push", "-u", "origin", "feature/status-trimmed-pr"]);

      const { manager } = yield* makeManager({
        ghScenario: {
          prListSequence: [
            JSON.stringify([
              {
                number: 14,
                title: "  Existing PR title  \n",
                url: " https://github.com/pingdotgg/codething-mvp/pull/14 ",
                baseRefName: " main ",
                headRefName: "\tfeature/status-trimmed-pr\t",
              },
            ]),
          ],
        },
      });

      const status = yield* manager.status({ cwd: repoDir });

      expect(status.pr).toEqual({
        number: 14,
        title: "Existing PR title",
        url: "https://github.com/pingdotgg/codething-mvp/pull/14",
        baseRef: "main",
        headRef: "feature/status-trimmed-pr",
        state: "open",
        updatedAt: null,
      });
    }),
  );

  it.effect("status ignores invalid gh pr list entries and keeps valid ones", () =>
    Effect.gen(function* () {
      const repoDir = yield* makeTempDir("control-git-manager-");
      yield* initRepo(repoDir);
      yield* runGit(repoDir, ["checkout", "-b", "feature/status-valid-pr-entry"]);
      const remoteDir = yield* createBareRemote();
      yield* runGit(repoDir, ["remote", "add", "origin", remoteDir]);
      yield* runGit(repoDir, ["push", "-u", "origin", "feature/status-valid-pr-entry"]);

      const { manager } = yield* makeManager({
        ghScenario: {
          prListSequence: [
            JSON.stringify([
              {
                number: 0,
                title: "invalid",
                url: "https://github.com/pingdotgg/codething-mvp/pull/0",
                baseRefName: "main",
                headRefName: "feature/invalid",
              },
              {
                number: 15,
                title: "  Valid PR title  ",
                url: " https://github.com/pingdotgg/codething-mvp/pull/15 ",
                baseRefName: " main ",
                headRefName: "\tfeature/status-valid-pr-entry\t",
                headRepository: {
                  nameWithOwner: "   ",
                },
                headRepositoryOwner: {
                  login: "   ",
                },
              },
            ]),
          ],
        },
      });

      const status = yield* manager.status({ cwd: repoDir });

      expect(status.pr).toEqual({
        number: 15,
        title: "Valid PR title",
        url: "https://github.com/pingdotgg/codething-mvp/pull/15",
        baseRef: "main",
        headRef: "feature/status-valid-pr-entry",
        state: "open",
        updatedAt: null,
      });
    }),
  );

  it.effect("status preserves lowercase merged and closed PR states from gh json", () =>
    Effect.gen(function* () {
      const repoDir = yield* makeTempDir("control-git-manager-");
      yield* initRepo(repoDir);
      yield* runGit(repoDir, ["checkout", "-b", "feature/status-lowercase-state"]);
      const remoteDir = yield* createBareRemote();
      yield* runGit(repoDir, ["remote", "add", "origin", remoteDir]);
      yield* runGit(repoDir, ["push", "-u", "origin", "feature/status-lowercase-state"]);

      const { manager } = yield* makeManager({
        ghScenario: {
          prListSequence: [
            JSON.stringify([
              {
                number: 16,
                title: "Closed PR",
                url: "https://github.com/pingdotgg/codething-mvp/pull/16",
                baseRefName: "main",
                headRefName: "feature/status-lowercase-state",
                state: "closed",
                updatedAt: "2026-01-01T00:00:00.000Z",
              },
              {
                number: 17,
                title: "Merged PR",
                url: "https://github.com/pingdotgg/codething-mvp/pull/17",
                baseRefName: "main",
                headRefName: "feature/status-lowercase-state",
                state: "merged",
                updatedAt: "2026-01-02T00:00:00.000Z",
              },
            ]),
          ],
        },
      });

      const status = yield* manager.status({ cwd: repoDir });

      expect(status.pr).toEqual({
        number: 17,
        title: "Merged PR",
        url: "https://github.com/pingdotgg/codething-mvp/pull/17",
        baseRef: "main",
        headRef: "feature/status-lowercase-state",
        state: "merged",
        updatedAt: "2026-01-02T00:00:00.000Z",
      });
    }),
  );

  it.effect("status returns an explicit non-repo result for non-git directories", () =>
    Effect.gen(function* () {
      const cwd = yield* makeTempDir("control-git-manager-non-repo-");
      const { manager } = yield* makeManager();

      const status = yield* manager.status({ cwd });

      expect(status).toEqual({
        isRepo: false,
        hasPrimaryRemote: false,
        isDefaultRef: false,
        refName: null,
        hasWorkingTreeChanges: false,
        workingTree: {
          files: [],
          insertions: 0,
          deletions: 0,
        },
        hasUpstream: false,
        aheadCount: 0,
        behindCount: 0,
        aheadOfDefaultCount: 0,
        pr: null,
      });
    }),
  );

  it.effect("status returns an explicit non-repo result for deleted directories", () =>
    Effect.gen(function* () {
      const rootDir = yield* makeTempDir("control-git-manager-missing-dir-");
      const cwd = NodePath.join(rootDir, "deleted-repo");
      yield* makeDirectory(cwd);
      yield* removePath(cwd);
      const { manager } = yield* makeManager();

      const status = yield* manager.status({ cwd });

      expect(status).toEqual({
        isRepo: false,
        hasPrimaryRemote: false,
        isDefaultRef: false,
        refName: null,
        hasWorkingTreeChanges: false,
        workingTree: {
          files: [],
          insertions: 0,
          deletions: 0,
        },
        hasUpstream: false,
        aheadCount: 0,
        behindCount: 0,
        aheadOfDefaultCount: 0,
        pr: null,
      });
    }),
  );

  it.effect("status briefly caches repeated lookups for the same cwd", () =>
    Effect.gen(function* () {
      const repoDir = yield* makeTempDir("control-git-manager-");
      yield* initRepo(repoDir);
      yield* runGit(repoDir, ["checkout", "-b", "feature/status-cache"]);
      const remoteDir = yield* createBareRemote();
      yield* runGit(repoDir, ["remote", "add", "origin", remoteDir]);
      yield* runGit(repoDir, ["push", "-u", "origin", "feature/status-cache"]);

      const existingPr = {
        number: 113,
        title: "Cached PR",
        url: "https://github.com/pingdotgg/codething-mvp/pull/113",
        baseRefName: "main",
        headRefName: "feature/status-cache",
      };
      const { manager, ghCalls } = yield* makeManager({
        ghScenario: {
          prListSequence: [JSON.stringify([existingPr]), JSON.stringify([existingPr])],
        },
      });

      const first = yield* manager.status({ cwd: repoDir });
      const second = yield* manager.status({ cwd: repoDir });

      expect(first.pr?.number).toBe(113);
      expect(second.pr?.number).toBe(113);
      expect(ghCalls.filter((call) => call.startsWith("pr list "))).toHaveLength(1);
    }),
  );

  it.effect("a warm PR cache does not reread repository identity for status", () =>
    Effect.gen(function* () {
      const repoDir = yield* makeTempDir("control-git-manager-");
      yield* initRepo(repoDir);
      yield* runGit(repoDir, ["checkout", "-b", "feature/status-identity-cache"]);
      const remoteDir = yield* createBareRemote();
      yield* runGit(repoDir, ["remote", "add", "origin", remoteDir]);
      yield* runGit(repoDir, ["push", "-u", "origin", "feature/status-identity-cache"]);

      const gitConfigReads: string[] = [];
      const { manager } = yield* makeManager({ gitConfigReads });

      yield* manager.remoteStatus({ cwd: repoDir }, { refreshUpstream: false });
      gitConfigReads.length = 0;
      yield* manager.remoteStatus({ cwd: repoDir }, { refreshUpstream: false });

      const identityReads = gitConfigReads.filter(
        (key) =>
          key === "branch.feature/status-identity-cache.remote" || key === "remote.origin.url",
      );
      expect(identityReads).toHaveLength(0);
    }),
  );

  it.effect("a branch tracking origin reads origin's URL once per PR lookup", () =>
    Effect.gen(function* () {
      const repoDir = yield* makeTempDir("control-git-manager-");
      yield* initRepo(repoDir);
      const remoteDir = yield* createBareRemote();
      yield* runGit(repoDir, ["remote", "add", "origin", remoteDir]);
      yield* runGit(repoDir, ["checkout", "-b", "feature/origin-once"]);
      yield* runGit(repoDir, ["push", "-u", "origin", "feature/origin-once"]);

      const gitConfigReads: string[] = [];
      const { manager } = yield* makeManager({
        gitConfigReads,
        ghScenario: {
          prListSequence: [
            // Fake gh returns raw JSON stdout, matching the CLI boundary under test.
            JSON.stringify([
              {
                number: 217,
                title: "Origin once PR",
                url: "https://github.com/acme/control/pull/217",
                baseRefName: "main",
                headRefName: "feature/origin-once",
                state: "OPEN",
                updatedAt: "2026-04-03T15:00:00Z",
              },
            ]),
          ],
        },
      });

      yield* manager.branchPullRequest({ cwd: repoDir, branch: "feature/origin-once" });
      gitConfigReads.length = 0;
      const pullRequest = yield* manager.branchPullRequest({
        cwd: repoDir,
        branch: "feature/origin-once",
      });

      expect(pullRequest?.number).toBe(217);
      expect(gitConfigReads.filter((key) => key === "remote.origin.url")).toHaveLength(1);
    }),
  );

  it.effect("turn-end refresh finds a new PR and keeps known PRs cached", () =>
    Effect.gen(function* () {
      const repoDir = yield* makeTempDir("control-git-manager-");
      yield* initRepo(repoDir);
      const remoteDir = yield* createBareRemote();
      yield* runGit(repoDir, ["remote", "add", "origin", remoteDir]);
      yield* runGit(repoDir, ["push", "-u", "origin", "main"]);
      yield* runGit(repoDir, ["checkout", "-b", "feature/turn-refresh", "origin/main"]);
      yield* runGit(repoDir, ["push", "origin", "feature/turn-refresh"]);

      const { manager, ghCalls } = yield* makeManager({
        ghScenario: {
          prListSequence: [
            "[]",
            // Fake gh returns raw JSON stdout, matching the CLI boundary under test.
            JSON.stringify([
              {
                number: 114,
                title: "Opened during the turn",
                url: "https://github.com/pingdotgg/codething-mvp/pull/114",
                baseRefName: "main",
                headRefName: "feature/turn-refresh",
              },
            ]),
          ],
        },
      });
      expect((yield* manager.remoteStatus({ cwd: repoDir }))?.pr).toBeNull();
      expect(
        (yield* manager.remoteStatus({ cwd: repoDir }, { refreshUpstream: false }))?.pr,
      ).toBeNull();

      const refreshed = yield* manager.remoteStatus(
        { cwd: repoDir },
        { refreshUpstream: false, refreshMissingPullRequest: true },
      );
      expect(refreshed?.pr?.number).toBe(114);
      yield* manager.remoteStatus(
        { cwd: repoDir },
        { refreshUpstream: false, refreshMissingPullRequest: true },
      );
      expect(ghCalls.filter((call) => call.startsWith("pr list "))).toHaveLength(2);
    }),
  );

  it.effect("turn-end refresh preserves failed PR lookup backoff", () =>
    Effect.gen(function* () {
      const repoDir = yield* makeTempDir("control-git-manager-");
      yield* initRepo(repoDir);
      const remoteDir = yield* createBareRemote();
      yield* runGit(repoDir, ["remote", "add", "origin", remoteDir]);
      yield* runGit(repoDir, ["checkout", "-b", "feature/rate-limited"]);
      yield* runGit(repoDir, ["push", "-u", "origin", "feature/rate-limited"]);
      const { manager, ghCalls } = yield* makeManager({
        ghScenario: {
          failWith:
            "No GitHub credential on the server. Set GH_TOKEN, or install the GitHub CLI and run `gh auth login`.",
        },
      });
      yield* manager.remoteStatus({ cwd: repoDir });
      const callsAfterFailure = ghCalls.length;
      yield* manager.remoteStatus(
        { cwd: repoDir },
        { refreshUpstream: false, refreshMissingPullRequest: true },
      );
      expect(callsAfterFailure).toBeGreaterThan(0);
      expect(ghCalls).toHaveLength(callsAfterFailure);
    }),
  );

  it.effect("status skips the provider lookup for a branch that was never pushed", () =>
    Effect.gen(function* () {
      const repoDir = yield* makeTempDir("control-git-manager-");
      yield* initRepo(repoDir);
      const remoteDir = yield* createBareRemote();
      yield* runGit(repoDir, ["remote", "add", "origin", remoteDir]);
      yield* runGit(repoDir, ["push", "-u", "origin", "main"]);
      yield* runGit(repoDir, ["checkout", "-b", "feature/never-pushed"]);

      const { manager, ghCalls } = yield* makeManager();

      const status = yield* manager.status({ cwd: repoDir });

      expect(status.refName).toBe("feature/never-pushed");
      expect(status.pr).toBeNull();
      expect(ghCalls.filter((call) => call.startsWith("pr list "))).toHaveLength(0);
    }),
  );

  it.effect("branch PR lookup returns null when the repository has no remotes", () =>
    Effect.gen(function* () {
      const repoDir = yield* makeTempDir("control-git-manager-");
      yield* initRepo(repoDir);
      const { manager, ghCalls } = yield* makeManager();

      const pullRequest = yield* manager.branchPullRequest({ cwd: repoDir, branch: "main" });

      expect(pullRequest).toBeNull();
      expect(ghCalls).toHaveLength(0);
    }),
  );

  it.effect("branch PR lookup uses a saved tracked branch without changing checkout", () =>
    Effect.gen(function* () {
      const repoDir = yield* makeTempDir("control-git-manager-");
      yield* initRepo(repoDir);
      const remoteDir = yield* createBareRemote();
      yield* runGit(repoDir, ["remote", "add", "origin", remoteDir]);
      yield* runGit(repoDir, ["push", "-u", "origin", "main"]);
      yield* runGit(repoDir, ["checkout", "-b", "feature/saved-branch"]);
      yield* runGit(repoDir, ["push", "-u", "origin", "feature/saved-branch"]);
      yield* runGit(repoDir, ["checkout", "main"]);

      const { manager } = yield* makeManager({
        ghScenario: {
          prListSequence: [
            // Fake gh returns raw JSON stdout, matching the CLI boundary under test.
            JSON.stringify([
              {
                number: 216,
                title: "Saved branch PR",
                url: "https://github.com/acme/control/pull/216",
                baseRefName: "main",
                headRefName: "feature/saved-branch",
                headRefOid: "a".repeat(40),
                state: "OPEN",
                updatedAt: "2026-04-03T15:00:00Z",
              },
            ]),
          ],
        },
      });

      const pullRequest = yield* manager.branchPullRequest({
        cwd: repoDir,
        branch: "feature/saved-branch",
      });

      expect(pullRequest).toMatchObject({
        number: 216,
        title: "Saved branch PR",
        url: "https://github.com/acme/control/pull/216",
        baseRef: "main",
        headRef: "feature/saved-branch",
        headSha: "a".repeat(40),
        state: "open",
        closedAt: null,
        mergedAt: null,
        updatedAt: "2026-04-03T15:00:00.000Z",
      });
      expect((yield* runGit(repoDir, ["branch", "--show-current"])).stdout.trim()).toBe("main");
    }),
  );

  it.effect("branch PR lookup uses the default branch from a non-origin remote", () =>
    Effect.gen(function* () {
      const repoDir = yield* makeTempDir("control-git-manager-");
      yield* initRepo(repoDir);
      const remoteDir = yield* createBareRemote();
      yield* runGit(repoDir, ["remote", "add", "upstream", remoteDir]);
      yield* runGit(repoDir, ["push", "-u", "upstream", "main"]);
      yield* runGit(repoDir, ["checkout", "-b", "develop"]);
      yield* runGit(repoDir, ["push", "-u", "upstream", "develop"]);
      yield* runGit(remoteDir, ["symbolic-ref", "HEAD", "refs/heads/develop"]);
      yield* runGit(repoDir, ["remote", "set-head", "upstream", "develop"]);

      const { manager } = yield* makeManager({
        ghScenario: {
          // Fake gh returns raw JSON stdout, matching the CLI boundary under test.
          prListSequence: [
            JSON.stringify([
              {
                number: 221,
                title: "Merged main PR",
                url: "https://github.com/pingdotgg/codething-mvp/pull/221",
                baseRefName: "develop",
                headRefName: "main",
                state: "MERGED",
                mergedAt: "2026-04-07T15:00:00Z",
                updatedAt: "2026-04-08T15:00:00Z",
              },
            ]),
          ],
        },
      });

      const pullRequest = yield* manager.branchPullRequest({ cwd: repoDir, branch: "main" });

      expect(pullRequest).toMatchObject({
        state: "merged",
        closedAt: null,
        mergedAt: "2026-04-07T15:00:00Z",
        updatedAt: "2026-04-08T15:00:00.000Z",
      });
    }),
  );

  it.effect("branch PR lookup uses the saved name after the local branch is deleted", () =>
    Effect.gen(function* () {
      const repoDir = yield* makeTempDir("control-git-manager-");
      yield* initRepo(repoDir);
      const remoteDir = yield* createBareRemote();
      yield* runGit(repoDir, ["remote", "add", "origin", remoteDir]);
      yield* runGit(repoDir, ["push", "-u", "origin", "main"]);
      yield* runGit(repoDir, ["checkout", "-b", "feature/deleted-local-branch"]);
      yield* runGit(repoDir, ["push", "-u", "origin", "feature/deleted-local-branch"]);
      yield* runGit(repoDir, ["checkout", "main"]);
      yield* runGit(repoDir, ["branch", "-D", "feature/deleted-local-branch"]);
      yield* runGit(repoDir, ["branch", "feature/deleted-local-branch/child"]);
      yield* runGit(repoDir, [
        "branch",
        "--set-upstream-to",
        "origin/main",
        "feature/deleted-local-branch/child",
      ]);

      const { manager, ghCalls } = yield* makeManager({
        ghScenario: {
          prListSequence: [
            // Fake gh returns raw JSON stdout, matching the CLI boundary under test.
            JSON.stringify([
              {
                number: 217,
                title: "Deleted local branch PR",
                url: "https://github.com/acme/control/pull/217",
                baseRefName: "main",
                headRefName: "feature/deleted-local-branch",
                state: "MERGED",
                updatedAt: "2026-04-04T15:00:00Z",
              },
            ]),
          ],
        },
      });

      const pullRequest = yield* manager.branchPullRequest({
        cwd: repoDir,
        branch: "feature/deleted-local-branch",
      });

      expect(pullRequest).toMatchObject({
        state: "merged",
        closedAt: null,
        mergedAt: null,
        updatedAt: "2026-04-04T15:00:00.000Z",
      });
      expect(ghCalls.some((call) => call.includes("--head feature/deleted-local-branch"))).toBe(
        true,
      );
    }),
  );

  it.effect("branch PR lookup recovers a deleted fork branch from its remote-tracking ref", () =>
    Effect.gen(function* () {
      const repoDir = yield* makeTempDir("control-git-manager-");
      yield* initRepo(repoDir);
      const originDir = yield* createBareRemote();
      const forkDir = yield* createBareRemote();
      yield* runGit(repoDir, ["remote", "add", "origin", originDir]);
      yield* runGit(repoDir, ["push", "-u", "origin", "main"]);
      yield* configureRemote(repoDir, "team/fork", forkDir, "team/fork");
      yield* runGit(repoDir, ["checkout", "-b", "feature/deleted-fork-branch"]);
      yield* runGit(repoDir, ["push", "-u", "team/fork", "feature/deleted-fork-branch"]);
      yield* runGit(repoDir, ["checkout", "main"]);
      yield* runGit(repoDir, ["branch", "-D", "feature/deleted-fork-branch"]);
      yield* configureVisibleRemoteUrlWithLocalRewrite(
        repoDir,
        "origin",
        "git@github.com:pingdotgg/codething-mvp.git",
        originDir,
      );
      yield* configureVisibleRemoteUrlWithLocalRewrite(
        repoDir,
        "team/fork",
        "git@github.com:contributor/codething-mvp.git",
        forkDir,
      );

      const { manager, ghCalls } = yield* makeManager({
        ghScenario: {
          prListByHeadSelector: {
            // Fake gh returns raw JSON stdout, matching the CLI boundary under test.
            "feature/deleted-fork-branch": JSON.stringify([
              {
                number: 218,
                title: "Deleted fork branch PR",
                url: "https://github.com/pingdotgg/codething-mvp/pull/218",
                baseRefName: "main",
                headRefName: "feature/deleted-fork-branch",
                state: "MERGED",
                updatedAt: "2026-04-05T15:00:00Z",
                isCrossRepository: true,
                headRepository: { nameWithOwner: "contributor/codething-mvp" },
                headRepositoryOwner: { login: "contributor" },
              },
            ]),
          },
        },
      });

      const pullRequest = yield* manager.branchPullRequest({
        cwd: repoDir,
        branch: "feature/deleted-fork-branch",
      });

      expect(pullRequest).toMatchObject({
        state: "merged",
        closedAt: null,
        mergedAt: null,
        updatedAt: "2026-04-05T15:00:00.000Z",
      });
      expect(
        ghCalls.some((call) => call.includes("--head feature/deleted-fork-branch --state all")),
      ).toBe(true);
      expect(ghCalls.some((call) => call.includes("--head contributor:"))).toBe(false);
    }),
  );

  it.effect("branch PR lookup rejects ambiguous deleted-branch remote refs", () =>
    Effect.gen(function* () {
      const repoDir = yield* makeTempDir("control-git-manager-");
      yield* initRepo(repoDir);
      const originDir = yield* createBareRemote();
      const forkDir = yield* createBareRemote();
      yield* runGit(repoDir, ["remote", "add", "origin", originDir]);
      yield* runGit(repoDir, ["remote", "add", "fork", forkDir]);
      yield* runGit(repoDir, ["checkout", "-b", "feature/ambiguous-remote"]);
      yield* runGit(repoDir, ["push", "origin", "feature/ambiguous-remote"]);
      yield* runGit(repoDir, ["push", "fork", "feature/ambiguous-remote"]);
      yield* runGit(repoDir, ["checkout", "main"]);
      yield* runGit(repoDir, ["branch", "-D", "feature/ambiguous-remote"]);
      const { manager, ghCalls } = yield* makeManager();

      const error = yield* manager
        .branchPullRequest({ cwd: repoDir, branch: "feature/ambiguous-remote" })
        .pipe(Effect.flip);

      expect(error).toMatchObject({
        _tag: "GitManagerError",
        detail: "Multiple remotes track feature/ambiguous-remote. Its pull request is ambiguous.",
      });
      expect(ghCalls).toHaveLength(0);
    }),
  );

  it.effect("branch PR lookup does not reuse a cached PR after the remote is repointed", () =>
    Effect.gen(function* () {
      const repoDir = yield* makeTempDir("control-git-manager-");
      yield* initRepo(repoDir);
      const originalRemoteDir = yield* createBareRemote();
      yield* runGit(repoDir, ["remote", "add", "origin", originalRemoteDir]);
      yield* runGit(repoDir, ["checkout", "-b", "feature/repointed-lookup"]);
      yield* runGit(repoDir, ["push", "-u", "origin", "feature/repointed-lookup"]);
      yield* configureVisibleRemoteUrlWithLocalRewrite(
        repoDir,
        "origin",
        "git@github.com:old-owner/old-repository.git",
        originalRemoteDir,
      );
      const { manager, ghCalls } = yield* makeManager({
        ghScenario: {
          prListSequence: [
            // Fake gh returns raw JSON stdout, matching the CLI boundary under test.
            JSON.stringify([
              {
                number: 219,
                title: "Old repository PR",
                url: "https://github.com/old-owner/old-repository/pull/219",
                baseRefName: "main",
                headRefName: "feature/repointed-lookup",
                state: "MERGED",
                updatedAt: "2026-04-06T15:00:00Z",
              },
            ]),
            "[]",
          ],
        },
      });

      const first = yield* manager.branchPullRequest({
        cwd: repoDir,
        branch: "feature/repointed-lookup",
      });
      expect(first?.state).toBe("merged");

      const replacementRemoteDir = yield* createBareRemote();
      yield* configureVisibleRemoteUrlWithLocalRewrite(
        repoDir,
        "origin",
        "git@github.com:new-owner/new-repository.git",
        replacementRemoteDir,
      );

      const second = yield* manager.branchPullRequest({
        cwd: repoDir,
        branch: "feature/repointed-lookup",
      });

      expect(second).toBeNull();
      expect(ghCalls.filter((call) => call.startsWith("pr list "))).toHaveLength(2);
    }),
  );

  it.effect("branch PR lookup shares the status cache for the same repository identity", () =>
    Effect.gen(function* () {
      const repoDir = yield* makeTempDir("control-git-manager-");
      yield* initRepo(repoDir);
      const remoteDir = yield* createBareRemote();
      yield* runGit(repoDir, ["remote", "add", "origin", remoteDir]);
      yield* runGit(repoDir, ["checkout", "-b", "feature/shared-pr-cache"]);
      yield* runGit(repoDir, ["push", "-u", "origin", "feature/shared-pr-cache"]);
      const { manager, ghCalls } = yield* makeManager({
        ghScenario: {
          prListSequence: [
            // Fake gh returns raw JSON stdout, matching the CLI boundary under test.
            JSON.stringify([
              {
                number: 220,
                title: "Shared cache PR",
                url: "https://github.com/pingdotgg/codething-mvp/pull/220",
                baseRefName: "main",
                headRefName: "feature/shared-pr-cache",
                headRefOid: "a".repeat(40),
                state: "MERGED",
                updatedAt: "2026-04-07T15:00:00Z",
              },
            ]),
            encodeCliJson([
              {
                number: 221,
                title: "New PR on the same branch",
                url: "https://github.com/pingdotgg/codething-mvp/pull/221",
                baseRefName: "main",
                headRefName: "feature/shared-pr-cache",
                headRefOid: "b".repeat(40),
                state: "OPEN",
                updatedAt: "2026-04-08T15:00:00Z",
              },
            ]),
          ],
        },
      });

      const status = yield* manager.status({ cwd: repoDir });
      const pullRequest = yield* manager.branchPullRequest({
        cwd: repoDir,
        branch: "feature/shared-pr-cache",
      });

      expect(status.pr?.state).toBe("merged");
      expect(pullRequest?.state).toBe("merged");
      expect(pullRequest?.headSha).toBe("a".repeat(40));
      expect(ghCalls.filter((call) => call.startsWith("pr list "))).toHaveLength(1);
      const refreshed = yield* manager.branchPullRequest(
        { cwd: repoDir, branch: "feature/shared-pr-cache" },
        { refresh: true },
      );
      expect(refreshed).toMatchObject({
        number: 221,
        state: "open",
        headSha: "b".repeat(40),
        repositoryKey: "github.com/pingdotgg/codething-mvp",
      });
      expect(ghCalls.filter((call) => call.startsWith("pr list "))).toHaveLength(2);
    }),
  );

  it.effect("branch PR lookup rechecks open PRs every minute and settled answers less often", () =>
    Effect.gen(function* () {
      const repoDir = yield* makeTempDir("control-git-manager-");
      yield* initRepo(repoDir);
      const remoteDir = yield* createBareRemote();
      yield* runGit(repoDir, ["remote", "add", "origin", remoteDir]);
      for (const branch of ["feature/open-pr", "feature/merged-pr", "feature/no-pr"]) {
        yield* runGit(repoDir, ["checkout", "-b", branch, "main"]);
        yield* runGit(repoDir, ["push", "-u", "origin", branch]);
      }
      const pullRequest = (number: number, headRefName: string, state: string) => ({
        number,
        title: headRefName,
        url: `https://github.com/pingdotgg/codething-mvp/pull/${number}`,
        baseRefName: "main",
        headRefName,
        state,
        updatedAt: "2026-04-07T15:00:00Z",
      });
      const { manager, ghCalls } = yield* makeManager({
        ghScenario: {
          prListByHeadSelector: {
            "feature/open-pr": encodeCliJson([pullRequest(301, "feature/open-pr", "OPEN")]),
            "feature/merged-pr": encodeCliJson([pullRequest(302, "feature/merged-pr", "MERGED")]),
          },
        },
      });
      const lookupAll = Effect.forEach(
        ["feature/open-pr", "feature/merged-pr", "feature/no-pr"],
        (branch) => manager.branchPullRequest({ cwd: repoDir, branch }),
      );
      const prListCalls = () => ghCalls.filter((call) => call.startsWith("pr list "));

      yield* lookupAll;
      expect(prListCalls()).toHaveLength(3);

      yield* TestClock.adjust("61 seconds");
      yield* lookupAll;
      expect(prListCalls()).toHaveLength(4);
      expect(prListCalls().at(-1)).toContain("--head feature/open-pr");

      // Just inside the 5-minute window only the open PR is asked again.
      yield* TestClock.adjust("238 seconds");
      yield* lookupAll;
      expect(prListCalls()).toHaveLength(5);
      expect(prListCalls().at(-1)).toContain("--head feature/open-pr");

      // Just past it the settled answers expire too.
      yield* TestClock.adjust("2 seconds");
      yield* lookupAll;
      expect(prListCalls()).toHaveLength(7);
      expect(prListCalls().slice(-2).join("\n")).not.toContain("--head feature/open-pr");
    }),
  );

  it.effect("branch PR lookup announces a pull request when it reads it merged", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const repoDir = yield* makeTempDir("control-git-manager-");
        yield* initRepo(repoDir);
        const remoteDir = yield* createBareRemote();
        yield* runGit(repoDir, ["remote", "add", "origin", remoteDir]);
        for (const branch of ["feature/merges-later", "feature/already-merged"]) {
          yield* runGit(repoDir, ["checkout", "-b", branch, "main"]);
          yield* runGit(repoDir, ["push", "-u", "origin", branch]);
        }
        const pullRequest = (number: number, headRefName: string, state: string) =>
          encodeCliJson([
            {
              number,
              title: headRefName,
              url: `https://github.com/pingdotgg/codething-mvp/pull/${number}`,
              baseRefName: "main",
              headRefName,
              state,
              updatedAt: "2026-04-07T15:00:00Z",
            },
          ]);
        const { manager } = yield* makeManager({
          ghScenario: {
            prListSequenceByHeadSelector: {
              "feature/merges-later": [
                pullRequest(401, "feature/merges-later", "OPEN"),
                pullRequest(401, "feature/merges-later", "MERGED"),
              ],
              "feature/already-merged": [pullRequest(402, "feature/already-merged", "MERGED")],
            },
          },
        });
        const changes = yield* manager.subscribePullRequestStateChanges;
        const lookup = (branch: string) => manager.branchPullRequest({ cwd: repoDir, branch });

        yield* lookup("feature/merges-later");
        yield* lookup("feature/already-merged");
        // Open answers are re-read after a minute.
        yield* TestClock.adjust("61 seconds");
        expect((yield* lookup("feature/merges-later"))?.state).toBe("merged");

        const announced = yield* Stream.runCollect(Stream.take(changes, 2));
        expect(announced).toEqual([
          { host: "github.com", repository: "pingdotgg/codething-mvp", number: 402 },
          { host: "github.com", repository: "pingdotgg/codething-mvp", number: 401 },
        ]);
      }),
    ),
  );

  it.effect("branch PR lookup propagates provider failures", () =>
    Effect.gen(function* () {
      const repoDir = yield* makeTempDir("control-git-manager-");
      yield* initRepo(repoDir);
      const remoteDir = yield* createBareRemote();
      yield* runGit(repoDir, ["remote", "add", "origin", remoteDir]);
      yield* runGit(repoDir, ["push", "-u", "origin", "main"]);
      yield* runGit(repoDir, ["checkout", "-b", "feature/lookup-failure"]);
      yield* runGit(repoDir, ["push", "-u", "origin", "feature/lookup-failure"]);
      yield* runGit(repoDir, ["checkout", "main"]);

      const { manager, ghCalls } = yield* makeManager({
        ghScenario: {
          failWith:
            "No GitHub credential on the server. Set GH_TOKEN, or install the GitHub CLI and run `gh auth login`.",
        },
      });

      const error = yield* manager
        .branchPullRequest({ cwd: repoDir, branch: "feature/lookup-failure" })
        .pipe(Effect.flip);

      expect(error._tag).toBe("SourceControlProviderError");
      const refreshError = yield* manager
        .branchPullRequest({ cwd: repoDir, branch: "feature/lookup-failure" }, { refresh: true })
        .pipe(Effect.flip);
      expect(refreshError._tag).toBe("SourceControlProviderError");
      expect(ghCalls.filter((call) => call.startsWith("pr list "))).toHaveLength(1);
    }),
  );

  it.effect("status finds a merged PR after its remote branch was deleted", () =>
    Effect.gen(function* () {
      const repoDir = yield* makeTempDir("control-git-manager-");
      yield* initRepo(repoDir);
      const remoteDir = yield* createBareRemote();
      yield* runGit(repoDir, ["remote", "add", "origin", remoteDir]);
      yield* runGit(repoDir, ["push", "-u", "origin", "main"]);
      yield* runGit(repoDir, ["checkout", "-b", "feature/merged-branch-deleted"]);
      yield* runGit(repoDir, ["push", "-u", "origin", "feature/merged-branch-deleted"]);

      // GitHub commonly deletes a pull request's head branch after merge. Git
      // removes the remote-tracking ref, but preserves the local branch's
      // remote and merge configuration as evidence that it was published.
      yield* runGit(repoDir, ["push", "origin", "--delete", "feature/merged-branch-deleted"]);
      const configuredRemote = yield* runGit(repoDir, [
        "config",
        "--get",
        "branch.feature/merged-branch-deleted.remote",
      ]);
      const configuredMerge = yield* runGit(repoDir, [
        "config",
        "--get",
        "branch.feature/merged-branch-deleted.merge",
      ]);
      const trackingRef = yield* runGit(repoDir, [
        "for-each-ref",
        "--format=%(refname)",
        "refs/remotes/origin/feature/merged-branch-deleted",
      ]);
      expect(configuredRemote.stdout.trim()).toBe("origin");
      expect(configuredMerge.stdout.trim()).toBe("refs/heads/feature/merged-branch-deleted");
      expect(trackingRef.stdout.trim()).toBe("");

      const { manager, ghCalls } = yield* makeManager({
        ghScenario: {
          prListSequence: [
            JSON.stringify([
              {
                number: 215,
                title: "Merged branch was deleted",
                url: "https://github.com/acme/control/pull/215",
                baseRefName: "main",
                headRefName: "feature/merged-branch-deleted",
                state: "MERGED",
                mergedAt: "2026-04-02T15:00:00Z",
                updatedAt: "2026-04-02T15:00:00Z",
              },
            ]),
          ],
        },
      });

      const status = yield* manager.status({ cwd: repoDir });

      expect(status.hasUpstream).toBe(false);
      expect(status.pr).toEqual({
        number: 215,
        title: "Merged branch was deleted",
        url: "https://github.com/acme/control/pull/215",
        baseRef: "main",
        headRef: "feature/merged-branch-deleted",
        state: "merged",
        updatedAt: "2026-04-02T15:00:00.000Z",
      });
      expect(ghCalls.filter((call) => call.startsWith("pr list ")).length).toBeGreaterThan(0);
    }),
  );

  it.effect("status still looks up PRs for a branch pushed without --set-upstream", () =>
    Effect.gen(function* () {
      const repoDir = yield* makeTempDir("control-git-manager-");
      yield* initRepo(repoDir);
      const remoteDir = yield* createBareRemote();
      yield* runGit(repoDir, ["remote", "add", "origin", remoteDir]);
      yield* runGit(repoDir, ["push", "-u", "origin", "main"]);
      yield* runGit(repoDir, ["checkout", "-b", "feature/pushed-no-upstream"]);
      // No `-u`, so the remote-tracking ref exists but branch.<name>.merge does
      // not. Most terminal and agent pushes land this way, and they can still
      // have a PR, so the skip must not trigger here.
      yield* runGit(repoDir, ["push", "origin", "feature/pushed-no-upstream"]);

      const { manager, ghCalls } = yield* makeManager({
        ghScenario: {
          prListSequence: [
            JSON.stringify([
              {
                number: 214,
                title: "Pushed without upstream",
                url: "https://github.com/acme/control/pull/214",
                baseRefName: "main",
                headRefName: "feature/pushed-no-upstream",
                state: "OPEN",
                updatedAt: "2026-04-01T15:00:00Z",
              },
            ]),
          ],
        },
      });

      const status = yield* manager.status({ cwd: repoDir });

      expect(status.pr?.number).toBe(214);
      expect(ghCalls.filter((call) => call.startsWith("pr list ")).length).toBeGreaterThan(0);
    }),
  );

  it("backs off repeated PR lookup failures past the healthy refresh cadence", () => {
    expect(Duration.toMillis(GitManager.prLookupFailureTtl(1))).toBe(20_000);
    expect(Duration.toMillis(GitManager.prLookupFailureTtl(2))).toBe(40_000);
    // The point of the backoff: by the third retry a failing branch must not be
    // asking more often than a healthy one, which refreshes every 2 minutes.
    expect(Duration.toMillis(GitManager.prLookupFailureTtl(4))).toBeGreaterThan(120_000);
    expect(Duration.toMillis(GitManager.prLookupFailureTtl(20))).toBe(900_000);
  });

  it.each([
    [
      "https://github.example.com/team/repository/pull/42?tab=files",
      "github.example.com/team/repository",
    ],
    [
      "https://gitlab.example.com/group/subgroup/repository/-/merge_requests/42",
      "gitlab.example.com/group/subgroup/repository",
    ],
    ["https://bitbucket.org/team/repository/pull-requests/42", "bitbucket.org/team/repository"],
    [
      "https://dev.azure.com/org/project/_git/repository/pullrequest/42",
      "dev.azure.com/org/project/_git/repository",
    ],
    [
      "https://org.visualstudio.com/project/_git/repository/pullrequest/42",
      "org.visualstudio.com/project/_git/repository",
    ],
    [
      "https://gitlab.example/group/pull/123/repository/-/merge_requests/42",
      "gitlab.example/group/pull/123/repository",
    ],
    ["https://github.example.com/team/repository/issues/42", null],
  ] as const)("reads the repository from the returned PR URL %s", (url, expected) => {
    expect(GitManager.pullRequestRepositoryKey(url)).toBe(expected);
  });

  it.effect("distinguishes Enterprise forks with the same head branch", () =>
    Effect.gen(function* () {
      const repoDir = yield* makeTempDir("control-git-manager-");
      yield* initRepo(repoDir);
      const originDir = yield* createBareRemote();
      const forkDir = yield* createBareRemote();
      yield* runGit(repoDir, ["remote", "add", "origin", originDir]);
      yield* runGit(repoDir, ["push", "-u", "origin", "main"]);
      yield* runGit(repoDir, ["remote", "add", "fork", forkDir]);
      yield* runGit(repoDir, ["checkout", "-b", "feature"]);
      yield* runGit(repoDir, ["push", "-u", "fork", "feature"]);
      yield* configureVisibleRemoteUrlWithLocalRewrite(
        repoDir,
        "origin",
        "git@github.example.com:team/repository.git",
        originDir,
      );
      yield* configureVisibleRemoteUrlWithLocalRewrite(
        repoDir,
        "fork",
        "git@github.example.com:alice/repository.git",
        forkDir,
      );
      const output = encodeCliJson([
        {
          number: 2,
          title: "Another fork",
          url: "https://github.example.com/team/repository/pull/2",
          baseRefName: "main",
          headRefName: "feature",
          state: "OPEN",
          updatedAt: "2026-04-08T15:00:00Z",
          isCrossRepository: true,
          headRepository: { nameWithOwner: "bob/repository" },
          headRepositoryOwner: { login: "bob" },
        },
        {
          number: 1,
          title: "This fork",
          url: "https://github.example.com/team/repository/pull/1",
          baseRefName: "main",
          headRefName: "feature",
          state: "OPEN",
          updatedAt: "2026-04-07T15:00:00Z",
          isCrossRepository: true,
          headRepository: { nameWithOwner: "alice/repository" },
          headRepositoryOwner: { login: "alice" },
        },
      ]);
      const { manager } = yield* makeManager({
        ghScenario: {
          prListByHeadSelector: {
            feature: output,
          },
        },
      });
      expect(yield* manager.branchPullRequest({ cwd: repoDir, branch: "feature" })).toMatchObject({
        number: 1,
        repositoryKey: "github.example.com/team/repository",
      });
    }),
  );

  it.effect.each([
    "git@gitlab.com:Group/Subgroup/Fork.git",
    "https://gitlab.com/Group/Subgroup/Fork.git",
  ])("matches nested GitLab forks through the adapter for %s", (remoteUrl) =>
    Effect.gen(function* () {
      const repoDir = yield* makeTempDir("control-git-manager-");
      yield* initRepo(repoDir);
      const originDir = yield* createBareRemote();
      const forkDir = yield* createBareRemote();
      const branch = "feature/NestedGroups";
      yield* runGit(repoDir, ["remote", "add", "origin", originDir]);
      yield* runGit(repoDir, ["push", "-u", "origin", "main"]);
      yield* runGit(repoDir, ["remote", "add", "fork", forkDir]);
      yield* runGit(repoDir, ["checkout", "-b", branch]);
      yield* runGit(repoDir, ["push", "-u", "fork", branch]);
      yield* configureVisibleRemoteUrlWithLocalRewrite(
        repoDir,
        "origin",
        "git@gitlab.com:Group/Upstream/Repository.git",
        originDir,
      );
      yield* configureVisibleRemoteUrlWithLocalRewrite(repoDir, "fork", remoteUrl, forkDir);
      const output = encodeCliJson([
        {
          iid: 2,
          title: "Another subgroup's fork",
          web_url: "https://gitlab.com/Group/Upstream/Repository/-/merge_requests/2",
          target_branch: "main",
          source_branch: branch,
          state: "opened",
          updated_at: "2026-04-08T15:00:00Z",
          source_project_id: 102,
          target_project_id: 100,
          source_project: { path_with_namespace: "Group/Other/Fork" },
        },
        {
          iid: 1,
          title: "This subgroup's fork",
          web_url: "https://gitlab.com/Group/Upstream/Repository/-/merge_requests/1",
          target_branch: "main",
          source_branch: branch,
          state: "opened",
          updated_at: "2026-04-07T15:00:00Z",
          source_project_id: 101,
          target_project_id: 100,
          source_project: { path_with_namespace: "Group/Subgroup/Fork" },
        },
      ]);
      const calls: VcsProcess.VcsProcessInput[] = [];
      const provider = yield* GitLabSourceControlProvider.make.pipe(
        Effect.provide(
          GitLabCli.layer.pipe(
            Layer.provide(
              Layer.mock(VcsProcess.VcsProcess)({
                run: (input) =>
                  Effect.sync(() => {
                    calls.push(input);
                    return fakeGhOutput(output);
                  }),
              }),
            ),
          ),
        ),
      );
      const { manager } = yield* makeManager({ sourceControlProvider: provider });

      expect(yield* manager.branchPullRequest({ cwd: repoDir, branch })).toMatchObject({
        number: 1,
        repositoryKey: "gitlab.com/group/upstream/repository",
      });
      expect(calls.length).toBeGreaterThan(0);
      for (const call of calls) {
        expect(call.command).toBe("glab");
        expect(call.args).toEqual([
          "mr",
          "list",
          "--source-branch",
          branch,
          "--all",
          "--per-page",
          "20",
          "--output",
          "json",
        ]);
      }
    }),
  );

  it.effect(
    "status ignores unrelated fork PRs when the current branch tracks the same repository",
    () =>
      Effect.gen(function* () {
        const repoDir = yield* makeTempDir("control-git-manager-");
        yield* initRepo(repoDir);
        const remoteDir = yield* createBareRemote();
        yield* runGit(repoDir, ["remote", "add", "origin", remoteDir]);
        yield* runGit(repoDir, ["push", "-u", "origin", "main"]);

        const { manager } = yield* makeManager({
          ghScenario: {
            prListSequence: [
              JSON.stringify([
                {
                  number: 1661,
                  title: "Fork PR from main",
                  url: "https://github.com/acme/control/pull/1661",
                  baseRefName: "main",
                  headRefName: "main",
                  state: "OPEN",
                  updatedAt: "2026-04-01T15:00:00Z",
                  isCrossRepository: true,
                  headRepository: {
                    nameWithOwner: "lnieuwenhuis/control",
                  },
                  headRepositoryOwner: {
                    login: "lnieuwenhuis",
                  },
                },
              ]),
            ],
          },
        });

        const status = yield* manager.status({ cwd: repoDir });
        expect(status.refName).toBe("main");
        expect(status.pr).toBeNull();
      }),
  );

  it.effect(
    "status detects cross-repo PRs from the upstream remote URL owner",
    () =>
      Effect.gen(function* () {
        const repoDir = yield* makeTempDir("control-git-manager-");
        yield* initRepo(repoDir);
        const forkDir = yield* createBareRemote();
        yield* runGit(repoDir, ["remote", "add", "fork-seed", forkDir]);
        yield* runGit(repoDir, ["checkout", "-b", "statemachine"]);
        NodeFS.writeFileSync(NodePath.join(repoDir, "fork-pr.txt"), "fork pr\n");
        yield* runGit(repoDir, ["add", "fork-pr.txt"]);
        yield* runGit(repoDir, ["commit", "-m", "Fork PR branch"]);
        yield* runGit(repoDir, ["push", "-u", "fork-seed", "statemachine"]);
        yield* runGit(repoDir, ["checkout", "-b", "control/pr-488/statemachine"]);
        yield* runGit(repoDir, ["branch", "--set-upstream-to", "fork-seed/statemachine"]);
        yield* configureVisibleRemoteUrlWithLocalRewrite(
          repoDir,
          "fork-seed",
          "git@github.com:jasonLaster/codething-mvp.git",
          forkDir,
        );

        const { manager, ghCalls } = yield* makeManager({
          ghScenario: {
            prListSequence: [
              JSON.stringify([
                {
                  number: 488,
                  title: "Rebase this PR on latest main",
                  url: "https://github.com/pingdotgg/codething-mvp/pull/488",
                  baseRefName: "main",
                  headRefName: "statemachine",
                  state: "OPEN",
                  updatedAt: "2026-03-10T07:00:00Z",
                  isCrossRepository: true,
                  headRepository: {
                    nameWithOwner: "jasonLaster/codething-mvp",
                  },
                  headRepositoryOwner: {
                    login: "jasonLaster",
                  },
                },
              ]),
            ],
          },
        });

        const status = yield* manager.status({ cwd: repoDir });
        expect(status.refName).toBe("control/pr-488/statemachine");
        expect(status.pr).toEqual({
          number: 488,
          title: "Rebase this PR on latest main",
          url: "https://github.com/pingdotgg/codething-mvp/pull/488",
          baseRef: "main",
          headRef: "statemachine",
          state: "open",
          updatedAt: "2026-03-10T07:00:00.000Z",
        });
        expect(ghCalls).toContain(
          "pr list --head statemachine --state all --limit 100 --json number,title,url,baseRefName,headRefName,state,isDraft,mergedAt,closedAt,updatedAt,isCrossRepository,headRepository,headRepositoryOwner",
        );
      }),
    20_000,
  );

  it.effect(
    "status preserves a fork PR whose head is named after the default branch",
    () =>
      Effect.gen(function* () {
        const repoDir = yield* makeTempDir("control-git-manager-");
        yield* initRepo(repoDir);
        const originDir = yield* createBareRemote();
        const forkDir = yield* createBareRemote();
        yield* runGit(repoDir, ["remote", "add", "origin", originDir]);
        yield* runGit(repoDir, ["push", "-u", "origin", "main"]);
        yield* runGit(repoDir, ["remote", "set-head", "origin", "main"]);
        yield* runGit(repoDir, ["remote", "add", "fork-seed", forkDir]);
        yield* runGit(repoDir, ["push", "fork-seed", "main"]);
        yield* runGit(repoDir, ["checkout", "-b", "control/pr-777/main"]);
        yield* runGit(repoDir, ["branch", "--set-upstream-to", "fork-seed/main"]);
        yield* configureVisibleRemoteUrlWithLocalRewrite(
          repoDir,
          "fork-seed",
          "git@github.com:contributor/codething-mvp.git",
          forkDir,
        );

        const { manager, ghCalls } = yield* makeManager({
          ghScenario: {
            prListByHeadSelector: {
              main: JSON.stringify([
                {
                  number: 777,
                  title: "Fork PR from main",
                  url: "https://github.com/pingdotgg/codething-mvp/pull/777",
                  baseRefName: "main",
                  headRefName: "main",
                  state: "OPEN",
                  updatedAt: "2026-03-10T07:00:00Z",
                  isCrossRepository: true,
                  headRepository: {
                    nameWithOwner: "contributor/codething-mvp",
                  },
                  headRepositoryOwner: {
                    login: "contributor",
                  },
                },
              ]),
            },
          },
        });

        const status = yield* manager.status({ cwd: repoDir });
        expect(status.refName).toBe("control/pr-777/main");
        expect(status.pr).toEqual({
          number: 777,
          title: "Fork PR from main",
          url: "https://github.com/pingdotgg/codething-mvp/pull/777",
          baseRef: "main",
          headRef: "main",
          state: "open",
          updatedAt: "2026-03-10T07:00:00.000Z",
        });
        expect(ghCalls).toContain(
          "pr list --head main --state all --limit 100 --json number,title,url,baseRefName,headRefName,state,isDraft,mergedAt,closedAt,updatedAt,isCrossRepository,headRepository,headRepositoryOwner",
        );
      }),
    20_000,
  );

  it.effect(
    "status ignores synthetic local branch aliases when the upstream remote name contains slashes",
    () =>
      Effect.gen(function* () {
        const repoDir = yield* makeTempDir("control-git-manager-");
        yield* initRepo(repoDir);
        const originDir = yield* createBareRemote();
        const upstreamDir = yield* createBareRemote();
        yield* configureRemote(repoDir, "origin", originDir, "origin");
        yield* configureRemote(repoDir, "my-org/upstream", upstreamDir, "my-org/upstream");

        yield* runGit(repoDir, ["checkout", "-b", "effect-atom"]);
        yield* runGit(repoDir, ["push", "-u", "origin", "effect-atom"]);
        yield* runGit(repoDir, ["push", "-u", "my-org/upstream", "effect-atom"]);
        yield* configureVisibleRemoteUrlWithLocalRewrite(
          repoDir,
          "origin",
          "git@github.com:pingdotgg/codething-mvp.git",
          originDir,
        );
        yield* runGit(repoDir, ["config", "remote.origin.pushurl", originDir]);
        yield* configureVisibleRemoteUrlWithLocalRewrite(
          repoDir,
          "my-org/upstream",
          "ssh://git@github.com/pingdotgg/codething-mvp.git",
          upstreamDir,
        );
        yield* runGit(repoDir, ["config", "remote.my-org/upstream.pushurl", upstreamDir]);
        yield* runGit(repoDir, ["checkout", "main"]);
        yield* runGit(repoDir, ["branch", "-D", "effect-atom"]);
        yield* runGit(repoDir, ["checkout", "--track", "my-org/upstream/effect-atom"]);

        const { manager, ghCalls } = yield* makeManager({
          ghScenario: {
            prListByHeadSelector: {
              "effect-atom": JSON.stringify([
                {
                  number: 1618,
                  title: "Correct PR",
                  url: "https://github.com/acme/control/pull/1618",
                  baseRefName: "main",
                  headRefName: "effect-atom",
                  state: "OPEN",
                  updatedAt: "2026-03-01T10:00:00Z",
                },
              ]),
              "upstream/effect-atom": JSON.stringify([
                {
                  number: 1518,
                  title: "Wrong PR",
                  url: "https://github.com/acme/control/pull/1518",
                  baseRefName: "main",
                  headRefName: "upstream/effect-atom",
                  state: "OPEN",
                  updatedAt: "2026-04-01T10:00:00Z",
                },
              ]),
            },
          },
        });

        const status = yield* manager.status({ cwd: repoDir });
        expect(status.refName).toBe("upstream/effect-atom");
        expect(status.pr).toEqual({
          number: 1618,
          title: "Correct PR",
          url: "https://github.com/acme/control/pull/1618",
          baseRef: "main",
          headRef: "effect-atom",
          state: "open",
          updatedAt: "2026-03-01T10:00:00.000Z",
        });
        expect(ghCalls.some((call) => call.includes("pr list --head upstream/effect-atom "))).toBe(
          false,
        );
        expect(
          ghCalls.some((call) => call.includes("pr list --head pingdotgg:upstream/effect-atom ")),
        ).toBe(false);
        expect(
          ghCalls.some((call) =>
            call.includes("pr list --head my-org/upstream:upstream/effect-atom "),
          ),
        ).toBe(false);
      }),
    20_000,
  );

  it.effect("status returns merged PR state when latest PR was merged", () =>
    Effect.gen(function* () {
      const repoDir = yield* makeTempDir("control-git-manager-");
      yield* initRepo(repoDir);
      yield* runGit(repoDir, ["checkout", "-b", "feature/status-merged-pr"]);

      const { manager } = yield* makeManager({
        ghScenario: {
          prListSequence: [
            JSON.stringify([
              {
                number: 22,
                title: "Merged PR",
                url: "https://github.com/pingdotgg/codething-mvp/pull/22",
                baseRefName: "main",
                headRefName: "feature/status-merged-pr",
                state: "MERGED",
                mergedAt: "2026-01-30T10:00:00Z",
                updatedAt: "2026-01-30T10:00:00Z",
              },
            ]),
          ],
        },
      });

      const status = yield* manager.status({ cwd: repoDir });
      expect(status.refName).toBe("feature/status-merged-pr");
      expect(status.pr).toEqual({
        number: 22,
        title: "Merged PR",
        url: "https://github.com/pingdotgg/codething-mvp/pull/22",
        baseRef: "main",
        headRef: "feature/status-merged-pr",
        state: "merged",
        updatedAt: "2026-01-30T10:00:00.000Z",
      });
    }),
  );

  it.effect("status hides merged PRs on the default branch", () =>
    Effect.gen(function* () {
      const repoDir = yield* makeTempDir("control-git-manager-");
      yield* initRepo(repoDir);

      const { manager } = yield* makeManager({
        ghScenario: {
          prListSequence: [
            JSON.stringify([
              {
                number: 23,
                title: "Merged PR",
                url: "https://github.com/pingdotgg/codething-mvp/pull/23",
                baseRefName: "feature/status-default-branch-target",
                headRefName: "main",
                state: "MERGED",
                mergedAt: "2026-01-30T10:00:00Z",
                updatedAt: "2026-01-30T10:00:00Z",
              },
            ]),
          ],
        },
      });

      const status = yield* manager.status({ cwd: repoDir });
      expect(status.refName).toBe("main");
      expect(status.pr).toBeNull();
    }),
  );

  it.effect("status does not inherit a merged PR from a feature branch's default upstream", () =>
    Effect.gen(function* () {
      const repoDir = yield* makeTempDir("control-git-manager-");
      yield* initRepo(repoDir);
      const remoteDir = yield* createBareRemote();
      yield* runGit(repoDir, ["remote", "add", "origin", remoteDir]);
      yield* runGit(repoDir, ["push", "-u", "origin", "main"]);
      yield* runGit(repoDir, ["remote", "set-head", "origin", "main"]);
      yield* runGit(repoDir, ["checkout", "-b", "feature/from-main", "origin/main"]);

      const { manager, ghCalls } = yield* makeManager({
        ghScenario: {
          prListSequence: [
            JSON.stringify([
              {
                number: 54,
                title: "Reverse merge from main",
                url: "https://github.com/pingdotgg/codething-mvp/pull/54",
                baseRefName: "je-filter-list",
                headRefName: "main",
                state: "MERGED",
                mergedAt: "2023-09-28T03:21:10Z",
                updatedAt: "2023-09-28T03:21:10Z",
              },
            ]),
          ],
        },
      });

      const status = yield* manager.status({ cwd: repoDir });
      expect(status.refName).toBe("feature/from-main");
      expect(status.pr).toBeNull();
      expect(ghCalls.some((call) => call.includes("pr list"))).toBe(false);
    }),
  );

  it.effect("status finds a PR pushed under the branch's own name despite a default upstream", () =>
    Effect.gen(function* () {
      const repoDir = yield* makeTempDir("control-git-manager-");
      yield* initRepo(repoDir);
      const remoteDir = yield* createBareRemote();
      yield* runGit(repoDir, ["remote", "add", "origin", remoteDir]);
      yield* runGit(repoDir, ["push", "-u", "origin", "main"]);
      yield* runGit(repoDir, ["remote", "set-head", "origin", "main"]);
      yield* runGit(repoDir, ["checkout", "-b", "feature/pushed-plain", "origin/main"]);
      // A plain push (no -u) leaves the upstream on origin/main.
      yield* runGit(repoDir, ["push", "origin", "feature/pushed-plain"]);

      const { manager, ghCalls } = yield* makeManager({
        ghScenario: {
          prListByHeadSelector: {
            // Fake gh returns raw JSON stdout, matching the CLI boundary under test.
            "feature/pushed-plain": JSON.stringify([
              {
                number: 88,
                title: "Pushed without -u",
                url: "https://github.com/pingdotgg/codething-mvp/pull/88",
                baseRefName: "main",
                headRefName: "feature/pushed-plain",
                state: "OPEN",
                updatedAt: "2026-05-01T10:00:00Z",
              },
            ]),
          },
        },
      });

      const status = yield* manager.status({ cwd: repoDir });
      expect(status.refName).toBe("feature/pushed-plain");
      expect(status.pr?.number).toBe(88);
      expect(ghCalls.some((call) => call.includes("--head main"))).toBe(false);
    }),
  );

  it.effect(
    "status finds a fork PR pushed under the branch's own name despite a default upstream",
    () =>
      Effect.gen(function* () {
        const repoDir = yield* makeTempDir("control-git-manager-");
        yield* initRepo(repoDir);
        const originDir = yield* createBareRemote();
        const forkDir = yield* createBareRemote();
        yield* runGit(repoDir, ["remote", "add", "origin", originDir]);
        yield* runGit(repoDir, ["push", "-u", "origin", "main"]);
        yield* runGit(repoDir, ["remote", "set-head", "origin", "main"]);
        yield* configureRemote(repoDir, "team/fork", forkDir, "team/fork");
        yield* runGit(repoDir, ["checkout", "-b", "feature/fork-plain", "origin/main"]);
        // Pushed to the fork without -u: upstream stays origin/main.
        yield* runGit(repoDir, ["push", "team/fork", "feature/fork-plain"]);
        yield* configureVisibleRemoteUrlWithLocalRewrite(
          repoDir,
          "origin",
          "git@github.com:pingdotgg/codething-mvp.git",
          originDir,
        );
        yield* configureVisibleRemoteUrlWithLocalRewrite(
          repoDir,
          "team/fork",
          "git@github.com:contributor/codething-mvp.git",
          forkDir,
        );

        const { manager, ghCalls } = yield* makeManager({
          ghScenario: {
            prListByHeadSelector: {
              // Fake gh returns raw JSON stdout, matching the CLI boundary under test.
              "feature/fork-plain": JSON.stringify([
                {
                  number: 89,
                  title: "Fork PR pushed without -u",
                  url: "https://github.com/pingdotgg/codething-mvp/pull/89",
                  baseRefName: "main",
                  headRefName: "feature/fork-plain",
                  state: "OPEN",
                  updatedAt: "2026-05-01T10:00:00Z",
                  isCrossRepository: true,
                  headRepository: { nameWithOwner: "contributor/codething-mvp" },
                  headRepositoryOwner: { login: "contributor" },
                },
              ]),
            },
          },
        });

        const status = yield* manager.status({ cwd: repoDir });
        expect(status.pr?.number).toBe(89);
        expect(ghCalls.some((call) => call.includes("--head feature/fork-plain"))).toBe(true);
        expect(ghCalls.some((call) => call.includes("--head contributor:"))).toBe(false);
        expect(ghCalls.some((call) => call.includes("--head main"))).toBe(false);
      }),
  );

  it.effect("branch PR lookup verifies identity on the fork that holds the own-name ref", () =>
    Effect.gen(function* () {
      const repoDir = yield* makeTempDir("control-git-manager-");
      yield* initRepo(repoDir);
      const originDir = yield* createBareRemote();
      const forkDir = yield* createBareRemote();
      yield* runGit(repoDir, ["remote", "add", "origin", originDir]);
      yield* runGit(repoDir, ["push", "-u", "origin", "main"]);
      yield* runGit(repoDir, ["remote", "set-head", "origin", "main"]);
      yield* configureRemote(repoDir, "team/fork", forkDir, "team/fork");
      yield* runGit(repoDir, ["checkout", "-b", "feature/fork-settle", "origin/main"]);
      yield* runGit(repoDir, ["push", "team/fork", "feature/fork-settle"]);
      yield* configureVisibleRemoteUrlWithLocalRewrite(
        repoDir,
        "origin",
        "git@github.com:pingdotgg/codething-mvp.git",
        originDir,
      );
      yield* configureVisibleRemoteUrlWithLocalRewrite(
        repoDir,
        "team/fork",
        "git@github.com:contributor/codething-mvp.git",
        forkDir,
      );

      const { manager } = yield* makeManager({
        ghScenario: {
          prListByHeadSelector: {
            // Fake gh returns raw JSON stdout, matching the CLI boundary under test.
            "feature/fork-settle": JSON.stringify([
              {
                number: 91,
                title: "Fork PR to settle",
                url: "https://github.com/pingdotgg/codething-mvp/pull/91",
                baseRefName: "main",
                headRefName: "feature/fork-settle",
                state: "MERGED",
                updatedAt: "2026-05-02T10:00:00Z",
                isCrossRepository: true,
                headRepository: { nameWithOwner: "contributor/codething-mvp" },
                headRepositoryOwner: { login: "contributor" },
              },
            ]),
          },
        },
      });

      const pullRequest = yield* manager.branchPullRequest({
        cwd: repoDir,
        branch: "feature/fork-settle",
      });

      expect(pullRequest).toMatchObject({
        state: "merged",
        closedAt: null,
        mergedAt: null,
        updatedAt: "2026-05-02T10:00:00.000Z",
      });
    }),
  );

  it.effect("status keeps an own-name PR when a later lookup fails on a default upstream", () =>
    Effect.gen(function* () {
      const repoDir = yield* makeTempDir("control-git-manager-");
      yield* initRepo(repoDir);
      const remoteDir = yield* createBareRemote();
      yield* runGit(repoDir, ["remote", "add", "origin", remoteDir]);
      yield* runGit(repoDir, ["push", "-u", "origin", "main"]);
      yield* runGit(repoDir, ["remote", "set-head", "origin", "main"]);
      yield* runGit(repoDir, ["checkout", "-b", "feature/sticky-plain", "origin/main"]);
      yield* runGit(repoDir, ["push", "origin", "feature/sticky-plain"]);

      const { manager } = yield* makeManager({
        ghScenario: {
          prListByHeadSelector: {
            // Fake gh returns raw JSON stdout, matching the CLI boundary under test.
            "feature/sticky-plain": JSON.stringify([
              {
                number: 90,
                title: "Sticky own-name PR",
                url: "https://github.com/pingdotgg/codething-mvp/pull/90",
                baseRefName: "main",
                headRefName: "feature/sticky-plain",
                state: "OPEN",
                updatedAt: "2026-05-01T10:00:00Z",
              },
            ]),
          },
          failWith:
            "No GitHub credential on the server. Set GH_TOKEN, or install the GitHub CLI and run `gh auth login`.",
          failAfterCalls: 1,
        },
      });

      const first = yield* manager.status({ cwd: repoDir });
      expect(first.pr?.number).toBe(90);

      yield* manager.invalidateStatus(repoDir);
      const second = yield* manager.status({ cwd: repoDir });
      expect(second.pr?.number).toBe(90);
    }),
  );

  it.effect("status prefers open PR when merged PR has newer updatedAt", () =>
    Effect.gen(function* () {
      const repoDir = yield* makeTempDir("control-git-manager-");
      yield* initRepo(repoDir);
      yield* runGit(repoDir, ["checkout", "-b", "feature/status-open-over-merged"]);

      const { manager } = yield* makeManager({
        ghScenario: {
          prListSequence: [
            JSON.stringify([
              {
                number: 45,
                title: "Merged PR",
                url: "https://github.com/pingdotgg/codething-mvp/pull/45",
                baseRefName: "main",
                headRefName: "feature/status-open-over-merged",
                state: "MERGED",
                mergedAt: "2026-01-31T10:00:00Z",
                updatedAt: "2026-02-01T10:00:00Z",
              },
              {
                number: 46,
                title: "Open PR",
                url: "https://github.com/pingdotgg/codething-mvp/pull/46",
                baseRefName: "main",
                headRefName: "feature/status-open-over-merged",
                state: "OPEN",
                updatedAt: "2026-01-30T10:00:00Z",
              },
            ]),
          ],
        },
      });

      const status = yield* manager.status({ cwd: repoDir });
      expect(status.refName).toBe("feature/status-open-over-merged");
      expect(status.pr).toEqual({
        number: 46,
        title: "Open PR",
        url: "https://github.com/pingdotgg/codething-mvp/pull/46",
        baseRef: "main",
        headRef: "feature/status-open-over-merged",
        state: "open",
        updatedAt: "2026-01-30T10:00:00.000Z",
      });
    }),
  );

  it.effect("status is resilient to gh lookup failures and returns pr null", () =>
    Effect.gen(function* () {
      const repoDir = yield* makeTempDir("control-git-manager-");
      yield* initRepo(repoDir);
      yield* runGit(repoDir, ["checkout", "-b", "feature/status-no-gh"]);
      const remoteDir = yield* createBareRemote();
      yield* runGit(repoDir, ["remote", "add", "origin", remoteDir]);
      yield* runGit(repoDir, ["push", "-u", "origin", "feature/status-no-gh"]);

      const { manager } = yield* makeManager({
        ghScenario: {
          failWith:
            "No GitHub credential on the server. Set GH_TOKEN, or install the GitHub CLI and run `gh auth login`.",
        },
      });

      const status = yield* manager.status({ cwd: repoDir });
      expect(status.refName).toBe("feature/status-no-gh");
      expect(status.pr).toBeNull();
    }),
  );

  it.effect("status logs actionable provider detail without exposing the upstream cause", () =>
    Effect.gen(function* () {
      const repoDir = yield* makeTempDir("control-git-manager-");
      yield* initRepo(repoDir);
      yield* runGit(repoDir, ["checkout", "-b", "feature/status-rate-limited"]);
      const remoteDir = yield* createBareRemote();
      yield* runGit(repoDir, ["remote", "add", "origin", remoteDir]);
      yield* runGit(repoDir, ["push", "-u", "origin", "feature/status-rate-limited"]);

      const upstreamCause = "GraphQL rate limit for user ID 51714798 and token secret-value";
      const { manager } = yield* makeManager({
        ghScenario: {
          failWith: "GitHub API rate limit exceeded. Requests resume when the limit resets.",
          failCause: new Error(upstreamCause),
        },
      });
      const logs: Array<{ message: string; annotations: Record<string, unknown> }> = [];
      const logger = Logger.make<unknown, void>(({ fiber, message }) => {
        logs.push({
          message: String(message),
          annotations: { ...fiber.getRef(References.CurrentLogAnnotations) },
        });
      });

      const status = yield* manager
        .status({ cwd: repoDir })
        .pipe(Effect.provide(Logger.layer([logger], { mergeWithExisting: false })));

      expect(status.pr).toBeNull();
      const warning = logs.find((entry) => entry.message.includes("PR lookup failed"));
      expect(warning?.annotations).toMatchObject({
        operation: "lookupStatusPr",
        branch: "feature/status-rate-limited",
        errorTag: "SourceControlProviderError",
        provider: "github",
        providerOperation: "listChangeRequests",
        errorDetail: "GitHub API rate limit exceeded. Requests resume when the limit resets.",
      });
      const loggedText = [
        warning?.message ?? "",
        ...Object.values(warning?.annotations ?? {}).map(String),
      ].join("\n");
      expect(loggedText).not.toContain(upstreamCause);
      expect(loggedText).not.toContain("secret-value");
    }),
  );

  it.effect("status keeps the last known PR when a later lookup fails", () =>
    Effect.gen(function* () {
      const repoDir = yield* makeTempDir("control-git-manager-");
      yield* initRepo(repoDir);
      yield* runGit(repoDir, ["checkout", "-b", "feature/pr-sticky"]);
      const remoteDir = yield* createBareRemote();
      yield* runGit(repoDir, ["remote", "add", "origin", remoteDir]);
      yield* runGit(repoDir, ["push", "-u", "origin", "feature/pr-sticky"]);

      const existingPr = {
        number: 214,
        title: "Sticky PR",
        url: "https://github.com/pingdotgg/codething-mvp/pull/214",
        baseRefName: "main",
        headRefName: "feature/pr-sticky",
      };
      const { manager } = yield* makeManager({
        ghScenario: {
          prListSequence: [JSON.stringify([existingPr])],
          failWith:
            "No GitHub credential on the server. Set GH_TOKEN, or install the GitHub CLI and run `gh auth login`.",
          failAfterCalls: 1,
        },
      });

      const first = yield* manager.status({ cwd: repoDir });
      expect(first.pr?.number).toBe(214);

      // An explicit invalidation (user refresh, git action) bypasses the PR
      // cache and forces a live lookup — which now fails. The badge must keep
      // the last known PR instead of blanking out.
      yield* manager.invalidateStatus(repoDir);
      const second = yield* manager.status({ cwd: repoDir });
      expect(second.pr?.number).toBe(214);
    }),
  );

  it.effect(
    "status does not reuse a stale PR after the branch is retargeted to a different upstream",
    () =>
      Effect.gen(function* () {
        const repoDir = yield* makeTempDir("control-git-manager-");
        yield* initRepo(repoDir);
        yield* runGit(repoDir, ["checkout", "-b", "feature/pr-retarget"]);

        const originRemote = yield* createBareRemote();
        yield* runGit(repoDir, ["remote", "add", "origin", originRemote]);
        yield* runGit(repoDir, ["push", "-u", "origin", "feature/pr-retarget"]);

        const existingPr = {
          number: 214,
          title: "Sticky PR",
          url: "https://github.com/pingdotgg/codething-mvp/pull/214",
          baseRefName: "main",
          headRefName: "feature/pr-retarget",
        };
        const { manager } = yield* makeManager({
          ghScenario: {
            prListSequence: [JSON.stringify([existingPr])],
            failWith:
              "No GitHub credential on the server. Set GH_TOKEN, or install the GitHub CLI and run `gh auth login`.",
            failAfterCalls: 1,
          },
        });

        const first = yield* manager.status({ cwd: repoDir });
        expect(first.pr?.number).toBe(214);

        // Retarget the branch to a different remote/upstream (e.g. the PR was
        // reopened against a fork). The previously cached PR belonged to the
        // old upstream and must not be shown against the new one.
        const forkRemote = yield* createBareRemote();
        yield* runGit(repoDir, ["remote", "add", "fork", forkRemote]);
        yield* runGit(repoDir, ["push", "fork", "feature/pr-retarget"]);
        yield* runGit(repoDir, [
          "branch",
          "--set-upstream-to=fork/feature/pr-retarget",
          "feature/pr-retarget",
        ]);

        yield* manager.invalidateStatus(repoDir);
        const second = yield* manager.status({ cwd: repoDir });
        expect(second.pr).toBeNull();
      }),
  );

  it.effect("status keeps the last known PR when the branch gains its first upstream", () =>
    Effect.gen(function* () {
      const repoDir = yield* makeTempDir("control-git-manager-");
      yield* initRepo(repoDir);
      yield* runGit(repoDir, ["checkout", "-b", "feature/pr-sticky-first-push"]);
      const remoteDir = yield* createBareRemote();
      yield* runGit(repoDir, ["remote", "add", "origin", remoteDir]);

      const existingPr = {
        number: 215,
        title: "Sticky first-push PR",
        url: "https://github.com/pingdotgg/codething-mvp/pull/215",
        baseRefName: "main",
        headRefName: "feature/pr-sticky-first-push",
      };
      const { manager } = yield* makeManager({
        ghScenario: {
          prListSequence: [JSON.stringify([existingPr])],
          failWith:
            "No GitHub credential on the server. Set GH_TOKEN, or install the GitHub CLI and run `gh auth login`.",
          failAfterCalls: 1,
        },
      });

      const first = yield* manager.status({ cwd: repoDir });
      expect(first.pr?.number).toBe(215);

      yield* runGit(repoDir, ["push", "-u", "origin", "feature/pr-sticky-first-push"]);
      yield* manager.invalidateStatus(repoDir);

      const second = yield* manager.status({ cwd: repoDir });
      expect(second.pr?.number).toBe(215);
    }),
  );

  it.effect("status drops the last known PR when the tracked remote is repointed", () =>
    Effect.gen(function* () {
      const repoDir = yield* makeTempDir("control-git-manager-");
      yield* initRepo(repoDir);
      yield* runGit(repoDir, ["checkout", "-b", "feature/pr-repointed"]);
      const originalRemoteDir = yield* createBareRemote();
      yield* runGit(repoDir, ["remote", "add", "origin", originalRemoteDir]);
      yield* runGit(repoDir, ["push", "-u", "origin", "feature/pr-repointed"]);

      const existingPr = {
        number: 216,
        title: "Old remote PR",
        url: "https://github.com/pingdotgg/codething-mvp/pull/216",
        baseRefName: "main",
        headRefName: "feature/pr-repointed",
      };
      const { manager } = yield* makeManager({
        ghScenario: {
          prListSequence: [JSON.stringify([existingPr])],
          failWith:
            "No GitHub credential on the server. Set GH_TOKEN, or install the GitHub CLI and run `gh auth login`.",
          failAfterCalls: 1,
        },
      });

      const first = yield* manager.status({ cwd: repoDir });
      expect(first.pr?.number).toBe(216);

      const replacementRemoteDir = yield* createBareRemote();
      yield* runGit(repoDir, ["remote", "add", "replacement", replacementRemoteDir]);
      yield* runGit(repoDir, ["push", "replacement", "feature/pr-repointed"]);
      yield* runGit(repoDir, ["remote", "set-url", "origin", replacementRemoteDir]);
      yield* manager.invalidateStatus(repoDir);

      const second = yield* manager.status({ cwd: repoDir });
      expect(second.pr).toBeNull();
    }),
  );

  it.effect("status keeps the last known PR when the current remote URL can't be resolved", () =>
    Effect.gen(function* () {
      const repoDir = yield* makeTempDir("control-git-manager-");
      yield* initRepo(repoDir);
      yield* runGit(repoDir, ["checkout", "-b", "feature/pr-config-hiccup"]);
      const remoteDir = yield* createBareRemote();
      yield* runGit(repoDir, ["remote", "add", "origin", remoteDir]);
      yield* runGit(repoDir, ["push", "-u", "origin", "feature/pr-config-hiccup"]);

      const existingPr = {
        number: 217,
        title: "Config hiccup PR",
        url: "https://github.com/pingdotgg/codething-mvp/pull/217",
        baseRefName: "main",
        headRefName: "feature/pr-config-hiccup",
      };
      const { manager } = yield* makeManager({
        ghScenario: {
          prListSequence: [JSON.stringify([existingPr])],
          failWith:
            "No GitHub credential on the server. Set GH_TOKEN, or install the GitHub CLI and run `gh auth login`.",
          failAfterCalls: 1,
        },
      });

      const first = yield* manager.status({ cwd: repoDir });
      expect(first.pr?.number).toBe(217);

      // `remote.origin.url` reads go through readConfigValueNullable, which
      // maps ANY failed read (a real "no remote configured" state or a
      // transient git-config hiccup) to null the same way. Unsetting the
      // key here reproduces that ambiguity without touching branch
      // tracking (refs/remotes/origin/* and branch.<b>.remote are
      // untouched) — the remote identity has not actually changed, so the
      // sticky PR must survive even though the current lookup can no
      // longer resolve a remote URL to compare against.
      yield* runGit(repoDir, ["config", "--unset", "remote.origin.url"]);
      yield* manager.invalidateStatus(repoDir);

      const second = yield* manager.status({ cwd: repoDir });
      expect(second.pr?.number).toBe(217);
    }),
  );
});
