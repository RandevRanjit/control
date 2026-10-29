import { assert, describe, it } from "@effect/vitest";

import {
  CONTROL_ORCHESTRATION_INSTRUCTIONS,
  controlAcpPromptWithInstructions,
  controlOrchestrationPromptForFirstRun,
  controlOrchestrationSystemPrompt,
} from "./ControlOrchestrationInstructions.ts";

describe("Control orchestration provider instructions", () => {
  it("distinguishes delegated subagents from ordinary top-level threads", () => {
    assert.include(CONTROL_ORCHESTRATION_INSTRUCTIONS, "use `delegate_task`");
    assert.include(CONTROL_ORCHESTRATION_INSTRUCTIONS, "make new top-level threads");
    assert.include(CONTROL_ORCHESTRATION_INSTRUCTIONS, '"Subagent", "delegate" and "parallel"');
    assert.include(CONTROL_ORCHESTRATION_INSTRUCTIONS, "another provider");
    assert.include(CONTROL_ORCHESTRATION_INSTRUCTIONS, "is a new `delegate_task`");
    assert.include(
      CONTROL_ORCHESTRATION_INSTRUCTIONS,
      "Do not use `thread_send` on `childThreadId`",
    );
  });

  it("keeps Control's own rules: secrets, loose ends, local models, background output", () => {
    assert.include(CONTROL_ORCHESTRATION_INSTRUCTIONS, "Never ask for one in chat");
    assert.include(CONTROL_ORCHESTRATION_INSTRUCTIONS, "`loose_end_add`");
    assert.include(CONTROL_ORCHESTRATION_INSTRUCTIONS, "`local_model_run`");
    assert.include(CONTROL_ORCHESTRATION_INSTRUCTIONS, "--line-buffered");
    assert.include(CONTROL_ORCHESTRATION_INSTRUCTIONS, "control-thread://v1/<threadId>");
  });

  it("costs every thread well under half its former 7 KB", () => {
    assert.isBelow(new TextEncoder().encode(CONTROL_ORCHESTRATION_INSTRUCTIONS).length, 3_400);
  });

  it("documents structured schedules instead of JSON strings", () => {
    assert.include(CONTROL_ORCHESTRATION_INSTRUCTIONS, "structured object, never as JSON text");
    assert.include(CONTROL_ORCHESTRATION_INSTRUCTIONS, '{"type":"webhook"}');
    assert.include(CONTROL_ORCHESTRATION_INSTRUCTIONS, '"everyMs":3600000');
    assert.include(CONTROL_ORCHESTRATION_INSTRUCTIONS, "bindToCurrentThread=false");
  });

  it("injects prompt fallback only for an MCP-enabled first run", () => {
    const prompt = "Inspect the repository.";
    const injected = controlOrchestrationPromptForFirstRun({
      prompt,
      runOrdinal: 1,
      hasControlMcp: true,
    });

    assert.include(injected, "<control_orchestration_instructions>");
    assert.include(injected, `<user_request>\n${prompt}\n</user_request>`);
    assert.equal(
      controlOrchestrationPromptForFirstRun({ prompt, runOrdinal: 2, hasControlMcp: true }),
      prompt,
    );
    assert.equal(
      controlOrchestrationPromptForFirstRun({ prompt, runOrdinal: 1, hasControlMcp: false }),
      prompt,
    );
  });

  it("only exposes the system prompt when the Control MCP server is attached", () => {
    assert.equal(controlOrchestrationSystemPrompt(false), undefined);
    assert.equal(controlOrchestrationSystemPrompt(true), CONTROL_ORCHESTRATION_INSTRUCTIONS);
  });

  it("gives ACP sessions provider-neutral mode, browser, and orchestration guidance", () => {
    const injected = controlAcpPromptWithInstructions({
      prompt: "Inspect the repository.",
      state: { interactionMode: "default", hasControlMcp: true },
    });

    assert.include(injected, "Control interaction mode: Default");
    assert.include(injected, "Control browser");
    assert.include(injected, "Control orchestration");
    assert.include(injected, "<user_request>\nInspect the repository.\n</user_request>");
  });

  it("reinjects ACP guidance only when mode or tool availability changes", () => {
    const prompt = "Continue.";
    const defaultState = { interactionMode: "default", hasControlMcp: true } as const;

    assert.equal(
      controlAcpPromptWithInstructions({
        prompt,
        state: defaultState,
        previousState: defaultState,
      }),
      prompt,
    );
    assert.include(
      controlAcpPromptWithInstructions({
        prompt,
        state: { ...defaultState, interactionMode: "plan" },
        previousState: defaultState,
      }),
      "Control interaction mode: Plan",
    );
    const withoutMcp = controlAcpPromptWithInstructions({
      prompt,
      state: { interactionMode: "default", hasControlMcp: false },
    });
    assert.include(withoutMcp, "Control interaction mode: Default");
    assert.notInclude(withoutMcp, "Control browser");
    assert.notInclude(withoutMcp, "Control orchestration");
  });
});
