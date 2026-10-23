import {
  formatGb,
  LOCAL_MODEL_ASK_BYTES,
  LocalModel,
  LocalModelError,
  LocalModelId,
  type LocalModelCandidate,
  type LocalModelRegisterInput,
  type LocalModelRuntime,
  type LocalModelScanInput,
  type LocalModelsSnapshot,
  type LocalModelUpdateInput,
  type LocalMemory,
} from "@control/contracts";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import { HttpClient, HttpClientRequest } from "effect/http";
import { ChildProcessSpawner } from "effect/process";

import { writeFileStringAtomically } from "../atomicWrite.ts";
import * as ServerConfig from "../config.ts";
import { type ContentPart, readCallContent } from "./files.ts";
import { estimateNeedBytes, LocalMemoryProbe, wakeVerdict } from "./memory.ts";
import {
  clearRecord,
  freePort,
  type ModelProcess,
  nativeDelay,
  readProcessIdentity,
  type RunningEntry,
  spawnModelProcess,
  stopProcessGroup,
  writeRecord,
} from "./processes.ts";
import { scanForModels } from "./scan.ts";

/** A wake that hasn't answered /health within this fails (§18.1). */
const WAKE_TIMEOUT = Duration.minutes(5);
/** How often a waking model's /health is asked, in native time (see `nativeDelay`). */
const HEALTH_POLL_MS = 250;

/** Asks the owner about a wake over 40 GB, in the calling chat; true when he approves. */
export type AskOwner = (ask: {
  readonly model: LocalModel;
  readonly needBytes: number;
  readonly freeAfterBytes: number;
}) => Effect.Effect<boolean, LocalModelError>;

export interface LocalModelRunInput {
  /** The model's id or name. */
  readonly model: string;
  readonly instruction: string;
  readonly files: ReadonlyArray<string>;
  readonly maxTokens?: number | undefined;
}

/** What a call returns. The files' contents never come back, only the model's answer. */
export interface LocalModelRunResult {
  readonly model: LocalModelId;
  readonly answer: string;
  readonly fileCount: number;
  readonly ms: number;
  /** The answer's length in tokens, when the server reports it. */
  readonly outTokens?: number | undefined;
}

const CompletionResponse = Schema.Struct({
  choices: Schema.Array(
    Schema.Struct({ message: Schema.Struct({ content: Schema.NullOr(Schema.String) }) }),
  ),
  usage: Schema.optional(Schema.Struct({ completion_tokens: Schema.Number })),
});
const ContextOverflow = Schema.Struct({
  error: Schema.Struct({
    type: Schema.Literal("exceed_context_size_error"),
    n_prompt_tokens: Schema.Number,
    n_ctx: Schema.Number,
  }),
});
const decodeCompletion = Schema.decodeUnknownOption(CompletionResponse);
const decodeOverflow = Schema.decodeUnknownOption(ContextOverflow);

