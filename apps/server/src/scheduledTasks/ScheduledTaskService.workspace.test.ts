import * as Scheduler from "../scheduling/Scheduler.ts";
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { expect, it } from "@effect/vitest";
import { ProjectId, ScheduledTaskUpsertInput } from "@control/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";

import * as GitWorkflowService from "../git/GitWorkflowService.ts";
import * as ThreadLaunchService from "../orchestration-v2/ThreadLaunchService.ts";
import * as ThreadManagementService from "../orchestration-v2/ThreadManagementService.ts";
import * as ProjectService from "../project/ProjectService.ts";
import * as SecretRequests from "../secrets/SecretRequests.ts";
import * as SqlitePersistence from "../persistence/Sqlite.ts";
import * as ScheduledTaskService from "./ScheduledTaskService.ts";

const decodeUpsertInput = Schema.decodeUnknownEffect(ScheduledTaskUpsertInput);
const projectId = ProjectId.make("project-scheduled-workspace");
const folder = "/Users/owner/.control/scratch";

/** Runs an unbound task stored with MCP's default (a fresh worktree) and returns what it launched with. */
const launchedStrategy = (isRepository: boolean) =>
  Effect.gen(function* () {
    const launched = yield* Ref.make<
      ThreadLaunchService.ThreadLaunchInput["workspaceStrategy"] | null
    >(null);
    const layerDependencies = Layer.mergeAll(
      NodeCrypto.layer,
      Scheduler.layer,
      Layer.mock(ThreadLaunchService.ThreadLaunchService)({
        launch: (input) =>
          Ref.set(launched, input.workspaceStrategy).pipe(
            Effect.andThen(Effect.die(new Error("launch recorded"))),
          ),
      }),
      Layer.mock(ThreadManagementService.ThreadManagementService)({}),
      Layer.mock(SecretRequests.SecretRequests)({}),
      Layer.mock(ProjectService.ProjectService)({
        getById: (id) =>
          Effect.succeedSome({
            id,
            title: "Scratch",
            workspaceRoot: folder,
            defaultModelSelection: null,
            scripts: [],
            createdAt: "2026-10-25T00:00:00.000Z",
            updatedAt: "2026-10-25T00:00:00.000Z",
            deletedAt: null,
          }),
      }),
      Layer.mock(GitWorkflowService.GitWorkflowService)({
        isRepository: (cwd) => Effect.succeed(cwd === folder && isRepository),
      }),
    );
    yield* Effect.gen(function* () {
      const service = yield* ScheduledTaskService.ScheduledTaskService;
      const created = yield* service.upsert(
        yield* decodeUpsertInput({
          title: "Weekly housekeeping",
          prompt: "Tidy the memory files.",
          enabled: true,
          schedule: { type: "interval", everyMs: 604_800_000 },
          projectId,
          workspaceStrategy: { type: "worktree", baseRef: "main", startFromOrigin: true },
          modelSelection: { instanceId: "claudeAgent", model: "claude-opus-5-5" },
          runtimeMode: "full-access",
          interactionMode: "default",
          creationSource: "mcp",
        }),
      );
      yield* service.runNow({ id: created.task.id });
    }).pipe(Effect.provide(ScheduledTaskService.layer.pipe(Layer.provide(layerDependencies))));
    return yield* Ref.get(launched);
  }).pipe(Effect.provide(SqlitePersistence.layerMemory));

it.effect("starts a run at the project root when the project is not a git repository", () =>
  Effect.gen(function* () {
    // A worktree needs a repository; at the root, Scratch gives each run a folder of its own.
    expect(yield* launchedStrategy(false)).toEqual({ type: "root" });
  }),
);

it.effect("keeps the stored worktree strategy in a git repository", () =>
  Effect.gen(function* () {
    expect(yield* launchedStrategy(true)).toEqual({
      type: "worktree",
      baseRef: "main",
      startFromOrigin: true,
    });
  }),
);
