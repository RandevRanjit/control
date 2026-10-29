import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { assert, describe, it } from "@effect/vitest";
import {
  CommandId,
  EnvironmentId,
  EventId,
  MessageId,
  OrchestratorMcpThreadReadResult,
  PlanId,
  ProjectId,
  ProviderInstanceId,
  RunId,
  ThreadId,
  TurnItemId,
  type OrchestrationV2DomainEvent,
  type OrchestrationV2TurnItem,
} from "@control/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { McpSchema, McpServer } from "effect/ai";

import * as ControlLock from "../lock/ControlLock.ts";
import * as EventSink from "../orchestration-v2/EventSink.ts";
import * as Orchestrator from "../orchestration-v2/Orchestrator.ts";
import * as ProjectStore from "../orchestration-v2/ProjectStore.ts";
import * as ProviderAdapterRegistry from "../orchestration-v2/ProviderAdapterRegistry.ts";
import * as ThreadLaunchService from "../orchestration-v2/ThreadLaunchService.ts";
import * as ThreadManagementService from "../orchestration-v2/ThreadManagementService.ts";
import * as ProviderReplayHarness from "../orchestration-v2/testkit/ProviderReplayHarness.ts";
import * as SqlitePersistence from "../persistence/Sqlite.ts";
import * as ProjectService from "../project/ProjectService.ts";
import * as ProviderRegistry from "../provider/ProviderRegistry.ts";
import * as ScheduledTaskService from "../scheduledTasks/ScheduledTaskService.ts";
import * as SecretRequests from "../secrets/SecretRequests.ts";
import * as GitVcsDriver from "../vcs/GitVcsDriver.ts";
import * as McpHttpServer from "./McpHttpServer.ts";
import * as McpInvocationContext from "./McpInvocationContext.ts";

// thread_read's `query` runs the real tool: decode, OrchestratorMcpService, the
// SQL projection's thread find, and back, over an in-memory database.

const layerDatabase = SqlitePersistence.layerMemory;
const layerRegistry = ProviderAdapterRegistry.layerFromAdapters([]);
const layerOrchestration = ProviderReplayHarness.layerWithRegistry(
  { name: "mcp-thread-find" },
  layerRegistry,
  { databaseLayer: layerDatabase, runEffectWorker: false },
);
const layerThreads = ThreadManagementService.layer.pipe(Layer.provideMerge(layerOrchestration));
const layerTest = McpHttpServer.layerOrchestratorToolkit.pipe(
  Layer.provide(Layer.mock(ProviderRegistry.ProviderRegistry)({})),
  Layer.provide(layerRegistry),
  Layer.provide(Layer.mock(ScheduledTaskService.ScheduledTaskService)({})),
  Layer.provide(Layer.mock(ProjectService.ProjectService)({})),
  Layer.provide(Layer.mock(SecretRequests.SecretRequests)({})),
  Layer.provide(Layer.mock(ThreadLaunchService.ThreadLaunchService)({})),
  Layer.provide(Layer.mock(GitVcsDriver.GitVcsDriver)({})),
  Layer.provide(Layer.mock(ControlLock.ControlLock)({})),
  Layer.provideMerge(McpServer.McpServer.layer),
  Layer.provideMerge(layerThreads),
  Layer.provideMerge(ProjectStore.layer.pipe(Layer.provideMerge(layerDatabase))),
  Layer.provide(NodeCrypto.layer),
);

const instanceId = ProviderInstanceId.make("codex");
const projectId = ProjectId.make("project:mcp-find");
const threadId = ThreadId.make("thread:mcp-find");
const deletedThreadId = ThreadId.make("thread:mcp-find-deleted");
const runId = RunId.make("run:mcp-find");
const at = DateTime.makeUnsafe("2026-10-29T09:00:00.000Z");

const scope: McpInvocationContext.McpInvocationScope = {
  environmentId: EnvironmentId.make("environment"),
  requestNamespace: "client:find",
  thread: undefined,
  client: { sessionId: "find", label: "Claude Code", access: "read-only" },
  capabilities: new Set(["orchestration"]),
  issuedAt: 0,
};

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

const decodeRead = Schema.decodeUnknownEffect(OrchestratorMcpThreadReadResult);

const callRead = (args: Record<string, unknown>) =>
  McpServer.McpServer.pipe(
    Effect.flatMap((server) => server.callTool({ name: "thread_read", arguments: args })),
    Effect.provideService(McpInvocationContext.McpInvocationContext, scope),
    Effect.provideService(McpSchema.McpServerClient, mcpClient),
  );
const read = (args: Record<string, unknown>) =>
  callRead(args).pipe(
    Effect.flatMap((result) => decodeRead(result.structuredContent)),
    Effect.orDie,
  );

function item(
  id: string,
  ordinal: number,
  text: string,
  type: "user_message" | "assistant_message" | "proposed_plan",
): OrchestrationV2TurnItem {
  const base = {
    id: TurnItemId.make(id),
    threadId,
    runId,
    nodeId: null,
    providerThreadId: null,
    providerTurnId: null,
    nativeItemRef: null,
    parentItemId: null,
    ordinal,
    status: "completed" as const,
    title: null,
    startedAt: at,
    completedAt: at,
    updatedAt: at,
  };
  if (type === "proposed_plan")
    return { ...base, type, planId: PlanId.make(id), markdown: text, streaming: false };
  if (type === "user_message")
    return {
      ...base,
      type,
      messageId: MessageId.make(id),
      text,
      inputIntent: "turn_start",
      attachments: [],
      createdBy: "user",
      creationSource: "web",
    };
  return { ...base, type, messageId: MessageId.make(id), text, streaming: false };
}

