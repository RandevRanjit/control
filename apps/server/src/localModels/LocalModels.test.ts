import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import {
  GB,
  LOCAL_MODEL_KEEP_BYTES,
  type LocalMemory,
  type LocalModelRuntime,
} from "@control/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";
import { FetchHttpClient } from "effect/http";

import * as ServerConfig from "../config.ts";
import * as LocalModels from "./LocalModels.ts";
import { LocalMemoryProbe } from "./memory.ts";
import {
  pidGone,
  readProcessIdentity,
  readRecord,
  spawnModelProcess,
  stopProcessGroup,
  writeRecord,
} from "./processes.ts";

// The "model" is a script serving /health and /v1/chat/completions: no test loads a real one.
const FAKE_MODEL = new URL("./testFixtures/fakeModel.mjs", import.meta.url).pathname;

const roomy: LocalMemory = {
  totalBytes: 128 * GB,
  availableBytes: 100 * GB,
  keepBytes: LOCAL_MODEL_KEEP_BYTES,
  swapUsedBytes: 0,
};

/**
 * Each test gets its own state folder and fixed memory. The service lives until the test ends,
 * when its shutdown sleeps every model; building it again is a restart.
 */
const withServer = <A, E, R>(effect: Effect.Effect<A, E, R>, memory = Ref.makeUnsafe(roomy)) =>
  effect.pipe(
    Effect.scoped,
    Effect.provide(
      Layer.mergeAll(
        ServerConfig.layerTest(process.cwd(), { prefix: "control-local-models-" }),
        FetchHttpClient.layer,
        Layer.succeed(
          LocalMemoryProbe,
          LocalMemoryProbe.of({ read: Ref.get(memory), footprint: () => Effect.succeed(33 * GB) }),
        ),
      ).pipe(Layer.provideMerge(NodeServices.layer)),
    ),
  );
const start = Layer.build(LocalModels.layer).pipe(
  Effect.map((context) => Context.get(context, LocalModels.LocalModels)),
);

const paths = Effect.gen(function* () {
  const { localModelsDir, baseDir } = yield* ServerConfig.ServerConfig;
  const path = yield* Path.Path;
  return {
    record: path.join(localModelsDir, "running.json"),
    file: path.join(baseDir, "fake.gguf"),
    scratch: baseDir,
  };
});

const register = (
  models: LocalModels.LocalModels["Service"],
  flags: ReadonlyArray<string> = [],
  name = "Fake 7B",
) =>
  Effect.gen(function* () {
    const { file } = yield* paths;
    yield* (yield* FileSystem.FileSystem).writeFileString(file, "");
    return yield* models.register({
      name,
      file,
      args: [process.execPath, FAKE_MODEL, "-m", file, ...flags],
      systemPrompt: "Answer only what you're asked.",
      idleMinutes: 10,
    });
  });

const runtimeOf = (models: LocalModels.LocalModels["Service"], id: string) =>
  Effect.map(models.list, (snapshot) => snapshot.runtimes.find((item) => item.modelId === id)!);

/** Waits for the model's runtime to match, on the service's own change stream. */
const until = (
  models: LocalModels.LocalModels["Service"],
  id: string,
  matches: (runtime: LocalModelRuntime) => boolean,
) =>
  models.subscribe.pipe(
    Stream.map((snapshot) => snapshot.runtimes.find((item) => item.modelId === id)!),
    Stream.filter(matches),
    Stream.runHead,
    Effect.map(Option.getOrThrow),
  );

