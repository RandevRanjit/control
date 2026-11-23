// @effect-diagnostics nodeBuiltinImport:off - Effect has no incremental digest.
import * as NodeCrypto from "node:crypto";
import {
  VOICE_SAMPLE_RATE,
  VoiceError,
  type VoiceModelState,
  type VoiceTranscribeInput,
  VoiceTranscribeResult,
} from "@control/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FiberHandle from "effect/FiberHandle";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";

import * as ServerConfig from "../config.ts";
import * as ProcessRunner from "../processRunner.ts";
import { hasVoiceEngine } from "./engine.ts";

/** A file dictation needs, pinned to one revision so every download is the one that was tested. */
export interface VoiceFile {
  readonly name: string;
  readonly url: string;
  readonly bytes: number;
  readonly sha256: string;
}

/** Whisper large-v3-turbo, which turns speech into words (MIT). */
const MODEL: VoiceFile = {
  name: "ggml-large-v3-turbo-q5_0.bin",
  url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-large-v3-turbo-q5_0.bin",
  bytes: 574_041_195,
  sha256: "394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2",
};
/** Silero VAD, which finds where somebody speaks (MIT). */
const DETECTOR: VoiceFile = {
  name: "ggml-silero-v6.2.0.bin",
  url: "https://huggingface.co/ggml-org/whisper-vad/resolve/9ffd54a1e1ee413ddf265af9913beaf518d1639b/ggml-silero-v6.2.0.bin",
  bytes: 885_098,
  sha256: "2aa269b785eeb53a82983a20501ddf7c1d9c48e33ab63a41391ac6c9f7fb6987",
};

const DOWNLOAD_TIMEOUT = "1 hour";
const TRANSCRIBE_TIMEOUT = "2 minutes";
/** Clients stop at five minutes; this leaves room for a late stop. */
const MAX_AUDIO_SECONDS = 330;
const MAX_AUDIO_BASE64_LENGTH = Math.ceil((MAX_AUDIO_SECONDS * VOICE_SAMPLE_RATE * 2) / 3) * 4;
/** Whisper reads only the last 224 tokens of its prompt, so a longer one drops the best hints. */
const MAX_PROMPT_LENGTH = 600;

/** Whisper's prompt, which teaches it how the names in this chat are spelt. */
export function voicePrompt(hints: ReadonlyArray<string>): string {
  let names = "";
  for (const hint of hints) {
    const name = hint.replace(/[\s,]+/g, " ").trim();
    if (name === "") continue;
    const next = names === "" ? name : `${names}, ${name}`;
    if (next.length > MAX_PROMPT_LENGTH) break;
    names = next;
  }
  return names === "" ? "" : `Glossary: ${names}.`;
}

export class VoiceInput extends Context.Service<
  VoiceInput,
  {
    /** The model's state now, then at each change. */
    readonly changes: Stream.Stream<VoiceModelState>;
    /** Starts the download and returns; `changes` follows it. */
    readonly install: Effect.Effect<void, VoiceError>;
    /** Stops a running download, or deletes the model. */
    readonly remove: Effect.Effect<void, VoiceError>;
    /** Turns a recording into words on this machine. Nothing of it is kept. */
    readonly transcribe: (
      input: VoiceTranscribeInput,
    ) => Effect.Effect<VoiceTranscribeResult, VoiceError>;
  }
>()("@control/server/voice/VoiceInput") {}

export interface VoiceInputOptions {
  readonly baseDir: string;
  /** Tests run their own script instead of voice-worker. */
  readonly workerPath?: string;
  readonly model?: VoiceFile;
  readonly detector?: VoiceFile;
  readonly supported?: boolean;
}

/** What one dictation's process reads from stdin. */
const WorkerRequest = Schema.Struct({
  audio: Schema.String,
  sampleRate: Schema.Number,
  prompt: Schema.String,
});
export type WorkerRequest = typeof WorkerRequest.Type;
const encodeRequest = Schema.encodeEffect(Schema.fromJsonString(WorkerRequest));
const decodeResult = Schema.decodeUnknownEffect(Schema.fromJsonString(VoiceTranscribeResult));

