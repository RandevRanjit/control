// @effect-diagnostics globalDate:off nodeBuiltinImport:off - The fixture stamps scripted frames.
/**
 * Design v1.2's fixture (design/hybrid/src/kit.js): its groups, projects and
 * chats, and the Claude turns that put each chat in its state. `seed.ts`
 * creates them through the real server; the scripted Claude
 * (`CONTROL_SCRIPTED_CLAUDE`) plays the turns.
 */
import * as NodeCrypto from "node:crypto";

const CLI_VERSION = "2.1.294";

/**
 * What every chat's session loads (kit.js LOADS: Hooks 6, Skills 77, MCP 5, Plugins 9,
 * Agents 12): the init frame lists the last four; the hooks are in the sandbox's settings.
 */
const named = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, index) => `${prefix}-${index + 1}`);
export const HOOK_SETTINGS = {
  hooks: {
    SessionStart: [{ hooks: named("start", 2).map((command) => ({ type: "command", command })) }],
    Stop: [{ hooks: named("stop", 4).map((command) => ({ type: "command", command })) }],
  },
};

export const GROUPS = [
  { id: "thesis", name: "THESIS", tint: "mint" },
  { id: "orbit", name: "ORBIT", tint: "rose" },
  { id: "ctrl", name: "CONTROL", tint: "peri" },
] as const;

/** Workspace roots are relative to the sandbox HOME, so the app shows them as `~/…`. */
export const PROJECTS = {
  thesis: { title: "Thesis", dir: "Documents/Thesis", tint: "mint" },
  orbit: { title: "orbit-website", dir: "Projects/orbit-website", tint: "rose" },
  port: { title: "portfolio", dir: "Projects/websites/portfolio", tint: "butter" },
  ctrl: { title: "control", dir: "Projects/control", tint: "peri" },
  relay: { title: "relay", dir: "Projects/relay", tint: "sage" },
  scratch: { title: "scratch", dir: ".control/scratch", tint: "lilac" },
} as const;
export type ProjectKey = keyof typeof PROJECTS;
/** CONTROL's scratch folder is not a repository, so its chats carry no branch. */
export const UNVERSIONED: ReadonlyArray<string> = ["scratch"];

const MODELS = { opus: "claude-opus-5-5", sonnet: "claude-sonnet-5-5", haiku: "claude-haiku-5-5" };
const EFFORT = ["low", "medium", "high", "xhigh", "max"] as const;

/**
 * How a chat reaches its design state:
 * done: a finished, unseen turn · idle: a finished turn, seen · working: a turn left running ·
 * needs: a Bash approval left open · failed: a Bash run that exits 1 ·
 * interrupted: a running turn cut by a server restart · background: a finished turn with two agents still running.
 * `choose` (a big resume parked on the CLI's summary dialog), `dreaming` (Claude's housekeeping) and `outside`
 * (lent to the CLI) have no v2 equivalent yet; their chats are idle.
 */
export type Plan =
  | "done"
  | "idle"
  | "working"
  | "needs"
  | "choose"
  | "failed"
  | "interrupted"
  | "background"
  | "dreaming"
  | "outside";

export interface Chat {
  readonly name: string;
  readonly group: (typeof GROUPS)[number]["id"] | null;
  readonly project: ProjectKey;
  readonly plan: Plan;
  readonly model: keyof typeof MODELS;
  readonly effort: 1 | 2 | 3 | 4 | 5;
  readonly tokens: number;
  readonly worktree?: string;
  readonly pinned?: boolean;
  readonly snoozed?: boolean;
  readonly selected?: boolean;
}

