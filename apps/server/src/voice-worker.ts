// @effect-diagnostics nodeBuiltinImport:off - one dictation in its own process, with no runtime to start.
// `node voice-worker.ts <model> <speech detector>` reads the recording as JSON on stdin and prints
// the words as JSON. VoiceInput starts one for each dictation, and it holds the model's 900 MB
// only for the half second that takes.
import * as NodeStreamConsumers from "node:stream/consumers";

import { loadVoiceEngine } from "./voice/engine.ts";
import { keepSpeech } from "./voice/speech.ts";
import type { WorkerRequest } from "./voice/VoiceInput.ts";

const [modelPath = "", detectorPath = ""] = process.argv.slice(2);
const request = (await NodeStreamConsumers.json(process.stdin)) as WorkerRequest;
const pcm = Buffer.from(request.audio, "base64");
const { WhisperContext, WhisperVadContext } = loadVoiceEngine();

/** The addon reads an ArrayBuffer from its start, which a Buffer's may not be. */
const samples = (buffer: Buffer): ArrayBuffer => new Uint8Array(buffer).buffer;

// Whisper answers silence with a made-up "Thank you.", so it only hears what the detector keeps.
const detector = new WhisperVadContext({ filePath: detectorPath, nThreads: 1 });
const segments = await detector.detectSpeechData(samples(pcm));
await detector.release();
const speech = keepSpeech(pcm, request.sampleRate, segments);

let text = "";
if (speech.byteLength > 0) {
  const whisper = new WhisperContext({ filePath: modelPath, useGpu: true, useFlashAttn: true });
  const { promise } = whisper.transcribeData(samples(speech), {
    language: "en",
    temperature: 0,
    ...(request.prompt === "" ? {} : { prompt: request.prompt }),
  });
  text = (await promise).result.trim();
  // Without this the GPU library aborts the process as it exits.
  await whisper.release();
}
process.stdout.write(JSON.stringify({ text }));
