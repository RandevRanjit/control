import {
  ScheduledTaskId,
  ScheduledTask,
  OrchestrationSearchThreadsInput,
  OrchestrationSearchThreadsResult,
  OrchestrationV2ThreadForkSourcePoint,
  OrchestrationV2ContextTransfer,
  TrimmedNonEmptyString,
  ModelSelection,
  RuntimeMode,
  ProviderInteractionMode,
  RuntimeRequestId,
  ProviderUserInputAnswers,
  IsoDateTime,
  OrchestratorMcpFailure,
  OrchestrationV2DispatchCommandResult,
  ThreadId,
  RunId,
  NonNegativeInt,
  ProjectId,
} from "@control/contracts";
import * as Crypto from "effect/Crypto";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/ai";

import * as ThreadSearch from "../../../orchestration-v2/ThreadSearch.ts";
import * as ScheduledTaskService from "../../../scheduledTasks/ScheduledTaskService.ts";
import * as ControlLock from "../../../lock/ControlLock.ts";
import * as ThreadManagementService from "../../../orchestration-v2/ThreadManagementService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";

const ThreadOrganizeTool = Tool.make("thread_organize", {
  description:
    "Pin, snooze, settle, archive, or mark a thread unread. Omit `threadId` for this thread. snooze needs `snoozedUntil`. Settling this thread takes effect when your turn completes (`settlesWhenTurnEnds=true`); a failed or interrupted turn, or a queued message, leaves it active.",
  parameters: Schema.Struct({
    threadId: Schema.optional(ThreadId),
    action: Schema.Literals([
      "pin",
      "unpin",
      "snooze",
      "unsnooze",
      "settle",
      "unsettle",
      "archive",
      "unarchive",
      "mark_unread",
    ]),
    snoozedUntil: Schema.optional(IsoDateTime),
  }),
  success: Schema.Union([
    OrchestrationV2DispatchCommandResult,
    Schema.Struct({ settlesWhenTurnEnds: Schema.Literal(true) }),
  ]),
  failure: OrchestratorMcpFailure,
  failureMode: "return" as const,
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagementService.ThreadManagementService,
    Crypto.Crypto,
  ],
})
  .annotate(Tool.Title, "Organize a thread")
  .annotate(Tool.Destructive, true);

