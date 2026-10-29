// @effect-diagnostics nodeBuiltinImport:off -- the fake CLI and its leftover child are real processes.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import { ProviderSessionId, ThreadId } from "@control/contracts";
import { HostProcessPlatform } from "@control/shared/hostProcess";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";

import { signalProcessGroup } from "../../process/processGroup.ts";
import * as ProviderEventLoggers from "../../provider/ProviderEventLoggers.ts";
import {
  ClaudeAgentSdkQueryRunner,
  layerQueryRunner,
  makeClaudeUserMessage,
  spawnClaudeProcessGroup,
} from "./ClaudeAdapterV2.ts";

const realQueryRunner = layerQueryRunner.pipe(
  Layer.provide(
    Layer.succeed(
      ProviderEventLoggers.ProviderEventLoggers,
      ProviderEventLoggers.NoOpProviderEventLoggers,
    ),
  ),
  Layer.provide(NodeServices.layer),
);

/** Writes an executable stand-in for the Claude CLI into a fresh directory. */
function fakeClaudeCli(script: string): string {
  const dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "control-claude-cli-"));
  const cli = NodePath.join(dir, "claude");
  NodeFS.writeFileSync(cli, `#!/bin/sh\n${script}\n`, { mode: 0o755 });
  return cli;
}

const openFakeCli = (cli: string) =>
  Effect.gen(function* () {
    const runner = yield* ClaudeAgentSdkQueryRunner;
    return yield* runner.open({
      threadId: ThreadId.make("thread-fake-cli"),
      providerSessionId: ProviderSessionId.make("session-fake-cli"),
      options: {
        sessionId: "native-session-fake-cli",
        model: "claude-sonnet-4-6",
        tools: [],
        permissionMode: "default",
        pathToClaudeCodeExecutable: cli,
      },
    });
  });

describe.skipIf(HostProcessPlatform.defaultValue() === "win32")("Claude CLI process", () => {
  // The CLI stops the MCP servers it started, but not their children: a
  // plugin's `bun server.ts` outlives its `bun run` wrapper (#3089). The fake
  // CLI leaves a child running the same way. The child holds a FIFO open, so
  // its death reads as end-of-file here, with no polling.
  it.effect("stops what the CLI left running when the session closes", () =>
    Effect.gen(function* () {
      const cli = fakeClaudeCli(
        [
          'dir=$(dirname "$0")',
          'sleep 600 > "$dir/alive" &',
          'echo $! > "$dir/leftover.pid"',
          "cat > /dev/null",
        ].join("\n"),
      );
      const dir = NodePath.dirname(cli);
      NodeChildProcess.execFileSync("mkfifo", [NodePath.join(dir, "alive")]);
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          // Only does anything when the test fails: do not leak its child.
          try {
            process.kill(Number(NodeFS.readFileSync(NodePath.join(dir, "leftover.pid"), "utf8")));
          } catch {}
          NodeFS.rmSync(dir, { recursive: true, force: true });
        }),
      );
      const alive = NodeFS.createReadStream(NodePath.join(dir, "alive"));
      const leftoverStarted = new Promise<void>((resolve) => alive.once("open", () => resolve()));
      const leftoverStopped = new Promise<void>((resolve) => alive.once("close", () => resolve()));
      alive.resume();

      const session = yield* openFakeCli(cli);
      yield* Effect.promise(() => leftoverStarted);
      yield* session.close;
      yield* Effect.promise(() => leftoverStopped);
    }).pipe(Effect.scoped, Effect.provide(realQueryRunner)),
  );

  // The CLI keeps running its turn after its pipes close, so a server that
  // crashed would leave it working next to the session it resumes (#23370).
  it.effect("stops the CLI when the server that started it goes away", () =>
    Effect.gen(function* () {
      const cli = fakeClaudeCli(['dir=$(dirname "$0")', 'sleep 600 > "$dir/alive"'].join("\n"));
      const dir = NodePath.dirname(cli);
      NodeChildProcess.execFileSync("mkfifo", [NodePath.join(dir, "alive")]);
      const child = spawnClaudeProcessGroup({
        command: cli,
        args: [],
        cwd: dir,
        env: process.env,
        signal: new AbortController().signal,
      }) as NodeChildProcess.ChildProcess;
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          try {
            signalProcessGroup(child.pid ?? 0, "SIGKILL");
          } catch {}
          NodeFS.rmSync(dir, { recursive: true, force: true });
        }),
      );
      const alive = NodeFS.createReadStream(NodePath.join(dir, "alive"));
      const turnStarted = new Promise<void>((resolve) => alive.once("open", () => resolve()));
      const turnStopped = new Promise<void>((resolve) => alive.once("close", () => resolve()));
      alive.resume();
      yield* Effect.promise(() => turnStarted);

      // A dying server's descriptors close; the kernel would do this for it.
      for (const pipe of child.stdio) pipe?.destroy();
      yield* Effect.promise(() => turnStopped);
    }).pipe(Effect.scoped),
  );

  // A send's attachment budget is committed once its prompt is queued. The
  // protocol log after it can be interrupted; the commit must not be lost.
  it.effect("reports a queued prompt before the interruptible protocol log", () =>
    Effect.gen(function* () {
      const cli = fakeClaudeCli("cat > /dev/null");
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => NodeFS.rmSync(NodePath.dirname(cli), { recursive: true, force: true })),
      );
      const logging = yield* Deferred.make<void>();
      let queued = false;
      const session = yield* openFakeCli(cli).pipe(
        Effect.provide(
          layerQueryRunner.pipe(
            Layer.provide(
              Layer.succeed(ProviderEventLoggers.ProviderEventLoggers, {
                ...ProviderEventLoggers.NoOpProviderEventLoggers,
                native: {
                  filePath: "/tmp/claude-queued-delivery.log",
                  write: () =>
                    queued
                      ? Deferred.succeed(logging, undefined).pipe(Effect.andThen(Effect.never))
                      : Effect.void,
                  close: () => Effect.void,
                },
              }),
            ),
            Layer.provide(NodeServices.layer),
          ),
        ),
      );
      const offering = yield* session
        .offer(makeClaudeUserMessage({ text: "Inspect the attachment." }), () => {
          queued = true;
        })
        .pipe(Effect.forkChild);
      yield* Deferred.await(logging);
      yield* Fiber.interrupt(offering);
      assert.isTrue(queued);
      queued = false;
      yield* session.close;
    }).pipe(Effect.scoped),
  );
});
