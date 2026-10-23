import type { OrchestrationV2ProviderThreadLoads } from "@control/contracts";
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
import { useState } from "react";

import { AgentElapsed } from "../chat/AgentElapsed";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { ScrollArea } from "../ui/scroll-area";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import type { HeadAgentRow, HeadAgents } from "./headAgents.logic";
import { type LoadRow, loadRows } from "./headLoads.logic";

const PILLS = [
  ["hooks", WebhookIcon, "Hooks", "Hooks by event"],
  ["skills", SparklesIcon, "Skills", "Skills"],
  ["mcpServers", PlugIcon, "MCP", "MCP servers"],
  ["plugins", BlocksIcon, "Plugins", "Plugins"],
] as const;

/**
 * Design v1's head (§4.1): what this chat's session loaded, as four pills, then the subagents
 * and workflows the chat started. A click lists what a count is, on a float panel like Loose
 * ends' (§17.2). The loads are empty before the session's first turn; the strip still fills the
 * head so the panel toggles keep to its right end.
 */
export function HeadLoads(props: {
  readonly loads: OrchestrationV2ProviderThreadLoads | null;
  readonly agents: HeadAgents | null;
}) {
  const { loads, agents } = props;
  return (
    <div className="d-loads">
      {loads === null
        ? null
        : PILLS.map(([key, Icon, label, title]) => {
            const rows = loadRows(loads, key);
            return (
              <Popover key={key}>
                <PopoverTrigger
                  render={<button type="button" className="d-ld" />}
                  aria-label={`${title}: ${loads[key]}`}
                >
                  <Icon className="t3g" />
                  <span>{label}</span>
                  <b>{loads[key]}</b>
                </PopoverTrigger>
                <PopoverPopup variant="bare" align="start" sideOffset={6}>
                  <div className="panel float d-ldp">
                    <p className="d-ldp-h">
                      {title}
                      <span className="t-num">{loads[key]}</span>
                    </p>
                    {rows === null || rows.length === 0 ? (
                      <p className="d-ldp-e">
                        {rows === null ? "The list comes with this chat's next turn." : "None."}
                      </p>
                    ) : (
                      <ScrollArea scrollFade hideScrollbars className="max-h-[360px]">
                        <LoadList rows={rows} />
                      </ScrollArea>
                    )}
                  </div>
                </PopoverPopup>
              </Popover>
            );
          })}
      {agents === null || (loads === null && agents.started === 0) ? null : (
        <AgentsPill agents={agents} />
      )}
    </div>
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

/** A pill's rows; one with lines (a hook's handlers, a plugin's skills, a server's tools) folds. */
function LoadList(props: { readonly rows: ReadonlyArray<LoadRow> }) {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const anyFold = props.rows.some((row) => row.lines !== undefined);
  return props.rows.map((row) => {
    if (row.lines === undefined) {
      return (
        <p key={row.name} className="d-ldp-r" data-indent={anyFold || undefined}>
          <span>{row.name}</span>
          <LoadDetail row={row} />
        </p>
      );
    }
    const isOpen = open.has(row.name);
    const Chevron = isOpen ? ChevronDownIcon : ChevronRightIcon;
    return (
      <div key={row.name}>
        <button
          type="button"
          className="d-ldp-r d-ldp-f"
          aria-expanded={isOpen}
          onClick={() =>
            setOpen((current) => {
              const next = new Set(current);
              if (isOpen) next.delete(row.name);
              else next.add(row.name);
              return next;
            })
          }
        >
          <Chevron className="t3g" />
          <span>{row.name}</span>
          <LoadDetail row={row} />
        </button>
        {isOpen ? <FoldLines lines={row.lines} /> : null}
      </div>
    );
  });
}

/** Two hooks can be the same handler twice, so a repeat is keyed by its occurrence. */
function FoldLines(props: { readonly lines: NonNullable<LoadRow["lines"]> }) {
  const seen = new Map<string, number>();
  return props.lines.map((line) => {
    const id = `${line.name}\u0000${line.detail ?? ""}`;
    const occurrence = (seen.get(id) ?? 0) + 1;
    seen.set(id, occurrence);
    return (
      <p key={`${id}\u0000${occurrence}`} className="d-ldp-l">
        <span>{line.name}</span>
        {line.detail === undefined ? null : <span>{line.detail}</span>}
      </p>
    );
  });
}

function LoadDetail(props: { readonly row: LoadRow }) {
  const { detail, status } = props.row;
  const known = status === undefined ? undefined : MCP_STATUS[status];
  if (status === undefined) return detail === undefined ? null : <span>{detail}</span>;
  const [Icon, label] = known ?? [CircleDashedIcon, status];
  return (
    <span className="d-ldp-st">
      {detail}
      <Tooltip>
        <TooltipTrigger render={<span data-st={status} aria-label={label} />}>
          <Icon className="t3g" />
        </TooltipTrigger>
        <TooltipPopup>{label}</TooltipPopup>
      </Tooltip>
    </span>
  );
}

/** The Agents pill: how many the chat started, blue while any runs; the list says which. */
function AgentsPill(props: { readonly agents: HeadAgents }) {
  const { started, running, done } = props.agents;
  const sections = [
    ["Running", running],
    ["Done", done],
  ] as const;
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button type="button" className="d-ld" data-running={running.length > 0 || undefined} />
        }
        aria-label={`Agents: ${started} started, ${running.length} running`}
      >
        <BotIcon className="t3g" />
        <span>Agents</span>
        <b>{started}</b>
      </PopoverTrigger>
      <PopoverPopup variant="bare" align="start" sideOffset={6}>
        <div className="panel float d-ldp">
          <p className="d-ldp-h">
            Agents
            <span className="t-num">{started}</span>
          </p>
          {running.length + done.length === 0 ? (
            <p className="d-ldp-e">No subagents or workflows in this chat yet.</p>
          ) : (
            <ScrollArea scrollFade hideScrollbars className="max-h-[360px]">
              {sections.map(([heading, rows]) =>
                rows.length === 0 ? null : (
                  <div key={heading} className="d-ldp-sec">
                    <p className="d-ldp-s">
                      {heading} · {rows.length}
                    </p>
                    {rows.map((row) => (
                      <p key={row.id} className="d-ldp-r">
                        <span>{row.name}</span>
                        <span data-failed={row.outcome === "failed" || undefined}>
                          <AgentDetail row={row} />
                        </span>
                      </p>
                    ))}
                  </div>
                ),
              )}
            </ScrollArea>
          )}
        </div>
      </PopoverPopup>
    </Popover>
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
