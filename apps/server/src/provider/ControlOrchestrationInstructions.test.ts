import { assert, describe, it } from "@effect/vitest";

import {
  CONTROL_ORCHESTRATION_INSTRUCTIONS,
  controlAcpPromptWithInstructions,
  controlOrchestrationPromptForFirstRun,
  controlOrchestrationSystemPrompt,
} from "./ControlOrchestrationInstructions.ts";

describe("Control orchestration provider instructions", () => {
  it("distinguishes delegated subagents from ordinary top-level threads", () => {
    assert.include(CONTROL_ORCHESTRATION_INSTRUCTIONS, "Use `delegate_task`");
    assert.include(CONTROL_ORCHESTRATION_INSTRUCTIONS, "ordinary top-level Control conversations");
    assert.include(CONTROL_ORCHESTRATION_INSTRUCTIONS, "Never use them merely");
    assert.include(CONTROL_ORCHESTRATION_INSTRUCTIONS, "cross-provider");
    assert.include(CONTROL_ORCHESTRATION_INSTRUCTIONS, "call `delegate_task` again");
    assert.include(
      CONTROL_ORCHESTRATION_INSTRUCTIONS,
      "Do not use `thread_send` on `childThreadId`",
    );
  });

  it("documents structured schedules instead of JSON strings", () => {
    assert.include(CONTROL_ORCHESTRATION_INSTRUCTIONS, "structured object, never as JSON text");
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
    assert.include(injected, "Control collaborative browser");
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
    assert.notInclude(withoutMcp, "Control collaborative browser");
    assert.notInclude(withoutMcp, "Control orchestration");
  });
});
