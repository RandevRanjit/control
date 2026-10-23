// A stand-in for llama-server in the local-model tests; it never loads a model. Like llama-server
// it serves /v1/chat/completions and Anthropic's /v1/messages, which a chat's claude calls.
// It takes llama-server's -m, --host and --port, plus:
//   --fake-load-ms <ms>        /health answers 503 until then, as while loading
//   --fake-ignore-sigterm      only SIGKILL ends it
//   --fake-ctx <tokens>        a request over it fails as exceed_context_size_error
//   --fake-log-requests <file> appends each completion request's body
import * as NodeFS from "node:fs";
import * as NodeHttp from "node:http";

const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
if (args.includes("--fake-ignore-sigterm")) process.on("SIGTERM", () => {});

const loadMs = Number(flag("--fake-load-ms") ?? 0);
const contextTokens = Number(flag("--fake-ctx") ?? Infinity);
const requestsLog = flag("--fake-log-requests");
const started = Date.now();

const json = (response, status, body) => {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
};

NodeHttp.createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    return Date.now() - started >= loadMs
      ? json(response, 200, { status: "ok" })
      : json(response, 503, { error: { code: 503, message: "Loading model" } });
  }
  if (request.method === "POST" && request.url === "/v1/chat/completions") {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      if (requestsLog !== undefined) NodeFS.appendFileSync(requestsLog, `${body}\n`);
      // About four characters a token, like the real tokenizer on English text.
      const promptTokens = Math.ceil(body.length / 4);
      if (promptTokens > contextTokens) {
        return json(response, 400, {
          error: {
            code: 400,
            message: "the request exceeds the available context size, try increasing it",
            type: "exceed_context_size_error",
            n_prompt_tokens: promptTokens,
            n_ctx: contextTokens,
          },
        });
      }
      const { messages } = JSON.parse(body);
      json(response, 200, {
        choices: [
          {
            message: { role: "assistant", content: `read ${messages.length} messages` },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: promptTokens, completion_tokens: 3 },
      });
    });
    return;
  }
  if (request.method === "POST" && request.url?.startsWith("/v1/messages")) {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      if (requestsLog !== undefined) NodeFS.appendFileSync(requestsLog, `${body}\n`);
      const inputTokens = Math.ceil(body.length / 4);
      if (request.url === "/v1/messages/count_tokens") {
        return json(response, 200, { input_tokens: inputTokens });
      }
      const { messages, model, stream } = JSON.parse(body);
      const text = `Fake model here: read ${messages.length} messages.`;
      const usage = { input_tokens: inputTokens, output_tokens: 8 };
      const message = { id: "msg_fake", type: "message", role: "assistant", model };
      if (!stream) {
        return json(response, 200, {
          ...message,
          content: [{ type: "text", text }],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage,
        });
      }
      response.writeHead(200, { "content-type": "text/event-stream" });
      const send = (data) =>
        response.write(`event: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`);
      send({
        type: "message_start",
        message: { ...message, content: [], stop_reason: null, stop_sequence: null, usage },
      });
      send({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
      send({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text } });
      send({ type: "content_block_stop", index: 0 });
      send({
        type: "message_delta",
        delta: { stop_reason: "end_turn", stop_sequence: null },
        usage: { output_tokens: 8 },
      });
      send({ type: "message_stop" });
      response.end();
    });
    return;
  }
  json(response, 404, { error: { code: 404, message: "Not found" } });
}).listen(Number(flag("--port")), flag("--host") ?? "127.0.0.1");