it.effect("a wake records the process, and a sleep ends it and clears the record", () =>
  withServer(
    Effect.gen(function* () {
      const models = yield* start;
      const model = yield* register(models);
      assert.strictEqual(model.id, "fake-7b");

      yield* models.wake("Fake 7B");
      const ready = yield* runtimeOf(models, model.id);
      assert.strictEqual(ready.state, "ready");
      assert.strictEqual(ready.footprintBytes, 33 * GB);
      const pid = ready.pid!;
      const [entry] = yield* readRecord((yield* paths).record);
      assert.strictEqual(entry?.pid, pid);
      assert.strictEqual(entry?.port, ready.port);
      assert.strictEqual(entry?.startedAt, (yield* readProcessIdentity(pid))?.startedAt);
      // The footprint measured at the wake sizes the next one.
      assert.strictEqual((yield* models.list).models[0]?.measuredBytes, 33 * GB);

      yield* models.sleep(model.id);
      assert.strictEqual((yield* runtimeOf(models, model.id)).state, "asleep");
      assert.isNull(yield* readProcessIdentity(pid));
      assert.deepStrictEqual(yield* readRecord((yield* paths).record), []);
    }),
  ),
);

it.effect("a crash leaves the model asleep with its exit, and the record without it", () =>
  withServer(
    Effect.gen(function* () {
      const models = yield* start;
      const model = yield* register(models);
      yield* models.wake(model.id);
      const pid = (yield* runtimeOf(models, model.id)).pid!;

      process.kill(pid, "SIGKILL");
      const asleep = yield* until(models, model.id, (runtime) => runtime.state === "asleep");
      assert.strictEqual(asleep.lastExit?.signal, "SIGKILL");
      assert.deepStrictEqual(yield* readRecord((yield* paths).record), []);
    }),
  ),
);

it.effect("a model that ignores SIGTERM gets SIGKILL after 10 seconds", () =>
  withServer(
    Effect.gen(function* () {
      const models = yield* start;
      const model = yield* register(models, ["--fake-ignore-sigterm"]);
      yield* models.wake(model.id);
      const pid = (yield* runtimeOf(models, model.id)).pid!;

      const stopping = yield* stopProcessGroup(pid, pidGone(pid)).pipe(Effect.forkChild);
      yield* Effect.yieldNow;
      assert.isNotNull(yield* readProcessIdentity(pid), "SIGTERM alone doesn't end it");
      yield* TestClock.adjust("10 seconds");
      yield* Fiber.join(stopping);

      const asleep = yield* until(models, model.id, (runtime) => runtime.state === "asleep");
      assert.strictEqual(asleep.lastExit?.signal, "SIGKILL");
    }),
  ),
);

it.effect("a ready model sleeps after its idle minutes, counted from the last call", () =>
  withServer(
    Effect.gen(function* () {
      const models = yield* start;
      const model = yield* register(models);
      yield* models.wake(model.id);
      const pid = (yield* runtimeOf(models, model.id)).pid;

      // Each call restarts the 10 minutes, so the first process is still the one answering.
      const call = models.run({ model: model.id, instruction: "Say hi.", files: [] });
      yield* TestClock.adjust("9 minutes");
      yield* call;
      yield* TestClock.adjust("9 minutes");
      yield* call;
      assert.strictEqual((yield* runtimeOf(models, model.id)).pid, pid);

      yield* TestClock.adjust("10 minutes");
      yield* until(models, model.id, (runtime) => runtime.state === "asleep");
      assert.deepStrictEqual(yield* readRecord((yield* paths).record), []);
    }),
  ),
);

it.effect("a chat holds its model awake past its idle minutes, and the release starts them", () =>
  withServer(
    Effect.gen(function* () {
      const models = yield* start;
      const model = yield* register(models);
      const held = yield* models.hold(model.id);
      const ready = yield* runtimeOf(models, model.id);
      assert.strictEqual(ready.state, "ready");
      assert.strictEqual(held.port, ready.port);
      assert.isUndefined(ready.sleepsAt);

      // Still the first process answering after 30 minutes.
      yield* TestClock.adjust("30 minutes");
      yield* models.run({ model: model.id, instruction: "Say hi.", files: [] });
      assert.strictEqual((yield* runtimeOf(models, model.id)).pid, ready.pid);

      // A second release changes nothing: the hold counted once.
      yield* held.release;
      yield* held.release;
      assert.strictEqual((yield* runtimeOf(models, model.id)).calls, 0);
      yield* TestClock.adjust("10 minutes");
      yield* until(models, model.id, (runtime) => runtime.state === "asleep");
    }),
  ),
);

