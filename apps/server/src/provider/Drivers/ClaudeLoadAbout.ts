import type { AgentInfo, McpServerStatus, SlashCommand } from "@anthropic-ai/claude-agent-sdk";
import type { ClaudeSettings, OrchestrationV2ProviderThreadLoads } from "@control/contracts";
import { fromLenientJson } from "@control/shared/schemaJson";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { discoverClaudeSkills } from "./ClaudeSkills.ts";

type Names = NonNullable<OrchestrationV2ProviderThreadLoads["names"]>;
type Server = Names["mcpServers"][number];

/** What a live session reports about what it loaded (the SDK's control requests). */
export interface ClaudeLoadDetails {
  readonly commands: ReadonlyArray<SlashCommand>;
  readonly agents: ReadonlyArray<AgentInfo>;
  readonly mcpServers: ReadonlyArray<McpServerStatus>;
}

const DESCRIPTION_LIMIT = 200;

/** A description's first paragraph on one line, cut to the limit; the head shows two lines. */
function shortDescription(text: string | undefined): string | undefined {
  const first = text
    ?.split(/\n\s*\n/)[0]
    ?.replace(/\s+/g, " ")
    .trim();
  if (!first) return undefined;
  return first.length <= DESCRIPTION_LIMIT ? first : `${first.slice(0, DESCRIPTION_LIMIT - 1)}…`;
}

const pluginOf = (name: string) => {
  const colon = name.indexOf(":");
  return colon > 0 ? name.slice(0, colon) : undefined;
};

const decodeManifest = Schema.decodeUnknownEffect(
  fromLenientJson(Schema.Struct({ description: Schema.optional(Schema.String) })),
);

/** User and project agent files declare their name in frontmatter; the file name is a fallback. */
const agentScopes = Effect.fn("agentScopes")(function* (roots: ReadonlyArray<[string, string]>) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const scopes = new Map<string, string>();
  for (const [directory, scope] of roots) {
    const entries = yield* fileSystem
      .readDirectory(directory)
      .pipe(Effect.orElseSucceed((): ReadonlyArray<string> => []));
    for (const entry of entries) {
      if (!entry.endsWith(".md")) continue;
      const text = yield* fileSystem
        .readFileString(path.join(directory, entry))
        .pipe(Effect.orElseSucceed(() => ""));
      const name = /^name:\s*["']?([^"'\r\n]+?)["']?\s*$/m.exec(text)?.[1] ?? entry.slice(0, -3);
      if (!scopes.has(name)) scopes.set(name, scope);
    }
  }
  return scopes;
});

/**
 * An MCP server's row with what only the live session knows: why it failed, and which of its
 * tools it marks read-only or destructive. Claude reports no tool descriptions.
 */
export function withServerStatus(server: Server, status: McpServerStatus | undefined): Server {
  const hints: Record<string, "read-only" | "destructive"> = {};
  for (const tool of status?.tools ?? []) {
    if (tool.annotations?.destructive) hints[tool.name] = "destructive";
    else if (tool.annotations?.readOnly) hints[tool.name] = "read-only";
  }
  return {
    ...server,
    ...(status?.error ? { error: shortDescription(status.error) } : {}),
    ...(Object.keys(hints).length === 0 ? {} : { toolHints: hints }),
  };
}

/**
 * What each skill, agent type and plugin of a session in `cwd` is and where it comes from,
 * for the head's lists (HeadLoads). A plugin's name prefixes its skills and agents; user
 * and project ones are found on disk; the rest ship with Claude Code.
 */
export const claudeLoadAbout = Effect.fn("claudeLoadAbout")(function* (input: {
  readonly settings: Pick<ClaudeSettings, "homePath">;
  readonly environment: NodeJS.ProcessEnv;
  readonly claudeHome: string;
  readonly cwd: string;
  readonly names: Pick<Names, "skills" | "agents">;
  readonly plugins: ReadonlyArray<{
    readonly name: string;
    readonly path: string;
    readonly id?: string;
  }>;
  readonly details: ClaudeLoadDetails;
}) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const skillScopes = new Map(
    (yield* discoverClaudeSkills(input.settings, input.cwd, input.environment)).flatMap((skill) =>
      skill.scope === undefined ? [] : [[skill.name, skill.scope] as const],
    ),
  );
  const commands = new Map(input.details.commands.map((command) => [command.name, command]));
  const skills = Object.fromEntries(
    input.names.skills.map((name) => {
      const plugin = pluginOf(name);
      const said = commands.get(name)?.description;
      // A plugin skill's description repeats the plugin's name in brackets first.
      const description = shortDescription(
        plugin !== undefined && said?.startsWith(`(${plugin}) `)
          ? said.slice(plugin.length + 3)
          : said,
      );
      return [
        name,
        {
          ...(description === undefined ? {} : { description }),
          source: plugin ?? skillScopes.get(name) ?? "built-in",
        },
      ];
    }),
  );
  const agentScope = yield* agentScopes([
    [path.join(input.claudeHome, "agents"), "user"],
    [path.join(input.cwd, ".claude", "agents"), "project"],
  ]);
  const agentInfo = new Map(input.details.agents.map((agent) => [agent.name, agent]));
  const agents = Object.fromEntries(
    input.names.agents.map((name) => {
      const info = agentInfo.get(name);
      const description = shortDescription(info?.description);
      return [
        name,
        {
          ...(description === undefined ? {} : { description }),
          source: pluginOf(name) ?? agentScope.get(name) ?? "built-in",
          ...(info?.model === undefined || info.model === "inherit" ? {} : { model: info.model }),
        },
      ];
    }),
  );
  const plugins: Record<string, { description?: string; id?: string }> = {};
  for (const plugin of input.plugins) {
    const manifest = yield* fileSystem
      .readFileString(path.join(plugin.path, ".claude-plugin", "plugin.json"))
      .pipe(
        Effect.flatMap(decodeManifest),
        Effect.orElseSucceed(() => ({ description: undefined })),
      );
    const description = shortDescription(manifest.description);
    plugins[plugin.name] = {
      ...(description === undefined ? {} : { description }),
      ...(plugin.id === undefined ? {} : { id: plugin.id }),
    };
  }
  return { skills, agents, plugins } satisfies NonNullable<Names["about"]>;
});