export const CHATS: ReadonlyArray<Chat> = [
  {
    name: "STATISTICS",
    group: "thesis",
    project: "thesis",
    plan: "needs",
    model: "opus",
    effort: 4,
    tokens: 64_000,
  },
  {
    name: "LINEAR_ALGEBRA",
    group: "thesis",
    project: "thesis",
    plan: "done",
    model: "sonnet",
    effort: 3,
    tokens: 41_000,
  },
  {
    name: "SIGNALS_101",
    group: "thesis",
    project: "thesis",
    plan: "interrupted",
    model: "opus",
    effort: 5,
    tokens: 138_000,
  },
  {
    name: "INTERNSHIPS",
    group: "thesis",
    project: "scratch",
    plan: "idle",
    model: "opus",
    effort: 3,
    tokens: 12_000,
    snoozed: true,
  },
  {
    name: "ORBIT-WEBSITE",
    group: "orbit",
    project: "orbit",
    plan: "working",
    model: "opus",
    effort: 5,
    tokens: 96_000,
    worktree: "site-v2",
    selected: true,
  },
  {
    name: "ORBIT-1-MARKET",
    group: "orbit",
    project: "orbit",
    plan: "choose",
    model: "sonnet",
    effort: 2,
    tokens: 31_000,
  },
  {
    name: "PORTFOLIO-SCROLL",
    group: "orbit",
    project: "port",
    plan: "failed",
    model: "opus",
    effort: 4,
    tokens: 138_000,
  },
  {
    name: "CONTROL",
    group: "ctrl",
    project: "ctrl",
    plan: "working",
    model: "opus",
    effort: 5,
    tokens: 58_000,
    worktree: "v2",
  },
  {
    name: "DESIGN-EXPLORATION",
    group: "ctrl",
    project: "ctrl",
    plan: "background",
    model: "opus",
    effort: 5,
    tokens: 26_000,
  },
  {
    name: "DEPS-AUDIT",
    group: "ctrl",
    project: "ctrl",
    plan: "dreaming",
    model: "haiku",
    effort: 2,
    tokens: 18_000,
  },
  {
    name: "RELAY MAIN",
    group: null,
    project: "relay",
    plan: "idle",
    model: "sonnet",
    effort: 3,
    tokens: 9_000,
    pinned: true,
  },
  {
    name: "CV-BUILD",
    group: null,
    project: "scratch",
    plan: "outside",
    model: "opus",
    effort: 3,
    tokens: 53_000,
  },
];

/**
 * Section 07's loose ends (design/hybrid/src/parts/loose.html), in the agent's words, filed over
 * CONTROL's MCP by each chat's finished turn. ORBIT-WEBSITE's last two are for the check to tick,
 * so its Done fold has something in it.
 */
const LOOSE_ENDS: Readonly<Record<string, ReadonlyArray<Frame>>> = {
  "ORBIT-WEBSITE": [
    {
      line: "Which forums should the launch posts go to?",
      reason:
        "Drafts are ready for r/ableton, KVR Audio and Elektronauts. Say which to keep and I'll drop the rest.",
    },
    {
      line: "Make accounts on KVR Audio and Elektronauts",
      reason:
        "So the posts can go up the day 1.0 ships. Both need an email check, which I can't do.",
      action: { kind: "file", value: "/tmp/orbit/launch/accounts.md" },
    },
    {
      line: "Send the two press emails",
      reason: "Drafted in Gmail to Ask.Audio and MusicRadar, with the 1.0 screenshots attached.",
      action: { kind: "link", value: "https://mail.google.com/mail/#drafts" },
    },
    { line: "Switch on GitHub's private vulnerability reporting" },
    { line: "Send me a screenshot of the notarisation email" },
  ],
  SIGNALS_101: [
    {
      line: "Bring the lab kit's serial number to the session",
      reason: "The booking form needs it.",
    },
  ],
  "RELAY MAIN": [
    {
      line: "Pair the watch and send me a rep log from one set",
      reason: "I can't read the sensor until it's paired.",
    },
  ],
};

const fileLooseEnds = (chat: Chat): ReadonlyArray<Frame> =>
  (LOOSE_ENDS[chat.name] ?? []).map((item) => ({
    type: "mcp.call",
    tool: "loose_end_add",
    arguments: item,
  }));

export function modelSelection(chat: Chat) {
  return {
    instanceId: "claudeAgent",
    model: MODELS[chat.model],
    options: [{ id: "effort", value: EFFORT[chat.effort - 1] }],
  };
}

// ---------- SDK frames ----------

type Frame = Record<string, unknown>;
const uuid = () => NodeCrypto.randomUUID();
const usage = (input: number, output: number, cacheRead = 0) => ({
  input_tokens: input,
  output_tokens: output,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: cacheRead,
});

