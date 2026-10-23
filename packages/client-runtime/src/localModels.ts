import {
  formatGb,
  GB,
  LOCAL_MODEL_ASK_BYTES,
  type LocalModelRuntime,
  type LocalModelsSnapshot,
} from "@control/contracts";

// What web and the phone show of local models (design/hybrid/HANDOFF.md §18).

/** Settings' figures, to one decimal and bare when whole: `33.4 GB`, `42 GB`. */
export const gbOne = (bytes: number) => `${Number((bytes / GB).toFixed(1))} GB`;

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

/** Minutes and seconds since `since`, as the waking note counts them: `0:41`. */
function elapsed(since: string, nowMs: number): string {
  const seconds = Math.max(0, Math.floor((nowMs - Date.parse(since)) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** `23:41`, on this device's clock. */
const clock = (iso: string) => {
  // @effect-diagnostics-next-line globalDate:off
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};

/**
 * The sidebar note's face (design/hybrid/HANDOFF.md §18.5, M1b): waking wears the background
 * lamp and the time so far, ready the idle ring and the memory it holds, in use the
 * background lamp and the calls running. `num` is the part set in tabular figures.
 */
export function noteFace(
  runtime: LocalModelRuntime,
  nowMs: number,
): {
  readonly lamp: "bg" | "idle";
  readonly before: string;
  readonly num: string;
  readonly after: string;
} {
  if (runtime.state === "waking") {
    return { lamp: "bg", before: "waking · ", num: elapsed(runtime.since, nowMs), after: "" };
  }
  if (runtime.calls > 0) {
    return {
      lamp: "bg",
      before: "in use · ",
      num: String(runtime.calls),
      after: runtime.calls === 1 ? " call" : " calls",
    };
  }
  const held = runtime.footprintBytes ?? runtime.needBytes;
  return held === undefined
    ? { lamp: "idle", before: "ready", num: "", after: "" }
    : { lamp: "idle", before: "ready · ", num: formatGb(held), after: "" };
}

/** A Settings row's lamp: the open ring asleep, the background lamp at work, the idle ring ready. */
export const rowLamp = (runtime: LocalModelRuntime | undefined) =>
  runtime === undefined || runtime.state === "asleep"
    ? ("outside" as const)
    : runtime.state === "waking" || runtime.calls > 0
      ? ("bg" as const)
      : ("idle" as const);

/** The awake models, in the registry's order, each with its runtime. */
export function awakeModels(snapshot: LocalModelsSnapshot) {
  return snapshot.models.flatMap((model) => {
    const runtime = snapshot.runtimes.find((item) => item.modelId === model.id);
    return runtime === undefined || runtime.state === "asleep" ? [] : [{ model, runtime }];
  });
}

/**
 * The memory bar (M2): other apps, the awake models, what's free, and what a wake keeps back.
 * Free is what the wake rule counts as available; the models hold what they measured.
 */
export function memoryBar(snapshot: LocalModelsSnapshot) {
  const { totalBytes, availableBytes, keepBytes, swapUsedBytes } = snapshot.memory;
  const models = awakeModels(snapshot).reduce(
    (sum, { runtime }) => sum + (runtime.footprintBytes ?? runtime.needBytes ?? 0),
    0,
  );
  return {
    total: totalBytes,
    apps: Math.max(0, totalBytes - availableBytes - models),
    models,
    free: availableBytes,
    keep: keepBytes,
    swap: swapUsedBytes,
  };
}

/** An exit worth showing: a crash or a kill, not the SIGTERM of an ordinary sleep. */
const unusualExit = (exit: LocalModelRuntime["lastExit"]) =>
  exit !== undefined &&
  !(exit.signal === "SIGTERM" || exit.code === 0 || exit.code === 143) &&
  (exit.signal !== null ? `exited · ${exit.signal}` : `exited · code ${exit.code}`);

/** A Settings row's state, its memory and when, and the line under it (M2). */
export function rowStatus(
  runtime: LocalModelRuntime,
  nowMs: number,
): { readonly state: string; readonly rest: string; readonly second: string | null } {
  const where = runtime.pid === undefined ? null : `PID ${runtime.pid} · :${runtime.port ?? ""}`;
  if (runtime.state === "asleep") {
    const need = runtime.needBytes;
    return {
      state: "asleep",
      rest: need === undefined ? "" : ` · ${gbOne(need)}`,
      second:
        need !== undefined && need > LOCAL_MODEL_ASK_BYTES
          ? `asks first: over ${formatGb(LOCAL_MODEL_ASK_BYTES)}`
          : unusualExit(runtime.lastExit) || null,
    };
  }
  if (runtime.state === "waking") {
    return { state: "waking", rest: ` · ${elapsed(runtime.since, nowMs)}`, second: where };
  }
  const held = runtime.footprintBytes ?? runtime.needBytes;
  const memory = held === undefined ? "" : ` · ${gbOne(held)}`;
  if (runtime.calls > 0) {
    return { state: "in use", rest: ` · ${plural(runtime.calls, "call")}${memory}`, second: where };
  }
  return {
    state: "ready",
    rest: `${memory}${runtime.sleepsAt === undefined ? "" : ` · sleeps ${clock(runtime.sleepsAt)}`}`,
    second: where,
  };
}

/** The phone's line (M5b): `53.6 GB free of 128 GB, with 15 GB kept back and no swap.` */
export function memoryLine(snapshot: LocalModelsSnapshot): string {
  const { totalBytes, availableBytes, keepBytes, swapUsedBytes } = snapshot.memory;
  const swap = swapUsedBytes === 0 ? "no swap" : `${formatGb(swapUsedBytes)} of swap in use`;
  return `${gbOne(availableBytes)} free of ${formatGb(totalBytes)}, with ${formatGb(keepBytes)} kept back and ${swap}.`;
}
