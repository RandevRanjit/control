import type { ProviderInteractionMode } from "@control/contracts";

export const CONTROL_ORCHESTRATION_INSTRUCTIONS = `

## Control orchestration

Ordinary coding tasks need no Control tools. Control MCP tools may be deferred: load one with ToolSearch before you call it, and try a name once before you call it absent.

- Subagents: use your native tool when it offers the model you chose. Otherwise, for another provider, or for a Control-owned child, use \`delegate_task\`; \`orchestrator_capabilities\` lists the providers and models. Keep each \`taskId\` for \`task_status\` and \`task_cancel\`. Its \`childThreadId\` is storage, not a thread to send to.
- Every new delegated review round is a new \`delegate_task\` with the brief, prior findings and objections, and its own \`clientRequestId\` (the same one on retries). Do not use \`thread_send\` on \`childThreadId\`.
- \`thread_launch\` and \`create_threads\` make new top-level threads, only when the user asks for one. "Subagent", "delegate" and "parallel" never mean one.
- \`schedule_task\`: pass \`schedule\` as a structured object, never as JSON text: \`{"type":"interval","everyMs":3600000}\`, \`{"type":"fixed_time","timeOfDay":"09:00","weekdays":[1,2,3,4,5]}\`, or \`{"type":"webhook"}\`. Runs post into this thread; set \`bindToCurrentThread=false\` only when the user wants a fresh thread per run. Report the next run time, or the \`webhookUrl\` (none: Control Connect remote access is off).
- A secret: call \`request_secret\` and pass its \`secretRef\` on; it works once. Never ask for one in chat, invent one, or repeat one.
- Something only the user can do, or a turn that ends waiting on their answer: \`loose_end_add\`, then \`loose_end_close\` once you see it done. Not your own todo list.
- Private files that must not reach you: \`local_model_run\` (\`local_model_list\` shows the models).
- Link another thread as \`[title](control-thread://v1/<threadId>)\` with its exact, unencoded id.

### Workspaces for new threads

\`thread_launch\` binds a new thread to its workspace before the agent starts; put the task in \`message\`. \`workspaceStrategy\`: \`{"type":"worktree","baseRef":"feature/base","branch":"feature/ui","startFromOrigin":false}\`, \`{"type":"existing_worktree","worktreePath":"/abs/path","branch":"feature/ui"}\`, or \`{"type":"root"}\` (also the default; not your worktree). \`startFromOrigin:false\` stacks on the base's local commits; uncommitted edits are not copied. \`worktree_list\` finds checkouts. \`create_threads\` is a batch sharing your checkout. A worktree or \`cd\` made in a prompt does not bind a thread. \`worktree_handoff\` moves only this thread. \`thread_launch\` has no retry key: after an error or lost reply, check \`thread_list\` before retrying.

### Visuals

When a chart, table, diagram or mockup says more than prose, check a self-contained HTML page with \`html_preview\`, then \`html_render\` it before your reply. The reader sees it above your reply, so don't restate it.

### Background commands

The user follows a background command through Show, which tails its output. Let it print as it runs: no \`| tail\`, no \`/dev/null\`, no \`grep\` without \`--line-buffered\`.
`;

const CONTROL_BROWSER_TOOL_INSTRUCTIONS = `

## Control browser

When browser work was asked, \`preview_*\` is the browser you share with the user: \`preview_status\` first, then \`preview_open\` if no tab can be automated. Prefer snapshot locators over coordinates. Switch browsers only if the tools are absent or \`preview_open\` says unsupported, the user asks, or two preview calls fail on one step. Then quote the error and switch.
`;

const CONTROL_ACP_DEFAULT_MODE_INSTRUCTIONS = `## Control interaction mode: Default

Prefer making reasonable assumptions and carrying out the user's request. Ask a concise question only when a missing user decision would materially change the result. Treat this mode as active until Control supplies a different interaction-mode instruction.`;

const CONTROL_ACP_PLAN_MODE_INSTRUCTIONS = `## Control interaction mode: Plan

Investigate with read-only actions and do not edit files or otherwise execute the implementation. Resolve discoverable facts before asking questions. When the requirements are decision complete, return a concrete implementation plan and do not start implementing it. Treat this mode as active until Control supplies a different interaction-mode instruction.`;

export interface ControlAcpInstructionState {
  readonly interactionMode: ProviderInteractionMode;
  readonly hasControlMcp: boolean;
}

/**
 * ACP has no system/developer prompt field, so send Control-owned context in the
 * first user prompt and whenever the available tools or interaction mode change.
 */
export function controlAcpPromptWithInstructions(input: {
  readonly prompt: string;
  readonly state: ControlAcpInstructionState;
  readonly previousState?: ControlAcpInstructionState;
}): string {
  // Native slash commands must remain at the start of the prompt.
  if (input.prompt.trimStart().startsWith("/")) return input.prompt;
  if (
    input.previousState?.interactionMode === input.state.interactionMode &&
    input.previousState.hasControlMcp === input.state.hasControlMcp
  ) {
    return input.prompt;
  }
  const instructions = [
    input.state.interactionMode === "plan"
      ? CONTROL_ACP_PLAN_MODE_INSTRUCTIONS
      : CONTROL_ACP_DEFAULT_MODE_INSTRUCTIONS,
    ...(input.state.hasControlMcp
      ? [CONTROL_BROWSER_TOOL_INSTRUCTIONS.trim(), CONTROL_ORCHESTRATION_INSTRUCTIONS.trim()]
      : []),
  ];
  return `<control_instructions>\n${instructions.join("\n\n")}\n</control_instructions>\n\n<user_request>\n${input.prompt}\n</user_request>`;
}

/**
 * Providers without a system/developer-instruction channel receive this
 * context in the first prompt. Keep the wrapper explicit so it cannot be
 * mistaken for text authored by the user.
 */
function prependControlOrchestrationInstructions(prompt: string): string {
  return `<control_orchestration_instructions>${CONTROL_ORCHESTRATION_INSTRUCTIONS.trim()}</control_orchestration_instructions>\n\n<user_request>\n${prompt}\n</user_request>`;
}

export function controlOrchestrationPromptForFirstRun(input: {
  readonly prompt: string;
  readonly runOrdinal: number;
  readonly hasControlMcp: boolean;
}): string {
  return input.runOrdinal === 1 && input.hasControlMcp
    ? prependControlOrchestrationInstructions(input.prompt)
    : input.prompt;
}

export function controlOrchestrationSystemPrompt(hasControlMcp: boolean): string | undefined {
  return hasControlMcp ? CONTROL_ORCHESTRATION_INSTRUCTIONS : undefined;
}
