// @effect-diagnostics nodeBuiltinImport:off globalTimers:off globalDate:off globalFetch:off globalConsole:off preferSchemaOverJson:off anyUnknownInErrorContext:off missingEffectError:off - Host-side harness: it owns processes, files and timers.
/**
 * The design check's first half: boots a sandbox
 * server with a scripted Claude, creates design v1.2's fixture through it, and
 * keeps serving until stopped, so `shoot.ts` can render the web build against it
 * as often as needed. The server serves apps/web/dist, so rebuild that and shoot again.
 *
 * Run from the repository root, in the background:
 *   node apps/server/scripts/design-check/seed.ts
 * It writes SESSION_FILE once the fixture is in place. Nothing touches ~/.control or
 * ~/.claude: the server gets a temporary HOME and CONTROL_HOME, removed on exit.
 */
import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodeHttp from "node:http";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeUtil from "node:util";

import {
  CommandId,
  GroupId,
  MessageId,
  ORCHESTRATION_PROTOCOL_HEADER,
  ORCHESTRATION_PROTOCOL_VERSION,
  ProjectId,
  ThreadId,
  WsRpcGroup,
} from "@control/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { RpcClient, RpcClientError, RpcSerialization } from "effect/rpc";
import { Socket } from "effect/socket";

import {
  CHATS,
  GROUPS,
  HOOK_SETTINGS,
  PROJECTS,
  UNVERSIONED,
  clockFor,
  modelSelection,
  turns,
  usageFor,
  type Chat,
} from "./fixture.ts";

export const SESSION_FILE = NodePath.join(NodeOS.tmpdir(), "control-design-check.json");

const root = NodePath.resolve(import.meta.dirname, "../../../..");
const sandbox = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "control-design-check-"));
const home = NodePath.join(sandbox, "home");
console.log(`Sandbox: ${sandbox}`);
const stop = Promise.withResolvers<void>();
process.on("SIGINT", () => stop.resolve());
process.on("SIGTERM", () => stop.resolve());

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const git = (cwd: string, ...args: string[]) =>
  NodeChildProcess.execFileSync("git", ["-C", cwd, ...args], { stdio: "ignore" });

// ---------- workspaces and the scripted Claude ----------

NodeFS.mkdirSync(NodePath.join(home, ".claude"), { recursive: true });
NodeFS.writeFileSync(
  NodePath.join(home, ".claude", "settings.json"),
  JSON.stringify(HOOK_SETTINGS),
);

for (const [key, project] of Object.entries(PROJECTS)) {
  const dir = NodePath.join(home, project.dir);
  NodeFS.mkdirSync(dir, { recursive: true });
  NodeFS.writeFileSync(NodePath.join(dir, "README.md"), `# ${project.title}\n`);
  if (UNVERSIONED.includes(key)) continue;
  git(dir, "init", "-q", "-b", "main");
  git(dir, "add", ".");
  git(
    dir,
    "-c",
    "user.name=Design",
    "-c",
    "user.email=design@localhost",
    "commit",
    "-qm",
    "initial",
  );
}

// The selected chat's second turn starts at a set moment, so the shot can freeze the clock
// where the design's timers and usage resets read as drawn.
const clock = clockFor(Date.now() + 75_000);
const script = { turns: {} as Record<string, unknown>, usage: usageFor(clock) };
for (const chat of CHATS)
  for (const turn of turns(chat, clock)) script.turns[turn.prompt] = turn.frames;
const scriptPath = NodePath.join(sandbox, "claude-script.json");
NodeFS.writeFileSync(scriptPath, JSON.stringify(script));

// ---------- the server ----------

