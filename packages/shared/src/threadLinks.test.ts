import { describe, expect, it } from "vite-plus/test";

import {
  formatThreadLink,
  hasThreadLinks,
  parseThreadLinkHref,
  relabelThreadLinks,
} from "./threadLinks.ts";

describe("thread links", () => {
  it("takes the thread id verbatim, percent escapes included", () => {
    expect(parseThreadLinkHref("control-thread://v1/mcp:1234")).toBe("mcp:1234");
    expect(parseThreadLinkHref("control-thread://v1/thread:delegated-task:mcp%3A1")).toBe(
      "thread:delegated-task:mcp%3A1",
    );
  });

  it("rejects other links and an empty id", () => {
    expect(parseThreadLinkHref("https://control.codes")).toBeNull();
    expect(parseThreadLinkHref("control-thread://v1/")).toBeNull();
    expect(parseThreadLinkHref("control-thread://v1/ ")).toBeNull();
  });

  it("resolves a percent-encoded id when the id as written names no thread", () => {
    const titles = new Map([
      ["thread:project:1", "Decoded"],
      ["provider%3A1", "Literal escape"],
    ]);
    expect(
      relabelThreadLinks(
        "[a](control-thread://v1/thread%3Aproject%3A1) [b](control-thread://v1/provider%3A1)",
        (threadId) => titles.get(threadId),
      ),
    ).toBe(
      "[Decoded](control-thread://v1/thread:project:1) [Literal escape](control-thread://v1/provider%3A1)",
    );
    // A thread with an empty title still exists, so its link is not redirected.
    const untitled = new Map([
      ["a%3A1", ""],
      ["a:1", "Other"],
    ]);
    expect(
      relabelThreadLinks("[Kept](control-thread://v1/a%3A1)", (threadId) => untitled.get(threadId)),
    ).toBe("[Kept](control-thread://v1/a%3A1)");
  });

  it("leaves links inside code spans and fences as written", () => {
    const markdown = [
      "Live [old](control-thread://v1/t1), literal `[old](control-thread://v1/t1)`.",
      "```md",
      "[old](control-thread://v1/t1)",
      "```",
      "After [old](control-thread://v1/t1)",
    ].join("\n");
    expect(relabelThreadLinks(markdown, () => "New")).toBe(
      [
        "Live [New](control-thread://v1/t1), literal `[old](control-thread://v1/t1)`.",
        "```md",
        "[old](control-thread://v1/t1)",
        "```",
        "After [New](control-thread://v1/t1)",
      ].join("\n"),
    );
  });

  it("formats a label that would otherwise break the Markdown link", () => {
    expect(formatThreadLink("t1", "Fix [ci] \\ build")).toBe(
      "[Fix ci build](control-thread://v1/t1)",
    );
    expect(formatThreadLink("t1", " ] ")).toBe("[t1](control-thread://v1/t1)");
  });

  it("relabels links with the current title and leaves unknown threads alone", () => {
    const titles = new Map([["renamed", "Fix [the] build\nnow"]]);
    expect(
      relabelThreadLinks(
        "See [Old name](control-thread://v1/renamed) and [Gone](control-thread://v1/deleted).",
        (threadId) => titles.get(threadId),
      ),
    ).toBe(
      "See [Fix the build now](control-thread://v1/renamed) and [Gone](control-thread://v1/deleted).",
    );
  });
});

describe("thread links from before the rename", () => {
  it("still read as thread links, and relabelling moves them to the control scheme", () => {
    expect(parseThreadLinkHref("t3-thread://v1/mcp:1234")).toBe("mcp:1234");
    expect(hasThreadLinks("See [old](t3-thread://v1/t1).")).toBe(true);
    expect(
      relabelThreadLinks("See [old](t3-thread://v1/t1).", (threadId) =>
        threadId === "t1" ? "New" : undefined,
      ),
    ).toBe("See [New](control-thread://v1/t1).");
  });
});
