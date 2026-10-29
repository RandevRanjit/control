export type ControlMcpToolLogo = "control";

export interface ControlMcpToolPresentation {
  readonly displayName: string;
  readonly logo: ControlMcpToolLogo;
}

export type ControlMcpToolSummaryAction =
  | "capabilities"
  | "delegate"
  | "task-status"
  | "task-cancel"
  | "schedule-run"
  | "schedule-create"
  | "schedule-list"
  | "schedule-update"
  | "schedule-delete"
  | "thread-create"
  | "thread-list"
  | "thread-read"
  | "thread-send"
  | "thread-wait"
  | "thread-interrupt"
  | "thread-configuration"
  | "thread-configure"
  | "thread-fork"
  | "thread-merge"
  | "thread-search"
  | "thread-transfers"
  | "thread-organize"
  | "thread-update"
  | "queue-list"
  | "queue-read"
  | "queue-edit"
  | "queue-cancel"
  | "queue-reorder"
  | "queue-steer"
  | "question-list"
  | "question-read"
  | "question-respond"
  | "secret-request"
  | "worktree-handoff"
  | "worktree-list"
  | "worktree-status"
  | "project-list"
  | "project-read"
  | "project-create"
  | "project-update"
  | "project-delete"
  | "project-clone"
  | "environment-read"
  | "environment-update"
  | "lock-read"
  | "loose-end-add"
  | "loose-end-list"
  | "loose-end-close"
  | "local-model-list"
  | "local-model-wake"
  | "local-model-sleep"
  | "local-model-run"
  | "attachment-prepare"
  | "attachment-discard"
  | "attachment-send"
  | "link-pr"
  | "unlink-pr"
  | "list-prs"
  | "watch-pr"
  | "unwatch-pr"
  | "browser"
  | "device"
  | "html-preview"
  | "html-render";

export interface ControlMcpToolDefinition {
  readonly displayName: string;
  readonly labels: readonly [action: string, running: string, completed: string, detail: string];
  readonly icon: "control" | "browser" | "device" | "pull-request";
  readonly summaryAction: ControlMcpToolSummaryAction;
}

function tool(
  labels: ControlMcpToolDefinition["labels"],
  summaryAction: ControlMcpToolSummaryAction,
  icon: ControlMcpToolDefinition["icon"] = "control",
  displayName = `${labels[0]} ${labels[3]}`,
): ControlMcpToolDefinition {
  return { displayName, labels, icon, summaryAction };
}

// `control`, and the names chats recorded before the server was renamed from T3's.
const CONTROL_MCP_SERVER_ALIASES = new Set(["control", "t3-code", "t3_code", "t3code"]);