async function freePort(): Promise<number> {
  const server = NodeHttp.createServer().listen(0, "127.0.0.1");
  await new Promise<void>((done) => server.once("listening", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No port.");
  await new Promise<void>((done) => server.close(() => done()));
  return address.port;
}

const port = await freePort();
const origin = `http://127.0.0.1:${port}`;
const bootstrap = NodeCrypto.randomUUID();
let server: NodeChildProcess.ChildProcess | undefined;

async function startServer(): Promise<void> {
  const child = NodeChildProcess.spawn(
    process.execPath,
    ["apps/server/src/bin.ts", "start", "--bootstrap-fd", "3"],
    {
      cwd: root,
      env: {
        ...process.env,
        HOME: home,
        CONTROL_SCRIPTED_CLAUDE: scriptPath,
        CONTROL_TELEMETRY_ENABLED: "false",
      },
      stdio: ["ignore", "pipe", "pipe", "pipe"],
    },
  );
  server = child;
  const pipe = child.stdio[3];
  if (!pipe || !("write" in pipe)) throw new Error("No bootstrap pipe.");
  pipe.end(
    JSON.stringify({
      mode: "desktop",
      noBrowser: true,
      port,
      controlHome: NodePath.join(sandbox, "control"),
      host: "127.0.0.1",
      desktopBootstrapToken: bootstrap,
      tailscaleServeEnabled: false,
      tailscaleServePort: 443,
    }),
  );
  const ready = Promise.withResolvers<void>();
  let tail = "";
  for (const stream of [child.stdout, child.stderr])
    stream?.on("data", (data: Buffer) => {
      NodeFS.appendFileSync(NodePath.join(sandbox, "server.log"), data);
      tail = (tail + data.toString()).slice(-8192);
      if (tail.includes("Listening on http")) ready.resolve();
    });
  child.once("exit", (code) => ready.reject(new Error(`Server exited ${code}`)));
  const deadline = setTimeout(() => ready.reject(new Error("Server startup timed out")), 90_000);
  await ready.promise.finally(() => clearTimeout(deadline));
}

async function stopServer(): Promise<void> {
  const child = server;
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((done) => child.once("exit", done));
  child.kill("SIGTERM");
  // Held scripted turns can keep a graceful shutdown waiting.
  const force = setTimeout(() => child.kill("SIGKILL"), 10_000);
  await exited;
  clearTimeout(force);
}

async function accessToken(): Promise<string> {
  const response = await fetch(`${origin}/oauth/token`, {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      subject_token: bootstrap,
      subject_token_type: "urn:control:params:oauth:token-type:environment-bootstrap",
      requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
    }),
  });
  if (!response.ok) throw new Error(`Authentication failed: ${response.status}`);
  return ((await response.json()) as { access_token: string }).access_token;
}

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    [ORCHESTRATION_PROTOCOL_HEADER]: String(ORCHESTRATION_PROTOCOL_VERSION),
  };
}

