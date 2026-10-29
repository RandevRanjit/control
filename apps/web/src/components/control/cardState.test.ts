import { ProviderInstanceId } from "@control/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  cardNotes,
  effortLevel,
  projectMonogram,
  projectTint,
  resolveCardState,
} from "./cardState";

const base = {
  isUnread: false,
  hasBackgroundWork: false,
  latestRunStatus: null,
} as const;

describe("resolveCardState", () => {
  it("maps live states to the design's lamps and words", () => {
    expect(resolveCardState({ ...base, status: "approval" })).toEqual({
      st: "needs",
      lamp: "needs",
      words: "needs you",
    });
    // Working wears the background lamp over the working bar.
    expect(resolveCardState({ ...base, status: "working" })).toEqual({
      st: "working",
      lamp: "bg",
      words: "working",
    });
    expect(resolveCardState({ ...base, status: "limited" }).words).toBe("limited");
  });

  it("orders resting states: background, interrupted, done, idle", () => {
    expect(resolveCardState({ ...base, status: "ready", hasBackgroundWork: true }).st).toBe("bg");
    expect(resolveCardState({ ...base, status: "ready", latestRunStatus: "interrupted" }).st).toBe(
      "intr",
    );
    expect(resolveCardState({ ...base, status: "waiting", isUnread: true }).st).toBe("done");
    expect(resolveCardState({ ...base, status: "ready" }).st).toBe("idle");
  });
});

describe("card details", () => {
  it("reads effort from the model selection", () => {
    const selection = (value?: string) => ({
      instanceId: ProviderInstanceId.make("claude"),
      model: "claude-opus-5-5",
      ...(value === undefined ? {} : { options: [{ id: "effort", value }] }),
    });
    expect(effortLevel(selection("xhigh"))).toBe(4);
    expect(effortLevel(selection("default"))).toBeNull();
    expect(effortLevel(selection())).toBeNull();
  });

  it("derives a stable tint and a two-letter mark", () => {
    expect(projectTint("project-a")).toBe(projectTint("project-a"));
    expect(projectMonogram("orbit-website")).toBe("OR");
    expect(projectMonogram("rx2")).toBe("RX");
  });
});

describe("cardNotes", () => {
  const idle = resolveCardState({ ...base, status: "ready" });
  const usual = {
    state: idle,
    branch: "main",
    model: "claude-opus-5-5",
    defaultModel: "claude-opus-5-5",
  };

  it("says nothing for an idle chat on main with the default model, so the card is one line", () => {
    expect(cardNotes(usual)).toEqual({ words: null, branch: null, model: false });
    expect(cardNotes({ ...usual, branch: "master" })).toEqual({
      words: null,
      branch: null,
      model: false,
    });
    expect(cardNotes({ ...usual, branch: null })).toEqual({
      words: null,
      branch: null,
      model: false,
    });
  });

  it("names only what is unusual: another state, another branch, another model", () => {
    expect(
      cardNotes({
        state: resolveCardState({ ...base, status: "working" }),
        branch: "site-v2",
        model: "claude-sonnet-5-5",
        defaultModel: "claude-opus-5-5",
      }),
    ).toEqual({ words: "working", branch: "site-v2", model: true });
  });
});
