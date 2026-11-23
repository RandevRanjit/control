import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import type { VoiceModelState } from "@control/contracts";
import * as Crypto from "effect/Crypto";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Stream from "effect/Stream";
import * as Hex from "effect/encoding/Hex";
import { HttpClient, HttpClientResponse } from "effect/http";

import { nativeDelay } from "../localModels/processes.ts";
import * as ProcessRunner from "../processRunner.ts";
import * as VoiceInput from "./VoiceInput.ts";

// No test downloads or runs the real model: the files are a few bytes, and the process is a script.
const FAKE_WORKER = new URL("./testFixtures/fakeVoiceWorker.mjs", import.meta.url).pathname;
const MODEL = Buffer.from("model ".repeat(100));
const DETECTOR = Buffer.from("detector");
const base64 = (text: string) => Buffer.from(text).toString("base64");

const makeHarness = Effect.fn("test.makeVoiceInput")(function* (
  options: {
    readonly baseDir?: string;
    readonly supported?: boolean;
    readonly wrongChecksum?: boolean;
    /** The model's bytes as they arrive. */
    readonly body?: Stream.Stream<Uint8Array>;
  } = {},
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const crypto = yield* Crypto.Crypto;
  const baseDir =
    options.baseDir ?? (yield* fs.makeTempDirectoryScoped({ prefix: "control-voice-test-" }));
  const file = Effect.fnUntraced(function* (name: string, contents: Buffer) {
    const sha256 = Hex.encode(yield* crypto.digest("SHA-256", contents).pipe(Effect.orDie));
    return { name, url: `https://models.test/${name}`, bytes: contents.byteLength, sha256 };
  });
  const requests: Array<string> = [];
  const model = yield* file("model.bin", MODEL);
  const voice = yield* VoiceInput.make({
    baseDir,
    workerPath: FAKE_WORKER,
    supported: options.supported ?? true,
    model: options.wrongChecksum ? { ...model, sha256: "0".repeat(64) } : model,
    detector: yield* file("detector.bin", DETECTOR),
  }).pipe(
    Effect.provideService(
      HttpClient.HttpClient,
      HttpClient.make((request) =>
        Effect.sync(() => {
          requests.push(request.url);
          const response = HttpClientResponse.fromWeb(request, new Response(null));
          return Object.defineProperty(response, "stream", {
            value: request.url.endsWith("detector.bin")
              ? Stream.make<Array<Uint8Array>>(DETECTOR)
              : (options.body ??
                Stream.make<Array<Uint8Array>>(MODEL.subarray(0, 300), MODEL.subarray(300))),
          });
        }),
      ),
    ),
  );
  const directory = path.join(baseDir, "tools", "voice");
  const until = (matches: (state: VoiceModelState) => boolean) =>
    voice.changes.pipe(Stream.filter(matches), Stream.runHead, Effect.map(Option.getOrThrow));
  const now = until(() => true);
  return { voice, baseDir, directory, fs, path, requests, until, now };
});

const installed = Effect.gen(function* () {
  const harness = yield* makeHarness();
  yield* harness.voice.install;
  yield* harness.until((state) => state.status === "ready");
  return harness;
});

const layer = ProcessRunner.layer.pipe(Layer.provideMerge(NodeServices.layer));

