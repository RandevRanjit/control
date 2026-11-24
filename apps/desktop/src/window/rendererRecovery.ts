import type * as Electron from "electron";

import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";

const RELOAD_DELAY_MS = 500;
const MAX_ATTEMPTS = 3;
const ATTEMPT_WINDOW_MS = 60_000;

// "killed" is a signal from outside: the system short of memory, or force-quitting what it took for
// leftovers of an app that quit.
const RECOVERABLE_REASONS = new Set<Electron.RenderProcessGoneDetails["reason"]>([
  "crashed",
  "oom",
  "abnormal-exit",
  "killed",
]);

/**
 * Loads a window's page again after its process is gone, which otherwise leaves a dead window while
 * the server and its agents keep running. Run the result on each `render-process-gone`. It gives up
 * after three reloads in a minute, so a page that dies on boot can't loop.
 */
export const makeRendererRecovery = (input: {
  readonly isDestroyed: () => boolean;
  readonly load: () => void;
  readonly onGone: (
    details: Electron.RenderProcessGoneDetails & { readonly recovering: boolean },
  ) => Effect.Effect<void>;
}) => {
  let attempts: number[] = [];
  return Effect.fn("desktop.window.recoverRenderer")(function* (
    details: Electron.RenderProcessGoneDetails,
  ) {
    const now = yield* Clock.currentTimeMillis;
    attempts = attempts.filter((timestamp) => now - timestamp < ATTEMPT_WINDOW_MS);
    const recovering =
      RECOVERABLE_REASONS.has(details.reason) &&
      !input.isDestroyed() &&
      attempts.length < MAX_ATTEMPTS;
    yield* input.onGone({ ...details, recovering });
    if (!recovering) return;
    attempts.push(now);
    yield* Effect.sleep(RELOAD_DELAY_MS);
    if (!input.isDestroyed()) input.load();
  });
};