/** `context` is what each reply's usage adds up to: the context bar's chat tokens. */
function frames(chat: Chat, context = 2) {
  const model = MODELS[chat.model];
  let message = 0;
  const assistant = (content: ReadonlyArray<Frame>): Frame => ({
    type: "assistant",
    message: {
      model,
      id: `msg_${chat.name}_${++message}`,
      type: "message",
      role: "assistant",
      content,
      stop_reason: null,
      stop_sequence: null,
      usage: usage(1, 1, context - 2),
    },
    parent_tool_use_id: null,
    uuid: uuid(),
  });
  let tool = 0;
  /** `structured` is the SDK's `tool_use_result`, which the row's numbers come from. */
  const call = (
    name: string,
    input: Frame,
    result: string,
    isError = false,
    structured?: Frame,
  ) => {
    const id = `toolu_${chat.name.replace(/\W/g, "")}_${++tool}`;
    return [
      assistant([{ type: "tool_use", id, name, input }]),
      {
        type: "user",
        message: {
          role: "user",
          content: [{ tool_use_id: id, type: "tool_result", content: result, is_error: isError }],
        },
        parent_tool_use_id: null,
        uuid: uuid(),
        ...(structured === undefined ? {} : { tool_use_result: structured }),
      },
    ];
  };
  const read = (path: string, lines: number) =>
    call("Read", { file_path: path }, `${lines} lines`, false, {
      type: "text",
      file: { filePath: path, content: "", numLines: lines, startLine: 1, totalLines: lines },
    });
  const edit = (path: string, added: number, removed: number) =>
    call("Edit", { file_path: path }, "ok", false, {
      filePath: path,
      structuredPatch: [
        {
          oldStart: 1,
          oldLines: removed,
          newStart: 1,
          newLines: added,
          lines: [
            ...Array.from({ length: removed }, () => "-old"),
            ...Array.from({ length: added }, () => "+new"),
          ],
        },
      ],
    });
  const bash = (input: Frame, stdout: string) =>
    call("Bash", input, stdout, false, { stdout, stderr: "", interrupted: false });
  const toolUse = (name: string, input: Frame) => {
    const id = `toolu_${chat.name.replace(/\W/g, "")}_${++tool}`;
    return { id, frame: assistant([{ type: "tool_use", id, name, input }]) };
  };
  return {
    init: (): Frame => ({
      type: "system",
      subtype: "init",
      agents: named("agent", 12),
      apiKeySource: "none",
      claude_code_version: CLI_VERSION,
      cwd: "/",
      tools: [],
      mcp_servers: named("mcp", 5).map((name) => ({ name, status: "connected" })),
      model,
      permissionMode: "bypassPermissions",
      slash_commands: [],
      output_style: "default",
      skills: named("skill", 77),
      plugins: named("plugin", 9).map((name) => ({ name, path: `/plugins/${name}` })),
      fast_mode_state: "off",
      uuid: uuid(),
    }),
    text: (text: string) => assistant([{ type: "text", text }]),
    call,
    read,
    edit,
    bash,
    toolUse,
    delay: (ms: number): Frame => ({ type: "delay", ms }),
    /** What the CLI answers when the adapter asks for its context after a turn. */
    contextReport: (
      totalTokens: number,
      maxTokens: number,
      autoCompactThreshold: number,
    ): Frame => ({
      type: "context.usage",
      report: { totalTokens, maxTokens, isAutoCompactEnabled: true, autoCompactThreshold },
    }),
    rateLimit: (rateLimitType: string, utilization: number, resetsAtMs: number): Frame => ({
      type: "rate_limit_event",
      rate_limit_info: {
        status: "allowed",
        rateLimitType,
        utilization,
        resetsAt: Math.round(resetsAtMs / 1000),
      },
      uuid: uuid(),
    }),
    result: (
      input: number,
      output: number,
      durationMs: number,
      error = false,
      cacheRead = 0,
    ): Frame => ({
      type: "result",
      subtype: error ? "error_during_execution" : "success",
      is_error: error,
      api_error_status: null,
      duration_ms: durationMs,
      duration_api_ms: durationMs,
      num_turns: 1,
      // An SDK error result lists its errors in place of the result text.
      ...(error ? { errors: ["exit 1"] } : { result: "" }),
      stop_reason: "end_turn",
      total_cost_usd: 0,
      usage: usage(input, output, cacheRead),
      modelUsage: {},
      permission_denials: [],
      uuid: uuid(),
    }),
  };
}

export interface Turn {
  readonly prompt: string;
  readonly frames: ReadonlyArray<Frame>;
}

/**
 * The moment the design shows: the selected chat's second turn started 41 s ago,
 * the 5-hour window resets in 1 h 10 min and the weekly one on Sunday.
 */
export interface Clock {
  readonly secondTurnAt: number;
  readonly shownAt: number;
}

export function clockFor(secondTurnAt: number): Clock {
  // Half a second past 41 s: the run starts a few ms after the send, and the timers floor.
  return { secondTurnAt, shownAt: secondTurnAt + 41_500 };
}

/** What the capabilities probe's `get_usage` answers: the usage block's 5H and 7D (0–100 here). */
export function usageFor(clock: Clock) {
  return {
    rate_limits_available: true,
    rate_limits: {
      five_hour: {
        utilization: 71,
        resets_at: new Date(clock.shownAt + 70 * 60_000).toISOString(),
      },
      seven_day: {
        utilization: 22,
        resets_at: new Date(nextSundayNoon(clock.shownAt)).toISOString(),
      },
    },
  };
}

