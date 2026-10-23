import {
  type ControlLock as ControlLockState,
  type ControlLockRead,
  type GroupId,
  IsoDateTime,
  isGroupLocked,
  MAX_LOCK_MS,
  type OrchestrationV2Command,
  type ThreadId,
} from "@control/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";

import { writeFileStringAtomically } from "../atomicWrite.ts";
import * as ServerConfig from "../config.ts";
import * as GroupStore from "../orchestration-v2/GroupStore.ts";
import * as ProjectionStore from "../orchestration-v2/ProjectionStore.ts";
import * as ClaudeLockHook from "./ClaudeLockHook.ts";

/** `lock.json` in the state folder. Terminal claude's UserPromptSubmit hook reads it too. */
const LockFileJson = Schema.fromJsonString(Schema.Struct({ until: IsoDateTime }));
const decodeLockFile = Schema.decodeUnknownEffect(LockFileJson);
const encodeLockFile = Schema.encodeEffect(LockFileJson);

export class ControlLockRejectedError extends Schema.TaggedError<ControlLockRejectedError>()(
  "ControlLockRejectedError",
  { reason: Schema.Literals(["past", "too-long", "shorter"]) },
) {
  override get message(): string {
    switch (this.reason) {
      case "past":
        return "A lock must end in the future.";
      case "too-long":
        return "A lock lasts at most 12 hours.";
      case "shorter":
        return "A lock can be extended but never shortened.";
    }
  }
}

export class ControlLockWriteError extends Schema.TaggedError<ControlLockWriteError>()(
  "ControlLockWriteError",
  { lockPath: Schema.String, cause: Schema.Defect() },
) {
  override get message(): string {
    return `Failed to save the lock at ${this.lockPath}.`;
  }
}

/** A send the lock refuses. `group` names the locked group; it is absent for the full lock. */
export class LockedSendError extends Schema.TaggedError<LockedSendError>()("LockedSendError", {
  until: IsoDateTime,
  group: Schema.optional(Schema.String),
}) {
  override get message(): string {
    const local = DateTime.toParts(
      DateTime.setZone(DateTime.makeUnsafe(this.until), DateTime.zoneMakeLocal()),
    );
    const at = [local.hour, local.minute].map((n) => String(n).padStart(2, "0")).join(":");
    return `${this.group ?? "Everything"} is locked until ${at}.`;
  }
}

export class LockCheckError extends Schema.TaggedError<LockCheckError>()("LockCheckError", {
  cause: Schema.Defect(),
}) {
  override get message(): string {
    return "Failed to check the chat's lock.";
  }
}

/**
 * The chat a client command sends into, when it starts or steers a turn; `undefined` when it
 * doesn't send. Answers to a pending request aren't sends, so needs-you comes through a lock.
 */
const sentInto = (command: OrchestrationV2Command): ThreadId | undefined => {
  switch (command.type) {
    case "message.dispatch":
    case "queue.resume":
    case "queued-message.promote-to-steer":
    case "prepared-run.retry":
      return command.threadId;
    case "delegated_task.request":
      return command.parentThreadId;
    default:
      return undefined;
  }
};

export class ControlLock extends Context.Service<
  ControlLock,
  {
    /** The full lock as it stands; `until` is null when none is running. */
    readonly get: Effect.Effect<ControlLockState>;
    /** Lock everything until `until`, or extend the running lock. Nothing ends one early. */
    readonly lock: (
      until: string,
    ) => Effect.Effect<
      ControlLockState,
      ControlLockRejectedError | ClaudeLockHook.ClaudeLockHookError | ControlLockWriteError
    >;
    /** The full lock now, then each change. */
    readonly changes: Stream.Stream<ControlLockState>;
    /** The full lock and each group lock still running: what agents read over MCP. */
    readonly read: Effect.Effect<ControlLockRead, LockCheckError>;
    /** Fails when a client command would send into a chat that a full or group lock covers. */
    readonly checkCommand: (
      command: OrchestrationV2Command,
    ) => Effect.Effect<void, LockedSendError | LockCheckError>;
    /** Fails when a client would start a new chat with a message during a full lock. */
    readonly checkLaunch: (input: {
      readonly initialMessage?: unknown;
    }) => Effect.Effect<void, LockedSendError>;
    /**
     * Fails when an agent's send would reach a chat in a locked group from outside it. A full
     * lock never blocks agents, and a locked group's own chats still message each other.
     */
    readonly checkAgentSend: (input: {
      readonly threadId: ThreadId;
      readonly senderThreadId?: ThreadId | undefined;
    }) => Effect.Effect<void, LockedSendError | LockCheckError>;
  }
>()("@control/server/lock/ControlLock") {}

