/** Where somebody speaks, in hundredths of a second, as the speech detector reports it. */
export interface SpeechSegment {
  readonly t0: number;
  readonly t1: number;
}

/** Kept on each side of speech, so a word's edges survive. */
const PAD_SECONDS = 0.3;
const SAMPLE_BYTES = 2;

/**
 * The recording (16-bit mono samples) with its silences cut: Whisper makes words up, or repeats
 * the last sentence, when it listens to a long one.
 */
export function keepSpeech(
  pcm: Buffer,
  sampleRate: number,
  segments: ReadonlyArray<SpeechSegment>,
): Buffer {
  const byteAt = (seconds: number) => Math.round(seconds * sampleRate) * SAMPLE_BYTES;
  const parts: Array<Buffer> = [];
  // Also the floor for the next start: pads overlap, and the first may begin before the recording.
  let end = 0;
  for (const segment of segments) {
    const from = Math.max(byteAt(segment.t0 / 100 - PAD_SECONDS), end);
    end = Math.max(byteAt(segment.t1 / 100 + PAD_SECONDS), end);
    parts.push(pcm.subarray(from, end));
  }
  return Buffer.concat(parts);
}
