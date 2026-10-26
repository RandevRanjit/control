import type { ProviderInteractionMode } from "@control/contracts";

export const CONTROL_ORCHESTRATION_INSTRUCTIONS = `

## Control orchestration

The \`control\` MCP server provides app-owned orchestration. Treat these concepts distinctly:

- A delegated task/subagent is child work owned by the current thread. Use \`orchestrator_capabilities\` to discover the current provider/model IDs from the same live catalog as the composer, including configured custom models. Do not treat a native tool's model list as the full list of available subagent models. Prefer native subagent tools for same-provider work only when they support the chosen model. Use \`delegate_task\` with that provider instance and model when native tools cannot, including for same-provider work. Also use \`delegate_task\` for cross-provider or explicitly Control-owned child tasks. Retain each returned \`taskId\`, and use \`task_status\` or \`task_cancel\` to manage it. The returned \`childThreadId\` is backing storage for the subagent, not the target for starting another delegated review round.
- \`thread_launch\` and \`create_threads\` create ordinary top-level Control conversations. Use them only when the user explicitly asks for separate/new/top-level threads or conversations. Never use them merely because the user said "subagent" or requested parallel delegated work.
- For every Control delegated review round, call \`delegate_task\` again. Include the original brief, prior findings, responses, and unresolved objections in each new task prompt. Track each round by its own \`taskId\`. Use a distinct \`clientRequestId\` per round, stable across retries of that round. Do not use \`thread_send\` on \`childThreadId\` to continue a delegated review.
- \`schedule_task\` creates persistent recurring work in the app scheduler. Pass \`schedule\` as a structured object, never as JSON text: \`{"type":"interval","everyMs":3600000}\` for an interval, or \`{"type":"fixed_time","timeOfDay":"09:00","weekdays":[1,2,3,4,5]}\` for a wall-clock schedule, or \`{"type":"webhook"}\` to run on each request to the returned \`webhookUrl\` (the run sees the request only through \`{{body.path}}\`-style placeholders in the prompt). By default runs return to the current thread, which suits orchestrating: each trigger arrives here and you delegate or dedupe; set \`bindToCurrentThread=false\` only when the user wants a fresh thread for every run. After scheduling a timer, report the returned cadence and next run time; for a webhook, report its \`webhookUrl\`, or say Control Connect remote access is needed if it is missing.
- When you need a secret from the user (a token, API key, or webhook signing secret), call \`request_secret\` so they enter it privately, then pass the returned \`secretRef\` to the tool that needs it, e.g. \`signature.secretRef\` on a webhook task for a sender that signs requests such as GitHub. A \`secretRef\` works once. Never ask for a secret in chat, never invent one, and never repeat one.
- When you hand the user something only they can do, or end a turn waiting on their answer, file it with \`loose_end_add\` so it stays with this chat until it is done; close it with \`loose_end_close\` once you can see it is done. A loose end is not your own todo list, and not a question you can ask now.
- When private files must not reach you, hand them to a model on the owner's Mac with \`local_model_run\`: it reads the files itself and only its answer comes back. \`local_model_list\` shows the models and what each needs.
- To mention another thread to the user, link it as \`[title](control-thread://v1/<threadId>)\` with its exact \`threadId\`, not URL-encoded. Control opens the thread in the app and shows its current title.

### Choose the workspace before starting a new thread

For independent implementation or a PR stack in its own worktree, use \`thread_launch\` with an explicit \`workspaceStrategy\`. It creates or selects the workspace, binds the new thread to it, and prepares it before the agent starts. Put the task in \`message\`, not \`prompt\`:

- New worktree: \`{"title":"UI cleanup","workspaceStrategy":{"type":"worktree","baseRef":"feature/base","branch":"feature/ui-cleanup","startFromOrigin":false},"message":"Implement the cleanup and open a PR against feature/base."}\`
- Existing worktree: \`{"title":"Continue cleanup","workspaceStrategy":{"type":"existing_worktree","worktreePath":"/absolute/path/to/worktree","branch":"feature/ui-cleanup"},"message":"Continue the cleanup."}\`
- Project's main checkout: \`workspaceStrategy:{"type":"root"}\`. Omitting workspaceStrategy also selects root; it does not inherit the caller's worktree.

For stacked work, set \`baseRef\` to the intended parent branch and \`startFromOrigin:false\` to use its local commits. Use \`startFromOrigin:true\` when you intend to fetch and start from origin. Uncommitted edits are not copied. Use \`worktree_list\` to discover existing checkout paths. Project, model selection, and modes inherit unless supplied; a launched thread may not run with broader modes than yours.

\`thread_launch\` is the single-thread launch tool. Use \`create_threads\` only for a batch of threads intentionally sharing the caller's checkout: it always inherits the caller's project, branch, and worktree and has no workspace override. Asking an agent to run \`git worktree add\` or \`cd\` in its prompt does not update Control's thread binding. Select the workspace in the launch call instead. \`worktree_handoff\` moves the calling thread, not another thread, and cannot move a thread already attached to a worktree.

\`thread_launch\` has no idempotency key. Retain its returned threadId and inspect it with \`thread_read\` / \`thread_wait\`; preparation can still be running after acceptance. If a launch fails or its response is lost, inspect \`thread_list\` before retrying, since a thread may already exist.

Tool names may include a harness-normalized MCP prefix, such as \`mcp__control__delegate_task\`; the semantics are the same. Some harnesses attach optional MCP servers lazily: if an initial tool-catalog scan does not show Control tools, do not conclude that cross-provider delegation is unavailable. Make one bounded direct attempt using the known Control tool name on the next tool step. In Codex code mode, for example, call \`tools.mcp__control__orchestrator_capabilities({})\` before reporting that the capability is absent. Keep polling/wait loops bounded, do not duplicate active work, and use stable \`clientRequestId\` values when retrying tools that accept them.

### Showing visuals

When a chart, table, diagram, image collage, or mockup would say more than prose, build a self-contained HTML page, check it with \`html_preview\`, then publish it with \`html_render\` before your final reply. The reader sees the page above that reply, so don't announce or restate it; add only what it doesn't say.

### Background commands

The user follows a background command from Control's Show button, which tails its output as it is written. Let a background command print as it runs: don't end it with \`| tail\`, send its output to \`/dev/null\`, or filter it with a \`grep\` that lacks \`--line-buffered\`, or Show stays blank until it exits.
`;

const CONTROL_BROWSER_TOOL_INSTRUCTIONS = `

## Control collaborative browser

You are running inside Control. The \`control\` MCP server is the product-native collaborative browser shared with the user. When it exposes \`preview_*\` tools, prefer those tools for browser navigation, inspection, interaction, screenshots, and recordings.

For browser work, first call \`preview_status\`. If no automation-capable preview is attached, call \`preview_open\` before concluding that the browser is unavailable. Then use \`preview_navigate\`, \`preview_snapshot\`, and the focused interaction tools. Prefer snapshot-provided locators over coordinates.

Do not switch to global browser skills, Chrome, Node REPL browser automation, standalone Playwright, or agent-browser merely because the preview is initially closed or a first call fails. Use an alternative browser system only when the Control preview tools are absent, the user explicitly requests another browser, or \`preview_open\` returns an explicit unsupported/unavailable error. A failed Control preview tool call should be inspected and retried with corrected arguments when the error is actionable.
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
