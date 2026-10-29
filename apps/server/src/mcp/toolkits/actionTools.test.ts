import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { expect, it } from "@effect/vitest";
import {
  EnvironmentId,
  ProviderInstanceId,
  RunId,
  ThreadId,
  type OrchestrationV2ThreadShell,
} from "@control/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { McpSchema, McpServer } from "effect/ai";

import * as ControlLock from "../../lock/ControlLock.ts";
import * as ThreadManagement from "../../orchestration-v2/ThreadManagementService.ts";
import * as ThreadLaunchService from "../../orchestration-v2/ThreadLaunchService.ts";
import * as GitVcsDriver from "../../vcs/GitVcsDriver.ts";
import * as ProviderAdapterRegistry from "../../orchestration-v2/ProviderAdapterRegistry.ts";
import * as ProjectService from "../../project/ProjectService.ts";
import * as ProviderRegistry from "../../provider/ProviderRegistry.ts";
import * as ScheduledTaskService from "../../scheduledTasks/ScheduledTaskService.ts";
import * as SecretRequests from "../../secrets/SecretRequests.ts";
import * as McpHttpServer from "../McpHttpServer.ts";
import * as McpInvocationContext from "../McpInvocationContext.ts";
import { idleThreadProjection, liveThreadShell } from "../McpToolAccess.testkit.ts";

// Each merged action keeps the access rule of the tool it replaced: reads stay
// open, writes refuse read-only clients and threads above the caller's modes,
// steering a queued message is refused in a locked group, and answering a
// question never approves a permission.

const supervisedId = ThreadId.make("thread:supervised");
const fullAccessId = ThreadId.make("thread:full-access");
const lockedId = ThreadId.make("thread:locked");
const queuedRunId = RunId.make("run:queued");
const activeRunId = RunId.make("run:active");

const shells = new Map<ThreadId, OrchestrationV2ThreadShell>([
  [supervisedId, liveThreadShell(supervisedId, { runtimeMode: "approval-required" })],
  [fullAccessId, liveThreadShell(fullAccessId)],
  [lockedId, liveThreadShell(lockedId, { runtimeMode: "approval-required" })],
]);

const projection = (shell: OrchestrationV2ThreadShell) => {
  const idle = idleThreadProjection(shell);
  return {
    ...idle,
    runs: [{ id: queuedRunId, status: "queued", userMessageId: "message:queued" }],
    messages: [{ id: "message:queued", text: "Queued follow-up" }],
    runtimeRequests: [
      { id: "request:question", kind: "user_input", status: "pending" },
      { id: "request:approval", kind: "command", status: "pending" },
    ],
    turnItems: [
      {
        type: "user_input_request",
        requestId: "request:question",
        questions: [{ id: "q", header: "Size", question: "Which?", options: [] }],
      },
    ],
  } as never;
};

const dispatched: Array<string> = [];

const layerThreads = Layer.mock(ThreadManagement.ThreadManagementService)({
  getThreadShell: (threadId) => Effect.succeed(shells.get(threadId) ?? null),
  getProjectThreadRecords: ({ threadId }) => Effect.succeed(projection(shells.get(threadId)!)),
  dispatch: (command) =>
    Effect.sync(() => {
      dispatched.push(command.type);
      return { sequence: 7, storedEvents: [] } as never;
    }),
});

// The locked thread's group is locked; only its sibling, the full-access thread, may send to it.
const layerGroupLock = Layer.mock(ControlLock.ControlLock)({
  checkAgentSend: ({ threadId, senderThreadId }) =>
    threadId === lockedId && senderThreadId !== fullAccessId
      ? Effect.fail(
          new ControlLock.LockedSendError({ until: "2026-01-01T02:00:00.000Z", group: "ORBIT" }),
        )
      : Effect.void,
});

const scheduledTask = (id: string, runtimeMode: "auto" | "full-access") =>
  ({
    id,
    title: id,
    prompt: "Check the build",
    enabled: true,
    projectId: "project-a",
    threadId: null,
    schedule: { type: "interval", everyMs: 3_600_000 },
    workspaceStrategy: { type: "root" },
    modelSelection: { instanceId: "codex", model: "gpt-5" },
    runtimeMode,
    interactionMode: "default",
    createdBy: "user",
    creationSource: "web",
    nextRunAt: null,
    lastRunStatus: "never",
    lastRunAt: null,
    lastRunThreadId: null,
    lastRunError: null,
    runCount: 0,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
  }) as never;