const make = Effect.gen(function* () {
  const { lockPath } = yield* ServerConfig.ServerConfig;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const projections = yield* ProjectionStore.ProjectionStoreV2;
  const groups = yield* GroupStore.GroupStoreV2;
  const terminalHook = yield* ClaudeLockHook.ClaudeLockHook;
  const writes = yield* Semaphore.make(1);

  // A missing or unreadable file is no lock: the lock has no tamper guard (plan, 9 Oct).
  const stored = yield* fileSystem.readFileString(lockPath).pipe(
    Effect.flatMap(decodeLockFile),
    Effect.map((file) => file.until),
    Effect.orElseSucceed(() => null),
  );
  const until = yield* SubscriptionRef.make<string | null>(stored);

  const current = (value: string | null, nowMs: number): ControlLockState => ({
    until: value !== null && Date.parse(value) > nowMs ? value : null,
  });
  const nowMs = Effect.map(DateTime.now, DateTime.toEpochMillis);

  const get = Effect.gen(function* () {
    return current(yield* SubscriptionRef.get(until), yield* nowMs);
  });

  const lock: ControlLock["Service"]["lock"] = (next) =>
    writes.withPermits(1)(
      Effect.gen(function* () {
        const now = yield* nowMs;
        const nextMs = Date.parse(next);
        const running = current(yield* SubscriptionRef.get(until), now).until;
        if (!Number.isFinite(nextMs) || nextMs <= now) {
          return yield* new ControlLockRejectedError({ reason: "past" });
        }
        if (nextMs - now > MAX_LOCK_MS)
          return yield* new ControlLockRejectedError({ reason: "too-long" });
        if (running !== null && Date.parse(running) > nextMs) {
          return yield* new ControlLockRejectedError({ reason: "shorter" });
        }
        const value = DateTime.formatIso(DateTime.makeUnsafe(nextMs));
        // Terminal claude's hook goes in first, so a saved lock always covers it.
        yield* terminalHook.install;
        // Save first, so a lock the file doesn't hold is never in force.
        yield* encodeLockFile({ until: value }).pipe(
          Effect.flatMap((contents) =>
            writeFileStringAtomically({ filePath: lockPath, contents: `${contents}\n` }),
          ),
          Effect.provideService(FileSystem.FileSystem, fileSystem),
          Effect.provideService(Path.Path, path),
          Effect.mapError((cause) => new ControlLockWriteError({ lockPath, cause })),
        );
        yield* SubscriptionRef.set(until, value);
        return { until: value };
      }),
    );

  /** The full lock's refusal, when one is running. */
  const refuseAll = Effect.gen(function* () {
    const running = (yield* get).until;
    if (running !== null) return yield* new LockedSendError({ until: running });
  });
  const checkFailed = (cause: unknown) => new LockCheckError({ cause });

  const groupOf = (threadId: ThreadId) =>
    projections.getThreadShell(threadId).pipe(
      Effect.map((shell) => shell?.groupId ?? null),
      Effect.mapError(checkFailed),
    );

  /** The chat's group's refusal, when that group is locked. */
  const refuseLockedGroup = (groupId: GroupId | null) =>
    Effect.gen(function* () {
      if (groupId === null) return;
      const group = Option.getOrUndefined(
        yield* groups.get(groupId).pipe(Effect.mapError(checkFailed)),
      );
      if (group?.lockedUntil == null || !isGroupLocked(group, yield* nowMs)) return;
      return yield* new LockedSendError({ until: group.lockedUntil, group: group.name });
    });

  const checkCommand: ControlLock["Service"]["checkCommand"] = (command) =>
    Effect.gen(function* () {
      const threadId = sentInto(command);
      if (threadId === undefined) return;
      yield* refuseAll;
      yield* refuseLockedGroup(yield* groupOf(threadId));
    });

  const checkAgentSend: ControlLock["Service"]["checkAgentSend"] = (input) =>
    Effect.gen(function* () {
      const groupId = yield* groupOf(input.threadId);
      if (groupId === null) return;
      if (input.senderThreadId !== undefined && (yield* groupOf(input.senderThreadId)) === groupId)
        return;
      yield* refuseLockedGroup(groupId);
    });

  const checkLaunch: ControlLock["Service"]["checkLaunch"] = (input) =>
    input.initialMessage === undefined ? Effect.void : refuseAll;

  const read = Effect.gen(function* () {
    const now = yield* nowMs;
    const all = yield* groups.listGroups().pipe(Effect.mapError(checkFailed));
    return {
      until: current(yield* SubscriptionRef.get(until), now).until,
      groups: all.flatMap((group) =>
        group.lockedUntil !== null && isGroupLocked(group, now)
          ? [{ groupId: group.id, name: group.name, lockedUntil: group.lockedUntil }]
          : [],
      ),
    };
  });

  return ControlLock.of({
    get,
    lock,
    changes: SubscriptionRef.changes(until).pipe(
      Stream.mapEffect((value) => Effect.map(nowMs, (now) => current(value, now))),
    ),
    read,
    checkCommand,
    checkLaunch,
    checkAgentSend,
  });
});

export const layer = Layer.effect(ControlLock, make);
