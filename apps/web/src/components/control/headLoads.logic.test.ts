import { describe, expect, it } from "vite-plus/test";

import { loadRows } from "./headLoads.logic";

const names = {
  hooks: ["Stop", "PreToolUse", "Stop", "SessionStart", "Stop"],
  skills: ["review", "plan", "deai-writing"],
  mcpServers: [
    { name: "linear", status: "failed" },
    { name: "control", status: "connected" },
  ],
  plugins: ["playwright"],
  agents: ["Explore", "claude"],
};

describe("loadRows", () => {
  it("counts the hooks by event when the handlers weren't recorded", () => {
    expect(loadRows({ names }, "hooks")).toEqual([
      { name: "PreToolUse", detail: "1" },
      { name: "SessionStart", detail: "1" },
      { name: "Stop", detail: "3" },
    ]);
  });

  it("folds each event open to its hooks: what runs, its matcher and where it is set", () => {
    const hookHandlers = [
      { event: "PreToolUse", matcher: "Read", command: "python3 dispatch.py", source: "user" },
      { event: "SessionEnd", command: "bash handoff.sh", source: "user" },
      { event: "PreToolUse", matcher: "Bash", command: "python3 dispatch.py", source: "lint" },
    ];
    expect(loadRows({ names: { ...names, hookHandlers } }, "hooks")).toEqual([
      {
        name: "PreToolUse",
        detail: "2",
        lines: [
          { name: "python3 dispatch.py", detail: "Read · user" },
          { name: "python3 dispatch.py", detail: "Bash · lint" },
        ],
      },
      { name: "SessionEnd", detail: "1", lines: [{ name: "bash handoff.sh", detail: "user" }] },
    ]);
  });

  it("gives each MCP server its status, folding open to its tools", () => {
    const mcpServers = [
      { name: "linear", status: "failed", tools: [] },
      { name: "control", status: "connected", tools: ["thread_send", "lock_read"] },
    ];
    expect(loadRows({ names: { ...names, mcpServers } }, "mcpServers")).toEqual([
      {
        name: "control",
        status: "connected",
        detail: "2",
        lines: [{ name: "lock_read" }, { name: "thread_send" }],
      },
      { name: "linear", status: "failed" },
    ]);
  });

  it("keeps the owner's own skills listed and folds each plugin's under it", () => {
    const skills = [
      "review",
      "pocock:tdd",
      "anthropic-skills:pdf",
      "plan",
      "anthropic-skills:docx",
    ];
    expect(loadRows({ names: { ...names, skills } }, "skills")).toEqual([
      { name: "plan" },
      { name: "review" },
      {
        name: "anthropic-skills",
        detail: "2",
        lines: [{ name: "docx" }, { name: "pdf" }],
      },
      { name: "pocock", detail: "1", lines: [{ name: "tdd" }] },
    ]);
  });

  it("folds each plugin open to the skills it adds", () => {
    const skills = ["plan", "pocock:tdd", "pocock:grill"];
    expect(
      loadRows({ names: { ...names, skills, plugins: ["pocock", "mcp-10", "mcp-2"] } }, "plugins"),
    ).toEqual([
      { name: "mcp-2" },
      { name: "mcp-10" },
      { name: "pocock", detail: "2", lines: [{ name: "grill" }, { name: "tdd" }] },
    ]);
  });

  it("has no rows for loads recorded before the names", () => {
    expect(loadRows({}, "skills")).toBeNull();
  });
});
