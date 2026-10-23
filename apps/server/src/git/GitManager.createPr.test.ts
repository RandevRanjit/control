// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { expect } from "vite-plus/test";
import * as TextGeneration from "../textGeneration/TextGeneration.ts";
import { toForgejoChangeRequest } from "../sourceControl/forgejoPullRequests.ts";
import * as GitManager from "./GitManager.ts";
import {
  decodeForgejoPullRequest,
  makeTempDir,
  runGit,
  initRepo,
  createBareRemote,
  configureRemote,
  configureVisibleRemoteUrlWithLocalRewrite,
  runStackedAction,
  makeManager,
  layerGitManagerTest,
} from "./GitManager.testkit.ts";

it.layer(layerGitManagerTest)("GitManager", (it) => {
  it.effect("create_pr pushes a clean branch before creating the PR when needed", () =>
    Effect.gen(function* () {
      const repoDir = yield* makeTempDir("control-git-manager-");
      yield* initRepo(repoDir);
      yield* runGit(repoDir, ["checkout", "-b", "feature/create-pr-only"]);
      const remoteDir = yield* createBareRemote();
      yield* runGit(repoDir, ["remote", "add", "origin", remoteDir]);
      NodeFS.writeFileSync(NodePath.join(repoDir, "create-pr-only.txt"), "create pr\n");
      yield* runGit(repoDir, ["add", "create-pr-only.txt"]);
      yield* runGit(repoDir, ["commit", "-m", "Create PR only branch"]);

      const { manager, ghCalls } = yield* makeManager({
        ghScenario: {
          prListSequence: [
            "[]",
            JSON.stringify([
              {
                number: 303,
                title: "Create PR only branch",
                url: "https://github.com/pingdotgg/codething-mvp/pull/303",
                baseRefName: "main",
                headRefName: "feature/create-pr-only",
              },
            ]),
          ],
        },
      });

      const result = yield* runStackedAction(manager, {
        cwd: repoDir,
        action: "create_pr",
      });

      expect(result.commit.status).toBe("skipped_not_requested");
      expect(result.push.status).toBe("pushed");
      expect(result.push.setUpstream).toBe(true);
      expect(result.pr.status).toBe("created");
      expect(result.pr.number).toBe(303);
      expect(
        ghCalls.some((call) =>
          call.includes("pr create --base main --head feature/create-pr-only"),
        ),
      ).toBe(true);
    }),
  );

  it.effect("create_pr falls back to main when source control provider detection fails", () =>
    Effect.gen(function* () {
      const repoDir = yield* makeTempDir("control-git-manager-");
      yield* initRepo(repoDir);
      yield* runGit(repoDir, ["checkout", "-b", "feature/provider-fallback"]);
      NodeFS.writeFileSync(NodePath.join(repoDir, "provider-fallback.txt"), "fallback\n");
      yield* runGit(repoDir, ["add", "provider-fallback.txt"]);
      yield* runGit(repoDir, ["commit", "-m", "Provider fallback"]);
      const remoteDir = yield* createBareRemote();
      yield* runGit(repoDir, ["remote", "add", "origin", remoteDir]);

      const { manager, ghCalls } = yield* makeManager({
        ghScenario: {
          prListSequence: [
            "[]",
            JSON.stringify([
              {
                number: 404,
                title: "Provider fallback",
                url: "https://github.com/pingdotgg/codething-mvp/pull/404",
                baseRefName: "main",
                headRefName: "feature/provider-fallback",
              },
            ]),
          ],
        },
      });

      const result = yield* runStackedAction(manager, {
        cwd: repoDir,
        action: "create_pr",
      });

      expect(result.pr.status).toBe("created");
      expect(result.pr.number).toBe(404);
      expect(
        ghCalls.some((call) =>
          call.includes("pr create --base main --head feature/provider-fallback"),
        ),
      ).toBe(true);
    }),
  );

  it.effect("create_pr targets the remote default branch when it is not main", () =>
    Effect.gen(function* () {
      const repoDir = yield* makeTempDir("control-git-manager-");
      yield* initRepo(repoDir);
      const remoteDir = yield* createBareRemote();
      yield* runGit(repoDir, ["remote", "add", "origin", remoteDir]);
      // A repository whose default branch is master, with no main anywhere.
      yield* runGit(repoDir, ["push", "origin", "HEAD:master"]);
      yield* runGit(repoDir, ["fetch", "origin"]);
      yield* runGit(repoDir, ["remote", "set-head", "origin", "master"]);

      yield* runGit(repoDir, ["checkout", "-b", "feature/master-default"]);
      NodeFS.writeFileSync(NodePath.join(repoDir, "master-default.txt"), "master default\n");
      yield* runGit(repoDir, ["add", "master-default.txt"]);
      yield* runGit(repoDir, ["commit", "-m", "Master default"]);

      const { manager, ghCalls } = yield* makeManager({
        ghScenario: {
          // Mirrors a provider that cannot report a default branch, as the Azure
          // DevOps CLI does when it cannot detect the repository.
          defaultBranch: "",
          prListSequence: [
            "[]",
            JSON.stringify([
              {
                number: 505,
                title: "Master default",
                url: "https://github.com/pingdotgg/codething-mvp/pull/505",
                baseRefName: "master",
                headRefName: "feature/master-default",
              },
            ]),
          ],
        },
      });

      const result = yield* runStackedAction(manager, {
        cwd: repoDir,
        action: "create_pr",
      });

      expect(result.pr.status).toBe("created");
      expect(
        ghCalls.some((call) =>
          call.includes("pr create --base master --head feature/master-default"),
        ),
      ).toBe(true);
    }),
  );

  it.effect("returns existing PR metadata for commit/push/pr action", () =>
    Effect.gen(function* () {
      const repoDir = yield* makeTempDir("control-git-manager-");
      yield* initRepo(repoDir);
      yield* runGit(repoDir, ["checkout", "-b", "feature/existing-pr"]);
      const remoteDir = yield* createBareRemote();
      yield* runGit(repoDir, ["remote", "add", "origin", remoteDir]);
      yield* runGit(repoDir, ["push", "-u", "origin", "feature/existing-pr"]);

      const { manager, ghCalls } = yield* makeManager({
        ghScenario: {
          prListSequence: [
            JSON.stringify([
              {
                number: 42,
                title: "Existing PR",
                url: "https://github.com/pingdotgg/codething-mvp/pull/42",
                baseRefName: "main",
                headRefName: "feature/existing-pr",
              },
            ]),
          ],
        },
      });
      const result = yield* runStackedAction(manager, {
        cwd: repoDir,
        action: "commit_push_pr",
      });

      expect(result.branch.status).toBe("skipped_not_requested");
      expect(result.pr.status).toBe("opened_existing");
      expect(result.pr.number).toBe(42);
      expect(result.toast).toEqual({
        title: "Opened PR #42",
        description: "Existing PR",
        cta: {
          kind: "open_pr",
          label: "View PR",
          url: "https://github.com/pingdotgg/codething-mvp/pull/42",
        },
      });
      expect(ghCalls.some((call) => call.startsWith("pr view "))).toBe(false);
    }),
  );

  it.effect(
    "returns existing cross-repo PR metadata found under the bare branch name",
    () =>
      Effect.gen(function* () {
        const repoDir = yield* makeTempDir("control-git-manager-");
        yield* initRepo(repoDir);
        yield* runGit(repoDir, ["checkout", "-b", "statemachine"]);
        const forkDir = yield* createBareRemote();
        yield* runGit(repoDir, ["remote", "add", "fork-seed", forkDir]);
        yield* runGit(repoDir, ["push", "-u", "fork-seed", "statemachine"]);
        yield* configureVisibleRemoteUrlWithLocalRewrite(
          repoDir,
          "fork-seed",
          "git@github.com:octocat/codething-mvp.git",
          forkDir,
        );

        const { manager, ghCalls } = yield* makeManager({
          ghScenario: {
            prListSequence: [
              JSON.stringify([
                {
                  number: 142,
                  title: "Existing fork PR",
                  url: "https://github.com/pingdotgg/codething-mvp/pull/142",
                  baseRefName: "main",
                  headRefName: "statemachine",
                  state: "OPEN",
                  isCrossRepository: true,
                  headRepository: {
                    nameWithOwner: "octocat/codething-mvp",
                  },
                  headRepositoryOwner: {
                    login: "octocat",
                  },
                },
              ]),
            ],
          },
        });

        const result = yield* runStackedAction(manager, {
          cwd: repoDir,
          action: "commit_push_pr",
        });

        expect(result.pr.status).toBe("opened_existing");
        expect(result.pr.number).toBe(142);
        expect(
          ghCalls.some((call) =>
            call.includes("pr list --head statemachine --state open --limit 100"),
          ),
        ).toBe(true);
        expect(ghCalls.some((call) => call.startsWith("pr create "))).toBe(false);
      }),
    12_000,
  );

  it.effect(
    "returns the correct existing PR when a slash remote checks out to a synthetic local alias",
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
        NodeFS.writeFileSync(NodePath.join(repoDir, "changes.txt"), "change\n");
        yield* runGit(repoDir, ["add", "changes.txt"]);
        yield* runGit(repoDir, ["commit", "-m", "Feature commit"]);

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
                },
              ]),
              "upstream/effect-atom": JSON.stringify([
                {
                  number: 1518,
                  title: "Wrong PR",
                  url: "https://github.com/acme/control/pull/1518",
                  baseRefName: "main",
                  headRefName: "upstream/effect-atom",
                },
              ]),
            },
          },
        });

        const result = yield* runStackedAction(manager, {
          cwd: repoDir,
          action: "commit_push_pr",
        });

        expect(result.pr.status).toBe("opened_existing");
        expect(result.pr.number).toBe(1618);
        expect(ghCalls.some((call) => call.includes("pr list --head upstream/effect-atom "))).toBe(
          false,
        );
      }),
    20_000,
  );

  it.effect(
    "picks the fork PR among same-named branches from other repositories",
    () =>
      Effect.gen(function* () {
        const repoDir = yield* makeTempDir("control-git-manager-");
        yield* initRepo(repoDir);
        yield* runGit(repoDir, ["checkout", "-b", "statemachine"]);
        const forkDir = yield* createBareRemote();
        yield* runGit(repoDir, ["remote", "add", "fork-seed", forkDir]);
        yield* runGit(repoDir, ["push", "-u", "fork-seed", "statemachine"]);
        yield* runGit(repoDir, ["checkout", "-b", "control/pr-142/statemachine"]);
        yield* runGit(repoDir, ["branch", "--set-upstream-to", "fork-seed/statemachine"]);
        yield* configureVisibleRemoteUrlWithLocalRewrite(
          repoDir,
          "fork-seed",
          "git@github.com:octocat/codething-mvp.git",
          forkDir,
        );

        const { manager, ghCalls } = yield* makeManager({
          ghScenario: {
            prListByHeadSelector: {
              "control/pr-142/statemachine": JSON.stringify([]),
              statemachine: JSON.stringify([
                {
                  number: 41,
                  title: "Unrelated same-repo PR",
                  url: "https://github.com/pingdotgg/codething-mvp/pull/41",
                  baseRefName: "main",
                  headRefName: "statemachine",
                },
                {
                  number: 142,
                  title: "Existing fork PR",
                  url: "https://github.com/pingdotgg/codething-mvp/pull/142",
                  baseRefName: "main",
                  headRefName: "statemachine",
                  state: "OPEN",
                  isCrossRepository: true,
                  headRepository: {
                    nameWithOwner: "octocat/codething-mvp",
                  },
                  headRepositoryOwner: {
                    login: "octocat",
                  },
                },
              ]),
            },
          },
        });

        const result = yield* runStackedAction(manager, {
          cwd: repoDir,
          action: "commit_push_pr",
        });

        expect(result.pr.status).toBe("opened_existing");
        expect(result.pr.number).toBe(142);
        expect(
          ghCalls.some((call) => /--head [^ ]*:/u.test(call) && call.startsWith("pr list")),
        ).toBe(false);
        expect(ghCalls.some((call) => call.startsWith("pr create "))).toBe(false);
      }),
    12_000,
  );

  it.effect(
    "stops probing head selectors after finding an existing PR",
    () =>
      Effect.gen(function* () {
        const repoDir = yield* makeTempDir("control-git-manager-");
        yield* initRepo(repoDir);
        yield* runGit(repoDir, ["checkout", "-b", "statemachine"]);
        const forkDir = yield* createBareRemote();
        yield* runGit(repoDir, ["remote", "add", "fork-seed", forkDir]);
        yield* runGit(repoDir, ["push", "-u", "fork-seed", "statemachine"]);
        yield* runGit(repoDir, ["checkout", "-b", "control/pr-142/statemachine"]);
        yield* runGit(repoDir, ["branch", "--set-upstream-to", "fork-seed/statemachine"]);
        yield* configureVisibleRemoteUrlWithLocalRewrite(
          repoDir,
          "fork-seed",
          "git@github.com:octocat/codething-mvp.git",
          forkDir,
        );

        const { manager, ghCalls } = yield* makeManager({
          ghScenario: {
            prListByHeadSelector: {
              statemachine: JSON.stringify([
                {
                  number: 142,
                  title: "Existing fork PR",
                  url: "https://github.com/pingdotgg/codething-mvp/pull/142",
                  baseRefName: "main",
                  headRefName: "statemachine",
                  state: "OPEN",
                  isCrossRepository: true,
                  headRepository: {
                    nameWithOwner: "octocat/codething-mvp",
                  },
                  headRepositoryOwner: {
                    login: "octocat",
                  },
                },
              ]),
              "control/pr-142/statemachine": JSON.stringify([]),
            },
          },
        });

        const result = yield* runStackedAction(manager, {
          cwd: repoDir,
          action: "commit_push_pr",
        });

        expect(result.pr.status).toBe("opened_existing");
        expect(result.pr.number).toBe(142);

        const openLookupCalls = ghCalls.filter((call) => call.includes("--state open --limit 100"));
        expect(openLookupCalls).toHaveLength(1);
        expect(openLookupCalls[0]).toContain(
          "pr list --head statemachine --state open --limit 100",
        );
      }),
    12_000,
  );

  it.effect(
    "does not reuse a cross-repo PR when GitHub omits head identity metadata",
    () =>
      Effect.gen(function* () {
        const repoDir = yield* makeTempDir("control-git-manager-");
        yield* initRepo(repoDir);
        yield* runGit(repoDir, ["checkout", "-b", "statemachine"]);
        const forkDir = yield* createBareRemote();
        yield* runGit(repoDir, ["remote", "add", "fork-seed", forkDir]);
        yield* runGit(repoDir, ["push", "-u", "fork-seed", "statemachine"]);
        yield* runGit(repoDir, [
          "config",
          "remote.fork-seed.url",
          "git@github.com:octocat/codething-mvp.git",
        ]);

        const { manager, ghCalls } = yield* makeManager({
          ghScenario: {
            prListSequenceByHeadSelector: {
              statemachine: [
                `[{"number":41,"title":"Ambiguous fork PR","url":"https://github.com/pingdotgg/codething-mvp/pull/41","baseRefName":"main","headRefName":"statemachine","state":"OPEN"}]`,
                `[{"number":142,"title":"Add stacked git actions","url":"https://github.com/pingdotgg/codething-mvp/pull/142","baseRefName":"main","headRefName":"statemachine","state":"OPEN","isCrossRepository":true,"headRepository":{"nameWithOwner":"octocat/codething-mvp"},"headRepositoryOwner":{"login":"octocat"}}]`,
              ],
            },
          },
        });

        const result = yield* runStackedAction(manager, {
          cwd: repoDir,
          action: "commit_push_pr",
        });

        expect(result.pr.status).toBe("created");
        expect(result.pr.number).toBe(142);
        expect(ghCalls.some((call) => call.startsWith("pr create "))).toBe(true);
      }),
    20_000,
  );

  it.effect("matches mounted Forgejo heads without confusing forks sharing a branch", () =>
    Effect.gen(function* () {
      for (const owner of ["maria", "reviewer"]) {
        const mapped = toForgejoChangeRequest(
          yield* decodeForgejoPullRequest({
            number: 42,
            title: "Greeting",
            html_url: "https://forgejo.example/forgejo/maria/project/pulls/42",
            state: "open",
            merged: false,
            base: {
              ref: "main",
              sha: "base",
              repo: { full_name: "maria/project", owner: { login: "maria" } },
            },
            head: {
              ref: "greeting",
              sha: "head",
              repo: { full_name: `${owner}/project`, owner: { login: owner } },
            },
          }),
        );
        const pr = {
          ...mapped,
          isDraft: mapped.isDraft ?? false,
          closedAt: mapped.closedAt ?? null,
          mergedAt: mapped.mergedAt ?? null,
        };
        const repository = GitManager.parseRepositoryNameWithOwnerFromRemoteUrl(
          `https://forgejo.example/forgejo/${owner}/project.git`,
          "forgejo",
        );
        expect(repository).toBe(`${owner}/project`);
        const context = {
          headBranch: "greeting",
          headRepositoryNameWithOwner: repository,
          headRepositoryOwnerLogin: repository?.split("/")[0] ?? null,
          isCrossRepository: owner !== "maria",
        };
        expect(GitManager.matchesBranchHeadContext(pr, context)).toBe(true);
        expect(
          GitManager.matchesBranchHeadContext(pr, {
            ...context,
            headRepositoryNameWithOwner: "other/project",
            headRepositoryOwnerLogin: "other",
          }),
        ).toBe(false);
      }
      expect(
        GitManager.parseRepositoryNameWithOwnerFromRemoteUrl(
          "git@forgejo.example:maria/project.git",
          "forgejo",
        ),
      ).toBe("maria/project");
      expect(
        GitManager.parseRepositoryNameWithOwnerFromRemoteUrl(
          "https://gitlab.example/group/maria/project.git",
          "gitlab",
        ),
      ).toBe("group/maria/project");
    }),
  );

  it.effect("rejects same-repo PR metadata when matching a cross-repo head context", () =>
    Effect.sync(() => {
      const headContext = {
        headBranch: "statemachine",
        headRepositoryNameWithOwner: "pingdotgg/codething-mvp",
        headRepositoryOwnerLogin: "pingdotgg",
        isCrossRepository: true,
      };

      expect(
        GitManager.matchesBranchHeadContext(
          {
            number: 41,
            title: "Same-repo PR",
            url: "https://github.com/pingdotgg/codething-mvp/pull/41",
            baseRefName: "main",
            headRefName: "statemachine",
            state: "open",
            updatedAt: Option.none(),
            isCrossRepository: false,
            headRepositoryNameWithOwner: "pingdotgg/codething-mvp",
            headRepositoryOwnerLogin: "pingdotgg",
          },
          headContext,
        ),
      ).toBe(false);

      expect(
        GitManager.matchesBranchHeadContext(
          {
            number: 142,
            title: "Fork PR",
            url: "https://github.com/pingdotgg/codething-mvp/pull/142",
            baseRefName: "main",
            headRefName: "statemachine",
            state: "open",
            updatedAt: Option.none(),
            isCrossRepository: true,
            headRepositoryNameWithOwner: "pingdotgg/codething-mvp",
            headRepositoryOwnerLogin: "pingdotgg",
          },
          headContext,
        ),
      ).toBe(true);
    }),
  );

  it.effect("accepts fork PR metadata when origin is the fork checkout remote", () =>
    Effect.sync(() => {
      const headContext = {
        headBranch: "control/git-audit-stability",
        headRepositoryNameWithOwner: "justsomelegs/control",
        headRepositoryOwnerLogin: "justsomelegs",
        isCrossRepository: false,
      };

      expect(
        GitManager.matchesBranchHeadContext(
          {
            number: 2284,
            title: "Improve branch mismatch warnings",
            url: "https://github.com/acme/control/pull/2284",
            baseRefName: "main",
            headRefName: "control/git-audit-stability",
            state: "open",
            updatedAt: Option.none(),
            isCrossRepository: true,
            headRepositoryNameWithOwner: "justsomelegs/control",
            headRepositoryOwnerLogin: "justsomelegs",
          },
          headContext,
        ),
      ).toBe(true);
    }),
  );

  it.effect("creates PR when one does not already exist", () =>
    Effect.gen(function* () {
      const repoDir = yield* makeTempDir("control-git-manager-");
      yield* initRepo(repoDir);
      NodeFS.mkdirSync(NodePath.join(repoDir, ".github"));
      NodeFS.writeFileSync(
        NodePath.join(repoDir, ".github", "pull_request_template.md"),
        "## What changed?\n\n## Verification",
      );
      yield* runGit(repoDir, ["add", ".github/pull_request_template.md"]);
      yield* runGit(repoDir, ["commit", "-m", "Add pull request template"]);
      yield* runGit(repoDir, ["checkout", "-b", "feature-create-pr"]);
      const remoteDir = yield* createBareRemote();
      yield* runGit(repoDir, ["remote", "add", "origin", remoteDir]);
      NodeFS.writeFileSync(NodePath.join(repoDir, "changes.txt"), "change\n");
      yield* runGit(repoDir, ["add", "changes.txt"]);
      yield* runGit(repoDir, ["commit", "-m", "Feature commit"]);
      yield* runGit(repoDir, ["push", "-u", "origin", "feature-create-pr"]);
      yield* runGit(repoDir, ["config", "branch.feature-create-pr.gh-merge-base", "main"]);
      let generatedPolicy: TextGeneration.PrContentGenerationInput["policy"] = undefined;
      let generatedChangeRequestTemplate: string | undefined;

      const { manager, ghCalls } = yield* makeManager({
        serverSettings: {
          sourceControlWritingStyle: {
            mode: "custom" as const,
            customInstructions: "Lead with user impact.",
          },
        },
        textGeneration: {
          generatePrContent: (input) => {
            generatedPolicy = input.policy;
            generatedChangeRequestTemplate = input.changeRequestTemplate;
            return Effect.succeed({
              title: "Add stacked git actions",
              body: "## What changed?\nAdded stacked git actions.",
            });
          },
        },
        ghScenario: {
          prListSequence: [
            "[]",
            JSON.stringify([
              {
                number: 88,
                title: "Add stacked git actions",
                url: "https://github.com/pingdotgg/codething-mvp/pull/88",
                baseRefName: "main",
                headRefName: "feature-create-pr",
              },
            ]),
          ],
        },
      });
      const result = yield* runStackedAction(manager, {
        cwd: repoDir,
        action: "commit_push_pr",
      });

      expect(result.branch.status).toBe("skipped_not_requested");
      expect(result.pr.status).toBe("created");
      expect(result.pr.number).toBe(88);
      expect(generatedPolicy).toMatchObject({
        changeRequestInstructions: "Lead with user impact.",
      });
      expect(generatedChangeRequestTemplate).toBe("## What changed?\n\n## Verification");
      expect(ghCalls.filter((call) => call.startsWith("pr list "))).toHaveLength(2);
      expect(
        ghCalls.some((call) => call.includes("pr create --base main --head feature-create-pr")),
      ).toBe(true);
      expect(ghCalls.some((call) => call.startsWith("pr view "))).toBe(false);
    }),
  );

  it.effect("generates PR content from branch changes when the remote base advances", () =>
    Effect.gen(function* () {
      const repoDir = yield* makeTempDir("control-git-manager-");
      yield* initRepo(repoDir);
      const remoteDir = yield* createBareRemote();
      yield* runGit(repoDir, ["remote", "add", "origin", remoteDir]);
      yield* runGit(repoDir, ["push", "-u", "origin", "main"]);
      yield* runGit(remoteDir, ["symbolic-ref", "HEAD", "refs/heads/main"]);

      const peerDir = yield* makeTempDir("control-git-peer-");
      yield* runGit(peerDir, ["clone", remoteDir, "."]);
      yield* runGit(peerDir, ["config", "user.email", "peer@example.com"]);
      yield* runGit(peerDir, ["config", "user.name", "Peer User"]);
      NodeFS.writeFileSync(NodePath.join(peerDir, "remote.txt"), "remote\n");
      yield* runGit(peerDir, ["add", "remote.txt"]);
      yield* runGit(peerDir, ["commit", "-m", "Remote base commit"]);
      yield* runGit(peerDir, ["push", "origin", "main"]);

      yield* runGit(repoDir, ["fetch", "origin"]);
      yield* runGit(repoDir, [
        "checkout",
        "--no-track",
        "-b",
        "feature/remote-base",
        "origin/main",
      ]);
      NodeFS.writeFileSync(NodePath.join(repoDir, "feature.txt"), "feature\n");
      yield* runGit(repoDir, ["add", "feature.txt"]);
      yield* runGit(repoDir, ["commit", "-m", "Feature commit"]);
      yield* runGit(repoDir, ["push", "-u", "origin", "feature/remote-base"]);
      yield* runGit(repoDir, ["config", "branch.feature/remote-base.gh-merge-base", "main"]);

      NodeFS.writeFileSync(NodePath.join(peerDir, "later-main.txt"), "unrelated\n");
      yield* runGit(peerDir, ["add", "later-main.txt"]);
      yield* runGit(peerDir, ["commit", "-m", "Later main commit"]);
      yield* runGit(peerDir, ["push", "origin", "main"]);
      yield* runGit(repoDir, ["fetch", "origin"]);

      let generatedCommitSummary = "";
      let generatedDiffSummary = "";
      let generatedDiffPatch = "";
      const { manager } = yield* makeManager({
        ghScenario: {
          prListSequence: ["[]", "[]"],
        },
        textGeneration: {
          generatePrContent: (input) => {
            generatedCommitSummary = input.commitSummary;
            generatedDiffSummary = input.diffSummary;
            generatedDiffPatch = input.diffPatch;
            return Effect.succeed({ title: "Feature PR", body: "Feature body" });
          },
        },
      });

      const result = yield* runStackedAction(manager, {
        cwd: repoDir,
        action: "create_pr",
      });

      expect(result.pr.status).toBe("created");
      expect(generatedCommitSummary).toContain("Feature commit");
      expect(generatedCommitSummary).not.toContain("Remote base commit");
      expect(generatedCommitSummary).not.toContain("Later main commit");
      expect(generatedDiffSummary).toContain("feature.txt");
      expect(generatedDiffSummary).not.toContain("later-main.txt");
      expect(generatedDiffPatch).toContain("feature.txt");
      expect(generatedDiffPatch).not.toContain("later-main.txt");
    }),
  );

  it.effect(
    "creates a new PR instead of reusing an unrelated fork PR with the same head branch",
    () =>
      Effect.gen(function* () {
        const repoDir = yield* makeTempDir("control-git-manager-");
        yield* initRepo(repoDir);
        yield* runGit(repoDir, ["checkout", "-b", "feature/no-fork-match"]);
        const remoteDir = yield* createBareRemote();
        yield* runGit(repoDir, ["remote", "add", "origin", remoteDir]);
        NodeFS.writeFileSync(NodePath.join(repoDir, "changes.txt"), "change\n");
        yield* runGit(repoDir, ["add", "changes.txt"]);
        yield* runGit(repoDir, ["commit", "-m", "Feature commit"]);
        yield* runGit(repoDir, ["push", "-u", "origin", "feature/no-fork-match"]);

        const { manager, ghCalls } = yield* makeManager({
          ghScenario: {
            prListSequence: [
              JSON.stringify([
                {
                  number: 1661,
                  title: "Fork PR with same branch name",
                  url: "https://github.com/acme/control/pull/1661",
                  baseRefName: "main",
                  headRefName: "feature/no-fork-match",
                  state: "OPEN",
                  isCrossRepository: true,
                  headRepository: {
                    nameWithOwner: "lnieuwenhuis/control",
                  },
                  headRepositoryOwner: {
                    login: "lnieuwenhuis",
                  },
                },
              ]),
              JSON.stringify([
                {
                  number: 188,
                  title: "Add stacked git actions",
                  url: "https://github.com/pingdotgg/codething-mvp/pull/188",
                  baseRefName: "main",
                  headRefName: "feature/no-fork-match",
                  state: "OPEN",
                  isCrossRepository: false,
                },
              ]),
            ],
          },
        });
        const result = yield* runStackedAction(manager, {
          cwd: repoDir,
          action: "commit_push_pr",
        });

        expect(result.pr.status).toBe("created");
        expect(result.pr.number).toBe(188);
        expect(result.toast).toEqual({
          title: "Created PR #188",
          description: "Add stacked git actions",
          cta: {
            kind: "open_pr",
            label: "View PR",
            url: "https://github.com/pingdotgg/codething-mvp/pull/188",
          },
        });
        expect(
          ghCalls.some((call) =>
            call.includes("pr create --base main --head feature/no-fork-match"),
          ),
        ).toBe(true);
      }),
  );

  it.effect("creates cross-repo PRs with the fork owner selector and default base branch", () =>
    Effect.gen(function* () {
      const repoDir = yield* makeTempDir("control-git-manager-");
      yield* initRepo(repoDir);
      const forkDir = yield* createBareRemote();
      yield* runGit(repoDir, ["remote", "add", "fork-seed", forkDir]);
      yield* runGit(repoDir, ["checkout", "-b", "statemachine"]);
      NodeFS.writeFileSync(NodePath.join(repoDir, "changes.txt"), "change\n");
      yield* runGit(repoDir, ["add", "changes.txt"]);
      yield* runGit(repoDir, ["commit", "-m", "Feature commit"]);
      yield* runGit(repoDir, ["push", "-u", "fork-seed", "statemachine"]);
      yield* runGit(repoDir, ["checkout", "-b", "control/pr-91/statemachine"]);
      yield* runGit(repoDir, ["branch", "--set-upstream-to", "fork-seed/statemachine"]);
      yield* configureVisibleRemoteUrlWithLocalRewrite(
        repoDir,
        "fork-seed",
        "git@github.com:octocat/codething-mvp.git",
        forkDir,
      );

      const { manager, ghCalls } = yield* makeManager({
        ghScenario: {
          prListSequenceByHeadSelector: {
            statemachine: [
              JSON.stringify([]),
              JSON.stringify([
                {
                  number: 188,
                  title: "Add stacked git actions",
                  url: "https://github.com/pingdotgg/codething-mvp/pull/188",
                  baseRefName: "main",
                  headRefName: "statemachine",
                  state: "OPEN",
                  isCrossRepository: true,
                  headRepository: {
                    nameWithOwner: "octocat/codething-mvp",
                  },
                  headRepositoryOwner: {
                    login: "octocat",
                  },
                },
              ]),
            ],
          },
        },
      });

      const result = yield* runStackedAction(manager, {
        cwd: repoDir,
        action: "commit_push_pr",
      });

      expect(result.pr.status).toBe("created");
      expect(result.pr.number).toBe(188);
      expect(
        ghCalls.some((call) => call.includes("pr create --base main --head octocat:statemachine")),
      ).toBe(true);
      expect(
        ghCalls.some((call) =>
          call.includes("pr create --base statemachine --head octocat:statemachine"),
        ),
      ).toBe(false);
    }),
  );

  it.effect("rejects push/pr actions from detached HEAD", () =>
    Effect.gen(function* () {
      const repoDir = yield* makeTempDir("control-git-manager-");
      yield* initRepo(repoDir);
      yield* runGit(repoDir, ["checkout", "--detach", "HEAD"]);

      const { manager } = yield* makeManager();
      const errorMessage = yield* runStackedAction(manager, {
        cwd: repoDir,
        action: "commit_push",
      }).pipe(
        Effect.flip,
        Effect.map((error) => error.message),
      );
      expect(errorMessage).toContain("detached HEAD");
    }),
  );

  it.effect("surfaces missing gh binary errors", () =>
    Effect.gen(function* () {
      const repoDir = yield* makeTempDir("control-git-manager-");
      yield* initRepo(repoDir);
      yield* runGit(repoDir, ["checkout", "-b", "feature/gh-missing"]);
      const remoteDir = yield* createBareRemote();
      yield* runGit(repoDir, ["remote", "add", "origin", remoteDir]);
      yield* runGit(repoDir, ["push", "-u", "origin", "feature/gh-missing"]);

      const { manager } = yield* makeManager({
        ghScenario: {
          failWith:
            "No GitHub credential on the server. Set GH_TOKEN, or install the GitHub CLI and run `gh auth login`.",
        },
      });

      const errorMessage = yield* runStackedAction(manager, {
        cwd: repoDir,
        action: "commit_push_pr",
      }).pipe(
        Effect.flip,
        Effect.map((error) => error.message),
      );
      expect(errorMessage).toContain("No GitHub credential on the server");
    }),
  );

  it.effect("surfaces gh auth errors with guidance", () =>
    Effect.gen(function* () {
      const repoDir = yield* makeTempDir("control-git-manager-");
      yield* initRepo(repoDir);
      yield* runGit(repoDir, ["checkout", "-b", "feature/gh-auth"]);
      const remoteDir = yield* createBareRemote();
      yield* runGit(repoDir, ["remote", "add", "origin", remoteDir]);
      yield* runGit(repoDir, ["push", "-u", "origin", "feature/gh-auth"]);

      const { manager } = yield* makeManager({
        ghScenario: {
          failWith: "GitHub is not authenticated. Run `gh auth login` (or set GH_TOKEN) and retry.",
        },
      });

      const errorMessage = yield* runStackedAction(manager, {
        cwd: repoDir,
        action: "commit_push_pr",
      }).pipe(
        Effect.flip,
        Effect.map((error) => error.message),
      );
      expect(errorMessage).toContain("gh auth login");
    }),
  );
});
