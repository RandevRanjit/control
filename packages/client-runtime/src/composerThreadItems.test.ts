import { EnvironmentId, ThreadId } from "@control/contracts";
import { describe, expect, it } from "vite-plus/test";

import { matchComposerThreadItems, type ComposerThreadCandidate } from "./composerThreadItems.ts";

const env = EnvironmentId.make("env-1");
const otherEnv = EnvironmentId.make("env-2");
const NOW = Date.parse("2026-02-02T00:00:00.000Z");
const shell = (
  id: string,
  title: string,
  overrides: Partial<ComposerThreadCandidate> = {},
): ComposerThreadCandidate => ({
  environmentId: env,
  id: ThreadId.make(id),
  title,
  branch: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  latestUserMessageAt: null,
  opens: null,
  archivedAt: null,
  lineage: { rootThreadId: ThreadId.make(id), parentThreadId: null, relationshipToParent: null },
  ...overrides,
});

describe("matchComposerThreadItems", () => {
  it("offers nothing for a bare @ so the picker stays a file picker", () => {
    expect(
      matchComposerThreadItems({
        shells: [shell("t1", "Fix login")],
        environmentId: env,
        excludeThreadId: null,
        query: "  ",
        now: NOW,
      }),
    ).toEqual([]);
  });

  it("matches titles within the environment, newest first, skipping self and archived", () => {
    const items = matchComposerThreadItems({
      shells: [
        shell("old", "Login flow", { updatedAt: "2026-01-01T00:00:00.000Z" }),
        shell("new", "Login redesign", { updatedAt: "2026-02-01T00:00:00.000Z" }),
        shell("self", "Login self"),
        shell("gone", "Login archived", { archivedAt: "2026-01-02T00:00:00.000Z" }),
        shell("foreign", "Login elsewhere", { environmentId: otherEnv }),
        shell("nope", "Unrelated"),
      ],
      environmentId: env,
      excludeThreadId: ThreadId.make("self"),
      query: "LOGIN",
      now: NOW,
    });
    expect(items.map((item) => item.thread.threadId)).toEqual(["new", "old"]);
    expect(items[0]).toMatchObject({ type: "thread", label: "Login redesign" });
  });

  it("ranks thread mentions like the palette and leaves out subagent threads", () => {
    const items = matchComposerThreadItems({
      shells: [
        shell("newer-mid-word", "Remodel the settings page", {
          updatedAt: "2026-02-01T00:00:00.000Z",
        }),
        shell("word", "Fix model picker"),
        shell("subagent", "Model review", {
          lineage: {
            rootThreadId: ThreadId.make("word"),
            parentThreadId: ThreadId.make("word"),
            relationshipToParent: "subagent",
          },
        }),
        shell("other-environment", "Model docs", { environmentId: otherEnv }),
      ],
      environmentId: env,
      excludeThreadId: null,
      query: "model",
      now: NOW,
    });
    expect(items.map((item) => item.thread.threadId)).toEqual(["word", "newer-mid-word"]);
  });
});
