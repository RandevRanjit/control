import { localModelCallRow } from "@control/client-runtime/controlToolSummary";
import { commandDisplayText } from "@control/client-runtime/work-log/command-label";
import {
  resolveWorkEntryToolPresentation,
  toolGroupAction,
  workEntryDisplayIndicatesToolFailure,
} from "@control/client-runtime/work-log/presentation";
import { formatDuration } from "@control/shared/orchestrationTiming";
import {
  resolveControlMcpToolDefinition,
  resolveControlMcpToolId,
} from "@control/shared/controlMcpToolPresentation";
import { claudeSkillInvocation } from "@control/shared/toolActivity";
import * as DateTime from "effect/DateTime";

import type { WorkLogEntry } from "../../session-logic";
import { resolveToolKind, toolKindName, type ToolKind } from "./toolKind";

/** One call in a tool stack (design v1 §4.5; 1.1's Simple trace, §15.1). */
export interface StackCall {
  /** The tool's family, error for a failed call, null outside v1's families. */
  readonly kind: ToolKind | "error" | null;
  /** The tool's name as Claude Code writes it; a failed call keeps its own tool's. */
  readonly name: string;
  readonly target: string;
  /** A write's lines added and removed, or a word or two at the row's end. */
  readonly meta: { readonly added: number; readonly removed: number } | string;
  readonly running: boolean;
}

const firstLine = (text: string) =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0) ?? "";

function inputString(input: unknown, ...keys: ReadonlyArray<string>): string | undefined {
  if (input === null || typeof input !== "object") return undefined;
  const record = input as Record<string, unknown>;
  const value = keys.map((key) => record[key]).find((candidate) => typeof candidate === "string");
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** v1 writes a path from the workspace's root, without the workspace's name. */
function workspacePath(path: string, workspaceRoot: string | undefined): string {
  const root = workspaceRoot?.replace(/\/+$/, "");
  return root && path.startsWith(`${root}/`)
    ? path.slice(root.length + 1)
    : path.replace(/^\.\/+/, "");
}

/** CONTROL's own browser tools, by what they open or read (§4.5). */
function browserTarget(toolName: string | null, input: unknown): string | undefined {
  switch (resolveControlMcpToolId(toolName)) {
    case "preview_open":
    case "preview_navigate": {
      const url = inputString(input, "url");
      return url === undefined ? undefined : `open ${url}`;
    }
    case "preview_snapshot":
      return `read ${inputString(input, "selector") ?? "the page"}`;
    default:
      return undefined;
  }
}

/** `fallbackLabel` is the timeline's own label for the call, used where v1 has no target. */
export function resolveStackCall(
  entry: WorkLogEntry,
  workspaceRoot: string | undefined,
  fallbackLabel: string,
): StackCall {
  const item = entry.projectedItem?.item ?? entry.structuredPayload;
  const skill =
    item?.type === "dynamic_tool" ? claudeSkillInvocation(item.toolName, item.input) : undefined;
  const family = resolveToolKind({
    action: toolGroupAction(entry),
    isSkill: skill !== undefined,
    isSubagent: entry.itemType === "subagent",
  });
  const failed = workEntryDisplayIndicatesToolFailure(entry);
  const running = entry.toolLifecycleStatus === "inProgress";
  // A local model is an agent of its own (design/hybrid/HANDOFF.md §18.4).
  const summaryAction =
    item?.type === "dynamic_tool"
      ? resolveControlMcpToolDefinition(item.toolName)?.summaryAction
      : undefined;
  const localModel =
    item?.type === "dynamic_tool" && summaryAction !== undefined
      ? localModelCallRow(summaryAction, { input: item.input, output: item.output })
      : null;
  if (localModel !== null) {
    return { kind: failed ? "error" : "agent", name: "Local model", ...localModel, running };
  }
  // A legacy call has no lifecycle; in a stack it has finished.
  const label =
    entry.toolLifecycleStatus === undefined
      ? (resolveWorkEntryToolPresentation(entry, "completed")?.displayName ?? fallbackLabel)
      : fallbackLabel;

  const path =
    item?.type === "file_change"
      ? item.fileName
      : item?.type === "dynamic_tool"
        ? inputString(item.input, "file_path", "notebook_path", "path")
        : undefined;
  const target =
    skill !== undefined
      ? skill.name
      : item?.type === "command_execution"
        ? commandDisplayText(item.input)
        : item?.type === "subagent"
          ? [entry.agentRole, item.title].filter(Boolean).join(" · ") || label
          : (family === "read" || family === "write") && path !== undefined
            ? workspacePath(path, workspaceRoot)
            : ((item?.type === "dynamic_tool" && family === "web"
                ? browserTarget(item.toolName, item.input)
                : undefined) ?? label);

  const output =
    item?.type === "command_execution"
      ? item.output
      : item?.type === "file_change"
        ? item.diffStr
        : item?.type === "dynamic_tool" && typeof item.output === "string"
          ? item.output
          : undefined;
  // The wire withholds output but keeps its summary; older items have neither.
  const summary =
    item?.type === "command_execution" || item?.type === "dynamic_tool"
      ? item.outputSummary
      : undefined;
  const meta: StackCall["meta"] = failed
    ? (summary ?? firstLine(output ?? "")) || "failed"
    : item?.type === "file_change" && item.additions !== undefined && item.deletions !== undefined
      ? { added: item.additions, removed: item.deletions }
      : summary !== undefined
        ? summary
        : item?.type === "command_execution" && item.status === "completed" && !item.outputOmitted
          ? firstLine(item.output ?? "") || "no output"
          : item?.type === "subagent" && item.startedAt !== null && item.completedAt !== null
            ? formatDuration(
                DateTime.toEpochMillis(item.completedAt) - DateTime.toEpochMillis(item.startedAt),
              )
            : family === "read" && output !== undefined
              ? `${output.split(/\r?\n/).length} lines`
              : "";

  return {
    kind: failed ? "error" : family,
    // A failed write is named by the tool Claude Code uses for it.
    name: failed && family === "write" ? "Edit" : toolKindName(family),
    target,
    meta,
    running,
  };
}
