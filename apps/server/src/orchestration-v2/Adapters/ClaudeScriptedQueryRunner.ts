// @effect-diagnostics nodeBuiltinImport:off globalTimers:off globalFetch:off preferSchemaOverJson:off abortControllerInEffect:off - The design check's scripted Claude reads its script from disk once and calls CONTROL's MCP as Claude would.
/**
 * A Claude query runner that plays scripted SDK messages instead of running
 * `claude`, for the design check (`scripts/design-check`). It is used only when
 * `CONTROL_SCRIPTED_CLAUDE` names a script file; nothing else selects it.
 *
 * The script maps a prompt's text to the frames Claude would send for it. A
 * `permission.request` frame asks through `canUseTool` and waits for the answer;
 * a `delay` frame waits, so durations read like real ones; an `mcp.call` frame
 * calls a tool on the session's CONTROL MCP, as an agent filing a loose end would; a `context.usage`
 * frame sets what `getContextUsage` answers; a script whose frames end without
 * a `result` leaves its turn running. The script's `usage` is what the
 * capabilities probe's `get_usage` answers (`scriptedCapabilitiesProbe`).
 */
import * as NodeFS from "node:fs";

import type {
  CanUseTool,
  SDKControlGetContextUsageResponse,
  SDKControlGetUsageResponse,
  SDKMessage,
  SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import * as Config from "effect/Config";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";

import {
  ClaudeAgentSdkQueryRunner,
  ClaudeAgentSdkQueryRunnerError,
  layerQueryRunner,
  type ClaudeAgentSdkQuerySession,
} from "./ClaudeAdapterV2.ts";

interface PermissionRequestFrame {
  readonly type: "permission.request";
  readonly toolName: string;
  readonly input: Record<string, unknown>;
  readonly toolUseID: string;
}

interface DelayFrame {
  readonly type: "delay";
  readonly ms: number;
}

interface ContextUsageFrame {
  readonly type: "context.usage";
  readonly report: SDKControlGetContextUsageResponse;
}

interface McpCallFrame {
  readonly type: "mcp.call";
  readonly tool: string;
  readonly arguments: Record<string, unknown>;
}

type ScriptFrame =
  | SDKMessage
  | PermissionRequestFrame
  | DelayFrame
  | ContextUsageFrame
  | McpCallFrame;

/** CONTROL's MCP as the adapter hands it to Claude (`mcpServers["control"]`). */
type McpServer = { readonly url: string; readonly headers?: Record<string, string> };

async function callMcpTool(
  server: McpServer | undefined,
  environment: Readonly<Record<string, string | undefined>> | undefined,
  frame: McpCallFrame,
): Promise<void> {
  if (server === undefined) throw new Error(`A scripted ${frame.tool} call needs CONTROL's MCP.`);
  // Claude expands `${VAR}` in MCP headers from its environment; the token travels that way.
  const headers = Object.fromEntries(
    Object.entries(server.headers ?? {}).map(([name, value]) => [
      name,
      value.replace(/\$\{(\w+)\}/g, (_, variable: string) => environment?.[variable] ?? ""),
    ]),
  );
  const post = (body: object, sessionId?: string) =>
    fetch(server.url, {
      method: "POST",
      headers: {
        ...headers,
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        ...(sessionId === undefined
          ? {}
          : { "mcp-session-id": sessionId, "mcp-protocol-version": "2025-06-18" }),
      },
      body: JSON.stringify(body),
    });
  const initialize = await post({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "scripted-claude", version: "1.0.0" },
    },
  });
  await initialize.text();
  const call = await post(
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: frame.tool, arguments: frame.arguments },
    },
    initialize.headers.get("mcp-session-id") ?? undefined,
  );
  const text = await call.text();
  if (!call.ok || text.includes('"isError":true'))
    throw new Error(`The scripted ${frame.tool} call failed: ${text}`);
}

export interface ClaudeScript {
  readonly turns: Readonly<Record<string, ReadonlyArray<ScriptFrame>>>;
  readonly usage?: Pick<SDKControlGetUsageResponse, "rate_limits_available" | "rate_limits">;
}

function promptText(message: SDKUserMessage): string {
  const content = message.message.content;
  if (typeof content === "string") return content;
  return content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("\n");
}