const queueTarget = { threadId: Schema.optional(ThreadId), queuedRunId: RunId };
const commandTool = {
  success: OrchestrationV2DispatchCommandResult,
  failure: OrchestratorMcpFailure,
  failureMode: "return" as const,
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagementService.ThreadManagementService,
    Crypto.Crypto,
  ],
};
const queueEntry = Schema.Struct({
  queuedRunId: RunId,
  text: Schema.String,
  truncated: Schema.Boolean,
});
const QueueListTool = Tool.make("queue_list", {
  ...commandTool,
  description: "List queued messages in send order. For full history, use `thread_read`.",
  parameters: Schema.Struct({
    threadId: Schema.optional(ThreadId),
    cursor: Schema.optional(NonNegativeInt),
    limit: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 }))),
  }),
  success: Schema.Struct({
    items: Schema.Array(queueEntry),
    nextCursor: Schema.NullOr(NonNegativeInt),
  }),
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false);
const QueueReadTool = Tool.make("queue_read", {
  ...commandTool,
  description:
    "Read up to 16,000 characters of one queued message. Omit `threadId` for this thread.",
  parameters: Schema.Struct(queueTarget),
  success: queueEntry,
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false);
const QueueEditTool = Tool.make("queue_edit", {
  ...commandTool,
  description:
    "Replace one queued message's text. Attachments stay. Fails if the run is no longer queued.",
  parameters: Schema.Struct({
    ...queueTarget,
    text: Schema.String.check(Schema.isMaxLength(100000)),
  }),
}).annotate(Tool.Destructive, true);
const QueueCancelTool = Tool.make("queue_cancel", {
  ...commandTool,
  description: "Cancel one queued run.",
  parameters: Schema.Struct(queueTarget),
}).annotate(Tool.Destructive, true);
const QueueReorderTool = Tool.make("queue_reorder", {
  ...commandTool,
  description: "Move one queued run before another, or to the end with `beforeRunId=null`.",
  parameters: Schema.Struct({ ...queueTarget, beforeRunId: Schema.NullOr(RunId) }),
}).annotate(Tool.Destructive, true);
const QueuePromoteTool = Tool.make("queue_promote_to_steer", {
  ...commandTool,
  dependencies: [...commandTool.dependencies, ControlLock.ControlLock],
  description: "Send one queued message now as steering to the given active run.",
  parameters: Schema.Struct({ ...queueTarget, targetRunId: RunId }),
}).annotate(Tool.Destructive, true);

const requestTarget = { threadId: Schema.optional(ThreadId), requestId: RuntimeRequestId };
const question = Schema.Struct({
  id: Schema.String,
  header: Schema.String,
  question: Schema.String,
  options: Schema.Array(
    Schema.Struct({
      label: Schema.String,
      description: Schema.String,
      value: Schema.optional(Schema.String),
    }),
  ),
  multiSelect: Schema.optional(Schema.Boolean),
  allowCustomAnswer: Schema.optional(Schema.Boolean),
  required: Schema.optional(Schema.Boolean),
});
const pendingRequest = Schema.Struct({
  requestId: RuntimeRequestId,
  questions: Schema.Array(question),
});
const PendingRequestListTool = Tool.make("pending_request_list", {
  ...commandTool,
  description:
    "List pending user questions in a thread. Omit `threadId` for this thread. Approvals are not listed.",
  parameters: Schema.Struct({ threadId: Schema.optional(ThreadId) }),
  success: Schema.Struct({ requestIds: Schema.Array(RuntimeRequestId) }),
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false);
const PendingRequestReadTool = Tool.make("pending_request_read", {
  ...commandTool,
  description: "Read one pending user question. Answer it with `pending_request_respond`.",
  parameters: Schema.Struct(requestTarget),
  success: pendingRequest,
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false);
const PendingRequestRespondTool = Tool.make("pending_request_respond", {
  ...commandTool,
  description: "Answer one pending user question. This cannot approve a permission request.",
  parameters: Schema.Struct({ ...requestTarget, answers: ProviderUserInputAnswers }),
})
  .annotate(Tool.Destructive, true)
  .annotate(Tool.OpenWorld, true);

const ThreadConfigurationTool = Tool.make("thread_configuration", {
  ...commandTool,
  description: "Read a thread's provider, model and modes. Omit `threadId` for this thread.",
  parameters: Schema.Struct({ threadId: Schema.optional(ThreadId) }),
  success: Schema.Struct({
    threadId: ThreadId,
    modelSelection: ModelSelection,
    runtimeMode: RuntimeMode,
    interactionMode: ProviderInteractionMode,
  }),
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false);
const ThreadConfigureTool = Tool.make("thread_configure", {
  ...commandTool,
  description:
    "Set a thread's provider, model and options. Omit `threadId` for this thread. Permission modes stay. Values from `orchestrator_capabilities`.",
  parameters: Schema.Struct({
    threadId: Schema.optional(ThreadId),
    modelSelection: ModelSelection,
  }),
}).annotate(Tool.Destructive, true);

const transferResult = Schema.Struct({ sequence: NonNegativeInt, targetThreadId: ThreadId });
const ThreadForkTool = Tool.make("thread_fork", {
  ...commandTool,
  description:
    "Fork a thread from a stable run or checkpoint. Omit `threadId` for this thread. Keeps the source setup. No turn has run yet.",
  parameters: Schema.Struct({
    threadId: Schema.optional(ThreadId),
    sourcePoint: OrchestrationV2ThreadForkSourcePoint,
    title: Schema.optional(TrimmedNonEmptyString),
  }),
  success: transferResult,
}).annotate(Tool.Destructive, true);
const ThreadMergeBackTool = Tool.make("thread_merge_back", {
  ...commandTool,
  description:
    "Merge context from one thread into a related thread in the same project. Omit `sourceThreadId` for this thread.",
  parameters: Schema.Struct({
    sourceThreadId: Schema.optional(ThreadId),
    targetThreadId: ThreadId,
    sourcePoint: OrchestrationV2ThreadForkSourcePoint,
  }),
  success: transferResult,
}).annotate(Tool.Destructive, true);
const ThreadTransfersTool = Tool.make("thread_transfers", {
  ...commandTool,
  description: "Read a thread's context transfers. Omit `threadId` for this thread.",
  parameters: Schema.Struct({ threadId: Schema.optional(ThreadId) }),
  success: Schema.Struct({
    transfers: Schema.Array(
      Schema.Struct({
        id: OrchestrationV2ContextTransfer.fields.id,
        sourceThreadId: OrchestrationV2ContextTransfer.fields.sourceThreadId,
        targetThreadId: OrchestrationV2ContextTransfer.fields.targetThreadId,
        status: OrchestrationV2ContextTransfer.fields.status,
      }),
    ),
  }),
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false);

const ThreadSearchTool = Tool.make("thread_search", {
  ...commandTool,
  description:
    "Search active thread titles and content. Matches come from one project (`projectId`, else yours; outside a thread, every project) among the global top matches, so you may get fewer than `limit`. Not exhaustive; no pages.",
  parameters: Schema.Struct({
    ...OrchestrationSearchThreadsInput.fields,
    projectId: Schema.optional(ProjectId),
  }),
  success: OrchestrationSearchThreadsResult,
  dependencies: [...commandTool.dependencies, ThreadSearch.ThreadSearch],
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false);

const ScheduledTaskRunTool = Tool.make("run_scheduled_task_now", {
  ...commandTool,
  description:
    "Run a scheduled task now. Needs a full-access/default caller. Each call is a new manual run; success means it was dispatched, not that its turn finished.",
  parameters: Schema.Struct({ taskId: ScheduledTaskId }),
  success: Schema.Struct({
    taskId: ScheduledTaskId,
    threadId: ScheduledTask.fields.threadId,
    lastRunStatus: ScheduledTask.fields.lastRunStatus,
    runCount: NonNegativeInt,
    nextRunAt: ScheduledTask.fields.nextRunAt,
  }),
  dependencies: [...commandTool.dependencies, ScheduledTaskService.ScheduledTaskService],
})
  .annotate(Tool.Destructive, true)
  .annotate(Tool.OpenWorld, true);

export const ThreadToolkit = Toolkit.make(
  ScheduledTaskRunTool,
  ThreadSearchTool,
  ThreadForkTool,
  ThreadMergeBackTool,
  ThreadTransfersTool,
  ThreadConfigurationTool,
  ThreadConfigureTool,
  PendingRequestListTool,
  PendingRequestReadTool,
  PendingRequestRespondTool,
  ThreadOrganizeTool,
  QueueListTool,
  QueueReadTool,
  QueueEditTool,
  QueueCancelTool,
  QueueReorderTool,
  QueuePromoteTool,
);
