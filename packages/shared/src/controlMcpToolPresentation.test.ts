import { describe, expect, it } from "vite-plus/test";

import {
  CONTROL_MCP_TOOL_NAMES,
  resolveControlMcpToolDefinition,
  resolveControlMcpToolId,
  resolveControlMcpToolPresentation,
  resolveControlMcpToolSummaryAction,
} from "./controlMcpToolPresentation.ts";

describe("resolveControlMcpToolPresentation", () => {
  it("recognizes every Control tool across provider prefixes and completion suffixes", () => {
    for (const tool of CONTROL_MCP_TOOL_NAMES) {
      const presentation = resolveControlMcpToolPresentation(tool);
      for (const prefix of [
        "mcp__control__",
        "Control.",
        "control/",
        "control:",
        "mcp_control_",
        "Control ",
        "control · ",
      ]) {
        expect(resolveControlMcpToolPresentation(`${prefix}${tool} completed`), tool).toEqual(
          presentation,
        );
      }
      expect(resolveControlMcpToolPresentation(`mcp__another-server__${tool}`), tool).toBeNull();
    }
  });

  it("still names the tools in chats from before the MCP server was renamed", () => {
    for (const [name, tool] of [
      ["mcp__t3-code__t3_thread_read", "thread_read"],
      ["mcp__t3_code__t3_project_clone", "project_clone"],
      ["mcp__t3code__t3_queue_promote_to_steer", "queue_promote_to_steer"],
      ["t3-code.t3_worktree_status", "worktree_status"],
      ["T3-code · t3_lock_read completed", "lock_read"],
      ["mcp__t3-code__html_render", "html_render"],
      ["t3code:delegate_task", "delegate_task"],
      ["mcp_t3-code_t3_thread_send", "thread_send"],
      ["t3_thread_send_attachments", "thread_send_attachments"],
    ]) {
      expect(resolveControlMcpToolId(name), name).toBe(tool);
    }
    expect(resolveControlMcpToolId("mcp__another-server__t3_thread_read")).toBeNull();
  });

  it("pretty prints Claude Control MCP tool names", () => {
    expect(resolveControlMcpToolPresentation("mcp__control__thread_read")).toEqual({
      displayName: "Read a Control thread",
      logo: "control",
    });
  });

  it("pretty prints namespaced Control MCP tool names", () => {
    expect(resolveControlMcpToolPresentation("control.create_threads")).toEqual({
      displayName: "Create Control threads",
      logo: "control",
    });
  });

  it("pretty prints thread metadata updates", () => {
    expect(resolveControlMcpToolPresentation("mcp__control__thread_update")).toEqual({
      displayName: "Update Control thread metadata",
      logo: "control",
    });
  });

  it("pretty prints bare Control MCP toolkit names", () => {
    expect(resolveControlMcpToolPresentation("list_scheduled_tasks")).toEqual({
      displayName: "List scheduled tasks",
      logo: "control",
    });
  });

  it("pretty prints worktree Control MCP tool names", () => {
    expect(resolveControlMcpToolPresentation("mcp__control__worktree_handoff")).toEqual({
      displayName: "Hand off thread to a git worktree",
      logo: "control",
    });
    expect(resolveControlMcpToolPresentation("control.worktree_status")).toEqual({
      displayName: "Get thread worktree status",
      logo: "control",
    });
  });

  it("pretty prints preview Control MCP tool names", () => {
    expect(resolveControlMcpToolPresentation("Control.preview_open")).toEqual({
      displayName: "Open a page in the preview browser",
      logo: "control",
    });
    expect(resolveControlMcpToolPresentation("mcp__control__preview_status")).toEqual({
      displayName: "Get preview browser status",
      logo: "control",
    });
  });

  it("matches the separator variants other agents emit", () => {
    for (const name of [
      "mcp_control_delegate_task",
      "control:delegate_task",
      "control/delegate_task",
      "control delegate_task",
      "Control delegate_task",
      "control__delegate_task",
    ]) {
      expect(resolveControlMcpToolPresentation(name)?.displayName).toBe("Delegate a child task");
    }
  });

  it("keeps unknown MCP tools on the generic renderer path", () => {
    expect(resolveControlMcpToolPresentation("mcp__github__search_issues")).toBeNull();
    expect(resolveControlMcpToolPresentation("control.not_a_real_tool")).toBeNull();
  });
});

describe("resolveControlMcpToolDefinition", () => {
  it("labels an action tool call as the action it ran", () => {
    expect(
      resolveControlMcpToolDefinition("mcp__control__preview_act", { action: "type" })?.labels,
    ).toEqual(resolveControlMcpToolDefinition("preview_type")?.labels);
    expect(
      resolveControlMcpToolDefinition("thread_transfer", { action: "fork" })?.displayName,
    ).toBe(resolveControlMcpToolDefinition("thread_fork")?.displayName);
    expect(resolveControlMcpToolDefinition("preview_act", { action: "unknown" })?.labels[2]).toBe(
      "Used",
    );
  });
});

describe("resolveControlMcpToolSummaryAction", () => {
  it("summarizes an action tool by the action each call ran", () => {
    expect(
      resolveControlMcpToolSummaryAction("mcp__control__thread_queue", { action: "list" }),
    ).toBe("queue-list");
    expect(resolveControlMcpToolSummaryAction("thread_queue", { action: "edit" })).toBe(
      "queue-edit",
    );
    expect(resolveControlMcpToolSummaryAction("pending_request", { action: "respond" })).toBe(
      "question-respond",
    );
    expect(resolveControlMcpToolSummaryAction("thread_transfer", { action: "status" })).toBe(
      "thread-transfers",
    );
    expect(resolveControlMcpToolSummaryAction("thread_configure", {})).toBe("thread-configuration");
    expect(resolveControlMcpToolSummaryAction("schedule_task", { scheduledTaskId: "task-1" })).toBe(
      "schedule-update",
    );
    expect(resolveControlMcpToolSummaryAction("delegate_task", { task: "x" })).toBe("delegate");
    // Older threads name the single-purpose tools, which keep their own labels.
    expect(resolveControlMcpToolSummaryAction("mcp__control__queue_promote_to_steer")).toBe(
      "queue-steer",
    );
  });
});
