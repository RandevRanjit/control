import type { ToolGroupAction } from "@control/client-runtime/work-log/presentation";

// Design v1's tool families (§4.5). In 1.1 (§15.1) a row is named by its tool
// even when the call failed; the bead carries the failure.
export type ToolKind = "read" | "write" | "run" | "web" | "agent" | "skill";

// The tool's name as Claude Code writes it (§15.1).
const NAMES: Record<ToolKind, string> = {
  read: "Read",
  write: "Write",
  run: "Bash",
  web: "Browser",
  agent: "Agent",
  skill: "Skill",
};

export function resolveToolKind(input: {
  readonly action: ToolGroupAction;
  readonly isSkill: boolean;
  readonly isSubagent: boolean;
}): ToolKind | null {
  if (input.isSkill) return "skill";
  if (input.isSubagent) return "agent";
  switch (input.action) {
    case "read":
    case "search":
    case "code-search":
      return "read";
    case "edit":
      return "write";
    case "command":
      return "run";
    case "browser":
      return "web";
    default:
      return null;
  }
}

/** The row's tool name; calls outside v1's families read Tool. */
export function toolKindName(kind: ToolKind | null): string {
  return kind === null ? "Tool" : NAMES[kind];
}