// Cards, activity rows, summaries, and provider identity recovery share this inventory.
const CONTROL_MCP_TOOLS: Readonly<Record<string, ControlMcpToolDefinition>> = {
  link_pull_request: tool(
    ["Link", "Linking", "Linked", "a pull request"],
    "link-pr",
    "pull-request",
  ),
  unlink_pull_request: tool(
    ["Unlink", "Unlinking", "Unlinked", "a pull request"],
    "unlink-pr",
    "pull-request",
  ),
  list_thread_pull_requests: tool(
    ["Check", "Checking", "Checked", "linked pull requests"],
    "list-prs",
    "pull-request",
  ),
  watch_pull_request: tool(
    ["Watch", "Watching", "Watching", "a pull request"],
    "watch-pr",
    "pull-request",
  ),
  unwatch_pull_request: tool(
    ["Stop watching", "Stopping watching", "Stopped watching", "a pull request"],
    "unwatch-pr",
    "pull-request",
  ),
  orchestrator_capabilities: tool(
    ["Get", "Getting", "Got", "orchestration capabilities"],
    "capabilities",
  ),
  delegate_task: tool(["Delegate", "Delegating", "Delegated", "a child task"], "delegate"),
  task_status: tool(["Get", "Getting", "Got", "delegated task status"], "task-status"),
  task_cancel: tool(
    ["Cancel", "Canceling", "Requested cancellation of", "delegated task"],
    "task-cancel",
  ),
  schedule_task: tool(
    ["Schedule", "Scheduling", "Scheduled", "a recurring task"],
    "schedule-create",
  ),
  list_scheduled_tasks: tool(["List", "Listing", "Listed", "scheduled tasks"], "schedule-list"),
  update_scheduled_task: tool(
    ["Update", "Updating", "Updated", "a scheduled task"],
    "schedule-update",
  ),
  delete_scheduled_task: tool(
    ["Delete", "Deleting", "Requested deletion of", "a scheduled task"],
    "schedule-delete",
  ),
  request_secret: tool(["Ask for", "Asking for", "Asked for", "a secret"], "secret-request"),
  create_threads: tool(["Create", "Creating", "Created", "Control threads"], "thread-create"),
  thread_start: tool(["Start", "Starting", "Started", "a Control thread"], "thread-create"),
  thread_list: tool(["List", "Listing", "Listed", "Control threads"], "thread-list"),
  group_siblings: tool(["List", "Listing", "Listed", "group siblings"], "thread-list"),
  terminal_chats: tool(["List", "Listing", "Listed", "terminal chats"], "thread-list"),
  terminal_chat_read: tool(["Read", "Reading", "Read", "a terminal chat"], "thread-read"),
  thread_read: tool(["Read", "Reading", "Read", "a Control thread"], "thread-read"),
  thread_send: tool(["Send", "Sending", "Sent", "to a Control thread"], "thread-send"),
  thread_wait: tool(["Wait", "Waiting", "Waited", "for a Control thread"], "thread-wait"),
  thread_interrupt: tool(
    ["Interrupt", "Interrupting", "Requested an interrupt of", "a Control thread"],
    "thread-interrupt",
  ),
  worktree_handoff: tool(
    ["Hand off", "Handing off", "Handed off", "thread to a git worktree"],
    "worktree-handoff",
  ),
  worktree_status: tool(["Get", "Getting", "Got", "thread worktree status"], "worktree-status"),
  preview_status: tool(["Get", "Getting", "Got", "preview browser status"], "browser", "browser"),
  preview_open: tool(
    ["Open", "Opening", "Opened", "a page in the preview browser"],
    "browser",
    "browser",
  ),
  preview_navigate: tool(
    ["Navigate", "Navigating", "Navigated", "the preview browser"],
    "browser",
    "browser",
  ),
  preview_dialog: tool(
    ["Respond", "Responding", "Responded", "to a preview browser dialog"],
    "browser",
    "browser",
  ),
  preview_snapshot: tool(
    ["Take a snapshot of", "Taking a snapshot of", "Took a snapshot of", "the preview page"],
    "browser",
    "browser",
    "Snapshot the preview page",
  ),
  preview_act: tool(["Use", "Using", "Used", "the preview browser"], "browser", "browser"),
  preview_click: tool(
    ["Click", "Clicking", "Clicked", "in the preview browser"],
    "browser",
    "browser",
  ),
  preview_press: tool(
    ["Press", "Pressing", "Pressed", "a key in the preview browser"],
    "browser",
    "browser",
  ),
  preview_type: tool(["Type", "Typing", "Typed", "in the preview browser"], "browser", "browser"),
  preview_hover: tool(
    ["Hover", "Hovering", "Hovered", "in the preview browser"],
    "browser",
    "browser",
  ),
  preview_select: tool(
    ["Choose", "Choosing", "Chose", "an option in the preview browser"],
    "browser",
    "browser",
  ),
  preview_drag: tool(
    ["Drag", "Dragging", "Dragged", "in the preview browser"],
    "browser",
    "browser",
  ),
  preview_upload: tool(
    ["Upload", "Uploading", "Uploaded", "files to the preview browser"],
    "browser",
    "browser",
  ),
  preview_scroll: tool(
    ["Scroll", "Scrolling", "Scrolled", "the preview browser"],
    "browser",
    "browser",
  ),
  preview_resize: tool(
    ["Resize", "Resizing", "Resized", "the preview browser"],
    "browser",
    "browser",
  ),
  preview_evaluate: tool(
    ["Evaluate", "Evaluating", "Evaluated", "script in the preview browser"],
    "browser",
    "browser",
  ),
  preview_wait_for: tool(
    ["Wait", "Waiting", "Waited", "for the preview page"],
    "browser",
    "browser",
  ),
  preview_set_appearance: tool(
    ["Set", "Setting", "Set", "preview browser appearance"],
    "browser",
    "browser",
  ),
  preview_recording_start: tool(
    ["Start", "Starting", "Started", "recording the preview browser"],
    "browser",
    "browser",
  ),
  preview_recording_stop: tool(
    ["Stop", "Stopping", "Stopped", "recording the preview browser"],
    "browser",
    "browser",
  ),
  device_list: tool(["List", "Listing", "Listed", "simulators and emulators"], "device", "device"),
  device_open: tool(
    ["Open", "Opening", "Opened", "a device in the Device panel"],
    "device",
    "device",
  ),
  device_screenshot: tool(
    ["Take a screenshot of", "Taking a screenshot of", "Took a screenshot of", "the device"],
    "device",
    "device",
  ),
  device_close: tool(["Close", "Closing", "Closed", "a device"], "device", "device"),
  run_scheduled_task_now: tool(
    ["Run", "Running", "Requested a run of", "a scheduled task"],
    "schedule-run",
  ),
  thread_queue: tool(["Manage", "Managing", "Managed", "queued messages"], "queue-edit"),
  pending_request: tool(["Handle", "Handling", "Handled", "pending questions"], "question-respond"),
  queue_list: tool(["List", "Listing", "Listed", "queued messages"], "queue-list"),
  queue_read: tool(["Read", "Reading", "Read", "a queued message"], "queue-read"),
  queue_edit: tool(["Edit", "Editing", "Edited", "a queued message"], "queue-edit"),
  queue_cancel: tool(
    ["Cancel", "Canceling", "Requested cancellation of", "a queued run"],
    "queue-cancel",
  ),
  queue_reorder: tool(["Reorder", "Reordering", "Reordered", "a queued run"], "queue-reorder"),
  queue_promote_to_steer: tool(
    ["Steer with", "Steering with", "Requested steering with", "a queued message"],
    "queue-steer",
  ),
  pending_request_list: tool(["List", "Listing", "Listed", "pending questions"], "question-list"),
  pending_request_read: tool(["Read", "Reading", "Read", "pending questions"], "question-read"),
  pending_request_respond: tool(
    ["Answer", "Answering", "Answered", "pending questions"],
    "question-respond",
  ),
  thread_configuration: tool(
    ["Read", "Reading", "Read", "thread configuration"],
    "thread-configuration",
  ),
  thread_configure: tool(["Set", "Setting", "Set", "thread model"], "thread-configure"),
  thread_transfer: tool(["Use", "Using", "Used", "thread transfers"], "thread-fork"),
  thread_fork: tool(["Fork", "Forking", "Requested a fork of", "this thread"], "thread-fork"),
  thread_merge_back: tool(
    ["Merge", "Merging", "Requested a merge of", "thread context"],
    "thread-merge",
  ),
  thread_search: tool(["Search", "Searching", "Searched", "thread content"], "thread-search"),
  thread_transfers: tool(["Read", "Reading", "Read", "thread transfers"], "thread-transfers"),
  thread_organize: tool(["Organize", "Organizing", "Organized", "a thread"], "thread-organize"),
  thread_update: tool(
    ["Update", "Updating", "Updated", "Control thread metadata"],
    "thread-update",
  ),
  worktree_list: tool(["List", "Listing", "Listed", "workspace branches"], "worktree-list"),
  preview_list: tool(["List", "Listing", "Listed", "preview tabs"], "browser", "browser"),
  preview_close: tool(["Close", "Closing", "Closed", "a preview tab"], "browser", "browser"),
  environment_read: tool(
    ["Read", "Reading", "Read", "environment preferences"],
    "environment-read",
  ),
  environment_preferences_update: tool(
    ["Update", "Updating", "Updated", "environment preferences"],
    "environment-update",
  ),
  lock_read: tool(["Read", "Reading", "Read", "the lock"], "lock-read"),
  loose_end_add: tool(["File", "Filing", "Filed", "a loose end"], "loose-end-add"),
  loose_end_list: tool(["List", "Listing", "Listed", "loose ends"], "loose-end-list"),
  loose_end_close: tool(["Close", "Closing", "Closed", "a loose end"], "loose-end-close"),
  local_model_list: tool(["List", "Listing", "Listed", "local models"], "local-model-list"),
  local_model_wake: tool(["Wake", "Waking", "Woke", "a local model"], "local-model-wake"),
  local_model_sleep: tool(
    ["Sleep", "Sleeping", "Slept", "a local model"],
    "local-model-sleep",
    "control",
    "Put a local model to sleep",
  ),
  local_model_run: tool(["Run", "Running", "Ran", "a local model"], "local-model-run"),
  thread_launch: tool(["Launch", "Launching", "Launched", "a project thread"], "thread-create"),
  project_list: tool(["List", "Listing", "Listed", "projects"], "project-list"),
  project_read: tool(["Read", "Reading", "Read", "a project"], "project-read"),
  project_create: tool(["Register", "Registering", "Registered", "a project"], "project-create"),
  project_update: tool(["Update", "Updating", "Updated", "a project"], "project-update"),
  project_delete: tool(["Delete", "Deleting", "Deleted", "a project"], "project-delete"),
  project_clone: tool(["Clone", "Cloning", "Cloned", "a repository"], "project-clone"),
  attachment_prepare_upload: tool(
    ["Prepare", "Preparing", "Prepared", "an attachment upload"],
    "attachment-prepare",
  ),
  attachment_discard: tool(
    ["Discard", "Discarding", "Discarded", "a pending attachment"],
    "attachment-discard",
  ),
  thread_send_attachments: tool(["Send", "Sending", "Sent", "attachments"], "attachment-send"),
  html_preview: tool(["Preview", "Previewing", "Previewed", "an HTML page"], "html-preview"),
  html_render: tool(["Render", "Rendering", "Rendered", "an HTML page"], "html-render"),
};

