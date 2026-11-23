// @effect-diagnostics nodeBuiltinImport:off - the worker that loads this has no Effect runtime.
import * as NodeModule from "node:module";

import type { SpeechSegment } from "./speech.ts";

/** What dictation uses of whisper.cpp's Node addon. */
export interface VoiceEngine {
  readonly WhisperContext: {
    new (options: {
      readonly filePath: string;
      readonly useGpu: boolean;
      readonly useFlashAttn: boolean;
    }): {
      readonly transcribeData: (
        pcm: ArrayBuffer,
        options: {
          readonly language: string;
          readonly temperature: number;
          readonly prompt?: string;
        },
      ) => { readonly promise: Promise<{ readonly result: string }> };
      readonly release: () => Promise<void>;
    };
  };
  readonly WhisperVadContext: {
    new (options: { readonly filePath: string; readonly nThreads: number }): {
      readonly detectSpeechData: (pcm: ArrayBuffer) => Promise<ReadonlyArray<SpeechSegment>>;
      readonly release: () => Promise<void>;
    };
  };
}

// Built for Apple silicon only, so elsewhere the optional dependency isn't installed. It stays
// external to the bundle because Node loads the addon from disk.
const ENGINE_PACKAGE = "@fugood/node-whisper-darwin-arm64";
const requireEngine = NodeModule.createRequire(import.meta.url);

/** Whether this machine has the addon. */
export function hasVoiceEngine(): boolean {
  try {
    requireEngine.resolve(ENGINE_PACKAGE);
    return true;
  } catch {
    return false;
  }
}

/** Only the dictation process loads it: a crash in the addon ends that process, not the server. */
export const loadVoiceEngine = (): VoiceEngine => requireEngine(ENGINE_PACKAGE);