async function post(token: string, path: string, body: unknown): Promise<unknown> {
  const response = await fetch(`${origin}${path}`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return response.json();
}

async function get(token: string, path: string): Promise<unknown> {
  const response = await fetch(`${origin}${path}`, { headers: headers(token) });
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return response.json();
}

/** Runs `use` with an RPC client on a fresh WebSocket. */
async function withRpc<A>(
  token: string,
  use: (
    client: RpcClient.FromGroup<typeof WsRpcGroup, RpcClientError.RpcClientError>,
  ) => Effect.Effect<A, unknown>,
): Promise<A> {
  const { ticket } = (await post(token, "/api/auth/websocket-ticket", {})) as { ticket: string };
  const layerSocket = Socket.layerWebSocket(
    `${origin.replace("http:", "ws:")}/ws?orchestrationProtocol=${ORCHESTRATION_PROTOCOL_VERSION}&wsTicket=${encodeURIComponent(ticket)}`,
  ).pipe(Layer.provide(Socket.layerWebSocketConstructorGlobal));
  const layerProtocol = RpcClient.layerProtocolSocket().pipe(
    Layer.provide(layerSocket),
    Layer.provide(RpcSerialization.layerJson),
  );
  return Effect.runPromise(
    Effect.scoped(Effect.flatMap(RpcClient.make(WsRpcGroup), use)).pipe(
      Effect.provide(layerProtocol),
    ),
  );
}

const command = () => CommandId.make(NodeCrypto.randomUUID());
const projectIds = new Map<string, ProjectId>();
const threadIds = new Map<string, ThreadId>();

async function launch(token: string, chat: Chat): Promise<void> {
  const threadId = ThreadId.make(NodeCrypto.randomUUID());
  threadIds.set(chat.name, threadId);
  const [first, ...rest] = turns(chat, clock);
  const launchedAt = new Date().toISOString();
  await withRpc(token, (client) =>
    client["orchestration.launchThread"]({
      commandId: command(),
      threadId,
      projectId: projectIds.get(chat.project)!,
      title: chat.name,
      generateTitle: false,
      modelSelection: modelSelection(chat),
      // An approval only waits when the chat asks before it acts.
      runtimeMode: chat.plan === "needs" ? "approval-required" : "full-access",
      interactionMode: "default",
      // A local chat records the checkout's branch, as the web's new-chat flow sends it.
      workspaceStrategy: chat.worktree
        ? { type: "worktree", baseRef: "main", branch: chat.worktree }
        : { type: "root", ...(UNVERSIONED.includes(chat.project) ? {} : { branch: "main" }) },
      ...(first ? { initialMessage: { text: first.prompt, attachments: [] } } : {}),
    } as never),
  );
  // The web opens a chat it starts, so its first finished turn arrives unseen.
  await dispatch(token, { type: "thread.visit", threadId, visitedAt: launchedAt });
  // The selected chat's second turn waits for the clock; any other chat's turns follow at once.
  if (!chat.selected) for (const turn of rest) await send(token, threadId, turn.prompt);
}

async function send(token: string, threadId: ThreadId, text: string): Promise<void> {
  await dispatch(token, {
    type: "message.dispatch",
    createdBy: "user",
    creationSource: "web",
    threadId,
    messageId: MessageId.make(NodeCrypto.randomUUID()),
    text,
    attachments: [],
    dispatchMode: { type: "queue_after_active" },
  });
}

async function dispatch(token: string, body: Record<string, unknown>): Promise<void> {
  await withRpc(token, (client) =>
    client["orchestration.dispatchCommand"]({ commandId: command(), ...body } as never),
  );
}

// ---------- the fixture ----------

try {
  await startServer();
  let token = await accessToken();
  for (const [key, project] of Object.entries(PROJECTS)) {
    const projectId = ProjectId.make(NodeCrypto.randomUUID());
    projectIds.set(key, projectId);
    await post(token, "/api/projects/mutate", {
      type: "project.create",
      commandId: command(),
      projectId,
      title: project.title,
      workspaceRoot: NodePath.join(home, project.dir),
    });
    await post(token, "/api/projects/mutate", {
      type: "project.update",
      commandId: command(),
      projectId,
      tint: project.tint,
    });
  }

  // An interrupted chat is a running turn cut by a restart, so it goes first.
  for (const chat of CHATS.filter((c) => c.plan === "interrupted")) await launch(token, chat);
  await sleep(3_000);
  await stopServer();
  await startServer();
  token = await accessToken();

  const groupIds = new Map<string, GroupId>();
  for (const group of GROUPS) {
    const groupId = GroupId.make(NodeCrypto.randomUUID());
    groupIds.set(group.id, groupId);
    await withRpc(token, (client) =>
      client["groups.mutate"]({
        type: "group.create",
        commandId: command(),
        groupId,
        name: group.name,
        tint: group.tint,
      } as never),
    );
  }
  await Promise.all(
    CHATS.filter((c) => c.plan !== "interrupted").map((chat) => launch(token, chat)),
  );

  // The sidebar order the design draws, set the way a drag sets it.
  for (const [index, chat] of CHATS.entries())
    await dispatch(token, {
      type: "thread.active.reorder",
      threadId: threadIds.get(chat.name),
      orderKey: `a${String(index).padStart(2, "0")}`,
    });

  // The selected chat's second turn follows its first, at the moment the clock was set for.
  const selected = CHATS.find((c) => c.selected)!;
  const second = turns(selected, clock)[1];
  if (Date.now() > clock.secondTurnAt) throw new Error("Seeding ran past the second turn's start.");
  await sleep(clock.secondTurnAt - Date.now());
  if (second) await send(token, threadIds.get(selected.name)!, second.prompt);

  for (const chat of CHATS) {
    const threadId = threadIds.get(chat.name);
    // Seen since its turn finished; the states v2 lacks are idle as well.
    if (["idle", "choose", "dreaming", "outside"].includes(chat.plan))
      await dispatch(token, {
        type: "thread.visit",
        threadId,
        visitedAt: new Date().toISOString(),
      });
    if (chat.group)
      await dispatch(token, {
        type: "thread.group.set",
        threadId,
        groupId: groupIds.get(chat.group),
      });
    if (chat.pinned) await dispatch(token, { type: "thread.pin", threadId });
    if (chat.snoozed)
      await dispatch(token, {
        type: "thread.snooze",
        threadId,
        snoozedUntil: new Date(Date.now() + 3 * 24 * 3_600_000).toISOString(),
      });
  }
  await sleep(Math.max(0, clock.shownAt + 2_000 - Date.now()));
  const descriptor = (await get(token, "/.well-known/control/environment")) as {
    environmentId: string;
  };
  NodeFS.writeFileSync(
    SESSION_FILE,
    JSON.stringify({
      origin,
      bootstrap,
      environmentId: descriptor.environmentId,
      selectedThreadId: threadIds.get(selected.name),
      shownAt: clock.shownAt,
      sandbox,
    }),
  );
  console.log(`Seeded: ${SESSION_FILE}`);
  await stop.promise;
} catch (error) {
  console.error(NodeUtil.inspect(error, { depth: 20 }));
  process.exitCode = 1;
} finally {
  await stopServer();
  NodeFS.rmSync(SESSION_FILE, { force: true });
  NodeFS.rmSync(sandbox, { recursive: true, force: true });
}