export class LocalModels extends Context.Service<
  LocalModels,
  {
    /** Every model, what each is doing, and the memory. */
    readonly list: Effect.Effect<LocalModelsSnapshot>;
    /** The GGUFs Add offers: ~/models and the Hugging Face cache, or one file. */
    readonly scan: (
      input: LocalModelScanInput,
    ) => Effect.Effect<ReadonlyArray<LocalModelCandidate>, LocalModelError>;
    readonly register: (
      input: LocalModelRegisterInput,
    ) => Effect.Effect<LocalModel, LocalModelError>;
    /** Changes apply at the model's next wake. */
    readonly update: (input: LocalModelUpdateInput) => Effect.Effect<LocalModel, LocalModelError>;
    /** Puts the model to sleep first. */
    readonly remove: (id: LocalModelId) => Effect.Effect<void, LocalModelError>;
    /**
     * Wakes a model and returns once it's ready. Over 40 GB it needs `approved` (the owner's
     * in-place confirmation) or an `ask` that gets his Approve.
     */
    readonly wake: (
      model: string,
      options?: { readonly approved?: boolean; readonly ask?: AskOwner },
    ) => Effect.Effect<void, LocalModelError>;
    /** Sleeps one model, or every awake one. */
    readonly sleep: (model?: string) => Effect.Effect<void, LocalModelError>;
    /**
     * Wakes the model and keeps it awake, with no idle sleep, until `release`: a chat holds its
     * model while its Claude process lives. Over 40 GB it needs the `ask`'s Approve.
     */
    readonly hold: (
      model: string,
      options?: { readonly ask?: AskOwner },
    ) => Effect.Effect<
      { readonly port: number; readonly release: Effect.Effect<void> },
      LocalModelError
    >;
    /** Runs a call, waking the model first if it's asleep. */
    readonly run: (
      input: LocalModelRunInput,
      options?: { readonly ask?: AskOwner },
    ) => Effect.Effect<LocalModelRunResult, LocalModelError>;
    /** The snapshot now, then at each change, and every few seconds for the memory. */
    readonly subscribe: Stream.Stream<LocalModelsSnapshot>;
    /** The models offered in chats, now and whenever that list changes. */
    readonly chatModels: Stream.Stream<ReadonlyArray<LocalModel>>;
  }
>()("@control/server/localModels/LocalModels") {}

const Registry = Schema.fromJsonString(Schema.Struct({ models: Schema.Array(LocalModel) }));
const decodeRegistry = Schema.decodeUnknownEffect(Registry);
const encodeRegistry = Schema.encodeEffect(Registry);

