import {
  OrchestratorMcpCapabilitiesResult,
  OrchestratorMcpCreateThreadsInput,
  OrchestratorMcpCreateThreadsResult,
  OrchestratorMcpDelegateTaskInput,
  OrchestratorMcpDelegateTaskResult,
  OrchestratorMcpDeleteScheduledTaskInput,
  OrchestratorMcpDeleteScheduledTaskResult,
  OrchestratorMcpRequestSecretInput,
  OrchestratorMcpRequestSecretResult,
  OrchestratorMcpFailure,
  OrchestratorMcpListScheduledTasksInput,
  OrchestratorMcpListScheduledTasksResult,
  OrchestratorMcpSaveScheduledTaskInput,
  OrchestratorMcpScheduleTaskResult,
  OrchestratorMcpTaskCancelInput,
  OrchestratorMcpTaskCancelResult,
  OrchestratorMcpTaskStatusInput,
  OrchestratorMcpThreadInterruptInput,
  OrchestratorMcpThreadInterruptResult,
  OrchestratorMcpGroupSiblingsResult,
  OrchestratorMcpLooseEndAddInput,
  OrchestratorMcpLooseEndCloseInput,
  OrchestratorMcpLooseEndIdResult,
  OrchestratorMcpLooseEndListResult,
  OrchestratorMcpTerminalChatReadInput,
  OrchestratorMcpTerminalChatReadResult,
  OrchestratorMcpTerminalChatsInput,
  OrchestratorMcpTerminalChatsResult,
  OrchestratorMcpThreadListInput,
  OrchestratorMcpThreadListResult,
  OrchestratorMcpThreadReadInput,
  OrchestratorMcpThreadReadResult,
  OrchestratorMcpThreadSendInput,
  OrchestratorMcpThreadSendResult,
  OrchestratorMcpThreadWaitInput,
  OrchestratorMcpThreadWaitResult,
  ThreadMetadataMcpUpdateInput,
  ThreadMetadataMcpUpdateResult,
} from "@control/contracts";
import { Tool, Toolkit } from "effect/ai";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import * as ControlLock from "../../../lock/ControlLock.ts";
import * as ThreadManagementService from "../../../orchestration-v2/ThreadManagementService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as OrchestratorMcpService from "../../OrchestratorMcpService.ts";
import * as ThreadMetadataMcpService from "../../ThreadMetadataMcpService.ts";

const dependencies = [
  McpInvocationContext.McpInvocationContext,
  ThreadManagementService.ThreadManagementService,
  OrchestratorMcpService.OrchestratorMcpService,
];
const threadMetadataDependencies = [
  McpInvocationContext.McpInvocationContext,
  ThreadManagementService.ThreadManagementService,
  ThreadMetadataMcpService.ThreadMetadataMcpService,
];

const OrchestratorCapabilitiesTool = Tool.make("orchestrator_capabilities", {
  description:
    "List providers, models (custom ones included), options and runtime modes for `delegate_task`, from the composer's live catalog.",
  success: OrchestratorMcpCapabilitiesResult,
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies,
})
  .annotate(Tool.Title, "Get orchestration capabilities")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

export const DelegateTaskTool = Tool.make("delegate_task", {
  description:
    "Needs a Control thread. Start one child agent of this thread with only `task`: no parent history. Use it for another provider, a model your native tool lacks, or a Control-owned child. Provider, model, options and modes inherit unless `target` overrides them; a requested `runtimeMode` must be one the provider lists in `orchestrator_capabilities`, and an inherited one steps down to its broadest. Each review round is a new call with a new `clientRequestId`, never `thread_send` to `childThreadId`. `isolation:'worktree'` gives the child its own checkout from your last commit, set up before it starts; uncommitted edits stay behind. Prefer `mode:'async'`: completion wakes this thread, so end your turn instead of polling. With `mode:'wait'`, `timeoutMs` only bounds the wait and does not cancel the child; on `waitTimedOut`, keep the `taskId` for `task_status`.",
  parameters: OrchestratorMcpDelegateTaskInput,
  success: OrchestratorMcpDelegateTaskResult,
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies,
})
  .annotate(Tool.Title, "Delegate a child task")
  .annotate(Tool.Destructive, true)
  .annotate(Tool.OpenWorld, true);

