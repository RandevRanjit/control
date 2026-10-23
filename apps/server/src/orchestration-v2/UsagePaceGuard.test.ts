import { assert, it } from "@effect/vitest";
import {
  ProviderDriverKind,
  ProviderInstanceId,
  RunId,
  ThreadId,
  type ServerProvider,
} from "@control/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as TestClock from "effect/testing/TestClock";

import * as ProviderRegistry from "../provider/ProviderRegistry.ts";
import * as Scheduler from "../scheduling/Scheduler.ts";
import * as ServerSettings from "../serverSettings.ts";
import { threadShell as shell } from "./testkit/threadShell.ts";
import * as ThreadManagementService from "./ThreadManagementService.ts";
import * as UsagePaceGuard from "./UsagePaceGuard.ts";

const claude = ProviderInstanceId.make("claudeAgent");
const otherAccount = ProviderInstanceId.make("claudeWork");

function provider(instanceId: ProviderInstanceId, usedPercent: number, resetsAt: string) {
  return {
    instanceId,
    driver: ProviderDriverKind.make("claudeAgent"),
    enabled: true,
    installed: true,
    version: null,
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt: resetsAt,
    models: [],
    slashCommands: [],
    skills: [],
    usageLimits: {
      checkedAt: resetsAt,
      windows: [
        {
          id: "five_hour",
          kind: "session",
          label: "Session",
          windowDurationMins: 300,
          usedPercent,
          resetsAt,
        },
      ],
    },
  } satisfies ServerProvider;
}

it.effect("tells each working chat once per window when the five-hour window runs ahead", () =>
  Effect.gen(function* () {
    const now = yield* DateTime.now;
    // Two hours left of five by the first ahead tick: 60% of the window is gone.
    const resetsAt = DateTime.formatIso(DateTime.add(now, { minutes: 121 }));
    const usage = yield* Ref.make({ used: 40, resetsAt });
    const sent = yield* Ref.make<ReadonlyArray<ThreadManagementService.ThreadManagementSendInput>>(
      [],
    );
    const threads = [
      shell("thread:running", now, { status: "running", activeRunId: RunId.make("run:active") }),
      shell("thread:background", now, {
        pendingBackgroundTasks: [{ kind: "subagent", taskId: "task-1" }],
      }),
      shell("thread:idle", now),
      shell("thread:native-subagent", now, {
        status: "running",
        creationSource: "provider",
        lineage: {
          rootThreadId: ThreadId.make("thread:running"),
          parentThreadId: ThreadId.make("thread:running"),
          relationshipToParent: "subagent",
        },
      }),
      shell("thread:other-account", now, { status: "running", providerInstanceId: otherAccount }),
    ];
    const layerGuard = UsagePaceGuard.layer.pipe(
      Layer.provide(
        Layer.mergeAll(
          Layer.mock(ProviderRegistry.ProviderRegistry)({
            getProviders: Ref.get(usage).pipe(
              Effect.map(({ used, resetsAt }) => [
                provider(claude, used, resetsAt),
                provider(otherAccount, 10, resetsAt),
              ]),
            ),
          }),
          Layer.mock(ThreadManagementService.ThreadManagementService)({
            getShellSnapshot: () =>
              Effect.succeed({
                schemaVersion: 1,
                snapshotSequence: 0,
                threads,
                archivedThreads: [],
              }),
            sendToThread: (input) =>
              Ref.update(sent, (all) => [...all, input]).pipe(
                Effect.as({} as unknown as ThreadManagementService.ThreadManagementSendResult),
              ),
          }),
          ServerSettings.layerTest(),
        ),
      ),
      Layer.provide(Scheduler.layer),
    );
    yield* Effect.gen(function* () {
      const tick = TestClock.adjust("5 seconds");
      const sentTo = Ref.get(sent).pipe(
        Effect.map((all) => all.map((input) => [input.threadId, input.commandId] as const)),
      );

      yield* tick;
      assert.deepEqual(yield* sentTo, [], "under pace stays quiet");

      yield* Ref.update(usage, (current) => ({ ...current, used: 80 }));
      yield* tick;
      const first = yield* sentTo;
      assert.deepEqual(
        first.map(([threadId]) => threadId),
        ["thread:running", "thread:background"],
      );
      const notice = (yield* Ref.get(sent))[0]!;
      assert.equal(notice.mode, "auto");
      assert.include(notice.text, "80% used with 60% of the window gone, resets in 2h 0m");
      assert.include(notice.text, "Stop spawning subagents");
      assert.include(notice.text, "working by yourself in this single thread, carry on");

      yield* tick;
      assert.deepEqual(yield* sentTo, first, "one notice per chat per window");

      // Back on pace and ahead again in the same window: the same commands,
      // which the orchestrator's receipts turn into no new message.
      yield* Ref.update(usage, (current) => ({ ...current, used: 40 }));
      yield* tick;
      yield* Ref.update(usage, (current) => ({ ...current, used: 80 }));
      yield* tick;
      assert.deepEqual((yield* sentTo).slice(2), first);

      // Spent: nothing a notice could save.
      yield* Ref.set(sent, []);
      yield* Ref.set(usage, {
        used: 100,
        resetsAt: DateTime.formatIso(DateTime.add(now, { hours: 4 })),
      });
      yield* tick;
      assert.deepEqual(yield* sentTo, []);
    }).pipe(Effect.provide(layerGuard));
  }),
);

it.effect("tells no chat while the pace notice is switched off", () =>
  Effect.gen(function* () {
    const now = yield* DateTime.now;
    const resetsAt = DateTime.formatIso(DateTime.add(now, { minutes: 121 }));
    const sent = yield* Ref.make(0);
    const layerGuard = UsagePaceGuard.layer.pipe(
      Layer.provide(
        Layer.mergeAll(
          Layer.mock(ProviderRegistry.ProviderRegistry)({
            getProviders: Effect.succeed([provider(claude, 80, resetsAt)]),
          }),
          Layer.mock(ThreadManagementService.ThreadManagementService)({
            getShellSnapshot: () =>
              Effect.succeed({
                schemaVersion: 1,
                snapshotSequence: 0,
                threads: [
                  shell("thread:running", now, {
                    status: "running",
                    activeRunId: RunId.make("run:active"),
                  }),
                ],
                archivedThreads: [],
              }),
            sendToThread: () =>
              Ref.update(sent, (count) => count + 1).pipe(
                Effect.as({} as unknown as ThreadManagementService.ThreadManagementSendResult),
              ),
          }),
          ServerSettings.layerTest({ usagePaceNotice: false }),
        ),
      ),
      Layer.provide(Scheduler.layer),
    );
    yield* Effect.gen(function* () {
      yield* TestClock.adjust("5 seconds");
      assert.equal(yield* Ref.get(sent), 0);
    }).pipe(Effect.provide(layerGuard));
  }),
);