/** One awake model: a process CONTROL started and recorded. */
interface Awake {
  readonly process: ModelProcess;
  readonly port: number;
  readonly needBytes: number;
  readonly ready: Deferred.Deferred<void, LocalModelError>;
  /** Resolves once the exit has been seen and the record updated. */
  readonly gone: Deferred.Deferred<void>;
  /** One call at a time. */
  readonly callLock: Semaphore.Semaphore;
  state: "waking" | "ready";
  since: string;
  sleepsAt?: string | undefined;
  footprintBytes?: number;
  /** Calls running or queued. */
  calls: number;
  stopping: boolean;
  loading?: Fiber.Fiber<void, never> | undefined;
  idle?: Fiber.Fiber<void, never> | undefined;
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "model";

const failWith = (message: string) => new LocalModelError({ message });

const make = Effect.gen(function* () {
  const config = yield* ServerConfig.ServerConfig;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const http = yield* HttpClient.HttpClient;
  const probe = yield* LocalMemoryProbe;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  // Background fibers (exit watchers, loads, idle timers) live in their own scope, closed only
  // after shutdown has put every model to sleep, so each exit is still seen and recorded.
  const serviceScope = yield* Scope.make();
  const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
      Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
    );

  const registryPath = path.join(config.localModelsDir, "models.json");
  const recordPath = path.join(config.localModelsDir, "running.json");
  yield* fs.makeDirectory(config.localModelLogsDir, { recursive: true }).pipe(Effect.ignore);

  // Every model is asleep after a start: what an earlier run left is killed, never adopted.
  yield* provide(clearRecord(recordPath)).pipe(
    Effect.catch((error) => Effect.logWarning("couldn't clear running.json", { error })),
  );

  let models: ReadonlyArray<LocalModel> = yield* fs.readFileString(registryPath).pipe(
    Effect.flatMap(decodeRegistry),
    Effect.map((file) => file.models),
    Effect.orElseSucceed((): ReadonlyArray<LocalModel> => []),
  );
  const awake = new Map<LocalModelId, Awake>();
  const lastExit = new Map<LocalModelId, NonNullable<LocalModelRuntime["lastExit"]>>();
  const estimates = new Map<LocalModelId, number>();
  let entries: ReadonlyArray<RunningEntry> = [];

  const registryLock = yield* Semaphore.make(1);
  const recordLock = yield* Semaphore.make(1);
  /** Deciding a wake and spawning it happen together, so two wakes never share the headroom. */
  const decideLock = yield* Semaphore.make(1);
  const transitionLocks = new Map<LocalModelId, Semaphore.Semaphore>();
  const transitions = (id: LocalModelId) => {
    let lock = transitionLocks.get(id);
    if (lock === undefined) {
      lock = Semaphore.makeUnsafe(1);
      transitionLocks.set(id, lock);
    }
    return lock;
  };

  const version = yield* SubscriptionRef.make(0);
  const changed = SubscriptionRef.update(version, (n) => n + 1);
  const nowIso = Effect.map(DateTime.now, DateTime.formatIso);

  const saveRegistry = (next: ReadonlyArray<LocalModel>) =>
    registryLock.withPermits(1)(
      encodeRegistry({ models: next }).pipe(
        Effect.flatMap((contents) =>
          provide(writeFileStringAtomically({ filePath: registryPath, contents: `${contents}\n` })),
        ),
        Effect.mapError(
          (cause) => new LocalModelError({ message: "Couldn't save models.json.", cause }),
        ),
        Effect.andThen(
          Effect.sync(() => {
            models = next;
          }),
        ),
        Effect.andThen(changed),
      ),
    );

  const saveEntries = (
    update: (current: ReadonlyArray<RunningEntry>) => ReadonlyArray<RunningEntry>,
  ) =>
    recordLock.withPermits(1)(
      Effect.gen(function* () {
        const next = update(entries);
        yield* provide(writeRecord(recordPath, next));
        entries = next;
      }),
    );

  const find = (model: string): Effect.Effect<LocalModel, LocalModelError> => {
    const wanted = model.trim().toLowerCase();
    const found =
      models.find((entry) => entry.id === model) ??
      models.find((entry) => entry.name.toLowerCase() === wanted);
    return found === undefined
      ? Effect.fail(failWith(`No local model is called ${model}.`))
      : Effect.succeed(found);
  };

  const fileSize = (file: string | undefined) =>
    file === undefined
      ? Effect.succeed(0)
      : fs.stat(file).pipe(
          Effect.map((info) => Number(info.size)),
          Effect.orElseSucceed(() => 0),
        );

  /** What a wake needs: the last measured footprint, else an estimate from the files. */
  const needOf = (model: LocalModel) =>
    Effect.gen(function* () {
      if (model.measuredBytes !== undefined) return model.measuredBytes;
      const known = estimates.get(model.id);
      if (known !== undefined) return known;
      const estimate = estimateNeedBytes({
        fileBytes: yield* fileSize(model.file),
        projectorBytes: yield* fileSize(model.projector),
        args: model.args,
      });
      estimates.set(model.id, estimate);
      return estimate;
    });

  const readMemory = probe.read.pipe(
    Effect.mapError(
      (cause) => new LocalModelError({ message: "Couldn't read the Mac's memory.", cause }),
    ),
  );

  const runtimeOf = (model: LocalModel): LocalModelRuntime => {
    const current = awake.get(model.id);
    const exit = lastExit.get(model.id);
    const needBytes = model.measuredBytes ?? estimates.get(model.id);
    const common = {
      modelId: model.id,
      ...(needBytes === undefined ? {} : { needBytes }),
      ...(exit === undefined ? {} : { lastExit: exit }),
    };
    if (current === undefined) {
      return { ...common, state: "asleep", since: exit?.at ?? "", calls: 0 };
    }
    return {
      ...common,
      state: current.state,
      pid: current.process.pid,
      port: current.port,
      since: current.since,
      calls: current.calls,
      ...(current.sleepsAt === undefined ? {} : { sleepsAt: current.sleepsAt }),
      ...(current.footprintBytes === undefined ? {} : { footprintBytes: current.footprintBytes }),
    };
  };

  const fallbackMemory: LocalMemory = {
    totalBytes: 0,
    availableBytes: 0,
    keepBytes: 0,
    swapUsedBytes: 0,
  };
  const list = Effect.gen(function* () {
    // Estimates fill in as the snapshot is drawn, so an unmeasured model shows its need.
    for (const model of models) yield* needOf(model);
    return {
      models,
      runtimes: models.map(runtimeOf),
      memory: yield* probe.read.pipe(Effect.orElseSucceed(() => fallbackMemory)),
    };
  });

  const completions = (port: number, body: unknown) =>
    http.execute(
      HttpClientRequest.post(`http://127.0.0.1:${port}/v1/chat/completions`).pipe(
        HttpClientRequest.bodyJsonUnsafe(body),
      ),
    );

  const healthy = (port: number): Effect.Effect<void> =>
    http.execute(HttpClientRequest.get(`http://127.0.0.1:${port}/health`)).pipe(
      Effect.map((response) => response.status === 200),
      Effect.orElseSucceed(() => false),
      Effect.flatMap((ok) =>
        ok
          ? Effect.void
          : Effect.andThen(
              nativeDelay(HEALTH_POLL_MS),
              Effect.suspend(() => healthy(port)),
            ),
      ),
    );

  /** Starts the idle timer of a ready model with no call running. */
  const armIdle = (model: LocalModel, entry: Awake) =>
    Effect.gen(function* () {
      if (entry.state !== "ready" || entry.calls > 0 || entry.stopping) return;
      const now = yield* DateTime.now;
      entry.sleepsAt = DateTime.formatIso(DateTime.add(now, { minutes: model.idleMinutes }));
      entry.idle = yield* Effect.sleep(Duration.minutes(model.idleMinutes)).pipe(
        // Cleared first, so the sleep below doesn't interrupt the fiber running it.
        Effect.andThen(Effect.sync(() => (entry.idle = undefined))),
        Effect.andThen(sleepOne(model.id)),
        Effect.ignore,
        Effect.forkIn(serviceScope),
      );
      yield* changed;
    });

  const holdIdle = (entry: Awake) =>
    Effect.gen(function* () {
      const idle = entry.idle;
      entry.idle = undefined;
      entry.sleepsAt = undefined;
      if (idle !== undefined) yield* Fiber.interrupt(idle);
    });

  /** The process has exited: the record loses its entry, and the model is asleep. */
  const onExit = (model: LocalModel, entry: Awake) =>
    Effect.gen(function* () {
      const exit = yield* entry.process.exited;
      if (awake.get(model.id) === entry) awake.delete(model.id);
      lastExit.set(model.id, { at: yield* nowIso, code: exit.code, signal: exit.signal });
      yield* holdIdle(entry);
      if (entry.loading !== undefined) yield* Fiber.interrupt(entry.loading);
      if (!entry.stopping) {
        yield* Effect.logWarning("local model exited", { modelId: model.id, ...exit });
        yield* Deferred.fail(
          entry.ready,
          failWith(
            `${model.name} exited while loading (${exit.signal ?? `code ${exit.code}`}); see its log.`,
          ),
        );
      }
      yield* saveEntries((current) =>
        current.filter((item) => item.pid !== entry.process.pid),
      ).pipe(Effect.catch((error) => Effect.logWarning("couldn't update running.json", { error })));
      yield* Deferred.succeed(entry.gone, undefined);
      yield* changed;
    });

  /** /health, then the system prompt once so the server caches it, then the footprint. */
  const load = (model: LocalModel, entry: Awake) =>
    Effect.gen(function* () {
      yield* healthy(entry.port).pipe(
        Effect.timeoutOption(WAKE_TIMEOUT),
        Effect.flatMap((done) =>
          Option.isSome(done)
            ? Effect.void
            : Effect.fail(failWith(`${model.name} didn't load within 5 minutes.`)),
        ),
      );
      const warm = yield* completions(entry.port, {
        messages: [
          { role: "system", content: model.systemPrompt },
          { role: "user", content: "." },
        ],
        max_tokens: 1,
      }).pipe(Effect.orElseSucceed(() => null));
      if (warm === null || warm.status !== 200) {
        return yield* Effect.fail(failWith(`${model.name} failed its warm-up.`));
      }
      const footprint = yield* probe.footprint(entry.process.pid);
      entry.state = "ready";
      entry.since = yield* nowIso;
      if (footprint !== null) {
        entry.footprintBytes = footprint;
        const current = models.find((item) => item.id === model.id);
        if (current !== undefined) {
          yield* saveRegistry(
            models.map((item) =>
              item.id === model.id ? { ...item, measuredBytes: footprint } : item,
            ),
          ).pipe(
            Effect.catch((error) => Effect.logWarning("couldn't save the footprint", { error })),
          );
        }
      }
      yield* armIdle(model, entry);
      yield* Deferred.succeed(entry.ready, undefined);
      yield* changed;
    }).pipe(
      Effect.catch((error: LocalModelError) =>
        Deferred.fail(entry.ready, error).pipe(
          // Forked: the sleep interrupts this loading fiber.
          Effect.andThen(sleepOne(model.id).pipe(Effect.ignore, Effect.forkIn(serviceScope))),
          Effect.asVoid,
        ),
      ),
    );

  /** Spawns and records the model (§18.2); the caller holds the decide lock. */
  const spawn = (model: LocalModel, needBytes: number) =>
    Effect.gen(function* () {
      const port = yield* freePort.pipe(
        Effect.mapError((cause) => new LocalModelError({ message: cause.message })),
      );
      const logPath = path.join(config.localModelLogsDir, `${model.id}.log`);
      const argv = [...model.args, "--host", "127.0.0.1", "--port", String(port)] as const;
      const process = yield* spawnModelProcess({ argv, logPath }).pipe(
        Effect.mapError((cause) => new LocalModelError({ message: cause.message, cause })),
      );
      const stop = stopProcessGroup(process.pid, Effect.asVoid(process.exited));
      const identity = yield* provide(readProcessIdentity(process.pid));
      const recorded =
        identity === null
          ? Effect.fail(failWith(`${model.name} exited as it started; see its log.`))
          : saveEntries((current) => [
              ...current,
              {
                modelId: model.id,
                pid: process.pid,
                startedAt: identity.startedAt,
                port,
                file: model.file,
                argv: [...argv],
              },
            ]).pipe(
              Effect.mapError(() =>
                failWith(`Couldn't record ${model.name}'s process, so it was stopped.`),
              ),
            );
      // A process never runs unrecorded: if the record can't be written, it's killed.
      yield* recorded.pipe(Effect.tapError(() => stop));
      const entry: Awake = {
        process,
        port,
        needBytes,
        ready: yield* Deferred.make<void, LocalModelError>(),
        gone: yield* Deferred.make<void>(),
        callLock: yield* Semaphore.make(1),
        state: "waking",
        since: yield* nowIso,
        calls: 0,
        stopping: false,
      };
      awake.set(model.id, entry);
      yield* onExit(model, entry).pipe(Effect.forkIn(serviceScope));
      entry.loading = yield* load(model, entry).pipe(Effect.forkIn(serviceScope));
      yield* changed;
      return entry;
    });

  /** Starts a wake, or joins the one under way. */
  const startWake = (model: LocalModel, approved: boolean, ask: AskOwner | undefined) =>
    transitions(model.id).withPermits(1)(
      Effect.gen(function* () {
        const needBytes = yield* needOf(model);
        let approvedNow = approved;
        while (true) {
          const outcome = yield* decideLock.withPermits(1)(
            Effect.gen(function* () {
              const current = awake.get(model.id);
              if (current !== undefined) return { _tag: "awake" as const, entry: current };
              const memory = yield* readMemory;
              // Models still loading haven't taken their memory yet: count it as taken.
              let loading = 0;
              for (const entry of awake.values())
                if (entry.state === "waking") loading += entry.needBytes;
              const verdict = wakeVerdict({
                memory: { ...memory, availableBytes: memory.availableBytes - loading },
                needBytes,
                approved: approvedNow,
              });
              if (verdict._tag !== "wake") return verdict;
              return { _tag: "awake" as const, entry: yield* spawn(model, needBytes) };
            }),
          );
          if (outcome._tag === "awake") return outcome.entry;
          if (outcome._tag === "refuse") return yield* Effect.fail(failWith(outcome.meta));
          if (ask === undefined) {
            return yield* Effect.fail(
              failWith(
                `asks first: over ${formatGb(LOCAL_MODEL_ASK_BYTES)} · needs ${formatGb(needBytes)}`,
              ),
            );
          }
          if (!(yield* ask({ model, needBytes, freeAfterBytes: outcome.freeAfterBytes }))) {
            return yield* Effect.fail(failWith(`The owner declined waking ${model.name}.`));
          }
          // The memory is read again after the answer, which may have taken a while.
          approvedNow = true;
        }
      }),
    );

  const wakeModel = (model: LocalModel, approved: boolean, ask: AskOwner | undefined) =>
    Effect.gen(function* () {
      const entry = yield* startWake(model, approved, ask);
      yield* Deferred.await(entry.ready);
      return entry;
    });

  const sleepOne = (id: LocalModelId) =>
    transitions(id).withPermits(1)(
      Effect.gen(function* () {
        const entry = awake.get(id);
        if (entry === undefined) return;
        entry.stopping = true;
        yield* holdIdle(entry);
        const model = models.find((item) => item.id === id);
        yield* Deferred.fail(entry.ready, failWith(`${model?.name ?? id} was put to sleep.`));
        if (entry.loading !== undefined) yield* Fiber.interrupt(entry.loading);
        yield* stopProcessGroup(entry.process.pid, Effect.asVoid(entry.process.exited));
        yield* Deferred.await(entry.gone);
      }),
    );

  const sleepAll = Effect.suspend(() =>
    Effect.forEach([...awake.keys()], sleepOne, { concurrency: "unbounded", discard: true }),
  );

  // Quitting puts every model to sleep (§18.2).
  yield* Effect.addFinalizer(() =>
    sleepAll.pipe(Effect.andThen(Scope.close(serviceScope, Exit.void))),
  );

  const run: LocalModels["Service"]["run"] = (input, options) =>
    Effect.gen(function* () {
      const startedAt = yield* Clock.currentTimeMillis;
      const model = yield* find(input.model);
      const { parts, fileCount } = yield* provide(
        readCallContent({
          instruction: input.instruction,
          files: input.files,
          readsImages: model.projector !== undefined,
        }),
      ).pipe(Effect.mapError((error) => failWith(error.message)));
      const entry = yield* wakeModel(model, false, options?.ask);
      entry.calls += 1;
      yield* holdIdle(entry);
      yield* changed;
      const { answer, outTokens } = yield* entry.callLock
        .withPermits(1)(complete(model, entry, parts, input.maxTokens))
        .pipe(
          Effect.ensuring(
            Effect.gen(function* () {
              entry.calls -= 1;
              yield* armIdle(model, entry);
              yield* changed;
            }),
          ),
        );
      return {
        model: model.id,
        answer,
        fileCount,
        ms: (yield* Clock.currentTimeMillis) - startedAt,
        outTokens,
      };
    });

  /** One call, streaming off. Errors name the model and numbers, never the request. */
  const complete = (
    model: LocalModel,
    entry: Awake,
    parts: ReadonlyArray<ContentPart>,
    maxTokens: number | undefined,
  ) =>
    Effect.gen(function* () {
      const response = yield* completions(entry.port, {
        messages: [
          { role: "system", content: model.systemPrompt },
          { role: "user", content: parts },
        ],
        stream: false,
        ...(maxTokens === undefined ? {} : { max_tokens: maxTokens }),
      }).pipe(Effect.mapError(() => failWith(`${model.name} didn't answer.`)));
      const body = yield* response.json.pipe(Effect.orElseSucceed(() => null));
      if (response.status !== 200) {
        const overflow = decodeOverflow(body);
        if (Option.isSome(overflow)) {
          const { n_prompt_tokens, n_ctx } = overflow.value.error;
          return yield* Effect.fail(
            failWith(`The files take ${n_prompt_tokens} tokens; ${model.name} holds ${n_ctx}.`),
          );
        }
        return yield* Effect.fail(
          failWith(`${model.name} failed the call (HTTP ${response.status}).`),
        );
      }
      const decoded = decodeCompletion(body);
      const answer = Option.isSome(decoded) ? decoded.value.choices[0]?.message.content : undefined;
      if (answer == null) return yield* Effect.fail(failWith(`${model.name} gave no answer.`));
      return { answer, outTokens: Option.getOrUndefined(decoded)?.usage?.completion_tokens };
    });

  const uniqueId = (name: string) => {
    const base = slug(name);
    let id = base;
    for (let n = 2; models.some((model) => model.id === id); n += 1) id = `${base}-${n}`;
    return LocalModelId.make(id);
  };

  return LocalModels.of({
    list,
    scan: (input) =>
      provide(scanForModels(input)).pipe(
        Effect.mapError(
          (cause) => new LocalModelError({ message: "Couldn't look for models.", cause }),
        ),
      ),
    register: (input) =>
      Effect.gen(function* () {
        const model: LocalModel = { ...input, id: uniqueId(input.name) };
        yield* saveRegistry([...models, model]);
        return model;
      }),
    update: (input) =>
      Effect.gen(function* () {
        const current = yield* find(input.id);
        const sameRun =
          current.file === input.file &&
          current.projector === input.projector &&
          current.args.join("\u0000") === input.args.join("\u0000");
        const next: LocalModel = {
          id: current.id,
          name: input.name,
          file: input.file,
          ...(input.projector === undefined ? {} : { projector: input.projector }),
          args: input.args,
          systemPrompt: input.systemPrompt,
          idleMinutes: input.idleMinutes,
          ...((input.chat ?? current.chat) === undefined
            ? {}
            : { chat: input.chat ?? current.chat }),
          // A different file or command makes the old measurement meaningless.
          ...(sameRun && current.measuredBytes !== undefined
            ? { measuredBytes: current.measuredBytes }
            : {}),
        };
        if (!sameRun) estimates.delete(current.id);
        yield* saveRegistry(models.map((model) => (model.id === current.id ? next : model)));
        return next;
      }),
    remove: (id) =>
      Effect.gen(function* () {
        const model = yield* find(id);
        yield* sleepOne(model.id);
        yield* saveRegistry(models.filter((item) => item.id !== model.id));
        estimates.delete(model.id);
        lastExit.delete(model.id);
      }),
    wake: (model, options) =>
      find(model).pipe(
        Effect.flatMap((found) => wakeModel(found, options?.approved === true, options?.ask)),
        Effect.asVoid,
      ),
    sleep: (model) =>
      model === undefined
        ? sleepAll
        : find(model).pipe(Effect.flatMap((found) => sleepOne(found.id))),
    hold: (model, options) =>
      Effect.gen(function* () {
        const found = yield* find(model);
        const entry = yield* wakeModel(found, false, options?.ask);
        entry.calls += 1;
        yield* holdIdle(entry);
        yield* changed;
        let released = false;
        const release = Effect.suspend(() => {
          if (released) return Effect.void;
          released = true;
          entry.calls -= 1;
          return armIdle(found, entry).pipe(Effect.andThen(changed));
        });
        return { port: entry.port, release };
      }),
    run,
    subscribe: Stream.merge(SubscriptionRef.changes(version), Stream.tick("5 seconds")).pipe(
      Stream.mapEffect(() => list),
    ),
    chatModels: SubscriptionRef.changes(version).pipe(
      Stream.map(() => models.filter((model) => model.chat === true)),
      Stream.changesWith((a, b) => JSON.stringify(a) === JSON.stringify(b)),
    ),
  });
});

export const layer = Layer.effect(LocalModels, make);