it.layer(layer)("VoiceInput", (it) => {
  describe("the model", () => {
    it.effect("downloads once, shows how far it is, and is still there after a restart", () =>
      Effect.gen(function* () {
        const { voice, baseDir, directory, fs, requests, now } = yield* makeHarness();
        const sizeBytes = MODEL.byteLength + DETECTOR.byteLength;
        expect(yield* now).toEqual({ status: "missing", sizeBytes });

        const seen = yield* voice.changes.pipe(
          Stream.takeUntil((state) => state.status === "ready"),
          Stream.runCollect,
          Effect.forkChild({ startImmediately: true }),
        );
        yield* voice.install;
        yield* voice.install;
        const states = Array.from(yield* Fiber.join(seen));
        expect(states.map((state) => state.status)).toContain("downloading");
        expect(states.at(-1)).toEqual({ status: "ready", sizeBytes });
        expect(requests).toHaveLength(2);
        expect((yield* fs.readDirectory(directory)).sort()).toEqual(["detector.bin", "model.bin"]);

        const restarted = yield* makeHarness({ baseDir });
        expect((yield* restarted.now).status).toBe("ready");
      }).pipe(Effect.scoped),
    );

    it.effect("refuses a download that isn't the pinned file, and says so", () =>
      Effect.gen(function* () {
        const { voice, directory, fs, until } = yield* makeHarness({ wrongChecksum: true });
        yield* voice.install;
        const state = yield* until((next) => next.error !== undefined);
        expect(state.status).toBe("missing");
        expect(yield* fs.readDirectory(directory)).toEqual(["detector.bin"]);
      }).pipe(Effect.scoped),
    );

    it.effect("stops reading a download that outgrows the pinned file", () =>
      Effect.gen(function* () {
        let readOn = false;
        const { voice, until } = yield* makeHarness({
          body: Stream.make<Array<Uint8Array>>(MODEL, MODEL).pipe(
            Stream.concat(
              Stream.sync(() => {
                readOn = true;
                return MODEL;
              }),
            ),
          ),
        });
        yield* voice.install;
        const state = yield* until((next) => next.error !== undefined);
        expect(state.error).toContain("The download stopped");
        expect(readOn).toBe(false);
      }).pipe(Effect.scoped),
    );

    it.effect("stops a running download and leaves nothing behind", () =>
      Effect.gen(function* () {
        const started = yield* Deferred.make<void>();
        const stopped = yield* Deferred.make<void>();
        const { voice, directory, fs, requests } = yield* makeHarness({
          body: Stream.make<Array<Uint8Array>>(MODEL.subarray(0, 300)).pipe(
            Stream.concat(
              Stream.fromEffect(
                Deferred.succeed(started, undefined).pipe(
                  Effect.andThen(Effect.never),
                  Effect.onInterrupt(() => Deferred.succeed(stopped, undefined)),
                ),
              ),
            ),
          ),
        });
        const seen = yield* voice.changes.pipe(
          Stream.drop(1),
          Stream.takeUntil((state) => state.status === "missing"),
          Stream.runCollect,
          Effect.forkChild({ startImmediately: true }),
        );
        yield* voice.install;
        yield* Deferred.await(started);
        // Asking again doesn't start it over.
        yield* voice.install;
        expect(requests).toHaveLength(2);
        yield* voice.remove;
        yield* Deferred.await(stopped);
        const states = Array.from(yield* Fiber.join(seen));
        expect(states.at(-2)).toMatchObject({
          status: "downloading",
          receivedBytes: DETECTOR.byteLength + 300,
        });
        // Stopping isn't a failure.
        expect(states.at(-1)).toEqual({ status: "missing", sizeBytes: states[0]?.sizeBytes });
        expect(yield* fs.exists(directory)).toBe(false);
      }).pipe(Effect.scoped),
    );

    it.effect("is deleted by Remove, and downloads again after it", () =>
      Effect.gen(function* () {
        const { voice, directory, fs, until, now } = yield* installed;
        yield* voice.remove;
        expect((yield* now).status).toBe("missing");
        expect(yield* fs.exists(directory)).toBe(false);
        yield* voice.install;
        yield* until((state) => state.status === "ready");
      }).pipe(Effect.scoped),
    );

    it.effect("can't be downloaded where it can't run", () =>
      Effect.gen(function* () {
        const { voice, requests, now } = yield* makeHarness({ supported: false });
        expect((yield* now).status).toBe("unsupported");
        expect((yield* Effect.flip(voice.install)).message).toContain("Apple silicon");
        yield* voice.remove;
        expect((yield* now).status).toBe("unsupported");
        expect(requests).toEqual([]);
      }).pipe(Effect.scoped),
    );
  });

  describe("a dictation", () => {
    it.effect("gives the recording and the hints to the model and returns its words", () =>
      Effect.gen(function* () {
        const { voice } = yield* installed;
        const { text } = yield* voice.transcribe({
          audio: base64("hello"),
          hints: ["main", "ClaudeAdapterV2"],
        });
        expect(text).toBe(
          `hello | Glossary: main, ClaudeAdapterV2. | 16000 | ${MODEL.toString()} | detector`,
        );
      }).pipe(Effect.scoped),
    );

    it.effect("fails cleanly when the process crashes, and the next one works", () =>
      Effect.gen(function* () {
        const { voice } = yield* installed;
        const error = yield* Effect.flip(voice.transcribe({ audio: base64("crash"), hints: [] }));
        expect(error.message).toBe("The recording couldn't be turned into text.");
        const { text } = yield* voice.transcribe({ audio: base64("again"), hints: [] });
        expect(text).toContain("again");
      }).pipe(Effect.scoped),
    );

    it.effect("ends its process when it's cancelled", () =>
      Effect.gen(function* () {
        const { voice, baseDir, fs, path } = yield* installed;
        const pidFile = path.join(baseDir, "pid");
        const fiber = yield* voice
          .transcribe({ audio: base64(`hang ${pidFile}`), hints: [] })
          .pipe(Effect.forkChild);
        const pid = yield* Effect.gen(function* () {
          for (;;) {
            const written = yield* fs.readFileString(pidFile).pipe(Effect.orElseSucceed(() => ""));
            if (written !== "") return Number(written);
            yield* nativeDelay(10);
          }
        });
        yield* Fiber.interrupt(fiber);
        expect(() => process.kill(pid, 0)).toThrow();
      }).pipe(Effect.scoped),
    );

    it.effect("needs the model, and at most five minutes of it", () =>
      Effect.gen(function* () {
        const missing = yield* makeHarness();
        expect(
          (yield* Effect.flip(missing.voice.transcribe({ audio: base64("hi"), hints: [] })))
            .message,
        ).toContain("isn't downloaded");
        const { voice } = yield* installed;
        const sixMinutes = "A".repeat(Math.ceil((360 * 32_000) / 3) * 4);
        expect(
          (yield* Effect.flip(voice.transcribe({ audio: sixMinutes, hints: [] }))).message,
        ).toContain("five minutes");
      }).pipe(Effect.scoped),
    );
  });

  describe("the glossary", () => {
    it("keeps each hint to one name", () => {
      expect(VoiceInput.voicePrompt([" a,b ", "", "two\nlines"])).toBe("Glossary: a b, two lines.");
    });

    it("is left out when there's nothing to teach", () => {
      expect(VoiceInput.voicePrompt([" "])).toBe("");
    });

    it("drops the last hints when there are too many", () => {
      const prompt = VoiceInput.voicePrompt(
        Array.from({ length: 200 }, (_, index) => `identifier${index}`),
      );
      expect(prompt).toContain("identifier0,");
      expect(prompt.length).toBeLessThan(640);
    });
  });
});
