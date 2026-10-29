// @effect-diagnostics nodeBuiltinImport:off - The test writes the script file the runner reads.
import * as NodeFS from "node:fs";
import * as NodeHttp from "node:http";
import type * as NodeNet from "node:net";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { ThreadId } from "@control/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import { ClaudeAgentSdkQueryRunner, type ClaudeAgentSdkQueryOpenInput } from "./ClaudeAdapterV2.ts";
import { layerScripted } from "./ClaudeScriptedQueryRunner.ts";

const prompt = (text: string): SDKUserMessage => ({
  type: "user",
  message: { role: "user", content: text },
  parent_tool_use_id: null,
});

function scriptFile(turns: Record<string, ReadonlyArray<unknown>>): string {
  const dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "claude-script-"));
  const file = NodePath.join(dir, "script.json");
  NodeFS.writeFileSync(file, JSON.stringify({ turns }));
  return file;
}

const openInput = {
  options: { sessionId: "session-1", model: "claude-opus-5-5" },
  threadId: ThreadId.make("thread-1"),
  providerSessionId: "provider-session-1",
} as unknown as ClaudeAgentSdkQueryOpenInput;

describe("ClaudeScriptedQueryRunner", () => {
  it.effect("plays the scripted frames for each offered prompt, stamped with the session", () =>
    Effect.gen(function* () {
      const runner = yield* ClaudeAgentSdkQueryRunner;
      const session = yield* runner.open(openInput);
      yield* session.offer(prompt("first"));
      yield* session.offer(prompt("second"));
      const messages = yield* session.messages.pipe(Stream.take(3), Stream.runCollect);
      assert.deepStrictEqual(
        Array.from(messages, (message) => [message.type, message.session_id]),
        [
          ["system", "session-1"],
          ["result", "session-1"],
          ["assistant", "session-1"],
        ],
      );
    }).pipe(
      Effect.provide(
        layerScripted(
          scriptFile({
            first: [
              { type: "system", subtype: "init" },
              { type: "delay", ms: 1 },
              { type: "result" },
            ],
            second: [{ type: "assistant", message: { content: [] } }],
          }),
        ).pipe(Layer.provide(NodeServices.layer)),
      ),
    ),
  );

  it.effect("expands the MCP headers' ${VAR} references from the environment, as Claude does", () =>
    Effect.gen(function* () {
      const seen: Array<string | undefined> = [];
      const server = NodeHttp.createServer((request, response) => {
        seen.push(request.headers.authorization);
        request.resume();
        request.on("end", () => {
          response.setHeader("content-type", "application/json");
          response.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} }));
        });
      });
      yield* Effect.acquireRelease(
        Effect.promise(
          () => new Promise<void>((done) => server.listen(0, "127.0.0.1", () => done())),
        ),
        () => Effect.promise(() => new Promise<void>((done) => server.close(() => done()))),
      );
      const { port } = server.address() as NodeNet.AddressInfo;
      const runner = yield* ClaudeAgentSdkQueryRunner;
      const session = yield* runner.open({
        ...openInput,
        options: {
          ...openInput.options,
          env: { CONTROL_MCP_AUTHORIZATION: "Bearer scripted-token" },
          mcpServers: {
            control: {
              type: "http",
              url: `http://127.0.0.1:${port}/mcp`,
              headers: { Authorization: "${CONTROL_MCP_AUTHORIZATION}" },
            },
          },
        },
      });
      yield* session.offer(prompt("first"));
      yield* session.messages.pipe(Stream.take(1), Stream.runDrain);
      assert.deepStrictEqual(seen, ["Bearer scripted-token", "Bearer scripted-token"]);
    }).pipe(
      Effect.scoped,
      Effect.provide(
        layerScripted(
          scriptFile({
            first: [{ type: "mcp.call", tool: "thread_list", arguments: {} }, { type: "result" }],
          }),
        ).pipe(Layer.provide(NodeServices.layer)),
      ),
    ),
  );

  it.effect("answers getContextUsage with the last scripted report", () =>
    Effect.gen(function* () {
      const runner = yield* ClaudeAgentSdkQueryRunner;
      const session = yield* runner.open(openInput);
      const before = yield* Effect.flip(session.getContextUsage!);
      assert.strictEqual(before.method, "getContextUsage");
      yield* session.offer(prompt("first"));
      yield* session.messages.pipe(Stream.take(1), Stream.runDrain);
      const report = yield* session.getContextUsage!;
      assert.strictEqual(report.totalTokens, 320_315);
    }).pipe(
      Effect.provide(
        layerScripted(
          scriptFile({
            first: [
              {
                type: "context.usage",
                report: { totalTokens: 320_315, maxTokens: 1_000_000 },
              },
              { type: "result" },
            ],
          }),
        ).pipe(Layer.provide(NodeServices.layer)),
      ),
    ),
  );
});
