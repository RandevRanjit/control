import type { EditorId, ServerConfig } from "@control/contracts";
import { Atom } from "effect/reactivity";

import {
  revealInFileExplorerLabelForKind,
  revealInFileExplorerLabelForOs,
} from "./preview/fileExplorerLabel";

const NO_MARKDOWN_EDITORS: ReadonlyArray<EditorId> = [];

/** The server config fields markdown reads. */
function markdownServerConfigFields(config: ServerConfig | null) {
  return {
    pullRequestsEnabled: config?.environment.capabilities.pullRequests === true,
    availableEditors: config?.availableEditors ?? NO_MARKDOWN_EDITORS,
    revealInFileManagerLabel:
      config?.shellRevealInFileManager === true && config.availableEditors.includes("file-manager")
        ? config.shellRevealInFileManagerKind === undefined
          ? revealInFileExplorerLabelForOs(config.environment.platform.os)
          : revealInFileExplorerLabelForKind(config.shellRevealInFileManagerKind)
        : undefined,
  };
}

/**
 * The config fields markdown reads, for one environment's config atom. The config itself
 * changes with every provider status push; this keeps its value, so mounted replies are
 * not told about the push at all.
 */
export const markdownServerConfigFieldsAtom = Atom.family(
  (configAtom: Atom.Atom<ServerConfig | null>) => {
    let previous: ReturnType<typeof markdownServerConfigFields> | null = null;
    return Atom.make((get) => {
      const next = markdownServerConfigFields(get(configAtom));
      if (
        previous?.pullRequestsEnabled !== next.pullRequestsEnabled ||
        previous.availableEditors !== next.availableEditors ||
        previous.revealInFileManagerLabel !== next.revealInFileManagerLabel
      ) {
        previous = next;
      }
      return previous;
    });
  },
);
