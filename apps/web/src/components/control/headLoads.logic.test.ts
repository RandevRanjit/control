import { describe, expect, it } from "vite-plus/test";

import { filterLoadTree, loadTree } from "./headLoads.logic";

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

describe("loadTree", () => {
  it("counts the hooks by event when the handlers weren't recorded", () => {
    expect(loadTree({ names }, "hooks")).toEqual([
      { id: "hook:PreToolUse", name: "PreToolUse", caption: "1" },
      { id: "hook:SessionStart", name: "SessionStart", caption: "1" },
      { id: "hook:Stop", name: "Stop", caption: "3" },
    ]);
  });

  it("folds each event open to its hooks: what runs, its matcher and where it is set", () => {
    const hookHandlers = [
      { event: "PreToolUse", matcher: "Read", command: "python3 dispatch.py", source: "user" },
      { event: "SessionEnd", command: "bash handoff.sh", source: "user" },
      { event: "PreToolUse", matcher: "Bash", command: "python3 dispatch.py", source: "lint" },
    ];
    expect(loadTree({ names: { ...names, hookHandlers } }, "hooks")).toEqual([
      {
        id: "hook:PreToolUse",
        name: "PreToolUse",
        caption: "2",
        children: [
          {
            id: "handler:PreToolUse:0",
            name: "python3 dispatch.py",
            code: true,
            description: "Read · user",
          },
          {
            id: "handler:PreToolUse:1",
            name: "python3 dispatch.py",
            code: true,
            description: "Bash · lint",
          },
        ],
      },
      {
        id: "hook:SessionEnd",
        name: "SessionEnd",
        caption: "1",
        children: [
          { id: "handler:SessionEnd:0", name: "bash handoff.sh", code: true, description: "user" },
        ],
      },
    ]);
  });

  it("gives each MCP server its status, source and switch, folding open to its tools", () => {
    const mcpServers = [
      {
        name: "linear",
        status: "failed",
        source: "project",
        tools: [],
        error: "Connection refused",
      },
      {
        name: "github",
        status: "connected",
        source: "user",
        tools: ["get_pr", "delete_repo"],
        toolHints: { get_pr: "read-only", delete_repo: "destructive" } as const,
      },
      { name: "control", status: "connected", source: "dynamic", tools: [] },
      { name: "claude.ai Drive", status: "needs-auth", source: "claudeai", tools: [] },
    ];
    expect(loadTree({ names: { ...names, mcpServers } }, "mcpServers")).toEqual([
      {
        id: "server:claude.ai Drive",
        name: "claude.ai Drive",
        status: "needs-auth",
        caption: "claude.ai",
        toggle: {
          loadSwitch: { kind: "mcpServer", name: "claude.ai Drive" },
          on: true,
          pending: false,
        },
        signIn: true,
      },
      // CONTROL's own server has no switch.
      { id: "server:control", name: "control", status: "connected", caption: "CONTROL" },
      {
        id: "server:github",
        name: "github",
        status: "connected",
        caption: "user · 2",
        toggle: { loadSwitch: { kind: "mcpServer", name: "github" }, on: true, pending: false },
        children: [
          { id: "tool:github:delete_repo", name: "delete_repo", code: true, hint: "destructive" },
          { id: "tool:github:get_pr", name: "get_pr", code: true, hint: "read-only" },
        ],
      },
      {
        id: "server:linear",
        name: "linear",
        status: "failed",
        caption: "project",
        description: "Connection refused",
        toggle: { loadSwitch: { kind: "mcpServer", name: "linear" }, on: true, pending: false },
      },
    ]);
  });

  it("keeps a switched-off server listed, and says when the next turn applies a switch", () => {
    const mcpServers = [
      { name: "github", status: "connected", source: "user", tools: [] },
      { name: "linear", status: "connected", source: "user", tools: [] },
    ];
    // The session started without tavily and jira; the chat now wants github and tavily off.
    const loads = {
      names: { ...names, mcpServers, off: { mcpServers: ["tavily", "jira"], plugins: [] } },
    };
    const off = { mcpServers: ["github", "tavily"], plugins: [] };
    const rows = loadTree(loads, "mcpServers", off)!;
    expect(rows.map((row) => [row.name, row.status, row.toggle?.on, row.toggle?.pending])).toEqual([
      ["github", "connected", false, true],
      ["jira", "disabled", true, true],
      ["linear", "connected", true, false],
      ["tavily", "disabled", false, false],
    ]);
  });

  it("lists the owner's skills with what they do and where they come from, then each plugin's", () => {
    const skills = [
      "review",
      "pocock:tdd",
      "anthropic-skills:pdf",
      "plan",
      "anthropic-skills:docx",
    ];
    const about = {
      skills: {
        review: { description: "Reviews a change.", source: "user" },
        plan: { source: "project" },
        "pocock:tdd": { description: "Test first.", source: "pocock" },
      },
      agents: {},
      plugins: { pocock: { description: "Matt's skills.", id: "pocock@mattpocock" } },
    };
    expect(loadTree({ names: { ...names, skills, about } }, "skills")).toEqual([
      { id: "skill:plan", name: "plan", caption: "project", compose: "/plan " },
      {
        id: "skill:review",
        name: "review",
        description: "Reviews a change.",
        caption: "user",
        compose: "/review ",
      },
      {
        id: "plugin:anthropic-skills",
        name: "anthropic-skills",
        caption: "2",
        children: [
          { id: "skill:anthropic-skills:docx", name: "docx", compose: "/anthropic-skills:docx " },
          { id: "skill:anthropic-skills:pdf", name: "pdf", compose: "/anthropic-skills:pdf " },
        ],
      },
      {
        id: "plugin:pocock",
        name: "pocock",
        description: "Matt's skills.",
        caption: "1",
        children: [
          {
            id: "skill:pocock:tdd",
            name: "tdd",
            description: "Test first.",
            compose: "/pocock:tdd ",
          },
        ],
      },
    ]);
  });

  it("gives each plugin its switch by id, folding open to its skills", () => {
    const skills = ["plan", "pocock:tdd", "pocock:grill"];
    const about = {
      skills: {},
      agents: {},
      plugins: { pocock: { description: "Matt's skills.", id: "pocock@mattpocock" } },
    };
    const loads = {
      names: {
        ...names,
        skills,
        plugins: ["pocock", "mcp-10"],
        about,
        off: { mcpServers: [], plugins: ["lint@tools"] },
      },
    };
    const rows = loadTree(loads, "plugins", { mcpServers: [], plugins: ["lint@tools"] })!;
    expect(rows).toEqual([
      // A plugin switched off is known by its id and listed to switch back on.
      {
        id: "plugin:lint",
        name: "lint",
        caption: "tools",
        status: "disabled",
        toggle: { loadSwitch: { kind: "plugin", name: "lint@tools" }, on: false, pending: false },
      },
      // Loads read before CONTROL knew plugin ids have no switch.
      { id: "plugin:mcp-10", name: "mcp-10" },
      {
        id: "plugin:pocock",
        name: "pocock",
        description: "Matt's skills.",
        caption: "mattpocock · 2",
        toggle: {
          loadSwitch: { kind: "plugin", name: "pocock@mattpocock" },
          on: true,
          pending: false,
        },
        children: [
          { id: "skill:pocock:grill", name: "grill", compose: "/pocock:grill " },
          { id: "skill:pocock:tdd", name: "tdd", compose: "/pocock:tdd " },
        ],
      },
    ]);
  });

  it("has no rows for loads recorded before the names", () => {
    expect(loadTree({}, "skills")).toBeNull();
  });
});

describe("filterLoadTree", () => {
  const tree = loadTree(
    {
      names: {
        ...names,
        mcpServers: [
          { name: "github", status: "connected", tools: ["get_pr", "create_issue"] },
          { name: "gmail", status: "connected", tools: ["send_message"] },
        ],
      },
    },
    "mcpServers",
  )!;

  it("keeps a matching server with all its tools", () => {
    expect(filterLoadTree(tree, "GIT").map((row) => [row.name, row.children?.length])).toEqual([
      ["github", 2],
    ]);
  });

  it("keeps a server only as the parent of the tools that match", () => {
    expect(
      filterLoadTree(tree, "issue").map((row) => [
        row.name,
        row.children?.map((tool) => tool.name),
      ]),
    ).toEqual([["github", ["create_issue"]]]);
  });

  it("matches what a row does, not only its name", () => {
    const skills = loadTree(
      {
        names: {
          ...names,
          about: {
            skills: { review: { description: "Reads a diff for bugs." } },
            agents: {},
            plugins: {},
          },
        },
      },
      "skills",
    )!;
    expect(filterLoadTree(skills, "diff").map((row) => row.name)).toEqual(["review"]);
  });
});
