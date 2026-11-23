import { VOICE_SAMPLE_RATE } from "@control/contracts";

/** A recording's samples as the server takes them: base64 of 16-bit little-endian mono. */
export function samplesToBase64(channels: ReadonlyArray<Float32Array>): string {
  const length = channels[0]?.length ?? 0;
  const pcm = new DataView(new ArrayBuffer(length * 2));
  for (let index = 0; index < length; index += 1) {
    let sample = 0;
    for (const channel of channels) sample += channel[index]! / channels.length;
    pcm.setInt16(index * 2, Math.max(-1, Math.min(1, sample)) * 0x7fff, true);
  }
  const bytes = new Uint8Array(pcm.buffer);
  let binary = "";
  // In pieces: an argument list as long as a recording overflows the stack.
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return btoa(binary);
}

/** Decodes what the browser recorded, whatever its format, at the rate the model takes. */
export async function recordingToBase64(uri: string): Promise<string> {
  const encoded = await (await fetch(uri)).arrayBuffer();
  const decoded = await new OfflineAudioContext(1, 1, VOICE_SAMPLE_RATE).decodeAudioData(encoded);
  return samplesToBase64(
    Array.from({ length: decoded.numberOfChannels }, (_, channel) =>
      decoded.getChannelData(channel),
    ),
  );
}
