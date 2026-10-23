import type { OrchestrationV2TurnItem } from "@control/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { WorkLogEntry } from "../../session-logic";
import { resolveStackCall } from "./stackCall";

const ROOT = "/repo";

function call(
  fields: Record<string, unknown>,
  lifecycle: WorkLogEntry["toolLifecycleStatus"] = "completed",
): WorkLogEntry {
  const item = {
    id: "item-1",
    threadId: "thread-1",
    runId: null,
    nodeId: null,
    providerThreadId: null,
    providerTurnId: null,
    nativeItemRef: null,
    parentItemId: null,
    ordinal: 0,
    status:
      lifecycle === "failed" ? "failed" : lifecycle === "inProgress" ? "running" : "completed",
    title: null,
    startedAt: null,
    completedAt: null,
    updatedAt: {},
    ...fields,
  } as unknown as OrchestrationV2TurnItem;
  return {
    id: "entry-1",
    createdAt: "2026-01-01T00:00:00Z",
    label: "Tool call",
    tone: lifecycle === "failed" ? "error" : "tool",
    itemType: item.type,
    toolLifecycleStatus: lifecycle,
    structuredPayload: item,
  };
}

describe("resolveStackCall", () => {
  it("names a local model call by the model and its files, with the time and the answer's length", () => {
    const run = call({
      type: "dynamic_tool",
      toolName: "mcp__control__local_model_run",
      input: { model: "qwen-27b", instruction: "Summarise.", files: ["/r"] },
      output: { structuredContent: { files: 14, seconds: 38, tokensOut: 1900 } },
    });
    expect(resolveStackCall(run, ROOT, "Ran a local model")).toEqual({
      kind: "agent",
      name: "Local model",
      target: "run qwen-27b · 14 files",
      meta: "38s · 1.9k out",
      running: false,
    });
    const refused = call({
      type: "dynamic_tool",
      toolName: "mcp__control__local_model_wake",
      input: { model: "llama-70b" },
      output: { isError: true, structuredContent: { message: "needs 42 GB · 31 GB to spare" } },
    });
    expect(resolveStackCall(refused, ROOT, "Failed to wake a local model")).toMatchObject({
      kind: "error",
      name: "Local model",
      target: "wake llama-70b",
      meta: "needs 42 GB · 31 GB to spare",
    });
  });

  it("names a write by its path from the workspace root and counts its lines", () => {
    const edit = call({
      type: "file_change",
      fileName: `${ROOT}/lib/a.ts`,
      additions: 2,
      deletions: 1,
    });
    expect(resolveStackCall(edit, ROOT, "Edited a.ts")).toEqual({
      kind: "write",
      name: "Write",
      target: "lib/a.ts",
      meta: { added: 2, removed: 1 },
      running: false,
    });
  });

  it("names a failed write Edit and shows the first line of its error", () => {
    const failed = call(
      { type: "file_change", fileName: "app/admin/page.tsx", diffStr: "\nString not found\nmore" },
      "failed",
    );
    expect(resolveStackCall(failed, ROOT, "Edit failed")).toMatchObject({
      kind: "error",
      name: "Edit",
      target: "app/admin/page.tsx",
      meta: "String not found",
    });
  });

  it("shows the summary the wire keeps for a read whose output it withheld", () => {
    const read = call({
      type: "dynamic_tool",
      toolName: "Read",
      input: { file_path: `${ROOT}/src/env.ts` },
      outputOmitted: true,
      outputSummary: "64 lines",
    });
    expect(resolveStackCall(read, ROOT, "Read env.ts")).toMatchObject({
      kind: "read",
      name: "Read",
      target: "src/env.ts",
      meta: "64 lines",
    });
  });

  it.each([
    [{ outputOmitted: true, outputSummary: "Found 0 warnings" }, "Found 0 warnings"],
    [{ output: "\n  ok\nnext" }, "ok"],
    [{}, "no output"],
    // Withheld output from before summaries: nothing to show.
    [{ outputOmitted: true }, ""],
  ])("gives a finished command its first line of output, case %#", (fields, meta) => {
    const bash = call({ type: "command_execution", input: "vp lint", ...fields });
    expect(resolveStackCall(bash, ROOT, "Ran vp lint")).toMatchObject({
      kind: "run",
      name: "Bash",
      target: "vp lint",
      meta,
    });
  });

  it("marks a running command", () => {
    const bash = call({ type: "command_execution", input: "vp test run" }, "inProgress");
    expect(resolveStackCall(bash, ROOT, "Running vp test run")).toMatchObject({
      target: "vp test run",
      meta: "",
      running: true,
    });
  });

  it.each([
    [
      "mcp__control__preview_navigate",
      { url: "http://localhost:3000" },
      "open http://localhost:3000",
    ],
    ["mcp__control__preview_snapshot", {}, "read the page"],
    ["mcp__control__preview_snapshot", { selector: "#hero" }, "read #hero"],
  ])("names browser call %s by what it opens or reads", (toolName, input, target) => {
    const browser = call({ type: "dynamic_tool", toolName, input });
    expect(resolveStackCall(browser, ROOT, "Browser")).toMatchObject({
      kind: "web",
      name: "Browser",
      target,
    });
  });
});
