import {
  ProjectId,
  ProviderInstanceId,
  RunId,
  ThreadId,
  type OrchestrationV2ThreadShell,
} from "@control/contracts";
import type * as DateTime from "effect/DateTime";

/** An idle top-level Claude chat whose last run completed; overrides set the state under test. */
export function threadShell(
  id: string,
  now: DateTime.Utc,
  overrides: Partial<OrchestrationV2ThreadShell> = {},
): OrchestrationV2ThreadShell {
  const threadId = ThreadId.make(id);
  const claude = ProviderInstanceId.make("claudeAgent");
  return {
    id: threadId,
    projectId: ProjectId.make("project:test"),
    title: id,
    providerInstanceId: claude,
    modelSelection: { instanceId: claude, model: "claude-opus-5-5" },
    runtimeMode: "full-access",
    interactionMode: "default",
    createdBy: "user",
    creationSource: "web",
    branch: null,
    worktreePath: null,
    lineage: { rootThreadId: threadId, parentThreadId: null, relationshipToParent: null },
    forkedFrom: null,
    activeProviderThreadId: null,
    latestRunId: RunId.make(`run:${id}`),
    activeRunId: null,
    status: "completed",
    pendingRuntimeRequest: null,
    latestVisibleMessage: null,
    latestUserMessageAt: now,
    hasActionableProposedPlan: false,
    itemCount: 1,
    visibleItemCount: 1,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    lastVisitedAt: null,
    pinnedAt: null,
    deletedAt: null,
    ...overrides,
  };
}