/**
 * The Control orchestration tool inventory, used to gate loose name matching on
 * both the server (ACP MCP identity recovery) and the client (logo branding).
 */
export const CONTROL_MCP_TOOL_NAMES: ReadonlySet<string> = new Set(Object.keys(CONTROL_MCP_TOOLS));

function normalizeControlMcpToolLabel(value: string): string {
  return value.replace(/\s+(?:complete|completed)\s*$/i, "").trim();
}

/** Older chats name most tools with a `t3_` prefix (`t3_thread_read`). */
const withoutLegacyPrefix = (tool: string) => tool.replace(/^t3_/i, "");

/**
 * Agents disagree on how the injected server prefixes its tools:
 * `mcp__control__x` (Claude), `control.x`, plus single underscore, colon,
 * slash, dash, and space separators. The prefix match is deliberately loose
 * because the display-name inventory is the real gate; unknown tools stay on
 * the generic renderer.
 */
function resolveControlMcpToolName(value: string): string | null {
  const label = normalizeControlMcpToolLabel(value);
  const mcpMatch = /^mcp__(?<server>.+?)__(?<tool>.+)$/i.exec(label);
  if (mcpMatch?.groups) {
    const { server, tool } = mcpMatch.groups;
    return server !== undefined &&
      tool !== undefined &&
      CONTROL_MCP_SERVER_ALIASES.has(server.toLowerCase())
      ? withoutLegacyPrefix(tool)
      : null;
  }

  const namespaceMatch =
    /^(?<server>control|t3-code|t3_code|t3code)(?:[.:/]|\s*·\s*)(?<tool>.+)$/i.exec(label);
  if (namespaceMatch?.groups) {
    const tool = namespaceMatch.groups.tool;
    return tool === undefined ? null : withoutLegacyPrefix(tool);
  }

  const prefixed = /^(?:mcp[-_]{1,2})?(?:t3[-_ ]?code|control)(?:__|[-_.:/ ])(?<tool>.+)$/i.exec(
    label,
  );
  const candidate = withoutLegacyPrefix(prefixed?.groups?.tool ?? label);
  return Object.hasOwn(CONTROL_MCP_TOOLS, candidate) ? candidate : null;
}

