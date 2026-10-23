import type { OrchestrationV2ProviderThreadLoads } from "@control/contracts";

type LoadKey = Exclude<keyof OrchestrationV2ProviderThreadLoads, "names" | "agents">;
type Line = { readonly name: string; readonly detail?: string };
/** A pill's list row; one with `lines` folds open to them. `status` is an MCP server's. */
export type LoadRow = Line & {
  readonly status?: string;
  readonly lines?: ReadonlyArray<Line>;
};

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });

/** Plugin skills arrive as `plugin:name`; the names a plugin adds, by plugin. */
function skillsByPlugin(skills: ReadonlyArray<string>): Map<string | null, Array<Line>> {
  const groups = new Map<string | null, Array<Line>>();
  for (const full of skills) {
    const colon = full.indexOf(":");
    const plugin = colon > 0 ? full.slice(0, colon) : null;
    const lines = groups.get(plugin) ?? [];
    lines.push({ name: colon > 0 ? full.slice(colon + 1) : full });
    groups.set(plugin, lines);
  }
  return groups;
}

function fold(name: string, lines: ReadonlyArray<Line>): LoadRow {
  return lines.length === 0
    ? { name }
    : { name, detail: String(lines.length), lines: lines.toSorted(byName) };
}

/**
 * A head pill's list (HeadLoads): hooks by event, each folding open to its handlers; MCP
 * servers with their status, folding open to their tools; the owner's skills, then each
 * plugin's under a fold; plugins folding open to the skills they add. Null for loads
 * recorded before the names were.
 */
export function loadRows(
  loads: Pick<OrchestrationV2ProviderThreadLoads, "names">,
  key: LoadKey,
): ReadonlyArray<LoadRow> | null {
  const names = loads.names;
  if (names === undefined) return null;
  if (key === "hooks") {
    const handlers = names.hookHandlers;
    if (handlers === undefined) {
      const counts = new Map<string, number>();
      for (const event of names.hooks) counts.set(event, (counts.get(event) ?? 0) + 1);
      return [...counts].map(([name, count]) => ({ name, detail: String(count) })).toSorted(byName);
    }
    const byEvent = new Map<string, Array<Line>>();
    for (const handler of handlers) {
      const lines = byEvent.get(handler.event) ?? [];
      lines.push({
        name: handler.command,
        detail: [handler.matcher, handler.source].filter(Boolean).join(" · "),
      });
      byEvent.set(handler.event, lines);
    }
    return [...byEvent]
      .map(([name, lines]) => ({ name, detail: String(lines.length), lines }))
      .toSorted(byName);
  }
  if (key === "mcpServers") {
    return names.mcpServers
      .map(({ name, status, tools }) => ({
        ...fold(
          name,
          (tools ?? []).map((tool) => ({ name: tool })),
        ),
        status,
      }))
      .toSorted(byName);
  }
  const groups = skillsByPlugin(names.skills);
  if (key === "skills") {
    const own = (groups.get(null) ?? []).toSorted(byName);
    const plugins = [...groups]
      .flatMap(([plugin, lines]) => (plugin === null ? [] : [fold(plugin, lines)]))
      .toSorted(byName);
    return [...own, ...plugins];
  }
  return names.plugins.map((plugin) => fold(plugin, groups.get(plugin) ?? [])).toSorted(byName);
}