const TaskStatusTool = Tool.make("task_status", {
  description:
    "Needs a Control thread. Read one delegated task you started. `workState`: working, waiting_for_children or result_available; a finished turn with live child work is not done. `summary` is the final result, errors included. `hasPendingChildRuns`: later turns in its child thread, which `task_cancel` also stops. Reading a finished result marks it delivered.",
  parameters: OrchestratorMcpTaskStatusInput,
  success: OrchestratorMcpDelegateTaskResult,
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies,
})
  .annotate(Tool.Title, "Get delegated task status")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

const TaskCancelTool = Tool.make("task_cancel", {
  description:
    "Needs a Control thread. Stop one delegated task like a user Stop: interrupts its turn, holds its queued turns, ends its PR watches and stops its delegates, including later runs in its child thread. A finished task keeps its result.",
  parameters: OrchestratorMcpTaskCancelInput,
  success: OrchestratorMcpTaskCancelResult,
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies,
})
  .annotate(Tool.Title, "Cancel delegated task")
  .annotate(Tool.Destructive, true);

export const ScheduleTaskTool = Tool.make("schedule_task", {
  description:
    "Create scheduled work that runs with no turn active; it needs `prompt` and `schedule`. With `scheduledTaskId`, update that task instead: only given fields change, `enabled=false` pauses it. `schedule` is an object, not text: {type:'interval',everyMs:3600000}, {type:'fixed_time',timeOfDay:'09:00',weekdays:[1,2,3,4,5]}, or {type:'webhook'}. A webhook run sees the request only through prompt placeholders: {{body.path}}, {{headers.name}}, {{query.name}}, {{body}}, {{request}}. For a sender that signs requests, get a `secretRef` from `request_secret` and set `signature`, e.g. GitHub: {header:'x-hub-signature-256',encoding:'hex',prefix:'sha256=',secretRef}. Report the returned `nextRunAt` or `webhookUrl`; no `webhookUrl` means Control Connect remote access is off. Omit `projectId` for this thread's project, where runs post into this thread unless `bindToCurrentThread=false`; elsewhere each run gets a fresh thread. Settings inherit from this thread, or the project default.",
  parameters: OrchestratorMcpSaveScheduledTaskInput,
  success: OrchestratorMcpScheduleTaskResult,
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies,
})
  .annotate(Tool.Title, "Schedule a recurring task")
  .annotate(Tool.Destructive, true)
  .annotate(Tool.OpenWorld, true);

const ListScheduledTasksTool = Tool.make("list_scheduled_tasks", {
  parameters: OrchestratorMcpListScheduledTasksInput,
  description:
    "List scheduled tasks. Omit `projectId` for this thread's project (every project outside a thread). Pass a `scheduledTaskId` to schedule_task or delete_scheduled_task.",
  success: OrchestratorMcpListScheduledTasksResult,
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies,
})
  .annotate(Tool.Title, "List scheduled tasks")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

const DeleteScheduledTaskTool = Tool.make("delete_scheduled_task", {
  description:
    "Delete one scheduled task by `scheduledTaskId`. It stops at once. To pause instead, use schedule_task with `enabled=false`.",
  parameters: OrchestratorMcpDeleteScheduledTaskInput,
  success: OrchestratorMcpDeleteScheduledTaskResult,
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies,
})
  .annotate(Tool.Title, "Delete a scheduled task")
  .annotate(Tool.Destructive, true);

