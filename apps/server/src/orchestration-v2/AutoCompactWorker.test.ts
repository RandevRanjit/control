import { DEFAULT_SERVER_SETTINGS, ProviderInstanceId, RunId, ThreadId } from "@control/contracts";
import { assert, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as TestClock from "effect/testing/TestClock";

import * as Scheduler from "../scheduling/Scheduler.ts";
import * as ServerSettings from "../serverSettings.ts";
import * as AutoCompactWorker from "./AutoCompactWorker.ts";
import { AUTO_COMPACT_ID_PREFIX } from "./CommandPolicy.ts";
import * as ProjectionStore from "./ProjectionStore.ts";
import { threadShell } from "./testkit/threadShell.ts";
import * as ThreadManagementService from "./ThreadManagementService.ts";

it("dispatches /compact with ids fixed by the thread and its latest run", () => {
  const candidate = {
    threadId: ThreadId.make("thread:big"),
    latestRunId: RunId.make("run:7"),
    usedTokens: 300_000,
  };
  const command = AutoCompactWorker.autoCompactCommand(candidate);
  assert.deepEqual(command, {
    type: "message.dispatch",
    commandId: "auto-compact:thread:big:run:7",
    messageId: "auto-compact:thread:big:run:7",
    threadId: candidate.threadId,
    text: "/compact",
    attachments: [],
    dispatchMode: { type: "start_immediately" },
    createdBy: "user",
    creationSource: "server",
  } as never);
  assert.isTrue(
    command.type === "message.dispatch" && command.messageId.startsWith(AUTO_COMPACT_ID_PREFIX),
  );
  // A later sweep over the same idle spell repeats the same ids.
  assert.deepEqual(AutoCompactWorker.autoCompactCommand(candidate), command);
});

it.effect("holds an account's compaction while a chat on it waits for its usage limit", () =>
  Effect.gen(function* () {
    const now = yield* DateTime.now;
    const work = ProviderInstanceId.make("claudeWork");
    const resetAt = DateTime.formatIso(DateTime.add(now, { seconds: 30 }));
    const shells = [
      threadShell("thread:idle", now),
      threadShell("thread:idle-work", now, { providerInstanceId: work }),
      threadShell("thread:limited", now, {
        status: "failed",
        lastErrorClass: "usage_limit",
        usageLimitResetAt: resetAt,
      }),
    ];
    const compacted = yield* Ref.make<ReadonlyArray<string>>([]);
    const layerWorker = AutoCompactWorker.layer.pipe(
      Layer.provide(
        Layer.mergeAll(
          Layer.mock(ProjectionStore.ProjectionStoreV2)({
            getAutoCompactCandidates: () =>
              Effect.succeed(
                ["thread:idle", "thread:idle-work"].map((id) => ({
                  threadId: ThreadId.make(id),
                  latestRunId: RunId.make(`run:${id}`),
                  usedTokens: 300_000,
                })),
              ),
          }),
          Layer.mock(ThreadManagementService.ThreadManagementService)({
            getShellSnapshot: () =>
              Effect.succeed({
                schemaVersion: 1,
                snapshotSequence: 0,
                threads: shells,
                archivedThreads: [],
              }),
            dispatch: (command) =>
              Ref.update(compacted, (all) => [
                ...all,
                command.type === "message.dispatch" ? command.threadId : command.type,
              ]).pipe(Effect.as({ sequence: 1, storedEvents: [] })),
          }),
          Layer.mock(ServerSettings.ServerSettingsService)({
            getSettings: Effect.succeed(DEFAULT_SERVER_SETTINGS),
          }),
        ),
      ),
      Layer.provide(Scheduler.layer),
    );
    yield* Effect.gen(function* () {
      yield* TestClock.adjust("5 seconds");
      // Repeat sweeps repeat the command; its receipt keeps it to one compaction.
      assert.deepEqual([...new Set(yield* Ref.get(compacted))], ["thread:idle-work"]);
      yield* Ref.set(compacted, []);
      yield* TestClock.adjust("30 seconds");
      assert.include(yield* Ref.get(compacted), "thread:idle");
    }).pipe(Effect.provide(layerWorker));
  }),
);
