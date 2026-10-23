import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { EventId, GroupId, type OrchestrationV2Command, ThreadId } from "@control/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";

import * as ServerConfig from "../config.ts";
import * as GroupStore from "../orchestration-v2/GroupStore.ts";
import * as ProjectionStore from "../orchestration-v2/ProjectionStore.ts";
import * as SqlitePersistence from "../persistence/Sqlite.ts";
import * as ClaudeLockHook from "./ClaudeLockHook.ts";
import * as ControlLock from "./ControlLock.ts";

const NOW = Date.parse("2026-10-11T14:00:00.000Z");
const at = (hours: number) => DateTime.formatIso(DateTime.makeUnsafe(NOW + hours * 60 * 60 * 1000));

const groupId = GroupId.make("group-armed");
const groupChat = ThreadId.make("thread-armed");
const siblingChat = ThreadId.make("thread-armed-sibling");
const looseChat = ThreadId.make("thread-loose");

/** A client command; only its type and target chat matter to the lock. */
const command = (type: string, threadId = looseChat) =>
  ({
    type,
    commandId: "command-1",
    threadId,
    parentThreadId: threadId,
  }) as never as OrchestrationV2Command;

// The chat's group comes from the projections; only that lookup is stubbed.
const projections = ProjectionStore.ProjectionStoreV2.of({
  getThreadShell: (threadId: ThreadId) =>
    Effect.succeed({
      groupId: threadId === groupChat || threadId === siblingChat ? groupId : null,
    } as never),
} as never);

const lockGroup = (lockedUntil: string) =>
  Effect.gen(function* () {
    const groups = yield* GroupStore.GroupStoreV2;
    const base = {
      eventId: EventId.make("event-group"),
      aggregateKind: "group",
      aggregateId: groupId,
      commandId: null,
      causationEventId: null,
      correlationId: null,
      metadata: {},
    } as const;
    yield* groups.apply({
      ...base,
      sequence: 1,
      occurredAt: at(0),
      type: "group.created",
      payload: {
        groupId,
        name: "ORBIT",
        tint: "rose",
        homeFolder: null,
        createdAt: at(0),
        updatedAt: at(0),
      },
    });
    yield* groups.apply({
      ...base,
      sequence: 2,
      occurredAt: at(0),
      type: "group.meta-updated",
      payload: { groupId, lockedUntil, updatedAt: at(0) },
    });
  });

/** Terminal claude's hook, recorded instead of written to the owner's settings. */
const terminalHook = (install: Effect.Effect<void, ClaudeLockHook.ClaudeLockHookError>) =>
  Layer.succeed(ClaudeLockHook.ClaudeLockHook, ClaudeLockHook.ClaudeLockHook.of({ install }));

/** Each test gets its own state folder; providing `ControlLock.layer` again is a restart. */
const withServer = <A, E, R>(effect: Effect.Effect<A, E, R>, hook = terminalHook(Effect.void)) =>
  Effect.gen(function* () {
    yield* TestClock.setTime(NOW);
    return yield* effect;
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        ServerConfig.layerTest(process.cwd(), { prefix: "control-lock-" }),
        GroupStore.layer.pipe(Layer.provideMerge(SqlitePersistence.layerMemory)),
        Layer.succeed(ProjectionStore.ProjectionStoreV2, projections),
        hook,
      ).pipe(Layer.provideMerge(NodeServices.layer)),
    ),
  );
const start = ControlLock.ControlLock.pipe(Effect.provide(ControlLock.layer));

it.effect("a lock ends in the future, within 12 hours, and only ever moves later", () =>
  withServer(
    Effect.gen(function* () {
      const lock = yield* start;
      assert.deepStrictEqual(yield* lock.get, { until: null });

      assert.deepStrictEqual(yield* lock.lock(at(2)), { until: at(2) });
      const reason = (until: string) =>
        lock.lock(until).pipe(
          Effect.flip,
          Effect.map((error) =>
            error._tag === "ControlLockRejectedError" ? error.reason : error._tag,
          ),
        );
      assert.strictEqual(yield* reason(at(-1)), "past");
      assert.strictEqual(yield* reason(at(12.5)), "too-long");
      assert.strictEqual(yield* reason(at(1)), "shorter");

      assert.deepStrictEqual(yield* lock.lock(at(3)), { until: at(3) });
      assert.deepStrictEqual(yield* lock.get, { until: at(3) });
    }),
  ),
);

it.effect(
  "the end time is saved, so a restart keeps the lock, and terminal claude's hook can read it",
  () =>
    withServer(
      Effect.gen(function* () {
        yield* (yield* start).lock(at(2));

        const { lockPath } = yield* ServerConfig.ServerConfig;
        const file = yield* (yield* FileSystem.FileSystem).readFileString(lockPath);
        assert.deepStrictEqual(JSON.parse(file), { until: at(2) });

        const restarted = yield* start;
        assert.deepStrictEqual(yield* restarted.get, { until: at(2) });
        assert.deepStrictEqual(
          Array.from(yield* Stream.runCollect(Stream.take(restarted.changes, 1))),
          [{ until: at(2) }],
        );
      }),
    ),
);

