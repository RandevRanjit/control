import * as Schema from "effect/Schema";

import { NonNegativeInt } from "./baseSchemas.ts";

/** Dictation's speech model, which runs on the environment's machine. */
export const VoiceModelState = Schema.Struct({
  /** `unsupported` where the machine can't run the model; the rest follow one download. */
  status: Schema.Literals(["unsupported", "missing", "downloading", "ready"]),
  /** What Download fetches. */
  sizeBytes: NonNegativeInt,
  /** How much of a running download has arrived. */
  receivedBytes: Schema.optional(NonNegativeInt),
  /** Why the last download stopped. */
  error: Schema.optional(Schema.String),
});
export type VoiceModelState = typeof VoiceModelState.Type;

/** The only rate the model takes. */
export const VOICE_SAMPLE_RATE = 16_000;

export const VoiceTranscribeInput = Schema.Struct({
  /** The recording as base64 of mono 16-bit little-endian samples at VOICE_SAMPLE_RATE. */
  audio: Schema.String,
  /** Names the recording may use, such as a branch or a file, so they come out spelt right. */
  hints: Schema.Array(Schema.String),
});
export type VoiceTranscribeInput = typeof VoiceTranscribeInput.Type;

/** The text is empty when nobody spoke. */
export const VoiceTranscribeResult = Schema.Struct({ text: Schema.String });
export type VoiceTranscribeResult = typeof VoiceTranscribeResult.Type;

export class VoiceError extends Schema.TaggedError<VoiceError>()(
  "VoiceError",
  { message: Schema.String, cause: Schema.optional(Schema.Defect()) },
  { httpApiStatus: 500 },
) {}
