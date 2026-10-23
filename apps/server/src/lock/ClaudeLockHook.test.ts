// @effect-diagnostics nodeBuiltinImport:off globalDate:off preferSchemaOverJson:off - runs the real hook with sh, as terminal claude does.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { assert, describe, it } from "@effect/vitest";

import { CONTROL_CHAT_ENV, lockHookScript } from "./ClaudeLockHook.ts";

const HOUR = 60 * 60 * 1000;

/** Runs the hook in UTC against a lock file ending at `until`, or none. */
function runHook(until: string | null, env: Record<string, string> = {}) {
  const directory = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "control-lock-hook-"));
  try {
    // A quote in the path, as a home folder may have.
    const lockPath = NodePath.join(directory, "it's", "lock.json");
    NodeFS.mkdirSync(NodePath.dirname(lockPath));
    if (until !== null) NodeFS.writeFileSync(lockPath, `${JSON.stringify({ until })}\n`);
    const script = NodePath.join(directory, "lock-hook.sh");
    NodeFS.writeFileSync(script, lockHookScript(lockPath));
    const result = NodeChildProcess.spawnSync("sh", [script], {
      input: JSON.stringify({ hook_event_name: "UserPromptSubmit", prompt: "hi" }),
      env: { PATH: process.env.PATH ?? "", TZ: "UTC", ...env },
      encoding: "utf8",
    });
    assert.strictEqual(result.status, 0, result.stderr);
    return result.stdout;
  } finally {
    NodeFS.rmSync(directory, { recursive: true, force: true });
  }
}

const iso = (ms: number) => new Date(ms).toISOString();
const refusal = (at: string) => ({
  decision: "block",
  reason: `CONTROL is locked until ${at}. Nothing lifts it early.`,
});

describe("terminal claude's lock hook", () => {
  it("refuses a prompt during a lock, with the end time", () => {
    const end = Date.now() + HOUR;
    const at = iso(end).slice(11, 16);
    const today = iso(end).slice(0, 10) === iso(Date.now()).slice(0, 10);
    assert.deepStrictEqual(JSON.parse(runHook(iso(end))), refusal(today ? at : `${at} tomorrow`));
  });

  it("says tomorrow when the lock ends after midnight", () => {
    const now = new Date();
    const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 10, 0);
    assert.deepStrictEqual(JSON.parse(runHook(iso(end))), refusal("10:00 tomorrow"));
  });

  it("lets the prompt through after the lock, with no lock, and in CONTROL's own chats", () => {
    assert.strictEqual(runHook(iso(Date.now() - 1000)), "");
    assert.strictEqual(runHook(null), "");
    assert.strictEqual(runHook(iso(Date.now() + HOUR), { [CONTROL_CHAT_ENV]: "1" }), "");
  });
});
