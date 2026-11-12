import { UI_INTERACTION_SPAN_NAME } from "@control/contracts";

import { recordSpan } from "./clientTracer";

/** Interactions at least this slow are exported; Diagnostics counts the ones over 100 ms. */
const EXPORT_THRESHOLD_MS = 50;
/** How far the pointer moves with a button held before a press counts as a drag. */
const DRAG_DISTANCE_PX = 4;
const LABELLED = "button, a, input, textarea, select, summary, [role], [aria-label]";

export interface TimedInteraction {
  readonly event: "click" | "key" | "drag";
  readonly target: string;
  /** On the `performance.now()` clock. */
  readonly startMs: number;
  readonly durationMs: number;
  /** For a drag: how many of its frames took longer than the threshold. */
  readonly longFrames?: number;
}

type EventEntry = Pick<PerformanceEventTiming, "name" | "startTime" | "duration" | "target"> & {
  readonly interactionId: number;
};
type FrameEntry = Pick<PerformanceEntry, "startTime" | "duration">;

/** A short name for what an interaction landed on, such as `tab "Outputs"`. */
export function describeTarget(target: Node | null): string {
  const element = target instanceof Element ? target : (target?.parentElement ?? null);
  if (element === null) return "a removed element";
  const control = element.closest(LABELLED) ?? element;
  const kind = control.getAttribute("role") ?? control.tagName.toLowerCase();
  const label = (
    control.getAttribute("aria-label") ??
    control.getAttribute("placeholder") ??
    control.textContent ??
    ""
  )
    .replace(/\s+/g, " ")
    .trim();
  if (label === "") {
    const slot = control.getAttribute("data-slot");
    return slot === null ? kind : `${kind} (${slot})`;
  }
  return `${kind} "${label.length > 60 ? `${label.slice(0, 59)}…` : label}"`;
}

/**
 * Folds the browser's timings into interactions. A click or key press is its slowest Event Timing
 * entry: input to the next paint. Event Timing skips pointer moves, so a drag is its slowest
 * long animation frame once the pointer has moved with a button held.
 */
export function createInteractionRecorder(report: (interaction: TimedInteraction) => void) {
  const reported = new Set<number>();
  let press: {
    readonly target: string;
    readonly x: number;
    readonly y: number;
    movedAt: number | null;
    worst: FrameEntry | null;
    longFrames: number;
  } | null = null;

  return {
    events(entries: ReadonlyArray<EventEntry>) {
      const slowest = new Map<number, EventEntry>();
      for (const entry of entries) {
        if (entry.interactionId === 0 || reported.has(entry.interactionId)) continue;
        const current = slowest.get(entry.interactionId);
        if (current === undefined || entry.duration > current.duration) {
          slowest.set(entry.interactionId, entry);
        }
      }
      for (const [interactionId, entry] of slowest) {
        if (entry.duration < EXPORT_THRESHOLD_MS) continue;
        // A press's pointerdown, pointerup and click can arrive in separate batches.
        reported.add(interactionId);
        if (reported.size > 100) reported.delete(reported.values().next().value!);
        report({
          event: entry.name.startsWith("key") ? "key" : "click",
          target: describeTarget(entry.target),
          startMs: entry.startTime,
          durationMs: entry.duration,
        });
      }
    },
    pointerDown(target: EventTarget | null, x: number, y: number) {
      const node = target instanceof Node ? target : null;
      press = { target: describeTarget(node), x, y, movedAt: null, worst: null, longFrames: 0 };
    },
    pointerMove(x: number, y: number, at: number) {
      if (press === null || press.movedAt !== null) return;
      if (Math.hypot(x - press.x, y - press.y) >= DRAG_DISTANCE_PX) press.movedAt = at;
    },
    frames(entries: ReadonlyArray<FrameEntry>) {
      if (press?.movedAt == null) return;
      for (const frame of entries) {
        if (frame.duration < EXPORT_THRESHOLD_MS || frame.startTime < press.movedAt) continue;
        press.longFrames += 1;
        if (press.worst === null || frame.duration > press.worst.duration) press.worst = frame;
      }
    },
    pointerUp() {
      const done = press;
      press = null;
      if (done?.worst == null) return;
      report({
        event: "drag",
        target: done.target,
        startMs: done.worst.startTime,
        durationMs: done.worst.duration,
        longFrames: done.longFrames,
      });
    },
  };
}

/**
 * Times every click, key press and drag in real use and exports the slow ones as client spans.
 * Returns the stop function. A browser without Event Timing (Safari) records nothing.
 */
export function startInteractionTiming(): () => void {
  const types = PerformanceObserver.supportedEntryTypes;
  if (!types.includes("event")) return () => undefined;
  const epochMs = (ms: number) => performance.timeOrigin + ms;
  const recorder = createInteractionRecorder((interaction) =>
    recordSpan({
      name: UI_INTERACTION_SPAN_NAME,
      startEpochMs: epochMs(interaction.startMs),
      endEpochMs: epochMs(interaction.startMs + interaction.durationMs),
      attributes: {
        event: interaction.event,
        target: interaction.target,
        ...(interaction.longFrames === undefined ? {} : { longFrames: interaction.longFrames }),
      },
    }),
  );

  const events = new PerformanceObserver((list) =>
    recorder.events(list.getEntries() as PerformanceEventTiming[]),
  );
  // durationThreshold is Event Timing's own option, missing from TypeScript's DOM types.
  const eventOptions: PerformanceObserverInit & { durationThreshold: number } = {
    type: "event",
    durationThreshold: EXPORT_THRESHOLD_MS,
  };
  events.observe(eventOptions);
  const frames = types.includes("long-animation-frame")
    ? new PerformanceObserver((list) => recorder.frames(list.getEntries()))
    : null;
  frames?.observe({ type: "long-animation-frame" });

  const listen = { capture: true, passive: true };
  const onDown = (event: PointerEvent) =>
    recorder.pointerDown(event.target, event.clientX, event.clientY);
  const onMove = (event: PointerEvent) =>
    recorder.pointerMove(event.clientX, event.clientY, event.timeStamp);
  const onUp = () => recorder.pointerUp();
  window.addEventListener("pointerdown", onDown, listen);
  window.addEventListener("pointermove", onMove, listen);
  window.addEventListener("pointerup", onUp, listen);
  window.addEventListener("pointercancel", onUp, listen);
  return () => {
    events.disconnect();
    frames?.disconnect();
    window.removeEventListener("pointerdown", onDown, listen);
    window.removeEventListener("pointermove", onMove, listen);
    window.removeEventListener("pointerup", onUp, listen);
    window.removeEventListener("pointercancel", onUp, listen);
  };
}
