import type {
  OrchestrationV2ProviderTurn,
  OrchestrationV2Run,
  OrchestrationV2RunAttempt,
  RunId,
} from "@control/contracts";
import { formatDuration } from "@control/shared/orchestrationTiming";
import * as DateTime from "effect/DateTime";

import { formatContextWindowTokens } from "../../lib/contextWindow";

/** What a finished turn's totals line says (design v1 §4.3). */
export interface TurnTotals {
  readonly durationMs: number | null;
  /** Input the turn sent fresh: everything but prompt-cache reads. */
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly filesChanged: number;
}

export function turnTotalsByRun(
  projection: {
    readonly runs: ReadonlyArray<Pick<OrchestrationV2Run, "id" | "startedAt" | "completedAt">>;
    readonly attempts: ReadonlyArray<Pick<OrchestrationV2RunAttempt, "id" | "runId">>;
    readonly providerTurns: ReadonlyArray<
      Pick<OrchestrationV2ProviderTurn, "runAttemptId" | "turnTokenUsage">
    >;
  },
  diffs: ReadonlyArray<{ readonly runId: RunId; readonly files: ReadonlyArray<unknown> }>,
): ReadonlyMap<RunId, TurnTotals> {
  const runByAttempt = new Map(projection.attempts.map((attempt) => [attempt.id, attempt.runId]));
  const tokens = new Map<RunId, { input: number; output: number }>();
  for (const turn of projection.providerTurns) {
    const runId = turn.runAttemptId === null ? undefined : runByAttempt.get(turn.runAttemptId);
    const usage = turn.turnTokenUsage;
    if (runId === undefined || usage?.inputTokens === undefined) continue;
    if (usage.outputTokens === undefined) continue;
    const sum = tokens.get(runId) ?? { input: 0, output: 0 };
    sum.input += usage.inputTokens - (usage.cachedInputTokens ?? 0);
    sum.output += usage.outputTokens;
    tokens.set(runId, sum);
  }
  const filesByRun = new Map(diffs.map((diff) => [diff.runId, diff.files.length]));
  return new Map(
    projection.runs.map((run) => [
      run.id,
      {
        durationMs:
          run.startedAt === null || run.completedAt === null
            ? null
            : DateTime.toEpochMillis(run.completedAt) - DateTime.toEpochMillis(run.startedAt),
        inputTokens: tokens.get(run.id)?.input ?? null,
        outputTokens: tokens.get(run.id)?.output ?? null,
        filesChanged: filesByRun.get(run.id) ?? 0,
      },
    ]),
  );
}

/** `18s · ↑ 2.1k · ↓ 640 · no changes`; a part the turn has no data for is left out. */
export function formatTurnTotals(totals: TurnTotals): string {
  return [
    totals.durationMs === null ? null : formatDuration(totals.durationMs),
    totals.inputTokens === null ? null : `↑ ${formatContextWindowTokens(totals.inputTokens)}`,
    totals.outputTokens === null ? null : `↓ ${formatContextWindowTokens(totals.outputTokens)}`,
    totals.filesChanged === 0
      ? "no changes"
      : `${totals.filesChanged} ${totals.filesChanged === 1 ? "file" : "files"} changed`,
  ]
    .filter((part) => part !== null)
    .join(" · ");
}