function nextSundayNoon(ms: number): number {
  const date = new Date(ms);
  date.setDate(date.getDate() + ((7 - date.getDay()) % 7 || 7));
  date.setHours(12, 0, 0, 0);
  return date.getTime();
}

/** The selected chat's two turns, word for word from `dconvo()`. */
function orbitWebsite(chat: Chat, clock: Clock): ReadonlyArray<Turn> {
  // The context bar: chat 320,315 of 1m, compacting at 500k.
  const f = frames(chat, 320_315);
  return [
    {
      prompt: "/download says 11.2 MB but the DMG is 11.7",
      frames: [
        f.init(),
        f.delay(9_000),
        ...f.read("app/download/page.tsx", 64),
        f.delay(9_000),
        ...f.read("app/admin/page.tsx", 118),
        f.text(
          "The DMG grew in 0.2.3 and the label is a hand-typed string in two places. Neither page reads the file.",
        ),
        f.contextReport(320_315, 1_000_000, 500_000),
        ...fileLooseEnds(chat),
        // The turn line counts fresh input (↑ 2.1k); the card's total also counts cache reads.
        f.result(2_100, 640, 18_000, false, chat.tokens - 2_740),
      ],
    },
    {
      prompt: "put the release size in one place so /download and /admin can't drift",
      frames: [
        f.init(),
        f.rateLimit("five_hour", 0.71, clock.shownAt + 70 * 60_000),
        f.rateLimit("seven_day", 0.22, nextSundayNoon(clock.shownAt)),
        ...f.call("Skill", { skill: "release-notes" }, ""),
        ...f.read("lib/format.ts", 22),
        ...f.call(
          "Agent",
          { subagent_type: "explore", description: "every other place the size is typed" },
          "",
        ),
        ...f.edit("lib/release.ts", 2, 1),
        ...f.edit("app/download/page.tsx", 1, 1),
        ...f.call("Edit", { file_path: "app/admin/page.tsx" }, "string not found", true),
        ...f.read("app/admin/page.tsx", 118),
        ...f.edit("app/admin/page.tsx", 3, 1),
        f.delay(20_000),
        ...f.bash({ command: "bun run typecheck" }, ""),
        f.text(
          "Both pages read `release.size` now. Checking `/download` on the dev server in tab 2.",
        ),
        ...f.bash({ command: "bun run dev", run_in_background: true }, "port 3000"),
        ...f.call("mcp__control__preview_navigate", { url: "localhost:3000/download" }, ""),
        f.toolUse("mcp__control__preview_snapshot", { selector: "button.cta" }).frame,
      ],
    },
  ];
}

/** Every chat's turns. A turn without a `result` frame stays running. */
export function turns(chat: Chat, clock: Clock): ReadonlyArray<Turn> {
  if (chat.name === "ORBIT-WEBSITE") return orbitWebsite(chat, clock);
  const f = frames(chat);
  const prompt = `${chat.name}: pick up where we left off`;
  const done = [
    f.init(),
    f.text("Done."),
    ...fileLooseEnds(chat),
    f.result(chat.tokens - 1_000, 1_000, 4_000),
  ];
  // A turn left open has no usage yet, so a finished one before it carries the chat's tokens.
  const earlier = { prompt: `${chat.name}: catch me up`, frames: done };
  switch (chat.plan) {
    case "done":
    case "idle":
    case "choose":
    case "dreaming":
    case "outside":
      return [{ prompt, frames: done }];
    case "working":
    case "interrupted":
      return [earlier, { prompt, frames: [f.init(), ...f.read("README.md", 40)] }];
    case "needs": {
      const bash = f.toolUse("Bash", { command: "make test" });
      return [
        earlier,
        {
          prompt,
          frames: [
            f.init(),
            bash.frame,
            {
              type: "permission.request",
              toolName: "Bash",
              input: { command: "make test" },
              toolUseID: bash.id,
            },
          ],
        },
      ];
    }
    case "failed":
      return [
        {
          prompt,
          frames: [
            f.init(),
            ...f.call("Bash", { command: "bun run build" }, "exit 1", true),
            f.result(chat.tokens - 1_000, 1_000, 6_000, true),
          ],
        },
      ];
    case "background": {
      const agents = [1, 2].map((n) => ({
        type: "system",
        subtype: "task_started",
        task_id: `task_${n}`,
        tool_use_id: `toolu_bg_${n}`,
        description: `agent ${n}`,
        task_type: "local_agent",
        uuid: uuid(),
      }));
      return [
        {
          prompt,
          frames: [
            f.init(),
            ...agents,
            f.text("Two agents are on it."),
            f.result(chat.tokens - 1_000, 1_000, 5_000),
          ],
        },
      ];
    }
  }
}
