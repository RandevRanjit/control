import type {
  OrchestrationV2ProviderThreadLoads,
  OrchestrationV2ThreadLoadsOff,
  OrchestrationV2ThreadLoadSwitch,
  ScopedThreadRef,
  ThreadId,
} from "@control/contracts";
import {
  BlocksIcon,
  BotIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  CircleMinusIcon,
  CircleXIcon,
  LogInIcon,
  PlugIcon,
  SparklesIcon,
  WebhookIcon,
} from "lucide-react";
import { type ReactNode, useState } from "react";

import { useOpenLink } from "../../browser/useOpenLink";
import { AgentElapsed } from "../chat/AgentElapsed";
import { Input } from "../ui/input";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { ScrollArea } from "../ui/scroll-area";
import { Switch } from "../ui/switch";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import type { HeadAgentRow, HeadAgents } from "./headAgents.logic";
import { filterLoadTree, type LoadKey, type LoadNode, loadTree } from "./headLoads.logic";

const PILLS = [
  ["hooks", WebhookIcon, "Hooks", "Hooks by event"],
  ["skills", SparklesIcon, "Skills", "Skills"],
  ["mcpServers", PlugIcon, "MCP", "MCP servers"],
  ["plugins", BlocksIcon, "Plugins", "Plugins"],
] as const;

/** Where a claude.ai connector is signed in to; Claude can't do it from a session. */
const CLAUDE_CONNECTORS_URL = "https://claude.ai/settings/connectors";

/** What the head does for the owner from its lists (ChatView wires them to the chat). */
export interface HeadActions {
  /** Puts text at the start of the composer and focuses it. */
  readonly compose: (text: string) => void;
  /** Switches an MCP server or plugin off or on for this chat. */
  readonly switchLoad: (loadSwitch: OrchestrationV2ThreadLoadSwitch) => void;
  readonly openThread: (threadId: ThreadId) => void;
}

/**
 * Design v1's head (§4.1): what this chat's session loaded, as four pills, then the subagents
 * and workflows the chat started. A click lists what a count is, on a float panel like Loose
 * ends' (§17.2): a searchable tree whose rows say what each thing is and where it comes from.
 * A skill or agent type goes into the composer, a subagent opens its thread, and MCP servers
 * and plugins switch off and on for this chat. The loads are empty before the session's first
 * turn; the strip still fills the head so the panel toggles keep to its right end.
 */
export function HeadLoads(props: {
  readonly threadRef: ScopedThreadRef | null;
  readonly loads: OrchestrationV2ProviderThreadLoads | null;
  readonly off: OrchestrationV2ThreadLoadsOff | undefined;
  readonly agents: HeadAgents | null;
  readonly actions: HeadActions;
}) {
  const { loads, agents } = props;
  return (
    <div className="d-loads">
      {loads === null
        ? null
        : PILLS.map(([key, Icon, label, title]) => (
            <LoadPill key={key} {...props} loads={loads} kind={key} title={title}>
              <Icon className="t3g" />
              <span>{label}</span>
              <b>{loads[key]}</b>
            </LoadPill>
          ))}
      {agents === null || (loads === null && agents.started === 0) ? null : (
        <AgentsPill {...props} agents={agents} />
      )}
    </div>
  );
}