it.effect(
  "only models offered in chats reach the picker, and an edit without the flag keeps it",
  () =>
    withServer(
      Effect.gen(function* () {
        const models = yield* start;
        yield* register(models);
        const model = yield* register(models, [], "Chat 27B");
        const offered = models.chatModels.pipe(Stream.runHead, Effect.map(Option.getOrThrow));
        assert.deepStrictEqual(yield* offered, []);

        const { measuredBytes: _measured, chat: _chat, ...edit } = model;
        yield* models.update({ ...edit, chat: true });
        assert.deepStrictEqual(
          (yield* offered).map((item) => item.id),
          ["chat-27b"],
        );

        // An older client's edit has no flag: the model stays offered.
        yield* models.update({ ...edit, idleMinutes: 20 });
        assert.deepStrictEqual(
          (yield* offered).map((item) => [item.id, item.idleMinutes]),
          [["chat-27b", 20]],
        );
      }),
    ),
);

it.effect(
  "a call sends the system prompt and each file under its path, and returns the answer",
  () =>
    withServer(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const { scratch } = yield* paths;
        const requests = path.join(scratch, "requests.ndjson");
        const inbox = path.join(scratch, "inbox");
        yield* fs.makeDirectory(path.join(inbox, "nested"), { recursive: true });
        yield* fs.writeFileString(path.join(inbox, "a.txt"), "Alice wrote to Bob.");
        yield* fs.writeFileString(path.join(inbox, ".DS_Store"), "hidden");
        yield* fs.writeFileString(path.join(inbox, "nested", "deep.txt"), "not read");
        const note = path.join(scratch, "note.md");
        yield* fs.writeFileString(note, "Call Carol on 0612345678.");

        const models = yield* start;
        const model = yield* register(models, ["--fake-log-requests", requests]);
        // Asleep: the call wakes it first.
        const result = yield* models.run({
          model: model.name,
          instruction: "Remove the names.",
          files: [inbox, note],
          maxTokens: 200,
        });
        assert.strictEqual(result.answer, "read 2 messages");
        assert.strictEqual(result.outTokens, 3);
        assert.strictEqual(result.fileCount, 2);
        assert.notInclude(JSON.stringify(result), "Alice");

        const sent = (yield* fs.readFileString(requests))
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line));
        // The warm-up, then the call.
        assert.strictEqual(sent.length, 2);
        assert.deepStrictEqual(sent[0].messages[0], {
          role: "system",
          content: "Answer only what you're asked.",
        });
        assert.strictEqual(sent[0].max_tokens, 1);
        assert.strictEqual(sent[1].max_tokens, 200);
        assert.deepStrictEqual(sent[1].messages[1].content, [
          { type: "text", text: "Remove the names." },
          { type: "text", text: `--- ${path.join(inbox, "a.txt")} ---\nAlice wrote to Bob.` },
          { type: "text", text: `--- ${note} ---\nCall Carol on 0612345678.` },
        ]);
      }),
    ),
);

it.effect("files that don't fit the context fail with the token counts", () =>
  withServer(
    Effect.gen(function* () {
      const models = yield* start;
      // Room for the warm-up, not for the call.
      const model = yield* register(models, ["--fake-ctx", "50"]);
      const error = yield* models
        .run({ model: model.id, instruction: "x".repeat(400), files: [] })
        .pipe(Effect.flip);
      assert.match(error.message, /^The files take \d+ tokens; Fake 7B holds 50\.$/);
    }),
  ),
);

