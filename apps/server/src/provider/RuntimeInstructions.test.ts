import { describe, expect, it } from "vite-plus/test";
import { buildRuntimeInstructions } from "./RuntimeInstructions.ts";

describe("buildRuntimeInstructions", () => {
  it("requires explicit registration of every PR and stack layer", () => {
    const instructions = buildRuntimeInstructions({ harness: "Codex" });
    // The block reaches threads with no Control MCP too, so it only applies when the tool exists.
    expect(instructions).toContain(
      "When the control MCP server has link_pull_request, link each PR you create or work on",
    );
    expect(instructions).toContain("one link_pull_request per PR, full URL, every stack layer");
    expect(instructions).toContain("Host CLIs and APIs do not link for you.");
    expect(instructions).toContain("If linking fails, say so.");
    // Listing linked PRs as an end-of-work check found nothing to add in audited threads.
    expect(instructions).not.toContain("list_thread_pull_requests");
  });

  it("waits on a PR only with the watch, and unwatches before handing back", () => {
    const instructions = buildRuntimeInstructions({ harness: "Claude Code" });
    expect(instructions).toContain(
      "and watch_pull_request is available, call it and end your turn",
    );
    expect(instructions).toContain("do not poll or run your own watcher");
    expect(instructions).toContain("call unwatch_pull_request");
    expect(instructions).toContain(
      "Without these tools, say the PR is not linked or watched rather than polling it.",
    );
  });

  it("costs every thread well under half its former 1.6 KB", () => {
    expect(
      new TextEncoder().encode(buildRuntimeInstructions({ harness: "Claude Code" })).length,
    ).toBeLessThan(1_050);
  });

  it("tells the agent audio embeds like images and video", () => {
    expect(buildRuntimeInstructions({ harness: "Claude Code" })).toContain(
      "Embed images, video and audio as ![](absolute path).",
    );
  });

  it("asks for file paths the chat can open", () => {
    expect(buildRuntimeInstructions({ harness: "Claude Code" })).toContain(
      "write each file's absolute path, or its full path from your working folder",
    );
  });

  it("keeps known model and effort metadata on one line", () => {
    expect(
      buildRuntimeInstructions({
        harness: "Codex",
        model: "  custom\nmodel  ",
        reasoningEffort: " high\n",
      }),
    ).toContain("through the Codex harness, as custom model with high reasoning effort.");
  });

  it("names the model by display name and slug when they differ", () => {
    expect(
      buildRuntimeInstructions({ harness: "Codex", model: "gpt-5.4", modelName: "GPT-5.4" }),
    ).toContain("through the Codex harness, as GPT-5.4 (model slug: gpt-5.4).");
    expect(
      buildRuntimeInstructions({ harness: "Codex", model: "my-model", modelName: "my-model" }),
    ).toContain("through the Codex harness, as my-model.");
  });

  it.each([undefined, "", "auto", "default"])("omits unresolved model %s", (model) => {
    const instructions = buildRuntimeInstructions({ harness: "Cursor", model });
    expect(instructions).toContain("through the Cursor harness.");
    expect(instructions).not.toContain("reasoning effort");
  });
});
