import type { ServerConfig } from "@control/contracts";
import { Atom, AtomRegistry } from "effect/reactivity";
import { expect, it } from "vite-plus/test";

import { markdownServerConfigFieldsAtom } from "./chatMarkdownServerConfig";

const config = (fields: Partial<ServerConfig>) =>
  ({
    environment: { capabilities: { pullRequests: true }, platform: { os: "darwin" } },
    availableEditors: ["vscode"],
    providers: [],
    ...fields,
  }) as unknown as ServerConfig;

it("tells markdown about a config change only when a field it reads changes", () => {
  const registry = AtomRegistry.make();
  const first = config({});
  const configAtom = Atom.make<ServerConfig | null>(first);
  const fieldsAtom = markdownServerConfigFieldsAtom(configAtom);
  const seen: unknown[] = [];
  const unmount = registry.subscribe(fieldsAtom, (fields) => seen.push(fields), {
    immediate: true,
  });
  expect(seen).toHaveLength(1);

  // A provider status push replaces the config but keeps what markdown reads.
  registry.set(configAtom, { ...first, providers: [{} as ServerConfig["providers"][number]] });
  expect(seen).toHaveLength(1);

  registry.set(configAtom, config({ availableEditors: [] }));
  expect(seen).toHaveLength(2);
  expect(seen[1]).toMatchObject({ availableEditors: [], pullRequestsEnabled: true });
  unmount();
});