const layerScheduler = Layer.mock(ScheduledTaskService.ScheduledTaskService)({
  list: () =>
    Effect.succeed({
      tasks: [scheduledTask("task-full-access", "full-access"), scheduledTask("task-auto", "auto")],
    }),
  upsert: (input) =>
    Effect.sync(() => {
      dispatched.push("scheduled-task.upsert");
      return { task: { ...(scheduledTask(input.id ?? "task-auto", "auto") as object), ...input } };
    }) as never,
});

const layerTest = Layer.mergeAll(
  McpHttpServer.layerThreadToolkit,
  McpHttpServer.layerOrchestratorToolkit.pipe(
    Layer.provide(Layer.mock(ProviderRegistry.ProviderRegistry)({})),
    Layer.provide(Layer.mock(ProviderAdapterRegistry.ProviderAdapterRegistryV2)({})),
    Layer.provide(layerScheduler),
    Layer.provide(Layer.mock(ProjectService.ProjectService)({})),
    Layer.provide(Layer.mock(SecretRequests.SecretRequests)({})),
    Layer.provide(Layer.mock(ThreadLaunchService.ThreadLaunchService)({})),
    Layer.provide(Layer.mock(GitVcsDriver.GitVcsDriver)({})),
  ),
).pipe(
  Layer.provideMerge(McpServer.McpServer.layer),
  Layer.provide(NodeCrypto.layer),
  Layer.provide(layerThreads),
  Layer.provide(layerGroupLock),
);

const threadCaller = (threadId: ThreadId): McpInvocationContext.McpInvocationScope => ({
  environmentId: EnvironmentId.make("environment"),
  requestNamespace: `provider:${threadId}`,
  thread: {
    threadId,
    providerSessionId: `provider:${threadId}`,
    providerInstanceId: ProviderInstanceId.make("codex"),
  },
  client: undefined,
  capabilities: new Set(["orchestration"]),
  issuedAt: 0,
});

const clientCaller = (
  access: McpInvocationContext.McpClientCaller["access"],
): McpInvocationContext.McpInvocationScope => ({
  environmentId: EnvironmentId.make("environment"),
  requestNamespace: "client:session",
  thread: undefined,
  client: { sessionId: "session", label: "Claude Code", access },
  capabilities: new Set(["orchestration"]),
  issuedAt: 0,
});

const mcpClient = McpSchema.McpServerClient.of({
  clientId: 1,
  protocolVersion: "2025-06-18",
  clientCapabilities: {},
  clientInfo: { name: "mcp-test", version: "1" },
  initializePayload: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "mcp-test", version: "1" },
  },
  getClient: Effect.die("unused"),
});

const supervised = threadCaller(supervisedId);
const fullAccess = threadCaller(fullAccessId);
const autoClient = clientCaller("auto");
const readOnlyClient = clientCaller("read-only");

/** "ok", or the refusal's code. */
const call = (
  tool: string,
  scope: McpInvocationContext.McpInvocationScope,
  args: Record<string, unknown>,
) =>
  McpServer.McpServer.pipe(
    Effect.flatMap((server) => server.callTool({ name: tool, arguments: args })),
    Effect.map((result) => {
      const text = result.content[0];
      return result.isError === true && text?.type === "text"
        ? (JSON.parse(text.text) as { code: string }).code
        : "ok";
    }),
    Effect.provideService(McpInvocationContext.McpInvocationContext, scope),
    Effect.provideService(McpSchema.McpServerClient, mcpClient),
  );

const question = { threadId: supervisedId, requestId: "request:question" };
const answers = { answers: { q: "large" } };
const modelSelection = { modelSelection: { instanceId: "codex", model: "gpt-5" } };

