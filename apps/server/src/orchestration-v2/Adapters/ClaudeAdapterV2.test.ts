import * as NodeOS from "node:os";

import * as ClaudeSdk from "@anthropic-ai/claude-agent-sdk";
import { beforeEach, vi } from "vite-plus/test";

import type {
  HookInput,
  Query as ClaudeQuery,
  SDKControlGetContextUsageResponse,
  SDKMessage,
  SDKResultMessage,
  SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { AskUserQuestionInput } from "@anthropic-ai/claude-agent-sdk/sdk-tools";
import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  ChatAttachmentId,
  ChatFileAttachment,
  ChatImageAttachment,
  ClaudeSettings,
  EnvironmentId,
  MessageId,
  GB,
  LocalModelError,
  LocalModelId,
  type ModelSelection,
  NodeId,
  type OrchestrationV2AppThread,
  type OrchestrationV2ProviderThread,
  ProjectId,
  ProviderInstanceId,
  type ProviderApprovalDecision,
  ProviderSessionId,
  ProviderTurnId,
  RunAttemptId,
  RunId,
  ThreadId,
} from "@control/contracts";
import { assert, describe, it } from "@effect/vitest";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Queue from "effect/Queue";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";
import { Tool } from "effect/ai";
import { formatClaudeResumeCompactionQuestion } from "@control/shared/claudeCompaction";
import { HostProcessPlatform } from "@control/shared/hostProcess";
import { SpawnExecutableResolution } from "@control/shared/shell";

import { attachmentRelativePath } from "../../attachmentStore.ts";
import * as ServerConfig from "../../config.ts";
import * as McpProviderSession from "../../mcp/McpProviderSession.ts";
import { PreviewControlsToolkit } from "../../mcp/toolkits/previewControls/tools.ts";
import { HtmlToolkit } from "../../mcp/toolkits/html/tools.ts";
import { EnvironmentToolkit } from "../../mcp/toolkits/environment/tools.ts";
import { LocalModelsToolkit } from "../../mcp/toolkits/localModels/tools.ts";
import { ProjectToolkit } from "../../mcp/toolkits/project/tools.ts";
import { WorktreeToolkit } from "../../mcp/toolkits/worktree/tools.ts";
import { ThreadToolkit } from "../../mcp/toolkits/thread/tools.ts";
import { OrchestratorToolkit } from "../../mcp/toolkits/orchestrator/tools.ts";
import { ClaudeExecutableFileCheck } from "../../provider/Drivers/ClaudeExecutable.ts";
import type { EventNdjsonLogger } from "../../provider/EventNdjsonLogger.ts";
import {
  ProviderAdapterV2RuntimePolicy,
  type ProviderAdapterV2Event,
  type ProviderAdapterV2TurnInput,
} from "../ProviderAdapter.ts";
import type { ProviderContinuationRequest } from "../ProviderContinuationRequests.ts";
import { makeProviderFailure } from "../ProviderFailure.ts";
import * as ClaudeAdapterV2 from "./ClaudeAdapterV2.ts";
import * as IdAllocator from "../IdAllocator.ts";

// The adapter resolves Claude's settings before a Full access turn; tests never read the
// owner's real ones.
vi.mock("@anthropic-ai/claude-agent-sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof ClaudeSdk>()),
  resolveSettings: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(ClaudeSdk.resolveSettings).mockReset().mockResolvedValue({
    effective: {},
    provenance: {},
    sources: [],
  });
});

const DEFAULT_CLAUDE_SETTINGS = Schema.decodeSync(ClaudeSettings)({});
const AUTO_COMPACT_CLAUDE_SETTINGS = Schema.decodeSync(ClaudeSettings)({
  autoCompactWindow: "300000",
});
const CLAUDE_TEST_MODEL_SELECTION = {
  instanceId: ProviderInstanceId.make(ClaudeAdapterV2.CLAUDE_PROVIDER),
  model: "claude-sonnet-4-6",
  options: [{ id: "effort", value: "ultrathink" }],
} satisfies ModelSelection;
const CLAUDE_TEST_RUNTIME_POLICY = ProviderAdapterV2RuntimePolicy.make({
  runtimeMode: "full-access",
  interactionMode: "default",
  cwd: "/workspace",
});

function makeClaudeTestAppThread(input: {
  readonly threadId: ThreadId;
  readonly providerThread: OrchestrationV2ProviderThread;
  readonly now: DateTime.Utc;
}): OrchestrationV2AppThread {
  return {
    createdBy: "user",
    creationSource: "web",
    id: input.threadId,
    projectId: ProjectId.make(`project-${input.threadId}`),
    title: "Claude attachment test",
    providerInstanceId: ProviderInstanceId.make(ClaudeAdapterV2.CLAUDE_PROVIDER),
    modelSelection: CLAUDE_TEST_MODEL_SELECTION,
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    activeProviderThreadId: input.providerThread.id,
    lineage: {
      parentThreadId: null,
      relationshipToParent: null,
      rootThreadId: input.threadId,
    },
    forkedFrom: null,
    createdAt: input.now,
    updatedAt: input.now,
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    lastVisitedAt: null,
    deletedAt: null,
  };
}

function makeClaudeTestTurnInput(input: {
  readonly threadId: ThreadId;
  readonly providerThread: OrchestrationV2ProviderThread;
  readonly now: DateTime.Utc;
  readonly attemptId: RunAttemptId;
  readonly text: string;
  readonly attachments: ProviderAdapterV2TurnInput["message"]["attachments"];
  readonly providerTurnOrdinal?: number;
  readonly nativeThreadHasTurns?: boolean;
  readonly messageCreatedBy?: ProviderAdapterV2TurnInput["message"]["createdBy"];
  readonly messageCreationSource?: ProviderAdapterV2TurnInput["message"]["creationSource"];
  readonly modelSelection?: ModelSelection;
  readonly runtimePolicy?: ProviderAdapterV2RuntimePolicy;
}): ProviderAdapterV2TurnInput {
  return {
    appThread: makeClaudeTestAppThread(input),
    threadId: input.threadId,
    runId: RunId.make(`run-${input.attemptId}`),
    runOrdinal: 1,
    providerTurnOrdinal: input.providerTurnOrdinal ?? 1,
    ...(input.nativeThreadHasTurns === undefined
      ? {}
      : { nativeThreadHasTurns: input.nativeThreadHasTurns }),
    attemptId: input.attemptId,
    rootNodeId: NodeId.make(`node-${input.attemptId}`),
    providerThread: input.providerThread,
    message: {
      createdBy: input.messageCreatedBy ?? "user",
      creationSource: input.messageCreationSource ?? "web",
      messageId: MessageId.make(`message-${input.attemptId}`),
      text: input.text,
      attachments: input.attachments,
    },
    modelSelection: input.modelSelection ?? CLAUDE_TEST_MODEL_SELECTION,
    runtimePolicy: input.runtimePolicy ?? CLAUDE_TEST_RUNTIME_POLICY,
  };
}

describe("ClaudeAdapterV2 runtime query policy", () => {
  it.each([false, true])("requests thinking summaries with resume=%s", (resume) => {
    const options = ClaudeAdapterV2.makeClaudeQueryOptions({
      modelSelection: CLAUDE_TEST_MODEL_SELECTION,
      nativeThreadId: "thinking-thread",
      resume,
      cwd: "/workspace",
    });
    assert.deepEqual(options.thinking, { type: "adaptive", display: "summarized" });
    assert.equal(options.extraArgs?.["thinking-display"], "summarized");
    assert.include(options.settings, { showThinkingSummaries: true });
  });

  it("preserves an explicit omitted thinking display", () => {
    const options = ClaudeAdapterV2.makeClaudeQueryOptions({
      modelSelection: CLAUDE_TEST_MODEL_SELECTION,
      nativeThreadId: "thinking-thread",
      resume: false,
      cwd: "/workspace",
      settings: { ...DEFAULT_CLAUDE_SETTINGS, launchArgs: "--thinking-display omitted" },
    });
    assert.isUndefined(options.thinking);
    assert.equal(options.extraArgs?.["thinking-display"], "omitted");
    assert.notInclude(options.settings ?? {}, { showThinkingSummaries: true });
  });

  it("does not enable thinking when the model option disables it", () => {
    const options = ClaudeAdapterV2.makeClaudeQueryOptions({
      modelSelection: {
        ...CLAUDE_TEST_MODEL_SELECTION,
        model: "claude-haiku-4-5",
        options: [{ id: "thinking", value: false }],
      },
      nativeThreadId: "thinking-thread",
      resume: false,
      cwd: "/workspace",
    });
    assert.isUndefined(options.thinking);
    assert.isUndefined(options.extraArgs?.["thinking-display"]);
    assert.include(options.settings, { alwaysThinkingEnabled: false });
  });

  it.each([
    ["--permission-mode acceptEdits", "acceptEdits"],
    ["--dangerously-skip-permissions", "bypassPermissions"],
    ["--dangerously-skip-permissions --permission-mode plan", "plan"],
  ])("folds %s into the SDK permission mode", (launchArgs, expected) => {
    const options = ClaudeAdapterV2.makeClaudeQueryOptions({
      modelSelection: CLAUDE_TEST_MODEL_SELECTION,
      nativeThreadId: "native-permission-override",
      resume: false,
      cwd: "/workspace",
      permissionMode: "default",
      settings: { ...AUTO_COMPACT_CLAUDE_SETTINGS, launchArgs },
    });
    assert.equal(options.permissionMode, expected);
    assert.isUndefined(options.extraArgs?.["permission-mode"]);
    assert.isUndefined(options.extraArgs?.["dangerously-skip-permissions"]);
  });

  it("passes automatic compaction and resume-dialog controls to the SDK", () => {
    const onUserDialog = async () => ({
      behavior: "completed" as const,
      result: "continue" as const,
    });
    const options = ClaudeAdapterV2.makeClaudeQueryOptions({
      modelSelection: CLAUDE_TEST_MODEL_SELECTION,
      nativeThreadId: "native-thread-auto-compact",
      resume: true,
      cwd: "/workspace",
      settings: AUTO_COMPACT_CLAUDE_SETTINGS,
      onUserDialog,
      supportedDialogKinds: ["resume_return"],
    });

    assert.equal((options.settings as { autoCompactWindow?: number }).autoCompactWindow, 300_000);
    assert.equal(options.onUserDialog, onUserDialog);
    assert.deepEqual(options.supportedDialogKinds, ["resume_return"]);
  });

  it("pins Claude's auto tool search on through flag settings", () => {
    const override = ClaudeAdapterV2.claudeToolSearchOverride;
    for (const value of ["auto", "auto:10", "auto:99.5", "auto:x", "auto:Infinity"]) {
      assert.equal(override(value), "true", value);
    }
    for (const value of [
      undefined,
      "true",
      "false",
      "auto:0",
      "auto:-5",
      "auto:100",
      "auto:1e2",
      "auto:1_000",
      "auto:1,000",
      "AUTO",
    ]) {
      assert.isUndefined(override(value), String(value));
    }

    const options = ClaudeAdapterV2.makeClaudeQueryOptions({
      modelSelection: CLAUDE_TEST_MODEL_SELECTION,
      nativeThreadId: "native-tool-search",
      resume: false,
      cwd: "/workspace",
      sdkSettings: { env: { OTHER: "kept" } },
      toolSearchOverride: "true",
    });
    assert.deepEqual((options.settings as { env?: Record<string, string> }).env, {
      OTHER: "kept",
      ENABLE_TOOL_SEARCH: "true",
    });
  });

  it("projects AskUserQuestion input with question text as the answer key", () => {
    assert.deepEqual(
      ClaudeAdapterV2.claudeUserInputQuestions({
        questions: [
          {
            header: "Approach",
            question: "Which approach?",
            options: [{ label: "Simple", description: "Use fewer moving parts" }],
            multiSelect: true,
          },
        ],
      }),
      [
        {
          id: "Which approach?",
          header: "Approach",
          question: "Which approach?",
          options: [{ label: "Simple", description: "Use fewer moving parts" }],
          multiSelect: true,
        },
      ],
    );
    const sdkAnswers: NonNullable<AskUserQuestionInput["answers"]> =
      ClaudeAdapterV2.claudeSdkUserInputAnswers({
        "Which approach?": ["Simple", "Safe"],
        "Deploy now?": "Yes",
      });
    assert.deepEqual(sdkAnswers, {
      "Which approach?": "Simple, Safe",
      "Deploy now?": "Yes",
    });
    assert.isTrue(
      ClaudeAdapterV2.ClaudeProviderCapabilitiesV2.planning.supportsStructuredQuestions,
    );
  });

  it("normalizes Claude todo and proposed-plan tool input", () => {
    assert.deepEqual(
      ClaudeAdapterV2.claudeTodoSteps({
        todos: [
          { content: "Inspect", status: "completed" },
          { content: "Implement", status: "in_progress" },
        ],
      }),
      [
        { id: "todo-0", text: "Inspect", status: "completed" },
        { id: "todo-1", text: "Implement", status: "running" },
      ],
    );
    assert.equal(
      ClaudeAdapterV2.claudeProposedPlan({ plan: "  # Plan\nShip it  " }),
      "# Plan\nShip it",
    );
    assert.isTrue(ClaudeAdapterV2.ClaudeProviderCapabilitiesV2.planning.emitsTodoList);
    assert.isTrue(ClaudeAdapterV2.ClaudeProviderCapabilitiesV2.planning.emitsProposedPlan);
  });

  it("maps canonical read-only never policy to Claude dontAsk with read-only tools", () => {
    const queryPolicy = ClaudeAdapterV2.claudeRuntimeQueryPolicyForRuntimePolicy(
      ProviderAdapterV2RuntimePolicy.make({
        runtimeMode: "full-access",
        interactionMode: "default",
        cwd: "/workspace",
        approvalPolicy: "never",
        sandboxPolicy: {
          type: "readOnly",
          access: { type: "fullAccess" },
          networkAccess: false,
        },
      }),
    );

    assert.deepEqual(queryPolicy, {
      permissionMode: "dontAsk",
      tools: ClaudeAdapterV2.CLAUDE_READ_ONLY_ALLOWED_TOOLS,
      allowedTools: ClaudeAdapterV2.CLAUDE_READ_ONLY_ALLOWED_TOOLS,
      installPermissionCallback: false,
    });
  });

  it("maps canonical read-only on-request policy to Claude default with callbacks", () => {
    const queryPolicy = ClaudeAdapterV2.claudeRuntimeQueryPolicyForRuntimePolicy(
      ProviderAdapterV2RuntimePolicy.make({
        runtimeMode: "full-access",
        interactionMode: "default",
        cwd: "/workspace",
        approvalPolicy: "on-request",
        sandboxPolicy: {
          type: "readOnly",
          access: { type: "fullAccess" },
          networkAccess: false,
        },
      }),
    );

    assert.deepEqual(queryPolicy, {
      permissionMode: "default",
      tools: ClaudeAdapterV2.CLAUDE_READ_ONLY_ALLOWED_TOOLS,
      allowedTools: ClaudeAdapterV2.CLAUDE_READ_ONLY_ALLOWED_TOOLS,
      installPermissionCallback: true,
    });
  });

  it("does not auto-allow reads for canonical restricted read-only never policy", () => {
    const queryPolicy = ClaudeAdapterV2.claudeRuntimeQueryPolicyForRuntimePolicy(
      ProviderAdapterV2RuntimePolicy.make({
        runtimeMode: "full-access",
        interactionMode: "default",
        cwd: "/workspace",
        approvalPolicy: "never",
        sandboxPolicy: {
          type: "readOnly",
          access: {
            type: "restricted",
            includePlatformDefaults: false,
            readableRoots: [],
          },
          networkAccess: false,
        },
      }),
    );

    assert.deepEqual(queryPolicy, {
      permissionMode: "dontAsk",
      tools: ClaudeAdapterV2.CLAUDE_READ_ONLY_ALLOWED_TOOLS,
      installPermissionCallback: false,
    });
  });

  it("maps default full-access policy to Claude bypass permissions", () => {
    const queryPolicy = ClaudeAdapterV2.claudeRuntimeQueryPolicyForRuntimePolicy(
      ProviderAdapterV2RuntimePolicy.make({
        runtimeMode: "full-access",
        interactionMode: "default",
        cwd: "/workspace",
      }),
    );

    assert.deepEqual(queryPolicy, {
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      installPermissionCallback: false,
    });
  });

  it("keeps approval checks when Full access must fall back to an allowed Claude mode", () => {
    const runtimePolicy = ProviderAdapterV2RuntimePolicy.make({
      runtimeMode: "full-access",
      interactionMode: "default",
      cwd: "/workspace",
      approvalPolicy: "never",
    });

    assert.deepEqual(
      ClaudeAdapterV2.claudeRuntimeQueryPolicyForRuntimePolicy(runtimePolicy, {
        bypassDisabled: true,
        autoDisabled: false,
      }),
      { permissionMode: "auto", installPermissionCallback: true },
    );
    assert.deepEqual(
      ClaudeAdapterV2.claudeRuntimeQueryPolicyForRuntimePolicy(runtimePolicy, {
        bypassDisabled: true,
        autoDisabled: true,
      }),
      { permissionMode: "default", installPermissionCallback: true },
    );
  });

  it("maps Auto runtime mode to Claude's AI-reviewed permission mode", () => {
    const queryPolicy = ClaudeAdapterV2.claudeRuntimeQueryPolicyForRuntimePolicy(
      ProviderAdapterV2RuntimePolicy.make({
        runtimeMode: "auto",
        interactionMode: "default",
        cwd: "/workspace",
      }),
    );

    assert.deepEqual(queryPolicy, {
      permissionMode: "auto",
      installPermissionCallback: false,
    });
  });

  it("keeps approval-required mode interactive with danger-full-access sandboxing", () => {
    const queryPolicy = ClaudeAdapterV2.claudeRuntimeQueryPolicyForRuntimePolicy(
      ProviderAdapterV2RuntimePolicy.make({
        runtimeMode: "approval-required",
        interactionMode: "default",
        cwd: "/workspace",
        sandboxPolicy: {
          type: "dangerFullAccess",
        },
      }),
    );

    assert.deepEqual(queryPolicy, {
      permissionMode: "default",
      installPermissionCallback: true,
    });
  });

  it("installs the permission callback for approval-required plan mode", () => {
    const queryPolicy = ClaudeAdapterV2.claudeRuntimeQueryPolicyForRuntimePolicy(
      ProviderAdapterV2RuntimePolicy.make({
        runtimeMode: "approval-required",
        interactionMode: "plan",
        cwd: "/workspace",
      }),
    );

    assert.deepEqual(queryPolicy, {
      permissionMode: "plan",
      installPermissionCallback: true,
    });
  });

  it("honors never approvals for approval-required workspace-write policy", () => {
    const queryPolicy = ClaudeAdapterV2.claudeRuntimeQueryPolicyForRuntimePolicy(
      ProviderAdapterV2RuntimePolicy.make({
        runtimeMode: "approval-required",
        interactionMode: "default",
        cwd: "/workspace",
        approvalPolicy: "never",
        sandboxPolicy: {
          type: "workspaceWrite",
        },
      }),
    );

    assert.deepEqual(queryPolicy, {
      permissionMode: "dontAsk",
      installPermissionCallback: false,
    });
  });

  it("honors never approvals for externally sandboxed policy", () => {
    const queryPolicy = ClaudeAdapterV2.claudeRuntimeQueryPolicyForRuntimePolicy(
      ProviderAdapterV2RuntimePolicy.make({
        runtimeMode: "approval-required",
        interactionMode: "default",
        cwd: "/workspace",
        approvalPolicy: "never",
        sandboxPolicy: {
          type: "externalSandbox",
        },
      }),
    );

    assert.deepEqual(queryPolicy, {
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      installPermissionCallback: false,
    });
  });
});

describe("ClaudeAdapterV2 MCP query overrides", () => {
  const CONTROL_MCP_SERVERS = {
    control: {
      type: "http",
      url: "http://127.0.0.1:43123/mcp",
      headers: {
        Authorization: "${CONTROL_MCP_AUTHORIZATION}",
      },
      timeout: ClaudeAdapterV2.CLAUDE_CONTROL_MCP_TOOL_TIMEOUT_MS,
    },
  } as const;
  const CONTROL_MCP_ENVIRONMENT = {
    CONTROL_MCP_AUTHORIZATION: "Bearer secret-claude-token",
  } as const;

  const withMcpSession = (threadId: ThreadId, run: () => void) => {
    McpProviderSession.setMcpProviderSession({
      environmentId: EnvironmentId.make(`environment-${threadId}`),
      threadId,
      providerSessionId: `mcp-session-${threadId}`,
      providerInstanceId: ProviderInstanceId.make("claudeAgent"),
      endpoint: "http://127.0.0.1:43123/mcp",
      authorizationHeader: "Bearer secret-claude-token",
      browserToolsAvailable: true,
    });
    try {
      run();
    } finally {
      McpProviderSession.clearMcpProviderSession(threadId);
    }
  };

  it("leaves an absent allowlist absent when no MCP session exists", () => {
    const overrides = ClaudeAdapterV2.claudeMcpQueryOverrides({
      threadId: ThreadId.make("thread-claude-no-mcp-no-allowlist"),
      readOnlySandbox: false,
    });

    assert.deepEqual(overrides, {});
  });

  it("preserves an explicit allowlist when no MCP session exists", () => {
    const overrides = ClaudeAdapterV2.claudeMcpQueryOverrides({
      threadId: ThreadId.make("thread-claude-no-mcp-with-allowlist"),
      readOnlySandbox: false,
      allowedTools: ["Read"],
    });

    assert.deepEqual(overrides, { allowedTools: ["Read"] });
  });

  it("pre-approves all control tools when attaching an MCP session without an allowlist", () => {
    const threadId = ThreadId.make("thread-claude-mcp-no-allowlist");
    withMcpSession(threadId, () => {
      const overrides = ClaudeAdapterV2.claudeMcpQueryOverrides({
        threadId,
        readOnlySandbox: false,
      });

      assert.deepEqual(overrides, {
        allowedTools: [ClaudeAdapterV2.CLAUDE_CONTROL_MCP_TOOL_WILDCARD],
        mcpServers: CONTROL_MCP_SERVERS,
        mcpEnvironment: CONTROL_MCP_ENVIRONMENT,
      });
    });
  });

  it("extends an explicit allowlist with the control wildcard", () => {
    const threadId = ThreadId.make("thread-claude-mcp-with-allowlist");
    withMcpSession(threadId, () => {
      const overrides = ClaudeAdapterV2.claudeMcpQueryOverrides({
        threadId,
        readOnlySandbox: false,
        allowedTools: ["Read", "mcp__control__*"],
      });

      assert.deepEqual(overrides, {
        allowedTools: ["Read", "mcp__control__*"],
        mcpServers: CONTROL_MCP_SERVERS,
        mcpEnvironment: CONTROL_MCP_ENVIRONMENT,
      });
    });
  });

  it("pre-approves only read-only control tools in a read-only sandbox", () => {
    const threadId = ThreadId.make("thread-claude-mcp-read-only");
    withMcpSession(threadId, () => {
      const overrides = ClaudeAdapterV2.claudeMcpQueryOverrides({
        threadId,
        readOnlySandbox: true,
        allowedTools: [...ClaudeAdapterV2.CLAUDE_READ_ONLY_ALLOWED_TOOLS],
      });

      assert.deepEqual(overrides, {
        allowedTools: [
          ...ClaudeAdapterV2.CLAUDE_READ_ONLY_ALLOWED_TOOLS,
          ...ClaudeAdapterV2.CLAUDE_READ_ONLY_CONTROL_MCP_ALLOWED_TOOLS,
        ],
        mcpServers: CONTROL_MCP_SERVERS,
        mcpEnvironment: CONTROL_MCP_ENVIRONMENT,
      });
      assert.isFalse(
        overrides.allowedTools?.includes(ClaudeAdapterV2.CLAUDE_CONTROL_MCP_TOOL_WILDCARD),
      );
    });
  });

  it("pre-approves only read-only control tools in a read-only sandbox without an allowlist", () => {
    const threadId = ThreadId.make("thread-claude-mcp-read-only-no-allowlist");
    withMcpSession(threadId, () => {
      const overrides = ClaudeAdapterV2.claudeMcpQueryOverrides({
        threadId,
        readOnlySandbox: true,
      });

      assert.deepEqual(overrides.allowedTools, [
        ...ClaudeAdapterV2.CLAUDE_READ_ONLY_CONTROL_MCP_ALLOWED_TOOLS,
      ]);
    });
  });

  it("keys live-query reuse on the MCP-derived pre-approvals", () => {
    const threadId = ThreadId.make("thread-claude-mcp-query-key");
    withMcpSession(threadId, () => {
      const queryPolicy = ClaudeAdapterV2.claudeRuntimeQueryPolicyForRuntimePolicy(
        ProviderAdapterV2RuntimePolicy.make({
          runtimeMode: "full-access",
          interactionMode: "default",
          cwd: "/workspace",
          approvalPolicy: "on-request",
          sandboxPolicy: {
            type: "readOnly",
            access: { type: "fullAccess" },
            networkAccess: false,
          },
        }),
      );

      const readOnlyKey = ClaudeAdapterV2.claudeEffectiveQueryPolicyKey(
        queryPolicy,
        ClaudeAdapterV2.claudeMcpQueryOverrides({ threadId, readOnlySandbox: true }),
      );
      const fullAccessKey = ClaudeAdapterV2.claudeEffectiveQueryPolicyKey(
        queryPolicy,
        ClaudeAdapterV2.claudeMcpQueryOverrides({ threadId, readOnlySandbox: false }),
      );
      const detachedKey = ClaudeAdapterV2.claudeEffectiveQueryPolicyKey(queryPolicy, {});

      assert.notEqual(readOnlyKey, fullAccessKey);
      assert.notEqual(fullAccessKey, detachedKey);
    });
  });

  it("invalidates live-query reuse when MCP credentials rotate", () => {
    const threadId = ThreadId.make("thread-claude-mcp-credential-rotation");
    withMcpSession(threadId, () => {
      const queryPolicy = ClaudeAdapterV2.claudeRuntimeQueryPolicyForRuntimePolicy(
        ProviderAdapterV2RuntimePolicy.make({
          runtimeMode: "approval-required",
          interactionMode: "default",
          cwd: "/workspace",
        }),
      );
      const initialKey = ClaudeAdapterV2.claudeEffectiveQueryPolicyKey(
        queryPolicy,
        ClaudeAdapterV2.claudeMcpQueryOverrides({ threadId, readOnlySandbox: false }),
      );

      McpProviderSession.setMcpProviderSession({
        environmentId: EnvironmentId.make(`environment-${threadId}`),
        threadId,
        providerSessionId: `mcp-session-${threadId}`,
        providerInstanceId: ProviderInstanceId.make("claudeAgent"),
        endpoint: "http://127.0.0.1:43123/mcp",
        authorizationHeader: "Bearer rotated-claude-token",
        browserToolsAvailable: true,
      });

      const rotatedKey = ClaudeAdapterV2.claudeEffectiveQueryPolicyKey(
        queryPolicy,
        ClaudeAdapterV2.claudeMcpQueryOverrides({ threadId, readOnlySandbox: false }),
      );
      assert.notEqual(rotatedKey, initialKey);
    });
  });

  it("matches the read-only allowlist to the orchestrator toolkit annotations", () => {
    const readOnlyToolNames = [
      ...Object.values(OrchestratorToolkit.tools),
      ...Object.values(ThreadToolkit.tools),
      ...Object.values(WorktreeToolkit.tools),
      ...Object.values(ProjectToolkit.tools),
      ...Object.values(EnvironmentToolkit.tools),
      ...Object.values(LocalModelsToolkit.tools),
      ...Object.values(PreviewControlsToolkit.tools),
      ...Object.values(HtmlToolkit.tools),
    ]
      .filter((tool) => Context.get(tool.annotations, Tool.Readonly))
      .map((tool) => `mcp__control__${tool.name}`)
      .sort();

    assert.deepEqual(
      [...ClaudeAdapterV2.CLAUDE_READ_ONLY_CONTROL_MCP_ALLOWED_TOOLS].sort(),
      readOnlyToolNames,
    );
  });
});

describe("ClaudeAdapterV2 native protocol logging", () => {
  it("injects thread-scoped MCP configuration without logging the credential", () => {
    const threadId = ThreadId.make("thread-claude-mcp");
    McpProviderSession.setMcpProviderSession({
      environmentId: EnvironmentId.make("environment-claude-mcp"),
      threadId,
      providerSessionId: "mcp-session-claude",
      providerInstanceId: ProviderInstanceId.make("claudeAgent"),
      endpoint: "http://127.0.0.1:43123/mcp",
      authorizationHeader: "Bearer secret-claude-token",
      browserToolsAvailable: true,
    });

    try {
      const overrides = ClaudeAdapterV2.claudeMcpQueryOverrides({
        threadId,
        readOnlySandbox: false,
        allowedTools: ["Read"],
      });
      assert.deepEqual(overrides, {
        allowedTools: ["Read", "mcp__control__*"],
        mcpServers: {
          control: {
            type: "http",
            url: "http://127.0.0.1:43123/mcp",
            headers: {
              Authorization: "${CONTROL_MCP_AUTHORIZATION}",
            },
            timeout: ClaudeAdapterV2.CLAUDE_CONTROL_MCP_TOOL_TIMEOUT_MS,
          },
        },
        mcpEnvironment: { CONTROL_MCP_AUTHORIZATION: "Bearer secret-claude-token" },
      });

      const options = ClaudeAdapterV2.makeClaudeQueryOptions({
        modelSelection: {
          instanceId: ProviderInstanceId.make("claudeAgent"),
          model: "claude-sonnet-4-6",
        },
        nativeThreadId: "native-thread-claude-mcp",
        resume: false,
        cwd: "/workspace",
        allowedTools: overrides.allowedTools ?? [],
        mcpServers: overrides.mcpServers ?? {},
        environment: { ...overrides.mcpEnvironment },
      });
      // mcpServers becomes a CLI argument, readable by every local user; the
      // credential may only travel in the child's environment.
      assert.notInclude(JSON.stringify(options.mcpServers), "secret-claude-token");
      assert.equal(options.env?.CONTROL_MCP_AUTHORIZATION, "Bearer secret-claude-token");
      assert.isObject(options.systemPrompt);
      const systemPrompt = options.systemPrompt as {
        readonly type: string;
        readonly preset: string;
        readonly append?: string;
      };
      assert.equal(systemPrompt.type, "preset");
      assert.equal(systemPrompt.preset, "claude_code");
      assert.include(systemPrompt.append ?? "", "Use `delegate_task`");
      const logged = ClaudeAdapterV2.loggedClaudeQueryOptions(options);
      assert.equal(logged.hasMcpServers, true);
      assert.notInclude(JSON.stringify(logged), "secret-claude-token");
    } finally {
      McpProviderSession.clearMcpProviderSession(threadId);
    }
  });

  it.effect("writes Claude Agent SDK protocol frames to the native provider log", () =>
    Effect.gen(function* () {
      const writes: Array<{
        readonly event: unknown;
        readonly threadId: ThreadId | null;
      }> = [];
      const logger: EventNdjsonLogger = {
        filePath: "/tmp/events.log",
        write: (event, threadId) =>
          Effect.sync(() => {
            writes.push({ event, threadId });
          }),
        close: () => Effect.void,
      };
      const threadId = ThreadId.make("thread-1");
      const providerSessionId = ProviderSessionId.make("provider-session-1");
      const protocolLogger = ClaudeAdapterV2.makeClaudeAgentSdkProtocolLogger({
        nativeEventLogger: logger,
        threadId,
        providerSessionId,
      });

      assert.notEqual(protocolLogger, undefined);
      if (protocolLogger === undefined) {
        return;
      }

      yield* protocolLogger({
        direction: "incoming",
        stage: "decoded",
        payload: {
          type: "stream_event",
          uuid: "00000000-0000-0000-0000-000000000001",
          session_id: "native-thread",
          parent_tool_use_id: null,
          event: {
            type: "content_block_delta",
            index: 0,
            delta: {
              type: "text_delta",
              get text(): string {
                throw new Error("streaming text must not be inspected");
              },
            },
          },
        },
      });
      yield* protocolLogger({
        direction: "outgoing",
        stage: "decoded",
        payload: {
          type: "query.interrupt",
        },
      });

      assert.equal(writes.length, 1);
      assert.equal(writes[0]?.threadId, threadId);
      assert.deepEqual(writes[0]?.event, {
        provider: "claudeAgent",
        protocol: ClaudeAdapterV2.CLAUDE_AGENT_SDK_QUERY_PROTOCOL,
        kind: "protocol",
        providerSessionId,
        event: {
          direction: "outgoing",
          stage: "decoded",
          payload: {
            type: "query.interrupt",
          },
        },
      });
    }),
  );

  it("logs query options without leaking environment values or callback functions", () => {
    const options: ClaudeAdapterV2.ClaudeAgentSdkQueryOptions = {
      model: "claude-sonnet-4-6",
      tools: {
        type: "preset",
        preset: "claude_code",
      },
      permissionMode: "default",
      sessionId: "native-thread-1",
      cwd: "/workspace",
      env: {
        ANTHROPIC_API_KEY: "secret",
      },
      extraArgs: {
        "append-system-prompt": "secret launch prompt",
      },
      canUseTool: (_toolName, input, callbackOptions) =>
        Promise.resolve({
          behavior: "allow",
          updatedInput: input,
          toolUseID: callbackOptions.toolUseID,
          decisionClassification: "user_temporary",
        }),
    };

    assert.deepEqual(ClaudeAdapterV2.loggedClaudeQueryOptions(options), {
      model: "claude-sonnet-4-6",
      tools: {
        type: "preset",
        preset: "claude_code",
      },
      permissionMode: "default",
      sessionId: "native-thread-1",
      cwd: "/workspace",
      hasCanUseTool: true,
      hasEnvironment: true,
      hasExtraArgs: true,
    });
    assert.notInclude(
      JSON.stringify(ClaudeAdapterV2.loggedClaudeQueryOptions(options)),
      "secret launch prompt",
    );
  });
});

describe("ClaudeAdapterV2 context usage", () => {
  it("projects assistant usage against the selected context window", () => {
    const usage = ClaudeAdapterV2.claudeProviderTurnTokenUsage(
      {
        input_tokens: 42_000,
        cache_creation_input_tokens: 2_000,
        cache_read_input_tokens: 5_000,
        output_tokens: 1_000,
      },
      CLAUDE_TEST_MODEL_SELECTION,
      "2026-08-29T00:00:00.000Z",
    );

    assert.deepEqual(usage, {
      usedTokens: 50_000,
      maxTokens: 200_000,
      inputTokens: 49_000,
      cachedInputTokens: 5_000,
      outputTokens: 1_000,
      reasoningOutputTokens: 0,
      updatedAt: "2026-08-29T00:00:00.000Z",
    });
  });
});

describe("ClaudeAdapterV2 session permissions", () => {
  it("keeps explicit user refusals classified as user_reject", () => {
    const result = ClaudeAdapterV2.permissionResultFromDecision({
      toolName: "Bash",
      decision: "decline",
      toolInput: { command: "make" },
      toolUseID: "denied-build",
    });
    assert.equal(result.behavior, "deny");
    if (result.behavior !== "deny") return;
    assert.equal(result.decisionClassification, "user_reject");
    assert.equal(result.message, "User declined tool execution.");
    assert.equal(result.interrupt, undefined);
  });

  it("forces suggested permission updates to session scope", () => {
    const result = ClaudeAdapterV2.permissionResultFromDecision({
      toolName: "Bash",
      decision: "acceptForSession",
      toolInput: { command: "git status" },
      toolUseID: "tool-1",
      suggestions: [
        {
          type: "addRules",
          rules: [{ toolName: "Bash", ruleContent: "git status" }],
          behavior: "allow",
          destination: "localSettings",
        },
      ],
    });

    assert.equal(result.behavior, "allow");
    if (result.behavior !== "allow") {
      return;
    }
    assert.deepEqual(result.updatedPermissions, [
      {
        type: "addRules",
        rules: [{ toolName: "Bash", ruleContent: "git status" }],
        behavior: "allow",
        destination: "session",
      },
    ]);
  });

  it("adds a whole-tool session rule when Claude offers no suggestion", () => {
    const result = ClaudeAdapterV2.permissionResultFromDecision({
      toolName: "mcp__acme__custom_tool",
      decision: "acceptForSession",
      toolInput: {},
      toolUseID: "tool-2",
    });

    assert.equal(result.behavior, "allow");
    if (result.behavior !== "allow") {
      return;
    }
    assert.deepEqual(result.updatedPermissions, [
      {
        type: "addRules",
        rules: [{ toolName: "mcp__acme__custom_tool" }],
        behavior: "allow",
        destination: "session",
      },
    ]);
  });
});

describe("ClaudeAdapterV2 lock", () => {
  it.effect("marks a chat's turns as CONTROL's, so the lock's terminal hook lets them pass", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const attachmentsDir = yield* fileSystem.makeTempDirectoryScoped({
          prefix: "control-claude-lock-",
        });
        let openedOptions: ClaudeAdapterV2.ClaudeAgentSdkQueryOptions | undefined;
        const adapter = ClaudeAdapterV2.makeClaudeAdapterV2({
          instanceId: ClaudeAdapterV2.CLAUDE_DEFAULT_INSTANCE_ID,
          settings: DEFAULT_CLAUDE_SETTINGS,
          environment: { CLAUDE_CONFIG_DIR: "/claude-home" },
          attachmentsDir,
          fileSystem,
          path: yield* Path.Path,
          crypto: yield* Crypto.Crypto,
          idAllocator: yield* IdAllocator.IdAllocatorV2,
          queryRunner: {
            allocateSessionId: Effect.succeed("native-thread-claude-lock"),
            open: (input) =>
              Effect.sync(() => {
                openedOptions = input.options;
                return {
                  messages: Stream.never,
                  offer: () => Effect.void,
                  setModel: () => Effect.void,
                  setPermissionMode: () => Effect.void,
                  backgroundTasks: () => Effect.succeed(false),
                  interrupt: Effect.void,
                  close: Effect.void,
                };
              }),
            forkSession: () => Effect.die("unused"),
            subagentLaunchToolUseId: () => Effect.succeed(null),
            assertComplete: Effect.void,
          },
        });
        const runtimePolicy = ProviderAdapterV2RuntimePolicy.make({
          runtimeMode: "full-access",
          interactionMode: "default",
          cwd: "/workspace",
        });
        const threadId = ThreadId.make("thread-claude-lock");
        const runtime = yield* adapter.openSession({
          threadId,
          providerSessionId: ProviderSessionId.make("provider-session-claude-lock"),
          modelSelection: CLAUDE_TEST_MODEL_SELECTION,
          runtimePolicy,
        });
        const providerThread = yield* runtime.ensureThread({
          threadId,
          modelSelection: CLAUDE_TEST_MODEL_SELECTION,
          runtimePolicy,
        });
        yield* runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId,
            providerThread,
            now: yield* DateTime.now,
            attemptId: RunAttemptId.make("attempt-claude-lock"),
            text: "Carry on.",
            attachments: [],
            runtimePolicy,
          }),
        );
        assert.deepStrictEqual(openedOptions?.env, {
          CLAUDE_CONFIG_DIR: "/claude-home",
          CONTROL_CHAT: "1",
        });
      }),
    ).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
  );
});

describe("ClaudeAdapterV2 Auto-accept edits", () => {
  it.effect("asks before a command instead of allowing it", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const idAllocator = yield* IdAllocator.IdAllocatorV2;
        const attachmentsDir = yield* fileSystem.makeTempDirectoryScoped({
          prefix: "control-claude-accept-edits-",
        });
        let openedOptions: ClaudeAdapterV2.ClaudeAgentSdkQueryOptions | undefined;
        const adapter = ClaudeAdapterV2.makeClaudeAdapterV2({
          instanceId: ClaudeAdapterV2.CLAUDE_DEFAULT_INSTANCE_ID,
          settings: DEFAULT_CLAUDE_SETTINGS,
          environment: {},
          attachmentsDir,
          fileSystem,
          path: yield* Path.Path,
          crypto: yield* Crypto.Crypto,
          idAllocator,
          queryRunner: {
            allocateSessionId: Effect.succeed("native-thread-claude-accept-edits"),
            open: (input) =>
              Effect.sync(() => {
                openedOptions = input.options;
                return {
                  messages: Stream.never,
                  offer: () => Effect.void,
                  setModel: () => Effect.void,
                  setPermissionMode: () => Effect.void,
                  backgroundTasks: () => Effect.succeed(false),
                  interrupt: Effect.void,
                  close: Effect.void,
                };
              }),
            forkSession: () => Effect.die("unused"),
            subagentLaunchToolUseId: () => Effect.succeed(null),
            assertComplete: Effect.void,
          },
        });
        const runtimePolicy = ProviderAdapterV2RuntimePolicy.make({
          runtimeMode: "auto-accept-edits",
          interactionMode: "default",
          cwd: "/workspace",
        });
        const threadId = ThreadId.make("thread-claude-accept-edits");
        const runtime = yield* adapter.openSession({
          threadId,
          providerSessionId: ProviderSessionId.make("provider-session-claude-accept-edits"),
          modelSelection: CLAUDE_TEST_MODEL_SELECTION,
          runtimePolicy,
        });
        const providerThread = yield* runtime.ensureThread({
          threadId,
          modelSelection: CLAUDE_TEST_MODEL_SELECTION,
          runtimePolicy,
        });
        const now = yield* DateTime.now;
        yield* runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId,
            providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-accept-edits"),
            text: "Run node.",
            attachments: [],
            runtimePolicy,
          }),
        );
        assert.equal(openedOptions?.permissionMode, "acceptEdits");
        const canUseTool = openedOptions?.canUseTool;
        assert.isFunction(canUseTool);

        const requestEvent = yield* runtime.events.pipe(
          Stream.filter((event) => event.type === "runtime_request.updated"),
          Stream.runHead,
          Effect.forkScoped,
        );
        const command = { command: "node -e 'console.log(42)'" };
        const decision = yield* Effect.promise(() =>
          canUseTool!("Bash", command, {
            signal: new AbortController().signal,
            toolUseID: "tool-bash-accept-edits",
            requestId: "request-bash-accept-edits",
          }),
        ).pipe(Effect.forkScoped);
        // Without a callback that asks, the command is allowed before any
        // request is raised.
        const first = yield* Effect.raceFirst(
          Fiber.join(requestEvent).pipe(
            Effect.map((event) => ({ type: "request", event }) as const),
          ),
          Fiber.join(decision).pipe(
            Effect.map((result) => ({ type: "decision", result }) as const),
          ),
        );
        assert.equal(first.type, "request", "the command ran without asking");
        if (first.type !== "request") return;
        const event = first.event;
        if (Option.isNone(event) || event.value.type !== "runtime_request.updated") return;
        assert.equal(event.value.runtimeRequest.kind, "command");

        yield* runtime.respondToRuntimeRequest({
          requestId: event.value.runtimeRequest.id,
          decision: "accept",
        });
        assert.equal((yield* Fiber.join(decision))?.behavior, "allow");
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );
});

describe("ClaudeAdapterV2 owner asks", () => {
  it.effect(
    "asks the owner in the live turn, with Approve and Decline, and reports his answer",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fileSystem = yield* FileSystem.FileSystem;
          const attachmentsDir = yield* fileSystem.makeTempDirectoryScoped({
            prefix: "control-claude-owner-ask-",
          });
          const adapter = ClaudeAdapterV2.makeClaudeAdapterV2({
            instanceId: ClaudeAdapterV2.CLAUDE_DEFAULT_INSTANCE_ID,
            settings: DEFAULT_CLAUDE_SETTINGS,
            environment: {},
            attachmentsDir,
            fileSystem,
            path: yield* Path.Path,
            crypto: yield* Crypto.Crypto,
            idAllocator: yield* IdAllocator.IdAllocatorV2,
            queryRunner: {
              allocateSessionId: Effect.succeed("native-thread-claude-owner-ask"),
              open: () =>
                Effect.succeed({
                  messages: Stream.never,
                  offer: () => Effect.void,
                  setModel: () => Effect.void,
                  setPermissionMode: () => Effect.void,
                  backgroundTasks: () => Effect.succeed(false),
                  interrupt: Effect.void,
                  close: Effect.void,
                }),
              forkSession: () => Effect.die("unused"),
              subagentLaunchToolUseId: () => Effect.succeed(null),
              assertComplete: Effect.void,
            },
          });
          const runtimePolicy = ProviderAdapterV2RuntimePolicy.make({
            runtimeMode: "full-access",
            interactionMode: "default",
            cwd: "/workspace",
          });
          const threadId = ThreadId.make("thread-claude-owner-ask");
          const runtime = yield* adapter.openSession({
            threadId,
            providerSessionId: ProviderSessionId.make("provider-session-claude-owner-ask"),
            modelSelection: CLAUDE_TEST_MODEL_SELECTION,
            runtimePolicy,
          });
          const providerThread = yield* runtime.ensureThread({
            threadId,
            modelSelection: CLAUDE_TEST_MODEL_SELECTION,
            runtimePolicy,
          });
          const ask = {
            providerThread,
            toolName: "mcp__control__local_model_wake",
            title: "Wake a local model · over 40 GB",
            detail: "Llama 3.3 70B takes 42 GB and leaves 45 GB free.",
          };
          // Outside a turn there is no chat to ask in.
          assert.isTrue(Exit.isFailure(yield* Effect.exit(runtime.askOwner!(ask))));

          yield* runtime.startTurn(
            makeClaudeTestTurnInput({
              threadId,
              providerThread,
              now: yield* DateTime.now,
              attemptId: RunAttemptId.make("attempt-claude-owner-ask"),
              text: "Anonymise the inbox with the 70B.",
              attachments: [],
              runtimePolicy,
            }),
          );
          const answer = (decision: "accept" | "decline") =>
            Effect.gen(function* () {
              const raised = yield* runtime.events.pipe(
                Stream.filter((event) => event.type === "turn_item.updated"),
                Stream.map((event) => (event.type === "turn_item.updated" ? event.turnItem : null)),
                Stream.filter((item) => item?.type === "approval_request"),
                Stream.runHead,
                Effect.forkScoped,
              );
              const asked = yield* runtime.askOwner!(ask).pipe(Effect.forkScoped);
              const item = Option.getOrThrow(yield* Fiber.join(raised));
              if (item?.type !== "approval_request") return assert.fail("no approval was raised");
              assert.equal(item.requestKind, "permission");
              assert.equal(item.appName, "Wake a local model · over 40 GB");
              assert.equal(item.prompt, "Llama 3.3 70B takes 42 GB and leaves 45 GB free.");
              assert.deepEqual(
                item.options?.map((option) => option.label),
                ["Decline", "Approve"],
              );
              yield* runtime.respondToRuntimeRequest({ requestId: item.requestId, decision });
              return yield* Fiber.join(asked);
            });
          assert.isTrue(yield* answer("accept"));
          assert.isFalse(yield* answer("decline"));
        }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
      ),
  );
});

describe("ClaudeAdapterV2 quiet hold", () => {
  it.effect("holds a focus-stealing call for approval even with permissions bypassed", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const idAllocator = yield* IdAllocator.IdAllocatorV2;
        const attachmentsDir = yield* fileSystem.makeTempDirectoryScoped({
          prefix: "control-claude-quiet-hold-",
        });
        let openedOptions: ClaudeAdapterV2.ClaudeAgentSdkQueryOptions | undefined;
        const adapter = ClaudeAdapterV2.makeClaudeAdapterV2({
          instanceId: ClaudeAdapterV2.CLAUDE_DEFAULT_INSTANCE_ID,
          settings: DEFAULT_CLAUDE_SETTINGS,
          environment: {},
          attachmentsDir,
          fileSystem,
          path: yield* Path.Path,
          crypto: yield* Crypto.Crypto,
          idAllocator,
          queryRunner: {
            allocateSessionId: Effect.succeed("native-thread-claude-quiet-hold"),
            open: (input) =>
              Effect.sync(() => {
                openedOptions = input.options;
                return {
                  messages: Stream.never,
                  offer: () => Effect.void,
                  setModel: () => Effect.void,
                  setPermissionMode: () => Effect.void,
                  backgroundTasks: () => Effect.succeed(false),
                  interrupt: Effect.void,
                  close: Effect.void,
                };
              }),
            forkSession: () => Effect.die("unused"),
            subagentLaunchToolUseId: () => Effect.succeed(null),
            assertComplete: Effect.void,
          },
        });
        const runtimePolicy = ProviderAdapterV2RuntimePolicy.make({
          runtimeMode: "full-access",
          interactionMode: "default",
          cwd: "/workspace",
        });
        const threadId = ThreadId.make("thread-claude-quiet-hold");
        const runtime = yield* adapter.openSession({
          threadId,
          providerSessionId: ProviderSessionId.make("provider-session-claude-quiet-hold"),
          modelSelection: CLAUDE_TEST_MODEL_SELECTION,
          runtimePolicy,
        });
        const providerThread = yield* runtime.ensureThread({
          threadId,
          modelSelection: CLAUDE_TEST_MODEL_SELECTION,
          runtimePolicy,
        });
        const now = yield* DateTime.now;
        yield* runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId,
            providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-quiet-hold"),
            text: "Take a screenshot.",
            attachments: [],
            runtimePolicy,
          }),
        );
        assert.equal(openedOptions?.permissionMode, "bypassPermissions");
        const matcher = openedOptions?.hooks?.PreToolUse?.[0];
        assert.isDefined(matcher);
        const hook = matcher!.hooks[0]!;
        const preToolUse = (toolUseId: string, command: string) =>
          ({
            hook_event_name: "PreToolUse",
            session_id: "native-thread-claude-quiet-hold",
            transcript_path: "/tmp/transcript.jsonl",
            cwd: "/workspace",
            tool_name: "Bash",
            tool_input: { command },
            tool_use_id: toolUseId,
          }) as unknown as HookInput;

        const quiet = yield* Effect.promise(() =>
          hook(preToolUse("tool-quiet", "git status"), "tool-quiet", {
            signal: new AbortController().signal,
          }),
        );
        assert.deepEqual(quiet, {});

        const requestEvent = yield* runtime.events.pipe(
          Stream.filter((event) => event.type === "runtime_request.updated"),
          Stream.runHead,
          Effect.forkScoped,
        );
        const held = yield* Effect.promise(() =>
          hook(preToolUse("tool-shot", "screencapture -x /tmp/a.png"), "tool-shot", {
            signal: new AbortController().signal,
          }),
        ).pipe(Effect.forkScoped);
        const first = yield* Effect.raceFirst(
          Fiber.join(requestEvent).pipe(
            Effect.map((event) => ({ type: "request", event }) as const),
          ),
          Fiber.join(held).pipe(Effect.map((result) => ({ type: "decision", result }) as const)),
        );
        assert.equal(first.type, "request", "the screenshot ran without asking");
        if (first.type !== "request") return;
        const event = first.event;
        if (Option.isNone(event) || event.value.type !== "runtime_request.updated") return;
        assert.equal(event.value.runtimeRequest.kind, "command");

        yield* runtime.respondToRuntimeRequest({
          requestId: event.value.runtimeRequest.id,
          decision: "accept",
        });
        const result = (yield* Fiber.join(held)) as {
          readonly hookSpecificOutput?: { readonly permissionDecision?: string };
        };
        assert.equal(result.hookSpecificOutput?.permissionDecision, "allow");
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );
});

describe("ClaudeAdapterV2 approval cancellation", () => {
  it.effect("observes an approval signal that was already aborted", () =>
    Effect.gen(function* () {
      const decision = yield* Deferred.make<ProviderApprovalDecision>();
      const controller = new AbortController();
      controller.abort();

      const result = yield* ClaudeAdapterV2.awaitClaudeApprovalDecision(
        decision,
        controller.signal,
      );

      assert.equal(result, "cancel");
    }),
  );

  it.effect("removes the cancellation listener after approval resolves", () =>
    Effect.gen(function* () {
      const decision = yield* Deferred.make<ProviderApprovalDecision>();
      const controller = new AbortController();
      let removes = 0;
      const removeEventListener = controller.signal.removeEventListener.bind(controller.signal);
      controller.signal.removeEventListener = (...args) => {
        removes += 1;
        return removeEventListener(...args);
      };
      const fiber = yield* Effect.forkChild(
        ClaudeAdapterV2.awaitClaudeApprovalDecision(decision, controller.signal),
      );
      yield* Effect.yieldNow;
      yield* Deferred.succeed(decision, "accept");
      const result = yield* Fiber.join(fiber);

      assert.equal(result, "accept");
      assert.equal(removes, 1);
    }),
  );
});

// Opens a session with the given configured binary path, runs one turn, and
// returns the executable paths the SDK was asked to spawn.
const captureSdkExecutablePaths = Effect.fn("captureSdkExecutablePaths")(function* (
  binaryPath: string,
) {
  const executablePaths: Array<string | undefined> = [];
  const adapter = yield* ClaudeAdapterV2.createClaudeAdapterV2(
    {
      instanceId: ClaudeAdapterV2.CLAUDE_DEFAULT_INSTANCE_ID,
      displayName: undefined,
      environment: [],
      enabled: true,
      config: { ...DEFAULT_CLAUDE_SETTINGS, binaryPath },
    },
    {},
  ).pipe(
    Effect.provide(
      ServerConfig.layerTest(process.cwd(), {
        prefix: "control-claude-binary-path-",
      }),
    ),
    Effect.provideService(ClaudeAdapterV2.ClaudeAgentSdkQueryRunner, {
      allocateSessionId: Effect.succeed("native-thread-claude-binary-path"),
      open: (input) =>
        Effect.sync(() => {
          executablePaths.push(input.options.pathToClaudeCodeExecutable);
          return {
            messages: Stream.never,
            offer: () => Effect.void,
            setModel: () => Effect.void,
            setPermissionMode: () => Effect.void,
            backgroundTasks: () => Effect.succeed(false),
            interrupt: Effect.void,
            close: Effect.void,
          };
        }),
      forkSession: () => Effect.die("unused"),
      subagentLaunchToolUseId: () => Effect.succeed(null),
      assertComplete: Effect.void,
    }),
  );
  const threadId = ThreadId.make("thread-claude-binary-path");
  const runtime = yield* adapter.openSession({
    threadId,
    providerSessionId: ProviderSessionId.make("provider-session-claude-binary-path"),
    modelSelection: CLAUDE_TEST_MODEL_SELECTION,
    runtimePolicy: CLAUDE_TEST_RUNTIME_POLICY,
  });
  const providerThread = yield* runtime.ensureThread({
    threadId,
    modelSelection: CLAUDE_TEST_MODEL_SELECTION,
    runtimePolicy: CLAUDE_TEST_RUNTIME_POLICY,
  });
  yield* runtime.startTurn(
    makeClaudeTestTurnInput({
      threadId,
      providerThread,
      now: yield* DateTime.now,
      attemptId: RunAttemptId.make("attempt-claude-binary-path"),
      text: "hello",
      attachments: [],
    }),
  );
  return executablePaths;
});

describe("ClaudeAdapterV2 executable path", () => {
  it.effect("expands ~ in the configured binary path for the SDK", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const executablePaths = yield* captureSdkExecutablePaths("~/bin/claude");

        assert.deepEqual(executablePaths, [path.join(NodeOS.homedir(), "bin", "claude")]);
      }),
    ).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
  );

  it.effect("follows a bare claude on Windows to the npm package executable", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const npmDir = "C:\\Users\\dev\\AppData\\Roaming\\npm";
        const packageExe = `${npmDir}\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe`;
        const executablePaths = yield* captureSdkExecutablePaths("claude").pipe(
          Effect.provideService(HostProcessPlatform, "win32"),
          Effect.provideService(SpawnExecutableResolution, () => `${npmDir}\\claude.cmd`),
          Effect.provideService(ClaudeExecutableFileCheck, (filePath) => filePath === packageExe),
        );

        assert.deepEqual(executablePaths, [packageExe]);
      }),
    ).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
  );
});

describe("ClaudeAdapterV2 resume compaction", () => {
  it.effect("resolves and cancels the SDK resume dialog through structured runtime input", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const idAllocator = yield* IdAllocator.IdAllocatorV2;
        const attachmentsDir = yield* fileSystem.makeTempDirectoryScoped({
          prefix: "control-claude-resume-",
        });
        let openedOptions: ClaudeAdapterV2.ClaudeAgentSdkQueryOptions | undefined;
        const adapter = ClaudeAdapterV2.makeClaudeAdapterV2({
          instanceId: ClaudeAdapterV2.CLAUDE_DEFAULT_INSTANCE_ID,
          settings: DEFAULT_CLAUDE_SETTINGS,
          environment: {},
          attachmentsDir,
          fileSystem,
          path: yield* Path.Path,
          crypto: yield* Crypto.Crypto,
          idAllocator,
          queryRunner: {
            allocateSessionId: Effect.succeed("native-thread-claude-resume"),
            open: (input) =>
              Effect.sync(() => {
                openedOptions = input.options;
                return {
                  messages: Stream.never,
                  offer: () => Effect.void,
                  setModel: () => Effect.void,
                  setPermissionMode: () => Effect.void,
                  backgroundTasks: () => Effect.succeed(false),
                  interrupt: Effect.void,
                  close: Effect.void,
                };
              }),
            forkSession: () => Effect.die("unused"),
            subagentLaunchToolUseId: () => Effect.succeed(null),
            assertComplete: Effect.void,
          },
        });
        const threadId = ThreadId.make("thread-claude-resume");
        const runtime = yield* adapter.openSession({
          threadId,
          providerSessionId: ProviderSessionId.make("provider-session-claude-resume"),
          modelSelection: CLAUDE_TEST_MODEL_SELECTION,
          runtimePolicy: CLAUDE_TEST_RUNTIME_POLICY,
        });
        const providerThread = yield* runtime.ensureThread({
          threadId,
          modelSelection: CLAUDE_TEST_MODEL_SELECTION,
          runtimePolicy: CLAUDE_TEST_RUNTIME_POLICY,
        });
        const now = yield* DateTime.now;
        yield* runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId,
            providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-resume"),
            text: "continue",
            attachments: [],
          }),
        );
        const callback = openedOptions?.onUserDialog;
        assert.isFunction(callback);
        const canUseTool = openedOptions?.canUseTool;
        assert.isFunction(canUseTool);
        const longQuestion = `Choose a deployment target: ${"region ".repeat(80)}`;
        const questionRequestEvent = yield* runtime.events.pipe(
          Stream.filter((event) => event.type === "runtime_request.updated"),
          Stream.runHead,
          Effect.forkScoped,
        );
        const questionResult = yield* Effect.promise(() =>
          canUseTool!(
            "AskUserQuestion",
            {
              questions: [
                {
                  header: "Target",
                  question: longQuestion,
                  options: [
                    { label: "Production", description: "Deploy to production." },
                    { label: "Staging", description: "Deploy to staging." },
                  ],
                  multiSelect: true,
                },
              ],
            },
            {
              signal: new AbortController().signal,
              toolUseID: "tool-question-full-access",
              requestId: "request-question-full-access",
            },
          ),
        ).pipe(Effect.forkScoped);
        const questionEvent = yield* Fiber.join(questionRequestEvent);
        assert.isTrue(Option.isSome(questionEvent));
        if (
          Option.isNone(questionEvent) ||
          questionEvent.value.type !== "runtime_request.updated"
        ) {
          return;
        }
        yield* runtime.respondToRuntimeRequest({
          requestId: questionEvent.value.runtimeRequest.id,
          answers: { [longQuestion]: ["Production", "Staging"] },
        });
        assert.deepEqual(yield* Fiber.join(questionResult), {
          behavior: "allow",
          updatedInput: {
            questions: [
              {
                header: "Target",
                question: longQuestion,
                options: [
                  { label: "Production", description: "Deploy to production." },
                  { label: "Staging", description: "Deploy to staging." },
                ],
                multiSelect: true,
              },
            ],
            answers: { [longQuestion]: "Production, Staging" },
          },
          toolUseID: "tool-question-full-access",
        });
        const longPlan = `# Deployment plan\n\n${"Validate every region before promotion.\n".repeat(120)}`;
        const proposedPlanEvent = yield* runtime.events.pipe(
          Stream.filter((event) => event.type === "plan.updated"),
          Stream.runHead,
          Effect.forkScoped,
        );
        const exitPlanResult = yield* Effect.promise(() =>
          canUseTool!(
            "ExitPlanMode",
            { plan: longPlan },
            {
              signal: new AbortController().signal,
              toolUseID: "tool-exit-plan-full-access",
              requestId: "request-exit-plan-full-access",
            },
          ),
        );
        assert.deepEqual(exitPlanResult, {
          behavior: "deny",
          message:
            "The client captured your proposed plan. Stop here and wait for the user's feedback or implementation request in a later turn.",
          toolUseID: "tool-exit-plan-full-access",
        });
        const planEvent = yield* Fiber.join(proposedPlanEvent);
        assert.isTrue(Option.isSome(planEvent));
        if (Option.isSome(planEvent) && planEvent.value.type === "plan.updated") {
          assert.equal(planEvent.value.plan.kind, "proposed_plan");
          if (planEvent.value.plan.kind === "proposed_plan") {
            assert.equal(planEvent.value.plan.markdown, longPlan.trim());
          }
        }
        const requestEvent = yield* runtime.events
          .pipe(
            Stream.filter((event) => event.type === "runtime_request.updated"),
            Stream.runHead,
          )
          .pipe(Effect.forkScoped);
        const controller = new AbortController();
        const dialog = yield* Effect.promise(() =>
          callback!(
            {
              dialogKind: "resume_return",
              payload: { sessionAgeMinutes: 90, estimatedTokens: 120000 },
            },
            { signal: controller.signal, requestId: "dialog-resume-1" },
          ),
        ).pipe(Effect.forkScoped);
        const event = yield* Fiber.join(requestEvent);
        assert.isTrue(Option.isSome(event));
        if (Option.isNone(event) || event.value.type !== "runtime_request.updated") return;
        const question = formatClaudeResumeCompactionQuestion({
          ageMinutes: 90,
          estimatedTokens: 120000,
        });
        yield* runtime.respondToRuntimeRequest({
          requestId: event.value.runtimeRequest.id,
          answers: { [question]: "Compact and continue" },
        });
        assert.deepEqual(yield* Fiber.join(dialog), { behavior: "completed", result: "compact" });

        const cancelledController = new AbortController();
        cancelledController.abort();
        assert.deepEqual(
          yield* Effect.promise(() =>
            callback!(
              {
                dialogKind: "resume_return",
                payload: { sessionAgeMinutes: 90, estimatedTokens: 120000 },
              },
              { signal: cancelledController.signal, requestId: "dialog-resume-2" },
            ),
          ),
          { behavior: "cancelled" },
        );
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );
});

describe("ClaudeAdapterV2 attachments", () => {
  it.effect("forwards images and references generic files on sends and steering", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const idAllocator = yield* IdAllocator.IdAllocatorV2;
        const path = yield* Path.Path;
        const attachmentsDir = yield* fileSystem.makeTempDirectoryScoped({
          prefix: "control-claude-v2-attachments-",
        });
        const offeredMessages: Array<SDKUserMessage> = [];
        const adapter = ClaudeAdapterV2.makeClaudeAdapterV2({
          instanceId: ClaudeAdapterV2.CLAUDE_DEFAULT_INSTANCE_ID,
          settings: DEFAULT_CLAUDE_SETTINGS,
          environment: {},
          attachmentsDir,
          fileSystem,
          path: yield* Path.Path,
          crypto: yield* Crypto.Crypto,
          idAllocator,
          queryRunner: {
            allocateSessionId: Effect.succeed("native-thread-claude-attachments"),
            open: () =>
              Effect.succeed({
                messages: Stream.never,
                offer: (message) =>
                  Effect.sync(() => {
                    offeredMessages.push(message);
                  }),
                setModel: () => Effect.void,
                setPermissionMode: () => Effect.void,
                backgroundTasks: () => Effect.succeed(false),
                interrupt: Effect.void,
                close: Effect.void,
              }),
            forkSession: () => Effect.die("unused forkSession"),
            subagentLaunchToolUseId: () => Effect.succeed(null),
            assertComplete: Effect.void,
          },
        });
        const threadId = ThreadId.make("thread-claude-attachments");
        const providerSessionId = ProviderSessionId.make("provider-session-claude-attachments");
        const runtime = yield* adapter.openSession({
          threadId,
          providerSessionId,
          modelSelection: CLAUDE_TEST_MODEL_SELECTION,
          runtimePolicy: CLAUDE_TEST_RUNTIME_POLICY,
        });
        const providerThread = yield* runtime.ensureThread({
          threadId,
          modelSelection: CLAUDE_TEST_MODEL_SELECTION,
          runtimePolicy: CLAUDE_TEST_RUNTIME_POLICY,
        });
        const attachment = ChatImageAttachment.make({
          type: "image",
          id: ChatAttachmentId.make(
            "thread-claude-attachments-12345678-1234-1234-1234-123456789abc",
          ),
          name: "diagram.png",
          mimeType: "image/png",
          sizeBytes: 4,
        });
        const document = ChatFileAttachment.make({
          type: "file",
          id: ChatAttachmentId.make(
            "thread-claude-attachments-abcdefab-1234-1234-1234-123456789abc",
          ),
          name: "requirements.pdf",
          mimeType: "application/pdf",
          sizeBytes: 4,
        });
        yield* fileSystem.writeFile(
          path.join(attachmentsDir, attachmentRelativePath(attachment)!),
          Uint8Array.from([1, 2, 3, 4]),
        );
        yield* fileSystem.writeFile(
          path.join(attachmentsDir, attachmentRelativePath(document)!),
          Uint8Array.from([5, 6, 7, 8]),
        );
        const attemptId = RunAttemptId.make("attempt-claude-attachments");
        const now = yield* DateTime.now;

        yield* runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId,
            providerThread,
            now,
            attemptId,
            text: "What's in this image?",
            attachments: [attachment, document],
          }),
        );

        const expectedImageBlock = {
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: "AQIDBA==",
          },
        } as const;
        const expectedAttachmentPath = path.join(
          attachmentsDir,
          attachmentRelativePath(attachment)!,
        );
        const expectedDocumentPath = path.join(attachmentsDir, attachmentRelativePath(document)!);
        assert.deepEqual(offeredMessages[0]?.message.content, [
          expectedImageBlock,
          {
            type: "text",
            text: `Ultrathink:\nWhat's in this image?\n\n[Attached image "diagram.png" is saved at: ${expectedAttachmentPath}]\n\n[Attached file "requirements.pdf" is saved at: ${expectedDocumentPath}]`,
          },
        ]);

        const providerTurnId = idAllocator.derive.providerTurn({
          driver: ClaudeAdapterV2.CLAUDE_PROVIDER,
          nativeTurnId: `turn:${attemptId}`,
        });
        yield* runtime.steerTurn({
          threadId,
          runId: RunId.make("run-claude-attachments"),
          providerThread,
          providerTurnId,
          message: {
            createdBy: "user",
            creationSource: "web",
            messageId: MessageId.make("message-claude-attachments-steer"),
            text: "Focus on the diagram labels.",
            attachments: [attachment, document],
          },
        });

        assert.equal(offeredMessages[1]?.priority, "now");
        assert.deepEqual(offeredMessages[1]?.message.content, [
          expectedImageBlock,
          {
            type: "text",
            text: `Ultrathink:\nFocus on the diagram labels.\n\n[Attached image "diagram.png" is saved at: ${expectedAttachmentPath}]\n\n[Attached file "requirements.pdf" is saved at: ${expectedDocumentPath}]`,
          },
        ]);
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );

  it.effect("rejects unsupported image types before opening a provider query", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const idAllocator = yield* IdAllocator.IdAllocatorV2;
        const attachmentsDir = yield* fileSystem.makeTempDirectoryScoped({
          prefix: "control-claude-v2-unsupported-attachment-",
        });
        let openCount = 0;
        const adapter = ClaudeAdapterV2.makeClaudeAdapterV2({
          instanceId: ClaudeAdapterV2.CLAUDE_DEFAULT_INSTANCE_ID,
          settings: DEFAULT_CLAUDE_SETTINGS,
          environment: {},
          attachmentsDir,
          fileSystem,
          path: yield* Path.Path,
          crypto: yield* Crypto.Crypto,
          idAllocator,
          queryRunner: {
            allocateSessionId: Effect.succeed("native-thread-claude-unsupported-attachment"),
            open: () =>
              Effect.sync(() => {
                openCount += 1;
                return {
                  messages: Stream.never,
                  offer: () => Effect.void,
                  setModel: () => Effect.void,
                  setPermissionMode: () => Effect.void,
                  backgroundTasks: () => Effect.succeed(false),
                  interrupt: Effect.void,
                  close: Effect.void,
                };
              }),
            forkSession: () => Effect.die("unused forkSession"),
            subagentLaunchToolUseId: () => Effect.succeed(null),
            assertComplete: Effect.void,
          },
        });
        const threadId = ThreadId.make("thread-claude-unsupported-attachment");
        const runtime = yield* adapter.openSession({
          threadId,
          providerSessionId: ProviderSessionId.make(
            "provider-session-claude-unsupported-attachment",
          ),
          modelSelection: CLAUDE_TEST_MODEL_SELECTION,
          runtimePolicy: CLAUDE_TEST_RUNTIME_POLICY,
        });
        const providerThread = yield* runtime.ensureThread({
          threadId,
          modelSelection: CLAUDE_TEST_MODEL_SELECTION,
          runtimePolicy: CLAUDE_TEST_RUNTIME_POLICY,
        });
        const attachment = ChatImageAttachment.make({
          type: "image",
          id: ChatAttachmentId.make(
            "thread-claude-unsupported-12345678-1234-1234-1234-123456789abc",
          ),
          name: "diagram.svg",
          mimeType: "image/svg+xml",
          sizeBytes: 4,
        });
        const now = yield* DateTime.now;

        const error = yield* runtime
          .startTurn(
            makeClaudeTestTurnInput({
              threadId,
              providerThread,
              now,
              attemptId: RunAttemptId.make("attempt-claude-unsupported-attachment"),
              text: "Inspect this image.",
              attachments: [attachment],
            }),
          )
          .pipe(Effect.flip);

        assert.equal(error._tag, "ProviderAdapterTurnStartError");
        assert.include(String(error.cause), "Unsupported Claude image attachment type");
        assert.equal(openCount, 0);
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );
});

describe("ClaudeAdapterV2 native fork", () => {
  it.effect("forks at the source assistant cursor and resumes the forked session", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const idAllocator = yield* IdAllocator.IdAllocatorV2;
        const attachmentsDir = yield* fileSystem.makeTempDirectoryScoped({
          prefix: "control-claude-v2-fork-attachments-",
        });
        const openedQueries: Array<ClaudeAdapterV2.ClaudeAgentSdkQueryOpenInput> = [];
        const forkCalls: Array<{
          readonly sessionId: string;
          readonly options: unknown;
          readonly threadId: ThreadId;
          readonly providerSessionId: ProviderSessionId;
        }> = [];
        const adapter = ClaudeAdapterV2.makeClaudeAdapterV2({
          instanceId: ClaudeAdapterV2.CLAUDE_DEFAULT_INSTANCE_ID,
          settings: DEFAULT_CLAUDE_SETTINGS,
          environment: {},
          attachmentsDir,
          fileSystem,
          path: yield* Path.Path,
          crypto: yield* Crypto.Crypto,
          idAllocator,
          queryRunner: {
            allocateSessionId: Effect.succeed("source-native-session"),
            open: (input) =>
              Effect.sync(() => {
                openedQueries.push(input);
                return {
                  messages: Stream.empty,
                  offer: () => Effect.void,
                  setModel: () => Effect.void,
                  setPermissionMode: () => Effect.void,
                  backgroundTasks: () => Effect.succeed(false),
                  interrupt: Effect.void,
                  close: Effect.void,
                };
              }),
            forkSession: (input) =>
              Effect.sync(() => {
                forkCalls.push(input);
                return { sessionId: "forked-native-session" };
              }),
            subagentLaunchToolUseId: () => Effect.succeed(null),
            assertComplete: Effect.void,
          },
        });
        const providerSessionId = ProviderSessionId.make("provider-session-claude-fork");
        const sourceThreadId = ThreadId.make("thread-claude-fork-source");
        const targetThreadId = ThreadId.make("thread-claude-fork-target");
        const runtime = yield* adapter.openSession({
          threadId: sourceThreadId,
          providerSessionId,
          modelSelection: {
            instanceId: ProviderInstanceId.make(ClaudeAdapterV2.CLAUDE_PROVIDER),
            model: "claude-sonnet-4-6",
          },
          runtimePolicy: ProviderAdapterV2RuntimePolicy.make({
            runtimeMode: "full-access",
            interactionMode: "default",
            cwd: "/workspace",
          }),
        });
        const sourceProviderThread = yield* runtime.ensureThread({
          threadId: sourceThreadId,
          modelSelection: {
            instanceId: ProviderInstanceId.make(ClaudeAdapterV2.CLAUDE_PROVIDER),
            model: "claude-sonnet-4-6",
          },
          runtimePolicy: ProviderAdapterV2RuntimePolicy.make({
            runtimeMode: "full-access",
            interactionMode: "default",
            cwd: "/workspace",
          }),
        });
        const now = yield* DateTime.now;
        const providerTurnId = ProviderTurnId.make("provider-turn-claude-source");
        const forkedProviderThread = yield* runtime.forkThread({
          sourceProviderThread,
          sourceProviderTurns: [
            {
              id: providerTurnId,
              providerThreadId: sourceProviderThread.id,
              nodeId: NodeId.make("node-claude-source"),
              runAttemptId: RunAttemptId.make("run-attempt-claude-source"),
              nativeTurnRef: {
                driver: ClaudeAdapterV2.CLAUDE_PROVIDER,
                nativeId: "assistant-message-cursor",
                strength: "weak",
              },
              ordinal: 1,
              status: "completed",
              startedAt: now,
              completedAt: now,
            },
          ],
          providerTurnId,
          targetThreadId,
        });

        assert.deepEqual(forkCalls, [
          {
            sessionId: "source-native-session",
            options: {
              dir: "/workspace",
              upToMessageId: "assistant-message-cursor",
            },
            threadId: targetThreadId,
            providerSessionId,
          },
        ]);
        assert.equal(forkedProviderThread.nativeThreadRef?.nativeId, "forked-native-session");
        assert.equal(forkedProviderThread.forkedFrom?.providerThreadId, sourceProviderThread.id);
        assert.equal(forkedProviderThread.forkedFrom?.providerTurnId, providerTurnId);

        yield* runtime.startTurn({
          appThread: {
            createdBy: "user",
            creationSource: "web",
            id: targetThreadId,
            projectId: ProjectId.make("project-claude-fork-target"),
            title: "Claude fork target",
            providerInstanceId: ProviderInstanceId.make(ClaudeAdapterV2.CLAUDE_PROVIDER),
            modelSelection: {
              instanceId: ProviderInstanceId.make(ClaudeAdapterV2.CLAUDE_PROVIDER),
              model: "claude-sonnet-4-6",
            },
            runtimeMode: "full-access",
            interactionMode: "default",
            branch: null,
            worktreePath: null,
            activeProviderThreadId: forkedProviderThread.id,
            lineage: {
              parentThreadId: sourceThreadId,
              relationshipToParent: "fork",
              rootThreadId: sourceThreadId,
            },
            forkedFrom: null,
            createdAt: now,
            updatedAt: now,
            archivedAt: null,
            settledOverride: null,
            settledAt: null,
            lastVisitedAt: null,
            deletedAt: null,
          },
          threadId: targetThreadId,
          runId: RunId.make("run-claude-fork-target"),
          runOrdinal: 1,
          providerTurnOrdinal: 1,
          attemptId: RunAttemptId.make("run-attempt-claude-fork-target"),
          rootNodeId: NodeId.make("node-claude-fork-target-root"),
          providerThread: forkedProviderThread,
          message: {
            createdBy: "user",
            creationSource: "web",
            messageId: MessageId.make("message-claude-fork-target"),
            text: "Respond with fork ok",
            attachments: [],
          },
          modelSelection: {
            instanceId: ProviderInstanceId.make(ClaudeAdapterV2.CLAUDE_PROVIDER),
            model: "claude-sonnet-4-6",
          },
          runtimePolicy: ProviderAdapterV2RuntimePolicy.make({
            runtimeMode: "full-access",
            interactionMode: "default",
            cwd: "/workspace",
          }),
        });

        assert.equal(openedQueries[0]?.options.resume, "forked-native-session");
        assert.equal(openedQueries[0]?.options.sessionId, undefined);
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );
});

describe("ClaudeAdapterV2 native session identity", () => {
  const openTurnWithOrdinal = (providerTurnOrdinal: number, nativeThreadHasTurns?: boolean) =>
    Effect.scoped(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const idAllocator = yield* IdAllocator.IdAllocatorV2;
        const attachmentsDir = yield* fileSystem.makeTempDirectoryScoped({
          prefix: "control-claude-v2-session-identity-",
        });
        const openedQueries: Array<ClaudeAdapterV2.ClaudeAgentSdkQueryOpenInput> = [];
        const adapter = ClaudeAdapterV2.makeClaudeAdapterV2({
          instanceId: ClaudeAdapterV2.CLAUDE_DEFAULT_INSTANCE_ID,
          settings: DEFAULT_CLAUDE_SETTINGS,
          environment: {},
          attachmentsDir,
          fileSystem,
          path: yield* Path.Path,
          crypto: yield* Crypto.Crypto,
          idAllocator,
          queryRunner: {
            allocateSessionId: Effect.succeed("native-session-identity"),
            open: (input) =>
              Effect.sync(() => {
                openedQueries.push(input);
                return {
                  messages: Stream.empty,
                  offer: () => Effect.void,
                  setModel: () => Effect.void,
                  setPermissionMode: () => Effect.void,
                  backgroundTasks: () => Effect.succeed(false),
                  interrupt: Effect.void,
                  close: Effect.void,
                };
              }),
            forkSession: () => Effect.die("unused forkSession"),
            subagentLaunchToolUseId: () => Effect.succeed(null),
            assertComplete: Effect.void,
          },
        });
        const threadId = ThreadId.make("thread-claude-session-identity");
        const providerSessionId = ProviderSessionId.make("provider-session-claude-identity");
        const runtime = yield* adapter.openSession({
          threadId,
          providerSessionId,
          modelSelection: CLAUDE_TEST_MODEL_SELECTION,
          runtimePolicy: CLAUDE_TEST_RUNTIME_POLICY,
        });
        const providerThread = yield* runtime.ensureThread({
          threadId,
          modelSelection: CLAUDE_TEST_MODEL_SELECTION,
          runtimePolicy: CLAUDE_TEST_RUNTIME_POLICY,
        });
        const now = yield* DateTime.now;
        yield* runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId,
            providerThread,
            now,
            attemptId: RunAttemptId.make("run-attempt-claude-session-identity"),
            text: "Respond with identity ok",
            attachments: [],
            providerTurnOrdinal,
            ...(nativeThreadHasTurns === undefined ? {} : { nativeThreadHasTurns }),
          }),
        );
        return openedQueries;
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    );

  it.effect("creates the native session on the first provider turn", () =>
    Effect.gen(function* () {
      const openedQueries = yield* openTurnWithOrdinal(1);
      assert.equal(openedQueries.length, 1);
      assert.equal(openedQueries[0]?.options.sessionId, "native-session-identity");
      assert.equal(openedQueries[0]?.options.resume, undefined);
    }),
  );

  it.effect(
    "resumes the native session on a fresh session instance when prior provider turns exist",
    () =>
      Effect.gen(function* () {
        const openedQueries = yield* openTurnWithOrdinal(2);
        assert.equal(openedQueries.length, 1);
        assert.equal(openedQueries[0]?.options.resume, "native-session-identity");
        assert.equal(openedQueries[0]?.options.sessionId, undefined);
      }),
  );

  it.effect("creates a fresh native session despite earlier provider-thread turns", () =>
    Effect.gen(function* () {
      const openedQueries = yield* openTurnWithOrdinal(4, false);
      assert.equal(openedQueries[0]?.options.sessionId, "native-session-identity");
      assert.equal(openedQueries[0]?.options.resume, undefined);
    }),
  );
});

const encodeJsonString = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

describe("ClaudeAdapterV2 background wake turns", () => {
  const WAKE_NATIVE_SESSION = "native-thread-claude-wake";
  // Background Bash ids and texts follow the claude_background_task_wake
  // recording, so the frames below have the shapes the CLI really sends.
  const WAKE_TASK_ID = "bdqirlcyw";
  const WAKE_TOOL_USE_ID = "toolu_01Rs6JNNf5SqHRxpq5DeJHrW";
  const WAKE_TASK_DESCRIPTION = "Background sleep test";
  const WAKE_SUMMARY = 'Background command "Background sleep test" completed (exit code 0)';
  const WAKE_ASSISTANT_TEXT = "WAKE_DONE";
  const WAKE_RESULT_TEXT = "WAKE_DONE";

  function claudeSdkFrame(frame: unknown): SDKMessage {
    if (
      typeof frame !== "object" ||
      frame === null ||
      typeof Reflect.get(frame, "type") !== "string"
    ) {
      throw new Error("Frame is not a Claude Agent SDK message.");
    }
    return frame as SDKMessage;
  }

  const wakeTaskStarted = claudeSdkFrame({
    type: "system",
    subtype: "task_started",
    task_id: WAKE_TASK_ID,
    tool_use_id: WAKE_TOOL_USE_ID,
    description: WAKE_TASK_DESCRIPTION,
    is_backgrounded: true,
    task_type: "local_bash",
    uuid: "00000000-0000-4000-8000-000000000101",
    session_id: WAKE_NATIVE_SESSION,
  });
  const makeAssistantTextFrame = (input: { readonly uuid: string; readonly text: string }) =>
    claudeSdkFrame({
      type: "assistant",
      message: {
        model: "claude-sonnet-4-6",
        id: `msg_${input.uuid}`,
        type: "message",
        role: "assistant",
        content: [{ type: "text", text: input.text }],
        stop_reason: null,
        stop_sequence: null,
        usage: {
          input_tokens: 1,
          output_tokens: 1,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      },
      parent_tool_use_id: null,
      uuid: input.uuid,
      session_id: WAKE_NATIVE_SESSION,
    });
  const makeAssistantErrorFrame = (input: {
    readonly uuid: string;
    readonly error:
      | "authentication_failed"
      | "invalid_request"
      | "rate_limit"
      | "server_error"
      | undefined;
    readonly text?: string;
    readonly parentToolUseId?: string | null;
  }) =>
    claudeSdkFrame({
      type: "assistant",
      message: {
        model: "claude-sonnet-4-6",
        id: `msg_${input.uuid}`,
        type: "message",
        role: "assistant",
        content: [{ type: "text", text: input.text ?? "Claude could not complete this request." }],
        stop_reason: null,
        stop_sequence: null,
        usage: {
          input_tokens: 1,
          output_tokens: 1,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      },
      parent_tool_use_id: input.parentToolUseId ?? null,
      ...(input.error === undefined ? {} : { error: input.error }),
      uuid: input.uuid,
      session_id: WAKE_NATIVE_SESSION,
    });
  const makeResultFrame = (input: {
    readonly uuid: string;
    readonly result: string;
    readonly numTurns?: number;
    readonly origin?: { readonly kind: "task-notification" };
    readonly subtype?: string;
    readonly isError?: boolean;
    readonly errors?: ReadonlyArray<string>;
    readonly apiErrorStatus?: number;
    // null omits the field, as the CLI does on a zero-turn result.
    readonly terminalReason?: SDKResultMessage["terminal_reason"] | null;
    readonly usage?: {
      readonly input_tokens: number;
      readonly output_tokens: number;
      readonly cache_creation_input_tokens: number;
      readonly cache_read_input_tokens: number;
    };
  }) =>
    claudeSdkFrame({
      type: "result",
      subtype: input.subtype ?? "success",
      duration_ms: 10,
      duration_api_ms: 10,
      is_error: input.isError ?? false,
      num_turns: input.numTurns ?? 1,
      result: input.result,
      stop_reason: "end_turn",
      total_cost_usd: 0,
      usage: input.usage ?? {
        input_tokens: 1,
        output_tokens: 1,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
      modelUsage: {},
      permission_denials: [],
      uuid: input.uuid,
      session_id: WAKE_NATIVE_SESSION,
      ...(input.origin === undefined ? {} : { origin: input.origin }),
      ...(input.errors === undefined ? {} : { errors: input.errors }),
      ...(input.apiErrorStatus === undefined ? {} : { api_error_status: input.apiErrorStatus }),
      ...(input.terminalReason === null
        ? {}
        : { terminal_reason: input.terminalReason ?? "completed" }),
    });
  const turnOneResult = makeResultFrame({
    uuid: "00000000-0000-4000-8000-000000000102",
    result: "Kicked off the build in the background.",
  });
  const wakeNotification = claudeSdkFrame({
    type: "system",
    subtype: "task_notification",
    task_id: WAKE_TASK_ID,
    tool_use_id: WAKE_TOOL_USE_ID,
    status: "completed",
    output_file: `/tmp/claude-replay/tasks/${WAKE_TASK_ID}.output`,
    summary: WAKE_SUMMARY,
    uuid: "00000000-0000-4000-8000-000000000103",
    session_id: WAKE_NATIVE_SESSION,
  });
  const wakeAssistant = makeAssistantTextFrame({
    uuid: "00000000-0000-4000-8000-000000000107",
    text: WAKE_ASSISTANT_TEXT,
  });
  // The CLI opens the wake turn with `init`, seconds before its first output.
  const wakeTurnInit = claudeSdkFrame({
    type: "system",
    subtype: "init",
    uuid: "00000000-0000-4000-8000-000000000110",
    session_id: WAKE_NATIVE_SESSION,
  });
  const wakeResult = makeResultFrame({
    uuid: "00000000-0000-4000-8000-000000000104",
    result: WAKE_RESULT_TEXT,
    origin: { kind: "task-notification" },
  });
  const STALE_TASK_NOTIFICATION_RESULT_TEXT =
    "Stale task-notification origin text that must not appear.";
  // Shape seen live after interrupt recovery: zero turns, no terminal_reason.
  const staleTaskNotificationResult = makeResultFrame({
    uuid: "00000000-0000-4000-8000-000000000106",
    result: STALE_TASK_NOTIFICATION_RESULT_TEXT,
    numTurns: 0,
    origin: { kind: "task-notification" },
    terminalReason: null,
  });

  const awaitUntil = (predicate: () => boolean, label: string): Effect.Effect<void> =>
    Effect.gen(function* () {
      for (let attempt = 0; attempt < 5000; attempt++) {
        if (predicate()) {
          return;
        }
        yield* Effect.yieldNow;
      }
      return yield* Effect.die(`Timed out waiting for ${label}.`);
    });

  const makeWakeHarnessWithOptions = (options?: {
    readonly close?: (sdkMessages: Queue.Queue<SDKMessage>) => Effect.Effect<void>;
    readonly interrupt?: Effect.Effect<void>;
    readonly backgroundTasks?: (
      toolUseId: string,
    ) => Effect.Effect<boolean, ClaudeAdapterV2.ClaudeAgentSdkQueryRunnerError>;
    readonly environment?: NodeJS.ProcessEnv;
    readonly settings?: ClaudeSettings;
    readonly setPermissionMode?: ClaudeAdapterV2.ClaudeAgentSdkQuerySession["setPermissionMode"];
    // A CLI process opened after the first streams from its own queue, so the
    // first one can exit (Queue.shutdown) and a later turn can start another.
    readonly freshQueueOnReopen?: boolean;
    // What the CLI reports when asked for its context usage.
    readonly contextUsage?: Parameters<typeof ClaudeAdapterV2.claudeContextUsage>[0];
  }) =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const idAllocator = yield* IdAllocator.IdAllocatorV2;
      const attachmentsDir = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "control-claude-v2-wake-",
      });
      const sdkMessages = yield* Queue.unbounded<SDKMessage>();
      const processQueues: Array<Queue.Queue<SDKMessage>> = [];
      const processedMessages = new WeakMap<SDKMessage, Deferred.Deferred<void>>();
      const offerAndWait = Effect.fnUntraced(function* (message: SDKMessage) {
        const processed = yield* Deferred.make<void>();
        processedMessages.set(message, processed);
        yield* Queue.offer(processQueues.at(-1) ?? sdkMessages, message);
        yield* Deferred.await(processed);
      });
      const offeredMessages: Array<SDKUserMessage> = [];
      const permissionModeChanges: Array<string> = [];
      const recordPermissionMode: ClaudeAdapterV2.ClaudeAgentSdkQuerySession["setPermissionMode"] =
        (mode) =>
          Effect.sync(() => {
            permissionModeChanges.push(mode);
          }).pipe(Effect.andThen(() => options?.setPermissionMode?.(mode) ?? Effect.void));
      const runtimeRequestReceipts =
        yield* Queue.unbounded<
          Extract<ProviderAdapterV2Event, { type: "runtime_request.updated" }>
        >();
      const continuationRequests: Array<ProviderContinuationRequest> = [];
      const terminalReceipts =
        yield* Queue.unbounded<Extract<ProviderAdapterV2Event, { type: "turn.terminal" }>>();
      const systemNoticeReceipts =
        yield* Queue.unbounded<Extract<ProviderAdapterV2Event, { type: "turn_item.updated" }>>();
      const planReceipts =
        yield* Queue.unbounded<Extract<ProviderAdapterV2Event, { type: "plan.updated" }>>();
      let openedOptions: ClaudeAdapterV2.ClaudeAgentSdkQueryOptions | undefined;
      const adapter = ClaudeAdapterV2.makeClaudeAdapterV2({
        instanceId: ClaudeAdapterV2.CLAUDE_DEFAULT_INSTANCE_ID,
        settings: options?.settings ?? DEFAULT_CLAUDE_SETTINGS,
        environment: options?.environment ?? {},
        attachmentsDir,
        fileSystem,
        path: yield* Path.Path,
        crypto: yield* Crypto.Crypto,
        idAllocator,
        continuationRequests: {
          offer: (request) =>
            Effect.sync(() => {
              continuationRequests.push(request);
            }),
        },
        queryRunner: {
          allocateSessionId: Effect.succeed(WAKE_NATIVE_SESSION),
          open: (input) =>
            Effect.gen(function* () {
              openedOptions = input.options;
              const processMessages =
                options?.freshQueueOnReopen === true && processQueues.length > 0
                  ? yield* Queue.unbounded<SDKMessage>()
                  : sdkMessages;
              const messages = Stream.fromQueue(processMessages).pipe(
                Stream.flatMap((message) =>
                  Stream.make(message).pipe(
                    // The next pull happens after runForEach finishes handling this frame.
                    Stream.concat(
                      Stream.fromEffect(
                        Effect.suspend(() => {
                          const processed = processedMessages.get(message);
                          return processed === undefined
                            ? Effect.void
                            : Deferred.succeed(processed, undefined);
                        }),
                      ).pipe(Stream.drain),
                    ),
                  ),
                ),
              );
              if (options?.freshQueueOnReopen === true && processQueues.length > 0) {
                processQueues.push(processMessages);
                return {
                  messages,
                  offer: (message: SDKUserMessage) =>
                    Effect.sync(() => {
                      offeredMessages.push(message);
                    }),
                  setModel: () => Effect.void,
                  setPermissionMode: recordPermissionMode,
                  backgroundTasks: options?.backgroundTasks ?? (() => Effect.succeed(false)),
                  interrupt: Effect.void,
                  close: Queue.shutdown(processMessages),
                };
              }
              processQueues.push(sdkMessages);
              return {
                messages,
                offer: (message) =>
                  Effect.sync(() => {
                    offeredMessages.push(message);
                  }),
                setModel: () => Effect.void,
                setPermissionMode: recordPermissionMode,
                backgroundTasks: options?.backgroundTasks ?? (() => Effect.succeed(false)),
                interrupt: options?.interrupt ?? Effect.void,
                ...(options?.contextUsage === undefined
                  ? {}
                  : {
                      getContextUsage: Effect.succeed(
                        options.contextUsage as SDKControlGetContextUsageResponse,
                      ),
                    }),
                close: options?.close?.(sdkMessages) ?? Effect.void,
              };
            }),
          forkSession: () => Effect.die("unused forkSession"),
          subagentLaunchToolUseId: () => Effect.succeed(null),
          assertComplete: Effect.void,
        },
      });
      const threadId = ThreadId.make("thread-claude-wake");
      const runtime = yield* adapter.openSession({
        threadId,
        providerSessionId: ProviderSessionId.make("provider-session-claude-wake"),
        modelSelection: CLAUDE_TEST_MODEL_SELECTION,
        runtimePolicy: CLAUDE_TEST_RUNTIME_POLICY,
      });
      const providerThread = yield* runtime.ensureThread({
        threadId,
        modelSelection: CLAUDE_TEST_MODEL_SELECTION,
        runtimePolicy: CLAUDE_TEST_RUNTIME_POLICY,
      });
      const events: Array<ProviderAdapterV2Event> = [];
      yield* runtime.events.pipe(
        Stream.runForEach((event) =>
          Effect.gen(function* () {
            events.push(event);
            if (event.type === "turn.terminal") {
              yield* Queue.offer(terminalReceipts, event);
            }
            if (event.type === "runtime_request.updated") {
              yield* Queue.offer(runtimeRequestReceipts, event);
            }
            if (event.type === "plan.updated") {
              yield* Queue.offer(planReceipts, event);
            }
            if (event.type === "turn_item.updated" && event.turnItem.type === "system_notice") {
              yield* Queue.offer(systemNoticeReceipts, event);
            }
          }),
        ),
        Effect.forkScoped,
      );
      if (runtime.hasPendingBackgroundWork === undefined) {
        throw new Error("Claude adapter runtime must expose hasPendingBackgroundWork.");
      }
      const hasPendingBackgroundWork = runtime.hasPendingBackgroundWork;
      const terminalEvents = () =>
        events.filter(
          (event): event is Extract<ProviderAdapterV2Event, { type: "turn.terminal" }> =>
            event.type === "turn.terminal",
        );
      return {
        runtime,
        providerThread,
        threadId,
        sdkMessages,
        processQueues,
        offerAndWait,
        offeredMessages,
        // The uuid Claude echoes on the turn answering the nth offered prompt.
        promptUuid: (index: number) => {
          const uuid = offeredMessages[index]?.uuid;
          if (uuid === undefined) throw new Error(`No prompt offered at index ${index}.`);
          return uuid;
        },
        permissionModeChanges,
        continuationRequests,
        events,
        terminalReceipts,
        systemNoticeReceipts,
        runtimeRequestReceipts,
        planReceipts,
        getOpenedOptions: () => openedOptions,
        terminalEvents,
        hasPendingBackgroundWork,
      };
    });
  const makeWakeHarness = makeWakeHarnessWithOptions();

  describe("Claude settings restrictions", () => {
    it.effect("resolves cached managed policy from the configured home through the real SDK", () =>
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const home = yield* fileSystem.makeTempDirectoryScoped({
          prefix: "control-claude-remote-",
        });
        const cwd = yield* fileSystem.makeTempDirectoryScoped({
          prefix: "control-claude-remote-cwd-",
        });
        const remoteFile = path.join(home, "remote-settings.json");
        const sdk = yield* Effect.promise(() =>
          vi.importActual<typeof ClaudeSdk>("@anthropic-ai/claude-agent-sdk"),
        );
        vi.mocked(ClaudeSdk.resolveSettings).mockImplementation(sdk.resolveSettings);
        const open = Effect.scoped(
          Effect.gen(function* () {
            const harness = yield* makeWakeHarnessWithOptions({
              settings: { ...DEFAULT_CLAUDE_SETTINGS, homePath: home },
            });
            yield* harness.runtime.startTurn(
              makeClaudeTestTurnInput({
                threadId: harness.threadId,
                providerThread: harness.providerThread,
                now: yield* DateTime.now,
                attemptId: RunAttemptId.make("attempt-cached-managed-policy"),
                text: "Run git status.",
                attachments: [],
                runtimePolicy: ProviderAdapterV2RuntimePolicy.make({
                  runtimeMode: "full-access",
                  interactionMode: "default",
                  cwd,
                }),
              }),
            );
            return harness.getOpenedOptions()!;
          }),
        );
        yield* fileSystem.writeFileString(
          remoteFile,
          JSON.stringify({
            permissions: { disableBypassPermissionsMode: "disable" },
            disableAutoMode: "disable",
            managedSourcesBehavior: "merge",
          }),
        );
        const restricted = yield* open;
        assert.equal(restricted.permissionMode, "default");
        assert.isUndefined(restricted.allowDangerouslySkipPermissions);
        yield* fileSystem.remove(remoteFile);
        assert.equal((yield* open).permissionMode, "bypassPermissions");
        yield* fileSystem.writeFileString(remoteFile, "{ invalid json");
        assert.equal((yield* open).permissionMode, "auto");
        yield* fileSystem.remove(remoteFile);
        yield* fileSystem.makeDirectory(remoteFile);
        assert.equal((yield* open).permissionMode, "auto");
      }).pipe(Effect.scoped, Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    );

    it.effect("asks before restricted Full access tools and follows policy across turns", () =>
      Effect.gen(function* () {
        const resolveSettings = vi
          .mocked(ClaudeSdk.resolveSettings)
          .mockImplementation(async (options) => ({
            effective:
              options?.cwd === "/unrestricted"
                ? {}
                : {
                    permissions: {
                      disableBypassPermissionsMode: "disable",
                      ...(options?.cwd === "/restricted-worktree"
                        ? { disableAutoMode: "disable" as const }
                        : {}),
                    },
                  },
            provenance: {},
            sources: [],
          }));
        const harness = yield* makeWakeHarnessWithOptions({
          close: Queue.shutdown,
          freshQueueOnReopen: true,
          setPermissionMode: (mode) =>
            mode === "bypassPermissions"
              ? Effect.fail(
                  new ClaudeAdapterV2.ClaudeAgentSdkQueryRunnerError({
                    method: "setPermissionMode",
                    cause: new Error(
                      "Cannot set permission mode to bypassPermissions because it is disabled by settings or configuration",
                    ),
                  }),
                )
              : Effect.void,
        });
        const now = yield* DateTime.now;
        let ordinal = 0;
        const start = (cwd: string, runtimeMode: "full-access" | "auto" = "full-access") =>
          harness.runtime.startTurn(
            makeClaudeTestTurnInput({
              threadId: harness.threadId,
              providerThread: harness.providerThread,
              now,
              attemptId: RunAttemptId.make(`attempt-policy-${++ordinal}`),
              providerTurnOrdinal: ordinal,
              text: "Run git status.",
              attachments: [],
              runtimePolicy: ProviderAdapterV2RuntimePolicy.make({
                runtimeMode,
                interactionMode: "default",
                cwd,
              }),
            }),
          );
        const finish = Effect.gen(function* () {
          yield* harness.offerAndWait(
            makeResultFrame({ uuid: `policy-result-${ordinal}`, result: "Done." }),
          );
          yield* Queue.take(harness.terminalReceipts);
        });
        const notices = () =>
          harness.events.filter(
            (event) =>
              event.type === "turn_item.updated" && event.turnItem.type === "system_notice",
          );
        // Raises the call as a CLI-forwarded ask and declines it; fails if Control allows it.
        const askAndDecline = Effect.fn("askAndDecline")(function* (toolUseId: string) {
          const decision = yield* Effect.promise(() =>
            harness.getOpenedOptions()!.canUseTool!(
              "Bash",
              { command: "git status" },
              {
                signal: new AbortController().signal,
                toolUseID: toolUseId,
                requestId: `request-${toolUseId}`,
              },
            ),
          ).pipe(Effect.forkScoped);
          const first = yield* Effect.raceFirst(
            Queue.take(harness.runtimeRequestReceipts).pipe(
              Effect.map((event) => ({ type: "request", event }) as const),
            ),
            Fiber.join(decision).pipe(
              Effect.map((result) => ({ type: "decision", result }) as const),
            ),
          );
          assert.equal(first.type, "request", `${toolUseId} ran without asking`);
          if (first.type !== "request") return;
          assert.equal(first.event.runtimeRequest.kind, "command");
          yield* harness.runtime.respondToRuntimeRequest({
            requestId: first.event.runtimeRequest.id,
            decision: "decline",
          });
          assert.equal((yield* Fiber.join(decision))?.behavior, "deny");
        });
        const enterPlan = (uuid: string) =>
          harness.offerAndWait(
            claudeSdkFrame({
              type: "system",
              subtype: "status",
              status: null,
              permissionMode: "plan",
              uuid,
              session_id: WAKE_NATIVE_SESSION,
            }),
          );

        yield* start("/restricted-worktree", "auto");
        assert.equal(harness.getOpenedOptions()?.permissionMode, "auto");
        yield* finish;
        assert.equal(notices().length, 0);
        assert.equal(resolveSettings.mock.calls.length, 0);

        yield* start("/restricted");
        const openedOptions = harness.getOpenedOptions()!;
        yield* askAndDecline("policy-command");
        assert.equal(openedOptions.permissionMode, "auto");
        assert.isUndefined(openedOptions.allowDangerouslySkipPermissions);
        yield* enterPlan("policy-enter-plan");
        yield* finish;
        assert.equal(notices().length, 1);
        yield* start("/restricted");
        assert.strictEqual(harness.getOpenedOptions(), openedOptions);
        assert.deepEqual(harness.permissionModeChanges, ["auto"]);
        assert.equal(resolveSettings.mock.calls.length, 1);
        yield* finish;

        yield* start("/restricted-worktree");
        assert.equal(harness.getOpenedOptions()?.permissionMode, "default");
        assert.isUndefined(harness.getOpenedOptions()?.allowDangerouslySkipPermissions);
        assert.equal(resolveSettings.mock.calls.length, 2);
        yield* finish;

        yield* start("/unrestricted");
        assert.equal(harness.getOpenedOptions()?.permissionMode, "bypassPermissions");
        assert.equal(harness.getOpenedOptions()?.allowDangerouslySkipPermissions, true);
        // Asks the CLI forwards under bypass (ask rules, settings fallback) still need a decision.
        yield* askAndDecline("forwarded-under-bypass");
        yield* harness.offerAndWait(
          claudeSdkFrame({
            type: "system",
            subtype: "status",
            status: null,
            permissionMode: "default",
            uuid: "policy-cli-downgrade",
            session_id: WAKE_NATIVE_SESSION,
          }),
        );
        yield* finish;
        const unrestrictedOptions = harness.getOpenedOptions();
        yield* start("/unrestricted");
        assert.strictEqual(harness.getOpenedOptions(), unrestrictedOptions);
        assert.deepEqual(
          harness.permissionModeChanges,
          ["auto"],
          "A CLI policy downgrade must not be restored to bypass on the next turn",
        );
        assert.equal(resolveSettings.mock.calls.length, 3);
        yield* enterPlan("policy-restricted-enter-plan");
        yield* finish;

        const started = yield* start("/unrestricted").pipe(Effect.exit);
        assert.isTrue(Exit.isSuccess(started), "A rejected bypass restore must not fail the turn");
        assert.strictEqual(harness.getOpenedOptions(), unrestrictedOptions);
        assert.deepEqual(harness.permissionModeChanges, ["auto", "bypassPermissions", "default"]);
        yield* askAndDecline("forwarded-after-plan");
        yield* finish;
        assert.equal(harness.terminalEvents().at(-1)?.status, "completed");
        assert.equal(notices().length, 1);
      }).pipe(Effect.scoped, Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    );

    it.effect(
      "combines a custom home with project policy without reading the ambient user tier",
      () =>
        Effect.gen(function* () {
          const fileSystem = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const home = yield* fileSystem.makeTempDirectoryScoped({
            prefix: "control-claude-policy-home-",
          });
          yield* fileSystem.writeFileString(
            path.join(home, "settings.json"),
            `{
          // Claude accepts comments and trailing commas.
          "permissions": { "disableBypassPermissionsMode": "disable", },
        }`,
          );
          const resolveSettings = vi.mocked(ClaudeSdk.resolveSettings).mockResolvedValue({
            effective: { disableAutoMode: "disable" },
            provenance: {},
            sources: [{ source: "project", settings: { disableAutoMode: "disable" } }],
          });
          const harness = yield* makeWakeHarnessWithOptions({
            settings: { ...DEFAULT_CLAUDE_SETTINGS, homePath: ` ${home} ` },
          });
          yield* harness.runtime.startTurn(
            makeClaudeTestTurnInput({
              threadId: harness.threadId,
              providerThread: harness.providerThread,
              now: yield* DateTime.now,
              attemptId: RunAttemptId.make("attempt-custom-home"),
              text: "Run git status.",
              attachments: [],
            }),
          );
          assert.equal(harness.getOpenedOptions()?.permissionMode, "default");
          assert.isUndefined(harness.getOpenedOptions()?.allowDangerouslySkipPermissions);
          assert.deepEqual(resolveSettings.mock.calls[0]?.[0]?.settingSources, [
            "project",
            "local",
          ]);
        }).pipe(Effect.scoped, Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    );

    it.effect(
      "distinguishes missing custom settings from unreadable, malformed, or unresolved policy",
      () =>
        Effect.gen(function* () {
          const fileSystem = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const home = yield* fileSystem.makeTempDirectoryScoped({
            prefix: "control-claude-policy-failure-",
          });
          const settingsFile = path.join(home, "settings.json");
          const open = Effect.scoped(
            Effect.gen(function* () {
              const harness = yield* makeWakeHarnessWithOptions({
                settings: { ...DEFAULT_CLAUDE_SETTINGS, homePath: home },
              });
              yield* harness.runtime.startTurn(
                makeClaudeTestTurnInput({
                  threadId: harness.threadId,
                  providerThread: harness.providerThread,
                  now: yield* DateTime.now,
                  attemptId: RunAttemptId.make("attempt-settings-failure"),
                  text: "Run git status.",
                  attachments: [],
                }),
              );
              return harness.getOpenedOptions()!;
            }),
          );
          assert.equal((yield* open).permissionMode, "bypassPermissions");
          yield* fileSystem.makeDirectory(settingsFile);
          const unreadable = yield* open;
          assert.equal(unreadable.permissionMode, "auto");
          assert.isUndefined(unreadable.allowDangerouslySkipPermissions);
          yield* fileSystem.remove(settingsFile, { recursive: true });
          yield* fileSystem.writeFileString(settingsFile, "{ invalid json");
          assert.equal((yield* open).permissionMode, "auto");
          yield* fileSystem.remove(settingsFile);
          const resolveSettings = vi
            .mocked(ClaudeSdk.resolveSettings)
            .mockClear()
            .mockRejectedValueOnce(new Error("Cannot resolve managed settings"))
            .mockResolvedValue({ effective: {}, provenance: {}, sources: [] });
          const harness = yield* makeWakeHarnessWithOptions({
            settings: { ...DEFAULT_CLAUDE_SETTINGS, homePath: home },
            close: Queue.shutdown,
            freshQueueOnReopen: true,
          });
          for (const ordinal of [1, 2]) {
            yield* harness.runtime.startTurn(
              makeClaudeTestTurnInput({
                threadId: harness.threadId,
                providerThread: harness.providerThread,
                now: yield* DateTime.now,
                attemptId: RunAttemptId.make(`attempt-settings-recovery-${ordinal}`),
                providerTurnOrdinal: ordinal,
                text: "Run git status.",
                attachments: [],
              }),
            );
            const options = harness.getOpenedOptions()!;
            assert.equal(
              options.permissionMode,
              ordinal === 1 ? "auto" : "bypassPermissions",
              "A transient resolver failure must only downgrade the failing turn",
            );
            assert.equal(resolveSettings.mock.calls.length, ordinal);
            yield* harness.offerAndWait(
              makeResultFrame({ uuid: `settings-recovery-result-${ordinal}`, result: "Done." }),
            );
            assert.equal((yield* Queue.take(harness.terminalReceipts)).status, "completed");
          }
          assert.equal(harness.offeredMessages.length, 2);
        }).pipe(Effect.scoped, Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    );

    it.effect("pins tool search on when the user's Claude settings choose auto", () =>
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const home = yield* fileSystem.makeTempDirectoryScoped({
          prefix: "control-claude-tool-search-",
        });
        const openedToolSearch = (
          settingsJson: string,
          cwd = CLAUDE_TEST_RUNTIME_POLICY.cwd,
          environment?: NodeJS.ProcessEnv,
        ) =>
          Effect.scoped(
            Effect.gen(function* () {
              yield* fileSystem.writeFileString(path.join(home, "settings.json"), settingsJson);
              const harness = yield* makeWakeHarnessWithOptions({
                settings: { ...DEFAULT_CLAUDE_SETTINGS, homePath: home },
                ...(environment === undefined ? {} : { environment }),
              });
              yield* harness.runtime.startTurn(
                makeClaudeTestTurnInput({
                  threadId: harness.threadId,
                  providerThread: harness.providerThread,
                  now: yield* DateTime.now,
                  attemptId: RunAttemptId.make("attempt-tool-search"),
                  text: "Run git status.",
                  attachments: [],
                  runtimePolicy: ProviderAdapterV2RuntimePolicy.make({
                    ...CLAUDE_TEST_RUNTIME_POLICY,
                    cwd,
                  }),
                }),
              );
              const settings = harness.getOpenedOptions()?.settings;
              return typeof settings === "object" ? settings.env?.ENABLE_TOOL_SEARCH : undefined;
            }),
          );
        assert.equal(yield* openedToolSearch('{"env":{"ENABLE_TOOL_SEARCH":"auto"}}'), "true");
        assert.isUndefined(yield* openedToolSearch('{"env":{"ENABLE_TOOL_SEARCH":"false"}}'));
        assert.isUndefined(yield* openedToolSearch("{}"));

        // Claude Code keeps the local file at the repository root, the main checkout's root in a
        // worktree, and that file beats the user's settings.
        const repo = yield* fileSystem.makeTempDirectoryScoped({ prefix: "control-claude-repo-" });
        const worktree = yield* fileSystem.makeTempDirectoryScoped({
          prefix: "control-claude-wt-",
        });
        const worktreeGitDir = path.join(repo, ".git", "worktrees", "wt");
        yield* fileSystem.makeDirectory(worktreeGitDir, { recursive: true });
        yield* fileSystem.writeFileString(path.join(worktreeGitDir, "commondir"), "../..\n");
        yield* fileSystem.writeFileString(
          path.join(worktree, ".git"),
          `gitdir: ${worktreeGitDir}\n`,
        );
        yield* fileSystem.makeDirectory(path.join(repo, ".claude"));
        yield* fileSystem.makeDirectory(path.join(repo, "packages", "app"), { recursive: true });
        const rootLocal = (value: string) =>
          fileSystem.writeFileString(
            path.join(repo, ".claude", "settings.local.json"),
            `{"env":{"ENABLE_TOOL_SEARCH":"${value}"}}`,
          );
        const userAuto = '{"env":{"ENABLE_TOOL_SEARCH":"auto"}}';
        yield* rootLocal("auto");
        assert.equal(yield* openedToolSearch("{}", worktree), "true");
        yield* rootLocal("false");
        assert.isUndefined(yield* openedToolSearch(userAuto, worktree));
        assert.isUndefined(yield* openedToolSearch(userAuto, path.join(repo, "packages", "app")));

        // Project settings beat user settings, and the process env applies only when no file sets it.
        const project = yield* fileSystem.makeTempDirectoryScoped({
          prefix: "control-claude-project-",
        });
        yield* fileSystem.makeDirectory(path.join(project, ".claude"));
        yield* fileSystem.writeFileString(
          path.join(project, ".claude", "settings.json"),
          '{"env":{"ENABLE_TOOL_SEARCH":"auto"}}',
        );
        assert.equal(
          yield* openedToolSearch('{"env":{"ENABLE_TOOL_SEARCH":"false"}}', project),
          "true",
        );
        assert.equal(
          yield* openedToolSearch("{}", CLAUDE_TEST_RUNTIME_POLICY.cwd, {
            ENABLE_TOOL_SEARCH: "auto",
          }),
          "true",
        );
      }).pipe(Effect.scoped, Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    );
  });

  it.effect("reports the CLI version from the init frame", () =>
    Effect.gen(function* () {
      const harness = yield* makeWakeHarness;
      assert.isUndefined(yield* harness.runtime.runtimeVersion!);
      yield* harness.runtime.startTurn(
        makeClaudeTestTurnInput({
          threadId: harness.threadId,
          providerThread: harness.providerThread,
          now: yield* DateTime.now,
          attemptId: RunAttemptId.make("version-attempt"),
          text: "Hello",
          attachments: [],
        }),
      );
      yield* harness.offerAndWait(
        claudeSdkFrame({
          type: "system",
          subtype: "init",
          claude_code_version: "2.1.300",
          uuid: "00000000-0000-4000-8000-000000000190",
          session_id: WAKE_NATIVE_SESSION,
        }),
      );
      assert.equal(yield* harness.runtime.runtimeVersion!, "2.1.300");
    }).pipe(Effect.scoped, Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
  );

  it.effect("records what the session loaded from its init frames on the provider thread", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "claude-v2-loads-" });
      const claudeHome = path.join(root, "claude-home");
      const workspace = path.join(root, "workspace");
      const plugin = path.join(root, "plugins", "lint");
      const oneHook = (event: string) =>
        JSON.stringify({ hooks: { [event]: [{ hooks: [{ type: "command", command: "true" }] }] } });
      for (const [dir, file, event] of [
        [claudeHome, "settings.json", "Stop"],
        [path.join(workspace, ".claude"), "settings.json", "SessionStart"],
        [path.join(plugin, "hooks"), "hooks.json", "PreToolUse"],
      ] as const) {
        yield* fs.makeDirectory(dir, { recursive: true });
        yield* fs.writeFileString(path.join(dir, file), oneHook(event));
      }
      const harness = yield* makeWakeHarnessWithOptions({
        environment: { CLAUDE_CONFIG_DIR: claudeHome },
      });
      yield* harness.runtime.startTurn(
        makeClaudeTestTurnInput({
          threadId: harness.threadId,
          providerThread: harness.providerThread,
          now: yield* DateTime.now,
          attemptId: RunAttemptId.make("loads-attempt"),
          text: "Hello",
          attachments: [],
          runtimePolicy: ProviderAdapterV2RuntimePolicy.make({
            ...CLAUDE_TEST_RUNTIME_POLICY,
            cwd: workspace,
          }),
        }),
      );
      const init = (uuid: string, skills: number) =>
        claudeSdkFrame({
          type: "system",
          subtype: "init",
          claude_code_version: "2.1.300",
          cwd: workspace,
          skills: Array.from({ length: skills }, (_, index) => `skill-${index}`),
          mcp_servers: [
            { name: "github", status: "connected" },
            { name: "linear", status: "failed" },
            { name: "claude.ai Gmail", status: "needs-auth" },
          ],
          tools: ["Bash", "mcp__github__create_issue", "mcp__github__get_pr", "mcp__other__ping"],
          plugins: [{ name: "lint", path: plugin }],
          agents: ["general-purpose", "Explore", "Plan"],
          uuid,
          session_id: WAKE_NATIVE_SESSION,
        });
      yield* harness.offerAndWait(init("00000000-0000-4000-8000-000000000191", 3));
      // A skill discovered mid-session reaches the next init frame.
      yield* harness.offerAndWait(init("00000000-0000-4000-8000-000000000192", 4));
      yield* Queue.offer(
        harness.sdkMessages,
        makeResultFrame({ uuid: "00000000-0000-4000-8000-000000000193", result: "Hi" }),
      );
      assert.equal((yield* Queue.take(harness.terminalReceipts)).status, "completed");

      const updates = harness.events.flatMap((event) =>
        event.type === "provider_thread.updated" ? [event.providerThread] : [],
      );
      // Hooks: the user's, the project's and the plugin's.
      assert.deepEqual(updates.at(-1)?.loads, {
        hooks: 3,
        skills: 4,
        mcpServers: 3,
        plugins: 1,
        agents: 3,
        names: {
          hooks: ["Stop", "SessionStart", "PreToolUse"],
          hookHandlers: [
            { event: "Stop", command: "true", source: "user" },
            { event: "SessionStart", command: "true", source: "project" },
            { event: "PreToolUse", command: "true", source: "lint" },
          ],
          skills: ["skill-0", "skill-1", "skill-2", "skill-3"],
          mcpServers: [
            { name: "github", status: "connected", tools: ["create_issue", "get_pr"] },
            { name: "linear", status: "failed", tools: [] },
            { name: "claude.ai Gmail", status: "needs-auth", tools: [] },
          ],
          plugins: ["lint"],
          agents: ["general-purpose", "Explore", "Plan"],
        },
      });
    }).pipe(Effect.scoped, Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
  );

  describe("Plan-mode tool approval", () => {
    const openPlanTurn = Effect.fn("openPlanTurn")(function* (
      runtimeMode: "auto" | "full-access",
      approvalPolicy?: "never",
    ) {
      const harness = yield* makeWakeHarness;
      const runtimePolicy = ProviderAdapterV2RuntimePolicy.make({
        runtimeMode,
        interactionMode: "plan",
        cwd: "/workspace",
        ...(approvalPolicy === undefined ? {} : { approvalPolicy }),
      });
      const input = makeClaudeTestTurnInput({
        threadId: harness.threadId,
        providerThread: harness.providerThread,
        now: yield* DateTime.now,
        attemptId: RunAttemptId.make("attempt-claude-plan-write"),
        text: "Investigate before implementing.",
        attachments: [],
        runtimePolicy,
      });
      yield* harness.runtime.startTurn({
        ...input,
        appThread: { ...input.appThread, runtimeMode, interactionMode: "plan" },
      });
      assert.equal(harness.getOpenedOptions()?.permissionMode, "plan");
      const canUseTool = harness.getOpenedOptions()?.canUseTool;
      assert.isDefined(canUseTool);
      return { ...harness, canUseTool: canUseTool! };
    });

    const requestWrite = Effect.fn("requestPlanWrite")(function* (
      turn: Effect.Success<ReturnType<typeof openPlanTurn>>,
      toolName: string,
      toolInput: Record<string, unknown>,
    ) {
      const decision = yield* Effect.promise(() =>
        turn.canUseTool(toolName, toolInput, {
          signal: new AbortController().signal,
          toolUseID: "tool-plan-write",
          requestId: "request-plan-write",
        }),
      ).pipe(Effect.forkScoped);
      const first = yield* Effect.raceFirst(
        Queue.take(turn.runtimeRequestReceipts).pipe(
          Effect.map((event) => ({ type: "request", event }) as const),
        ),
        Fiber.join(decision).pipe(Effect.map((result) => ({ type: "decision", result }) as const)),
      );
      return { first, decision };
    });

    it.effect.each([
      {
        runtimeMode: "auto",
        toolName: "Edit",
        toolInput: {
          file_path: "/workspace/target.txt",
          old_string: "before",
          new_string: "after",
        },
        kind: "file-change",
        decision: "accept",
        behavior: "allow",
      },
      {
        runtimeMode: "full-access",
        toolName: "Bash",
        toolInput: { command: "echo after > target.txt" },
        kind: "command",
        decision: "cancel",
        behavior: "deny",
      },
    ] as const)(
      "asks before $toolName in $runtimeMode Plan, then respects $decision",
      ({ runtimeMode, toolName, toolInput, kind, decision, behavior }) =>
        Effect.gen(function* () {
          const turn = yield* openPlanTurn(runtimeMode);
          const permission = yield* requestWrite(turn, toolName, toolInput);
          assert.equal(permission.first.type, "request", "the planned write bypassed approval");
          if (permission.first.type !== "request") return;
          const request = permission.first.event.runtimeRequest;
          assert.equal(request.status, "pending");
          assert.equal(request.kind, kind);
          yield* turn.runtime.respondToRuntimeRequest({ requestId: request.id, decision });
          const result = yield* Fiber.join(permission.decision);
          assert.equal(result?.behavior, behavior);
          if (result?.behavior === "allow") {
            assert.deepEqual(result.updatedInput, toolInput);
            assert.equal(result.toolUseID, "tool-plan-write");
          }
        }).pipe(Effect.scoped, Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    );

    it.effect("denies Plan writes without asking when approvals are never allowed", () =>
      Effect.gen(function* () {
        const turn = yield* openPlanTurn("full-access", "never");
        const permission = yield* requestWrite(turn, "Bash", {
          command: "echo after > target.txt",
        });
        assert.equal(permission.first.type, "decision", "Never raised an approval request");
        if (permission.first.type !== "decision") return;
        assert.equal(permission.first.result?.behavior, "deny");
      }).pipe(Effect.scoped, Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    );

    it.effect("still captures ExitPlanMode when Plan approvals are never allowed", () =>
      Effect.gen(function* () {
        const turn = yield* openPlanTurn("full-access", "never");
        const markdown = "# Proposed work\n\nFix the calculation after approval.";
        const result = yield* Effect.promise(() =>
          turn.canUseTool(
            "ExitPlanMode",
            { plan: markdown },
            {
              signal: new AbortController().signal,
              toolUseID: "tool-plan-capture",
              requestId: "request-plan-capture",
            },
          ),
        );
        assert.equal(result?.behavior, "deny");
        if (result?.behavior === "deny")
          assert.include(result.message, "captured your proposed plan");
        const event = yield* Queue.take(turn.planReceipts);
        assert.equal(event.plan.kind, "proposed_plan");
        assert.equal(event.plan.kind === "proposed_plan" ? event.plan.markdown : "", markdown);
      }).pipe(Effect.scoped, Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    );
  });

  it.effect.each([
    { isError: false, title: "Check weather" },
    { isError: true, title: "Check weather" },
    { isError: false, title: undefined },
  ])("keeps late MCP display metadata with %j", ({ isError, title }) =>
    Effect.gen(function* () {
      const harness = yield* makeWakeHarness;
      yield* harness.runtime.startTurn(
        makeClaudeTestTurnInput({
          threadId: harness.threadId,
          providerThread: harness.providerThread,
          now: yield* DateTime.now,
          attemptId: RunAttemptId.make("mcp-presentation"),
          text: "Check the weather",
          attachments: [],
        }),
      );
      const toolName = "mcp__weather__get_weather";
      const id = "weather-call";
      const permission = yield* Effect.promise(() =>
        harness.getOpenedOptions()!.canUseTool!(
          toolName,
          { city: "Berlin" },
          {
            signal: new AbortController().signal,
            toolUseID: id,
            requestId: "weather-request",
          },
        ),
      ).pipe(Effect.forkScoped);
      const request = yield* Queue.take(harness.runtimeRequestReceipts);
      yield* harness.runtime.respondToRuntimeRequest({
        requestId: request.runtimeRequest.id,
        decision: "accept",
      });
      yield* Fiber.join(permission);
      yield* harness.offerAndWait(
        claudeSdkFrame({
          type: "assistant",
          uuid: "weather-assistant",
          session_id: WAKE_NATIVE_SESSION,
          parent_tool_use_id: null,
          message: {
            id: "weather-message",
            type: "message",
            role: "assistant",
            model: "claude-sonnet-4-6",
            content: [{ type: "tool_use", id, name: toolName, input: { city: "Berlin" } }],
          },
          tool_use_meta: [
            {
              id,
              display_name: title,
              server_display_name: "Weather",
              icon_url: "https://example.com/weather.png",
            },
          ],
        }),
      );
      yield* harness.offerAndWait(
        claudeSdkFrame({
          type: "user",
          uuid: "weather-result",
          session_id: WAKE_NATIVE_SESSION,
          parent_tool_use_id: null,
          message: {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: id,
                content: "Weather result",
                is_error: isError,
              },
            ],
          },
        }),
      );
      yield* Queue.offer(
        harness.sdkMessages,
        makeResultFrame({ uuid: "weather-terminal", result: "Weather checked" }),
      );
      yield* Queue.take(harness.terminalReceipts);
      const items = harness.events.flatMap((event) =>
        event.type === "turn_item.updated" && event.turnItem.type === "dynamic_tool"
          ? [event.turnItem]
          : [],
      );
      assert.deepEqual(
        items.map((item) => item.status),
        ["running", "running", isError ? "failed" : "completed"],
      );
      assert.isNull(items[0]?.title);
      for (const item of items.slice(1)) {
        assert.equal(item.title, title ?? "get weather");
        assert.deepEqual(item.toolIcon, {
          _tag: "themed-logo",
          logoUrl: "https://example.com/weather.png",
        });
        assert.deepEqual(item.toolSource, {
          key: "mcp:weather",
          name: "Weather",
          kind: "integration",
          icon: { _tag: "themed-logo", logoUrl: "https://example.com/weather.png" },
        });
        assert.deepEqual(item.input, { city: "Berlin" });
      }
      assert.equal(new Set(items.map((item) => item.id)).size, 1);
    }).pipe(Effect.scoped, Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
  );

  it.effect(
    "reuses a background shell's query for omitted and explicit Normal, but blocks Fast",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const harness = yield* makeWakeHarness;
          const now = yield* DateTime.now;
          const normal = {
            instanceId: ClaudeAdapterV2.CLAUDE_DEFAULT_INSTANCE_ID,
            model: "claude-opus-5-5",
          } satisfies ModelSelection;
          const turn = (ordinal: number, modelSelection: ModelSelection) =>
            makeClaudeTestTurnInput({
              threadId: harness.threadId,
              providerThread: harness.providerThread,
              now,
              attemptId: RunAttemptId.make(`attempt-normal-background:${ordinal}`),
              text: `Request ${ordinal}`,
              attachments: [],
              providerTurnOrdinal: ordinal,
              modelSelection,
            });
          yield* harness.runtime.startTurn(turn(1, normal));
          const originalOptions = harness.getOpenedOptions();
          yield* harness.offerAndWait(wakeTaskStarted);
          yield* harness.offerAndWait(turnOneResult);
          yield* Queue.take(harness.terminalReceipts);
          assert.isTrue(yield* harness.hasPendingBackgroundWork);

          yield* harness.runtime.startTurn(
            turn(2, {
              ...normal,
              options: [{ id: "fastMode", value: false }],
            }),
          );
          assert.strictEqual(harness.getOpenedOptions(), originalOptions);
          assert.lengthOf(harness.offeredMessages, 2);
          yield* harness.offerAndWait(turnOneResult);
          yield* Queue.take(harness.terminalReceipts);

          const refused = yield* harness.runtime
            .startTurn(
              turn(3, {
                ...normal,
                options: [{ id: "fastMode", value: true }],
              }),
            )
            .pipe(Effect.result);
          assert.equal(refused._tag, "Failure");
          if (refused._tag === "Failure") {
            assert.instanceOf(
              refused.failure.cause,
              ClaudeAdapterV2.ClaudeBackgroundWorkBlocksQueryReplacementError,
            );
          }
          assert.strictEqual(harness.getOpenedOptions(), originalOptions);
          assert.lengthOf(harness.offeredMessages, 2);
          assert.isTrue(yield* harness.hasPendingBackgroundWork);
        }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
      ),
  );

  it.effect.each(["completed", "interrupted"] as const)(
    "projects Claude thinking blocks when %s",
    (status) =>
      Effect.gen(function* () {
        const harness = yield* makeWakeHarness;
        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now: yield* DateTime.now,
            attemptId: RunAttemptId.make("reasoning-attempt"),
            text: "Check the plan",
            attachments: [],
          }),
        );
        const stream = (event: unknown, parent: string | null = null) =>
          claudeSdkFrame({
            type: "stream_event",
            event,
            parent_tool_use_id: parent,
            session_id: WAKE_NATIVE_SESSION,
            uuid: "stream-frame",
          });
        const snapshot = (id: string, uuid: string, thinking: string) =>
          claudeSdkFrame({
            type: "assistant",
            uuid,
            session_id: WAKE_NATIVE_SESSION,
            parent_tool_use_id: null,
            message: {
              id,
              model: "claude-sonnet-4-6",
              content: [{ type: "thinking", thinking, signature: "secret-signature" }],
            },
          });
        const frames = [
          stream({ type: "message_start", message: { id: "thought-message" } }),
          stream({
            type: "content_block_start",
            index: 2,
            content_block: { type: "thinking", thinking: "" },
          }),
          stream({
            type: "content_block_delta",
            index: 2,
            delta: { type: "thinking_delta", thinking: "First " },
          }),
          stream({
            type: "content_block_delta",
            index: 2,
            delta: { type: "thinking_delta", thinking: "thought" },
          }),
          stream({
            type: "content_block_delta",
            index: 2,
            delta: { type: "signature_delta", signature: "secret-signature" },
          }),
          stream({ type: "content_block_stop", index: 2 }),
          snapshot("thought-message", "first-snapshot", "Authoritative first thought"),
          snapshot("thought-message", "first-snapshot", "Authoritative first thought"),
          stream({
            type: "content_block_start",
            index: 4,
            content_block: { type: "thinking", thinking: "Second thought" },
          }),
          stream({ type: "content_block_stop", index: 4 }),
          snapshot("thought-message", "second-snapshot", ""),
          snapshot("completion-only", "third-snapshot", "Completion only"),
          snapshot("redacted", "empty-snapshot", ""),
          stream({ type: "message_start", message: { id: "child-message" } }, "child-tool"),
          stream(
            {
              type: "content_block_start",
              index: 0,
              content_block: { type: "thinking", thinking: "Child thought" },
            },
            "child-tool",
          ),
          stream({ type: "message_start", message: { id: "partial-message" } }),
          stream({
            type: "content_block_start",
            index: 0,
            content_block: { type: "thinking", thinking: "Partial thought" },
          }),
          makeResultFrame({
            uuid: "reasoning-result",
            result: "",
            ...(status === "interrupted" ? { terminalReason: "aborted_streaming" as const } : {}),
          }),
        ];
        for (const frame of frames) yield* Queue.offer(harness.sdkMessages, frame);
        const terminal = yield* Queue.take(harness.terminalReceipts);
        assert.equal(terminal.status, status);
        const latest = new Map(
          harness.events.flatMap((event) =>
            event.type === "turn_item.updated" && event.turnItem.type === "reasoning"
              ? [[event.turnItem.id, event.turnItem] as const]
              : [],
          ),
        );
        assert.deepEqual(
          [...latest.values()].map((item) => item.text),
          ["Authoritative first thought", "Second thought", "Completion only", "Partial thought"],
        );
        assert.equal(new Set([...latest.values()].map((item) => item.ordinal)).size, 4);
        for (const item of latest.values()) {
          assert.equal(item.streaming, false);
          assert.isNotNull(item.completedAt);
        }
        assert.isFalse(
          harness.events.some(
            (event) => event.type === "message.updated" && event.message.role === "assistant",
          ),
        );
        for (const item of latest.values()) assert.notInclude(item.text, "secret-signature");
      }).pipe(Effect.scoped, Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
  );

  it.effect.each(["cancelled", "denied", "permission_denied", undefined])(
    "preserves native tool non-execution metadata %s without inferring a denial from text",
    (kind) =>
      Effect.scoped(
        Effect.gen(function* () {
          const harness = yield* makeWakeHarness;
          yield* harness.runtime.startTurn(
            makeClaudeTestTurnInput({
              threadId: harness.threadId,
              providerThread: harness.providerThread,
              now: yield* DateTime.now,
              attemptId: RunAttemptId.make("attempt-tool-non-execution"),
              text: "Run the tool.",
              attachments: [],
            }),
          );
          // Same error text can describe a cancellation or a real refusal.
          // Each result must use its own metadata, even in a multi-result frame.
          yield* harness.offerAndWait(
            claudeSdkFrame({
              type: "user",
              uuid: "tool-non-execution",
              session_id: WAKE_NATIVE_SESSION,
              parent_tool_use_id: null,
              message: {
                role: "user",
                content: [
                  {
                    type: "tool_result",
                    tool_use_id: "tool-error",
                    is_error: true,
                    content: "STOP and wait for the user.",
                  },
                  { type: "tool_result", tool_use_id: "tool-ok", is_error: false, content: "OK" },
                ],
              },
              ...(kind === undefined
                ? {}
                : {
                    tool_result_meta: [
                      { id: "tool-error", non_execution_kind: kind },
                      { id: "tool-ok", non_execution_kind: null },
                    ],
                  }),
            }),
          );
          yield* Queue.offer(
            harness.sdkMessages,
            makeResultFrame({ uuid: "result-non-execution", result: "Done" }),
          );
          yield* Queue.take(harness.terminalReceipts);
          const items = harness.events.flatMap((event) =>
            event.type === "turn_item.updated" && event.turnItem.type === "dynamic_tool"
              ? [event.turnItem]
              : [],
          );
          const failed = items.findLast((item) => item.nativeItemRef?.nativeId === "tool-error")!;
          assert.equal(failed.status, kind === "cancelled" ? "cancelled" : "failed");
          assert.equal(failed.toolNonExecutionKind, kind);
          const ok = items.findLast((item) => item.nativeItemRef?.nativeId === "tool-ok")!;
          assert.equal(ok.status, "completed");
          assert.equal(ok.toolNonExecutionKind, undefined);
          const node = harness.events.findLast(
            (event) =>
              event.type === "node.updated" && event.node.nativeItemRef?.nativeId === "tool-error",
          );
          assert.equal(node?.type === "node.updated" ? node.node.status : undefined, failed.status);
        }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
      ),
  );

  it.effect("keeps a hook-denied Agent call's name and description", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeWakeHarness;
        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now: yield* DateTime.now,
            attemptId: RunAttemptId.make("attempt-denied-agent"),
            text: "Gather the backlog.",
            attachments: [],
          }),
        );
        // A PreToolUse hook refuses the launch: no task starts, so the result
        // is the only frame that names the call.
        yield* Queue.offer(
          harness.sdkMessages,
          claudeSdkFrame({
            type: "assistant",
            message: {
              model: "claude-opus-5-5",
              id: "msg_denied_agent",
              type: "message",
              role: "assistant",
              content: [
                {
                  type: "tool_use",
                  id: "toolu_denied_agent",
                  name: "Agent",
                  input: { description: "Gather open backlog items", prompt: "Read the plans." },
                },
              ],
            },
            parent_tool_use_id: null,
            uuid: "00000000-0000-4000-8000-000000000901",
            session_id: WAKE_NATIVE_SESSION,
          }),
        );
        yield* harness.offerAndWait(
          claudeSdkFrame({
            type: "user",
            uuid: "00000000-0000-4000-8000-000000000902",
            session_id: WAKE_NATIVE_SESSION,
            parent_tool_use_id: null,
            message: {
              role: "user",
              content: [
                {
                  type: "tool_result",
                  tool_use_id: "toolu_denied_agent",
                  is_error: true,
                  content: "PreToolUse:Agent hook error: not allowed",
                },
              ],
            },
            tool_result_meta: [{ id: "toolu_denied_agent", non_execution_kind: "permission-rule" }],
          }),
        );
        yield* Queue.offer(
          harness.sdkMessages,
          makeResultFrame({ uuid: "00000000-0000-4000-8000-000000000903", result: "Done" }),
        );
        yield* Queue.take(harness.terminalReceipts);
        const denied = harness.events.findLast(
          (event) =>
            event.type === "turn_item.updated" &&
            event.turnItem.nativeItemRef?.nativeId === "toolu_denied_agent",
        );
        const item =
          denied?.type === "turn_item.updated" && denied.turnItem.type === "dynamic_tool"
            ? denied.turnItem
            : undefined;
        assert.equal(item?.toolName, "Agent");
        assert.equal(item?.title, "Gather open backlog items");
        assert.equal(item?.status, "failed");
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );

  it.effect.each(
    (["aborted_tools", "aborted_streaming"] as const).flatMap((terminalReason) =>
      [true, false].map((steered) => ({ terminalReason, steered })),
    ),
  )("handles $terminalReason with active steering=$steered", ({ terminalReason, steered }) =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeWakeHarness;
        const idAllocator = yield* IdAllocator.IdAllocatorV2;
        const attemptId = RunAttemptId.make("attempt-steering-abort");
        const input = makeClaudeTestTurnInput({
          threadId: harness.threadId,
          providerThread: harness.providerThread,
          now: yield* DateTime.now,
          attemptId,
          text: "Audit the settings pages.",
          attachments: [],
        });
        yield* harness.runtime.startTurn(input);
        if (steered) {
          yield* harness.runtime.steerTurn({
            threadId: harness.threadId,
            runId: input.runId,
            providerThread: harness.providerThread,
            providerTurnId: idAllocator.derive.providerTurn({
              driver: ClaudeAdapterV2.CLAUDE_PROVIDER,
              nativeTurnId: `turn:${attemptId}`,
            }),
            message: {
              createdBy: "user",
              creationSource: "web",
              messageId: MessageId.make("message-steering-abort"),
              text: "Include the hierarchy mock.",
              attachments: [],
            },
          });
          assert.equal(harness.offeredMessages[1]?.priority, "now");
        }
        yield* Queue.offer(
          harness.sdkMessages,
          makeResultFrame({
            uuid: "00000000-0000-4000-8000-000000000901",
            result: "",
            terminalReason,
            usage: {
              input_tokens: 600,
              output_tokens: 40,
              cache_creation_input_tokens: 500,
              cache_read_input_tokens: 2000,
            },
          }),
        );
        if (steered) {
          yield* Queue.offer(harness.sdkMessages, wakeAssistant);
          yield* Queue.offer(
            harness.sdkMessages,
            makeResultFrame({
              uuid: "00000000-0000-4000-8000-000000000902",
              result: "Audit finished after the steer.",
              usage: {
                input_tokens: 3,
                output_tokens: 6,
                cache_creation_input_tokens: 2347,
                cache_read_input_tokens: 9455,
              },
            }),
          );
        }
        const terminal = yield* Queue.take(harness.terminalReceipts);
        assert.equal(terminal.status, steered ? "completed" : "interrupted");
        if (steered) {
          assert.isTrue(
            harness.events.some(
              (event) =>
                event.type === "turn_item.updated" &&
                event.turnItem.type === "assistant_message" &&
                event.turnItem.text === WAKE_ASSISTANT_TEXT,
            ),
          );
          // Each result's usage covers only its own segment, so the steered
          // turn bills both segments.
          const completed = harness.events.findLast(
            (event) => event.type === "provider_turn.updated",
          );
          assert.deepEqual(
            completed?.type === "provider_turn.updated"
              ? completed.providerTurn.turnTokenUsage
              : undefined,
            {
              usageScope: "main_agent",
              usageStatus: "complete",
              hasSubagents: false,
              inputTokens: 603 + 2847 + 11455,
              outputTokens: 46,
              cachedInputTokens: 11455,
              cacheCreationTokens: 2847,
            },
          );
        }
        assert.lengthOf(harness.terminalEvents(), 1);
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );

  it.effect("announces usage-limit pauses once per window and again on a new turn", () =>
    Effect.gen(function* () {
      const harness = yield* makeWakeHarness;
      const now = yield* DateTime.now;
      const resetsAt = Math.floor(DateTime.toEpochMillis(now) / 1000) + 7_200;
      const limit = (rateLimitType: "five_hour" | "seven_day" = "five_hour") =>
        claudeSdkFrame({
          type: "rate_limit_event",
          rate_limit_info: { status: "rejected", rateLimitType, resetsAt },
          uuid: "00000000-0000-4000-8000-000000000601",
          session_id: WAKE_NATIVE_SESSION,
        });
      const start = (ordinal: number) =>
        harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: RunAttemptId.make(`attempt-claude-limit-${ordinal}`),
            providerTurnOrdinal: ordinal,
            text: "Continue.",
            attachments: [],
          }),
        );
      yield* start(1);
      yield* Queue.offer(harness.sdkMessages, limit());
      const pause = (yield* Queue.take(harness.systemNoticeReceipts)).turnItem;
      assert.equal(pause.type, "system_notice");
      if (pause.type !== "system_notice") return;
      assert.equal(
        pause.message,
        "Claude usage limit reached. This turn is paused until the 5-hour limit resets in 2h.",
      );
      assert.lengthOf(harness.terminalEvents(), 0);
      yield* Queue.offerAll(harness.sdkMessages, [
        limit(),
        limit("seven_day"),
        limit(),
        makeResultFrame({
          uuid: "00000000-0000-4000-8000-000000000602",
          result: "Recovered.",
        }),
      ]);
      yield* Queue.take(harness.terminalReceipts);
      const notices = () =>
        harness.events.flatMap((event) =>
          event.type === "turn_item.updated" && event.turnItem.type === "system_notice"
            ? [event.turnItem]
            : [],
        );
      assert.lengthOf(notices(), 2);
      yield* start(2);
      yield* Queue.offerAll(harness.sdkMessages, [
        limit(),
        makeResultFrame({
          uuid: "00000000-0000-4000-8000-000000000603",
          result: "Done.",
        }),
      ]);
      yield* Queue.take(harness.terminalReceipts);
      assert.lengthOf(notices(), 3);
      assert.notEqual(notices()[0]?.id, notices()[2]?.id);
    }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
  );

  it.effect("keeps usage warnings and provisioned overage silent", () =>
    Effect.gen(function* () {
      const harness = yield* makeWakeHarness;
      const now = yield* DateTime.now;
      yield* harness.runtime.startTurn(
        makeClaudeTestTurnInput({
          threadId: harness.threadId,
          providerThread: harness.providerThread,
          now,
          attemptId: RunAttemptId.make("attempt-claude-overage"),
          text: "Continue.",
          attachments: [],
        }),
      );
      for (const rate_limit_info of [
        { status: "allowed_warning" },
        { status: "rejected", overageStatus: "allowed" },
        { status: "rejected", overageStatus: "allowed_warning" },
        { status: "rejected", isUsingOverage: true },
        { status: "rejected", overageInUse: true },
      ]) {
        yield* Queue.offer(
          harness.sdkMessages,
          claudeSdkFrame({
            type: "rate_limit_event",
            rate_limit_info,
            session_id: WAKE_NATIVE_SESSION,
            uuid: "00000000-0000-4000-8000-000000000604",
          }),
        );
      }
      yield* Queue.offer(
        harness.sdkMessages,
        makeResultFrame({
          uuid: "00000000-0000-4000-8000-000000000605",
          result: "Done.",
        }),
      );
      yield* Queue.take(harness.terminalReceipts);
      assert.isFalse(
        harness.events.some(
          (event) => event.type === "turn_item.updated" && event.turnItem.type === "system_notice",
        ),
      );
    }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
  );

  it.effect("names an expired Claude login instead of the terminal API error", () =>
    Effect.gen(function* () {
      const configDir = "/synthetic/Claude config";
      const cwd = "/synthetic/project";
      const harness = yield* makeWakeHarnessWithOptions({
        environment: { CLAUDE_CONFIG_DIR: configDir },
      });
      const now = yield* DateTime.now;
      yield* harness.runtime.startTurn(
        makeClaudeTestTurnInput({
          threadId: harness.threadId,
          providerThread: harness.providerThread,
          now,
          attemptId: RunAttemptId.make("attempt-claude-auth-failure"),
          text: "Continue.",
          attachments: [],
          runtimePolicy: ProviderAdapterV2RuntimePolicy.make({
            runtimeMode: "full-access",
            interactionMode: "default",
            cwd,
          }),
        }),
      );
      yield* Queue.offerAll(harness.sdkMessages, [
        makeAssistantErrorFrame({
          uuid: "00000000-0000-4000-8000-000000000606",
          error: "authentication_failed",
        }),
        makeResultFrame({
          uuid: "00000000-0000-4000-8000-000000000607",
          result: "API Error",
          terminalReason: "api_error",
        }),
      ]);

      const terminal = yield* Queue.take(harness.terminalReceipts);
      assert.equal(terminal.status, "failed");
      if (terminal.status !== "failed") return;
      assert.include(terminal.failure.message, "run `claude auth login`");
      assert.include(terminal.failure.message, configDir);
      assert.include(terminal.failure.message, cwd);
      assert.notInclude(terminal.failure.message, "repeated API errors");
    }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
  );

  it.effect.each([
    { recovered: false, expected: "Claude usage limit reached" },
    { recovered: true, expected: "Claude gave up after repeated API errors" },
  ])("tracks whether a rejected usage window recovered ($recovered)", ({ recovered, expected }) =>
    Effect.gen(function* () {
      const harness = yield* makeWakeHarness;
      const now = yield* DateTime.now;
      yield* harness.runtime.startTurn(
        makeClaudeTestTurnInput({
          threadId: harness.threadId,
          providerThread: harness.providerThread,
          now,
          attemptId: RunAttemptId.make(`attempt-claude-window-${recovered}`),
          text: "Continue.",
          attachments: [],
        }),
      );
      yield* Queue.offer(
        harness.sdkMessages,
        claudeSdkFrame({
          type: "rate_limit_event",
          rate_limit_info: { status: "rejected", rateLimitType: "five_hour" },
          uuid: "00000000-0000-4000-8000-000000000608",
          session_id: WAKE_NATIVE_SESSION,
        }),
      );
      if (recovered) {
        yield* Queue.offer(
          harness.sdkMessages,
          claudeSdkFrame({
            type: "rate_limit_event",
            rate_limit_info: { status: "allowed", rateLimitType: "five_hour" },
            uuid: "00000000-0000-4000-8000-000000000609",
            session_id: WAKE_NATIVE_SESSION,
          }),
        );
      }
      yield* Queue.offer(
        harness.sdkMessages,
        makeResultFrame({
          uuid: "00000000-0000-4000-8000-000000000610",
          result: "API Error",
          terminalReason: "api_error",
        }),
      );

      const terminal = yield* Queue.take(harness.terminalReceipts);
      assert.equal(terminal.status, "failed");
      if (terminal.status !== "failed") return;
      assert.include(terminal.failure.message, expected);
      assert.equal(terminal.failure.class, recovered ? "provider_error" : "usage_limit");
    }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
  );

  it.effect("an interrupted turn after a rollback stops resuming at the rolled-back head", () =>
    Effect.gen(function* () {
      const harness = yield* makeWakeHarnessWithOptions({
        close: (sdkMessages) => Queue.shutdown(sdkMessages),
        freshQueueOnReopen: true,
      });
      const now = yield* DateTime.now;
      const pinnedHead = "00000000-0000-4000-8000-000000025510";
      const pinnedThread = {
        ...harness.providerThread,
        nativeConversationHeadRef: {
          driver: ClaudeAdapterV2.CLAUDE_PROVIDER,
          nativeId: pinnedHead,
          strength: "weak" as const,
        },
      };
      const interruptedInput = makeClaudeTestTurnInput({
        threadId: harness.threadId,
        providerThread: pinnedThread,
        now,
        attemptId: RunAttemptId.make("attempt-claude-interrupt-after-rollback"),
        text: "The secret word is apricot-25510. Then run sleep 60.",
        attachments: [],
        providerTurnOrdinal: 2,
        nativeThreadHasTurns: true,
      });
      yield* harness.runtime.startTurn(interruptedInput);
      assert.equal(harness.getOpenedOptions()?.resumeSessionAt, pinnedHead);
      yield* harness.offerAndWait(
        makeAssistantTextFrame({
          uuid: "00000000-0000-4000-8000-000000025511",
          text: "Noted apricot-25510. Running sleep.",
        }),
      );
      yield* harness.runtime.interruptTurn({
        providerThread: pinnedThread,
        providerTurnId: (yield* IdAllocator.IdAllocatorV2).derive.providerTurn({
          driver: ClaudeAdapterV2.CLAUDE_PROVIDER,
          nativeTurnId: `turn:${interruptedInput.attemptId}`,
        }),
      });
      assert.equal((yield* Queue.take(harness.terminalReceipts)).status, "interrupted");
      const afterInterrupt = harness.events.findLast(
        (event) => event.type === "provider_thread.updated",
      )?.providerThread;
      assert.isDefined(afterInterrupt);
      assert.isNull(afterInterrupt.nativeConversationHeadRef);

      yield* harness.runtime.startTurn(
        makeClaudeTestTurnInput({
          threadId: harness.threadId,
          providerThread: afterInterrupt,
          now,
          attemptId: RunAttemptId.make("attempt-claude-after-interrupt"),
          text: "What is the secret word?",
          attachments: [],
          providerTurnOrdinal: 3,
          nativeThreadHasTurns: true,
        }),
      );
      assert.equal(harness.processQueues.length, 2);
      assert.isUndefined(harness.getOpenedOptions()?.resumeSessionAt);
    }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
  );

  it.effect("an interrupted turn with no assistant output keeps the rolled-back head", () =>
    Effect.gen(function* () {
      const harness = yield* makeWakeHarnessWithOptions({
        close: (sdkMessages) => Queue.shutdown(sdkMessages),
        freshQueueOnReopen: true,
      });
      const now = yield* DateTime.now;
      const pinnedHead = "00000000-0000-4000-8000-000000025510";
      const pinnedThread = {
        ...harness.providerThread,
        nativeConversationHeadRef: {
          driver: ClaudeAdapterV2.CLAUDE_PROVIDER,
          nativeId: pinnedHead,
          strength: "weak" as const,
        },
      };
      const interruptedInput = makeClaudeTestTurnInput({
        threadId: harness.threadId,
        providerThread: pinnedThread,
        now,
        attemptId: RunAttemptId.make("attempt-claude-silent-interrupt-after-rollback"),
        text: "The secret word is apricot-25510. Then run sleep 60.",
        attachments: [],
        providerTurnOrdinal: 2,
        nativeThreadHasTurns: true,
      });
      yield* harness.runtime.startTurn(interruptedInput);
      assert.equal(harness.getOpenedOptions()?.resumeSessionAt, pinnedHead);
      yield* harness.runtime.interruptTurn({
        providerThread: pinnedThread,
        providerTurnId: (yield* IdAllocator.IdAllocatorV2).derive.providerTurn({
          driver: ClaudeAdapterV2.CLAUDE_PROVIDER,
          nativeTurnId: `turn:${interruptedInput.attemptId}`,
        }),
      });
      assert.equal((yield* Queue.take(harness.terminalReceipts)).status, "interrupted");
      const afterInterrupt = harness.events.findLast(
        (event) => event.type === "provider_thread.updated",
      )?.providerThread;
      assert.isDefined(afterInterrupt);
      assert.equal(afterInterrupt.nativeConversationHeadRef?.nativeId, pinnedHead);

      yield* harness.runtime.startTurn(
        makeClaudeTestTurnInput({
          threadId: harness.threadId,
          providerThread: afterInterrupt,
          now,
          attemptId: RunAttemptId.make("attempt-claude-after-silent-interrupt"),
          text: "What is the secret word?",
          attachments: [],
          providerTurnOrdinal: 3,
          nativeThreadHasTurns: true,
        }),
      );
      assert.equal(harness.processQueues.length, 2);
      assert.equal(harness.getOpenedOptions()?.resumeSessionAt, pinnedHead);
    }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
  );

  it.effect.each([
    { name: "parent limit", parentErrors: ["rate_limit"], expectedLimit: true },
    {
      name: "parent limit then nested response",
      parentErrors: ["rate_limit", "nested-ok"],
      expectedLimit: true,
    },
    { name: "nested limit", parentErrors: ["nested-limit"], expectedLimit: false },
    {
      name: "parent limit then parent response",
      parentErrors: ["rate_limit", "ok"],
      expectedLimit: false,
    },
  ])("classifies retried terminal API failures after $name", ({ parentErrors, expectedLimit }) =>
    Effect.gen(function* () {
      const harness = yield* makeWakeHarness;
      const now = yield* DateTime.now;
      yield* harness.runtime.startTurn(
        makeClaudeTestTurnInput({
          threadId: harness.threadId,
          providerThread: harness.providerThread,
          now,
          attemptId: RunAttemptId.make(`attempt-claude-retry-${parentErrors.join("-")}`),
          text: "Continue.",
          attachments: [],
        }),
      );
      for (const [index, evidence] of parentErrors.entries()) {
        yield* Queue.offer(
          harness.sdkMessages,
          makeAssistantErrorFrame({
            uuid: `00000000-0000-4000-8000-00000000062${index}`,
            error: evidence.includes("limit") ? "rate_limit" : undefined,
            parentToolUseId: evidence.startsWith("nested") ? "nested-tool" : null,
          }),
        );
      }
      yield* Queue.offer(
        harness.sdkMessages,
        makeResultFrame({
          uuid: "00000000-0000-4000-8000-000000000629",
          result: "API Error",
          isError: true,
          terminalReason: "api_error",
        }),
      );

      const terminal = yield* Queue.take(harness.terminalReceipts);
      assert.equal(terminal.status, "failed");
      if (terminal.status !== "failed") return;
      assert.equal(terminal.failure.class, expectedLimit ? "usage_limit" : "provider_error");
      assert.equal(
        terminal.failure.message,
        expectedLimit
          ? "Claude usage limit reached. Send the message again once the limit resets."
          : "Claude gave up after repeated API errors.",
      );
    }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
  );

  it.effect.each([429, 401, 529])(
    "classifies the current Claude API status %s after rate-limit evidence",
    (apiErrorStatus) =>
      Effect.gen(function* () {
        const harness = yield* makeWakeHarness;
        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now: yield* DateTime.now,
            attemptId: RunAttemptId.make(`attempt-status-${apiErrorStatus}`),
            text: "Continue.",
            attachments: [],
          }),
        );
        yield* Queue.offer(
          harness.sdkMessages,
          makeAssistantErrorFrame({
            uuid: "00000000-0000-4000-8000-000000000650",
            error: "rate_limit",
          }),
        );
        yield* Queue.offer(
          harness.sdkMessages,
          makeResultFrame({
            uuid: "00000000-0000-4000-8000-000000000651",
            result: "API Error",
            terminalReason: "api_error",
            isError: true,
            apiErrorStatus,
          }),
        );
        const terminal = yield* Queue.take(harness.terminalReceipts);
        assert.equal(terminal.status, "failed");
        if (terminal.status !== "failed") return;
        assert.equal(
          terminal.failure.class,
          apiErrorStatus === 429 ? "usage_limit" : "provider_error",
        );
        if (apiErrorStatus !== 429)
          assert.notInclude(terminal.failure.message.toLowerCase(), "usage limit");
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
  );

  it.effect("surfaces a Claude safety model fallback without failing the turn", () =>
    Effect.gen(function* () {
      const harness = yield* makeWakeHarness;
      const now = yield* DateTime.now;
      yield* harness.runtime.startTurn(
        makeClaudeTestTurnInput({
          threadId: harness.threadId,
          providerThread: harness.providerThread,
          now,
          attemptId: RunAttemptId.make("claude-safety-fallback-attempt"),
          text: "Continue the audit",
          attachments: [],
        }),
      );
      const notice = "Safeguards flagged this message. Switched to Opus 4.8.";
      const uuid = "00000000-0000-4000-8000-000000000301";
      yield* Queue.offer(
        harness.sdkMessages,
        claudeSdkFrame({
          type: "system",
          subtype: "model_refusal_fallback",
          trigger: "refusal",
          direction: "retry",
          original_model: "claude-fable-5",
          fallback_model: "claude-opus-4-8",
          request_id: "request-safety-fallback",
          api_refusal_category: "cyber",
          api_refusal_explanation: null,
          content: notice,
          session_id: WAKE_NATIVE_SESSION,
          uuid,
        }),
      );
      yield* Queue.offer(
        harness.sdkMessages,
        makeResultFrame({
          uuid: "00000000-0000-4000-8000-000000000302",
          result: "Audit complete.",
        }),
      );
      yield* Queue.take(harness.terminalReceipts);
      const notices = harness.events.flatMap((event) =>
        event.type === "turn_item.updated" && event.turnItem.type === "system_notice"
          ? [event.turnItem]
          : [],
      );
      assert.lengthOf(notices, 1);
      assert.equal(notices[0]?.message, notice);
      assert.equal(notices[0]?.status, "completed");
      assert.equal(notices[0]?.nativeItemRef?.nativeId, uuid);
      assert.equal(harness.terminalEvents()[0]?.status, "completed");
      assert.isFalse(
        harness.events.some(
          (event) => event.type === "turn_item.updated" && event.turnItem.type === "error",
        ),
      );
    }).pipe(Effect.scoped, Effect.provide(Layer.mergeAll(NodeServices.layer, IdAllocator.layer))),
  );

  it.effect(
    "runs native compaction and keeps its context watermark separate from billed usage",
    () =>
      Effect.gen(function* () {
        const harness = yield* makeWakeHarness;
        const now = yield* DateTime.now;
        const compact = harness.runtime.compactThread;
        assert.isDefined(compact);
        if (compact === undefined) return;
        yield* compact(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: RunAttemptId.make("claude-native-compact-attempt"),
            text: " /COMPACT ",
            attachments: [],
          }),
        );
        yield* Queue.offer(
          harness.sdkMessages,
          claudeSdkFrame({
            type: "system",
            subtype: "compact_boundary",
            compact_metadata: { trigger: "manual", pre_tokens: 1500, post_tokens: 400 },
            uuid: "00000000-0000-4000-8000-000000000201",
            session_id: WAKE_NATIVE_SESSION,
          }),
        );
        yield* Queue.offer(
          harness.sdkMessages,
          makeResultFrame({
            uuid: "00000000-0000-4000-8000-000000000202",
            result: "Compacted conversation.",
          }),
        );
        yield* Queue.take(harness.terminalReceipts);

        assert.deepEqual(harness.offeredMessages[0]?.message.content, "/compact");
        const compaction = harness.events.find(
          (event) => event.type === "turn_item.updated" && event.turnItem.type === "compaction",
        );
        assert.isDefined(compaction);
        if (compaction?.type === "turn_item.updated" && compaction.turnItem.type === "compaction") {
          assert.equal(compaction.turnItem.beforeTokenCount, 1500);
          assert.equal(compaction.turnItem.afterTokenCount, 400);
          assert.equal(compaction.turnItem.status, "completed");
        }
        const watermark = harness.events.find(
          (event) =>
            event.type === "provider_turn.updated" &&
            event.providerTurn.tokenUsage?.usedTokens === 400,
        );
        assert.isDefined(watermark);
        const completed = harness.events.findLast(
          (event) => event.type === "provider_turn.updated",
        );
        assert.equal(completed?.type, "provider_turn.updated");
        if (completed?.type === "provider_turn.updated") {
          assert.deepEqual(completed.providerTurn.turnTokenUsage, {
            usageScope: "main_agent",
            usageStatus: "complete",
            hasSubagents: false,
            inputTokens: 1,
            outputTokens: 1,
            cachedInputTokens: 0,
            cacheCreationTokens: 0,
          });
        }
      }).pipe(Effect.scoped, Effect.provide(Layer.mergeAll(NodeServices.layer, IdAllocator.layer))),
  );

  it.effect("titles Claude reads, searches, and skills on tool completion", () =>
    Effect.gen(function* () {
      const harness = yield* makeWakeHarness;
      const now = yield* DateTime.now;
      yield* harness.runtime.startTurn(
        makeClaudeTestTurnInput({
          threadId: harness.threadId,
          providerThread: harness.providerThread,
          now,
          attemptId: RunAttemptId.make("attempt-read-images"),
          text: "Read the files",
          attachments: [],
        }),
      );
      const tools = [
        { id: "image", name: "Read", input: { file_path: " /workspace/reference.png " } },
        { id: "text", name: "Read", input: { file_path: "/workspace/README.md" } },
        { id: "search", name: "Grep", input: { pattern: "TODO", path: "/workspace/src" } },
        { id: "skill", name: "Skill", input: { skill: "full-send" } },
        {
          id: "write",
          name: "Write",
          input: { file_path: "/workspace/output.png", content: "text" },
        },
      ];
      yield* Queue.offer(
        harness.sdkMessages,
        claudeSdkFrame({
          type: "assistant",
          uuid: "00000000-0000-4000-8000-000000000601",
          session_id: WAKE_NATIVE_SESSION,
          parent_tool_use_id: null,
          message: {
            id: "msg_image_reads",
            model: "claude-sonnet-4-6",
            type: "message",
            role: "assistant",
            content: tools.map((tool) => ({ type: "tool_use", ...tool })),
            stop_reason: "tool_use",
            stop_sequence: null,
            usage: {
              input_tokens: 1,
              output_tokens: 1,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 0,
            },
          },
        }),
      );
      yield* Queue.offer(
        harness.sdkMessages,
        claudeSdkFrame({
          type: "user",
          uuid: "00000000-0000-4000-8000-000000000602",
          session_id: WAKE_NATIVE_SESSION,
          parent_tool_use_id: null,
          message: {
            role: "user",
            content: tools.map((tool) => ({
              type: "tool_result",
              tool_use_id: tool.id,
              content: "ok",
            })),
          },
        }),
      );
      yield* Queue.offer(
        harness.sdkMessages,
        makeResultFrame({ uuid: "00000000-0000-4000-8000-000000000603", result: "Read files" }),
      );
      yield* Queue.take(harness.terminalReceipts);
      const items = harness.events.flatMap((event) =>
        event.type === "turn_item.updated" && event.turnItem.status === "completed"
          ? [event.turnItem]
          : [],
      );
      const image = items.find((item) => item.nativeItemRef?.nativeId === "image");
      assert.equal(image?.type, "dynamic_tool");
      if (image?.type === "dynamic_tool")
        assert.equal(image.viewedImagePath, "/workspace/reference.png");
      assert.equal(image?.title, "Read /workspace/reference.png");
      assert.equal(
        items.find((item) => item.nativeItemRef?.nativeId === "text")?.title,
        "Read /workspace/README.md",
      );
      assert.equal(
        items.find((item) => item.nativeItemRef?.nativeId === "search")?.title,
        "Searched TODO in src",
      );
      assert.equal(
        items.find((item) => item.nativeItemRef?.nativeId === "skill")?.title,
        "Skill: full-send",
      );
      for (const item of items.filter((item) => item.nativeItemRef?.nativeId !== "image"))
        assert.notProperty(item, "viewedImagePath");
    }).pipe(Effect.scoped, Effect.provide(Layer.mergeAll(NodeServices.layer, IdAllocator.layer))),
  );

  it.effect("preserves typed Claude plans and todos through generic tool completion", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeWakeHarness;
        const now = yield* DateTime.now;
        const assistantTools = (
          uuid: string,
          tools: ReadonlyArray<Record<string, unknown>>,
          parentToolUseId: string | null = null,
        ) =>
          claudeSdkFrame({
            type: "assistant",
            message: {
              model: "claude-sonnet-4-6",
              id: `msg_${uuid}`,
              type: "message",
              role: "assistant",
              content: tools.map((tool) => ({ type: "tool_use", ...tool })),
              stop_reason: "tool_use",
              stop_sequence: null,
              usage: {
                input_tokens: 1,
                output_tokens: 1,
                cache_creation_input_tokens: 0,
                cache_read_input_tokens: 0,
              },
            },
            parent_tool_use_id: parentToolUseId,
            uuid,
            session_id: WAKE_NATIVE_SESSION,
          });
        const toolResults = (uuid: string, toolUseIds: ReadonlyArray<string>) =>
          claudeSdkFrame({
            type: "user",
            message: {
              role: "user",
              content: toolUseIds.map((toolUseId) => ({
                type: "tool_result",
                tool_use_id: toolUseId,
                content: "ok",
              })),
            },
            parent_tool_use_id: null,
            uuid,
            session_id: WAKE_NATIVE_SESSION,
          });

        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-plan-lifecycle-1"),
            text: "Plan the work.",
            attachments: [],
          }),
        );
        yield* Queue.offer(
          harness.sdkMessages,
          assistantTools("00000000-0000-4000-8000-000000000501", [
            {
              id: "tool-todo-1",
              name: "TodoWrite",
              input: { todos: [{ content: "Inspect", status: "in_progress" }] },
            },
          ]),
        );
        yield* Queue.offer(
          harness.sdkMessages,
          assistantTools("00000000-0000-4000-8000-000000000501", [
            {
              id: "tool-todo-1",
              name: "TodoWrite",
              input: { todos: [{ content: "Inspect", status: "in_progress" }] },
            },
          ]),
        );
        yield* Queue.offer(
          harness.sdkMessages,
          toolResults("00000000-0000-4000-8000-000000000502", ["tool-todo-1"]),
        );
        // Claude entered plan mode on its own (EnterPlanMode).
        yield* Queue.offer(
          harness.sdkMessages,
          claudeSdkFrame({
            type: "system",
            subtype: "status",
            status: null,
            permissionMode: "plan",
            uuid: "00000000-0000-4000-8000-000000000508",
            session_id: WAKE_NATIVE_SESSION,
          }),
        );
        yield* Queue.offer(
          harness.sdkMessages,
          makeResultFrame({
            uuid: "00000000-0000-4000-8000-000000000503",
            result: "Todo recorded.",
          }),
        );
        yield* Queue.take(harness.terminalReceipts);

        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-plan-lifecycle-2"),
            providerTurnOrdinal: 2,
            text: "Finish the plan.",
            attachments: [],
          }),
        );
        const canUseTool = harness.getOpenedOptions()?.canUseTool;
        assert.isFunction(canUseTool);
        const planMarkdown = "# Ready to implement\n\n1. Ship it.";
        yield* Effect.promise(() =>
          canUseTool!(
            "ExitPlanMode",
            { plan: planMarkdown },
            {
              signal: new AbortController().signal,
              toolUseID: "tool-exit-plan-1",
              requestId: "request-exit-plan-1",
            },
          ),
        );
        yield* Queue.offer(
          harness.sdkMessages,
          assistantTools("00000000-0000-4000-8000-000000000504", [
            {
              id: "tool-todo-2",
              name: "TodoWrite",
              input: { todos: [{ content: "Inspect", status: "completed" }] },
            },
            { id: "tool-exit-plan-1", name: "ExitPlanMode", input: { plan: planMarkdown } },
          ]),
        );
        yield* Queue.offer(
          harness.sdkMessages,
          assistantTools(
            "00000000-0000-4000-8000-000000000507",
            [
              {
                id: "tool-subagent-todo",
                name: "TodoWrite",
                input: { todos: [{ content: "Child-only work", status: "in_progress" }] },
              },
            ],
            "tool-parent-agent",
          ),
        );
        yield* Queue.offer(
          harness.sdkMessages,
          toolResults("00000000-0000-4000-8000-000000000505", ["tool-todo-2", "tool-exit-plan-1"]),
        );
        yield* Queue.offer(
          harness.sdkMessages,
          makeResultFrame({
            uuid: "00000000-0000-4000-8000-000000000506",
            result: "Plan captured.",
          }),
        );
        yield* Queue.take(harness.terminalReceipts);

        const items = new Map(
          harness.events.flatMap((event) =>
            event.type === "turn_item.updated" ? [[String(event.turnItem.id), event.turnItem]] : [],
          ),
        );
        const plans = new Map(
          harness.events.flatMap((event) =>
            event.type === "plan.updated" ? [[String(event.plan.id), event.plan]] : [],
          ),
        );
        const todoItems = [...items.values()].filter((item) => item.type === "todo_list");
        const proposedItems = [...items.values()].filter((item) => item.type === "proposed_plan");
        assert.lengthOf(todoItems, 2);
        assert.lengthOf(proposedItems, 1);
        assert.equal(
          proposedItems[0]?.type === "proposed_plan" && proposedItems[0].markdown,
          planMarkdown,
        );
        assert.isTrue(
          [...items.values()].some(
            (item) =>
              item.type === "dynamic_tool" && item.nativeItemRef?.nativeId === "tool-todo-2",
          ),
        );
        assert.isTrue(
          [...items.values()].some(
            (item) =>
              item.type === "dynamic_tool" && item.nativeItemRef?.nativeId === "tool-exit-plan-1",
          ),
        );
        assert.deepEqual(
          [...plans.values()]
            .filter((plan) => plan.kind === "todo_list")
            .map((plan) => plan.status),
          ["superseded", "completed"],
        );
        const proposedPlan = [...plans.values()].find((plan) => plan.kind === "proposed_plan");
        assert.equal(proposedPlan?.status, "active");
        // The second prompt reuses the live process, which is still in the
        // plan mode Claude entered, so it is put back in the thread's mode.
        assert.deepEqual(harness.permissionModeChanges, ["bypassPermissions"]);
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );

  it.effect("resolves API retries on resumed assistant activity", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeWakeHarness;
        const now = yield* DateTime.now;
        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-api-retry"),
            text: "Open github.com.",
            attachments: [],
          }),
        );

        yield* Queue.offer(
          harness.sdkMessages,
          claudeSdkFrame({
            type: "system",
            subtype: "api_retry",
            attempt: 2,
            max_retries: 10,
            retry_delay_ms: 1_500,
            error_status: 529,
            error: "overloaded",
            uuid: "00000000-0000-4000-8000-000000000201",
            session_id: WAKE_NATIVE_SESSION,
          }),
        );
        const retryItems = () =>
          harness.events.flatMap((event) =>
            event.type === "turn_item.updated" &&
            event.turnItem.type === "error" &&
            event.turnItem.retry !== undefined
              ? [event.turnItem]
              : [],
          );
        yield* awaitUntil(() => retryItems().length === 1, "Claude retry item");
        const runningRetry = retryItems()[0];
        assert.equal(runningRetry?.status, "running");
        assert.equal(runningRetry?.failure.code, "api_error_529");
        assert.deepEqual(runningRetry?.retry, {
          attempt: 2,
          maxAttempts: 10,
          retryDelayMs: 1_500,
        });

        yield* Queue.offer(
          harness.sdkMessages,
          makeAssistantTextFrame({
            uuid: "00000000-0000-4000-8000-000000000202",
            text: "Opening GitHub.",
          }),
        );
        yield* awaitUntil(() => retryItems().length === 2, "resolved Claude retry item");
        assert.lengthOf(harness.terminalEvents(), 0);
        const recoveredRetry = retryItems()[1];
        assert.equal(recoveredRetry?.id, runningRetry?.id);
        assert.equal(recoveredRetry?.status, "completed");
        assert.equal(recoveredRetry?.title, "Provider recovered");

        yield* Queue.offer(
          harness.sdkMessages,
          makeResultFrame({
            uuid: "00000000-0000-4000-8000-000000000203",
            result: "Opened GitHub.",
          }),
        );
        yield* awaitUntil(() => harness.terminalEvents().length === 1, "recovered Claude turn");
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );

  it.effect("carries exhausted retry progress into the terminal provider error", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeWakeHarness;
        const now = yield* DateTime.now;
        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-api-retry-exhausted"),
            text: "Open github.com.",
            attachments: [],
          }),
        );
        yield* Queue.offer(
          harness.sdkMessages,
          claudeSdkFrame({
            type: "system",
            subtype: "api_retry",
            attempt: 10,
            max_retries: 10,
            retry_delay_ms: 38_010,
            error_status: 529,
            error: "overloaded",
            uuid: "00000000-0000-4000-8000-000000000203",
            session_id: WAKE_NATIVE_SESSION,
          }),
        );
        yield* Queue.offer(
          harness.sdkMessages,
          makeResultFrame({
            uuid: "00000000-0000-4000-8000-000000000204",
            result: "Claude is temporarily overloaded.",
            isError: true,
            apiErrorStatus: 529,
          }),
        );
        yield* awaitUntil(() => harness.terminalEvents().length === 1, "failed Claude turn");

        const terminal = harness.terminalEvents()[0];
        assert.equal(terminal?.status, "failed");
        if (terminal?.status !== "failed") return;
        assert.deepEqual(terminal.retry, {
          attempt: 10,
          maxAttempts: 10,
          retryDelayMs: 38_010,
        });
        assert.isDefined(terminal.retryStartedAt);
        assert.equal(terminal.failure.code, "api_error_529");
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );

  it.effect.each([
    "api_error",
    "malformed_tool_use_exhausted",
    "budget_exhausted",
    "structured_output_retry_exhausted",
    "tool_deferred_unavailable",
    "turn_setup_failed",
    "blocking_limit",
    "rapid_refill_breaker",
    "prompt_too_long",
    "image_error",
    "model_error",
    "overloaded_status",
  ] as const)("fails a success-shaped Claude result with %s", (terminalReason) =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeWakeHarness;
        const now = yield* DateTime.now;
        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-structured-terminal-failure"),
            text: "Complete the task.",
            attachments: [],
          }),
        );
        yield* Queue.offer(
          harness.sdkMessages,
          makeResultFrame({
            uuid: "00000000-0000-4000-8000-000000000205",
            result: "Provider failure details.",
            isError: false,
            ...(terminalReason === "overloaded_status"
              ? { apiErrorStatus: 529 }
              : { terminalReason }),
          }),
        );
        const terminal = yield* Queue.take(harness.terminalReceipts);
        assert.equal(terminal.status, "failed");
        if (terminal.status !== "failed") return;
        assert.isNotEmpty(terminal.failure.message);
        assert.equal(terminal.failure.class, "provider_error");
        assert.isFalse(
          harness.events.some(
            (event) =>
              event.type === "message.updated" &&
              event.message.text === "Provider failure details.",
          ),
        );
        assert.equal(
          terminal.failure.code,
          terminalReason === "overloaded_status" ? "api_error_529" : terminalReason,
        );
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );

  // Frames follow #19832: a full context window ends the turn with
  // blocking_limit while the plan's rate-limit window is still allowed.
  it.effect.each([
    {
      windowStatus: "allowed",
      expectedClass: "provider_error",
      expectedMessage: "Claude stopped: the prompt exceeds the model's context window.",
    },
    {
      windowStatus: "rejected",
      expectedClass: "usage_limit",
      expectedMessage: "Claude usage limit reached. Send the message again once the limit resets.",
    },
  ] as const)(
    "classifies blocking_limit by its rate-limit evidence ($windowStatus window)",
    ({ windowStatus, expectedClass, expectedMessage }) =>
      Effect.gen(function* () {
        const harness = yield* makeWakeHarness;
        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now: yield* DateTime.now,
            attemptId: RunAttemptId.make(`attempt-blocking-limit-${windowStatus}`),
            text: "Continue.",
            attachments: [],
          }),
        );
        yield* Queue.offerAll(harness.sdkMessages, [
          claudeSdkFrame({
            type: "rate_limit_event",
            rate_limit_info: { status: windowStatus, rateLimitType: "five_hour" },
            uuid: "00000000-0000-4000-8000-000000000660",
            session_id: WAKE_NATIVE_SESSION,
          }),
          makeAssistantErrorFrame({
            uuid: "00000000-0000-4000-8000-000000000661",
            error: "invalid_request",
            text: "Prompt is too long",
          }),
          makeResultFrame({
            uuid: "00000000-0000-4000-8000-000000000662",
            result: "Prompt is too long",
            isError: true,
            numTurns: 189,
            terminalReason: "blocking_limit",
          }),
        ]);
        const terminal = yield* Queue.take(harness.terminalReceipts);
        assert.equal(terminal.status, "failed");
        if (terminal.status !== "failed") return;
        assert.equal(terminal.failure.class, expectedClass);
        assert.include(terminal.failure.message, expectedMessage);
        assert.equal(terminal.failure.code, "blocking_limit");
        if (expectedClass === "provider_error") {
          assert.include(terminal.failure.message, "/compact");
        }
      }).pipe(Effect.scoped, Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
  );

  const providerThreadRosterEvents = (events: ReadonlyArray<ProviderAdapterV2Event>) =>
    events.filter(
      (event): event is Extract<ProviderAdapterV2Event, { type: "provider_thread.updated" }> =>
        event.type === "provider_thread.updated",
    );

  it.effect(
    "uses task_started as an incremental roster fallback and clears on empty snapshot",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const harness = yield* makeWakeHarness;
          const now = yield* DateTime.now;
          const emptyRoster = claudeSdkFrame({
            type: "system",
            subtype: "background_tasks_changed",
            tasks: [],
            uuid: "00000000-0000-4000-8000-000000000202",
            session_id: WAKE_NATIVE_SESSION,
          });

          yield* harness.runtime.startTurn(
            makeClaudeTestTurnInput({
              threadId: harness.threadId,
              providerThread: harness.providerThread,
              now,
              attemptId: RunAttemptId.make("attempt-claude-roster-fallback"),
              text: "Run the build in the background.",
              attachments: [],
            }),
          );
          yield* Queue.offer(harness.sdkMessages, wakeTaskStarted);
          yield* Queue.offer(harness.sdkMessages, turnOneResult);
          yield* awaitUntil(() => harness.terminalEvents().length === 1, "first turn terminal");

          const afterStart = providerThreadRosterEvents(harness.events).filter(
            (event) => (event.providerThread.pendingBackgroundTasks?.length ?? 0) > 0,
          );
          assert.isAtLeast(afterStart.length, 1);
          assert.equal(
            (afterStart.at(-1)?.providerThread.pendingBackgroundTasks ?? [])[0]?.taskId,
            WAKE_TASK_ID,
          );

          yield* Queue.offer(harness.sdkMessages, emptyRoster);
          yield* awaitUntil(
            () =>
              providerThreadRosterEvents(harness.events).some(
                (event) =>
                  event.providerThread.status === "idle" &&
                  (event.providerThread.pendingBackgroundTasks?.length ?? 0) === 0,
              ),
            "empty roster clear",
          );
          assert.isFalse(yield* harness.hasPendingBackgroundWork);
        }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
      ),
  );

  // Frame shapes follow the claude_background_monitor_wake recording: Claude
  // runs a Monitor as a local_bash task, linked to its call by tool_use_id.
  it.effect("keeps a running Claude monitor typed after many newer monitors end", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeWakeHarness;
        const now = yield* DateTime.now;
        let frameNumber = 0;
        const nextUuid = () => `00000000-0000-4000-8000-${String(++frameNumber).padStart(12, "0")}`;
        const monitorFrames = (index: number) => {
          const taskId = `monitor-task-${index}`;
          const toolUseId = `toolu_monitor_${index}`;
          const description = `Monitor ${index}`;
          return {
            taskId,
            start: [
              claudeSdkFrame({
                type: "assistant",
                message: {
                  model: "claude-sonnet-4-6",
                  id: `msg_monitor_${index}`,
                  type: "message",
                  role: "assistant",
                  content: [
                    {
                      type: "tool_use",
                      id: toolUseId,
                      name: "Monitor",
                      input: { description, command: "sleep 8 && echo MONITOR_DONE" },
                    },
                  ],
                  stop_reason: null,
                  stop_sequence: null,
                  usage: { input_tokens: 1, output_tokens: 1 },
                },
                parent_tool_use_id: null,
                uuid: nextUuid(),
                session_id: WAKE_NATIVE_SESSION,
              }),
              claudeSdkFrame({
                type: "system",
                subtype: "task_started",
                task_id: taskId,
                tool_use_id: toolUseId,
                description,
                is_backgrounded: true,
                task_type: "local_bash",
                uuid: nextUuid(),
                session_id: WAKE_NATIVE_SESSION,
              }),
              claudeSdkFrame({
                type: "user",
                message: {
                  role: "user",
                  content: [
                    {
                      type: "tool_result",
                      tool_use_id: toolUseId,
                      content: `Monitor started (task ${taskId}).`,
                    },
                  ],
                },
                parent_tool_use_id: null,
                uuid: nextUuid(),
                session_id: WAKE_NATIVE_SESSION,
                tool_use_result: { taskId, persistent: false },
              }),
            ],
            end: claudeSdkFrame({
              type: "system",
              subtype: "task_notification",
              task_id: taskId,
              tool_use_id: toolUseId,
              status: "completed",
              output_file: `/tmp/claude-replay/tasks/${taskId}.output`,
              summary: `Monitor "${description}" stream ended`,
              uuid: nextUuid(),
              session_id: WAKE_NATIVE_SESSION,
            }),
          };
        };

        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-many-monitors"),
            text: "Watch the deploy, then re-arm short watches.",
            attachments: [],
          }),
        );
        const longRunning = monitorFrames(0);
        for (const frame of longRunning.start) {
          yield* Queue.offer(harness.sdkMessages, frame);
        }
        // More newer monitors start and end than any fixed id cap would hold.
        for (let index = 1; index <= 65; index++) {
          const monitor = monitorFrames(index);
          for (const frame of monitor.start) {
            yield* Queue.offer(harness.sdkMessages, frame);
          }
          yield* Queue.offer(harness.sdkMessages, monitor.end);
        }
        yield* Queue.offer(
          harness.sdkMessages,
          claudeSdkFrame({
            type: "system",
            subtype: "background_tasks_changed",
            tasks: [
              {
                task_id: longRunning.taskId,
                task_type: "local_bash",
                description: "Monitor 0",
              },
            ],
            uuid: nextUuid(),
            session_id: WAKE_NATIVE_SESSION,
          }),
        );
        yield* Queue.offer(
          harness.sdkMessages,
          makeResultFrame({ uuid: nextUuid(), result: "Watching." }),
        );
        yield* awaitUntil(() => harness.terminalEvents().length === 1, "turn terminal");

        const roster = providerThreadRosterEvents(harness.events).at(-1)?.providerThread
          .pendingBackgroundTasks;
        assert.deepEqual(roster, [
          { taskId: longRunning.taskId, kind: "monitor", description: "Monitor 0" },
        ]);
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );

  it.effect("stops background work after the turn settled", () =>
    Effect.scoped(
      Effect.gen(function* () {
        let closes = 0;
        const harness = yield* makeWakeHarnessWithOptions({
          close: (sdkMessages) =>
            Effect.sync(() => {
              closes++;
            }).pipe(Effect.andThen(Queue.shutdown(sdkMessages))),
        });
        const now = yield* DateTime.now;
        const attemptId = RunAttemptId.make("attempt-claude-settled-stop");
        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId,
            text: "Run the build in the background.",
            attachments: [],
          }),
        );
        yield* Queue.offer(harness.sdkMessages, wakeTaskStarted);
        yield* Queue.offer(harness.sdkMessages, turnOneResult);
        yield* awaitUntil(() => harness.terminalEvents().length === 1, "first turn terminal");
        const settledThread = providerThreadRosterEvents(harness.events).at(-1)?.providerThread;
        assert.equal(settledThread?.pendingBackgroundTasks?.[0]?.taskId, WAKE_TASK_ID);
        assert.isTrue(yield* harness.hasPendingBackgroundWork);

        // The Waiting strip's Stop reaches the adapter as an interrupt of the
        // settled turn with requestRuntimeRestart.
        yield* harness.runtime.interruptTurn({
          providerThread: settledThread ?? harness.providerThread,
          providerTurnId: harness.terminalEvents()[0]!.providerTurnId,
          requestRuntimeRestart: true,
        });

        assert.equal(closes, 1, "Stop must close the CLI process that owns the task");
        yield* awaitUntil(
          () =>
            (providerThreadRosterEvents(harness.events).at(-1)?.providerThread
              .pendingBackgroundTasks?.length ?? 0) === 0,
          "roster clear after Stop",
        );
        assert.isFalse(yield* harness.hasPendingBackgroundWork);
        assert.lengthOf(harness.continuationRequests, 0);
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );

  // The CLI process exits on its own after the turn settled (idle, crash),
  // leaving its background task on the roster. Stop must succeed so the
  // orchestrator goes on to settle what the thread still shows.
  it.effect("a settled Stop with no CLI process left succeeds and clears the roster", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeWakeHarnessWithOptions();
        const now = yield* DateTime.now;
        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-settled-stop-no-process"),
            text: "Run the build in the background.",
            attachments: [],
          }),
        );
        yield* Queue.offer(harness.sdkMessages, wakeTaskStarted);
        yield* Queue.offer(harness.sdkMessages, turnOneResult);
        yield* awaitUntil(() => harness.terminalEvents().length === 1, "first turn terminal");
        const settledThread = providerThreadRosterEvents(harness.events).at(-1)?.providerThread;
        assert.equal(settledThread?.pendingBackgroundTasks?.[0]?.taskId, WAKE_TASK_ID);

        yield* Queue.shutdown(harness.sdkMessages);
        let quietYields = 0;
        yield* awaitUntil(() => quietYields++ >= 50, "query exit");

        yield* harness.runtime.interruptTurn({
          providerThread: settledThread ?? harness.providerThread,
          providerTurnId: harness.terminalEvents()[0]!.providerTurnId,
          requestRuntimeRestart: true,
        });
        yield* awaitUntil(
          () =>
            (providerThreadRosterEvents(harness.events).at(-1)?.providerThread
              .pendingBackgroundTasks?.length ?? 0) === 0,
          "roster clear after Stop",
        );
        assert.isFalse(yield* harness.hasPendingBackgroundWork);
        assert.lengthOf(harness.continuationRequests, 0);
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );

  it.effect("a settled Stop leaves a turn that replaced the closing process alone", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const idAllocator = yield* IdAllocator.IdAllocatorV2;
        const attachmentsDir = yield* fileSystem.makeTempDirectoryScoped({
          prefix: "control-claude-v2-settled-stop-replaced-",
        });
        const processQueues: Array<Queue.Queue<SDKMessage>> = [];
        const firstCloseRequested = yield* Deferred.make<void>();
        const events: Array<ProviderAdapterV2Event> = [];
        const continuationRequests: Array<ProviderContinuationRequest> = [];
        const adapter = ClaudeAdapterV2.makeClaudeAdapterV2({
          instanceId: ClaudeAdapterV2.CLAUDE_DEFAULT_INSTANCE_ID,
          settings: DEFAULT_CLAUDE_SETTINGS,
          environment: {},
          attachmentsDir,
          fileSystem,
          path: yield* Path.Path,
          crypto: yield* Crypto.Crypto,
          idAllocator,
          continuationRequests: {
            offer: (request) =>
              Effect.sync(() => {
                continuationRequests.push(request);
              }),
          },
          queryRunner: {
            allocateSessionId: Effect.succeed(WAKE_NATIVE_SESSION),
            open: () =>
              Effect.gen(function* () {
                const sdkMessages = yield* Queue.unbounded<SDKMessage>();
                const isFirstProcess = processQueues.length === 0;
                processQueues.push(sdkMessages);
                return {
                  messages: Stream.fromQueue(sdkMessages),
                  offer: () => Effect.void,
                  setModel: () => Effect.void,
                  setPermissionMode: () => Effect.void,
                  backgroundTasks: () => Effect.succeed(false),
                  interrupt: Effect.void,
                  // The first CLI process keeps streaming until the test ends
                  // it, so Stop stays parked waiting for it to exit.
                  close: isFirstProcess
                    ? Deferred.succeed(firstCloseRequested, undefined).pipe(Effect.asVoid)
                    : Queue.shutdown(sdkMessages),
                };
              }),
            forkSession: () => Effect.die("unused forkSession"),
            subagentLaunchToolUseId: () => Effect.succeed(null),
            assertComplete: Effect.void,
          },
        });
        const threadId = ThreadId.make("thread-claude-settled-stop-replaced");
        const runtime = yield* adapter.openSession({
          threadId,
          providerSessionId: ProviderSessionId.make("provider-session-claude-settled-stop"),
          modelSelection: CLAUDE_TEST_MODEL_SELECTION,
          runtimePolicy: CLAUDE_TEST_RUNTIME_POLICY,
        });
        const providerThread = yield* runtime.ensureThread({
          threadId,
          modelSelection: CLAUDE_TEST_MODEL_SELECTION,
          runtimePolicy: CLAUDE_TEST_RUNTIME_POLICY,
        });
        yield* runtime.events.pipe(
          Stream.runForEach((event) =>
            Effect.sync(() => {
              events.push(event);
            }),
          ),
          Effect.forkScoped,
        );
        if (runtime.hasPendingBackgroundWork === undefined) {
          return yield* Effect.die("Claude adapter runtime must expose hasPendingBackgroundWork.");
        }
        const hasPendingBackgroundWork = runtime.hasPendingBackgroundWork;
        const terminals = () => events.filter((event) => event.type === "turn.terminal");
        const now = yield* DateTime.now;

        yield* runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId,
            providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-settled-stop-replaced-a"),
            text: "Run the build in the background.",
            attachments: [],
          }),
        );
        yield* Queue.offer(processQueues[0]!, wakeTaskStarted);
        yield* Queue.offer(processQueues[0]!, turnOneResult);
        yield* awaitUntil(() => terminals().length === 1, "first turn terminal");
        const settledThread = providerThreadRosterEvents(events).at(-1)?.providerThread;
        const settledTurn = terminals()[0];
        assert.equal(settledThread?.pendingBackgroundTasks?.[0]?.taskId, WAKE_TASK_ID);

        const stop = yield* runtime
          .interruptTurn({
            providerThread: settledThread ?? providerThread,
            providerTurnId: settledTurn!.providerTurnId,
            requestRuntimeRestart: true,
          })
          .pipe(Effect.forkScoped);
        yield* Deferred.await(firstCloseRequested);

        // While Stop waits for the old CLI to exit, a new turn on another
        // model replaces the process and starts its own background task.
        yield* runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId,
            providerThread: { ...providerThread, status: "active" },
            now,
            attemptId: RunAttemptId.make("attempt-claude-settled-stop-replaced-b"),
            text: "Start another background build.",
            attachments: [],
            providerTurnOrdinal: 2,
            modelSelection: {
              ...CLAUDE_TEST_MODEL_SELECTION,
              model: "claude-haiku-4-5-20251001",
            },
          }),
        );
        assert.lengthOf(processQueues, 2);
        const replacementTaskId = "replacement-task";
        yield* Queue.offer(
          processQueues[1]!,
          claudeSdkFrame({
            ...wakeTaskStarted,
            task_id: replacementTaskId,
            uuid: "00000000-0000-4000-8000-000000000905",
          }),
        );
        yield* awaitUntil(
          () =>
            providerThreadRosterEvents(events).at(-1)?.providerThread.pendingBackgroundTasks?.[0]
              ?.taskId === replacementTaskId,
          "replacement roster",
        );

        yield* Queue.shutdown(processQueues[0]!);
        yield* Fiber.join(stop);
        assert.isTrue(yield* hasPendingBackgroundWork);
        let quietYields = 0;
        yield* awaitUntil(() => quietYields++ >= 50, "late roster events");
        const latestThread = providerThreadRosterEvents(events).at(-1)?.providerThread;
        assert.equal(latestThread?.status, "active");
        assert.deepEqual(
          latestThread?.pendingBackgroundTasks?.map((task) => task.taskId),
          [replacementTaskId],
        );

        // The replacement's background task still wakes Claude once its
        // turn settles.
        yield* Queue.offer(
          processQueues[1]!,
          makeResultFrame({
            uuid: "00000000-0000-4000-8000-000000000906",
            result: "Started another build.",
          }),
        );
        yield* awaitUntil(() => terminals().length === 2, "replacement turn terminal");
        yield* Queue.offer(
          processQueues[1]!,
          claudeSdkFrame({
            ...wakeNotification,
            task_id: replacementTaskId,
            uuid: "00000000-0000-4000-8000-000000000907",
          }),
        );
        yield* Queue.offer(
          processQueues[1]!,
          makeAssistantTextFrame({
            uuid: "00000000-0000-4000-8000-000000000908",
            text: WAKE_ASSISTANT_TEXT,
          }),
        );
        yield* awaitUntil(() => continuationRequests.length === 1, "replacement wake");
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );

  it.effect("clears the roster when a turn fails", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeWakeHarness;
        const now = yield* DateTime.now;
        const failedResult = claudeSdkFrame({
          type: "result",
          subtype: "error_during_execution",
          duration_ms: 10,
          duration_api_ms: 10,
          is_error: true,
          num_turns: 1,
          result: "boom",
          stop_reason: "end_turn",
          total_cost_usd: 0,
          usage: {
            input_tokens: 1,
            output_tokens: 1,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
          modelUsage: {},
          permission_denials: [],
          errors: ["boom"],
          terminal_reason: "model_error",
          uuid: "00000000-0000-4000-8000-000000000203",
          session_id: WAKE_NATIVE_SESSION,
        });

        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-roster-fail"),
            text: "Run the build in the background.",
            attachments: [],
          }),
        );
        yield* Queue.offer(harness.sdkMessages, wakeTaskStarted);
        yield* awaitUntil(
          () =>
            providerThreadRosterEvents(harness.events).some(
              (event) => (event.providerThread.pendingBackgroundTasks?.length ?? 0) > 0,
            ),
          "roster after task_started",
        );
        yield* Queue.offer(harness.sdkMessages, failedResult);
        yield* awaitUntil(() => harness.terminalEvents().length === 1, "failed terminal");
        assert.equal(harness.terminalEvents()[0]?.status, "failed");

        const afterFailure = providerThreadRosterEvents(harness.events).at(-1);
        assert.deepEqual(afterFailure?.providerThread.pendingBackgroundTasks ?? [], []);
        assert.isFalse(yield* harness.hasPendingBackgroundWork);
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );

  it.effect(
    "clears the replaced sibling native thread roster when openQuery switches processes",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fileSystem = yield* FileSystem.FileSystem;
          const idAllocator = yield* IdAllocator.IdAllocatorV2;
          const attachmentsDir = yield* fileSystem.makeTempDirectoryScoped({
            prefix: "control-claude-v2-sibling-replace-",
          });
          const nativeIds = ["native-thread-roster-a", "native-thread-roster-b"] as const;
          let allocateIndex = 0;
          // Real two-process model: each openQuery owns its own message queue.
          // A shared queue would mask sibling process death on replacement.
          const processQueues: Array<{
            readonly nativeThreadId: string;
            readonly queue: Queue.Queue<SDKMessage>;
          }> = [];
          const events: Array<ProviderAdapterV2Event> = [];
          const adapter = ClaudeAdapterV2.makeClaudeAdapterV2({
            instanceId: ClaudeAdapterV2.CLAUDE_DEFAULT_INSTANCE_ID,
            settings: DEFAULT_CLAUDE_SETTINGS,
            environment: {},
            attachmentsDir,
            fileSystem,
            path: yield* Path.Path,
            crypto: yield* Crypto.Crypto,
            idAllocator,
            continuationRequests: {
              offer: () => Effect.void,
            },
            queryRunner: {
              allocateSessionId: Effect.sync(() => {
                const next =
                  nativeIds[allocateIndex] ?? `native-thread-roster-extra-${allocateIndex}`;
                allocateIndex += 1;
                return next;
              }),
              open: (openInput) =>
                Effect.gen(function* () {
                  const nativeThreadId = openInput.options.sessionId ?? openInput.options.resume;
                  if (typeof nativeThreadId !== "string" || nativeThreadId.length === 0) {
                    return yield* Effect.die("openQuery must supply a native session id");
                  }
                  const queue = yield* Queue.unbounded<SDKMessage>();
                  processQueues.push({ nativeThreadId, queue });
                  return {
                    messages: Stream.fromQueue(queue),
                    offer: () => Effect.void,
                    setModel: () => Effect.void,
                    setPermissionMode: () => Effect.void,
                    backgroundTasks: () => Effect.succeed(false),
                    interrupt: Effect.void,
                    close: Queue.shutdown(queue),
                  };
                }),
              forkSession: () => Effect.die("unused forkSession"),
              subagentLaunchToolUseId: () => Effect.succeed(null),
              assertComplete: Effect.void,
            },
          });
          const appThreadA = ThreadId.make("thread-claude-roster-a");
          const appThreadB = ThreadId.make("thread-claude-roster-b");
          const runtime = yield* adapter.openSession({
            threadId: appThreadA,
            providerSessionId: ProviderSessionId.make("provider-session-claude-sibling-replace"),
            modelSelection: CLAUDE_TEST_MODEL_SELECTION,
            runtimePolicy: CLAUDE_TEST_RUNTIME_POLICY,
          });
          const providerThreadA = yield* runtime.ensureThread({
            threadId: appThreadA,
            modelSelection: CLAUDE_TEST_MODEL_SELECTION,
            runtimePolicy: CLAUDE_TEST_RUNTIME_POLICY,
          });
          const providerThreadB = yield* runtime.ensureThread({
            threadId: appThreadB,
            modelSelection: CLAUDE_TEST_MODEL_SELECTION,
            runtimePolicy: CLAUDE_TEST_RUNTIME_POLICY,
          });
          assert.notEqual(
            providerThreadA.nativeThreadRef?.nativeId,
            providerThreadB.nativeThreadRef?.nativeId,
          );
          yield* runtime.events.pipe(
            Stream.runForEach((event) =>
              Effect.sync(() => {
                events.push(event);
              }),
            ),
            Effect.forkScoped,
          );
          if (runtime.hasPendingBackgroundWork === undefined) {
            return yield* Effect.die(
              "Claude adapter runtime must expose hasPendingBackgroundWork.",
            );
          }
          if (runtime.hasPendingBackgroundWorkForThread === undefined) {
            return yield* Effect.die(
              "Claude adapter runtime must expose hasPendingBackgroundWorkForThread.",
            );
          }
          const hasPendingBackgroundWork = runtime.hasPendingBackgroundWork;
          const hasPendingBackgroundWorkForThread = runtime.hasPendingBackgroundWorkForThread;
          const now = yield* DateTime.now;
          const taskA = "task-roster-a";
          const taskB = "task-roster-b";

          yield* runtime.startTurn(
            makeClaudeTestTurnInput({
              threadId: appThreadA,
              providerThread: providerThreadA,
              now,
              attemptId: RunAttemptId.make("attempt-roster-iso-a"),
              text: "Background work on A.",
              attachments: [],
            }),
          );
          assert.equal(processQueues.length, 1);
          const processA = processQueues[0]!;
          yield* Queue.offer(
            processA.queue,
            claudeSdkFrame({
              type: "system",
              subtype: "task_started",
              task_id: taskA,
              tool_use_id: "toolu-roster-a",
              description: "work on A",
              is_backgrounded: true,
              task_type: "local_bash",
              uuid: "00000000-0000-4000-8000-000000000301",
              session_id: nativeIds[0],
            }),
          );
          yield* Queue.offer(
            processA.queue,
            makeResultFrame({
              uuid: "00000000-0000-4000-8000-000000000302",
              result: "A settled with background work.",
            }),
          );
          yield* awaitUntil(
            () =>
              events.some(
                (event) =>
                  event.type === "turn.terminal" &&
                  event.providerThreadId === providerThreadA.id &&
                  event.status === "completed",
              ),
            "thread A terminal",
          );
          const rosterAAfterSettle = providerThreadRosterEvents(events).findLast(
            (event) => event.providerThread.id === providerThreadA.id,
          )?.providerThread.pendingBackgroundTasks;
          assert.deepEqual(rosterAAfterSettle ?? [], [
            { taskId: taskA, description: "work on A", kind: "command" },
          ]);
          assert.isTrue(yield* hasPendingBackgroundWork);
          assert.isTrue(yield* hasPendingBackgroundWorkForThread(providerThreadA));
          assert.isFalse(yield* hasPendingBackgroundWorkForThread(providerThreadB));

          // Starting B closes A's only live query. A can never emit a roster
          // clear from a dead process, so openQuery must idle-clear A.
          yield* runtime.startTurn(
            makeClaudeTestTurnInput({
              threadId: appThreadB,
              providerThread: { ...providerThreadB, status: "active" },
              now,
              attemptId: RunAttemptId.make("attempt-roster-iso-b"),
              text: "Background work on B.",
              attachments: [],
            }),
          );
          assert.equal(processQueues.length, 2);
          yield* awaitUntil(
            () =>
              providerThreadRosterEvents(events).some(
                (event) =>
                  event.providerThread.id === providerThreadA.id &&
                  event.providerThread.status === "idle" &&
                  (event.providerThread.pendingBackgroundTasks?.length ?? 0) === 0,
              ),
            "sibling A roster cleared idle on process replacement",
          );
          assert.isFalse(yield* hasPendingBackgroundWorkForThread(providerThreadA));

          const processB = processQueues[1]!;
          yield* Queue.offer(
            processB.queue,
            claudeSdkFrame({
              type: "system",
              subtype: "task_started",
              task_id: taskB,
              tool_use_id: "toolu-roster-b",
              description: "work on B",
              is_backgrounded: true,
              task_type: "local_bash",
              uuid: "00000000-0000-4000-8000-000000000303",
              session_id: nativeIds[1],
            }),
          );
          yield* awaitUntil(
            () =>
              providerThreadRosterEvents(events).some(
                (event) =>
                  event.providerThread.id === providerThreadB.id &&
                  (event.providerThread.pendingBackgroundTasks?.length ?? 0) > 0,
              ),
            "thread B roster populated",
          );
          assert.isTrue(yield* hasPendingBackgroundWorkForThread(providerThreadB));
          assert.isTrue(yield* hasPendingBackgroundWork);
          // Starting B's process clears only B's process-scoped level; A stays
          // empty from the sibling replacement clear above.
          assert.isFalse(yield* hasPendingBackgroundWorkForThread(providerThreadA));

          yield* Queue.offer(
            processB.queue,
            claudeSdkFrame({
              type: "result",
              subtype: "error_during_execution",
              duration_ms: 10,
              duration_api_ms: 10,
              is_error: true,
              num_turns: 1,
              result: "B failed",
              stop_reason: "end_turn",
              total_cost_usd: 0,
              usage: {
                input_tokens: 1,
                output_tokens: 1,
                cache_creation_input_tokens: 0,
                cache_read_input_tokens: 0,
              },
              modelUsage: {},
              permission_denials: [],
              errors: ["B failed"],
              terminal_reason: "model_error",
              uuid: "00000000-0000-4000-8000-000000000304",
              session_id: nativeIds[1],
            }),
          );
          yield* awaitUntil(
            () =>
              events.some(
                (event) =>
                  event.type === "turn.terminal" &&
                  event.providerThreadId === providerThreadB.id &&
                  event.status === "failed",
              ),
            "thread B failed terminal",
          );

          const rosterBAfterFail = providerThreadRosterEvents(events).findLast(
            (event) => event.providerThread.id === providerThreadB.id,
          )?.providerThread.pendingBackgroundTasks;
          assert.deepEqual(rosterBAfterFail ?? [], []);
          assert.isFalse(yield* hasPendingBackgroundWorkForThread(providerThreadA));
          assert.isFalse(yield* hasPendingBackgroundWorkForThread(providerThreadB));
          assert.isFalse(yield* hasPendingBackgroundWork);
        }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
      ),
  );

  it.effect.each(["full-access", "approval-required"] as const)(
    "keeps a queued wake turn's tool callback with its continuation in %s mode",
    (runtimeMode) =>
      Effect.scoped(
        Effect.gen(function* () {
          const harness = yield* makeWakeHarness;
          const now = yield* DateTime.now;
          const runtimePolicy = ProviderAdapterV2RuntimePolicy.make({
            runtimeMode,
            interactionMode: "default",
            cwd: "/workspace",
          });
          const firstAttempt = RunAttemptId.make("attempt-claude-wake-callback-1");
          const userAttempt = RunAttemptId.make("attempt-claude-wake-callback-2");
          const continuationAttempt = RunAttemptId.make("attempt-claude-wake-callback-3");
          const planToolUseId = "toolu_01WakePlanExitPlanMode";
          const planMarkdown = "# Wake plan\n\n1. Report the background result.";
          const stamp = (frame: SDKMessage, promptIndex: number) =>
            claudeSdkFrame({
              ...frame,
              user_message_uuid: harness.promptUuid(promptIndex),
            });
          const runOf = (attemptId: RunAttemptId) => RunId.make(`run-${attemptId}`);
          const planToolUse = claudeSdkFrame({
            type: "assistant",
            message: {
              model: "claude-sonnet-4-6",
              id: "msg_wake_plan",
              type: "message",
              role: "assistant",
              content: [
                {
                  type: "tool_use",
                  id: planToolUseId,
                  name: "ExitPlanMode",
                  input: { plan: planMarkdown },
                },
              ],
            },
            parent_tool_use_id: null,
            uuid: "00000000-0000-4000-8000-000000000741",
            session_id: WAKE_NATIVE_SESSION,
          });
          const planToolResult = claudeSdkFrame({
            type: "user",
            message: {
              role: "user",
              content: [
                {
                  type: "tool_result",
                  tool_use_id: planToolUseId,
                  content:
                    "The client captured your proposed plan. Stop here and wait for the user's feedback or implementation request in a later turn.",
                  is_error: true,
                },
              ],
            },
            parent_tool_use_id: null,
            uuid: "00000000-0000-4000-8000-000000000742",
            session_id: WAKE_NATIVE_SESSION,
          });

          // Turn 1 launches background work and echoes its prompt early.
          yield* harness.runtime.startTurn(
            makeClaudeTestTurnInput({
              threadId: harness.threadId,
              providerThread: harness.providerThread,
              now,
              attemptId: firstAttempt,
              text: "Run the build in the background.",
              attachments: [],
              runtimePolicy,
            }),
          );
          yield* Queue.offer(harness.sdkMessages, stamp(wakeTaskStarted, 0));
          yield* Queue.offer(
            harness.sdkMessages,
            stamp(
              makeResultFrame({ uuid: "00000000-0000-4000-8000-000000000740", result: "STARTED" }),
              0,
            ),
          );
          yield* awaitUntil(() => harness.terminalEvents().length === 1, "first turn terminal");

          // The task finishes while the user's next prompt is queued, and the
          // CLI runs the wake turn first. That wake turn calls ExitPlanMode,
          // whose permission callback fires between its tool_use and result.
          yield* harness.runtime.startTurn(
            makeClaudeTestTurnInput({
              threadId: harness.threadId,
              providerThread: harness.providerThread,
              now,
              attemptId: userAttempt,
              text: "Reply with exactly: USER_REPLY",
              attachments: [],
              runtimePolicy,
              providerTurnOrdinal: 2,
            }),
          );
          yield* Queue.offer(harness.sdkMessages, wakeNotification);
          yield* Queue.offer(harness.sdkMessages, planToolUse);
          // The SDK asks for permission only after streaming the tool_use.
          yield* awaitUntil(
            () => Queue.sizeUnsafe(harness.sdkMessages) === 0,
            "the tool_use frame to be consumed",
          );
          let settleYields = 0;
          yield* awaitUntil(() => settleYields++ >= 50, "the tool_use frame to be handled");
          const canUseTool = harness.getOpenedOptions()?.canUseTool;
          assert.isFunction(canUseTool);
          const callback = yield* Effect.promise(() =>
            canUseTool!(
              "ExitPlanMode",
              { plan: planMarkdown },
              {
                signal: new AbortController().signal,
                toolUseID: planToolUseId,
                requestId: "request-wake-plan",
              },
            ),
          );
          assert.equal(callback?.behavior, "deny");
          assert.include(
            callback?.behavior === "deny" ? callback.message : "",
            "The client captured your proposed plan",
          );
          yield* Queue.offer(harness.sdkMessages, planToolResult);
          yield* Queue.offer(harness.sdkMessages, wakeResult);
          yield* awaitUntil(
            () => harness.continuationRequests.length === 1,
            "continuation request",
          );

          // The prompt's own turn follows and echoes its uuid.
          yield* Queue.offer(
            harness.sdkMessages,
            stamp(
              makeAssistantTextFrame({
                uuid: "00000000-0000-4000-8000-000000000743",
                text: "USER_REPLY",
              }),
              1,
            ),
          );
          yield* Queue.offer(
            harness.sdkMessages,
            stamp(
              makeResultFrame({
                uuid: "00000000-0000-4000-8000-000000000744",
                result: "USER_REPLY",
              }),
              1,
            ),
          );
          yield* awaitUntil(() => harness.terminalEvents().length === 2, "user turn terminal");

          yield* harness.runtime.startTurn(
            makeClaudeTestTurnInput({
              threadId: harness.threadId,
              providerThread: harness.providerThread,
              now,
              attemptId: continuationAttempt,
              text: "Background task completed.",
              attachments: [],
              runtimePolicy,
              providerTurnOrdinal: 3,
              messageCreatedBy: "agent",
              messageCreationSource: "provider",
            }),
          );
          yield* awaitUntil(() => harness.terminalEvents().length === 3, "continuation terminal");

          const latestItems = new Map(
            harness.events.flatMap((event) =>
              event.type === "turn_item.updated"
                ? [[String(event.turnItem.id), event.turnItem]]
                : [],
            ),
          );
          const planTool = [...latestItems.values()].find(
            (item) =>
              item.type === "dynamic_tool" && item.nativeItemRef?.nativeId === planToolUseId,
          );
          const proposedPlans = [...latestItems.values()].filter(
            (item) => item.type === "proposed_plan",
          );
          const plans = harness.events.flatMap((event) =>
            event.type === "plan.updated" && event.plan.kind === "proposed_plan"
              ? [event.plan]
              : [],
          );
          // Every update of the tool, from start to its (denied) result, is in
          // the continuation run; the user's turn never starts or fails it.
          const planToolRuns = harness.events.flatMap((event) =>
            event.type === "turn_item.updated" &&
            event.turnItem.nativeItemRef?.nativeId === planToolUseId &&
            event.turnItem.type === "dynamic_tool"
              ? [event.turnItem.runId]
              : [],
          );
          assert.isNotEmpty(planToolRuns);
          assert.isTrue(planToolRuns.every((runId) => runId === runOf(continuationAttempt)));
          assert.equal(planTool?.runId, runOf(continuationAttempt));
          // Claude was told the plan was captured, so it must be projected.
          assert.lengthOf(proposedPlans, 1);
          assert.equal(proposedPlans[0]?.runId, runOf(continuationAttempt));
          assert.isTrue(plans.length > 0);
          assert.isTrue(plans.every((plan) => plan.runId === runOf(continuationAttempt)));
          // Nothing from the wake turn reached the user's run.
          const userRunItems = [...latestItems.values()].filter(
            (item) => item.runId === runOf(userAttempt),
          );
          assert.deepEqual(
            userRunItems.map((item) => item.type),
            ["assistant_message"],
          );
        }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
      ),
  );

  it.effect("stores a Bash result's stdout and stderr as command output", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeWakeHarness;
        const now = yield* DateTime.now;
        const attemptId = RunAttemptId.make("attempt-claude-bash-output");
        const bashToolUseId = "toolu_01BashOutput";

        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId,
            text: "Run it.",
            attachments: [],
          }),
        );
        yield* Queue.offer(
          harness.sdkMessages,
          claudeSdkFrame({
            type: "assistant",
            message: {
              model: "claude-sonnet-4-6",
              id: "msg_bash_output",
              type: "message",
              role: "assistant",
              content: [
                {
                  type: "tool_use",
                  id: bashToolUseId,
                  name: "Bash",
                  input: { command: "git status" },
                },
              ],
            },
            parent_tool_use_id: null,
            uuid: "00000000-0000-4000-8000-000000000790",
            session_id: WAKE_NATIVE_SESSION,
          }),
        );
        yield* Queue.offer(
          harness.sdkMessages,
          claudeSdkFrame({
            type: "user",
            message: {
              role: "user",
              content: [
                { type: "tool_result", tool_use_id: bashToolUseId, content: "On branch main" },
              ],
            },
            parent_tool_use_id: null,
            uuid: "00000000-0000-4000-8000-000000000791",
            session_id: WAKE_NATIVE_SESSION,
            tool_use_result: {
              stdout: "On branch main",
              stderr: "warning: dirty",
              interrupted: false,
              isImage: false,
            },
          }),
        );
        yield* Queue.offer(
          harness.sdkMessages,
          makeResultFrame({ uuid: "00000000-0000-4000-8000-000000000792", result: "Done." }),
        );
        yield* awaitUntil(() => harness.terminalEvents().length === 1, "turn terminal");

        const bash = harness.events.findLast(
          (event) =>
            event.type === "turn_item.updated" &&
            event.turnItem.nativeItemRef?.nativeId === bashToolUseId,
        );
        assert.equal(
          bash?.type === "turn_item.updated" && bash.turnItem.type === "command_execution"
            ? bash.turnItem.output
            : undefined,
          "On branch main\nwarning: dirty",
        );
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );

  it.effect("counts Edit and Write lines and summarises Read and Bash output for their rows", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeWakeHarness;
        const now = yield* DateTime.now;
        const calls = [
          {
            id: "toolu_01RowEdit",
            name: "Edit",
            input: { file_path: "/workspace/lib/a.ts", old_string: "a", new_string: "b\nc" },
            result: {
              filePath: "/workspace/lib/a.ts",
              oldString: "a",
              newString: "b\nc",
              originalFile: "keep\na\n",
              structuredPatch: [
                {
                  oldStart: 1,
                  oldLines: 2,
                  newStart: 1,
                  newLines: 3,
                  lines: [" keep", "-a", "+b", "+c"],
                },
              ],
              userModified: false,
              replaceAll: false,
            },
          },
          {
            id: "toolu_01RowWrite",
            name: "Write",
            input: { file_path: "/workspace/new.ts", content: "x\ny\n" },
            result: {
              type: "create",
              filePath: "/workspace/new.ts",
              content: "x\ny\n",
              structuredPatch: [],
              originalFile: null,
            },
          },
          {
            id: "toolu_01RowRead",
            name: "Read",
            input: { file_path: "/workspace/lib/a.ts" },
            result: {
              type: "text",
              file: {
                filePath: "/workspace/lib/a.ts",
                content: "keep\nb\nc",
                numLines: 3,
                startLine: 1,
                totalLines: 3,
              },
            },
          },
          {
            id: "toolu_01RowBash",
            name: "Bash",
            input: { command: "vp lint" },
            result: {
              stdout: "\n  Found 0 warnings and 0 errors.\nFinished in 1s",
              stderr: "",
              interrupted: false,
              isImage: false,
            },
          },
        ];

        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-row-summaries"),
            text: "Change it.",
            attachments: [],
          }),
        );
        yield* Queue.offer(
          harness.sdkMessages,
          claudeSdkFrame({
            type: "assistant",
            message: {
              model: "claude-sonnet-4-6",
              id: "msg_row_summaries",
              type: "message",
              role: "assistant",
              content: calls.map((call) => ({
                type: "tool_use",
                id: call.id,
                name: call.name,
                input: call.input,
              })),
            },
            parent_tool_use_id: null,
            uuid: "00000000-0000-4000-8000-000000000a10",
            session_id: WAKE_NATIVE_SESSION,
          }),
        );
        for (const [index, call] of calls.entries()) {
          yield* Queue.offer(
            harness.sdkMessages,
            claudeSdkFrame({
              type: "user",
              message: {
                role: "user",
                content: [{ type: "tool_result", tool_use_id: call.id, content: "ok" }],
              },
              parent_tool_use_id: null,
              uuid: `00000000-0000-4000-8000-000000000a1${index + 1}`,
              session_id: WAKE_NATIVE_SESSION,
              tool_use_result: call.result,
            }),
          );
        }
        yield* Queue.offer(
          harness.sdkMessages,
          makeResultFrame({ uuid: "00000000-0000-4000-8000-000000000a19", result: "Done." }),
        );
        yield* awaitUntil(() => harness.terminalEvents().length === 1, "turn terminal");

        const item = (id: string) => {
          const event = harness.events.findLast(
            (candidate) =>
              candidate.type === "turn_item.updated" &&
              candidate.turnItem.nativeItemRef?.nativeId === id,
          );
          return event?.type === "turn_item.updated" ? event.turnItem : undefined;
        };
        assert.deepInclude(item("toolu_01RowEdit"), { additions: 2, deletions: 1 });
        // A created file has no patch; its lines are all added.
        assert.deepInclude(item("toolu_01RowWrite"), { additions: 2, deletions: 0 });
        assert.deepInclude(item("toolu_01RowRead"), { outputSummary: "3 lines" });
        assert.deepInclude(item("toolu_01RowBash"), {
          outputSummary: "Found 0 warnings and 0 errors.",
        });
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );

  it.effect("reads the CLI's context usage onto the provider thread before the turn ends", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const claudeHome = yield* fileSystem.makeTempDirectoryScoped({
          prefix: "control-claude-v2-context-usage-",
        });
        // The CLI compacts at half its window under this override, but reports its default mark.
        yield* fileSystem.writeFileString(
          path.join(claudeHome, "settings.json"),
          JSON.stringify({ env: { CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: "50" } }),
        );
        const harness = yield* makeWakeHarnessWithOptions({
          environment: { CLAUDE_CONFIG_DIR: claudeHome },
          contextUsage: {
            totalTokens: 320_315,
            maxTokens: 1_000_000,
            isAutoCompactEnabled: true,
            autoCompactThreshold: 967_000,
          },
        });
        const now = yield* DateTime.now;
        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-context-usage"),
            text: "How full is it?",
            attachments: [],
          }),
        );
        yield* Queue.offer(
          harness.sdkMessages,
          makeAssistantTextFrame({ uuid: "00000000-0000-4000-8000-000000000a20", text: "Half." }),
        );
        yield* Queue.offer(
          harness.sdkMessages,
          makeResultFrame({ uuid: "00000000-0000-4000-8000-000000000a21", result: "Half." }),
        );
        const terminalAt = () =>
          harness.events.findIndex((event) => event.type === "turn.terminal");
        yield* awaitUntil(() => terminalAt() !== -1, "turn terminal");

        // The run stops taking provider thread updates at its terminal, so the
        // last one before it, the turn's own, must still carry the report.
        const event = harness.events
          .slice(0, terminalAt())
          .findLast((event) => event.type === "provider_thread.updated");
        assert.deepEqual(
          event?.type === "provider_thread.updated" ? event.providerThread.contextUsage : null,
          {
            usedTokens: 320_315,
            maxTokens: 1_000_000,
            compactsAutomatically: true,
            autoCompactThreshold: 490_000,
          },
        );
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );

  it("drops the auto-compact mark when the CLI does not compact automatically", () => {
    assert.deepEqual(
      ClaudeAdapterV2.claudeContextUsage({
        totalTokens: 12_000.4,
        maxTokens: 200_000,
        isAutoCompactEnabled: false,
        autoCompactThreshold: 187_000,
      }),
      { usedTokens: 12_000, maxTokens: 200_000, compactsAutomatically: false },
    );
  });

  it.effect("answers an approval a held wake turn raises without waiting for the echo", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeWakeHarness;
        const now = yield* DateTime.now;
        const approvalPolicy = ProviderAdapterV2RuntimePolicy.make({
          runtimeMode: "approval-required",
          interactionMode: "default",
          cwd: "/workspace",
        });
        const firstAttempt = RunAttemptId.make("attempt-claude-wake-approval-1");
        const userAttempt = RunAttemptId.make("attempt-claude-wake-approval-2");
        const bashToolUseId = "toolu_01WakeApprovalBash";
        const stamp = (frame: SDKMessage, promptIndex: number) =>
          claudeSdkFrame({
            ...frame,
            user_message_uuid: harness.promptUuid(promptIndex),
          });

        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: firstAttempt,
            text: "First.",
            attachments: [],
            runtimePolicy: approvalPolicy,
          }),
        );
        yield* Queue.offer(
          harness.sdkMessages,
          stamp(
            makeAssistantTextFrame({ uuid: "00000000-0000-4000-8000-000000000780", text: "One." }),
            0,
          ),
        );
        yield* Queue.offer(
          harness.sdkMessages,
          stamp(
            makeResultFrame({ uuid: "00000000-0000-4000-8000-000000000781", result: "One." }),
            0,
          ),
        );
        yield* awaitUntil(() => harness.terminalEvents().length === 1, "first turn terminal");

        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: userAttempt,
            text: "Second.",
            attachments: [],
            providerTurnOrdinal: 2,
            runtimePolicy: approvalPolicy,
          }),
        );
        // A queued wake turn asks to run Bash while its output is held.
        yield* Queue.offer(
          harness.sdkMessages,
          claudeSdkFrame({
            type: "assistant",
            message: {
              model: "claude-sonnet-4-6",
              id: "msg_wake_bash",
              type: "message",
              role: "assistant",
              content: [
                {
                  type: "tool_use",
                  id: bashToolUseId,
                  name: "Bash",
                  input: { command: "git status" },
                },
              ],
            },
            parent_tool_use_id: null,
            uuid: "00000000-0000-4000-8000-000000000782",
            session_id: WAKE_NATIVE_SESSION,
          }),
        );
        yield* awaitUntil(
          () => Queue.sizeUnsafe(harness.sdkMessages) === 0,
          "the tool_use frame to be consumed",
        );
        let settleYields = 0;
        yield* awaitUntil(() => settleYields++ >= 50, "the tool_use frame to be held");
        const permission = yield* Effect.promise(() =>
          harness.getOpenedOptions()!.canUseTool!(
            "Bash",
            { command: "git status" },
            {
              signal: new AbortController().signal,
              toolUseID: bashToolUseId,
              requestId: "request-wake-bash",
            },
          ),
        ).pipe(Effect.forkScoped);

        // The request is raised at once, releasing the held output to the
        // pending prompt turn (where it went before output was held), so the
        // user can answer it and the SDK is not left waiting on the echo.
        yield* awaitUntil(
          () => harness.events.some((event) => event.type === "runtime_request.updated"),
          "the approval request",
        );
        const request = harness.events.findLast(
          (event) => event.type === "runtime_request.updated",
        );
        const bashItems = harness.events.flatMap((event) =>
          event.type === "turn_item.updated" &&
          event.turnItem.nativeItemRef?.nativeId === bashToolUseId
            ? [event.turnItem.runId]
            : [],
        );
        assert.isNotEmpty(bashItems);
        assert.isTrue(bashItems.every((runId) => runId === RunId.make(`run-${userAttempt}`)));
        if (request?.type !== "runtime_request.updated") return;
        yield* harness.runtime.respondToRuntimeRequest({
          requestId: request.runtimeRequest.id,
          decision: "accept",
        });
        const result = yield* Fiber.join(permission);
        assert.equal(result?.behavior, "allow");
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );

  it.effect("drops a zero-turn task-notification result while awaiting a prompt echo", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeWakeHarness;
        const now = yield* DateTime.now;
        const firstAttempt = RunAttemptId.make("attempt-claude-echo-debris-1");
        const secondAttempt = RunAttemptId.make("attempt-claude-echo-debris-2");
        const stamp = (frame: SDKMessage, promptIndex: number) =>
          claudeSdkFrame({
            ...frame,
            user_message_uuid: harness.promptUuid(promptIndex),
          });

        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: firstAttempt,
            text: "First.",
            attachments: [],
          }),
        );
        // The first turn echoes on its first frame: this process echoes early.
        yield* Queue.offer(
          harness.sdkMessages,
          stamp(
            makeAssistantTextFrame({ uuid: "00000000-0000-4000-8000-000000000760", text: "One." }),
            0,
          ),
        );
        yield* Queue.offer(
          harness.sdkMessages,
          stamp(
            makeResultFrame({ uuid: "00000000-0000-4000-8000-000000000761", result: "One." }),
            0,
          ),
        );
        yield* awaitUntil(() => harness.terminalEvents().length === 1, "first turn terminal");

        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: secondAttempt,
            text: "Second.",
            attachments: [],
            providerTurnOrdinal: 2,
          }),
        );
        // Lifecycle debris ahead of the prompt's own turn: a stale wake's
        // unstamped output, then its zero-turn result.
        yield* Queue.offer(
          harness.sdkMessages,
          makeAssistantTextFrame({ uuid: "00000000-0000-4000-8000-000000000764", text: "Stale." }),
        );
        yield* Queue.offer(harness.sdkMessages, staleTaskNotificationResult);
        yield* Queue.offer(
          harness.sdkMessages,
          stamp(
            makeAssistantTextFrame({ uuid: "00000000-0000-4000-8000-000000000762", text: "Two." }),
            1,
          ),
        );
        yield* Queue.offer(
          harness.sdkMessages,
          stamp(
            makeResultFrame({ uuid: "00000000-0000-4000-8000-000000000763", result: "Two." }),
            1,
          ),
        );
        yield* awaitUntil(() => harness.terminalEvents().length === 2, "second turn terminal");
        assert.equal(harness.terminalEvents()[1]?.status, "completed");
        assert.lengthOf(harness.continuationRequests, 0);
        // The debris' held output is released to the prompt's turn with its
        // echo, as it streamed before the gate existed.
        assert.deepEqual(
          harness.events.flatMap((event) =>
            event.type === "message.updated" && event.message.role === "assistant"
              ? [event.message.text]
              : [],
          ),
          ["One.", "Stale.", "Two."],
        );
        assert.isFalse(
          harness.events.some(
            (event) =>
              event.type === "message.updated" &&
              event.message.text === STALE_TASK_NOTIFICATION_RESULT_TEXT,
          ),
        );
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );

  it.effect("releases output held for a prompt echo when the stream ends", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeWakeHarnessWithOptions({
          close: (sdkMessages) => Queue.shutdown(sdkMessages),
        });
        const now = yield* DateTime.now;
        const firstAttempt = RunAttemptId.make("attempt-claude-echo-1");
        const secondAttempt = RunAttemptId.make("attempt-claude-echo-2");
        const stamp = (frame: SDKMessage, promptIndex: number) =>
          claudeSdkFrame({
            ...frame,
            user_message_uuid: harness.promptUuid(promptIndex),
          });
        const assistantTexts = () =>
          harness.events.flatMap((event) =>
            event.type === "message.updated" && event.message.role === "assistant"
              ? [event.message.text]
              : [],
          );

        // The first turn echoes its prompt uuid on its first frame, so this
        // CLI process is known to echo early.
        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: firstAttempt,
            text: "First.",
            attachments: [],
          }),
        );
        yield* Queue.offer(
          harness.sdkMessages,
          stamp(
            makeAssistantTextFrame({ uuid: "00000000-0000-4000-8000-000000000701", text: "One." }),
            0,
          ),
        );
        yield* Queue.offer(
          harness.sdkMessages,
          stamp(
            makeResultFrame({ uuid: "00000000-0000-4000-8000-000000000702", result: "One." }),
            0,
          ),
        );
        yield* awaitUntil(() => harness.terminalEvents().length === 1, "first turn terminal");

        // The second turn's first frame carries no echo, so it is held; the
        // stream then dies before any result.
        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: secondAttempt,
            text: "Second.",
            attachments: [],
            providerTurnOrdinal: 2,
          }),
        );
        yield* Queue.offer(
          harness.sdkMessages,
          makeAssistantTextFrame({ uuid: "00000000-0000-4000-8000-000000000703", text: "Two." }),
        );
        let heldYields = 0;
        yield* awaitUntil(() => heldYields++ >= 50, "unechoed frame to be held");
        assert.deepEqual(assistantTexts(), ["One."]);

        yield* Queue.shutdown(harness.sdkMessages);
        yield* awaitUntil(() => harness.terminalEvents().length === 2, "second turn terminal");
        assert.deepEqual(assistantTexts(), ["One.", "Two."]);
        assert.equal(harness.terminalEvents()[1]?.status, "failed");
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );

  it.effect("gives the same run attempt a fresh prompt uuid on every offer", () =>
    Effect.scoped(
      Effect.gen(function* () {
        // Two servers sharing a database copy allocate identical run attempt
        // ids and resume the same Claude session. Claude acks a prompt whose
        // uuid its transcript already holds without ever running a turn.
        const original = yield* makeWakeHarness;
        const copy = yield* makeWakeHarness;
        const now = yield* DateTime.now;
        for (const harness of [original, copy]) {
          yield* harness.runtime.startTurn(
            makeClaudeTestTurnInput({
              threadId: harness.threadId,
              providerThread: harness.providerThread,
              now,
              attemptId: RunAttemptId.make("attempt-claude-shared-copy"),
              text: "Continue where you left off.",
              attachments: [],
            }),
          );
        }
        assert.notEqual(original.promptUuid(0), copy.promptUuid(0));
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );

  it.effect("fails a prompt Claude completes without starting a turn for it", () =>
    Effect.scoped(
      Effect.gen(function* () {
        // Claude answers a prompt whose uuid its transcript already holds with
        // a lone completed lifecycle frame and never runs a turn for it.
        const harness = yield* makeWakeHarness;
        const now = yield* DateTime.now;
        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-duplicate-prompt"),
            text: "Bump this PR to the latest main.",
            attachments: [],
          }),
        );
        yield* Queue.offer(
          harness.sdkMessages,
          claudeSdkFrame({
            type: "command_lifecycle",
            command_uuid: harness.promptUuid(0),
            state: "completed",
            uuid: "00000000-0000-4000-8000-000000000790",
            session_id: WAKE_NATIVE_SESSION,
          }),
        );
        yield* awaitUntil(() => harness.terminalEvents().length === 1, "turn terminal");
        const [terminal] = harness.terminalEvents();
        assert.equal(terminal?.status, "failed");
        if (terminal?.status !== "failed") return;
        assert.equal(terminal.threadDisposition, "reusable");
        assert.include(terminal.failure.message, "never started a turn");
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );

  it.effect("keeps a started prompt running until its result", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeWakeHarness;
        const now = yield* DateTime.now;
        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-started-prompt"),
            text: "Bump this PR to the latest main.",
            attachments: [],
          }),
        );
        const lifecycle = (state: string, uuid: string) =>
          claudeSdkFrame({
            type: "command_lifecycle",
            command_uuid: harness.promptUuid(0),
            state,
            uuid,
            session_id: WAKE_NATIVE_SESSION,
          });
        yield* Queue.offer(
          harness.sdkMessages,
          lifecycle("queued", "00000000-0000-4000-8000-000000000791"),
        );
        yield* Queue.offer(
          harness.sdkMessages,
          lifecycle("started", "00000000-0000-4000-8000-000000000792"),
        );
        // The CLI can report the prompt completed before its turn's result.
        yield* Queue.offer(
          harness.sdkMessages,
          lifecycle("completed", "00000000-0000-4000-8000-000000000793"),
        );
        yield* Queue.offer(
          harness.sdkMessages,
          claudeSdkFrame({
            ...makeResultFrame({ uuid: "00000000-0000-4000-8000-000000000794", result: "Done." }),
            user_message_uuid: harness.promptUuid(0),
          }),
        );
        yield* awaitUntil(() => harness.terminalEvents().length === 1, "turn terminal");
        assert.equal(harness.terminalEvents()[0]?.status, "completed");
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );

  it.effect("buffers wake output and requests a single continuation run", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeWakeHarness;
        const now = yield* DateTime.now;

        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-wake-1"),
            text: "Run the build in the background.",
            attachments: [],
          }),
        );
        yield* Queue.offer(harness.sdkMessages, wakeTaskStarted);
        yield* Queue.offer(harness.sdkMessages, turnOneResult);
        yield* awaitUntil(() => harness.terminalEvents().length === 1, "first turn terminal");
        assert.equal(harness.terminalEvents()[0]?.status, "completed");
        assert.isTrue(yield* harness.hasPendingBackgroundWork);
        assert.lengthOf(harness.continuationRequests, 0);

        yield* Queue.offer(harness.sdkMessages, wakeNotification);
        let quietYields = 0;
        yield* awaitUntil(() => quietYields++ >= 50, "notification-only quiet window");
        assert.lengthOf(harness.continuationRequests, 0);
        assert.isFalse(yield* harness.hasPendingBackgroundWork);

        yield* Queue.offer(harness.sdkMessages, wakeAssistant);
        yield* awaitUntil(() => harness.continuationRequests.length === 1, "continuation request");
        assert.equal(harness.continuationRequests[0]?.threadId, harness.threadId);
        assert.equal(harness.continuationRequests[0]?.providerThreadId, harness.providerThread.id);
        assert.equal(harness.continuationRequests[0]?.driver, ClaudeAdapterV2.CLAUDE_PROVIDER);
        assert.equal(harness.continuationRequests[0]?.detail, WAKE_SUMMARY);

        yield* Queue.offer(harness.sdkMessages, wakeResult);
        let settleYields = 0;
        yield* awaitUntil(() => settleYields++ >= 50, "wake result to settle into the buffer");
        assert.lengthOf(harness.continuationRequests, 1);
        assert.lengthOf(harness.terminalEvents(), 1);
        assert.isTrue(yield* harness.hasPendingBackgroundWork);
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );

  it.effect("starts the wake run when Claude opens the wake turn, before its output", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeWakeHarness;
        const now = yield* DateTime.now;

        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-wake-init-1"),
            text: "Run the build in the background.",
            attachments: [],
          }),
        );
        yield* Queue.offer(harness.sdkMessages, wakeTaskStarted);
        yield* Queue.offer(harness.sdkMessages, turnOneResult);
        yield* awaitUntil(() => harness.terminalEvents().length === 1, "first turn terminal");

        yield* harness.offerAndWait(wakeNotification);
        assert.lengthOf(harness.continuationRequests, 0);
        yield* harness.offerAndWait(wakeTurnInit);
        assert.lengthOf(harness.continuationRequests, 1);
        assert.equal(harness.continuationRequests[0]?.detail, WAKE_SUMMARY);

        // The run attaches while Claude still thinks: only the notification
        // and `init` are buffered, so the run waits for the turn's output.
        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-wake-init-2"),
            text: "Background task completed.",
            attachments: [],
            providerTurnOrdinal: 2,
            messageCreatedBy: "agent",
            messageCreationSource: "provider",
          }),
        );
        assert.lengthOf(harness.terminalEvents(), 1);

        yield* harness.offerAndWait(wakeAssistant);
        yield* harness.offerAndWait(wakeResult);
        yield* awaitUntil(() => harness.terminalEvents().length === 2, "wake run terminal");
        assert.equal(harness.terminalEvents()[1]?.status, "completed");
        assert.lengthOf(harness.continuationRequests, 1);
        assert.isTrue(
          harness.events.some(
            (event) => event.type === "message.updated" && event.message.text === WAKE_RESULT_TEXT,
          ),
        );
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );

  // Live, 21 Oct: a /loop wakeup opened a turn while no run was active, a queued prompt joined
  // that turn and its result ended both, and the wake's run then waited a day for a turn
  // that had already ended.
  it.effect("settles the wake run when a queued prompt's turn absorbed the wake turn", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeWakeHarness;
        const now = yield* DateTime.now;

        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-absorbed-wake-1"),
            text: "Run the build in the background.",
            attachments: [],
          }),
        );
        yield* Queue.offer(harness.sdkMessages, turnOneResult);
        yield* awaitUntil(() => harness.terminalEvents().length === 1, "first turn terminal");

        yield* harness.offerAndWait(wakeTurnInit);
        assert.lengthOf(harness.continuationRequests, 1);

        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-absorbed-wake-2"),
            text: "New step for the pipeline.",
            attachments: [],
            providerTurnOrdinal: 2,
          }),
        );
        yield* awaitUntil(() => harness.offeredMessages.length === 2, "queued prompt offered");
        const lifecycle = (state: string, uuid: string) =>
          claudeSdkFrame({
            type: "command_lifecycle",
            command_uuid: harness.promptUuid(1),
            state,
            uuid,
            session_id: WAKE_NATIVE_SESSION,
          });
        yield* harness.offerAndWait(lifecycle("queued", "00000000-0000-4000-8000-000000000120"));
        yield* harness.offerAndWait(lifecycle("started", "00000000-0000-4000-8000-000000000121"));
        yield* harness.offerAndWait(wakeAssistant);
        yield* harness.offerAndWait(
          claudeSdkFrame({
            ...makeResultFrame({
              uuid: "00000000-0000-4000-8000-000000000122",
              result: WAKE_RESULT_TEXT,
            }),
            user_message_uuids: [harness.promptUuid(1)],
          }),
        );
        yield* awaitUntil(() => harness.terminalEvents().length === 2, "prompt turn terminal");
        assert.equal(harness.terminalEvents()[1]?.status, "completed");

        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-absorbed-wake-3"),
            text: "Background task completed.",
            attachments: [],
            providerTurnOrdinal: 3,
            messageCreatedBy: "agent",
            messageCreationSource: "provider",
          }),
        );
        yield* awaitUntil(() => harness.terminalEvents().length === 3, "wake run terminal");
        assert.equal(harness.terminalEvents()[2]?.status, "completed");
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );

  it.effect("does not offer a continuation for notification-only opaque work", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeWakeHarness;
        const now = yield* DateTime.now;

        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-notification-only"),
            text: "Start opaque background work.",
            attachments: [],
          }),
        );
        yield* Queue.offer(harness.sdkMessages, wakeTaskStarted);
        yield* Queue.offer(harness.sdkMessages, turnOneResult);
        yield* awaitUntil(() => harness.terminalEvents().length === 1, "first turn terminal");
        assert.isTrue(yield* harness.hasPendingBackgroundWork);

        yield* Queue.offer(harness.sdkMessages, wakeNotification);
        let quietYields = 0;
        yield* awaitUntil(() => quietYields++ >= 100, "notification-only quiet window");
        assert.lengthOf(harness.continuationRequests, 0);
        assert.lengthOf(harness.terminalEvents(), 1);
        assert.isFalse(yield* harness.hasPendingBackgroundWork);

        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-notification-only-continuation"),
            text: "Background task completed.",
            attachments: [],
            providerTurnOrdinal: 2,
            messageCreatedBy: "agent",
            messageCreationSource: "provider",
          }),
        );
        yield* awaitUntil(
          () => harness.terminalEvents().length === 2,
          "notification-only continuation terminal",
        );
        assert.equal(harness.terminalEvents()[1]?.status, "completed");
        assert.lengthOf(harness.offeredMessages, 1);
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );

  it.effect("carries a rejected wake rate limit into the continuation failure", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeWakeHarness;
        const now = yield* DateTime.now;
        // 2026-09-25T11:10 AEST: the reset a real wake reported while the CLI
        // blocked its notification turn ("resets 11:10am (Australia/Sydney)").
        const resetsAt = 1790298600;

        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-wake-limit-1"),
            text: "Run the build in the background.",
            attachments: [],
          }),
        );
        yield* Queue.offer(harness.sdkMessages, wakeTaskStarted);
        yield* Queue.offer(harness.sdkMessages, turnOneResult);
        yield* Queue.take(harness.terminalReceipts);

        // The CLI wakes with a rejected window before the continuation turn
        // exists, then blocks the wake turn itself.
        yield* Queue.offer(harness.sdkMessages, wakeNotification);
        yield* harness.offerAndWait(
          claudeSdkFrame({
            type: "rate_limit_event",
            rate_limit_info: {
              status: "rejected",
              rateLimitType: "five_hour",
              resetsAt,
              overageStatus: "rejected",
            },
            uuid: "00000000-0000-4000-8000-000000000630",
            session_id: WAKE_NATIVE_SESSION,
          }),
        );
        // The parked rate-limit frame rides along with the wake output; it
        // must not request a continuation on its own.
        assert.lengthOf(harness.continuationRequests, 0);
        yield* harness.offerAndWait(
          makeAssistantErrorFrame({
            uuid: "00000000-0000-4000-8000-000000000631",
            error: "rate_limit",
          }),
        );
        assert.lengthOf(harness.continuationRequests, 1);
        yield* harness.offerAndWait(
          makeResultFrame({
            uuid: "00000000-0000-4000-8000-000000000632",
            result: "You've hit your session limit · resets 11:10am (Australia/Sydney)",
            isError: true,
            apiErrorStatus: 429,
            terminalReason: "api_error",
            origin: { kind: "task-notification" },
          }),
        );
        assert.lengthOf(harness.continuationRequests, 1);

        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-wake-limit-2"),
            text: "Background task completed.",
            attachments: [],
            providerTurnOrdinal: 2,
            messageCreatedBy: "agent",
            messageCreationSource: "provider",
          }),
        );
        const terminal = yield* Queue.take(harness.terminalReceipts);
        assert.equal(terminal?.status, "failed");
        if (terminal === undefined || terminal.status !== "failed") return;
        assert.equal(terminal.failure.class, "usage_limit");
        assert.equal(terminal.failure.resetAt, "2026-09-25T01:10:00.000Z");
        // The rejected window is announced once the replay has a turn to own it.
        const pause = yield* Queue.take(harness.systemNoticeReceipts);
        assert.equal(pause.turnItem.type, "system_notice");
        if (pause.turnItem.type !== "system_notice") return;
        assert.include(pause.turnItem.message, "This turn is paused until the 5-hour limit");
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );

  it.effect("leaves buffered wake messages for the continuation queued behind a user turn", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeWakeHarness;
        const now = yield* DateTime.now;

        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-wake-4a"),
            text: "Run the build in the background.",
            attachments: [],
          }),
        );
        yield* Queue.offer(harness.sdkMessages, wakeTaskStarted);
        yield* Queue.offer(harness.sdkMessages, turnOneResult);
        yield* awaitUntil(() => harness.terminalEvents().length === 1, "first turn terminal");
        yield* Queue.offer(harness.sdkMessages, wakeNotification);
        yield* Queue.offer(harness.sdkMessages, wakeResult);
        yield* awaitUntil(() => harness.continuationRequests.length === 1, "continuation request");

        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-wake-4b"),
            text: "How is the build going?",
            attachments: [],
            providerTurnOrdinal: 2,
          }),
        );

        // The user prompt reaches the CLI and the buffer stays untouched: the
        // wake result must not settle the user turn or surface under it.
        yield* awaitUntil(() => harness.offeredMessages.length === 2, "user prompt offered");
        assert.lengthOf(harness.terminalEvents(), 1);
        assert.isTrue(yield* harness.hasPendingBackgroundWork);

        yield* Queue.offer(
          harness.sdkMessages,
          makeResultFrame({
            uuid: "00000000-0000-4000-8000-000000000105",
            result: "The build passed; nothing else pending.",
          }),
        );
        yield* awaitUntil(() => harness.terminalEvents().length === 2, "user turn terminal");
        assert.equal(harness.terminalEvents()[1]?.status, "completed");
        assert.isFalse(
          harness.events.some(
            (event) => event.type === "message.updated" && event.message.text === WAKE_RESULT_TEXT,
          ),
        );

        // The continuation run queued behind the user turn drains the wake
        // output afterwards.
        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-wake-4c"),
            text: "Background task completed.",
            attachments: [],
            providerTurnOrdinal: 3,
            messageCreatedBy: "agent",
            messageCreationSource: "provider",
          }),
        );
        yield* awaitUntil(() => harness.terminalEvents().length === 3, "continuation terminal");
        assert.equal(harness.terminalEvents()[2]?.status, "completed");
        assert.lengthOf(harness.offeredMessages, 2);
        assert.isTrue(
          harness.events.some(
            (event) => event.type === "message.updated" && event.message.text === WAKE_RESULT_TEXT,
          ),
        );
        assert.isFalse(
          harness.events.some(
            (event) =>
              event.type !== "provider_thread.updated" &&
              JSON.stringify(event).includes(WAKE_TASK_ID),
          ),
        );
        assert.isFalse(yield* harness.hasPendingBackgroundWork);
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );

  it.effect("terminalizes an agent server wake from a positive task-notification result", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeWakeHarness;
        const now = yield* DateTime.now;
        const wakeText = "The background command completed.";

        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-agent-server-wake"),
            text: "Background task completed.",
            attachments: [],
            messageCreatedBy: "agent",
            messageCreationSource: "server",
          }),
        );
        yield* Queue.offer(
          harness.sdkMessages,
          makeAssistantTextFrame({
            uuid: "00000000-0000-4000-8000-00000000010b",
            text: wakeText,
          }),
        );
        yield* Queue.offer(
          harness.sdkMessages,
          makeResultFrame({
            uuid: "00000000-0000-4000-8000-00000000010c",
            result: wakeText,
            numTurns: 154,
            origin: { kind: "task-notification" },
          }),
        );
        yield* awaitUntil(() => harness.terminalEvents().length === 1, "server wake terminal");
        assert.equal(harness.terminalEvents()[0]?.status, "completed");

        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-agent-server-next"),
            text: "What finished?",
            attachments: [],
            providerTurnOrdinal: 2,
          }),
        );
        yield* Queue.offer(
          harness.sdkMessages,
          makeResultFrame({
            uuid: "00000000-0000-4000-8000-00000000010d",
            result: "The background command finished.",
          }),
        );
        yield* awaitUntil(() => harness.terminalEvents().length === 2, "queued turn terminal");
        assert.equal(harness.terminalEvents()[1]?.status, "completed");
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );

  it.effect("terminalizes a user mobile turn from a positive task-notification result", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeWakeHarness;
        const now = yield* DateTime.now;
        const fallbackText = "The ordinary mobile turn completed.";

        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-mobile-notif-origin"),
            text: "Complete this task.",
            attachments: [],
            messageCreationSource: "mobile",
          }),
        );
        yield* Queue.offer(
          harness.sdkMessages,
          makeResultFrame({
            uuid: "00000000-0000-4000-8000-00000000010e",
            result: fallbackText,
            numTurns: 60,
            origin: { kind: "task-notification" },
          }),
        );
        yield* awaitUntil(() => harness.terminalEvents().length === 1, "mobile turn terminal");
        assert.equal(harness.terminalEvents()[0]?.status, "completed");
        assert.isTrue(
          harness.events.some(
            (event) => event.type === "message.updated" && event.message.text === fallbackText,
          ),
        );
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );

  it.effect("ignores a zero-turn task-notification origin result during a normal user turn", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeWakeHarness;
        const now = yield* DateTime.now;
        const probeAssistantText = "Probe after stale task-notification result.";
        const recoveryAssistantText = "Recovered after the interrupt; continuing.";
        const staleResultText = STALE_TASK_NOTIFICATION_RESULT_TEXT;
        const hasMessageText = (text: string) =>
          harness.events.some(
            (event) => event.type === "message.updated" && event.message.text === text,
          );

        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-stale-notif-1"),
            text: "Continue after interrupt.",
            attachments: [],
          }),
        );
        yield* awaitUntil(() => harness.offeredMessages.length === 1, "recovery prompt offered");

        // Live interleaving seen after interrupt recovery: a stale stopped
        // task_notification and its task-notification-origin result arrive
        // before the real root assistant stream.
        yield* Queue.offer(
          harness.sdkMessages,
          claudeSdkFrame({
            type: "system",
            subtype: "task_notification",
            task_id: "task-stale-stopped",
            tool_use_id: "toolu-stale-stopped",
            status: "stopped",
            output_file: "/tmp/task-stale-stopped.log",
            summary: "",
            uuid: "00000000-0000-4000-8000-000000000107",
            session_id: WAKE_NATIVE_SESSION,
          }),
        );
        yield* Queue.offer(harness.sdkMessages, staleTaskNotificationResult);
        // Queue-ordered probe: once this assistant text is emitted, the stale
        // origin result ahead of it has been consumed.
        yield* Queue.offer(
          harness.sdkMessages,
          makeAssistantTextFrame({
            uuid: "00000000-0000-4000-8000-00000000010a",
            text: probeAssistantText,
          }),
        );

        yield* awaitUntil(
          () => hasMessageText(probeAssistantText),
          "probe assistant after stale task-notification result",
        );
        assert.lengthOf(harness.terminalEvents(), 0);
        assert.isFalse(hasMessageText(staleResultText));

        yield* Queue.offer(
          harness.sdkMessages,
          makeAssistantTextFrame({
            uuid: "00000000-0000-4000-8000-000000000108",
            text: recoveryAssistantText,
          }),
        );
        yield* Queue.offer(
          harness.sdkMessages,
          makeResultFrame({
            uuid: "00000000-0000-4000-8000-000000000109",
            result: recoveryAssistantText,
          }),
        );

        yield* awaitUntil(() => harness.terminalEvents().length === 1, "user turn terminal");
        assert.equal(harness.terminalEvents()[0]?.status, "completed");
        assert.isTrue(hasMessageText(recoveryAssistantText));
        assert.isFalse(hasMessageText(staleResultText));
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );

  it.effect("terminalizes a zero-turn task-notification result in a provider continuation", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeWakeHarness;
        const now = yield* DateTime.now;

        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-zero-continuation-1"),
            text: "Run the build in the background.",
            attachments: [],
          }),
        );
        yield* Queue.offer(harness.sdkMessages, wakeTaskStarted);
        yield* Queue.offer(harness.sdkMessages, turnOneResult);
        yield* awaitUntil(() => harness.terminalEvents().length === 1, "first turn terminal");
        yield* Queue.offer(harness.sdkMessages, wakeNotification);
        yield* Queue.offer(
          harness.sdkMessages,
          makeResultFrame({
            uuid: "00000000-0000-4000-8000-00000000010f",
            result: "Wake result with no model turns.",
            numTurns: 0,
            origin: { kind: "task-notification" },
          }),
        );
        yield* awaitUntil(() => harness.continuationRequests.length === 1, "continuation request");

        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-zero-continuation-2"),
            text: "Background task completed.",
            attachments: [],
            providerTurnOrdinal: 2,
            messageCreatedBy: "agent",
            messageCreationSource: "provider",
          }),
        );
        yield* awaitUntil(() => harness.terminalEvents().length === 2, "continuation terminal");
        assert.equal(harness.terminalEvents()[1]?.status, "completed");
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );

  it.effect(
    "emits one interrupted terminal for a positive task-notification result racing interrupt",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const closeGate = yield* Deferred.make<void>();
          const testScope = yield* Scope.Scope;
          yield* Scope.addFinalizer(testScope, Deferred.succeed(closeGate, undefined));
          const interruptStarted = yield* Deferred.make<void>();
          const harness = yield* makeWakeHarnessWithOptions({
            close: (sdkMessages) =>
              Deferred.await(closeGate).pipe(Effect.andThen(Queue.shutdown(sdkMessages))),
            interrupt: Deferred.succeed(interruptStarted, undefined),
          });
          const idAllocator = yield* IdAllocator.IdAllocatorV2;
          const now = yield* DateTime.now;
          const attemptId = RunAttemptId.make("attempt-claude-interrupt-positive-notif");
          const providerTurnId = idAllocator.derive.providerTurn({
            driver: ClaudeAdapterV2.CLAUDE_PROVIDER,
            nativeTurnId: `turn:${attemptId}`,
          });

          yield* harness.runtime.startTurn(
            makeClaudeTestTurnInput({
              threadId: harness.threadId,
              providerThread: harness.providerThread,
              now,
              attemptId,
              text: "Stop this task.",
              attachments: [],
            }),
          );
          yield* harness.runtime
            .interruptTurn({ providerThread: harness.providerThread, providerTurnId })
            .pipe(Effect.forkScoped);
          yield* Deferred.await(interruptStarted);
          yield* Queue.offer(
            harness.sdkMessages,
            makeResultFrame({
              uuid: "00000000-0000-4000-8000-000000000115",
              result: "Late result after interrupt.",
              numTurns: 7,
              origin: { kind: "task-notification" },
            }),
          );
          const terminalized = Exit.isSuccess(
            yield* awaitUntil(
              () => harness.terminalEvents().length === 1,
              "interrupted terminal",
            ).pipe(Effect.exit),
          );
          yield* Deferred.succeed(closeGate, undefined);
          assert.isTrue(terminalized);
          assert.equal(harness.terminalEvents()[0]?.status, "interrupted");
          assert.lengthOf(harness.terminalEvents(), 1);
        }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
      ),
  );

  it.effect("drops zero-turn task-notification debris racing interrupt", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const closeGate = yield* Deferred.make<void>();
        const testScope = yield* Scope.Scope;
        yield* Scope.addFinalizer(testScope, Deferred.succeed(closeGate, undefined));
        const interruptStarted = yield* Deferred.make<void>();
        const harness = yield* makeWakeHarnessWithOptions({
          close: (sdkMessages) =>
            Deferred.await(closeGate).pipe(Effect.andThen(Queue.shutdown(sdkMessages))),
          interrupt: Deferred.succeed(interruptStarted, undefined),
        });
        const idAllocator = yield* IdAllocator.IdAllocatorV2;
        const now = yield* DateTime.now;
        const attemptId = RunAttemptId.make("attempt-claude-interrupt-zero-notif");
        const providerTurnId = idAllocator.derive.providerTurn({
          driver: ClaudeAdapterV2.CLAUDE_PROVIDER,
          nativeTurnId: `turn:${attemptId}`,
        });
        const staleText = "Zero-turn debris must not leak.";

        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId,
            text: "Stop this task.",
            attachments: [],
          }),
        );
        yield* harness.runtime
          .interruptTurn({ providerThread: harness.providerThread, providerTurnId })
          .pipe(Effect.forkScoped);
        yield* Deferred.await(interruptStarted);
        yield* Queue.offer(
          harness.sdkMessages,
          makeResultFrame({
            uuid: "00000000-0000-4000-8000-000000000116",
            result: staleText,
            numTurns: 0,
            origin: { kind: "task-notification" },
          }),
        );
        let debrisYields = 0;
        yield* awaitUntil(() => debrisYields++ >= 50, "zero-turn debris consumed");
        yield* Deferred.succeed(closeGate, undefined);
        yield* awaitUntil(() => harness.terminalEvents().length === 1, "interrupted terminal");
        assert.lengthOf(harness.terminalEvents(), 1);
        assert.equal(harness.terminalEvents()[0]?.status, "interrupted");
        assert.isFalse(
          harness.events.some(
            (event) => event.type === "message.updated" && event.message.text === staleText,
          ),
        );
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );

  it.effect("fails a positive task-notification error result", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeWakeHarness;
        const now = yield* DateTime.now;

        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-positive-notif-error"),
            text: "Run the task.",
            attachments: [],
          }),
        );
        yield* Queue.offer(
          harness.sdkMessages,
          makeResultFrame({
            uuid: "00000000-0000-4000-8000-000000000117",
            result: "The task failed.",
            numTurns: 7,
            origin: { kind: "task-notification" },
            subtype: "error_during_execution",
            isError: true,
            errors: ["The task failed."],
          }),
        );
        yield* awaitUntil(() => harness.terminalEvents().length === 1, "failed terminal");
        assert.equal(harness.terminalEvents()[0]?.status, "failed");
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );

  it.effect("settles a continuation turn immediately when no wake output is buffered", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeWakeHarness;
        const now = yield* DateTime.now;

        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-wake-3"),
            text: "Background task completed.",
            attachments: [],
            messageCreatedBy: "agent",
            messageCreationSource: "provider",
          }),
        );

        yield* awaitUntil(() => harness.terminalEvents().length === 1, "spurious terminal");
        assert.equal(harness.terminalEvents()[0]?.status, "completed");
        assert.lengthOf(harness.offeredMessages, 0);
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );

  // The CLI sends one frame per content block, each carrying the id of the
  // native message it belongs to.
  const makeSubagentAssistantFrames = (input: {
    readonly parentToolUseId: string;
    readonly uuid: string;
    readonly messageId?: string;
    readonly text?: string;
    readonly bashToolUseId?: string;
  }): ReadonlyArray<SDKMessage> =>
    [
      ...(input.text === undefined ? [] : [{ type: "text", text: input.text }]),
      ...(input.bashToolUseId === undefined
        ? []
        : [
            {
              type: "tool_use",
              id: input.bashToolUseId,
              name: "Bash",
              input: { command: "git log -5" },
            },
          ]),
    ].map((block, index) =>
      claudeSdkFrame({
        type: "assistant",
        message: {
          model: "claude-sonnet-4-6",
          id: input.messageId ?? `msg_${input.uuid}`,
          type: "message",
          role: "assistant",
          content: [block],
        },
        parent_tool_use_id: input.parentToolUseId,
        uuid: index === 0 ? input.uuid : `${input.uuid}:${index}`,
        session_id: WAKE_NATIVE_SESSION,
      }),
    );
  const makeSubagentToolResultFrame = (input: {
    readonly parentToolUseId: string;
    readonly uuid: string;
    readonly toolUseId: string;
  }) =>
    claudeSdkFrame({
      type: "user",
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: input.toolUseId, content: "ok" }],
      },
      parent_tool_use_id: input.parentToolUseId,
      uuid: input.uuid,
      session_id: WAKE_NATIVE_SESSION,
    });
  const makeSubagentTaskStartedFrame = (input: {
    readonly taskId: string;
    readonly toolUseId: string;
    readonly uuid: string;
  }) =>
    claudeSdkFrame({
      type: "system",
      subtype: "task_started",
      task_id: input.taskId,
      tool_use_id: input.toolUseId,
      description: "Audit recent commits",
      subagent_type: "general-purpose",
      is_backgrounded: true,
      task_type: "local_agent",
      prompt: "Audit the last five commits.",
      uuid: input.uuid,
      session_id: WAKE_NATIVE_SESSION,
    });
  const makeSubagentNotificationFrame = (input: {
    readonly taskId: string;
    readonly toolUseId: string;
    readonly summary: string;
    readonly uuid: string;
  }) =>
    claudeSdkFrame({
      type: "system",
      subtype: "task_notification",
      task_id: input.taskId,
      tool_use_id: input.toolUseId,
      status: "completed",
      output_file: `/tmp/${input.taskId}.output`,
      summary: input.summary,
      uuid: input.uuid,
      session_id: WAKE_NATIVE_SESSION,
    });
  const subagentRouting = (
    events: ReadonlyArray<ProviderAdapterV2Event>,
    nativeToolIds: ReadonlyArray<string>,
  ) => {
    const childThreadId =
      events.find((event) => event.type === "subagent.updated")?.subagent.childThreadId ??
      undefined;
    const toolThreadIds = new Map<string, Set<string>>();
    for (const event of events) {
      const nativeId =
        event.type === "turn_item.updated" ? event.turnItem.nativeItemRef?.nativeId : undefined;
      if (event.type === "turn_item.updated" && nativeId && nativeToolIds.includes(nativeId)) {
        toolThreadIds.set(
          nativeId,
          (toolThreadIds.get(nativeId) ?? new Set()).add(event.turnItem.threadId),
        );
      }
    }
    const assistantTexts = (threadId: string | undefined) =>
      events.flatMap((event) =>
        event.type === "message.updated" &&
        event.message.role === "assistant" &&
        event.message.threadId === threadId
          ? [event.message.text]
          : [],
      );
    return { childThreadId, toolThreadIds, assistantTexts };
  };

  it.effect("a subagent re-run in the foreground does not join a later wake", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeWakeHarness;
        const now = yield* DateTime.now;
        const taskId = "task-foreground-rerun";
        const toolUseId = "toolu_foreground_rerun";
        const userTurn = (attempt: string, providerTurnOrdinal: number) =>
          harness.runtime.startTurn(
            makeClaudeTestTurnInput({
              threadId: harness.threadId,
              providerThread: harness.providerThread,
              now,
              attemptId: RunAttemptId.make(attempt),
              text: "Go on.",
              attachments: [],
              providerTurnOrdinal,
            }),
          );
        const result = (uuid: string) => makeResultFrame({ uuid, result: "Done." });
        const ended = (uuid: string) =>
          makeSubagentNotificationFrame({ taskId, toolUseId, summary: "AUDITED", uuid });

        yield* userTurn("attempt-rerun-1", 1);
        yield* Queue.offer(
          harness.sdkMessages,
          makeSubagentTaskStartedFrame({
            taskId,
            toolUseId,
            uuid: "00000000-0000-4000-8000-000000000901",
          }),
        );
        yield* Queue.offer(harness.sdkMessages, result("00000000-0000-4000-8000-000000000902"));
        yield* awaitUntil(() => harness.terminalEvents().length === 1, "first turn terminal");
        // The backgrounded subagent ends idle; its wake names it.
        yield* Queue.offer(harness.sdkMessages, ended("00000000-0000-4000-8000-000000000903"));
        yield* awaitUntil(() => harness.continuationRequests.length === 1, "subagent wake");
        yield* Queue.offer(harness.sdkMessages, result("00000000-0000-4000-8000-000000000904"));
        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-rerun-2"),
            text: "Background task completed.",
            attachments: [],
            providerTurnOrdinal: 2,
            messageCreatedBy: "agent",
            messageCreationSource: "provider",
          }),
        );
        yield* awaitUntil(() => harness.terminalEvents().length === 2, "wake terminal");

        // A later turn re-runs it in the foreground and starts a background command.
        yield* userTurn("attempt-rerun-3", 3);
        yield* Queue.offer(
          harness.sdkMessages,
          claudeSdkFrame({
            ...makeSubagentTaskStartedFrame({
              taskId,
              toolUseId,
              uuid: "00000000-0000-4000-8000-000000000905",
            }),
            is_backgrounded: false,
          }),
        );
        yield* Queue.offer(harness.sdkMessages, ended("00000000-0000-4000-8000-000000000906"));
        yield* Queue.offer(harness.sdkMessages, wakeTaskStarted);
        yield* Queue.offer(harness.sdkMessages, result("00000000-0000-4000-8000-000000000907"));
        yield* awaitUntil(() => harness.terminalEvents().length === 3, "third turn terminal");

        yield* Queue.offer(harness.sdkMessages, wakeNotification);
        yield* Queue.offer(harness.sdkMessages, wakeAssistant);
        yield* awaitUntil(() => harness.continuationRequests.length === 2, "command wake");
        assert.equal(
          harness.continuationRequests[1]?.notification?.summary,
          `Command "${WAKE_TASK_DESCRIPTION}" finished`,
        );
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );

  it.effect("a turn that fails to start does not expire a queued wake's report", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeWakeHarness;
        const now = yield* DateTime.now;
        const userTurn = (
          attempt: string,
          providerTurnOrdinal: number,
          attachments: ProviderAdapterV2TurnInput["message"]["attachments"] = [],
        ) =>
          harness.runtime.startTurn(
            makeClaudeTestTurnInput({
              threadId: harness.threadId,
              providerThread: harness.providerThread,
              now,
              attemptId: RunAttemptId.make(attempt),
              text: "Go on.",
              attachments,
              providerTurnOrdinal,
            }),
          );

        yield* userTurn("attempt-failed-start-1", 1);
        yield* Queue.offer(harness.sdkMessages, wakeTaskStarted);
        yield* Queue.offer(harness.sdkMessages, turnOneResult);
        yield* awaitUntil(() => harness.terminalEvents().length === 1, "first turn terminal");
        // The command ends idle; Claude has not started its wake yet.
        yield* Queue.offer(harness.sdkMessages, wakeNotification);
        let notificationYields = 0;
        yield* awaitUntil(() => notificationYields++ >= 50, "notification to be recorded");
        assert.isFalse(yield* harness.hasPendingBackgroundWork);

        // The next prompt names an attachment that is gone, so it never reaches Claude.
        const missing = ChatImageAttachment.make({
          type: "image",
          id: ChatAttachmentId.make("thread-claude-wake-12345678-1234-1234-1234-123456789abc"),
          name: "gone.png",
          mimeType: "image/png",
          sizeBytes: 4,
        });
        const failed = yield* Effect.exit(userTurn("attempt-failed-start-2", 2, [missing]));
        assert.isTrue(Exit.isFailure(failed));

        // The user's next prompt runs before Claude's wake does.
        yield* userTurn("attempt-failed-start-3", 2);
        yield* Queue.offer(
          harness.sdkMessages,
          makeResultFrame({ uuid: "00000000-0000-4000-8000-000000000911", result: "Answered." }),
        );
        yield* awaitUntil(() => harness.terminalEvents().length === 2, "second turn terminal");

        yield* Queue.offer(harness.sdkMessages, wakeAssistant);
        yield* awaitUntil(() => harness.continuationRequests.length === 1, "command wake");
        assert.equal(
          harness.continuationRequests[0]?.notification?.summary,
          `Command "${WAKE_TASK_DESCRIPTION}" finished`,
        );
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );

  it.effect("keeps a subagent a queued wake turn launches with its continuation", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const TASK_ID = "a-wake-launched-subagent";
        const TOOL_USE_ID = "toolu_01WakeLaunchedAgent";
        const harness = yield* makeWakeHarness;
        const now = yield* DateTime.now;
        const firstAttempt = RunAttemptId.make("attempt-claude-wake-subagent-1");
        const userAttempt = RunAttemptId.make("attempt-claude-wake-subagent-2");
        const continuationAttempt = RunAttemptId.make("attempt-claude-wake-subagent-3");
        const runOf = (attemptId: RunAttemptId) => RunId.make(`run-${attemptId}`);
        const stamp = (frame: SDKMessage, promptIndex: number) =>
          claudeSdkFrame({
            ...frame,
            user_message_uuid: harness.promptUuid(promptIndex),
          });

        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: firstAttempt,
            text: "Run the build in the background.",
            attachments: [],
          }),
        );
        yield* Queue.offer(harness.sdkMessages, stamp(wakeTaskStarted, 0));
        yield* Queue.offer(
          harness.sdkMessages,
          stamp(
            makeResultFrame({ uuid: "00000000-0000-4000-8000-000000000770", result: "STARTED" }),
            0,
          ),
        );
        yield* awaitUntil(() => harness.terminalEvents().length === 1, "first turn terminal");

        // While the user's prompt is queued, the wake turn launches a
        // subagent; its lifecycle and child frames follow the wake turn.
        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: userAttempt,
            text: "Reply with exactly: USER_REPLY",
            attachments: [],
            providerTurnOrdinal: 2,
          }),
        );
        const wakeFrames = [
          wakeNotification,
          claudeSdkFrame({
            type: "assistant",
            message: {
              model: "claude-sonnet-4-6",
              id: "msg_wake_agent",
              type: "message",
              role: "assistant",
              content: [
                {
                  type: "tool_use",
                  id: TOOL_USE_ID,
                  name: "Agent",
                  input: { description: "Audit recent commits", prompt: "Audit them." },
                },
              ],
            },
            parent_tool_use_id: null,
            uuid: "00000000-0000-4000-8000-000000000771",
            session_id: WAKE_NATIVE_SESSION,
          }),
          makeSubagentTaskStartedFrame({
            taskId: TASK_ID,
            toolUseId: TOOL_USE_ID,
            uuid: "00000000-0000-4000-8000-000000000772",
          }),
          ...makeSubagentAssistantFrames({
            parentToolUseId: TOOL_USE_ID,
            uuid: "00000000-0000-4000-8000-000000000773",
            text: "AUDIT_DONE",
          }),
          makeSubagentNotificationFrame({
            taskId: TASK_ID,
            toolUseId: TOOL_USE_ID,
            summary: "AUDIT_DONE",
            uuid: "00000000-0000-4000-8000-000000000774",
          }),
          claudeSdkFrame({
            type: "user",
            message: {
              role: "user",
              content: [{ type: "tool_result", tool_use_id: TOOL_USE_ID, content: "AUDIT_DONE" }],
            },
            parent_tool_use_id: null,
            uuid: "00000000-0000-4000-8000-000000000775",
            session_id: WAKE_NATIVE_SESSION,
          }),
          wakeResult,
          stamp(
            makeAssistantTextFrame({
              uuid: "00000000-0000-4000-8000-000000000776",
              text: "USER_REPLY",
            }),
            1,
          ),
          stamp(
            makeResultFrame({ uuid: "00000000-0000-4000-8000-000000000777", result: "USER_REPLY" }),
            1,
          ),
        ];
        for (const frame of wakeFrames) {
          yield* Queue.offer(harness.sdkMessages, frame);
        }
        yield* awaitUntil(() => harness.terminalEvents().length === 2, "user turn terminal");

        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: continuationAttempt,
            text: "Background task completed.",
            attachments: [],
            providerTurnOrdinal: 3,
            messageCreatedBy: "agent",
            messageCreationSource: "provider",
          }),
        );
        yield* awaitUntil(() => harness.terminalEvents().length === 3, "continuation terminal");

        const subagentRuns = harness.events.flatMap((event) =>
          event.type === "subagent.updated" && event.subagent.nativeTaskRef?.nativeId === TASK_ID
            ? [event.subagent.runId]
            : [],
        );
        assert.isNotEmpty(subagentRuns);
        assert.isTrue(subagentRuns.every((runId) => runId === runOf(continuationAttempt)));
        const finalSubagent = harness.events.findLast(
          (event) =>
            event.type === "subagent.updated" && event.subagent.nativeTaskRef?.nativeId === TASK_ID,
        );
        assert.equal(
          finalSubagent?.type === "subagent.updated" && finalSubagent.subagent.status,
          "completed",
        );
        const userRunItems = harness.events.flatMap((event) =>
          event.type === "turn_item.updated" && event.turnItem.runId === runOf(userAttempt)
            ? [event.turnItem.type]
            : [],
        );
        assert.deepEqual([...new Set(userRunItems)], ["assistant_message"]);
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );

  it.effect("routes a subagent that starts while the root turn is idle", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const TASK_ID = "task-idle-subagent";
        const TOOL_USE_ID = "toolu-idle-subagent";
        const FINAL_REPORT = "Idle auditor done.";
        const harness = yield* makeWakeHarness;
        const now = yield* DateTime.now;
        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-idle-subagent-1"),
            text: "Wait for background work.",
            attachments: [],
          }),
        );
        yield* Queue.offer(
          harness.sdkMessages,
          makeResultFrame({
            uuid: "00000000-0000-4000-8000-000000000331",
            result: "Waiting in the background.",
          }),
        );
        yield* awaitUntil(() => harness.terminalEvents().length === 1, "first turn terminal");

        // A native wake turn launches a new subagent while Control has no turn.
        const idleFrames = [
          makeSubagentTaskStartedFrame({
            taskId: TASK_ID,
            toolUseId: TOOL_USE_ID,
            uuid: "00000000-0000-4000-8000-000000000332",
          }),
          ...makeSubagentAssistantFrames({
            parentToolUseId: TOOL_USE_ID,
            uuid: "00000000-0000-4000-8000-000000000333",
            text: "Idle auditor working.",
            bashToolUseId: "toolu-idle-bash",
          }),
          makeSubagentToolResultFrame({
            parentToolUseId: TOOL_USE_ID,
            uuid: "00000000-0000-4000-8000-000000000334",
            toolUseId: "toolu-idle-bash",
          }),
          ...makeSubagentAssistantFrames({
            parentToolUseId: TOOL_USE_ID,
            uuid: "00000000-0000-4000-8000-000000000335",
            text: FINAL_REPORT,
          }),
          makeSubagentNotificationFrame({
            taskId: TASK_ID,
            toolUseId: TOOL_USE_ID,
            summary: FINAL_REPORT,
            uuid: "00000000-0000-4000-8000-000000000336",
          }),
        ];
        for (const frame of idleFrames) {
          yield* Queue.offer(harness.sdkMessages, frame);
        }
        yield* awaitUntil(() => harness.continuationRequests.length === 1, "continuation request");
        yield* Queue.offer(
          harness.sdkMessages,
          makeResultFrame({
            uuid: "00000000-0000-4000-8000-000000000337",
            result: "The idle auditor finished.",
          }),
        );
        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-idle-subagent-2"),
            text: "Background task completed.",
            attachments: [],
            providerTurnOrdinal: 2,
            messageCreatedBy: "agent",
            messageCreationSource: "provider",
          }),
        );
        yield* awaitUntil(() => harness.terminalEvents().length === 2, "continuation terminal");

        const routing = subagentRouting(harness.events, ["toolu-idle-bash"]);
        assert.isDefined(routing.childThreadId);
        assert.deepEqual(
          [...(routing.toolThreadIds.get("toolu-idle-bash") ?? [])],
          [routing.childThreadId],
        );
        assert.deepEqual(routing.assistantTexts(routing.childThreadId), [
          "Idle auditor working.",
          FINAL_REPORT,
        ]);
        assert.deepEqual(routing.assistantTexts(harness.threadId), [
          "Waiting in the background.",
          "The idle auditor finished.",
        ]);
        const finalSubagent = harness.events.findLast((event) => event.type === "subagent.updated");
        assert.equal(
          finalSubagent?.type === "subagent.updated" && finalSubagent.subagent.status,
          "completed",
        );
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );

  it.effect("streams a background subagent's work while the root turn is idle", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const TASK_ID = "task-live-idle";
        const TOOL_USE_ID = "toolu-live-idle";
        const STRADDLING_BASH = "toolu-live-straddling-bash";
        const IDLE_BASH = "toolu-live-idle-bash";
        const harness = yield* makeWakeHarness;
        const now = yield* DateTime.now;
        const latestToolItem = (nativeId: string) =>
          harness.events.findLast(
            (event) =>
              event.type === "turn_item.updated" &&
              event.turnItem.nativeItemRef?.nativeId === nativeId,
          );
        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-live-idle-1"),
            text: "Audit in the background.",
            attachments: [],
          }),
        );
        // The root settles while the subagent's first Bash call still runs.
        for (const frame of [
          makeSubagentTaskStartedFrame({
            taskId: TASK_ID,
            toolUseId: TOOL_USE_ID,
            uuid: "00000000-0000-4000-8000-000000000951",
          }),
          ...makeSubagentAssistantFrames({
            parentToolUseId: TOOL_USE_ID,
            uuid: "00000000-0000-4000-8000-000000000952",
            bashToolUseId: STRADDLING_BASH,
          }),
          makeResultFrame({
            uuid: "00000000-0000-4000-8000-000000000953",
            result: "Auditing in the background.",
          }),
        ]) {
          yield* Queue.offer(harness.sdkMessages, frame);
        }
        yield* awaitUntil(() => harness.terminalEvents().length === 1, "launch turn terminal");

        for (const frame of [
          makeSubagentToolResultFrame({
            parentToolUseId: TOOL_USE_ID,
            uuid: "00000000-0000-4000-8000-000000000954",
            toolUseId: STRADDLING_BASH,
          }),
          ...makeSubagentAssistantFrames({
            parentToolUseId: TOOL_USE_ID,
            uuid: "00000000-0000-4000-8000-000000000955",
            text: "Still auditing.",
            bashToolUseId: IDLE_BASH,
          }),
          claudeSdkFrame({
            type: "system",
            subtype: "task_progress",
            task_id: TASK_ID,
            description: "Reading the last commits",
            uuid: "00000000-0000-4000-8000-000000000956",
            session_id: WAKE_NATIVE_SESSION,
          }),
        ]) {
          yield* Queue.offer(harness.sdkMessages, frame);
        }
        // Before anything wakes the root, the idle work is already projected.
        yield* awaitUntil(() => {
          const event = latestToolItem(IDLE_BASH);
          return event?.type === "turn_item.updated" && event.turnItem.status === "running";
        }, "idle Bash call");
        yield* awaitUntil(
          () =>
            harness.events.some(
              (event) =>
                event.type === "subagent.updated" &&
                event.subagent.progress === "Reading the last commits",
            ),
          "idle progress",
        );
        const routing = subagentRouting(harness.events, [STRADDLING_BASH, IDLE_BASH]);
        assert.deepEqual(routing.assistantTexts(routing.childThreadId), ["Still auditing."]);
        // The call that spans the turn end keeps the type and input its
        // tool_use gave it during the open turn.
        const straddling = latestToolItem(STRADDLING_BASH);
        const straddlingItem =
          straddling?.type === "turn_item.updated" ? straddling.turnItem : undefined;
        assert.equal(straddlingItem?.status, "completed");
        assert.equal(
          straddlingItem?.type === "command_execution" ? straddlingItem.input : undefined,
          "git log -5",
        );
        assert.equal(harness.continuationRequests.length, 0);

        for (const frame of [
          makeSubagentToolResultFrame({
            parentToolUseId: TOOL_USE_ID,
            uuid: "00000000-0000-4000-8000-000000000957",
            toolUseId: IDLE_BASH,
          }),
          makeSubagentNotificationFrame({
            taskId: TASK_ID,
            toolUseId: TOOL_USE_ID,
            summary: "Still auditing.",
            uuid: "00000000-0000-4000-8000-000000000958",
          }),
        ]) {
          yield* Queue.offer(harness.sdkMessages, frame);
        }
        yield* awaitUntil(() => harness.continuationRequests.length === 1, "continuation request");
        yield* Queue.offer(
          harness.sdkMessages,
          makeResultFrame({
            uuid: "00000000-0000-4000-8000-000000000959",
            result: "The auditor finished.",
          }),
        );
        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-live-idle-2"),
            text: "Background task completed.",
            attachments: [],
            providerTurnOrdinal: 2,
            messageCreatedBy: "agent",
            messageCreationSource: "provider",
          }),
        );
        yield* awaitUntil(() => harness.terminalEvents().length === 2, "continuation terminal");

        const finalRouting = subagentRouting(harness.events, [STRADDLING_BASH, IDLE_BASH]);
        assert.deepEqual(finalRouting.assistantTexts(finalRouting.childThreadId), [
          "Still auditing.",
        ]);
        for (const nativeId of [STRADDLING_BASH, IDLE_BASH]) {
          assert.deepEqual(
            [...(finalRouting.toolThreadIds.get(nativeId) ?? [])],
            [finalRouting.childThreadId],
          );
          const statuses = harness.events.flatMap((event) =>
            event.type === "turn_item.updated" &&
            event.turnItem.nativeItemRef?.nativeId === nativeId
              ? [`${event.turnItem.type}:${event.turnItem.status}`]
              : [],
          );
          assert.deepEqual(statuses, ["command_execution:running", "command_execution:completed"]);
        }
        const finalSubagent = harness.events.findLast((event) => event.type === "subagent.updated");
        assert.equal(
          finalSubagent?.type === "subagent.updated" && finalSubagent.subagent.status,
          "completed",
        );
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );

  it.effect("keeps a nested subagent's launch in order while the root turn is idle", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const OUTER_TASK_ID = "task-idle-outer";
        const OUTER_TOOL_USE_ID = "toolu-idle-outer";
        const NESTED_TASK_ID = "task-idle-nested";
        const NESTED_TOOL_USE_ID = "toolu-idle-nested";
        const harness = yield* makeWakeHarness;
        const now = yield* DateTime.now;
        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-idle-nested-1"),
            text: "Audit in the background.",
            attachments: [],
          }),
        );
        for (const frame of [
          makeSubagentTaskStartedFrame({
            taskId: OUTER_TASK_ID,
            toolUseId: OUTER_TOOL_USE_ID,
            uuid: "00000000-0000-4000-8000-000000000971",
          }),
          makeResultFrame({
            uuid: "00000000-0000-4000-8000-000000000972",
            result: "Auditing in the background.",
          }),
        ]) {
          yield* Queue.offer(harness.sdkMessages, frame);
        }
        yield* awaitUntil(() => harness.terminalEvents().length === 1, "launch turn terminal");

        // While the root is idle, the subagent runs a nested one to completion.
        for (const frame of [
          claudeSdkFrame({
            type: "assistant",
            message: {
              model: "claude-sonnet-4-6",
              id: "msg_idle_nested_launch",
              type: "message",
              role: "assistant",
              content: [
                {
                  type: "tool_use",
                  id: NESTED_TOOL_USE_ID,
                  name: "Agent",
                  input: { description: "Nested check", prompt: "Reply with NESTED_OK" },
                },
              ],
            },
            parent_tool_use_id: OUTER_TOOL_USE_ID,
            uuid: "00000000-0000-4000-8000-000000000973",
            session_id: WAKE_NATIVE_SESSION,
          }),
          claudeSdkFrame({
            type: "system",
            subtype: "task_started",
            task_id: NESTED_TASK_ID,
            tool_use_id: NESTED_TOOL_USE_ID,
            description: "Nested check",
            subagent_type: "general-purpose",
            is_backgrounded: false,
            spawn_depth: 2,
            task_type: "local_agent",
            prompt: "Reply with NESTED_OK",
            uuid: "00000000-0000-4000-8000-000000000974",
            session_id: WAKE_NATIVE_SESSION,
          }),
          // The outer subagent's progress and own work don't wait for the
          // nested start.
          claudeSdkFrame({
            type: "system",
            subtype: "task_progress",
            task_id: OUTER_TASK_ID,
            description: "Waiting on the nested check",
            uuid: "00000000-0000-4000-8000-000000000984",
            session_id: WAKE_NATIVE_SESSION,
          }),
          ...makeSubagentAssistantFrames({
            parentToolUseId: OUTER_TOOL_USE_ID,
            uuid: "00000000-0000-4000-8000-000000000988",
            messageId: "msg_idle_outer_working",
            text: "OUTER_WORKING",
          }),
        ]) {
          yield* Queue.offer(harness.sdkMessages, frame);
        }
        yield* awaitUntil(
          () =>
            harness.events.some(
              (event) => event.type === "message.updated" && event.message.text === "OUTER_WORKING",
            ),
          "outer work while the nested start waits",
        );
        assert.lengthOf(harness.continuationRequests, 0);
        for (const frame of [
          ...makeSubagentAssistantFrames({
            parentToolUseId: NESTED_TOOL_USE_ID,
            uuid: "00000000-0000-4000-8000-000000000975",
            text: "NESTED_OK",
          }),
          makeSubagentNotificationFrame({
            taskId: NESTED_TASK_ID,
            toolUseId: NESTED_TOOL_USE_ID,
            summary: "NESTED_OK",
            uuid: "00000000-0000-4000-8000-000000000976",
          }),
          makeSubagentToolResultFrame({
            parentToolUseId: OUTER_TOOL_USE_ID,
            uuid: "00000000-0000-4000-8000-000000000977",
            toolUseId: NESTED_TOOL_USE_ID,
          }),
          ...makeSubagentAssistantFrames({
            parentToolUseId: OUTER_TOOL_USE_ID,
            uuid: "00000000-0000-4000-8000-000000000978",
            text: "OUTER_DONE",
          }),
          makeSubagentNotificationFrame({
            taskId: OUTER_TASK_ID,
            toolUseId: OUTER_TOOL_USE_ID,
            summary: "OUTER_DONE",
            uuid: "00000000-0000-4000-8000-000000000979",
          }),
        ]) {
          yield* Queue.offer(harness.sdkMessages, frame);
        }
        yield* awaitUntil(() => harness.continuationRequests.length === 1, "continuation request");
        yield* awaitUntil(
          () =>
            harness.events.some(
              (event) =>
                event.type === "subagent.updated" &&
                event.subagent.progress === "Waiting on the nested check",
            ),
          "outer progress",
        );
        yield* Queue.offer(
          harness.sdkMessages,
          makeResultFrame({
            uuid: "00000000-0000-4000-8000-000000000980",
            result: "The audit finished.",
          }),
        );
        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-idle-nested-2"),
            text: "Background task completed.",
            attachments: [],
            providerTurnOrdinal: 2,
            messageCreatedBy: "agent",
            messageCreationSource: "provider",
          }),
        );
        yield* awaitUntil(() => harness.terminalEvents().length === 2, "continuation terminal");

        // The nested Agent call is the nested subagent, never a plain tool row.
        assert.isFalse(
          harness.events.some(
            (event) =>
              event.type === "turn_item.updated" &&
              event.turnItem.nativeItemRef?.nativeId === NESTED_TOOL_USE_ID,
          ),
        );
        const finalSubagents = new Map(
          harness.events.flatMap((event) =>
            event.type === "subagent.updated"
              ? [[event.subagent.nativeTaskRef?.nativeId, event.subagent] as const]
              : [],
          ),
        );
        const outer = finalSubagents.get(OUTER_TASK_ID);
        const nested = finalSubagents.get(NESTED_TASK_ID);
        assert.equal(outer?.status, "completed");
        assert.equal(nested?.status, "completed");
        assert.equal(nested?.parentNodeId, outer?.id);
        assert.deepEqual(
          subagentRouting(harness.events, []).assistantTexts(outer?.childThreadId ?? undefined),
          ["OUTER_WORKING", "OUTER_DONE"],
        );
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );

  it.effect("ends an earlier turn's nested subagent while the root turn is idle", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const OUTER_TASK_ID = "task-earlier-outer";
        const OUTER_TOOL_USE_ID = "toolu-earlier-outer";
        const NESTED_TASK_ID = "task-earlier-nested";
        const NESTED_TOOL_USE_ID = "toolu-earlier-nested";
        const harness = yield* makeWakeHarness;
        const now = yield* DateTime.now;
        const userTurn = (attemptId: string, providerTurnOrdinal: number) =>
          harness.runtime.startTurn(
            makeClaudeTestTurnInput({
              threadId: harness.threadId,
              providerThread: harness.providerThread,
              now,
              attemptId: RunAttemptId.make(attemptId),
              text: "Keep auditing.",
              attachments: [],
              providerTurnOrdinal,
            }),
          );
        // Turn 1 launches the outer subagent, which starts a nested one.
        yield* userTurn("attempt-claude-earlier-nested-1", 1);
        for (const frame of [
          makeSubagentTaskStartedFrame({
            taskId: OUTER_TASK_ID,
            toolUseId: OUTER_TOOL_USE_ID,
            uuid: "00000000-0000-4000-8000-000000000a01",
          }),
          claudeSdkFrame({
            type: "assistant",
            message: {
              model: "claude-sonnet-4-6",
              id: "msg_earlier_nested_launch",
              type: "message",
              role: "assistant",
              content: [
                {
                  type: "tool_use",
                  id: NESTED_TOOL_USE_ID,
                  name: "Agent",
                  input: { description: "Nested check", prompt: "Reply with NESTED_OK" },
                },
              ],
            },
            parent_tool_use_id: OUTER_TOOL_USE_ID,
            uuid: "00000000-0000-4000-8000-000000000a02",
            session_id: WAKE_NATIVE_SESSION,
          }),
          claudeSdkFrame({
            type: "system",
            subtype: "task_started",
            task_id: NESTED_TASK_ID,
            tool_use_id: NESTED_TOOL_USE_ID,
            description: "Nested check",
            subagent_type: "general-purpose",
            is_backgrounded: false,
            spawn_depth: 2,
            task_type: "local_agent",
            prompt: "Reply with NESTED_OK",
            uuid: "00000000-0000-4000-8000-000000000a03",
            session_id: WAKE_NATIVE_SESSION,
          }),
          makeResultFrame({
            uuid: "00000000-0000-4000-8000-000000000a04",
            result: "Auditing in the background.",
          }),
        ]) {
          yield* Queue.offer(harness.sdkMessages, frame);
        }
        yield* awaitUntil(() => harness.terminalEvents().length === 1, "first turn terminal");
        // A later turn settles, so its context, which never saw the nested
        // launch, is the one the root's idle frames go through.
        yield* userTurn("attempt-claude-earlier-nested-2", 2);
        yield* Queue.offer(
          harness.sdkMessages,
          makeResultFrame({ uuid: "00000000-0000-4000-8000-000000000a05", result: "Still on it." }),
        );
        yield* awaitUntil(() => harness.terminalEvents().length === 2, "second turn terminal");

        // The nested subagent ends and its Agent call returns while the root
        // is idle. The outer subagent's next message marks when both are handled.
        for (const frame of [
          makeSubagentNotificationFrame({
            taskId: NESTED_TASK_ID,
            toolUseId: NESTED_TOOL_USE_ID,
            summary: "NESTED_OK",
            uuid: "00000000-0000-4000-8000-000000000a06",
          }),
          makeSubagentToolResultFrame({
            parentToolUseId: OUTER_TOOL_USE_ID,
            uuid: "00000000-0000-4000-8000-000000000a07",
            toolUseId: NESTED_TOOL_USE_ID,
          }),
          ...makeSubagentAssistantFrames({
            parentToolUseId: OUTER_TOOL_USE_ID,
            uuid: "00000000-0000-4000-8000-000000000a08",
            text: "OUTER_AFTER_NESTED",
          }),
        ]) {
          yield* Queue.offer(harness.sdkMessages, frame);
        }
        yield* awaitUntil(
          () =>
            harness.events.some(
              (event) =>
                event.type === "message.updated" && event.message.text === "OUTER_AFTER_NESTED",
            ),
          "outer work after the nested call returns",
        );

        // The nested Agent call is the nested subagent, never a plain tool row.
        assert.isFalse(
          harness.events.some(
            (event) =>
              event.type === "turn_item.updated" &&
              event.turnItem.nativeItemRef?.nativeId === NESTED_TOOL_USE_ID,
          ),
        );
        const nested = harness.events.findLast(
          (event) =>
            event.type === "subagent.updated" &&
            event.subagent.nativeTaskRef?.nativeId === NESTED_TASK_ID,
        );
        assert.equal(nested?.type === "subagent.updated" && nested.subagent.status, "completed");
        assert.lengthOf(harness.continuationRequests, 0);
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );

  it.effect("ends a subagent's open call when the CLI exits while the root turn is idle", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const TOOL_USE_ID = "toolu-idle-exit";
        const BASH = "toolu-idle-exit-bash";
        const harness = yield* makeWakeHarness;
        const now = yield* DateTime.now;
        const bashStatuses = () =>
          harness.events.flatMap((event) =>
            event.type === "turn_item.updated" && event.turnItem.nativeItemRef?.nativeId === BASH
              ? [`${event.turnItem.type}:${event.turnItem.status}`]
              : [],
          );
        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-idle-exit"),
            text: "Audit in the background.",
            attachments: [],
          }),
        );
        for (const frame of [
          makeSubagentTaskStartedFrame({
            taskId: "task-idle-exit",
            toolUseId: TOOL_USE_ID,
            uuid: "00000000-0000-4000-8000-000000000981",
          }),
          ...makeSubagentAssistantFrames({
            parentToolUseId: TOOL_USE_ID,
            uuid: "00000000-0000-4000-8000-000000000982",
            bashToolUseId: BASH,
          }),
          makeResultFrame({
            uuid: "00000000-0000-4000-8000-000000000983",
            result: "Auditing in the background.",
          }),
        ]) {
          yield* Queue.offer(harness.sdkMessages, frame);
        }
        yield* awaitUntil(() => harness.terminalEvents().length === 1, "launch turn terminal");
        assert.deepEqual(bashStatuses(), ["command_execution:running"]);

        // The CLI exits before the call returns; its result can never arrive.
        yield* Queue.shutdown(harness.sdkMessages);
        yield* awaitUntil(() => bashStatuses().length === 2, "call ended");
        assert.deepEqual(bashStatuses(), ["command_execution:running", "command_execution:failed"]);
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );

  it.effect("ends a subagent's open call when Stop's close of the CLI times out", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const TOOL_USE_ID = "toolu-idle-close-timeout";
        const BASH = "toolu-idle-close-timeout-bash";
        // close() leaves the stream open, so Stop gives up waiting for it.
        const harness = yield* makeWakeHarnessWithOptions();
        const now = yield* DateTime.now;
        const bashStatuses = () =>
          harness.events.flatMap((event) =>
            event.type === "turn_item.updated" && event.turnItem.nativeItemRef?.nativeId === BASH
              ? [`${event.turnItem.type}:${event.turnItem.status}`]
              : [],
          );
        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-idle-close-timeout"),
            text: "Audit in the background.",
            attachments: [],
          }),
        );
        for (const frame of [
          makeSubagentTaskStartedFrame({
            taskId: "task-idle-close-timeout",
            toolUseId: TOOL_USE_ID,
            uuid: "00000000-0000-4000-8000-000000000985",
          }),
          ...makeSubagentAssistantFrames({
            parentToolUseId: TOOL_USE_ID,
            uuid: "00000000-0000-4000-8000-000000000986",
            bashToolUseId: BASH,
          }),
          makeResultFrame({
            uuid: "00000000-0000-4000-8000-000000000987",
            result: "Auditing in the background.",
          }),
        ]) {
          yield* Queue.offer(harness.sdkMessages, frame);
        }
        yield* awaitUntil(() => harness.terminalEvents().length === 1, "launch turn terminal");
        assert.deepEqual(bashStatuses(), ["command_execution:running"]);

        const stop = yield* harness.runtime
          .interruptTurn({
            providerThread: harness.providerThread,
            providerTurnId: harness.terminalEvents()[0]!.providerTurnId,
            requestRuntimeRestart: true,
          })
          .pipe(Effect.forkScoped);
        yield* TestClock.adjust("10 seconds");
        yield* Fiber.join(stop);
        assert.deepEqual(bashStatuses(), [
          "command_execution:running",
          "command_execution:interrupted",
        ]);
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );

  it.effect.each(["before", "after"] as const)(
    "keeps a subagent call's result when the CLI exits before the drain (result %s the nested launch's)",
    (bashResultOrder) =>
      Effect.scoped(
        Effect.gen(function* () {
          const OUTER_TASK_ID = "task-exit-buffered-outer";
          const OUTER_TOOL_USE_ID = "toolu-exit-buffered-outer";
          const NESTED_TASK_ID = "task-exit-buffered-nested";
          const NESTED_TOOL_USE_ID = "toolu-exit-buffered-nested";
          const BASH = "toolu-exit-buffered-bash";
          const harness = yield* makeWakeHarnessWithOptions({ freshQueueOnReopen: true });
          const now = yield* DateTime.now;
          const bashItems = () =>
            harness.events.flatMap((event) =>
              event.type === "turn_item.updated" && event.turnItem.nativeItemRef?.nativeId === BASH
                ? [
                    `${event.turnItem.type}:${event.turnItem.status}:${JSON.stringify("input" in event.turnItem ? event.turnItem.input : null)}`,
                  ]
                : [],
            );
          yield* harness.runtime.startTurn(
            makeClaudeTestTurnInput({
              threadId: harness.threadId,
              providerThread: harness.providerThread,
              now,
              attemptId: RunAttemptId.make("attempt-claude-exit-buffered-1"),
              text: "Audit in the background.",
              attachments: [],
            }),
          );
          for (const frame of [
            makeSubagentTaskStartedFrame({
              taskId: OUTER_TASK_ID,
              toolUseId: OUTER_TOOL_USE_ID,
              uuid: "00000000-0000-4000-8000-000000001001",
            }),
            makeResultFrame({
              uuid: "00000000-0000-4000-8000-000000001002",
              result: "Auditing in the background.",
            }),
          ]) {
            yield* Queue.offer(harness.sdkMessages, frame);
          }
          yield* awaitUntil(() => harness.terminalEvents().length === 1, "launch turn terminal");

          // While the root is idle, the subagent starts Bash; it is projected at once.
          for (const frame of makeSubagentAssistantFrames({
            parentToolUseId: OUTER_TOOL_USE_ID,
            uuid: "00000000-0000-4000-8000-000000001003",
            bashToolUseId: BASH,
          })) {
            yield* Queue.offer(harness.sdkMessages, frame);
          }
          yield* awaitUntil(() => bashItems().length === 1, "idle Bash call");

          // A nested start buffers, and its launch result waits behind it. Bash's
          // successful result arrives before or after that launch result.
          const bashResultFrame = makeSubagentToolResultFrame({
            parentToolUseId: OUTER_TOOL_USE_ID,
            uuid: "00000000-0000-4000-8000-000000001006",
            toolUseId: BASH,
          });
          for (const frame of [
            claudeSdkFrame({
              type: "assistant",
              message: {
                model: "claude-sonnet-4-6",
                id: "msg_exit_buffered_nested_launch",
                type: "message",
                role: "assistant",
                content: [
                  {
                    type: "tool_use",
                    id: NESTED_TOOL_USE_ID,
                    name: "Agent",
                    input: { description: "Nested check", prompt: "Reply with NESTED_OK" },
                  },
                ],
              },
              parent_tool_use_id: OUTER_TOOL_USE_ID,
              uuid: "00000000-0000-4000-8000-000000001004",
              session_id: WAKE_NATIVE_SESSION,
            }),
            claudeSdkFrame({
              type: "system",
              subtype: "task_started",
              task_id: NESTED_TASK_ID,
              tool_use_id: NESTED_TOOL_USE_ID,
              description: "Nested check",
              subagent_type: "general-purpose",
              is_backgrounded: false,
              spawn_depth: 2,
              task_type: "local_agent",
              prompt: "Reply with NESTED_OK",
              uuid: "00000000-0000-4000-8000-000000001005",
              session_id: WAKE_NATIVE_SESSION,
            }),
            ...(bashResultOrder === "before" ? [bashResultFrame] : []),
            ...makeSubagentAssistantFrames({
              parentToolUseId: NESTED_TOOL_USE_ID,
              uuid: "00000000-0000-4000-8000-000000001007",
              text: "NESTED_OK",
            }),
            makeSubagentNotificationFrame({
              taskId: NESTED_TASK_ID,
              toolUseId: NESTED_TOOL_USE_ID,
              summary: "NESTED_OK",
              uuid: "00000000-0000-4000-8000-000000001008",
            }),
            makeSubagentToolResultFrame({
              parentToolUseId: OUTER_TOOL_USE_ID,
              uuid: "00000000-0000-4000-8000-000000001009",
              toolUseId: NESTED_TOOL_USE_ID,
            }),
            ...(bashResultOrder === "after" ? [bashResultFrame] : []),
            makeSubagentNotificationFrame({
              taskId: OUTER_TASK_ID,
              toolUseId: OUTER_TOOL_USE_ID,
              summary: "OUTER_DONE",
              uuid: "00000000-0000-4000-8000-000000001010",
            }),
          ]) {
            yield* Queue.offer(harness.sdkMessages, frame);
          }
          yield* awaitUntil(
            () => harness.continuationRequests.length === 1,
            "continuation request",
          );

          // The CLI exits before the continuation run drains the wake buffer.
          yield* Queue.shutdown(harness.sdkMessages);
          let quietYields = 0;
          yield* awaitUntil(() => quietYields++ >= 50, "query exit");
          yield* harness.runtime.startTurn(
            makeClaudeTestTurnInput({
              threadId: harness.threadId,
              providerThread: harness.providerThread,
              now,
              attemptId: RunAttemptId.make("attempt-claude-exit-buffered-2"),
              text: "Background task completed.",
              attachments: [],
              providerTurnOrdinal: 2,
              messageCreatedBy: "agent",
              messageCreationSource: "provider",
            }),
          );
          // The continuation opened a new CLI process: the first one's exit was handled.
          assert.equal(harness.processQueues.length, 2);
          yield* Queue.offer(
            harness.processQueues[1]!,
            makeResultFrame({
              uuid: "00000000-0000-4000-8000-000000001011",
              result: "The audit finished.",
            }),
          );
          yield* awaitUntil(() => harness.terminalEvents().length === 2, "continuation terminal");

          const input = JSON.stringify("git log -5");
          assert.deepEqual(bashItems(), [
            `command_execution:running:${input}`,
            `command_execution:completed:${input}`,
          ]);
        }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
      ),
  );

  it.effect(
    "ends a subagent's SendMessage with its result when the CLI exits while the resume waits",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const SENDER_TASK_ID = "task-exit-resume-sender";
          const SENDER_TOOL_USE_ID = "toolu-exit-resume-sender";
          const RESUMED_TASK_ID = "task-exit-resume-target";
          const RESUMED_TOOL_USE_ID = "toolu-exit-resume-target";
          const SEND = "toolu-exit-resume-sendmessage";
          const SEND_INPUT = { to: RESUMED_TASK_ID, message: "Check the last commit again." };
          const harness = yield* makeWakeHarnessWithOptions({ freshQueueOnReopen: true });
          const now = yield* DateTime.now;
          const sendItems = () =>
            harness.events.flatMap((event) =>
              event.type === "turn_item.updated" && event.turnItem.nativeItemRef?.nativeId === SEND
                ? [
                    `${event.turnItem.type}:${event.turnItem.status}:${JSON.stringify("input" in event.turnItem ? event.turnItem.input : null)}`,
                  ]
                : [],
            );
          yield* harness.runtime.startTurn(
            makeClaudeTestTurnInput({
              threadId: harness.threadId,
              providerThread: harness.providerThread,
              now,
              attemptId: RunAttemptId.make("attempt-claude-exit-resume-1"),
              text: "Run two auditors in the background.",
              attachments: [],
            }),
          );
          // The target subagent finishes inside the turn; the sender keeps running.
          for (const frame of [
            makeSubagentTaskStartedFrame({
              taskId: SENDER_TASK_ID,
              toolUseId: SENDER_TOOL_USE_ID,
              uuid: "00000000-0000-4000-8000-000000001101",
            }),
            makeSubagentTaskStartedFrame({
              taskId: RESUMED_TASK_ID,
              toolUseId: RESUMED_TOOL_USE_ID,
              uuid: "00000000-0000-4000-8000-000000001102",
            }),
            makeSubagentNotificationFrame({
              taskId: RESUMED_TASK_ID,
              toolUseId: RESUMED_TOOL_USE_ID,
              summary: "First answer.",
              uuid: "00000000-0000-4000-8000-000000001103",
            }),
            makeResultFrame({
              uuid: "00000000-0000-4000-8000-000000001104",
              result: "Auditing in the background.",
            }),
          ]) {
            yield* Queue.offer(harness.sdkMessages, frame);
          }
          yield* awaitUntil(() => harness.terminalEvents().length === 1, "launch turn terminal");

          // While the root is idle, the sender resumes the finished subagent.
          // Its SendMessage call is projected at once.
          yield* Queue.offer(
            harness.sdkMessages,
            claudeSdkFrame({
              type: "assistant",
              message: {
                model: "claude-sonnet-4-6",
                id: "msg_exit_resume_sendmessage",
                type: "message",
                role: "assistant",
                content: [{ type: "tool_use", id: SEND, name: "SendMessage", input: SEND_INPUT }],
              },
              parent_tool_use_id: SENDER_TOOL_USE_ID,
              uuid: "00000000-0000-4000-8000-000000001105",
              session_id: WAKE_NATIVE_SESSION,
            }),
          );
          yield* awaitUntil(() => sendItems().length >= 1, "idle SendMessage call");

          // The resume's task_started buffers. The SendMessage result names that
          // start's tool use, but its call already shows as a row, so it ends it.
          for (const frame of [
            claudeSdkFrame({
              type: "system",
              subtype: "task_started",
              task_id: RESUMED_TASK_ID,
              tool_use_id: SEND,
              description: "Audit recent commits",
              is_backgrounded: true,
              task_type: "local_agent",
              prompt: SEND_INPUT.message,
              uuid: "00000000-0000-4000-8000-000000001106",
              session_id: WAKE_NATIVE_SESSION,
            }),
            claudeSdkFrame({
              type: "user",
              message: {
                role: "user",
                content: [{ type: "tool_result", tool_use_id: SEND, content: "Message sent." }],
              },
              parent_tool_use_id: SENDER_TOOL_USE_ID,
              uuid: "00000000-0000-4000-8000-000000001107",
              session_id: WAKE_NATIVE_SESSION,
            }),
            makeSubagentNotificationFrame({
              taskId: RESUMED_TASK_ID,
              toolUseId: SEND,
              summary: "Second answer.",
              uuid: "00000000-0000-4000-8000-000000001108",
            }),
          ]) {
            yield* Queue.offer(harness.sdkMessages, frame);
          }
          yield* awaitUntil(
            () => harness.continuationRequests.length === 1,
            "continuation request",
          );
          const beforeExit = sendItems();

          // The CLI exits before the continuation run drains the wake buffer.
          yield* Queue.shutdown(harness.sdkMessages);
          let quietYields = 0;
          yield* awaitUntil(() => quietYields++ >= 50, "query exit");
          yield* harness.runtime.startTurn(
            makeClaudeTestTurnInput({
              threadId: harness.threadId,
              providerThread: harness.providerThread,
              now,
              attemptId: RunAttemptId.make("attempt-claude-exit-resume-2"),
              text: "Background task completed.",
              attachments: [],
              providerTurnOrdinal: 2,
              messageCreatedBy: "agent",
              messageCreationSource: "provider",
            }),
          );
          // The continuation opened a new CLI process: the first one's exit was handled.
          assert.equal(harness.processQueues.length, 2);
          yield* Queue.offer(
            harness.processQueues[1]!,
            makeResultFrame({
              uuid: "00000000-0000-4000-8000-000000001109",
              result: "The audit finished.",
            }),
          );
          yield* awaitUntil(() => harness.terminalEvents().length === 2, "continuation terminal");

          const input = JSON.stringify(SEND_INPUT);
          assert.deepEqual(beforeExit, [`dynamic_tool:running:${input}`]);
          assert.deepEqual(sendItems(), [
            `dynamic_tool:running:${input}`,
            `dynamic_tool:completed:${input}`,
          ]);
        }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
      ),
  );

  it.effect("releases held frames before the notification that first names the tool use", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const TASK_ID = "task-late-tool-use";
        const TOOL_USE_ID = "toolu-late-tool-use";
        const harness = yield* makeWakeHarness;
        const now = yield* DateTime.now;
        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-late-tool-use"),
            text: "Run an auditor.",
            attachments: [],
          }),
        );
        const frames = [
          claudeSdkFrame({
            type: "system",
            subtype: "task_started",
            task_id: TASK_ID,
            description: "Audit recent commits",
            task_type: "local_agent",
            prompt: "Audit the last five commits.",
            uuid: "00000000-0000-4000-8000-000000000341",
            session_id: WAKE_NATIVE_SESSION,
          }),
          // task_started carried no tool_use_id, so these frames are held
          // until the notification pairs the task with its tool use. The SDK
          // types tool_use_id as optional; no recorded or logged task_started
          // has omitted it, so this guards the typed contract only.
          ...makeSubagentAssistantFrames({
            parentToolUseId: TOOL_USE_ID,
            uuid: "00000000-0000-4000-8000-000000000342",
            text: "Working.",
          }),
          // The final answer arrives as one snapshot per text block.
          ...makeSubagentAssistantFrames({
            parentToolUseId: TOOL_USE_ID,
            uuid: "00000000-0000-4000-8000-000000000344",
            messageId: "msg_late_final",
            text: "Part one.",
          }),
          ...makeSubagentAssistantFrames({
            parentToolUseId: TOOL_USE_ID,
            uuid: "00000000-0000-4000-8000-000000000345",
            messageId: "msg_late_final",
            text: "Part two.",
          }),
          makeSubagentNotificationFrame({
            taskId: TASK_ID,
            toolUseId: TOOL_USE_ID,
            summary: "Part one.\n\nPart two.",
            uuid: "00000000-0000-4000-8000-000000000346",
          }),
          makeResultFrame({
            uuid: "00000000-0000-4000-8000-000000000347",
            result: "The auditor finished.",
          }),
        ];
        for (const frame of frames) {
          yield* Queue.offer(harness.sdkMessages, frame);
        }
        yield* awaitUntil(() => harness.terminalEvents().length === 1, "turn terminal");

        const routing = subagentRouting(harness.events, []);
        assert.deepEqual(routing.assistantTexts(routing.childThreadId), [
          "Working.",
          "Part one.",
          "Part two.",
        ]);
        assert.deepEqual(routing.assistantTexts(harness.threadId), ["The auditor finished."]);
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );

  it.effect.each([
    ["", "none"],
    [" behind another subagent's start without one", "before"],
    [" when another subagent's start without one arrives between its frames", "between"],
  ] as const)(
    "keeps a subagent's frames in order when a late progress names its tool use while the root is idle%s",
    ([, otherStart]) =>
      Effect.scoped(
        Effect.gen(function* () {
          const TASK_ID = "task-late-owner-idle";
          const TOOL_USE_ID = "toolu-late-owner-idle";
          const BASH = "toolu-late-owner-idle-bash";
          const harness = yield* makeWakeHarness;
          const now = yield* DateTime.now;
          const bashStatuses = () =>
            harness.events.flatMap((event) =>
              event.type === "turn_item.updated" && event.turnItem.nativeItemRef?.nativeId === BASH
                ? [`${event.turnItem.type}:${event.turnItem.status}`]
                : [],
            );
          yield* harness.runtime.startTurn(
            makeClaudeTestTurnInput({
              threadId: harness.threadId,
              providerThread: harness.providerThread,
              now,
              attemptId: RunAttemptId.make("attempt-claude-late-owner-idle-1"),
              text: "Audit in the background.",
              attachments: [],
            }),
          );
          // task_started without tool_use_id (optional in the SDK type), then
          // the root settles.
          for (const frame of [
            claudeSdkFrame({
              type: "system",
              subtype: "task_started",
              task_id: TASK_ID,
              description: "Audit recent commits",
              subagent_type: "general-purpose",
              is_backgrounded: true,
              task_type: "local_agent",
              prompt: "Audit the last five commits.",
              uuid: "00000000-0000-4000-8000-000000000a01",
              session_id: WAKE_NATIVE_SESSION,
            }),
            makeResultFrame({
              uuid: "00000000-0000-4000-8000-000000000a02",
              result: "Auditing in the background.",
            }),
          ]) {
            yield* Queue.offer(harness.sdkMessages, frame);
          }
          yield* awaitUntil(() => harness.terminalEvents().length === 1, "launch turn terminal");

          // Another subagent starts while the root is idle, also without a
          // tool_use_id, so its start waits in the wake buffer.
          const otherStartFrame = claudeSdkFrame({
            type: "system",
            subtype: "task_started",
            task_id: "task-late-owner-other",
            description: "Check the changelog",
            subagent_type: "general-purpose",
            is_backgrounded: true,
            task_type: "local_agent",
            prompt: "Check the changelog.",
            uuid: "00000000-0000-4000-8000-000000000a09",
            session_id: WAKE_NATIVE_SESSION,
          });
          const progressFrame = claudeSdkFrame({
            type: "system",
            subtype: "task_progress",
            task_id: TASK_ID,
            tool_use_id: TOOL_USE_ID,
            description: "Reading the last commits",
            usage: { total_tokens: 1, tool_uses: 1, duration_ms: 1 },
            uuid: "00000000-0000-4000-8000-000000000a04",
            session_id: WAKE_NATIVE_SESSION,
          });
          const bashResultFrame = makeSubagentToolResultFrame({
            parentToolUseId: TOOL_USE_ID,
            uuid: "00000000-0000-4000-8000-000000000a05",
            toolUseId: BASH,
          });
          // Root idle: the child's Bash call arrives before anything names the
          // owner's tool use; progress names it before or after the call returns.
          for (const frame of [
            ...(otherStart === "before" ? [otherStartFrame] : []),
            ...makeSubagentAssistantFrames({
              parentToolUseId: TOOL_USE_ID,
              uuid: "00000000-0000-4000-8000-000000000a03",
              text: "First.",
              bashToolUseId: BASH,
            }),
            ...(otherStart === "between"
              ? [otherStartFrame, bashResultFrame, progressFrame]
              : [progressFrame, bashResultFrame]),
            ...makeSubagentAssistantFrames({
              parentToolUseId: TOOL_USE_ID,
              uuid: "00000000-0000-4000-8000-000000000a06",
              text: "Second.",
            }),
            makeSubagentNotificationFrame({
              taskId: TASK_ID,
              toolUseId: TOOL_USE_ID,
              summary: "Second.",
              uuid: "00000000-0000-4000-8000-000000000a07",
            }),
          ]) {
            yield* Queue.offer(harness.sdkMessages, frame);
          }
          yield* awaitUntil(
            () => harness.continuationRequests.length === 1,
            "continuation request",
          );
          yield* Queue.offer(
            harness.sdkMessages,
            makeResultFrame({
              uuid: "00000000-0000-4000-8000-000000000a08",
              result: "The auditor finished.",
            }),
          );
          yield* harness.runtime.startTurn(
            makeClaudeTestTurnInput({
              threadId: harness.threadId,
              providerThread: harness.providerThread,
              now,
              attemptId: RunAttemptId.make("attempt-claude-late-owner-idle-2"),
              text: "Background task completed.",
              attachments: [],
              providerTurnOrdinal: 2,
              messageCreatedBy: "agent",
              messageCreationSource: "provider",
            }),
          );
          yield* awaitUntil(() => harness.terminalEvents().length === 2, "continuation terminal");

          const routing = subagentRouting(harness.events, [BASH]);
          const childTexts = routing.assistantTexts(routing.childThreadId);
          const statuses = bashStatuses();
          // Observed order of child texts and Bash item updates, for diagnosis.
          const trace = harness.events.flatMap((event) =>
            event.type === "message.updated" &&
            event.message.role === "assistant" &&
            event.message.threadId === routing.childThreadId
              ? [`text:${event.message.text}#${event.message.id}`]
              : event.type === "turn_item.updated" &&
                  event.turnItem.nativeItemRef?.nativeId === BASH
                ? [`bash:${event.turnItem.status}`]
                : [],
          );
          assert.deepEqual(childTexts, ["First.", "Second."], `trace: ${JSON.stringify(trace)}`);
          assert.deepEqual(
            [...(routing.toolThreadIds.get(BASH) ?? [])],
            [routing.childThreadId],
            `trace: ${JSON.stringify(trace)}`,
          );
          assert.deepEqual(
            statuses,
            ["command_execution:running", "command_execution:completed"],
            `trace: ${JSON.stringify(trace)}`,
          );
          // Progress that waited behind the subagent's frames still reaches its
          // card, and asks for no continuation of its own.
          assert.isTrue(
            harness.events.some(
              (event) =>
                event.type === "subagent.updated" &&
                event.subagent.progress === "Reading the last commits",
            ),
          );
          assert.lengthOf(harness.continuationRequests, 1);
        }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
      ),
  );

  it.effect("does not resolve a newer API retry when replaying a held subagent frame", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const TOOL_USE_ID = "toolu-retry-subagent";
        const harness = yield* makeWakeHarness;
        const now = yield* DateTime.now;
        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-retry-subagent"),
            text: "Run an auditor.",
            attachments: [],
          }),
        );
        const frames = [
          ...makeSubagentAssistantFrames({
            parentToolUseId: TOOL_USE_ID,
            uuid: "00000000-0000-4000-8000-000000000351",
            text: "Held before registration.",
          }),
          claudeSdkFrame({
            type: "system",
            subtype: "api_retry",
            attempt: 2,
            max_retries: 10,
            retry_delay_ms: 1_500,
            error_status: 529,
            error: "overloaded",
            uuid: "00000000-0000-4000-8000-000000000352",
            session_id: WAKE_NATIVE_SESSION,
          }),
          makeSubagentTaskStartedFrame({
            taskId: "task-retry-subagent",
            toolUseId: TOOL_USE_ID,
            uuid: "00000000-0000-4000-8000-000000000353",
          }),
        ];
        for (const frame of frames) {
          yield* Queue.offer(harness.sdkMessages, frame);
        }
        const childTexts = () => {
          const routing = subagentRouting(harness.events, []);
          return routing.childThreadId === undefined
            ? []
            : routing.assistantTexts(routing.childThreadId);
        };
        yield* awaitUntil(() => childTexts().length === 1, "replayed subagent text");
        const retryStatuses = harness.events.flatMap((event) =>
          event.type === "turn_item.updated" &&
          event.turnItem.type === "error" &&
          event.turnItem.retry !== undefined
            ? [event.turnItem.status]
            : [],
        );
        assert.deepEqual(retryStatuses, ["running"]);
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );

  it.effect("holds subagent frames that precede task_started and shows its result once", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const TASK_ID = "task-early-subagent";
        const TOOL_USE_ID = "toolu-early-subagent";
        const FINAL_REPORT = "Early auditor done.";
        const harness = yield* makeWakeHarness;
        const now = yield* DateTime.now;
        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-early-subagent"),
            text: "Run an auditor.",
            attachments: [],
          }),
        );
        const frames = [
          // The SDK can forward child frames before the task_started that
          // registers their subagent.
          ...makeSubagentAssistantFrames({
            parentToolUseId: TOOL_USE_ID,
            uuid: "00000000-0000-4000-8000-000000000321",
            text: "Starting early.",
            bashToolUseId: "toolu-early-bash",
          }),
          makeSubagentToolResultFrame({
            parentToolUseId: TOOL_USE_ID,
            uuid: "00000000-0000-4000-8000-000000000322",
            toolUseId: "toolu-early-bash",
          }),
          makeSubagentTaskStartedFrame({
            taskId: TASK_ID,
            toolUseId: TOOL_USE_ID,
            uuid: "00000000-0000-4000-8000-000000000323",
          }),
          ...makeSubagentAssistantFrames({
            parentToolUseId: TOOL_USE_ID,
            uuid: "00000000-0000-4000-8000-000000000324",
            text: "Still working.",
          }),
          // Progress without a tool_use_id replaces the subagent entry while
          // the per-turn tool-use alias still points at the previous one.
          claudeSdkFrame({
            type: "system",
            subtype: "task_progress",
            task_id: TASK_ID,
            description: "Checking the diffs",
            uuid: "00000000-0000-4000-8000-000000000325",
            session_id: WAKE_NATIVE_SESSION,
          }),
          ...makeSubagentAssistantFrames({
            parentToolUseId: TOOL_USE_ID,
            uuid: "00000000-0000-4000-8000-000000000326",
            text: FINAL_REPORT,
          }),
          makeSubagentNotificationFrame({
            taskId: TASK_ID,
            toolUseId: TOOL_USE_ID,
            summary: FINAL_REPORT,
            uuid: "00000000-0000-4000-8000-000000000327",
          }),
          makeResultFrame({
            uuid: "00000000-0000-4000-8000-000000000328",
            result: "The auditor finished.",
          }),
        ];
        for (const frame of frames) {
          yield* Queue.offer(harness.sdkMessages, frame);
        }
        yield* awaitUntil(() => harness.terminalEvents().length === 1, "turn terminal");

        const routing = subagentRouting(harness.events, ["toolu-early-bash"]);
        assert.isDefined(routing.childThreadId);
        assert.deepEqual(
          [...(routing.toolThreadIds.get("toolu-early-bash") ?? [])],
          [routing.childThreadId],
        );
        assert.deepEqual(routing.assistantTexts(routing.childThreadId), [
          "Starting early.",
          "Still working.",
          FINAL_REPORT,
        ]);
        assert.deepEqual(routing.assistantTexts(harness.threadId), ["The auditor finished."]);
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );

  it.effect.each(["requested", "observed-before", "observed-after", "inherit", "unknown"] as const)(
    "records the subagent model from %s without inheriting the parent override",
    (source) =>
      Effect.scoped(
        Effect.gen(function* () {
          const harness = yield* makeWakeHarness;
          const now = yield* DateTime.now;
          const toolUseId = "toolu-subagent-model";
          const parentModel = "claude-opus-4-6";
          const observedModel = "claude-haiku-4-5-20251001";
          yield* harness.runtime.startTurn(
            makeClaudeTestTurnInput({
              threadId: harness.threadId,
              providerThread: harness.providerThread,
              now,
              attemptId: RunAttemptId.make("attempt-subagent-model"),
              text: "Spawn a Haiku subagent.",
              attachments: [],
              modelSelection: { ...CLAUDE_TEST_MODEL_SELECTION, model: parentModel },
            }),
          );
          const observed = claudeSdkFrame({
            type: "assistant",
            parent_tool_use_id: toolUseId,
            message: {
              model: observedModel,
              id: "msg_subagent_model_observed",
              type: "message",
              role: "assistant",
              content: [{ type: "text", text: "Solving." }],
            },
            uuid: "00000000-0000-4000-8000-000000000206",
            session_id: WAKE_NATIVE_SESSION,
          });
          if (source === "observed-before") yield* Queue.offer(harness.sdkMessages, observed);
          yield* Queue.offer(
            harness.sdkMessages,
            claudeSdkFrame({
              type: "assistant",
              parent_tool_use_id: null,
              message: {
                model: parentModel,
                id: "msg_subagent_model_launch",
                type: "message",
                role: "assistant",
                content: [
                  {
                    type: "tool_use",
                    id: toolUseId,
                    name: "Agent",
                    input: {
                      description: "Haiku puzzle",
                      subagent_type: "general-purpose",
                      ...(source === "unknown"
                        ? {}
                        : { model: source === "inherit" ? "inherit" : "haiku" }),
                      prompt: "Solve the puzzle.",
                    },
                  },
                ],
              },
              uuid: "00000000-0000-4000-8000-000000000209",
              session_id: WAKE_NATIVE_SESSION,
            }),
          );
          yield* Queue.offer(
            harness.sdkMessages,
            claudeSdkFrame({
              type: "system",
              subtype: "task_started",
              task_id: "task-subagent-model",
              tool_use_id: toolUseId,
              description: "Haiku puzzle",
              task_type: "local_agent",
              uuid: "00000000-0000-4000-8000-000000000207",
              session_id: WAKE_NATIVE_SESSION,
            }),
          );
          if (source === "observed-after") yield* Queue.offer(harness.sdkMessages, observed);
          yield* Queue.offer(
            harness.sdkMessages,
            makeResultFrame({
              uuid: "00000000-0000-4000-8000-000000000208",
              result: "Spawned the subagent.",
            }),
          );
          yield* Queue.take(harness.terminalReceipts);
          const subagents = harness.events.filter((event) => event.type === "subagent.updated");
          const initialModel =
            source === "observed-before"
              ? observedModel
              : source === "inherit"
                ? parentModel
                : source === "unknown"
                  ? null
                  : "haiku";
          assert.equal(subagents[0]?.subagent.model, initialModel);
          assert.equal(
            subagents.at(-1)?.subagent.model,
            source.startsWith("observed") ? observedModel : initialModel,
          );
          const child = harness.events.find((event) => event.type === "app_thread.created");
          assert.equal(child?.appThread.modelSelection?.model, initialModel ?? parentModel);
        }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
      ),
  );

  it.effect("extracts text from direct content-block subagent results", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const SUBAGENT_TASK_ID = "task-direct-content-blocks";
        const SUBAGENT_TOOL_USE_ID = "toolu-direct-content-blocks";
        const harness = yield* makeWakeHarness;
        const now = yield* DateTime.now;
        const subagentEvents = () =>
          harness.events.filter(
            (event): event is Extract<ProviderAdapterV2Event, { type: "subagent.updated" }> =>
              event.type === "subagent.updated",
          );

        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-direct-content-blocks"),
            text: "Delegate this task.",
            attachments: [],
          }),
        );
        yield* Queue.offer(
          harness.sdkMessages,
          claudeSdkFrame({
            type: "system",
            subtype: "task_started",
            task_id: SUBAGENT_TASK_ID,
            tool_use_id: SUBAGENT_TOOL_USE_ID,
            description: "Delegated task",
            subagent_type: "general-purpose",
            task_type: "local_agent",
            prompt: "Return the result.",
            uuid: "00000000-0000-4000-8000-000000000206",
            session_id: WAKE_NATIVE_SESSION,
          }),
        );
        yield* awaitUntil(() => subagentEvents().length === 1, "subagent node created");

        yield* Queue.offer(
          harness.sdkMessages,
          claudeSdkFrame({
            type: "user",
            message: {
              role: "user",
              content: [
                {
                  type: "tool_result",
                  tool_use_id: SUBAGENT_TOOL_USE_ID,
                  content: [
                    { type: "text", text: "First line." },
                    { type: "text", text: "Second line." },
                  ],
                },
              ],
            },
            parent_tool_use_id: null,
            uuid: "00000000-0000-4000-8000-000000000207",
            session_id: WAKE_NATIVE_SESSION,
          }),
        );
        yield* awaitUntil(
          () => subagentEvents().at(-1)?.subagent.status === "completed",
          "subagent terminal",
        );

        assert.equal(subagentEvents().at(-1)?.subagent.result, "First line.\nSecond line.");

        yield* Queue.offer(
          harness.sdkMessages,
          makeResultFrame({
            uuid: "00000000-0000-4000-8000-000000000208",
            result: "Delegation completed.",
          }),
        );
        yield* awaitUntil(() => harness.terminalEvents().length === 1, "turn terminal");
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );

  it.effect("releases the idle pin when a post-settle subagent stops without completing", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const SUBAGENT_TASK_ID = "task-wake-subagent-stopped";
        const subagentTaskStarted = claudeSdkFrame({
          type: "system",
          subtype: "task_started",
          task_id: SUBAGENT_TASK_ID,
          tool_use_id: "toolu-wake-subagent-stopped",
          description: "Long-running research task",
          subagent_type: "general-purpose",
          task_type: "local_agent",
          prompt: "Investigate the flaky test.",
          uuid: "00000000-0000-4000-8000-000000000301",
          session_id: WAKE_NATIVE_SESSION,
        });
        const subagentStoppedNotification = claudeSdkFrame({
          type: "system",
          subtype: "task_notification",
          task_id: SUBAGENT_TASK_ID,
          tool_use_id: "toolu-wake-subagent-stopped",
          status: "stopped",
          output_file: "/tmp/task-wake-subagent-stopped.output",
          summary: "Agent was stopped before finishing.",
          uuid: "00000000-0000-4000-8000-000000000302",
          session_id: WAKE_NATIVE_SESSION,
        });

        const harness = yield* makeWakeHarness;
        const now = yield* DateTime.now;
        const subagentEvents = () =>
          harness.events.filter(
            (event): event is Extract<ProviderAdapterV2Event, { type: "subagent.updated" }> =>
              event.type === "subagent.updated",
          );

        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-wake-7a"),
            text: "Spawn a background subagent and stop.",
            attachments: [],
          }),
        );
        yield* Queue.offer(harness.sdkMessages, subagentTaskStarted);
        yield* awaitUntil(() => subagentEvents().length >= 1, "subagent node created");
        yield* Queue.offer(
          harness.sdkMessages,
          makeResultFrame({
            uuid: "00000000-0000-4000-8000-000000000303",
            result: "Spawned the subagent in the background.",
          }),
        );
        yield* awaitUntil(() => harness.terminalEvents().length === 1, "first turn terminal");
        assert.isTrue(yield* harness.hasPendingBackgroundWork);

        yield* Queue.offer(harness.sdkMessages, subagentStoppedNotification);
        yield* awaitUntil(() => harness.continuationRequests.length === 1, "continuation request");

        yield* Queue.offer(
          harness.sdkMessages,
          makeResultFrame({
            uuid: "00000000-0000-4000-8000-000000000304",
            result: "The subagent was stopped.",
          }),
        );
        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-wake-7b"),
            text: "Background task completed.",
            attachments: [],
            providerTurnOrdinal: 2,
            messageCreatedBy: "agent",
            messageCreationSource: "provider",
          }),
        );
        yield* awaitUntil(() => harness.terminalEvents().length === 2, "continuation terminal");

        assert.equal(subagentEvents().at(-1)?.subagent.status, "cancelled");
        assert.isFalse(yield* harness.hasPendingBackgroundWork);
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );

  it.effect("re-opens a resumed subagent whose task_started races past settle", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const SUBAGENT_TASK_ID = "task-resume-postsettle";
        const SUBAGENT_TOOL_USE_ID = "toolu-resume-postsettle";
        const RESUME_TOOL_USE_ID = "toolu-resume-postsettle-sendmessage";
        const FIRST_SUMMARY = "Answered early.";
        const SECOND_SUMMARY = "RESUME_SETTLE_DONE";
        const subagentTaskStarted = claudeSdkFrame({
          type: "system",
          subtype: "task_started",
          task_id: SUBAGENT_TASK_ID,
          tool_use_id: SUBAGENT_TOOL_USE_ID,
          description: "Sleep then echo done token",
          subagent_type: "general-purpose",
          task_type: "local_agent",
          prompt: "Run the shell command, then return exactly RESUME_SETTLE_DONE.",
          uuid: "00000000-0000-4000-8000-000000000501",
          session_id: WAKE_NATIVE_SESSION,
        });
        const firstNotification = claudeSdkFrame({
          type: "system",
          subtype: "task_notification",
          task_id: SUBAGENT_TASK_ID,
          tool_use_id: SUBAGENT_TOOL_USE_ID,
          status: "completed",
          output_file: "/tmp/task-resume-postsettle.output",
          summary: FIRST_SUMMARY,
          uuid: "00000000-0000-4000-8000-000000000502",
          session_id: WAKE_NATIVE_SESSION,
        });
        const resumeTaskStarted = claudeSdkFrame({
          type: "system",
          subtype: "task_started",
          task_id: SUBAGENT_TASK_ID,
          tool_use_id: RESUME_TOOL_USE_ID,
          description: "Sleep then echo done token",
          is_backgrounded: true,
          task_type: "local_agent",
          uuid: "00000000-0000-4000-8000-000000000505",
          session_id: WAKE_NATIVE_SESSION,
        });
        // As recorded in claude_background_subagent_lifecycle: the resumed
        // run's notification carries the SendMessage call's tool_use_id.
        const secondNotification = claudeSdkFrame({
          type: "system",
          subtype: "task_notification",
          task_id: SUBAGENT_TASK_ID,
          tool_use_id: RESUME_TOOL_USE_ID,
          status: "completed",
          output_file: "/tmp/task-resume-postsettle.output",
          summary: SECOND_SUMMARY,
          uuid: "00000000-0000-4000-8000-000000000506",
          session_id: WAKE_NATIVE_SESSION,
        });

        const harness = yield* makeWakeHarness;
        const now = yield* DateTime.now;
        const subagentEvents = () =>
          harness.events.filter(
            (event): event is Extract<ProviderAdapterV2Event, { type: "subagent.updated" }> =>
              event.type === "subagent.updated",
          );

        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-wake-9a"),
            text: "Spawn a background subagent and stop.",
            attachments: [],
          }),
        );
        yield* Queue.offer(harness.sdkMessages, subagentTaskStarted);
        yield* awaitUntil(() => subagentEvents().length >= 1, "subagent node created");
        yield* Queue.offer(
          harness.sdkMessages,
          makeResultFrame({
            uuid: "00000000-0000-4000-8000-000000000503",
            result: "Spawned the subagent in the background.",
          }),
        );
        yield* awaitUntil(() => harness.terminalEvents().length === 1, "first turn terminal");

        yield* Queue.offer(harness.sdkMessages, firstNotification);
        yield* awaitUntil(
          () => harness.continuationRequests.length === 1,
          "first continuation request",
        );
        yield* Queue.offer(
          harness.sdkMessages,
          makeResultFrame({
            uuid: "00000000-0000-4000-8000-000000000504",
            result: "The subagent answered early.",
          }),
        );
        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-wake-9b"),
            text: "Background task completed.",
            attachments: [],
            providerTurnOrdinal: 2,
            messageCreatedBy: "agent",
            messageCreationSource: "provider",
          }),
        );
        yield* awaitUntil(() => harness.terminalEvents().length === 2, "continuation terminal");
        assert.equal(subagentEvents().at(-1)?.subagent.status, "completed");
        assert.equal(subagentEvents().at(-1)?.subagent.result, FIRST_SUMMARY);
        assert.isFalse(yield* harness.hasPendingBackgroundWork);

        // The resume task_started races past settle: no turn is active, so it
        // must re-open the session registry entry (pinning idle again) and
        // buffer for replay. Its notification then counts as wake evidence
        // and carries the new summary as the continuation detail. The resume
        // rides on a SendMessage tool call whose frames race past settle too;
        // on drain replay the SendMessage tool_result is a delivery ACK and
        // must not terminalize the re-opened subagent.
        yield* Queue.offer(
          harness.sdkMessages,
          claudeSdkFrame({
            type: "assistant",
            message: {
              model: "claude-sonnet-4-6",
              id: "msg_resume_postsettle_sendmessage",
              type: "message",
              role: "assistant",
              content: [
                {
                  type: "tool_use",
                  id: RESUME_TOOL_USE_ID,
                  name: "SendMessage",
                  input: {
                    to: SUBAGENT_TASK_ID,
                    summary: "Resume the subagent",
                    message: "Continue and return the token.",
                  },
                },
              ],
            },
            parent_tool_use_id: null,
            uuid: "00000000-0000-4000-8000-000000000508",
            session_id: WAKE_NATIVE_SESSION,
          }),
        );
        yield* Queue.offer(harness.sdkMessages, resumeTaskStarted);
        // Shaped like the recorded SendMessage ACK in
        // claude_background_subagent_lifecycle: the text block is the JSON of
        // tool_use_result, and "message" names the agent's short id.
        const resumeAck = {
          success: true,
          message: `Resuming agent ${SUBAGENT_TASK_ID.slice(0, 7)}`,
          resumedAgentId: SUBAGENT_TASK_ID,
          pin: { id: SUBAGENT_TASK_ID, name: SUBAGENT_TASK_ID, ref: "42ab31" },
        };
        yield* Queue.offer(
          harness.sdkMessages,
          claudeSdkFrame({
            type: "user",
            message: {
              role: "user",
              content: [
                {
                  tool_use_id: RESUME_TOOL_USE_ID,
                  type: "tool_result",
                  content: [
                    {
                      type: "text",
                      text: encodeJsonString(resumeAck),
                    },
                  ],
                },
              ],
            },
            parent_tool_use_id: null,
            uuid: "00000000-0000-4000-8000-000000000509",
            session_id: WAKE_NATIVE_SESSION,
            tool_use_result: resumeAck,
          }),
        );
        // The resumed run's own work follows its task_started into the wake
        // buffer: nothing ingests the child thread until the drain.
        for (const frame of [
          ...makeSubagentAssistantFrames({
            parentToolUseId: SUBAGENT_TOOL_USE_ID,
            uuid: "00000000-0000-4000-8000-000000000961",
            text: "RESUMED_WORK",
            bashToolUseId: "toolu-resume-postsettle-bash",
          }),
          makeSubagentToolResultFrame({
            parentToolUseId: SUBAGENT_TOOL_USE_ID,
            uuid: "00000000-0000-4000-8000-000000000962",
            toolUseId: "toolu-resume-postsettle-bash",
          }),
        ]) {
          yield* Queue.offer(harness.sdkMessages, frame);
        }
        yield* Queue.offer(harness.sdkMessages, secondNotification);
        yield* awaitUntil(
          () => harness.continuationRequests.length === 2,
          "second continuation request",
        );
        assert.equal(harness.continuationRequests[1]?.detail, SECOND_SUMMARY);
        assert.isTrue(yield* harness.hasPendingBackgroundWork);

        yield* Queue.offer(
          harness.sdkMessages,
          makeResultFrame({
            uuid: "00000000-0000-4000-8000-000000000507",
            result: "The subagent finished with RESUME_SETTLE_DONE.",
          }),
        );
        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-wake-9c"),
            text: "Background task completed.",
            attachments: [],
            providerTurnOrdinal: 3,
            messageCreatedBy: "agent",
            messageCreationSource: "provider",
          }),
        );
        yield* awaitUntil(
          () => harness.terminalEvents().length === 3,
          "resume continuation terminal",
        );

        // The drained replay re-opens the row (running, stale result cleared)
        // before the second notification terminalizes it again.
        const statuses = subagentEvents().map((event) => event.subagent.status);
        const firstCompleted = statuses.indexOf("completed");
        const reopenedIndex = statuses.lastIndexOf("running");
        assert.isAbove(reopenedIndex, firstCompleted);
        assert.isNull(subagentEvents()[reopenedIndex]?.subagent.result);
        // The drain-replayed reopen re-attributes the subagent to the
        // continuation run performing the replay, so that run's ingestion
        // fiber routes the resumed lifecycle and lingers past settle until
        // the resumed task completes.
        assert.equal(subagentEvents()[reopenedIndex]?.subagent.runId, "run-attempt-claude-wake-9c");
        // The execution node re-opens too, even though the registry entry was
        // already pre-opened by the wake buffer before the drain replay.
        const nodeStatuses = harness.events
          .filter(
            (event): event is Extract<ProviderAdapterV2Event, { type: "node.updated" }> =>
              event.type === "node.updated" &&
              event.node.kind === "subagent" &&
              event.node.nativeItemRef?.nativeId === SUBAGENT_TASK_ID,
          )
          .map((event) => event.node.status);
        assert.isAbove(nodeStatuses.lastIndexOf("running"), nodeStatuses.indexOf("completed"));
        const finalSubagent = subagentEvents().at(-1)?.subagent;
        assert.equal(finalSubagent?.status, "completed");
        assert.equal(finalSubagent?.result, SECOND_SUMMARY);
        // The completion keeps the resuming run's attribution.
        assert.equal(finalSubagent?.runId, "run-attempt-claude-wake-9c");
        // Its work is projected once, by the drain that re-opens it.
        const reopenIndex = harness.events.findIndex(
          (event) =>
            event.type === "subagent.updated" &&
            event.subagent.status === "running" &&
            event.subagent.runId === "run-attempt-claude-wake-9c",
        );
        assert.isAtLeast(reopenIndex, 0);
        const resumedWorkIndexes = harness.events.flatMap((event, index) =>
          event.type === "message.updated" && event.message.text === "RESUMED_WORK" ? [index] : [],
        );
        assert.lengthOf(resumedWorkIndexes, 1);
        assert.isAbove(resumedWorkIndexes[0] ?? -1, reopenIndex);
        assert.isFalse(yield* harness.hasPendingBackgroundWork);
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );

  it.effect("resets Waiting roster and wake eligibility when the CLI process is replaced", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const idAllocator = yield* IdAllocator.IdAllocatorV2;
        const attachmentsDir = yield* fileSystem.makeTempDirectoryScoped({
          prefix: "control-claude-v2-process-reset-",
        });
        const processQueues: Array<Queue.Queue<SDKMessage>> = [];
        const events: Array<ProviderAdapterV2Event> = [];
        const continuationRequests: Array<ProviderContinuationRequest> = [];
        const adapter = ClaudeAdapterV2.makeClaudeAdapterV2({
          instanceId: ClaudeAdapterV2.CLAUDE_DEFAULT_INSTANCE_ID,
          settings: DEFAULT_CLAUDE_SETTINGS,
          environment: {},
          attachmentsDir,
          fileSystem,
          path: yield* Path.Path,
          crypto: yield* Crypto.Crypto,
          idAllocator,
          continuationRequests: {
            offer: (request) =>
              Effect.sync(() => {
                continuationRequests.push(request);
              }),
          },
          queryRunner: {
            allocateSessionId: Effect.succeed(WAKE_NATIVE_SESSION),
            open: () =>
              Effect.gen(function* () {
                const sdkMessages = yield* Queue.unbounded<SDKMessage>();
                processQueues.push(sdkMessages);
                return {
                  messages: Stream.fromQueue(sdkMessages),
                  offer: () => Effect.void,
                  setModel: () => Effect.void,
                  setPermissionMode: () => Effect.void,
                  backgroundTasks: () => Effect.succeed(false),
                  interrupt: Effect.void,
                  // End this process stream so openQuery can replace it.
                  close: Queue.shutdown(sdkMessages),
                };
              }),
            forkSession: () => Effect.die("unused forkSession"),
            subagentLaunchToolUseId: () => Effect.succeed(null),
            assertComplete: Effect.void,
          },
        });
        const threadId = ThreadId.make("thread-claude-process-reset");
        const runtime = yield* adapter.openSession({
          threadId,
          providerSessionId: ProviderSessionId.make("provider-session-claude-process-reset"),
          modelSelection: CLAUDE_TEST_MODEL_SELECTION,
          runtimePolicy: CLAUDE_TEST_RUNTIME_POLICY,
        });
        const providerThread = yield* runtime.ensureThread({
          threadId,
          modelSelection: CLAUDE_TEST_MODEL_SELECTION,
          runtimePolicy: CLAUDE_TEST_RUNTIME_POLICY,
        });
        yield* runtime.events.pipe(
          Stream.runForEach((event) =>
            Effect.sync(() => {
              events.push(event);
            }),
          ),
          Effect.forkScoped,
        );
        if (runtime.hasPendingBackgroundWork === undefined) {
          return yield* Effect.die("Claude adapter runtime must expose hasPendingBackgroundWork.");
        }
        const hasPendingBackgroundWork = runtime.hasPendingBackgroundWork;
        const now = yield* DateTime.now;

        yield* runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId,
            providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-process-reset-a"),
            text: "Run the build in the background.",
            attachments: [],
          }),
        );
        assert.equal(processQueues.length, 1);
        const firstProcess = processQueues[0]!;
        yield* Queue.offer(firstProcess, wakeTaskStarted);
        // The shell leaves the roster before its notification arrives, so
        // nothing runs in this process any more and a model change may
        // replace it. Wake eligibility outlives the empty level.
        yield* Queue.offer(
          firstProcess,
          claudeSdkFrame({
            type: "system",
            subtype: "background_tasks_changed",
            tasks: [],
            uuid: "00000000-0000-4000-8000-000000000603",
            session_id: WAKE_NATIVE_SESSION,
          }),
        );
        yield* Queue.offer(firstProcess, turnOneResult);
        yield* awaitUntil(
          () => events.some((event) => event.type === "turn.terminal"),
          "first turn terminal",
        );
        assert.isFalse(yield* hasPendingBackgroundWork);

        const alternateModel = {
          ...CLAUDE_TEST_MODEL_SELECTION,
          model: "claude-haiku-4-5-20251001",
        } satisfies ModelSelection;
        // ProviderTurnStartService marks the thread active before startTurn;
        // the process-reset clear must preserve that status.
        const activeProviderThread = {
          ...providerThread,
          status: "active" as const,
        } satisfies OrchestrationV2ProviderThread;
        yield* runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId,
            providerThread: activeProviderThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-process-reset-b"),
            text: "Continue after process restart.",
            attachments: [],
            providerTurnOrdinal: 2,
            modelSelection: alternateModel,
          }),
        );
        assert.equal(processQueues.length, 2);

        // Process-scoped level resets to empty on CLI (re)start while the
        // starting turn's provider thread remains active (not idle).
        yield* awaitUntil(
          () =>
            providerThreadRosterEvents(events).some(
              (event) =>
                event.providerThread.status === "active" &&
                (event.providerThread.pendingBackgroundTasks?.length ?? 0) === 0 &&
                // Prefer the post-replace clear over the initial empty thread.
                event.providerThread.updatedAt !== undefined,
            ),
          "roster cleared on process replace while remaining active",
        );
        // After replace, the in-memory Waiting probe must be false even if a
        // late empty-level event was already present before background work.
        assert.isFalse(yield* hasPendingBackgroundWork);
        const emptyActiveRosterEvents = providerThreadRosterEvents(events).filter(
          (event) =>
            event.providerThread.status === "active" &&
            (event.providerThread.pendingBackgroundTasks?.length ?? 0) === 0,
        );
        assert.isAtLeast(emptyActiveRosterEvents.length, 1);
        assert.deepEqual(
          emptyActiveRosterEvents.at(-1)?.providerThread.pendingBackgroundTasks ?? [],
          [],
        );
        assert.equal(emptyActiveRosterEvents.at(-1)?.providerThread.status, "active");

        // A late notification from the previous process must not wake after
        // eligibility was reset with the process. Offer on the new process
        // stream (the old queue is shut down).
        const secondProcess = processQueues[1]!;
        yield* Queue.offer(secondProcess, wakeNotification);
        let settleYields = 0;
        yield* awaitUntil(() => settleYields++ >= 50, "stale notification settle");
        assert.lengthOf(continuationRequests, 0);

        yield* Queue.offer(
          secondProcess,
          makeResultFrame({
            uuid: "00000000-0000-4000-8000-000000000602",
            result: "Process restart turn finished.",
          }),
        );
        yield* awaitUntil(
          () => events.filter((event) => event.type === "turn.terminal").length === 2,
          "second turn terminal",
        );
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );

  it.effect(
    "preserves buffered local_bash notification classification across model/policy query replacement",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fileSystem = yield* FileSystem.FileSystem;
          const idAllocator = yield* IdAllocator.IdAllocatorV2;
          const attachmentsDir = yield* fileSystem.makeTempDirectoryScoped({
            prefix: "control-claude-v2-buffer-replace-",
          });
          const processQueues: Array<Queue.Queue<SDKMessage>> = [];
          const events: Array<ProviderAdapterV2Event> = [];
          const continuationRequests: Array<ProviderContinuationRequest> = [];
          const adapter = ClaudeAdapterV2.makeClaudeAdapterV2({
            instanceId: ClaudeAdapterV2.CLAUDE_DEFAULT_INSTANCE_ID,
            settings: DEFAULT_CLAUDE_SETTINGS,
            environment: {},
            attachmentsDir,
            fileSystem,
            path: yield* Path.Path,
            crypto: yield* Crypto.Crypto,
            idAllocator,
            continuationRequests: {
              offer: (request) =>
                Effect.sync(() => {
                  continuationRequests.push(request);
                }),
            },
            queryRunner: {
              allocateSessionId: Effect.succeed(WAKE_NATIVE_SESSION),
              open: () =>
                Effect.gen(function* () {
                  const sdkMessages = yield* Queue.unbounded<SDKMessage>();
                  processQueues.push(sdkMessages);
                  return {
                    messages: Stream.fromQueue(sdkMessages),
                    offer: () => Effect.void,
                    setModel: () => Effect.void,
                    setPermissionMode: () => Effect.void,
                    backgroundTasks: () => Effect.succeed(false),
                    interrupt: Effect.void,
                    close: Queue.shutdown(sdkMessages),
                  };
                }),
              forkSession: () => Effect.die("unused forkSession"),
              subagentLaunchToolUseId: () => Effect.succeed(null),
              assertComplete: Effect.void,
            },
          });
          const threadId = ThreadId.make("thread-claude-buffer-replace");
          const runtime = yield* adapter.openSession({
            threadId,
            providerSessionId: ProviderSessionId.make("provider-session-claude-buffer-replace"),
            modelSelection: CLAUDE_TEST_MODEL_SELECTION,
            runtimePolicy: CLAUDE_TEST_RUNTIME_POLICY,
          });
          const providerThread = yield* runtime.ensureThread({
            threadId,
            modelSelection: CLAUDE_TEST_MODEL_SELECTION,
            runtimePolicy: CLAUDE_TEST_RUNTIME_POLICY,
          });
          yield* runtime.events.pipe(
            Stream.runForEach((event) =>
              Effect.sync(() => {
                events.push(event);
              }),
            ),
            Effect.forkScoped,
          );
          if (runtime.hasPendingBackgroundWork === undefined) {
            return yield* Effect.die(
              "Claude adapter runtime must expose hasPendingBackgroundWork.",
            );
          }
          const hasPendingBackgroundWork = runtime.hasPendingBackgroundWork;
          const now = yield* DateTime.now;

          yield* runtime.startTurn(
            makeClaudeTestTurnInput({
              threadId,
              providerThread,
              now,
              attemptId: RunAttemptId.make("attempt-claude-buffer-replace-a"),
              text: "Run the build in the background.",
              attachments: [],
            }),
          );
          assert.equal(processQueues.length, 1);
          const firstProcess = processQueues[0]!;
          yield* Queue.offer(firstProcess, wakeTaskStarted);
          yield* Queue.offer(firstProcess, turnOneResult);
          yield* awaitUntil(
            () => events.some((event) => event.type === "turn.terminal"),
            "first turn terminal",
          );
          assert.isTrue(yield* hasPendingBackgroundWork);

          // Idle completion notification buffers before any continuation runs.
          yield* Queue.offer(firstProcess, wakeNotification);
          let quietYields = 0;
          yield* awaitUntil(() => quietYields++ >= 50, "notification-only quiet window");
          assert.lengthOf(continuationRequests, 0);

          // User turn changes model, replacing the query while the wake buffer
          // stays queued for the later provider continuation.
          const alternateModel = {
            ...CLAUDE_TEST_MODEL_SELECTION,
            model: "claude-haiku-4-5-20251001",
          } satisfies ModelSelection;
          yield* runtime.startTurn(
            makeClaudeTestTurnInput({
              threadId,
              providerThread: { ...providerThread, status: "active" },
              now,
              attemptId: RunAttemptId.make("attempt-claude-buffer-replace-user"),
              text: "Switch model while background work completes.",
              attachments: [],
              providerTurnOrdinal: 2,
              modelSelection: alternateModel,
            }),
          );
          assert.equal(processQueues.length, 2);
          const secondProcess = processQueues[1]!;
          yield* Queue.offer(
            secondProcess,
            makeResultFrame({
              uuid: "00000000-0000-4000-8000-000000000701",
              result: "User turn finished after model switch.",
            }),
          );
          yield* awaitUntil(
            () => events.filter((event) => event.type === "turn.terminal").length === 2,
            "user turn terminal after replace",
          );
          // The terminal notification remains buffered for classification, but
          // notification-only traffic no longer pins pending work.
          assert.isFalse(yield* hasPendingBackgroundWork);
          assert.lengthOf(continuationRequests, 0);

          // Continuation drains the buffered local_bash notification with no
          // fabricated subagent/node and attributes the wake result text.
          yield* Queue.offer(secondProcess, wakeResult);
          yield* awaitUntil(() => continuationRequests.length === 1, "continuation after result");
          assert.equal(continuationRequests[0]?.detail, WAKE_SUMMARY);
          yield* runtime.startTurn(
            makeClaudeTestTurnInput({
              threadId,
              providerThread: { ...providerThread, status: "active" },
              now,
              attemptId: RunAttemptId.make("attempt-claude-buffer-replace-cont"),
              text: "Background task completed.",
              attachments: [],
              providerTurnOrdinal: 3,
              modelSelection: alternateModel,
              messageCreatedBy: "agent",
              messageCreationSource: "provider",
            }),
          );
          yield* awaitUntil(
            () => events.filter((event) => event.type === "turn.terminal").length === 3,
            "continuation terminal after buffered drain",
          );
          assert.isTrue(
            events.some(
              (event) =>
                event.type === "message.updated" && event.message.text === WAKE_RESULT_TEXT,
            ),
          );
          assert.isFalse(
            events.some(
              (event) =>
                event.type === "subagent.updated" ||
                (event.type === "node.updated" && event.node.kind === "subagent"),
            ),
          );
          // Must not re-project the opaque task id as anything but roster history.
          assert.isFalse(
            events.some(
              (event) =>
                event.type !== "provider_thread.updated" &&
                JSON.stringify(event).includes(WAKE_TASK_ID),
            ),
          );
          assert.isFalse(yield* hasPendingBackgroundWork);
        }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
      ),
  );

  it.effect(
    "does not opaque-misclassify a buffered subagent notification across model/policy query replacement",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const SUBAGENT_TASK_ID = "task-buffer-replace-subagent";
          const SUBAGENT_TOOL_USE_ID = "toolu-buffer-replace-subagent";
          const SUBAGENT_SUMMARY = "SUB_BUFFER_REPLACE_DONE";
          const subagentTaskStarted = claudeSdkFrame({
            type: "system",
            subtype: "task_started",
            task_id: SUBAGENT_TASK_ID,
            tool_use_id: SUBAGENT_TOOL_USE_ID,
            description: "Background research",
            subagent_type: "general-purpose",
            task_type: "local_agent",
            prompt: "Research then return SUB_BUFFER_REPLACE_DONE.",
            uuid: "00000000-0000-4000-8000-000000000801",
            session_id: WAKE_NATIVE_SESSION,
          });
          const subagentNotification = claudeSdkFrame({
            type: "system",
            subtype: "task_notification",
            task_id: SUBAGENT_TASK_ID,
            tool_use_id: SUBAGENT_TOOL_USE_ID,
            status: "completed",
            output_file: "/tmp/task-buffer-replace-subagent.output",
            summary: SUBAGENT_SUMMARY,
            uuid: "00000000-0000-4000-8000-000000000802",
            session_id: WAKE_NATIVE_SESSION,
          });
          const subagentAsyncAck = claudeSdkFrame({
            type: "user",
            message: {
              role: "user",
              content: [
                {
                  type: "tool_result",
                  tool_use_id: SUBAGENT_TOOL_USE_ID,
                  content: [{ type: "text", text: "Async agent launched successfully." }],
                },
              ],
            },
            parent_tool_use_id: null,
            uuid: "00000000-0000-4000-8000-000000000803",
            session_id: WAKE_NATIVE_SESSION,
            tool_use_result: {
              isAsync: true,
              status: "async_launched",
              agentId: SUBAGENT_TASK_ID,
              prompt: "Research then return SUB_BUFFER_REPLACE_DONE.",
            },
          });

          const fileSystem = yield* FileSystem.FileSystem;
          const idAllocator = yield* IdAllocator.IdAllocatorV2;
          const attachmentsDir = yield* fileSystem.makeTempDirectoryScoped({
            prefix: "control-claude-v2-subagent-buffer-replace-",
          });
          const processQueues: Array<Queue.Queue<SDKMessage>> = [];
          const events: Array<ProviderAdapterV2Event> = [];
          const continuationRequests: Array<ProviderContinuationRequest> = [];
          const adapter = ClaudeAdapterV2.makeClaudeAdapterV2({
            instanceId: ClaudeAdapterV2.CLAUDE_DEFAULT_INSTANCE_ID,
            settings: DEFAULT_CLAUDE_SETTINGS,
            environment: {},
            attachmentsDir,
            fileSystem,
            path: yield* Path.Path,
            crypto: yield* Crypto.Crypto,
            idAllocator,
            continuationRequests: {
              offer: (request) =>
                Effect.sync(() => {
                  continuationRequests.push(request);
                }),
            },
            queryRunner: {
              allocateSessionId: Effect.succeed(WAKE_NATIVE_SESSION),
              open: () =>
                Effect.gen(function* () {
                  const sdkMessages = yield* Queue.unbounded<SDKMessage>();
                  processQueues.push(sdkMessages);
                  return {
                    messages: Stream.fromQueue(sdkMessages),
                    offer: () => Effect.void,
                    setModel: () => Effect.void,
                    setPermissionMode: () => Effect.void,
                    backgroundTasks: () => Effect.succeed(false),
                    interrupt: Effect.void,
                    close: Queue.shutdown(sdkMessages),
                  };
                }),
              forkSession: () => Effect.die("unused forkSession"),
              subagentLaunchToolUseId: () => Effect.succeed(null),
              assertComplete: Effect.void,
            },
          });
          const threadId = ThreadId.make("thread-claude-subagent-buffer-replace");
          const runtime = yield* adapter.openSession({
            threadId,
            providerSessionId: ProviderSessionId.make(
              "provider-session-claude-subagent-buffer-replace",
            ),
            modelSelection: CLAUDE_TEST_MODEL_SELECTION,
            runtimePolicy: CLAUDE_TEST_RUNTIME_POLICY,
          });
          const providerThread = yield* runtime.ensureThread({
            threadId,
            modelSelection: CLAUDE_TEST_MODEL_SELECTION,
            runtimePolicy: CLAUDE_TEST_RUNTIME_POLICY,
          });
          yield* runtime.events.pipe(
            Stream.runForEach((event) =>
              Effect.sync(() => {
                events.push(event);
              }),
            ),
            Effect.forkScoped,
          );
          if (runtime.hasPendingBackgroundWork === undefined) {
            return yield* Effect.die(
              "Claude adapter runtime must expose hasPendingBackgroundWork.",
            );
          }
          const hasPendingBackgroundWork = runtime.hasPendingBackgroundWork;
          const subagentEvents = () =>
            events.filter(
              (event): event is Extract<ProviderAdapterV2Event, { type: "subagent.updated" }> =>
                event.type === "subagent.updated",
            );
          const now = yield* DateTime.now;

          yield* runtime.startTurn(
            makeClaudeTestTurnInput({
              threadId,
              providerThread,
              now,
              attemptId: RunAttemptId.make("attempt-claude-subagent-buffer-replace-a"),
              text: "Spawn a background subagent and stop.",
              attachments: [],
            }),
          );
          assert.equal(processQueues.length, 1);
          const firstProcess = processQueues[0]!;
          yield* Queue.offer(firstProcess, subagentTaskStarted);
          yield* awaitUntil(() => subagentEvents().length >= 1, "subagent node created");
          assert.equal(subagentEvents()[0]?.subagent.status, "running");
          yield* Queue.offer(firstProcess, subagentAsyncAck);
          yield* Queue.offer(
            firstProcess,
            makeResultFrame({
              uuid: "00000000-0000-4000-8000-000000000804",
              result: "Spawned the subagent in the background.",
            }),
          );
          yield* awaitUntil(
            () => events.some((event) => event.type === "turn.terminal"),
            "first turn terminal",
          );
          assert.isTrue(yield* hasPendingBackgroundWork);

          // Session-registered subagent completion buffers; no opaque tombstone.
          yield* Queue.offer(firstProcess, subagentNotification);
          yield* awaitUntil(() => continuationRequests.length === 1, "continuation after notify");
          assert.equal(continuationRequests[0]?.detail, SUBAGENT_SUMMARY);

          // Model-changing user turn replaces the query while continuation stays
          // queued. Process reset must not invent opaque classification for the
          // buffered subagent notification.
          const alternateModel = {
            ...CLAUDE_TEST_MODEL_SELECTION,
            model: "claude-haiku-4-5-20251001",
          } satisfies ModelSelection;
          yield* runtime.startTurn(
            makeClaudeTestTurnInput({
              threadId,
              providerThread: { ...providerThread, status: "active" },
              now,
              attemptId: RunAttemptId.make("attempt-claude-subagent-buffer-replace-user"),
              text: "Switch model while the subagent completes.",
              attachments: [],
              providerTurnOrdinal: 2,
              modelSelection: alternateModel,
            }),
          );
          assert.equal(processQueues.length, 2);
          const secondProcess = processQueues[1]!;
          yield* Queue.offer(
            secondProcess,
            makeResultFrame({
              uuid: "00000000-0000-4000-8000-000000000805",
              result: "User turn finished after model switch.",
            }),
          );
          yield* awaitUntil(
            () => events.filter((event) => event.type === "turn.terminal").length === 2,
            "user turn terminal after replace",
          );
          assert.isTrue(yield* hasPendingBackgroundWork);
          assert.lengthOf(continuationRequests, 1);

          yield* Queue.offer(
            secondProcess,
            makeResultFrame({
              uuid: "00000000-0000-4000-8000-000000000806",
              result: "The subagent finished with SUB_BUFFER_REPLACE_DONE.",
            }),
          );
          yield* runtime.startTurn(
            makeClaudeTestTurnInput({
              threadId,
              providerThread: { ...providerThread, status: "active" },
              now,
              attemptId: RunAttemptId.make("attempt-claude-subagent-buffer-replace-cont"),
              text: "Background task completed.",
              attachments: [],
              providerTurnOrdinal: 3,
              modelSelection: alternateModel,
              messageCreatedBy: "agent",
              messageCreationSource: "provider",
            }),
          );
          yield* awaitUntil(
            () => events.filter((event) => event.type === "turn.terminal").length === 3,
            "continuation terminal after buffered subagent drain",
          );

          const finalSubagent = subagentEvents().at(-1)?.subagent;
          assert.equal(finalSubagent?.status, "completed");
          assert.equal(finalSubagent?.result, SUBAGENT_SUMMARY);
          assert.equal(finalSubagent?.runId, subagentEvents()[0]?.subagent.runId);
          const subagentNodeEvents = events.filter(
            (event): event is Extract<ProviderAdapterV2Event, { type: "node.updated" }> =>
              event.type === "node.updated" &&
              event.node.kind === "subagent" &&
              event.node.nativeItemRef?.nativeId === SUBAGENT_TASK_ID,
          );
          assert.equal(subagentNodeEvents.at(-1)?.node.status, "completed");
          assert.isFalse(yield* hasPendingBackgroundWork);
        }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
      ),
  );

  it.effect("refuses a model change that would kill a running background subagent", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const SUBAGENT_TASK_ID = "task-model-change-running-subagent";
        const SUBAGENT_TOOL_USE_ID = "toolu-model-change-running-subagent";
        const fileSystem = yield* FileSystem.FileSystem;
        const idAllocator = yield* IdAllocator.IdAllocatorV2;
        const attachmentsDir = yield* fileSystem.makeTempDirectoryScoped({
          prefix: "control-claude-v2-model-change-running-subagent-",
        });
        const processQueues: Array<Queue.Queue<SDKMessage>> = [];
        const events: Array<ProviderAdapterV2Event> = [];
        const adapter = ClaudeAdapterV2.makeClaudeAdapterV2({
          instanceId: ClaudeAdapterV2.CLAUDE_DEFAULT_INSTANCE_ID,
          settings: DEFAULT_CLAUDE_SETTINGS,
          environment: {},
          attachmentsDir,
          fileSystem,
          path: yield* Path.Path,
          crypto: yield* Crypto.Crypto,
          idAllocator,
          continuationRequests: { offer: () => Effect.void },
          queryRunner: {
            allocateSessionId: Effect.succeed(WAKE_NATIVE_SESSION),
            open: () =>
              Effect.gen(function* () {
                const sdkMessages = yield* Queue.unbounded<SDKMessage>();
                processQueues.push(sdkMessages);
                return {
                  messages: Stream.fromQueue(sdkMessages),
                  offer: () => Effect.void,
                  setModel: () => Effect.void,
                  setPermissionMode: () => Effect.void,
                  backgroundTasks: () => Effect.succeed(false),
                  interrupt: Effect.void,
                  close: Queue.shutdown(sdkMessages),
                };
              }),
            forkSession: () => Effect.die("unused forkSession"),
            subagentLaunchToolUseId: () => Effect.succeed(null),
            assertComplete: Effect.void,
          },
        });
        const threadId = ThreadId.make("thread-claude-model-change-running-subagent");
        const runtime = yield* adapter.openSession({
          threadId,
          providerSessionId: ProviderSessionId.make(
            "provider-session-claude-model-change-running-subagent",
          ),
          modelSelection: CLAUDE_TEST_MODEL_SELECTION,
          runtimePolicy: CLAUDE_TEST_RUNTIME_POLICY,
        });
        const providerThread = yield* runtime.ensureThread({
          threadId,
          modelSelection: CLAUDE_TEST_MODEL_SELECTION,
          runtimePolicy: CLAUDE_TEST_RUNTIME_POLICY,
        });
        yield* runtime.events.pipe(
          Stream.runForEach((event) =>
            Effect.sync(() => {
              events.push(event);
            }),
          ),
          Effect.forkScoped,
        );
        const terminals = () => events.filter((event) => event.type === "turn.terminal");
        const now = yield* DateTime.now;

        yield* runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId,
            providerThread,
            now,
            attemptId: RunAttemptId.make("attempt-claude-model-change-running-subagent-a"),
            text: "Spawn a background subagent and stop.",
            attachments: [],
          }),
        );
        const firstProcess = processQueues[0]!;
        yield* Queue.offer(
          firstProcess,
          claudeSdkFrame({
            type: "system",
            subtype: "task_started",
            task_id: SUBAGENT_TASK_ID,
            tool_use_id: SUBAGENT_TOOL_USE_ID,
            description: "Background research",
            subagent_type: "general-purpose",
            task_type: "local_agent",
            prompt: "Research, then report.",
            uuid: "00000000-0000-4000-8000-000000000901",
            session_id: WAKE_NATIVE_SESSION,
          }),
        );
        yield* Queue.offer(
          firstProcess,
          makeResultFrame({
            uuid: "00000000-0000-4000-8000-000000000902",
            result: "Spawned the subagent in the background.",
          }),
        );
        yield* awaitUntil(() => terminals().length === 1, "first turn terminal");
        const settledTurn = terminals()[0]!;

        // The subagent runs inside the first CLI process. Another model needs
        // another process, so the turn must not start and close this one.
        const alternateModel = {
          ...CLAUDE_TEST_MODEL_SELECTION,
          model: "claude-haiku-4-5-20251001",
        } satisfies ModelSelection;
        const switchTurn = (attempt: string) =>
          runtime.startTurn(
            makeClaudeTestTurnInput({
              threadId,
              providerThread: { ...providerThread, status: "active" },
              now,
              attemptId: RunAttemptId.make(attempt),
              text: "Switch model while the subagent runs.",
              attachments: [],
              providerTurnOrdinal: 2,
              modelSelection: alternateModel,
            }),
          );
        const refused = yield* switchTurn("attempt-claude-model-change-running-subagent-b").pipe(
          Effect.flip,
        );
        assert.equal(
          makeProviderFailure({ cause: refused, class: "provider_error" }).message,
          new ClaudeAdapterV2.ClaudeBackgroundWorkBlocksQueryReplacementError().message,
        );
        assert.lengthOf(processQueues, 1);

        // Stop ends the background work, so the switch may replace the process.
        yield* runtime.interruptTurn({
          providerThread,
          providerTurnId: settledTurn.providerTurnId,
          requestRuntimeRestart: true,
        });
        yield* switchTurn("attempt-claude-model-change-running-subagent-c");
        assert.lengthOf(processQueues, 2);

        // The stopped subagent never reports its end, so it must not block
        // later changes on the replacement process either.
        yield* Queue.offer(
          processQueues[1]!,
          makeResultFrame({
            uuid: "00000000-0000-4000-8000-000000000903",
            result: "Switched model.",
          }),
        );
        yield* awaitUntil(() => terminals().length === 2, "switched turn terminal");
        yield* runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId,
            providerThread: { ...providerThread, status: "active" },
            now,
            attemptId: RunAttemptId.make("attempt-claude-model-change-running-subagent-d"),
            text: "Switch back.",
            attachments: [],
            providerTurnOrdinal: 3,
          }),
        );
        assert.lengthOf(processQueues, 3);
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );

  it.effect(
    "keeps the process and its roster when a model change meets a running background shell",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fileSystem = yield* FileSystem.FileSystem;
          const idAllocator = yield* IdAllocator.IdAllocatorV2;
          const attachmentsDir = yield* fileSystem.makeTempDirectoryScoped({
            prefix: "control-claude-v2-replace-open-fail-",
          });
          let openCount = 0;
          const processQueues: Array<Queue.Queue<SDKMessage>> = [];
          const events: Array<ProviderAdapterV2Event> = [];
          const adapter = ClaudeAdapterV2.makeClaudeAdapterV2({
            instanceId: ClaudeAdapterV2.CLAUDE_DEFAULT_INSTANCE_ID,
            settings: DEFAULT_CLAUDE_SETTINGS,
            environment: {},
            attachmentsDir,
            fileSystem,
            path: yield* Path.Path,
            crypto: yield* Crypto.Crypto,
            idAllocator,
            continuationRequests: {
              offer: () => Effect.void,
            },
            queryRunner: {
              allocateSessionId: Effect.succeed(WAKE_NATIVE_SESSION),
              open: () => {
                openCount += 1;
                if (openCount === 2) {
                  return Effect.fail(
                    new ClaudeAdapterV2.ClaudeAgentSdkQueryRunnerError({
                      method: "open",
                      cause: "forced replacement open failure",
                    }),
                  );
                }
                return Effect.gen(function* () {
                  const sdkMessages = yield* Queue.unbounded<SDKMessage>();
                  processQueues.push(sdkMessages);
                  return {
                    messages: Stream.fromQueue(sdkMessages),
                    offer: () => Effect.void,
                    setModel: () => Effect.void,
                    setPermissionMode: () => Effect.void,
                    backgroundTasks: () => Effect.succeed(false),
                    interrupt: Effect.void,
                    close: Queue.shutdown(sdkMessages),
                  };
                });
              },
              forkSession: () => Effect.die("unused forkSession"),
              subagentLaunchToolUseId: () => Effect.succeed(null),
              assertComplete: Effect.void,
            },
          });
          const threadId = ThreadId.make("thread-claude-replace-open-fail");
          const runtime = yield* adapter.openSession({
            threadId,
            providerSessionId: ProviderSessionId.make("provider-session-claude-replace-open-fail"),
            modelSelection: CLAUDE_TEST_MODEL_SELECTION,
            runtimePolicy: CLAUDE_TEST_RUNTIME_POLICY,
          });
          const providerThread = yield* runtime.ensureThread({
            threadId,
            modelSelection: CLAUDE_TEST_MODEL_SELECTION,
            runtimePolicy: CLAUDE_TEST_RUNTIME_POLICY,
          });
          yield* runtime.events.pipe(
            Stream.runForEach((event) =>
              Effect.sync(() => {
                events.push(event);
              }),
            ),
            Effect.forkScoped,
          );
          if (runtime.hasPendingBackgroundWork === undefined) {
            return yield* Effect.die(
              "Claude adapter runtime must expose hasPendingBackgroundWork.",
            );
          }
          const hasPendingBackgroundWork = runtime.hasPendingBackgroundWork;
          const now = yield* DateTime.now;

          yield* runtime.startTurn(
            makeClaudeTestTurnInput({
              threadId,
              providerThread,
              now,
              attemptId: RunAttemptId.make("attempt-claude-replace-open-fail-a"),
              text: "Run the build in the background.",
              attachments: [],
            }),
          );
          assert.equal(processQueues.length, 1);
          yield* Queue.offer(processQueues[0]!, wakeTaskStarted);
          yield* Queue.offer(processQueues[0]!, turnOneResult);
          yield* awaitUntil(
            () => events.some((event) => event.type === "turn.terminal"),
            "first turn terminal",
          );
          assert.isTrue(yield* hasPendingBackgroundWork);

          const alternateModel = {
            ...CLAUDE_TEST_MODEL_SELECTION,
            model: "claude-haiku-4-5-20251001",
          } satisfies ModelSelection;
          const failedStart = yield* runtime
            .startTurn(
              makeClaudeTestTurnInput({
                threadId,
                providerThread: { ...providerThread, status: "active" },
                now,
                attemptId: RunAttemptId.make("attempt-claude-replace-open-fail-b"),
                text: "Replace process but fail open.",
                attachments: [],
                providerTurnOrdinal: 2,
                modelSelection: alternateModel,
              }),
            )
            .pipe(Effect.exit);
          assert.isTrue(Exit.isFailure(failedStart));
          // The shell runs in the first process, so it is never closed and
          // no replacement is opened.
          assert.equal(openCount, 1);
          assert.isTrue(yield* hasPendingBackgroundWork);
        }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
      ),
  );

  it.effect(
    "clears buffered wake and continuation state when same-native-thread replacement open fails",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fileSystem = yield* FileSystem.FileSystem;
          const idAllocator = yield* IdAllocator.IdAllocatorV2;
          const attachmentsDir = yield* fileSystem.makeTempDirectoryScoped({
            prefix: "control-claude-v2-replace-open-fail-wake-",
          });
          let openCount = 0;
          const processQueues: Array<Queue.Queue<SDKMessage>> = [];
          const events: Array<ProviderAdapterV2Event> = [];
          const continuationRequests: Array<ProviderContinuationRequest> = [];
          const adapter = ClaudeAdapterV2.makeClaudeAdapterV2({
            instanceId: ClaudeAdapterV2.CLAUDE_DEFAULT_INSTANCE_ID,
            settings: DEFAULT_CLAUDE_SETTINGS,
            environment: {},
            attachmentsDir,
            fileSystem,
            path: yield* Path.Path,
            crypto: yield* Crypto.Crypto,
            idAllocator,
            continuationRequests: {
              offer: (request) =>
                Effect.sync(() => {
                  continuationRequests.push(request);
                }),
            },
            queryRunner: {
              allocateSessionId: Effect.succeed(WAKE_NATIVE_SESSION),
              open: () => {
                openCount += 1;
                if (openCount === 2) {
                  return Effect.fail(
                    new ClaudeAdapterV2.ClaudeAgentSdkQueryRunnerError({
                      method: "open",
                      cause: "forced replacement open failure",
                    }),
                  );
                }
                return Effect.gen(function* () {
                  const sdkMessages = yield* Queue.unbounded<SDKMessage>();
                  processQueues.push(sdkMessages);
                  return {
                    messages: Stream.fromQueue(sdkMessages),
                    offer: () => Effect.void,
                    setModel: () => Effect.void,
                    setPermissionMode: () => Effect.void,
                    backgroundTasks: () => Effect.succeed(false),
                    interrupt: Effect.void,
                    close: Queue.shutdown(sdkMessages),
                  };
                });
              },
              forkSession: () => Effect.die("unused forkSession"),
              subagentLaunchToolUseId: () => Effect.succeed(null),
              assertComplete: Effect.void,
            },
          });
          const threadId = ThreadId.make("thread-claude-replace-open-fail-wake");
          const runtime = yield* adapter.openSession({
            threadId,
            providerSessionId: ProviderSessionId.make(
              "provider-session-claude-replace-open-fail-wake",
            ),
            modelSelection: CLAUDE_TEST_MODEL_SELECTION,
            runtimePolicy: CLAUDE_TEST_RUNTIME_POLICY,
          });
          const providerThread = yield* runtime.ensureThread({
            threadId,
            modelSelection: CLAUDE_TEST_MODEL_SELECTION,
            runtimePolicy: CLAUDE_TEST_RUNTIME_POLICY,
          });
          yield* runtime.events.pipe(
            Stream.runForEach((event) =>
              Effect.sync(() => {
                events.push(event);
              }),
            ),
            Effect.forkScoped,
          );
          if (runtime.hasPendingBackgroundWork === undefined) {
            return yield* Effect.die(
              "Claude adapter runtime must expose hasPendingBackgroundWork.",
            );
          }
          const hasPendingBackgroundWork = runtime.hasPendingBackgroundWork;
          const now = yield* DateTime.now;

          yield* runtime.startTurn(
            makeClaudeTestTurnInput({
              threadId,
              providerThread,
              now,
              attemptId: RunAttemptId.make("attempt-claude-replace-open-fail-wake-a"),
              text: "Run the build in the background.",
              attachments: [],
            }),
          );
          yield* Queue.offer(processQueues[0]!, wakeTaskStarted);
          yield* Queue.offer(processQueues[0]!, turnOneResult);
          yield* awaitUntil(
            () => events.filter((event) => event.type === "turn.terminal").length === 1,
            "first turn terminal",
          );
          yield* Queue.offer(processQueues[0]!, wakeNotification);
          yield* Queue.offer(processQueues[0]!, wakeAssistant);
          yield* awaitUntil(() => continuationRequests.length === 1, "first continuation request");
          assert.isTrue(yield* hasPendingBackgroundWork);

          const alternateModel = {
            ...CLAUDE_TEST_MODEL_SELECTION,
            model: "claude-haiku-4-5-20251001",
          } satisfies ModelSelection;
          const failedStart = yield* runtime
            .startTurn(
              makeClaudeTestTurnInput({
                threadId,
                providerThread: { ...providerThread, status: "active" },
                now,
                attemptId: RunAttemptId.make("attempt-claude-replace-open-fail-wake-b"),
                text: "Replace process but fail open.",
                attachments: [],
                providerTurnOrdinal: 2,
                modelSelection: alternateModel,
              }),
            )
            .pipe(Effect.exit);
          assert.isTrue(Exit.isFailure(failedStart));
          assert.isFalse(yield* hasPendingBackgroundWork);

          yield* runtime.startTurn(
            makeClaudeTestTurnInput({
              threadId,
              providerThread: { ...providerThread, status: "active" },
              now,
              attemptId: RunAttemptId.make("attempt-claude-replace-open-fail-wake-c"),
              text: "Retry after the failed replacement.",
              attachments: [],
              providerTurnOrdinal: 2,
              modelSelection: alternateModel,
            }),
          );
          const retryProcess = processQueues[1]!;
          const retryTaskId = "task-wake-build-after-retry";
          yield* Queue.offer(
            retryProcess,
            claudeSdkFrame({
              type: "system",
              subtype: "task_started",
              task_id: retryTaskId,
              tool_use_id: "toolu-wake-build-after-retry",
              description: "npm run build after retry",
              is_backgrounded: true,
              task_type: "local_bash",
              uuid: "00000000-0000-4000-8000-000000000901",
              session_id: WAKE_NATIVE_SESSION,
            }),
          );
          yield* Queue.offer(
            retryProcess,
            makeResultFrame({
              uuid: "00000000-0000-4000-8000-000000000902",
              result: "Kicked off the retry build in the background.",
            }),
          );
          yield* awaitUntil(
            () => events.filter((event) => event.type === "turn.terminal").length === 2,
            "retry turn terminal",
          );
          yield* Queue.offer(
            retryProcess,
            claudeSdkFrame({
              type: "system",
              subtype: "task_notification",
              task_id: retryTaskId,
              tool_use_id: "toolu-wake-build-after-retry",
              status: "completed",
              output_file: "/tmp/task-wake-build-after-retry.log",
              summary: "Retry build completed successfully",
              uuid: "00000000-0000-4000-8000-000000000903",
              session_id: WAKE_NATIVE_SESSION,
            }),
          );
          yield* Queue.offer(
            retryProcess,
            makeAssistantTextFrame({
              uuid: "00000000-0000-4000-8000-000000000904",
              text: "The retry build has finished.",
            }),
          );
          yield* awaitUntil(
            () => continuationRequests.length === 2,
            "continuation request after retry",
          );
          assert.equal(continuationRequests[1]?.detail, "Retry build completed successfully");
        }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
      ),
  );

  it.effect("does not invent process reset state on a first-ever failed open", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const idAllocator = yield* IdAllocator.IdAllocatorV2;
        const attachmentsDir = yield* fileSystem.makeTempDirectoryScoped({
          prefix: "control-claude-v2-first-open-fail-",
        });
        const events: Array<ProviderAdapterV2Event> = [];
        const adapter = ClaudeAdapterV2.makeClaudeAdapterV2({
          instanceId: ClaudeAdapterV2.CLAUDE_DEFAULT_INSTANCE_ID,
          settings: DEFAULT_CLAUDE_SETTINGS,
          environment: {},
          attachmentsDir,
          fileSystem,
          path: yield* Path.Path,
          crypto: yield* Crypto.Crypto,
          idAllocator,
          continuationRequests: {
            offer: () => Effect.void,
          },
          queryRunner: {
            allocateSessionId: Effect.succeed(WAKE_NATIVE_SESSION),
            open: () =>
              Effect.fail(
                new ClaudeAdapterV2.ClaudeAgentSdkQueryRunnerError({
                  method: "open",
                  cause: "forced first open failure",
                }),
              ),
            forkSession: () => Effect.die("unused forkSession"),
            subagentLaunchToolUseId: () => Effect.succeed(null),
            assertComplete: Effect.void,
          },
        });
        const threadId = ThreadId.make("thread-claude-first-open-fail");
        const runtime = yield* adapter.openSession({
          threadId,
          providerSessionId: ProviderSessionId.make("provider-session-claude-first-open-fail"),
          modelSelection: CLAUDE_TEST_MODEL_SELECTION,
          runtimePolicy: CLAUDE_TEST_RUNTIME_POLICY,
        });
        const providerThread = yield* runtime.ensureThread({
          threadId,
          modelSelection: CLAUDE_TEST_MODEL_SELECTION,
          runtimePolicy: CLAUDE_TEST_RUNTIME_POLICY,
        });
        yield* runtime.events.pipe(
          Stream.runForEach((event) =>
            Effect.sync(() => {
              events.push(event);
            }),
          ),
          Effect.forkScoped,
        );
        const now = yield* DateTime.now;
        const failedStart = yield* runtime
          .startTurn(
            makeClaudeTestTurnInput({
              threadId,
              providerThread,
              now,
              attemptId: RunAttemptId.make("attempt-claude-first-open-fail"),
              text: "First open fails.",
              attachments: [],
            }),
          )
          .pipe(Effect.exit);
        assert.isTrue(Exit.isFailure(failedStart));
        // No live process ever existed: do not emit a fabricated empty roster.
        assert.lengthOf(providerThreadRosterEvents(events), 0);
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );

  it.effect.each([
    { backgrounding: "succeeds" },
    { backgrounding: "fails" },
    { backgrounding: "never answers" },
    { backgrounding: "answers after the steer went out" },
    { backgrounding: "answers after the turn ended" },
    { backgrounding: "answers after the subagent ran again" },
  ] as const)(
    "moves the root's foreground subagents to the background before a steer ($backgrounding)",
    ({ backgrounding }) =>
      Effect.scoped(
        Effect.gen(function* () {
          const FOREGROUND_TOOL_USE_ID = "toolu-steer-foreground";
          const NESTED_TOOL_USE_ID = "toolu-steer-nested";
          const FINISHED_TOOL_USE_ID = "toolu-steer-finished";
          const calls: Array<string> = [];
          // What happens while the move is still unanswered.
          let beforeAnswer: Effect.Effect<void> = Effect.void;
          const harness = yield* makeWakeHarnessWithOptions({
            backgroundTasks: (toolUseId) =>
              Effect.sync(() => calls.push(toolUseId)).pipe(
                Effect.andThen(
                  backgrounding === "answers after the turn ended" ||
                    backgrounding === "answers after the subagent ran again"
                    ? Effect.suspend(() => beforeAnswer).pipe(Effect.as(true))
                    : backgrounding === "fails"
                      ? Effect.fail(
                          new ClaudeAdapterV2.ClaudeAgentSdkQueryRunnerError({
                            method: "backgroundTasks",
                            cause: new Error("Background tasks are disabled in this session."),
                          }),
                        )
                      : backgrounding === "never answers"
                        ? Effect.never
                        : backgrounding === "answers after the steer went out"
                          ? Effect.sleep("6 seconds").pipe(Effect.as(true))
                          : Effect.succeed(true),
                ),
              ),
          });
          const idAllocator = yield* IdAllocator.IdAllocatorV2;
          const attemptId = RunAttemptId.make("attempt-steer-foreground-subagent");
          const input = makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now: yield* DateTime.now,
            attemptId,
            text: "Audit the repo with a subagent.",
            attachments: [],
          });
          yield* harness.runtime.startTurn(input);
          if (backgrounding === "answers after the turn ended") {
            beforeAnswer = Queue.offer(
              harness.sdkMessages,
              makeResultFrame({ uuid: "00000000-0000-4000-8000-000000000a10", result: "Done." }),
            ).pipe(
              Effect.andThen(awaitUntil(() => harness.terminalEvents().length === 1, "turn end")),
            );
          }
          const foregroundTaskStarted = (task: {
            readonly spawnDepth?: number;
            readonly taskId: string;
            readonly toolUseId: string;
            readonly uuid: string;
          }) =>
            claudeSdkFrame({
              type: "system",
              subtype: "task_started",
              task_id: task.taskId,
              tool_use_id: task.toolUseId,
              description: task.taskId,
              subagent_type: "general-purpose",
              is_backgrounded: false,
              task_type: "local_agent",
              prompt: "Audit.",
              ...(task.spawnDepth === undefined ? {} : { spawn_depth: task.spawnDepth }),
              uuid: task.uuid,
              session_id: WAKE_NATIVE_SESSION,
            });
          for (const frame of [
            foregroundTaskStarted({
              taskId: "task-steer-finished",
              toolUseId: FINISHED_TOOL_USE_ID,
              uuid: "00000000-0000-4000-8000-000000000a01",
            }),
            makeSubagentNotificationFrame({
              taskId: "task-steer-finished",
              toolUseId: FINISHED_TOOL_USE_ID,
              summary: "Finished before the steer.",
              uuid: "00000000-0000-4000-8000-000000000a02",
            }),
            foregroundTaskStarted({
              taskId: "task-steer-foreground",
              toolUseId: FOREGROUND_TOOL_USE_ID,
              uuid: "00000000-0000-4000-8000-000000000a03",
            }),
            claudeSdkFrame({
              type: "assistant",
              message: {
                model: "claude-sonnet-4-6",
                id: "msg_steer_nested_launch",
                type: "message",
                role: "assistant",
                content: [
                  {
                    type: "tool_use",
                    id: NESTED_TOOL_USE_ID,
                    name: "Agent",
                    input: { description: "Nested check", prompt: "Check." },
                  },
                ],
              },
              parent_tool_use_id: FOREGROUND_TOOL_USE_ID,
              uuid: "00000000-0000-4000-8000-000000000a04",
              session_id: WAKE_NATIVE_SESSION,
            }),
            foregroundTaskStarted({
              taskId: "task-steer-nested",
              toolUseId: NESTED_TOOL_USE_ID,
              uuid: "00000000-0000-4000-8000-000000000a05",
            }),
            // Nested too, though its launch never reached the adapter.
            foregroundTaskStarted({
              taskId: "task-steer-deep",
              toolUseId: "toolu-steer-deep",
              spawnDepth: 2,
              uuid: "00000000-0000-4000-8000-000000000a11",
            }),
          ]) {
            yield* Queue.offer(harness.sdkMessages, frame);
          }
          const latestSubagent = (taskId: string) =>
            harness.events
              .flatMap((event) =>
                event.type === "subagent.updated" &&
                event.subagent.nativeTaskRef?.nativeId === taskId
                  ? [event.subagent]
                  : [],
              )
              .at(-1);
          yield* awaitUntil(
            () =>
              latestSubagent("task-steer-nested")?.status === "running" &&
              latestSubagent("task-steer-deep")?.status === "running" &&
              latestSubagent("task-steer-foreground")?.status === "running" &&
              latestSubagent("task-steer-finished")?.status === "completed",
            "subagents registered",
          );

          const offered = harness.offeredMessages.length;
          const steer = harness.runtime.steerTurn({
            threadId: harness.threadId,
            runId: input.runId,
            providerThread: harness.providerThread,
            providerTurnId: idAllocator.derive.providerTurn({
              driver: ClaudeAdapterV2.CLAUDE_PROVIDER,
              nativeTurnId: `turn:${attemptId}`,
            }),
            message: {
              createdBy: "user",
              creationSource: "web",
              messageId: MessageId.make("message-steer-foreground-subagent"),
              text: "Also check the docs.",
              attachments: [],
            },
          });
          const RERUN_TOOL_USE_ID = "toolu-steer-rerun";
          if (backgrounding === "answers after the subagent ran again") {
            // It ends and a SendMessage runs it again, in the foreground.
            beforeAnswer = harness
              .offerAndWait(
                makeSubagentNotificationFrame({
                  taskId: "task-steer-foreground",
                  toolUseId: FOREGROUND_TOOL_USE_ID,
                  summary: "First run done.",
                  uuid: "00000000-0000-4000-8000-000000000a12",
                }),
              )
              .pipe(
                Effect.andThen(
                  harness.offerAndWait(
                    foregroundTaskStarted({
                      taskId: "task-steer-foreground",
                      toolUseId: RERUN_TOOL_USE_ID,
                      uuid: "00000000-0000-4000-8000-000000000a13",
                    }),
                  ),
                ),
              );
          }
          const steering = yield* Effect.forkScoped(steer);
          if (
            backgrounding === "never answers" ||
            backgrounding === "answers after the steer went out"
          ) {
            yield* awaitUntil(() => calls.length === 1, "background request");
            assert.equal(harness.offeredMessages.length, offered);
            yield* TestClock.adjust("5 seconds");
          }
          const steered = yield* Fiber.await(steering);

          // Only the root's running subagent moves: the nested ones follow
          // their owner and the finished one has nothing left to move.
          assert.deepEqual(calls, [FOREGROUND_TOOL_USE_ID]);
          if (backgrounding === "answers after the turn ended") {
            // The steer is refused, so the orchestrator starts its follow-up turn.
            assert.isTrue(Exit.isFailure(steered));
            assert.equal(harness.offeredMessages.length, offered);
            return;
          }
          // A refused or unanswered move still lets the steer through.
          assert.isTrue(Exit.isSuccess(steered));
          assert.equal(harness.offeredMessages.length, offered + 1);
          assert.equal(harness.offeredMessages.at(-1)?.priority, "now");
          if (backgrounding === "never answers") {
            // Later steers wait on the move still in flight instead of
            // piling up another request for the same run.
            for (let repeat = 1; repeat <= 2; repeat++) {
              const again = yield* Effect.forkScoped(steer);
              // The steer's 5 second wait starts once it reaches it; move the
              // clock until the steer has gone out.
              for (let tick = 0; tick < 100 && again.pollUnsafe() === undefined; tick++) {
                yield* TestClock.adjust("1 second");
                yield* Effect.yieldNow;
              }
              assert.isTrue(Exit.isSuccess(yield* Fiber.await(again)));
              assert.equal(harness.offeredMessages.length, offered + 1 + repeat);
            }
            assert.deepEqual(calls, [FOREGROUND_TOOL_USE_ID]);
          }
          if (backgrounding === "answers after the steer went out") {
            yield* TestClock.adjust("1 second");
          } else if (
            backgrounding !== "succeeds" &&
            backgrounding !== "answers after the subagent ran again"
          ) {
            return;
          }
          // The move answered for the first run; the second runs in the
          // foreground, so its end is the parent's tool result, not a wake.
          const reran = backgrounding === "answers after the subagent ran again";

          // The moved subagent outlives the steered turn. When it ends during
          // the user's next turn, Claude's wake after that turn names it.
          for (const frame of [
            makeResultFrame({
              uuid: "00000000-0000-4000-8000-000000000a06",
              result: "",
              terminalReason: "aborted_tools",
            }),
            makeResultFrame({ uuid: "00000000-0000-4000-8000-000000000a07", result: "Docs too." }),
          ]) {
            yield* Queue.offer(harness.sdkMessages, frame);
          }
          yield* awaitUntil(() => harness.terminalEvents().length === 1, "steered turn terminal");
          yield* harness.runtime.startTurn(
            makeClaudeTestTurnInput({
              threadId: harness.threadId,
              providerThread: harness.providerThread,
              now: yield* DateTime.now,
              attemptId: RunAttemptId.make("attempt-steer-next-turn"),
              text: "Anything else?",
              attachments: [],
              providerTurnOrdinal: 2,
            }),
          );
          for (const frame of [
            makeSubagentNotificationFrame({
              taskId: "task-steer-foreground",
              toolUseId: reran ? RERUN_TOOL_USE_ID : FOREGROUND_TOOL_USE_ID,
              summary: "AUDITED",
              uuid: "00000000-0000-4000-8000-000000000a08",
            }),
            makeResultFrame({ uuid: "00000000-0000-4000-8000-000000000a09", result: "No." }),
          ]) {
            yield* Queue.offer(harness.sdkMessages, frame);
          }
          yield* awaitUntil(() => harness.terminalEvents().length === 2, "next turn terminal");
          yield* Queue.offer(harness.sdkMessages, wakeTurnInit);
          yield* awaitUntil(() => harness.continuationRequests.length === 1, "subagent wake");
          assert.equal(
            harness.continuationRequests[0]?.notification?.summary,
            reran ? undefined : 'Subagent "task-steer-foreground" finished',
          );
        }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
      ),
  );

  describe("native goals", () => {
    const syntheticFrame = (uuid: string, text: string) =>
      claudeSdkFrame({
        type: "assistant",
        message: {
          model: "<synthetic>",
          id: uuid,
          type: "message",
          role: "assistant",
          content: [{ type: "text", text }],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: {
            input_tokens: 0,
            output_tokens: 0,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
        },
        parent_tool_use_id: null,
        uuid,
        session_id: WAKE_NATIVE_SESSION,
      });
    const stopHookFeedback = (uuid: string, condition: string, reason: string) =>
      claudeSdkFrame({
        type: "user",
        message: {
          role: "user",
          content: [{ type: "text", text: `Stop hook feedback:\n[${condition}]: ${reason}` }],
        },
        parent_tool_use_id: null,
        isSynthetic: true,
        uuid,
        session_id: WAKE_NATIVE_SESSION,
      });
    const goalStatuses = (events: ReadonlyArray<ProviderAdapterV2Event>) =>
      events.flatMap((event) =>
        event.type === "provider_thread.updated" && event.providerThread.goal != null
          ? [event.providerThread.goal]
          : [],
      );

    it.effect("tracks a /goal through unmet checks until Claude stops on its own", () =>
      Effect.gen(function* () {
        const harness = yield* makeWakeHarness;
        const condition = "all tests pass";
        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now: yield* DateTime.now,
            attemptId: RunAttemptId.make("goal-attempt"),
            text: `/goal ${condition}`,
            attachments: [],
          }),
        );
        for (const frame of [
          syntheticFrame("goal-set", `Goal set: ${condition}`),
          makeAssistantTextFrame({ uuid: "goal-work-1", text: "Fixing the first test." }),
          stopHookFeedback("goal-check-1", condition, "One test still fails."),
          makeAssistantTextFrame({ uuid: "goal-work-2", text: "All tests pass now." }),
          makeResultFrame({ uuid: "goal-result", result: "All tests pass now." }),
        ]) {
          yield* Queue.offer(harness.sdkMessages, frame);
        }
        const terminal = yield* Queue.take(harness.terminalReceipts);
        assert.equal(terminal.status, "completed");
        assert.deepEqual(goalStatuses(harness.events), [
          { objective: condition, status: "active", checks: 0 },
          {
            objective: condition,
            status: "active",
            checks: 1,
            lastCheck: "One test still fails.",
          },
          { objective: condition, status: "complete", checks: 1 },
        ]);
      }).pipe(Effect.scoped, Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    );

    it.effect("keeps a goal active when a hook stops the turn before the goal passes", () =>
      Effect.gen(function* () {
        const harness = yield* makeWakeHarness;
        const condition = "the deploy succeeds";
        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: harness.providerThread,
            now: yield* DateTime.now,
            attemptId: RunAttemptId.make("goal-hook-stop-attempt"),
            text: `/goal ${condition}`,
            attachments: [],
          }),
        );
        for (const frame of [
          syntheticFrame("goal-hook-set", `Goal set: ${condition}`),
          makeAssistantTextFrame({ uuid: "goal-hook-work", text: "Deploying." }),
          makeResultFrame({
            uuid: "goal-hook-result",
            result: "Deploying.",
            terminalReason: "hook_stopped",
          }),
        ]) {
          yield* Queue.offer(harness.sdkMessages, frame);
        }
        yield* Queue.take(harness.terminalReceipts);
        assert.deepEqual(goalStatuses(harness.events).at(-1), {
          objective: condition,
          status: "active",
          checks: 0,
        });
      }).pipe(Effect.scoped, Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    );

    it.effect("keeps a goal active after a command turn with no model output", () =>
      Effect.gen(function* () {
        const harness = yield* makeWakeHarness;
        const condition = "the build is green";
        yield* harness.runtime.startTurn(
          makeClaudeTestTurnInput({
            threadId: harness.threadId,
            providerThread: {
              ...harness.providerThread,
              goal: { objective: condition, status: "active", checks: 2 },
            },
            now: yield* DateTime.now,
            attemptId: RunAttemptId.make("goal-show-attempt"),
            text: "/goal",
            attachments: [],
          }),
        );
        yield* Queue.offer(
          harness.sdkMessages,
          syntheticFrame("goal-show", `Goal active: ${condition} (2 turns)`),
        );
        yield* Queue.offer(
          harness.sdkMessages,
          makeResultFrame({ uuid: "goal-show-result", result: "", numTurns: 0 }),
        );
        yield* Queue.take(harness.terminalReceipts);
        assert.deepEqual(goalStatuses(harness.events).at(-1), {
          objective: condition,
          status: "active",
          checks: 2,
        });
      }).pipe(Effect.scoped, Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    );
  });
});

describe("ClaudeAdapterV2 query message stream", () => {
  it.effect("closes the query when the message stream is interrupted mid-read", () =>
    Effect.gen(function* () {
      let closed = false;
      let releaseRead = () => {};
      const readStarted = Promise.withResolvers<void>();
      // Never yields a message — the read stays pending until close() flips
      // `closed` and releases the in-flight await.
      // oxlint-disable-next-line require-yield
      async function* sdkMessages(): AsyncGenerator<SDKMessage, void> {
        for (;;) {
          if (closed) return;
          await new Promise<void>((resolve) => {
            releaseRead = resolve;
            readStarted.resolve();
          });
        }
      }
      const generator = sdkMessages();
      const close = () => {
        closed = true;
        releaseRead();
      };
      const query = {
        next: () => generator.next(),
        return: async (value?: void) => {
          close();
          return generator.return(value);
        },
        throw: (error?: unknown) => generator.throw(error),
        [Symbol.asyncIterator]: () => generator,
        close,
      } as unknown as ClaudeQuery;

      const scope = yield* Scope.make();
      yield* Stream.fromAsyncIterable(
        ClaudeAdapterV2.claudeQueryMessages(query),
        (cause) => cause,
      ).pipe(
        Stream.runForEach(() => Effect.void),
        Effect.forkIn(scope),
      );
      yield* Effect.promise(() => readStarted.promise);

      // Iterating query[Symbol.asyncIterator]() directly deadlocks here:
      // the raw generator's return() queues behind the in-flight read and
      // scope close never completes.
      yield* Scope.close(scope, Exit.void);
      assert.isTrue(closed);
    }),
  );
});

describe("ClaudeAdapterV2 local models", () => {
  const LOCAL_NATIVE_SESSION = "native-thread-claude-local";
  const resultFrame = (uuid: string) =>
    ({
      type: "result",
      subtype: "success",
      duration_ms: 10,
      duration_api_ms: 10,
      is_error: false,
      num_turns: 1,
      result: "Done.",
      stop_reason: "end_turn",
      total_cost_usd: 0,
      usage: {
        input_tokens: 1,
        output_tokens: 1,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
      modelUsage: {},
      permission_denials: [],
      uuid,
      session_id: LOCAL_NATIVE_SESSION,
      terminal_reason: "completed",
    }) as unknown as SDKMessage;
  const awaitUntil = (predicate: () => boolean, label: string): Effect.Effect<void> =>
    Effect.gen(function* () {
      for (let attempt = 0; attempt < 5000; attempt++) {
        if (predicate()) return;
        yield* Effect.yieldNow;
      }
      return yield* Effect.die(`Timed out waiting for ${label}.`);
    });

  it.effect(
    "a chat on a local model runs claude against its server, holding it while the process lives",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fileSystem = yield* FileSystem.FileSystem;
          const attachmentsDir = yield* fileSystem.makeTempDirectoryScoped({
            prefix: "control-claude-local-",
          });
          const holds: Array<string> = [];
          let releases = 0;
          let port = 8123;
          const processes: Array<{
            readonly options: ClaudeAdapterV2.ClaudeAgentSdkQueryOptions;
            readonly messages: Queue.Queue<SDKMessage>;
          }> = [];
          const events: Array<ProviderAdapterV2Event> = [];
          const adapter = ClaudeAdapterV2.makeClaudeAdapterV2({
            instanceId: ClaudeAdapterV2.CLAUDE_DEFAULT_INSTANCE_ID,
            settings: DEFAULT_CLAUDE_SETTINGS,
            environment: { CLAUDE_CONFIG_DIR: "/claude-home" },
            attachmentsDir,
            fileSystem,
            path: yield* Path.Path,
            crypto: yield* Crypto.Crypto,
            idAllocator: yield* IdAllocator.IdAllocatorV2,
            localModels: {
              hold: (model) =>
                Effect.sync(() => {
                  holds.push(model);
                  return {
                    port,
                    release: Effect.sync(() => {
                      releases += 1;
                    }),
                  };
                }),
            },
            queryRunner: {
              allocateSessionId: Effect.succeed(LOCAL_NATIVE_SESSION),
              open: (input) =>
                Effect.gen(function* () {
                  const messages = yield* Queue.unbounded<SDKMessage>();
                  processes.push({ options: input.options, messages });
                  return {
                    messages: Stream.fromQueue(messages),
                    offer: () => Effect.void,
                    setModel: () => Effect.void,
                    setPermissionMode: () => Effect.void,
                    backgroundTasks: () => Effect.succeed(false),
                    interrupt: Effect.void,
                    close: Queue.shutdown(messages),
                  };
                }),
              forkSession: () => Effect.die("unused"),
              subagentLaunchToolUseId: () => Effect.succeed(null),
              assertComplete: Effect.void,
            },
          });
          const threadId = ThreadId.make("thread-claude-local");
          const local = {
            instanceId: CLAUDE_TEST_MODEL_SELECTION.instanceId,
            model: "local:qwen-27b",
          };
          const runtime = yield* adapter.openSession({
            threadId,
            providerSessionId: ProviderSessionId.make("provider-session-claude-local"),
            modelSelection: local,
            runtimePolicy: CLAUDE_TEST_RUNTIME_POLICY,
          });
          const providerThread = yield* runtime.ensureThread({
            threadId,
            modelSelection: local,
            runtimePolicy: CLAUDE_TEST_RUNTIME_POLICY,
          });
          yield* runtime.events.pipe(
            Stream.runForEach((event) => Effect.sync(() => events.push(event))),
            Effect.forkScoped,
          );
          const terminals = () => events.filter((event) => event.type === "turn.terminal").length;
          const now = yield* DateTime.now;
          const turn = (ordinal: number, modelSelection: ModelSelection) =>
            Effect.gen(function* () {
              yield* runtime.startTurn(
                makeClaudeTestTurnInput({
                  threadId,
                  providerThread: { ...providerThread, status: "active" },
                  now,
                  attemptId: RunAttemptId.make(`attempt-claude-local-${ordinal}`),
                  text: "Carry on.",
                  attachments: [],
                  providerTurnOrdinal: ordinal,
                  modelSelection,
                }),
              );
              yield* Queue.offer(
                processes.at(-1)!.messages,
                resultFrame(`00000000-0000-4000-8000-00000000030${ordinal}`),
              );
              yield* awaitUntil(() => terminals() === ordinal, `turn ${ordinal} terminal`);
            });

          yield* turn(1, local);
          assert.lengthOf(processes, 1);
          assert.strictEqual(processes[0]!.options.model, "local:qwen-27b");
          assert.deepStrictEqual(processes[0]!.options.env, {
            CLAUDE_CONFIG_DIR: "/claude-home",
            ANTHROPIC_BASE_URL: "http://127.0.0.1:8123",
            ANTHROPIC_AUTH_TOKEN: "local",
            CLAUDE_CODE_MODEL_CAPABILITIES: "-mid_conv_system",
            CONTROL_CHAT: "1",
          });

          // The next turn reuses the process, which already holds the model.
          yield* turn(2, local);
          assert.lengthOf(processes, 1);
          assert.deepStrictEqual(holds, ["qwen-27b", "qwen-27b"]);
          assert.strictEqual(releases, 1);

          // Slept and woken, the model is on another port: a new process talks to it, and the
          // old one's hold goes with it.
          port = 9000;
          yield* turn(3, local);
          assert.lengthOf(processes, 2);
          assert.strictEqual(
            processes[1]!.options.env?.ANTHROPIC_BASE_URL,
            "http://127.0.0.1:9000",
          );
          yield* awaitUntil(() => releases === 2, "the first process's release");

          // Back on Claude: no local server, and the last hold ends with its process.
          yield* turn(4, CLAUDE_TEST_MODEL_SELECTION);
          assert.lengthOf(processes, 3);
          assert.notProperty(processes[2]!.options.env, "ANTHROPIC_BASE_URL");
          yield* awaitUntil(() => releases === 3, "the second process's release");
          assert.lengthOf(holds, 3);
        }),
      ).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
  );
  // Owner, 22 Oct: a send to a chat on the model is the approval, so it wakes without Settings.
  it.effect("a send approves a wake over 40 GB", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const opened: Array<string | undefined> = [];
        const adapter = ClaudeAdapterV2.makeClaudeAdapterV2({
          instanceId: ClaudeAdapterV2.CLAUDE_DEFAULT_INSTANCE_ID,
          settings: DEFAULT_CLAUDE_SETTINGS,
          environment: {},
          attachmentsDir: yield* fileSystem.makeTempDirectoryScoped({
            prefix: "control-claude-local-ask-",
          }),
          fileSystem,
          path: yield* Path.Path,
          crypto: yield* Crypto.Crypto,
          idAllocator: yield* IdAllocator.IdAllocatorV2,
          localModels: {
            // As LocalModels does for a need over 40 GB: the wake goes ahead on the ask's yes.
            hold: (_model, options) =>
              options!.ask!({
                model: {
                  id: LocalModelId.make("qwen-27b"),
                  name: "Qwen 27B",
                  file: "/models/qwen-27b.gguf",
                  args: ["llama-server"],
                  systemPrompt: "",
                  idleMinutes: 10,
                },
                needBytes: 51 * GB,
                freeAfterBytes: 40 * GB,
              }).pipe(
                Effect.flatMap((approved) =>
                  approved
                    ? Effect.succeed({ port: 8123, release: Effect.void })
                    : Effect.fail(new LocalModelError({ message: "declined" })),
                ),
              ),
          },
          queryRunner: {
            allocateSessionId: Effect.succeed(LOCAL_NATIVE_SESSION),
            open: (input) =>
              Effect.sync(() => opened.push(input.options.env?.ANTHROPIC_BASE_URL)).pipe(
                Effect.andThen(Effect.die("enough")),
              ),
            forkSession: () => Effect.die("unused"),
            subagentLaunchToolUseId: () => Effect.succeed(null),
            assertComplete: Effect.void,
          },
        });
        const threadId = ThreadId.make("thread-claude-local-ask");
        const local = {
          instanceId: CLAUDE_TEST_MODEL_SELECTION.instanceId,
          model: "local:qwen-27b",
        };
        const runtime = yield* adapter.openSession({
          threadId,
          providerSessionId: ProviderSessionId.make("provider-session-claude-local-ask"),
          modelSelection: local,
          runtimePolicy: CLAUDE_TEST_RUNTIME_POLICY,
        });
        const providerThread = yield* runtime.ensureThread({
          threadId,
          modelSelection: local,
          runtimePolicy: CLAUDE_TEST_RUNTIME_POLICY,
        });
        const failure = yield* runtime
          .startTurn(
            makeClaudeTestTurnInput({
              threadId,
              providerThread,
              now: yield* DateTime.now,
              attemptId: RunAttemptId.make("attempt-claude-local-ask"),
              text: "Hello.",
              attachments: [],
              modelSelection: local,
            }),
          )
          .pipe(Effect.exit);
        assert.isTrue(Exit.isFailure(failure));
        // The process opened against the woken model: the wake went ahead.
        assert.deepStrictEqual(opened, ["http://127.0.0.1:8123"]);
      }),
    ).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
  );
});
