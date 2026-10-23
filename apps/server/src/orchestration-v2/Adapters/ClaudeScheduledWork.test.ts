import { describe, expect, it } from "@effect/vitest";

import {
  applyClaudeScheduleCalls,
  EMPTY_CLAUDE_SCHEDULED_WORK,
  hasPendingClaudeSchedule,
} from "./ClaudeScheduledWork.ts";

const MINUTE = 60 * 1000;

describe("Claude scheduled work", () => {
  it("holds a session through a loop's wakeup, until the wake turn can begin", () => {
    const state = applyClaudeScheduleCalls(
      EMPTY_CLAUDE_SCHEDULED_WORK,
      [{ id: "wake-1", name: "ScheduleWakeup", input: { delaySeconds: 1800, prompt: "/loop" } }],
      0,
    );
    expect(hasPendingClaudeSchedule(state, 34 * MINUTE)).toBe(true);
    expect(hasPendingClaudeSchedule(state, 36 * MINUTE)).toBe(false);
  });

  it("clamps the delay as the runtime does and lets stop end the loop", () => {
    const short = applyClaudeScheduleCalls(
      EMPTY_CLAUDE_SCHEDULED_WORK,
      [{ id: "wake-1", name: "ScheduleWakeup", input: { delaySeconds: 5 } }],
      0,
    );
    expect(short.wakeDeadlineMs).toBe(6 * MINUTE);
    const stopped = applyClaudeScheduleCalls(
      short,
      [{ id: "wake-2", name: "ScheduleWakeup", input: { stop: true } }],
      MINUTE,
    );
    expect(hasPendingClaudeSchedule(stopped, MINUTE)).toBe(false);
  });

  it("holds a session while a cron job lives, and ignores replayed calls", () => {
    const created = applyClaudeScheduleCalls(
      EMPTY_CLAUDE_SCHEDULED_WORK,
      [{ id: "cron-1", name: "CronCreate", input: { cron: "*/5 * * * *", prompt: "check" } }],
      0,
    );
    expect(hasPendingClaudeSchedule(created, 60 * MINUTE)).toBe(true);
    const replayed = applyClaudeScheduleCalls(
      created,
      [{ id: "cron-1", name: "CronCreate", input: {} }],
      MINUTE,
    );
    expect(replayed).toBe(created);
    const deleted = applyClaudeScheduleCalls(
      created,
      [{ id: "del-1", name: "CronDelete", input: { id: "job" } }],
      MINUTE,
    );
    expect(hasPendingClaudeSchedule(deleted, MINUTE)).toBe(false);
  });

  it("lets a cron job lapse after Claude's seven-day expiry", () => {
    const created = applyClaudeScheduleCalls(
      EMPTY_CLAUDE_SCHEDULED_WORK,
      [{ id: "cron-1", name: "CronCreate", input: {} }],
      0,
    );
    expect(hasPendingClaudeSchedule(created, 7 * 24 * 60 * MINUTE)).toBe(false);
  });
});