/** @public Service construction is part of the canonical Effect module API. */
export const make = Effect.fn("VoiceInput.make")(function* (options: VoiceInputOptions) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const http = yield* HttpClient.HttpClient;
  const processes = yield* ProcessRunner.ProcessRunner;
  const model = options.model ?? MODEL;
  const detector = options.detector ?? DETECTOR;
  const files = [detector, model];
  const directory = path.join(options.baseDir, "tools", "voice");
  const pathOf = (file: VoiceFile) => path.join(directory, file.name);
  const sizeBytes = model.bytes + detector.bytes;

  // A file gets its name only after its checksum matched, so its size says it's whole.
  const isInstalled = (file: VoiceFile) =>
    fs.stat(pathOf(file)).pipe(
      Effect.map((info) => Number(info.size) === file.bytes),
      Effect.orElseSucceed(() => false),
    );
  const installed = Effect.map(Effect.all(files.map(isInstalled)), (all) => all.every(Boolean));

  const supported = options.supported ?? hasVoiceEngine();
  const state = yield* SubscriptionRef.make<VoiceModelState>({
    status: supported ? ((yield* installed) ? "ready" : "missing") : "unsupported",
    sizeBytes,
  });
  const setState = (next: Omit<VoiceModelState, "sizeBytes">) =>
    SubscriptionRef.set(state, { ...next, sizeBytes });

  const partOf = (file: VoiceFile) => `${pathOf(file)}.part`;
  const downloadFile = Effect.fn("VoiceInput.downloadFile")(function* (
    file: VoiceFile,
    receivedBefore: number,
  ) {
    const response = yield* http
      .execute(HttpClientRequest.get(file.url))
      .pipe(Effect.flatMap(HttpClientResponse.filterStatusOk));
    const hash = NodeCrypto.createHash("sha256");
    let received = 0;
    let shownPercent = -1;
    yield* response.stream.pipe(
      Stream.takeUntil((chunk) => {
        hash.update(chunk);
        received += chunk.byteLength;
        return received > file.bytes;
      }),
      Stream.tap(() => {
        const receivedBytes = Math.min(receivedBefore + received, sizeBytes);
        const percent = Math.floor((receivedBytes / sizeBytes) * 100);
        if (percent === shownPercent) return Effect.void;
        shownPercent = percent;
        return setState({ status: "downloading", receivedBytes });
      }),
      Stream.run(fs.sink(partOf(file))),
    );
    if (received !== file.bytes || hash.digest("hex") !== file.sha256) {
      return yield* new VoiceError({ message: "The download didn't match the model." });
    }
    yield* fs.rename(partOf(file), pathOf(file));
  });

  const download = Effect.gen(function* () {
    yield* fs.makeDirectory(directory, { recursive: true });
    let receivedBefore = 0;
    for (const file of files) {
      if (!(yield* isInstalled(file))) {
        yield* downloadFile(file, receivedBefore).pipe(
          Effect.ensuring(fs.remove(partOf(file), { force: true }).pipe(Effect.ignore)),
        );
      }
      receivedBefore += file.bytes;
    }
  }).pipe(
    Effect.timeout(DOWNLOAD_TIMEOUT),
    Effect.exit,
    Effect.flatMap((exit) => {
      if (Exit.isSuccess(exit)) return setState({ status: "ready" });
      return Effect.logWarning("Dictation's model didn't download", exit.cause).pipe(
        Effect.andThen(
          setState({
            status: "missing",
            error: "The download stopped. Check this Mac's network and free space, then try again.",
          }),
        ),
      );
    }),
  );

  const running = yield* FiberHandle.make<void>();
  const changing = yield* Semaphore.make(1);

  const install: VoiceInput["Service"]["install"] = changing.withPermits(1)(
    Effect.gen(function* () {
      const { status } = yield* SubscriptionRef.get(state);
      if (status === "unsupported") {
        return yield* new VoiceError({ message: "Dictation needs a Mac with Apple silicon." });
      }
      if (status !== "missing") return;
      yield* setState({ status: "downloading", receivedBytes: 0 });
      yield* FiberHandle.run(running, download);
    }),
  );

  const remove: VoiceInput["Service"]["remove"] = changing.withPermits(1)(
    Effect.gen(function* () {
      const { status } = yield* SubscriptionRef.get(state);
      if (status === "unsupported") return;
      yield* FiberHandle.clear(running);
      yield* fs
        .remove(directory, { recursive: true, force: true })
        .pipe(
          Effect.mapError((cause) => new VoiceError({ message: "Couldn't delete it.", cause })),
        );
      yield* setState({ status: "missing" });
    }),
  );

  const workerPath =
    options.workerPath ??
    // Bundled beside the server, or run from source in development.
    ((yield* fs
      .exists(path.join(import.meta.dirname, "voice-worker.mjs"))
      .pipe(Effect.orElseSucceed(() => false)))
      ? path.join(import.meta.dirname, "voice-worker.mjs")
      : path.join(import.meta.dirname, "..", "voice-worker.ts"));
  // Each dictation holds 900 MB while it runs, so two devices take turns.
  const turn = yield* Semaphore.make(1);

  const transcribe: VoiceInput["Service"]["transcribe"] = Effect.fn("VoiceInput.transcribe")(
    function* (input) {
      if ((yield* SubscriptionRef.get(state)).status !== "ready") {
        return yield* new VoiceError({ message: "Dictation's model isn't downloaded." });
      }
      if (input.audio.length > MAX_AUDIO_BASE64_LENGTH) {
        return yield* new VoiceError({ message: "The recording is longer than five minutes." });
      }
      const failed = (cause: unknown) =>
        new VoiceError({ message: "The recording couldn't be turned into text.", cause });
      const request = yield* encodeRequest({
        audio: input.audio,
        sampleRate: VOICE_SAMPLE_RATE,
        prompt: voicePrompt(input.hints),
      }).pipe(Effect.mapError(failed));
      const output = yield* processes
        .run({
          command: process.execPath,
          args: [workerPath, pathOf(model), pathOf(detector)],
          // In the desktop app execPath is Electron, which runs a script only when told to.
          env: { ELECTRON_RUN_AS_NODE: "1" },
          stdin: request,
          timeout: TRANSCRIBE_TIMEOUT,
        })
        .pipe(turn.withPermits(1), Effect.mapError(failed));
      return yield* decodeResult(output.stdout).pipe(
        Effect.tapError(() =>
          Effect.logWarning("Dictation failed", { code: output.code, stderr: output.stderr }),
        ),
        Effect.mapError(failed),
      );
    },
  );

  return VoiceInput.of({ changes: SubscriptionRef.changes(state), install, remove, transcribe });
});

export const layer = Layer.effect(
  VoiceInput,
  Effect.gen(function* () {
    const { baseDir } = yield* ServerConfig.ServerConfig;
    return yield* make({ baseDir });
  }),
);