it.effect.each([
  // queue: list and read were reads; edit, cancel and reorder wrote the thread.
  ["thread_queue", readOnlyClient, { action: "list", threadId: supervisedId }, "ok", false],
  [
    "thread_queue",
    readOnlyClient,
    { action: "read", threadId: supervisedId, queuedRunId },
    "ok",
    false,
  ],
  [
    "thread_queue",
    readOnlyClient,
    { action: "edit", threadId: supervisedId, queuedRunId, text: "New" },
    "capability_denied",
    false,
  ],
  [
    "thread_queue",
    supervised,
    { action: "cancel", threadId: fullAccessId, queuedRunId },
    "runtime_mode_escalation_denied",
    false,
  ],
  ["thread_queue", supervised, { action: "cancel", queuedRunId }, "ok", true],
  // Editing a locked thread's queue sends nothing, as queue_edit did not.
  [
    "thread_queue",
    supervised,
    { action: "reorder", threadId: lockedId, queuedRunId, beforeRunId: null },
    "ok",
    true,
  ],
  // promote_to_steer sends: a locked group refuses everyone but its own threads.
  [
    "thread_queue",
    supervised,
    { action: "promote_to_steer", threadId: lockedId, queuedRunId, targetRunId: activeRunId },
    "thread_not_sendable",
    false,
  ],
  [
    "thread_queue",
    autoClient,
    { action: "promote_to_steer", threadId: lockedId, queuedRunId, targetRunId: activeRunId },
    "thread_not_sendable",
    false,
  ],
  [
    "thread_queue",
    readOnlyClient,
    { action: "promote_to_steer", threadId: supervisedId, queuedRunId, targetRunId: activeRunId },
    "capability_denied",
    false,
  ],
  [
    "thread_queue",
    fullAccess,
    { action: "promote_to_steer", threadId: lockedId, queuedRunId, targetRunId: activeRunId },
    "ok",
    true,
  ],

  // pending_request: list and read were reads; respond wrote the thread and never approves.
  ["pending_request", readOnlyClient, { action: "list", threadId: supervisedId }, "ok", false],
  ["pending_request", readOnlyClient, { action: "read", ...question }, "ok", false],
  [
    "pending_request",
    readOnlyClient,
    { action: "respond", ...question, ...answers },
    "capability_denied",
    false,
  ],
  [
    "pending_request",
    supervised,
    { action: "respond", threadId: fullAccessId, requestId: "request:question", ...answers },
    "runtime_mode_escalation_denied",
    false,
  ],
  [
    "pending_request",
    supervised,
    { action: "respond", threadId: supervisedId, requestId: "request:approval", ...answers },
    "invalid_request",
    false,
  ],
  ["pending_request", supervised, { action: "respond", ...question, ...answers }, "ok", true],

  // thread_configure: reading was thread_configuration, a read; setting wrote the thread.
  ["thread_configure", readOnlyClient, { threadId: supervisedId }, "ok", false],
  [
    "thread_configure",
    readOnlyClient,
    { threadId: supervisedId, ...modelSelection },
    "capability_denied",
    false,
  ],
  [
    "thread_configure",
    supervised,
    { threadId: fullAccessId, ...modelSelection },
    "runtime_mode_escalation_denied",
    false,
  ],

  // thread_transfer: status was a read; fork and merge_back wrote both threads they name.
  ["thread_transfer", readOnlyClient, { action: "status", threadId: supervisedId }, "ok", false],
  [
    "thread_transfer",
    readOnlyClient,
    { action: "fork", threadId: supervisedId },
    "capability_denied",
    false,
  ],
  [
    "thread_transfer",
    supervised,
    { action: "fork", threadId: fullAccessId },
    "runtime_mode_escalation_denied",
    false,
  ],
  [
    "thread_transfer",
    supervised,
    { action: "merge_back", targetThreadId: fullAccessId },
    "runtime_mode_escalation_denied",
    false,
  ],
  [
    "thread_transfer",
    supervised,
    { action: "merge_back", threadId: fullAccessId, targetThreadId: supervisedId },
    "runtime_mode_escalation_denied",
    false,
  ],
  ["thread_transfer", autoClient, { action: "fork" }, "target_required", false],

  // schedule_task: creating started threads with the caller's modes; updating was
  // update_scheduled_task, which also refuses a task that runs above the caller.
  [
    "schedule_task",
    readOnlyClient,
    { prompt: "Check", schedule: { type: "interval", everyMs: 3_600_000 } },
    "capability_denied",
    false,
  ],
  [
    "schedule_task",
    readOnlyClient,
    { scheduledTaskId: "task-auto", enabled: false },
    "capability_denied",
    false,
  ],
  [
    "schedule_task",
    autoClient,
    { scheduledTaskId: "task-full-access", prompt: "Run something else" },
    "runtime_mode_escalation_denied",
    false,
  ],
  ["schedule_task", autoClient, { scheduledTaskId: "task-auto", enabled: false }, "ok", true],
] as const)("%s from %o with %o: %s", ([tool, scope, args, expected, changes]) =>
  Effect.gen(function* () {
    dispatched.length = 0;
    expect(yield* call(tool, scope, args)).toBe(expected);
    expect(dispatched.length > 0).toBe(changes);
  }).pipe(Effect.provide(layerTest)),
);
