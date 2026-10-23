/**
 * Claude's in-process schedules: a /loop's ScheduleWakeup and session crons.
 * Their timers live in the Claude process, so releasing an idle session would
 * cancel them. CONTROL keeps such a session alive (HANDOFF-v2 §4.1).
 *
 * Tracked from tool calls alone: a wakeup sets a deadline, `stop` clears it;
 * CronCreate adds a job and CronDelete drops one. Calls are keyed by tool-use
 * id, so a replayed frame changes nothing.
 */

const WAKE_MIN_SECONDS = 60;
const WAKE_MAX_SECONDS = 3600;
/** Time for the wake turn to begin once its timer fires. */
const WAKE_GRACE_MS = 5 * 60 * 1000;
/** Recurring crons expire after 7 days in Claude Code. */
const CRON_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

export interface ClaudeScheduledWork {
  readonly wakeDeadlineMs: number | null;
  /** Live cron jobs, by the tool-use id that created them, with their creation time. */
  readonly crons: ReadonlyMap<string, number>;
  /** Tool-use ids already applied. */
  readonly seen: ReadonlySet<string>;
}

export const EMPTY_CLAUDE_SCHEDULED_WORK: ClaudeScheduledWork = {
  wakeDeadlineMs: null,
  crons: new Map(),
  seen: new Set(),
};

export interface ClaudeToolCall {
  readonly id: string;
  readonly name: string;
  readonly input: unknown;
}

const isScheduleTool = (name: string) =>
  name === "ScheduleWakeup" || name === "CronCreate" || name === "CronDelete";

export function applyClaudeScheduleCalls(
  state: ClaudeScheduledWork,
  calls: ReadonlyArray<ClaudeToolCall>,
  nowMs: number,
): ClaudeScheduledWork {
  const fresh = calls.filter((call) => isScheduleTool(call.name) && !state.seen.has(call.id));
  if (fresh.length === 0) return state;
  let wakeDeadlineMs = state.wakeDeadlineMs;
  const crons = new Map(state.crons);
  const seen = new Set(state.seen);
  for (const call of fresh) {
    seen.add(call.id);
    const input = (typeof call.input === "object" && call.input !== null ? call.input : {}) as {
      readonly stop?: unknown;
      readonly delaySeconds?: unknown;
    };
    if (call.name === "ScheduleWakeup") {
      if (input.stop === true) {
        wakeDeadlineMs = null;
        continue;
      }
      const requested =
        typeof input.delaySeconds === "number" ? input.delaySeconds : WAKE_MAX_SECONDS;
      const seconds = Math.min(WAKE_MAX_SECONDS, Math.max(WAKE_MIN_SECONDS, requested));
      wakeDeadlineMs = nowMs + seconds * 1000 + WAKE_GRACE_MS;
    } else if (call.name === "CronCreate") {
      crons.set(call.id, nowMs);
    } else {
      // CronDelete names the job id, which only the tool result carries, so the
      // oldest job goes. Over-holding a session is the safe side.
      const oldest = crons.keys().next();
      if (!oldest.done) crons.delete(oldest.value);
    }
  }
  return { wakeDeadlineMs, crons, seen };
}

export function hasPendingClaudeSchedule(state: ClaudeScheduledWork, nowMs: number): boolean {
  if (state.wakeDeadlineMs !== null && nowMs < state.wakeDeadlineMs) return true;
  for (const createdAtMs of state.crons.values()) {
    if (nowMs - createdAtMs < CRON_LIFETIME_MS) return true;
  }
  return false;
}