const createThread = (id: ThreadId) =>
  Effect.flatMap(Orchestrator.OrchestratorV2, (orchestrator) =>
    orchestrator.dispatch({
      type: "thread.create",
      createdBy: "user",
      creationSource: "web",
      commandId: CommandId.make(`create:${id}`),
      threadId: id,
      projectId,
      title: id,
      modelSelection: { instanceId, model: "gpt-5.4" },
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
    }),
  );

const setup = Effect.gen(function* () {
  const projects = yield* ProjectStore.ProjectStoreV2;
  yield* projects.apply({
    sequence: 0,
    eventId: EventId.make("created:project:mcp-find"),
    aggregateKind: "project",
    aggregateId: projectId,
    occurredAt: DateTime.formatIso(at),
    commandId: null,
    causationEventId: null,
    correlationId: null,
    metadata: {},
    type: "project.created",
    payload: {
      projectId,
      title: "Find",
      workspaceRoot: "/work/mcp-find",
      defaultModelSelection: null,
      scripts: [],
      createdAt: DateTime.formatIso(at),
      updatedAt: DateTime.formatIso(at),
    },
  });
  yield* createThread(threadId);
  const items = [
    item("ask", 0, "Deploy the canary to staging", "user_message"),
    item("logs", 1, "Checked the logs; nothing unusual.", "assistant_message"),
    item("healthy", 2, "The CANARY looks healthy.", "assistant_message"),
    item("plan", 3, "1. Roll the canary out to production", "proposed_plan"),
    item("done", 4, "Rollout finished.", "assistant_message"),
  ];
  const sink = yield* EventSink.EventSinkV2;
  yield* sink.write({
    events: [
      {
        id: EventId.make("run:mcp-find"),
        threadId,
        occurredAt: at,
        type: "run.created",
        payload: {
          id: runId,
          threadId,
          ordinal: 1,
          providerInstanceId: instanceId,
          modelSelection: { instanceId, model: "gpt-5.4" },
          providerThreadId: null,
          userMessageId: MessageId.make("ask"),
          rootNodeId: null,
          activeAttemptId: null,
          status: "completed",
          requestedAt: at,
          startedAt: at,
          completedAt: at,
          checkpointId: null,
          contextHandoffId: null,
        },
      },
      ...items.map((payload): OrchestrationV2DomainEvent => ({
        id: EventId.make(`item:${payload.id}`),
        threadId,
        occurredAt: at,
        type: "turn-item.updated",
        payload,
      })),
    ],
  });
});

describe("thread_read query", () => {
  it.effect("returns only the messages and plans that contain the text", () =>
    Effect.gen(function* () {
      yield* setup;
      const found = yield* read({ threadId, query: "canary" });
      assert.deepEqual(
        found.items.map((entry) => entry.itemId),
        ["ask", "healthy", "plan"],
      );
      assert.equal(found.hasMore, false);
      assert.equal(found.nextPosition, found.items.at(-1)!.position);
      assert.equal(found.items[1]!.text, "The CANARY looks healthy.");
    }).pipe(Effect.provide(layerTest)),
  );

  it.effect("returns an empty page when nothing matches", () =>
    Effect.gen(function* () {
      yield* setup;
      const found = yield* read({ threadId, query: "rollback" });
      assert.deepEqual(found.items, []);
      assert.equal(found.nextPosition, null);
      assert.equal(found.hasMore, false);
    }).pipe(Effect.provide(layerTest)),
  );

  it.effect("pages matches with afterPosition, and positions read around a match", () =>
    Effect.gen(function* () {
      yield* setup;
      const first = yield* read({ threadId, query: "canary", limit: 2 });
      assert.deepEqual(
        first.items.map((entry) => entry.itemId),
        ["ask", "healthy"],
      );
      assert.equal(first.hasMore, true);
      const second = yield* read({
        threadId,
        query: "canary",
        limit: 2,
        afterPosition: first.nextPosition,
      });
      assert.deepEqual(
        second.items.map((entry) => entry.itemId),
        ["plan"],
      );
      assert.equal(second.hasMore, false);
      // Without the query, the match's position reads the message before it.
      const around = yield* read({
        threadId,
        afterPosition: first.items[1]!.position - 2,
        limit: 1,
      });
      assert.deepEqual(
        around.items.map((entry) => entry.itemId),
        ["logs"],
      );
    }).pipe(Effect.provide(layerTest)),
  );

  it.effect("refuses a deleted or missing thread", () =>
    Effect.gen(function* () {
      yield* setup;
      yield* createThread(deletedThreadId);
      const orchestrator = yield* Orchestrator.OrchestratorV2;
      yield* orchestrator.dispatch({
        type: "thread.archive",
        commandId: CommandId.make("archive:deleted"),
        threadId: deletedThreadId,
      });
      yield* orchestrator.dispatch({
        type: "thread.delete",
        commandId: CommandId.make("delete:deleted"),
        threadId: deletedThreadId,
      });
      for (const target of [deletedThreadId, ThreadId.make("thread:mcp-find-missing")]) {
        const result = yield* callRead({ threadId: target, query: "canary" });
        assert.equal(result.isError, true);
        const text = result.content[0];
        assert.equal(
          text?.type === "text" ? (JSON.parse(text.text) as { code: string }).code : undefined,
          "thread_not_found",
        );
      }
    }).pipe(Effect.provide(layerTest)),
  );
});