it.effect(
  "terminal claude's hook goes in before the lock is saved; without it, nothing locks",
  () =>
    Effect.gen(function* () {
      let installs = 0;
      yield* withServer(
        Effect.gen(function* () {
          yield* (yield* start).lock(at(2));
          assert.strictEqual(installs, 1);
        }),
        terminalHook(Effect.sync(() => void installs++)),
      );

      yield* withServer(
        Effect.gen(function* () {
          const lock = yield* start;
          const failed = yield* Effect.flip(lock.lock(at(2)));
          assert.strictEqual(failed._tag, "ClaudeLockHookError");
          assert.deepStrictEqual(yield* lock.get, { until: null });
          const { lockPath } = yield* ServerConfig.ServerConfig;
          assert.isFalse(yield* (yield* FileSystem.FileSystem).exists(lockPath));
        }),
        terminalHook(
          Effect.fail(new ClaudeLockHook.ClaudeLockHookError({ cause: "settings.json" })),
        ),
      );
    }),
);

it.effect("a full lock refuses the owner's sends in every chat and lets answers through", () =>
  withServer(
    Effect.gen(function* () {
      const lock = yield* start;
      yield* lock.checkCommand(command("message.dispatch"));
      yield* lock.lock(at(2));

      for (const type of [
        "message.dispatch",
        "queue.resume",
        "queued-message.promote-to-steer",
        "prepared-run.retry",
        "delegated_task.request",
      ]) {
        const refused = yield* Effect.flip(lock.checkCommand(command(type)));
        assert.strictEqual(refused._tag, "LockedSendError", type);
      }
      const refused = yield* Effect.flip(lock.checkCommand(command("message.dispatch")));
      assert.match(refused.message, /^Everything is locked until \d\d:\d\d\.$/);
      assert.strictEqual(
        (yield* Effect.flip(lock.checkLaunch({ initialMessage: { text: "hi" } })))._tag,
        "LockedSendError",
      );

      // Needs-you comes through: answering a request, dismissing a question, stopping a run.
      yield* lock.checkCommand(command("runtime-request.respond"));
      yield* lock.checkCommand(command("thread.user-input.dismiss"));
      yield* lock.checkCommand(command("run.interrupt"));
      yield* lock.checkLaunch({});
    }),
  ),
);

it.effect("a full lock ends at its time and nothing ends it sooner", () =>
  withServer(
    Effect.gen(function* () {
      const lock = yield* start;
      yield* lock.lock(at(2));
      yield* TestClock.adjust("119 minutes");
      assert.strictEqual(
        (yield* Effect.flip(lock.checkCommand(command("message.dispatch"))))._tag,
        "LockedSendError",
      );

      yield* TestClock.adjust("1 minute");
      assert.deepStrictEqual(yield* lock.get, { until: null });
      yield* lock.checkCommand(command("message.dispatch"));
      // Once over, a new lock may end at any time ahead.
      assert.deepStrictEqual(yield* lock.lock(at(2.5)), { until: at(2.5) });
    }),
  ),
);

it.effect("a group lock refuses sends into its own chats only", () =>
  withServer(
    Effect.gen(function* () {
      yield* lockGroup(at(1));
      const lock = yield* start;

      const refused = yield* Effect.flip(lock.checkCommand(command("message.dispatch", groupChat)));
      assert.strictEqual(refused._tag, "LockedSendError");
      assert.match(refused.message, /^ORBIT is locked until \d\d:\d\d\.$/);
      yield* lock.checkCommand(command("message.dispatch", looseChat));
      yield* lock.checkCommand(command("runtime-request.respond", groupChat));
      yield* lock.checkLaunch({ initialMessage: { text: "hi" } });
    }),
  ),
);

it.effect("an agent's send into a locked group is refused unless it comes from inside", () =>
  withServer(
    Effect.gen(function* () {
      const lock = yield* start;
      // A full lock never blocks agents.
      yield* lock.lock(at(2));
      yield* lock.checkAgentSend({ threadId: groupChat, senderThreadId: looseChat });

      yield* lockGroup(at(1));
      for (const senderThreadId of [looseChat, undefined]) {
        const refused = yield* Effect.flip(
          lock.checkAgentSend({ threadId: groupChat, senderThreadId }),
        );
        assert.strictEqual(refused._tag, "LockedSendError");
        assert.match(refused.message, /^ORBIT is locked until \d\d:\d\d\.$/);
      }
      // The group's own chats carry on messaging each other.
      yield* lock.checkAgentSend({ threadId: groupChat, senderThreadId: siblingChat });
      yield* lock.checkAgentSend({ threadId: looseChat, senderThreadId: groupChat });

      yield* TestClock.adjust("1 hour");
      yield* lock.checkAgentSend({ threadId: groupChat, senderThreadId: looseChat });
    }),
  ),
);

it.effect("an agent reads the full lock and each group lock still running", () =>
  withServer(
    Effect.gen(function* () {
      const lock = yield* start;
      assert.deepStrictEqual(yield* lock.read, { until: null, groups: [] });

      yield* lockGroup(at(1));
      yield* lock.lock(at(2));
      assert.deepStrictEqual(yield* lock.read, {
        until: at(2),
        groups: [{ groupId, name: "ORBIT", lockedUntil: at(1) }],
      });

      yield* TestClock.adjust("90 minutes");
      assert.deepStrictEqual(yield* lock.read, { until: at(2), groups: [] });
    }),
  ),
);