const RequestSecretTool = Tool.make("request_secret", {
  description:
    "Ask the user for a secret (token, API key, signing secret, password) on a private card in this thread, and wait. The value never reaches you or the transcript. A saved answer returns a `secretRef` for a tool that takes one, such as schedule_task's `signature.secretRef`; it works once. Never ask in chat or invent one.",
  parameters: OrchestratorMcpRequestSecretInput,
  success: OrchestratorMcpRequestSecretResult,
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies,
})
  .annotate(Tool.Title, "Request a secret from the user")
  .annotate(Tool.Destructive, false);

export const CreateThreadsTool = Tool.make("create_threads", {
  description:
    "Needs a Control thread. Create new top-level threads sharing this checkout, only when the user asks for them. This is not delegation: for subagents use `delegate_task` or your native tool. One thread, or its own worktree: `thread_launch`. Each entry may override provider, model, options and modes; project, branch and worktree always inherit.",
  parameters: OrchestratorMcpCreateThreadsInput,
  success: OrchestratorMcpCreateThreadsResult,
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies,
})
  .annotate(Tool.Title, "Create Control threads")
  .annotate(Tool.Destructive, true)
  .annotate(Tool.OpenWorld, true);

const ThreadListTool = Tool.make("thread_list", {
  description:
    "List threads in a project, newest first. Omit `projectId` for yours. Filter by run status, title, settled (moved out of the active list) or snoozed; page with the cursor. A snoozed thread wakes early when it asks for something, fails or completes. `pullRequests` lists every linked PR; `linkedPullRequest` is a legacy single link. Link a thread as `[title](control-thread://v1/<threadId>)`, id unencoded.",
  parameters: OrchestratorMcpThreadListInput,
  success: OrchestratorMcpThreadListResult,
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies,
})
  .annotate(Tool.Title, "List Control threads")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

const GroupSiblingsTool = Tool.make("group_siblings", {
  description:
    "List the other threads in this thread's Control group, across folders: state, branch, worktree and the files their checkpoints changed. Use it to avoid editing what a sibling edits. To tell one something, `thread_send` with mode='queue'. Empty outside a group.",
  success: OrchestratorMcpGroupSiblingsResult,
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies,
})
  .annotate(Tool.Title, "List group siblings")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

const LooseEndAddTool = Tool.make("loose_end_add", {
  description:
    "File a loose end in this thread: something you handed the user to do, or a question you are waiting on them to answer. It stays until they tick it done or dismiss it, or you call loose_end_close. Nothing notifies them; the thread's open count is the only signal. Not for your own todo list, unsent text, or a question you can ask now. Returns the id.",
  parameters: OrchestratorMcpLooseEndAddInput,
  success: OrchestratorMcpLooseEndIdResult,
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies,
})
  .annotate(Tool.Title, "File a loose end")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, false);

const LooseEndListTool = Tool.make("loose_end_list", {
  description: "List this thread's loose ends, open and closed, oldest first.",
  success: OrchestratorMcpLooseEndListResult,
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies,
})
  .annotate(Tool.Title, "List loose ends")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

const LooseEndCloseTool = Tool.make("loose_end_close", {
  description:
    "Close one of this thread's open loose ends once you can see it is done. The user can reopen it.",
  parameters: OrchestratorMcpLooseEndCloseInput,
  success: OrchestratorMcpLooseEndIdResult,
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies,
})
  .annotate(Tool.Title, "Close a loose end")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, false);

const terminalChatDependencies = [...dependencies, FileSystem.FileSystem, Path.Path];

const TerminalChatsTool = Tool.make("terminal_chats", {
  description:
    "List the owner's terminal Claude Code chats in this thread's project folder (or `projectId`'s), newest first. Read only. Chats Control runs or has imported are not listed. Read one with terminal_chat_read.",
  parameters: OrchestratorMcpTerminalChatsInput,
  success: OrchestratorMcpTerminalChatsResult,
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies: terminalChatDependencies,
})
  .annotate(Tool.Title, "List terminal chats")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