/** A pill and its float list, with the search box the longer lists need. */
function PillPanel(props: {
  readonly label: string;
  readonly trigger: ReactNode;
  readonly running?: boolean;
  readonly title: string;
  readonly count: number;
  readonly children: (query: string, close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger
        render={<button type="button" className="d-ld" data-running={props.running || undefined} />}
        aria-label={props.label}
      >
        {props.trigger}
      </PopoverTrigger>
      <PopoverPopup variant="bare" align="start" sideOffset={6}>
        <div className="panel float d-ldp">
          <p className="d-ldp-h">
            {props.title}
            <span className="t-num">{props.count}</span>
          </p>
          <div className="d-ldp-q">
            <Input
              type="search"
              size="sm"
              placeholder="Filter"
              aria-label={`Filter ${props.title.toLowerCase()}`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          {props.children(query, () => setOpen(false))}
        </div>
      </PopoverPopup>
    </Popover>
  );
}

function LoadPill(props: {
  readonly threadRef: ScopedThreadRef | null;
  readonly loads: OrchestrationV2ProviderThreadLoads;
  readonly off: OrchestrationV2ThreadLoadsOff | undefined;
  readonly kind: LoadKey;
  readonly title: string;
  readonly actions: HeadActions;
  readonly children: ReactNode;
}) {
  const { loads, kind, title } = props;
  const rows = loadTree(loads, kind, props.off);
  return (
    <PillPanel
      label={`${title}: ${loads[kind]}`}
      trigger={props.children}
      title={title}
      count={loads[kind]}
    >
      {(query, close) => {
        if (rows === null || rows.length === 0)
          return (
            <p className="d-ldp-e">
              {rows === null ? "The list comes with this thread's next turn." : "None."}
            </p>
          );
        const shown = filterLoadTree(rows, query);
        return shown.length === 0 ? (
          <p className="d-ldp-e">Nothing matches.</p>
        ) : (
          <ScrollArea scrollFade hideScrollbars className="max-h-[420px]">
            <LoadTree
              rows={shown}
              allOpen={query.trim() !== ""}
              threadRef={props.threadRef}
              actions={props.actions}
              close={close}
            />
          </ScrollArea>
        );
      }}
    </PillPanel>
  );
}

/** Claude's MCP server statuses, as an icon with the word on hover. */
const MCP_STATUS: Record<string, readonly [typeof CircleCheckIcon, string]> = {
  connected: [CircleCheckIcon, "Connected"],
  "needs-auth": [LogInIcon, "Needs sign-in"],
  failed: [CircleXIcon, "Failed"],
  pending: [CircleDashedIcon, "Connecting"],
  disabled: [CircleMinusIcon, "Off"],
};

function StatusIcon(props: {
  readonly status: string;
  readonly mark?: readonly [typeof CircleCheckIcon, string];
}) {
  const [Icon, label] = props.mark ?? MCP_STATUS[props.status] ?? [CircleDashedIcon, props.status];
  return (
    <Tooltip>
      <TooltipTrigger
        render={<span className="d-ldt-st" data-st={props.status} aria-label={label} />}
      >
        <Icon />
      </TooltipTrigger>
      <TooltipPopup>{label}</TooltipPopup>
    </Tooltip>
  );
}

/**
 * One row of a list: a fold chevron (or its empty slot, so names line up), the name with its
 * caption at the right and what it does under both, then any controls. A row that does
 * something is a button with the hover box.
 */
function Row(props: {
  readonly fold?: boolean | undefined;
  readonly icon?: ReactNode;
  readonly name: string;
  readonly code?: boolean | undefined;
  readonly description?: string | undefined;
  readonly note?: string | undefined;
  readonly caption?: ReactNode;
  readonly tone?: "failed" | "working" | undefined;
  readonly onClick?: (() => void) | undefined;
  /** What a click does, shown on hover. */
  readonly title?: string | undefined;
  readonly controls?: ReactNode;
}) {
  const Chevron = props.fold ? ChevronDownIcon : ChevronRightIcon;
  const body = (
    <>
      <span className="d-ldt-chev">{props.fold === undefined ? null : <Chevron />}</span>
      {props.icon}
      <span className="d-ldt-text">
        <span className="d-ldt-line">
          <span className="d-ldt-name" data-code={props.code || undefined}>
            {props.name}
          </span>
          {props.caption === undefined ? null : (
            <span className="d-ldt-cap" data-tone={props.tone}>
              {props.caption}
            </span>
          )}
        </span>
        {props.description === undefined ? null : (
          <span className="d-ldt-desc">{props.description}</span>
        )}
        {props.note === undefined ? null : <span className="d-ldt-note">{props.note}</span>}
      </span>
    </>
  );
  return (
    <div className="d-ldt-row" data-code={props.code || undefined}>
      {props.onClick === undefined ? (
        <div className="d-ldt-main">{body}</div>
      ) : (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                className="d-ldt-main"
                onClick={props.onClick}
                aria-expanded={props.fold}
              />
            }
          >
            {body}
          </TooltipTrigger>
          {props.title === undefined ? null : (
            <TooltipPopup side="right">{props.title}</TooltipPopup>
          )}
        </Tooltip>
      )}
      {props.controls}
    </div>
  );
}

function useFolds() {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return [open, toggle] as const;
}

/** A pill's rows, each folding open to its children under an indent guide. */
function LoadTree(props: {
  readonly rows: ReadonlyArray<LoadNode>;
  readonly allOpen: boolean;
  readonly threadRef: ScopedThreadRef | null;
  readonly actions: HeadActions;
  readonly close: () => void;
}) {
  const [open, toggle] = useFolds();
  const openLink = useOpenLink(props.threadRef);
  const render = (rows: ReadonlyArray<LoadNode>): ReactNode =>
    rows.map((row) => {
      const folds = row.children !== undefined && row.children.length > 0;
      const isOpen = folds && (props.allOpen || open.has(row.id));
      const { compose, toggle: rowSwitch } = row;
      return (
        <div key={row.id}>
          <Row
            fold={folds ? isOpen : undefined}
            icon={row.status === undefined ? undefined : <StatusIcon status={row.status} />}
            name={row.name}
            code={row.code}
            description={row.description}
            note={
              rowSwitch?.pending
                ? rowSwitch.on
                  ? "On from the next turn"
                  : "Off from the next turn"
                : undefined
            }
            caption={row.hint ?? row.caption}
            tone={row.hint === "destructive" ? "failed" : undefined}
            onClick={
              folds
                ? () => toggle(row.id)
                : compose === undefined
                  ? undefined
                  : () => {
                      props.actions.compose(compose);
                      props.close();
                    }
            }
            title={compose === undefined ? undefined : `Put ${compose.trim()} in the composer`}
            controls={
              <>
                {row.signIn ? (
                  <button
                    type="button"
                    className="pill ghost sm"
                    onClick={() => void openLink(CLAUDE_CONNECTORS_URL)}
                  >
                    Sign in
                  </button>
                ) : null}
                {rowSwitch === undefined ? null : (
                  <span className="d-ldt-sw">
                    <Switch
                      size="sm"
                      checked={rowSwitch.on}
                      aria-label={`${row.name} in this chat`}
                      onCheckedChange={(on) =>
                        props.actions.switchLoad({ ...rowSwitch.loadSwitch, on })
                      }
                    />
                  </span>
                )}
              </>
            }
          />
          {isOpen ? <div className="d-ldt-kids">{render(row.children ?? [])}</div> : null}
        </div>
      );
    });
  return render(props.rows);
}

const matches = (query: string, ...texts: ReadonlyArray<string | undefined>) =>
  texts.some((text) => text?.toLowerCase().includes(query.trim().toLowerCase()));

/** A started agent and the agents it started, kept when any of them matches. */
function filterAgents(rows: ReadonlyArray<HeadAgentRow>, query: string): Array<HeadAgentRow> {
  return rows.flatMap((row) => {
    if (matches(query, row.name)) return [row];
    const children = filterAgents(row.children, query);
    return children.length === 0 ? [] : [{ ...row, children }];
  });
}

const AGENT_STATUS = {
  running: [CircleDashedIcon, "Running"],
  done: [CircleCheckIcon, "Done"],
  failed: [CircleXIcon, "Failed"],
  stopped: [CircleMinusIcon, "Stopped"],
} as const;

/**
 * The Agents pill: how many the chat started, blue while any runs. Its list is the tree of
 * what started what: each of the owner's messages, the subagents its turn started, and theirs;
 * then workflows, then the agent types this session can start.
 */
function AgentsPill(props: {
  readonly agents: HeadAgents;
  readonly loads: OrchestrationV2ProviderThreadLoads | null;
  readonly actions: HeadActions;
}) {
  const { agents, actions } = props;
  const [open, toggle] = useFolds();
  const names = props.loads?.names;
  const types = (names?.agents ?? []).toSorted((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
  const agentRows = (rows: ReadonlyArray<HeadAgentRow>, close: () => void): ReactNode =>
    rows.map((row) => {
      const status = row.outcome ?? "running";
      const childThreadId = row.childThreadId;
      return (
        <div key={row.id}>
          <Row
            icon={<StatusIcon status={status} mark={AGENT_STATUS[status]} />}
            name={row.name}
            caption={<AgentDetail row={row} />}
            tone={
              row.outcome === "failed" ? "failed" : row.outcome === null ? "working" : undefined
            }
            onClick={
              childThreadId === null
                ? undefined
                : () => {
                    actions.openThread(childThreadId);
                    close();
                  }
            }
            title={childThreadId === null ? undefined : "Open its thread"}
          />
          {row.children.length === 0 ? null : (
            <div className="d-ldt-kids">{agentRows(row.children, close)}</div>
          )}
        </div>
      );
    });
  return (
    <PillPanel
      label={`Agents: ${agents.started} started, ${agents.running} running`}
      running={agents.running > 0}
      trigger={
        <>
          <BotIcon className="t3g" />
          <span>Agents</span>
          <b>{agents.started}</b>
        </>
      }
      title="Agents"
      count={agents.started}
    >
      {(query, close) => {
        const searching = query.trim() !== "";
        const turns = agents.turns.flatMap((turn) => {
          const kept = matches(query, turn.label) ? turn.agents : filterAgents(turn.agents, query);
          return kept.length === 0 ? [] : [{ ...turn, agents: kept }];
        });
        const workflows = filterAgents(agents.workflows, query);
        const shownTypes = types.filter((type) =>
          matches(query, type, names?.about?.agents[type]?.description),
        );
        if (turns.length + workflows.length + shownTypes.length === 0)
          return (
            <p className="d-ldp-e">
              {searching ? "Nothing matches." : "No subagents or workflows in this thread yet."}
            </p>
          );
        return (
          <ScrollArea scrollFade hideScrollbars className="max-h-[420px]">
            {turns.length === 0 ? null : (
              <div className="d-ldp-sec">
                <p className="d-ldp-s">Started</p>
                {turns.map((turn, index) => {
                  // The latest message's agents show; older turns fold.
                  const isOpen = searching || index === 0 ? !open.has(turn.id) : open.has(turn.id);
                  return (
                    <div key={turn.id}>
                      <Row
                        fold={isOpen}
                        name={turn.label}
                        caption={turn.ordinal === null ? undefined : `T${turn.ordinal}`}
                        onClick={() => toggle(turn.id)}
                      />
                      {isOpen ? (
                        <div className="d-ldt-kids">{agentRows(turn.agents, close)}</div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
            {workflows.length === 0 ? null : (
              <div className="d-ldp-sec">
                <p className="d-ldp-s">Workflows</p>
                {agentRows(workflows, close)}
              </div>
            )}
            {shownTypes.length === 0 ? null : (
              <div className="d-ldp-sec">
                <p className="d-ldp-s">Types</p>
                {shownTypes.map((type) => {
                  const about = names?.about?.agents[type];
                  const caption = [about?.source, about?.model].filter(Boolean).join(" · ");
                  return (
                    <Row
                      key={type}
                      name={type}
                      description={about?.description}
                      caption={caption === "" ? undefined : caption}
                      onClick={() => {
                        actions.compose(`Use the ${type} agent to `);
                        close();
                      }}
                      title={`Ask for the ${type} agent in the composer`}
                    />
                  );
                })}
              </div>
            )}
          </ScrollArea>
        );
      }}
    </PillPanel>
  );
}

/** "4m" while a subagent runs, "done · 4m" after; a workflow says so, with its outcome. */
function AgentDetail(props: { readonly row: HeadAgentRow }) {
  const { kind, outcome, timing } = props.row;
  if (kind === "workflow") return outcome === null ? "workflow" : `workflow · ${outcome}`;
  if (timing === null || timing.startedAt === null) return outcome;
  const elapsed = <AgentElapsed agent={timing} compact />;
  return outcome === null ? (
    elapsed
  ) : (
    <>
      {outcome} · {elapsed}
    </>
  );
}
