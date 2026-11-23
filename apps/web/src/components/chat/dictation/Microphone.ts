import type { VoiceRecorder, VoiceRecorderStatus } from "@control/client-runtime/voice-input";

/** Whether this page may use a microphone at all: browsers offer one only over https or localhost. */
export const hasMicrophone = () =>
  typeof navigator !== "undefined" &&
  navigator.mediaDevices?.getUserMedia !== undefined &&
  typeof MediaRecorder !== "undefined";

const isDenied = (error: unknown) =>
  error instanceof DOMException && error.name === "NotAllowedError";

/** Records one dictation at a time, into a blob URL the page holds. Nothing reaches the disk. */
export class Microphone implements VoiceRecorder {
  uri: string | null = null;
  private readonly onStatus: (status: VoiceRecorderStatus) => void;
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private limit: number | undefined;
  private acquisition = 0;

  /** `onStatus` hears of a recording that ends by itself: at its limit, or with its microphone. */
  constructor(onStatus: (status: VoiceRecorderStatus) => void) {
    this.onStatus = onStatus;
  }

  /** Opens the microphone, asking the first time. False when that was refused. */
  async open(): Promise<boolean> {
    const acquisition = ++this.acquisition;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } });
    } catch (error) {
      if (isDenied(error)) return false;
      throw error;
    }
    if (acquisition !== this.acquisition) {
      // Released while the browser was asking.
      for (const track of stream.getTracks()) track.stop();
      return true;
    }
    this.stream = stream;
    for (const track of stream.getTracks()) {
      track.addEventListener("ended", () => {
        if (this.stream !== stream) return;
        this.onStatus({
          isFinished: false,
          hasError: true,
          error: "The microphone was disconnected.",
          url: null,
        });
      });
    }
    return true;
  }

  async prepareToRecordAsync(): Promise<void> {
    if (this.stream === null) throw new Error("The microphone isn't open.");
    this.uri = null;
    this.recorder = new MediaRecorder(this.stream);
  }

  record({ forDuration }: { readonly forDuration: number }): void {
    this.recorder?.start();
    this.limit = window.setTimeout(() => {
      void this.stop().then(() =>
        this.onStatus({ isFinished: true, hasError: false, error: null, url: this.uri }),
      );
    }, forDuration * 1000);
  }

  stop(): Promise<void> {
    window.clearTimeout(this.limit);
    const recorder = this.recorder;
    this.recorder = null;
    if (recorder === null || recorder.state === "inactive") return Promise.resolve();
    return new Promise((resolve) => {
      recorder.addEventListener("dataavailable", ({ data }) => {
        this.uri = URL.createObjectURL(data);
      });
      recorder.addEventListener("stop", () => resolve(), { once: true });
      recorder.stop();
    });
  }

  /** Closes the microphone, so the Mac's recording light goes out. */
  release(): void {
    this.acquisition += 1;
    window.clearTimeout(this.limit);
    const stream = this.stream;
    this.stream = null;
    for (const track of stream?.getTracks() ?? []) track.stop();
  }

  /** Reports how loud it is, from 0 to 1, each frame until the returned function is called. */
  watchLevel(onLevel: (level: number) => void): () => void {
    if (this.stream === null) return () => {};
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    context.createMediaStreamSource(this.stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    let frame = 0;
    const read = () => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) sum += sample * sample;
      // Speech sits around a tenth of full scale; the root spreads it over the meter.
      onLevel(Math.min(1, Math.sqrt(Math.sqrt(sum / samples.length)) * 1.6));
      frame = requestAnimationFrame(read);
    };
    read();
    return () => {
      cancelAnimationFrame(frame);
      void context.close();
    };
  }
}