/** The bare Control tool name (`html_render`) for any provider's spelling of it. */
export function resolveControlMcpToolId(toolName: string | null | undefined): string | null {
  const name = toolName == null ? null : resolveControlMcpToolName(toolName);
  return name !== null && Object.hasOwn(CONTROL_MCP_TOOLS, name) ? name : null;
}

type SummaryInput = Readonly<Record<string, unknown>>;

const asSummaryInput = (input: unknown): SummaryInput | undefined =>
  typeof input === "object" && input !== null ? (input as SummaryInput) : undefined;

/** Action tools present each call as the single-purpose tool its action replaced. */
const ACTION_TOOLS: Readonly<Record<string, (action: string) => string | undefined>> = {
  preview_act: (action) => `preview_${action}`,
  thread_queue: (action) => `queue_${action}`,
  pending_request: (action) => `pending_request_${action}`,
  thread_transfer: (action) =>
    ({ fork: "thread_fork", merge_back: "thread_merge_back", status: "thread_transfers" })[action],
};

/** Tools whose summary depends on which fields a call sets. */
const FIELD_SUMMARIES: Readonly<
  Record<string, (input: SummaryInput) => ControlMcpToolSummaryAction>
> = {
  thread_configure: ({ modelSelection }) =>
    modelSelection === undefined ? "thread-configuration" : "thread-configure",
  schedule_task: ({ scheduledTaskId }) =>
    scheduledTaskId === undefined ? "schedule-create" : "schedule-update",
};