async function* playTurns(
  script: ClaudeScript,
  prompts: AsyncIterable<SDKUserMessage>,
  sessionId: string,
  canUseTool: CanUseTool | undefined,
  mcpServer: McpServer | undefined,
  environment: Readonly<Record<string, string | undefined>> | undefined,
  signal: AbortSignal,
  reportContextUsage: (report: SDKControlGetContextUsageResponse) => void,
): AsyncGenerator<SDKMessage> {
  for await (const prompt of prompts) {
    const text = promptText(prompt);
    const frames = script.turns[text];
    if (frames === undefined) throw new Error(`The Claude script has no turn for: ${text}`);
    for (const frame of frames) {
      if (frame.type === "delay") {
        await new Promise((resolve) => setTimeout(resolve, frame.ms));
        continue;
      }
      if (frame.type === "context.usage") {
        reportContextUsage(frame.report);
        continue;
      }
      if (frame.type === "mcp.call") {
        await callMcpTool(mcpServer, environment, frame);
        continue;
      }
      if (frame.type === "permission.request") {
        if (canUseTool === undefined) throw new Error("A scripted permission needs canUseTool.");
        await canUseTool(frame.toolName, frame.input, {
          signal,
          toolUseID: frame.toolUseID,
          requestId: frame.toolUseID,
        });
        continue;
      }
      yield { ...frame, session_id: sessionId } as SDKMessage;
    }
  }
}

const runnerError = (method: string) => (cause: unknown) =>
  new ClaudeAgentSdkQueryRunnerError({ cause, method });

export const layerScripted = (scriptPath: string) =>
  Layer.effect(
    ClaudeAgentSdkQueryRunner,
    Effect.gen(function* () {
      const crypto = yield* Crypto.Crypto;
      const script = JSON.parse(NodeFS.readFileSync(scriptPath, "utf8")) as ClaudeScript;
      return ClaudeAgentSdkQueryRunner.of({
        allocateSessionId: crypto.randomUUIDv4.pipe(
          Effect.mapError(runnerError("allocateSessionId")),
        ),
        open: (input) =>
          Effect.gen(function* () {
            const prompts = yield* Queue.unbounded<SDKUserMessage>();
            const abort = new AbortController();
            const sessionId = input.options.sessionId ?? input.options.resume ?? "";
            const promptStream = Stream.fromQueue(prompts).pipe(Stream.toAsyncIterable);
            let contextUsage: SDKControlGetContextUsageResponse | undefined;
            return {
              messages: Stream.fromAsyncIterable(
                playTurns(
                  script,
                  promptStream,
                  sessionId,
                  input.options.canUseTool,
                  input.options.mcpServers?.["control"] as McpServer | undefined,
                  input.options.env,
                  abort.signal,
                  (report) => {
                    contextUsage = report;
                  },
                ),
                runnerError("messages"),
              ),
              getContextUsage: Effect.suspend(() =>
                contextUsage === undefined
                  ? Effect.fail(runnerError("getContextUsage")("The script has no context report."))
                  : Effect.succeed(contextUsage),
              ),
              offer: (message) => Queue.offer(prompts, message).pipe(Effect.asVoid),
              setModel: () => Effect.void,
              setPermissionMode: () => Effect.void,
              interrupt: Effect.sync(() => abort.abort()),
              close: Queue.shutdown(prompts).pipe(Effect.andThen(Effect.sync(() => abort.abort()))),
            } satisfies ClaudeAgentSdkQuerySession;
          }),
        forkSession: () =>
          Effect.fail(runnerError("forkSession")("The Claude script cannot fork.")),
        subagentLaunchToolUseId: () => Effect.succeed(null),
        assertComplete: Effect.void,
      });
    }),
  );

const scriptPathConfig = Config.String("CONTROL_SCRIPTED_CLAUDE").pipe(Config.option, Effect.orDie);

/** The live runner, or the scripted one when `CONTROL_SCRIPTED_CLAUDE` is set. */
export const layer = Layer.unwrap(
  Effect.gen(function* () {
    const scriptPath = yield* scriptPathConfig;
    return scriptPath._tag === "Some" ? layerScripted(scriptPath.value) : layerQueryRunner;
  }),
);

/**
 * What ClaudeDriver's capabilities probe answers when `CONTROL_SCRIPTED_CLAUDE`
 * is set: the script's usage, with no account or commands, in place of spawning
 * `claude`. `undefined` without a script, so the live probe runs.
 */
export const scriptedCapabilitiesProbe = Effect.gen(function* () {
  const scriptPath = yield* scriptPathConfig;
  if (scriptPath._tag === "None") return undefined;
  const script = JSON.parse(NodeFS.readFileSync(scriptPath.value, "utf8")) as ClaudeScript;
  return {
    email: undefined,
    subscriptionType: undefined,
    tokenSource: undefined,
    apiProvider: "firstParty",
    slashCommands: [],
    ...(script.usage ? { usage: script.usage } : {}),
  };
});