const TerminalChatReadTool = Tool.make("terminal_chat_read", {
  description:
    "Read the latest user and assistant messages of one chat from terminal_chats, oldest first. Tool calls are left out; long messages are cut at 4,000 characters. Read only.",
  parameters: OrchestratorMcpTerminalChatReadInput,
  success: OrchestratorMcpTerminalChatReadResult,
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies: terminalChatDependencies,
})
  .annotate(Tool.Title, "Read terminal chat")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

const ThreadReadTool = Tool.make("thread_read", {
  description:
    "Read any thread by id. `messages` (default): user and assistant messages and plans; `activity`: every timeline item. Page with `afterPosition=nextPosition`. Cut-off text: `itemId` with `textOffset=nextTextOffset` until it is null (UTF-16 offsets). Reading an untruncated final result of your direct child marks it delivered. `pullRequests` lists every linked PR; `linkedPullRequest` is a legacy single link. Link a thread as `[title](control-thread://v1/<threadId>)`, id unencoded.",
  parameters: OrchestratorMcpThreadReadInput,
  success: OrchestratorMcpThreadReadResult,
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies,
})
  .annotate(Tool.Title, "Read a Control thread")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

export const ThreadUpdateTool = Tool.make("thread_update", {
  description:
    "Rename a thread (`action:'rename'` with `title`) or regenerate its title. Omit `threadId` for this thread. Workspace and branch changes are not supported here. `clientRequestId` makes retries safe.",
  parameters: ThreadMetadataMcpUpdateInput,
  success: ThreadMetadataMcpUpdateResult,
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies: threadMetadataDependencies,
})
  .annotate(Tool.Title, "Update Control thread metadata")
  .annotate(Tool.Destructive, true)
  .annotate(Tool.Idempotent, false);

const ThreadSendTool = Tool.make("thread_send", {
  description:
    "Send a message to any thread. The target cannot run with broader modes than yours. `mode:'auto'` starts an idle thread, steers a running turn, or queues. `queue`: a new turn. `steer`: a mid-turn update. `restart`: interrupt and restart. Do not use a delegated task's childThreadId to start another review round: use `delegate_task`. A send does not reopen a finished task. `clientRequestId` makes retries safe.",
  parameters: OrchestratorMcpThreadSendInput,
  success: OrchestratorMcpThreadSendResult,
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies: [...dependencies, ControlLock.ControlLock],
})
  .annotate(Tool.Title, "Send to a Control thread")
  .annotate(Tool.Destructive, true)
  .annotate(Tool.OpenWorld, true);

const ThreadWaitTool = Tool.make("thread_wait", {
  description:
    "Wait for a thread's run to finish. No `runId`: the latest at call time; an idle thread returns at once. A timeout does not interrupt the work: call again, or read the thread. Waiting does not mark a delegated result delivered.",
  parameters: OrchestratorMcpThreadWaitInput,
  success: OrchestratorMcpThreadWaitResult,
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies,
})
  .annotate(Tool.Title, "Wait for a Control thread")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

const ThreadInterruptTool = Tool.make("thread_interrupt", {
  description:
    "Interrupt a running turn in any thread. No `runId`: the newest interruptible run. No effect when idle. `clientRequestId` makes retries safe.",
  parameters: OrchestratorMcpThreadInterruptInput,
  success: OrchestratorMcpThreadInterruptResult,
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies,
})
  .annotate(Tool.Title, "Interrupt a Control thread")
  .annotate(Tool.Destructive, true);

export const OrchestratorToolkit = Toolkit.make(
  OrchestratorCapabilitiesTool,
  DelegateTaskTool,
  TaskStatusTool,
  TaskCancelTool,
  ScheduleTaskTool,
  ListScheduledTasksTool,
  DeleteScheduledTaskTool,
  RequestSecretTool,
  CreateThreadsTool,
  ThreadListTool,
  GroupSiblingsTool,
  LooseEndAddTool,
  LooseEndListTool,
  LooseEndCloseTool,
  TerminalChatsTool,
  TerminalChatReadTool,
  ThreadReadTool,
  ThreadUpdateTool,
  ThreadSendTool,
  ThreadWaitTool,
  ThreadInterruptTool,
);
