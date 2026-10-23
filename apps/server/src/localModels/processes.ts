// @effect-diagnostics nodeBuiltinImport:off - a log file reaches the child only as a descriptor.
// @effect-diagnostics globalTimersInEffect:off - process checks wait in native time (see nativeDelay).
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeNet from "node:net";
import { LocalModelId, PortSchema, PositiveInt } from "@control/contracts";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { writeFileStringAtomically } from "../atomicWrite.ts";
import { signalProcessGroup } from "../process/processGroup.ts";

/**
 * The record of every model process CONTROL started (design/hybrid/HANDOFF.md §18.2):
 * `userdata/local-models/running.json`. An entry goes in straight after the spawn and comes
 * out only once the exit is seen, so after a crash the next start knows what to kill.
 */
export const RunningEntry = Schema.Struct({
  modelId: LocalModelId,
  pid: PositiveInt,
  /** `ps -o lstart=` at the spawn: a reused PID has a different one. */
  startedAt: Schema.String,
  port: PortSchema,
  file: Schema.String,
  argv: Schema.Array(Schema.String),
});
export type RunningEntry = typeof RunningEntry.Type;

const RunningFile = Schema.fromJsonString(Schema.Struct({ entries: Schema.Array(RunningEntry) }));
const decodeRunningFile = Schema.decodeUnknownEffect(RunningFile);
const encodeRunningFile = Schema.encodeEffect(RunningFile);

export class LocalModelProcessError extends Schema.TaggedError<LocalModelProcessError>()(
  "LocalModelProcessError",
  { message: Schema.String, cause: Schema.optional(Schema.Defect()) },
) {}

/** The record's entries; a missing or unreadable file holds none. */
export const readRecord = (recordPath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* fs.readFileString(recordPath).pipe(
      Effect.flatMap(decodeRunningFile),
      Effect.map((file) => file.entries),
      Effect.orElseSucceed((): ReadonlyArray<RunningEntry> => []),
    );
  });

export const writeRecord = (recordPath: string, entries: ReadonlyArray<RunningEntry>) =>
  encodeRunningFile({ entries }).pipe(
    Effect.flatMap((contents) =>
      writeFileStringAtomically({ filePath: recordPath, contents: `${contents}\n` }),
    ),
    Effect.mapError(
      (cause) => new LocalModelProcessError({ message: "Couldn't save running.json.", cause }),
    ),
  );

/** A loopback port nothing is listening on, for the model to serve on. */
export const freePort = Effect.callback<number, LocalModelProcessError>((resume) => {
  const server = NodeNet.createServer();
  server.once("error", (cause) =>
    resume(Effect.fail(new LocalModelProcessError({ message: "No free port.", cause }))),
  );
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    server.close(() =>
      typeof address === "object" && address !== null
        ? resume(Effect.succeed(address.port))
        : resume(Effect.fail(new LocalModelProcessError({ message: "No free port." }))),
    );
  });
});

export interface ProcessExit {
  readonly code: number | null;
  readonly signal: string | null;
}

export interface ModelProcess {
  readonly pid: number;
  /** Resolves when the process exits. */
  readonly exited: Effect.Effect<ProcessExit>;
}

/**
 * Starts the command detached, as the leader of its own process group, with its output
 * appended to `logPath`. Node is used directly because a log file can only be handed to the
 * child as a file descriptor.
 */
export const spawnModelProcess = (input: {
  readonly argv: readonly [string, ...Array<string>];
  readonly logPath: string;
}) =>
  Effect.callback<ModelProcess, LocalModelProcessError>((resume) => {
    let log: number;
    try {
      log = NodeFS.openSync(input.logPath, "a");
    } catch (cause) {
      resume(Effect.fail(new LocalModelProcessError({ message: "Couldn't open the log.", cause })));
      return;
    }
    const [command, ...args] = input.argv;
    const child = NodeChildProcess.spawn(command, args, {
      detached: true,
      stdio: ["ignore", log, log],
    });
    NodeFS.closeSync(log);
    const exit = new Promise<ProcessExit>((resolve) =>
      child.once("exit", (code, signal) => resolve({ code, signal })),
    );
    child.once("error", (cause) =>
      resume(
        Effect.fail(new LocalModelProcessError({ message: `Couldn't start ${command}.`, cause })),
      ),
    );
    child.once("spawn", () =>
      resume(Effect.succeed({ pid: child.pid!, exited: Effect.promise(() => exit) })),
    );
  });

/**
 * A pause between checks on a real process, in native time: a test's clock drives the rules'
 * durations (the 10 s grace, the idle sleep), never how often the OS is asked.
 */
export const nativeDelay = (ms: number) =>
  Effect.callback<void>((resume) => {
    const timer = setTimeout(() => resume(Effect.void), ms);
    return Effect.sync(() => clearTimeout(timer));
  });

const isAlive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
};

/** Resolves once no process holds the PID. */
export const pidGone = (pid: number): Effect.Effect<void> =>
  Effect.suspend(() =>
    isAlive(pid) ? Effect.andThen(nativeDelay(100), pidGone(pid)) : Effect.void,
  );

/** How long a model gets to exit after SIGTERM before SIGKILL (§18.2). */
const SLEEP_GRACE = Duration.seconds(10);

const signalGroup = (pid: number, signal: NodeJS.Signals) =>
  Effect.sync(() => {
    try {
      signalProcessGroup(pid, signal);
    } catch {
      // ESRCH: the group has already gone.
    }
  });

/** SIGTERM to the group, up to 10 s for `gone`, then SIGKILL; returns once `gone` resolves. */
export const stopProcessGroup = (pid: number, gone: Effect.Effect<void>) =>
  Effect.gen(function* () {
    yield* signalGroup(pid, "SIGTERM");
    const exited = yield* gone.pipe(Effect.timeoutOption(SLEEP_GRACE));
    if (Option.isSome(exited)) return;
    yield* signalGroup(pid, "SIGKILL");
    yield* gone;
  });

const ps = (pid: number, column: "lstart" | "command") =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const output = yield* spawner
      .string(
        ChildProcess.make("/bin/ps", ["-ww", "-o", `${column}=`, "-p", String(pid)], {
          stdin: "ignore",
          stderr: "ignore",
        }),
      )
      .pipe(Effect.timeout("5 seconds"));
    return output.trim();
  }).pipe(Effect.orElseSucceed(() => ""));

/** The process's start time and command line, or null when the PID is free. */
export const readProcessIdentity = (pid: number) =>
  Effect.gen(function* () {
    const startedAt = yield* ps(pid, "lstart");
    if (startedAt === "") return null;
    return { startedAt, command: yield* ps(pid, "command") };
  });

/**
 * At server start, ends what the record says a previous run left (§18.2): restart kills, it
 * never adopts. A process is killed only if its PID is alive, its start time matches and its
 * command line still holds the recorded file and port; otherwise the PID now belongs to
 * something else, and only the entry goes.
 */
export const clearRecord = (recordPath: string) =>
  Effect.gen(function* () {
    for (const entry of yield* readRecord(recordPath)) {
      const identity = yield* readProcessIdentity(entry.pid);
      if (
        identity !== null &&
        identity.startedAt === entry.startedAt &&
        identity.command.includes(entry.file) &&
        identity.command.includes(`--port ${entry.port}`)
      ) {
        yield* Effect.logInfo("local model left running by an earlier start; ending it", {
          modelId: entry.modelId,
          pid: entry.pid,
        });
        yield* stopProcessGroup(entry.pid, pidGone(entry.pid));
      }
    }
    yield* writeRecord(recordPath, []);
  });
