import { describe, expect, it } from "vite-plus/test";

import { formatEnvText, hookSummary, parseEnvText } from "./claudeSettingsFile.logic";

describe("Claude settings env editor", () => {
  it("round-trips KEY=value lines and keeps further equals signs in the value", () => {
    const env = { A: "1", URL: "https://x?a=b" };
    expect(parseEnvText(formatEnvText(env))).toEqual(env);
    expect(parseEnvText(" B = 2 \n\nnot a pair\n=orphan")).toEqual({ B: "2" });
  });

  it("summarises hooks per event", () => {
    expect(hookSummary({})).toBe("No hooks.");
    expect(hookSummary({ PreToolUse: 2, Stop: 0, SessionEnd: 1 })).toBe(
      "3 across PreToolUse (2), SessionEnd (1). Edit them in settings.json.",
    );
  });
});
