import { describe, expect, it } from "vite-plus/test";

import { resolveToolKind, toolKindName } from "./toolKind";

const call = { isSkill: false, isSubagent: false } as const;

describe("resolveToolKind", () => {
  it("maps Control's tool actions onto design v1's families", () => {
    expect(resolveToolKind({ ...call, action: "read" })).toBe("read");
    expect(resolveToolKind({ ...call, action: "code-search" })).toBe("read");
    expect(resolveToolKind({ ...call, action: "edit" })).toBe("write");
    expect(resolveToolKind({ ...call, action: "command" })).toBe("run");
    expect(resolveToolKind({ ...call, action: "browser" })).toBe("web");
    expect(resolveToolKind({ ...call, action: "other" })).toBeNull();
  });

  it("lets a skill or a subagent override the action", () => {
    expect(resolveToolKind({ ...call, action: "other", isSkill: true })).toBe("skill");
    expect(resolveToolKind({ ...call, action: "other", isSubagent: true })).toBe("agent");
  });

  it("names each family as Claude Code writes it", () => {
    expect(toolKindName("run")).toBe("Bash");
    expect(toolKindName("web")).toBe("Browser");
    expect(toolKindName(null)).toBe("Tool");
  });
});
