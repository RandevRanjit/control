import { deriveThreadCheckpointSummaries } from "@control/client-runtime/state/thread-checkpoints";
import type { OrchestrationV2ThreadProjection } from "@control/contracts";
import { inferCheckpointTurnCountByRunId } from "../session-logic";
import type { TurnDiffSummary } from "../types";

export function useTurnDiffSummaries(projection: OrchestrationV2ThreadProjection | null) {
  // No hook calls here, so the compiler only memoizes it when asked.
  "use memo";
  const turnDiffSummaries: ReadonlyArray<TurnDiffSummary> =
    projection === null ? [] : deriveThreadCheckpointSummaries(projection);
  const inferredCheckpointTurnCountByRunId = inferCheckpointTurnCountByRunId(turnDiffSummaries);

  return { turnDiffSummaries, inferredCheckpointTurnCountByRunId };
}
