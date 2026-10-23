import { RunAttemptId, RunId } from "@control/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import { formatTurnTotals, turnTotalsByRun } from "./turnTotals";

const at = (iso: string) => DateTime.makeUnsafe(iso);
const usage = (inputTokens: number, outputTokens: number, cachedInputTokens: number) => ({
  usageScope: "main_agent" as const,
  usageStatus: "complete" as const,
  hasSubagents: false,
  inputTokens,
  outputTokens,
  cachedInputTokens,
});

describe("turnTotalsByRun", () => {
  it("sums a run's provider turns across its attempts, leaving out cache reads", () => {
    const run = RunId.make("run-1");
    const totals = turnTotalsByRun(
      {
        runs: [
          {
            id: run,
            startedAt: at("2026-10-09T10:00:00.000Z"),
            completedAt: at("2026-10-09T10:00:18.000Z"),
          },
        ],
        attempts: [
          { id: RunAttemptId.make("attempt-1"), runId: run },
          { id: RunAttemptId.make("attempt-2"), runId: run },
        ],
        providerTurns: [
          {
            runAttemptId: RunAttemptId.make("attempt-1"),
            turnTokenUsage: usage(51_000, 400, 50_000),
          },
          { runAttemptId: RunAttemptId.make("attempt-2"), turnTokenUsage: usage(1_100, 240, 0) },
          { runAttemptId: null, turnTokenUsage: usage(9_000, 9_000, 0) },
        ],
      },
      [],
    );
    expect(totals.get(run)).toEqual({
      durationMs: 18_000,
      inputTokens: 2_100,
      outputTokens: 640,
      filesChanged: 0,
    });
    expect(formatTurnTotals(totals.get(run)!)).toBe("18s · ↑ 2.1k · ↓ 640 · no changes");
  });

  it("leaves out what a running turn does not know yet and counts changed files", () => {
    const run = RunId.make("run-2");
    const totals = turnTotalsByRun(
      {
        runs: [{ id: run, startedAt: at("2026-10-09T10:00:00.000Z"), completedAt: null }],
        attempts: [],
        providerTurns: [],
      },
      [{ runId: run, files: ["lib/release.ts", "app/admin/page.tsx"] }],
    );
    expect(formatTurnTotals(totals.get(run)!)).toBe("2 files changed");
  });
});