it.effect("a refused wake gives the numbers and starts nothing", () => {
  const memory = Ref.makeUnsafe<LocalMemory>({ ...roomy, swapUsedBytes: 2.1 * GB });
  return withServer(
    Effect.gen(function* () {
      const models = yield* start;
      const model = yield* register(models);
      const swap = yield* models.wake(model.id).pipe(Effect.flip);
      assert.strictEqual(swap.message, "swap in use · 2.1 GB");

      yield* Ref.set(memory, { ...roomy, availableBytes: 15.5 * GB });
      // The fake file is tiny, but --cache-ram counts toward a first wake.
      const big = yield* register(models, ["--cache-ram", "1024"], "Fake Big");
      const short = yield* models.wake(big.id).pipe(Effect.flip);
      assert.strictEqual(short.message, "needs 1 GB · 0.5 GB to spare");

      assert.strictEqual((yield* runtimeOf(models, big.id)).state, "asleep");
      assert.deepStrictEqual(yield* readRecord((yield* paths).record), []);
    }),
    memory,
  );
});

it.effect("a wake over 40 GB asks: Decline fails it, Approve wakes the model", () =>
  withServer(
    Effect.gen(function* () {
      const models = yield* start;
      const model = yield* register(models, ["--cache-ram", String(42 * 1024)]);
      assert.strictEqual((yield* runtimeOf(models, model.id)).needBytes, 42 * GB);

      const unasked = yield* models.wake(model.id).pipe(Effect.flip);
      assert.strictEqual(unasked.message, "asks first: over 40 GB · needs 42 GB");

      const asked: Array<number> = [];
      const answer =
        (approve: boolean): LocalModels.AskOwner =>
        (ask) =>
          Effect.sync(() => {
            asked.push(ask.freeAfterBytes);
            return approve;
          });
      const declined = yield* models.wake(model.id, { ask: answer(false) }).pipe(Effect.flip);
      assert.strictEqual(declined.message, "The owner declined waking Fake 7B.");
      assert.strictEqual((yield* runtimeOf(models, model.id)).state, "asleep");

      yield* models.wake(model.id, { ask: answer(true) });
      assert.strictEqual((yield* runtimeOf(models, model.id)).state, "ready");
      assert.deepStrictEqual(asked, [58 * GB, 58 * GB]);
    }),
  ),
);

it.effect("quitting puts every awake model to sleep", () =>
  withServer(
    Effect.gen(function* () {
      const pids = yield* Effect.scoped(
        Effect.gen(function* () {
          const models = yield* start;
          const first = yield* register(models, [], "Fake 7B");
          const second = yield* register(models, [], "Fake 13B");
          yield* models.wake(first.id);
          yield* models.wake(second.id);
          return (yield* models.list).runtimes.map((runtime) => runtime.pid!);
        }),
      );
      assert.lengthOf(pids, 2);
      for (const pid of pids) assert.isNull(yield* readProcessIdentity(pid));
      assert.deepStrictEqual(yield* readRecord((yield* paths).record), []);
    }),
  ),
);

it.effect("a restart kills what the record holds, and spares a PID that is someone else's", () =>
  withServer(
    Effect.gen(function* () {
      const { record, file, scratch } = yield* paths;
      const path = yield* Path.Path;
      const spawn = (port: number) =>
        spawnModelProcess({
          argv: [process.execPath, FAKE_MODEL, "-m", file, "--port", String(port)],
          logPath: path.join(scratch, `left-${port}.log`),
        });
      // One model the last run left behind, and a process that took a recorded PID's place.
      const left = yield* spawn(41001);
      const stranger = yield* spawn(41002);
      const leftIdentity = (yield* readProcessIdentity(left.pid))!;
      yield* writeRecord(record, [
        {
          modelId: "fake-7b" as never,
          pid: left.pid,
          startedAt: leftIdentity.startedAt,
          port: 41001,
          file,
          argv: [],
        },
        {
          modelId: "fake-13b" as never,
          pid: stranger.pid,
          startedAt: "Thu Jan  1 00:00:00 2026",
          port: 41002,
          file,
          argv: [],
        },
      ]);

      yield* start;
      assert.isNull(yield* readProcessIdentity(left.pid));
      assert.isNotNull(yield* readProcessIdentity(stranger.pid));
      assert.deepStrictEqual(yield* readRecord(record), []);

      yield* stopProcessGroup(stranger.pid, Effect.asVoid(stranger.exited));
    }),
  ),
);
