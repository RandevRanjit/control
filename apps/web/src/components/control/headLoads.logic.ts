import type {
  OrchestrationV2ProviderThreadLoads,
  OrchestrationV2ThreadLoadsOff,
  OrchestrationV2ThreadLoadSwitch,
} from "@control/contracts";

export type LoadKey = "hooks" | "skills" | "mcpServers" | "plugins";
type Names = NonNullable<OrchestrationV2ProviderThreadLoads["names"]>;

/**
 * A row of a head pill's list (HeadLoads): a hook event and its handlers, a skill, a plugin's
 * skills under it, an MCP server and its tools. Children fold under their parent.
 */
export interface LoadNode {
  readonly id: string;
  readonly name: string;
  /** A tool's or a hook handler's name is code. */
  readonly code?: boolean;
  readonly description?: string;
  /** Right-hand caption: where it comes from, a count. */
  readonly caption?: string;
  /** An MCP server's connection status, Claude's word for it; `disabled` when switched off. */
  readonly status?: string;
  readonly hint?: "read-only" | "destructive";
  /** What a click puts in the composer. */
  readonly compose?: string;
  /** Whether it is on for this chat; `pending` until the chat's next turn applies it. */
  readonly toggle?: {
    readonly loadSwitch: Omit<OrchestrationV2ThreadLoadSwitch, "on">;
    readonly on: boolean;
    readonly pending: boolean;
  };
  /** A claude.ai connector that wants signing in, which happens on claude.ai. */
  readonly signIn?: boolean;
  readonly children?: ReadonlyArray<LoadNode>;
}

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });

/** How a server's or skill's origin reads in the list. */
const SOURCE_LABEL: Record<string, string> = {
  claudeai: "claude.ai",
  dynamic: "CONTROL",
  sdk: "CONTROL",
};

const NO_OFF: OrchestrationV2ThreadLoadsOff = { mcpServers: [], plugins: [] };

/** Plugin skills arrive as `plugin:name`; the names each plugin adds, by plugin. */
function skillsByPlugin(skills: ReadonlyArray<string>): Map<string | null, Array<string>> {
  const groups = new Map<string | null, Array<string>>();
  for (const full of skills) {
    const colon = full.indexOf(":");
    const plugin = colon > 0 ? full.slice(0, colon) : null;
    groups.set(plugin, [...(groups.get(plugin) ?? []), full]);
  }
  return groups;
}

function skillNode(names: Names, full: string, plugin: string | null): LoadNode {
  const about = names.about?.skills[full];
  return {
    id: `skill:${full}`,
    name: plugin === null ? full : full.slice(plugin.length + 1),
    ...(about?.description === undefined ? {} : { description: about.description }),
    ...(plugin !== null || about?.source === undefined ? {} : { caption: about.source }),
    compose: `/${full} `,
  };
}

/** A switch's state: what the chat wants, and whether the running session differs. */
function toggleFor(
  kind: OrchestrationV2ThreadLoadSwitch["kind"],
  name: string,
  wantedOff: boolean,
  loaded: boolean,
): NonNullable<LoadNode["toggle"]> {
  return { loadSwitch: { kind, name }, on: !wantedOff, pending: wantedOff === loaded };
}

function mcpServerRows(names: Names, off: OrchestrationV2ThreadLoadsOff): Array<LoadNode> {
  const loaded = new Map(names.mcpServers.map((server) => [server.name, server]));
  const listed = new Set([...loaded.keys(), ...(names.off?.mcpServers ?? []), ...off.mcpServers]);
  return [...listed].map((name) => {
    const server = loaded.get(name);
    const tools = server?.tools ?? [];
    const source = server?.source;
    // CONTROL's own servers stay on; a plugin's servers go with the plugin.
    const switchable = source !== "dynamic" && source !== "sdk" && source !== "plugin";
    const caption = [source === undefined ? undefined : (SOURCE_LABEL[source] ?? source)]
      .concat(tools.length === 0 ? [] : [String(tools.length)])
      .filter(Boolean)
      .join(" · ");
    return {
      id: `server:${name}`,
      name,
      status: server?.status ?? "disabled",
      ...(caption === "" ? {} : { caption }),
      ...(server?.error === undefined
        ? source === "plugin"
          ? { description: "Comes with its plugin; switch it in Plugins." }
          : {}
        : { description: server.error }),
      ...(switchable
        ? { toggle: toggleFor("mcpServer", name, off.mcpServers.includes(name), !!server) }
        : {}),
      ...(server?.status === "needs-auth" && source === "claudeai" ? { signIn: true } : {}),
      ...(tools.length === 0
        ? {}
        : {
            children: tools
              .map((tool) => {
                const hint = server?.toolHints?.[tool];
                return {
                  id: `tool:${name}:${tool}`,
                  name: tool,
                  code: true,
                  ...(hint === undefined ? {} : { hint }),
                };
              })
              .toSorted(byName),
          }),
    };
  });
}