/**
 * Pass the call's input so an action tool resolves to the labels of its action;
 * older threads' single-purpose tool names keep their own entries.
 */
export function resolveControlMcpToolDefinition(
  toolName: string | null | undefined,
  input?: unknown,
): ControlMcpToolDefinition | null {
  const name = toolName == null ? null : resolveControlMcpToolName(toolName);
  if (name === null || !Object.hasOwn(CONTROL_MCP_TOOLS, name)) return null;
  const action = asSummaryInput(input)?.action;
  const actionTool = typeof action === "string" ? ACTION_TOOLS[name]?.(action) : undefined;
  return actionTool !== undefined && Object.hasOwn(CONTROL_MCP_TOOLS, actionTool)
    ? CONTROL_MCP_TOOLS[actionTool]!
    : CONTROL_MCP_TOOLS[name]!;
}

export function resolveControlMcpToolPresentation(
  toolName: string | null | undefined,
  input?: unknown,
): ControlMcpToolPresentation | null {
  const definition = resolveControlMcpToolDefinition(toolName, input);
  return definition === null ? null : { displayName: definition.displayName, logo: "control" };
}

export function resolveControlMcpToolSummaryAction(
  toolName: string | null | undefined,
  input?: unknown,
): ControlMcpToolSummaryAction | null {
  const definition = resolveControlMcpToolDefinition(toolName, input);
  if (definition === null) return null;
  const fields = asSummaryInput(input);
  const summarize = FIELD_SUMMARIES[resolveControlMcpToolName(toolName!) ?? ""];
  return fields !== undefined && summarize !== undefined
    ? summarize(fields)
    : definition.summaryAction;
}
