import { describe, expect, it } from "@effect/vitest";

import { focusStealingReason } from "./claudeQuietTools.ts";

const bash = (command: string) => focusStealingReason("Bash", { command });

describe("focusStealingReason", () => {
  it("holds computer use, but not the background cua-driver", () => {
    expect(focusStealingReason("mcp__computer-use__left_click", {})).toBe(
      "mcp__computer-use__left_click",
    );
    expect(focusStealingReason("mcp__cua-driver__click", {})).toBeNull();
    expect(focusStealingReason("Read", { file_path: "/tmp/open" })).toBeNull();
  });

  it("finds screencapture, open and an activating osascript in any part of a command", () => {
    expect(bash("screencapture -x /tmp/a.png")).toBe("screencapture");
    expect(bash("cd app && /usr/bin/open dist/index.html")).toBe("open");
    expect(bash("FOO=1 sudo open -a Safari")).toBe("open");
    expect(bash(`osascript -e 'tell application "Finder" to activate'`)).toBe("osascript activate");
    expect(bash("echo $(screencapture -c)")).toBe("screencapture");
  });

  it("lets quiet commands run", () => {
    expect(bash("git log --oneline")).toBeNull();
    expect(bash("grep -rn open src")).toBeNull();
    expect(bash(`osascript -e 'display notification "done"'`)).toBeNull();
    expect(focusStealingReason("Bash", {})).toBeNull();
  });
});