function pluginRows(names: Names, off: OrchestrationV2ThreadLoadsOff): Array<LoadNode> {
  const groups = skillsByPlugin(names.skills);
  // A switched-off plugin is known only by its id, name@marketplace.
  const offIds = [...(names.off?.plugins ?? []), ...off.plugins];
  const idOf = (name: string) =>
    names.about?.plugins[name]?.id ?? offIds.find((id) => id.split("@")[0] === name);
  const listed = new Set([...names.plugins, ...offIds.map((id) => id.split("@")[0] ?? id)]);
  return [...listed].map((name) => {
    const id = idOf(name);
    const loaded = names.plugins.includes(name);
    const skills = loaded ? (groups.get(name) ?? []) : [];
    const description = names.about?.plugins[name]?.description;
    const marketplace = id?.split("@")[1];
    const caption = [marketplace, skills.length === 0 ? undefined : String(skills.length)]
      .filter(Boolean)
      .join(" · ");
    return {
      id: `plugin:${name}`,
      name,
      ...(description === undefined ? {} : { description }),
      ...(caption === "" ? {} : { caption }),
      ...(loaded ? {} : { status: "disabled" }),
      ...(id === undefined
        ? {}
        : { toggle: toggleFor("plugin", id, off.plugins.includes(id), loaded) }),
      ...(skills.length === 0
        ? {}
        : {
            children: skills.map((full) => skillNode(names, full, name)).toSorted(byName),
          }),
    };
  });
}

/**
 * A head pill's list (HeadLoads): hooks by event, each folding open to its handlers; the
 * owner's skills, then each plugin's under a fold; MCP servers with their status and switch,
 * folding open to their tools; plugins with their switch, folding open to their skills. A
 * server or plugin switched off for the chat stays listed so it can be switched back on.
 * Null for loads recorded before the names were.
 */
export function loadTree(
  loads: Pick<OrchestrationV2ProviderThreadLoads, "names">,
  key: LoadKey,
  off: OrchestrationV2ThreadLoadsOff = NO_OFF,
): ReadonlyArray<LoadNode> | null {
  const names = loads.names;
  if (names === undefined) return null;
  if (key === "hooks") {
    const handlers = names.hookHandlers;
    if (handlers === undefined) {
      const counts = new Map<string, number>();
      for (const event of names.hooks) counts.set(event, (counts.get(event) ?? 0) + 1);
      return [...counts]
        .map(([name, count]) => ({ id: `hook:${name}`, name, caption: String(count) }))
        .toSorted(byName);
    }
    const byEvent = new Map<string, Array<LoadNode>>();
    for (const handler of handlers) {
      const lines = byEvent.get(handler.event) ?? [];
      lines.push({
        // Two hooks can be the same handler twice, so each is keyed by its place.
        id: `handler:${handler.event}:${lines.length}`,
        name: handler.command,
        code: true,
        description: [handler.matcher, handler.source].filter(Boolean).join(" · "),
      });
      byEvent.set(handler.event, lines);
    }
    return [...byEvent]
      .map(([name, children]) => ({
        id: `hook:${name}`,
        name,
        caption: String(children.length),
        children,
      }))
      .toSorted(byName);
  }
  if (key === "mcpServers") return mcpServerRows(names, off).toSorted(byName);
  if (key === "plugins") return pluginRows(names, off).toSorted(byName);
  const groups = skillsByPlugin(names.skills);
  const own = (groups.get(null) ?? []).map((full) => skillNode(names, full, null)).toSorted(byName);
  const plugins = [...groups]
    .flatMap(([plugin, skills]): Array<LoadNode> => {
      if (plugin === null) return [];
      const description = names.about?.plugins[plugin]?.description;
      return [
        {
          id: `plugin:${plugin}`,
          name: plugin,
          ...(description === undefined ? {} : { description }),
          caption: String(skills.length),
          children: skills.map((full) => skillNode(names, full, plugin)).toSorted(byName),
        },
      ];
    })
    .toSorted(byName);
  return [...own, ...plugins];
}

/**
 * The rows a search keeps: a row whose name or description holds the query keeps its
 * children; otherwise it stays only as the parent of children that match.
 */
export function filterLoadTree(
  nodes: ReadonlyArray<LoadNode>,
  query: string,
): ReadonlyArray<LoadNode> {
  const needle = query.trim().toLowerCase();
  if (needle === "") return nodes;
  return nodes.flatMap((node) => {
    const own = `${node.name}\n${node.description ?? ""}`.toLowerCase().includes(needle);
    if (own) return [node];
    const children = filterLoadTree(node.children ?? [], needle);
    return children.length === 0 ? [] : [{ ...node, children }];
  });
}
