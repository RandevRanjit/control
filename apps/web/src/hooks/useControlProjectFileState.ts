import {
  CONTROL_PROJECT_FILE_NAME,
  LEGACY_PROJECT_FILE_NAME,
  type EnvironmentId,
  type ControlProjectFile,
  type ControlProjectFileScript,
} from "@control/contracts";
import { parseControlProjectFile } from "@control/shared/controlProjectFile";
import { useMemo } from "react";

import { useProjectFileQuery } from "~/components/files/projectFilesQueryState";

const NO_SCRIPTS: ReadonlyArray<ControlProjectFileScript> = [];

export interface ControlProjectFileState {
  /**
   * - `valid`: control.json exists and decoded.
   * - `invalid`: control.json exists but fails to decode (the server then ignores
   *   the whole file, including `iconPath` and every script).
   * - `legacy`: no control.json, but a t3.json from before the rename, which Control ignores
   *   until it is renamed.
   * - `missing`: neither file at the workspace root.
   * - `loading`: the file query has not settled yet.
   */
  status: "loading" | "missing" | "legacy" | "invalid" | "valid";
  /** The decoded file when status is `valid`, null otherwise. */
  file: ControlProjectFile | null;
  scripts: ReadonlyArray<ControlProjectFileScript>;
}

/**
 * Decoded state of the project's checked-in `control.json`, including whether the
 * file exists but is broken — which the runtime otherwise swallows silently.
 */
export function useControlProjectFileState(
  environmentId: EnvironmentId,
  cwd: string | null,
): ControlProjectFileState {
  const query = useProjectFileQuery(
    environmentId,
    cwd ?? "",
    CONTROL_PROJECT_FILE_NAME,
    cwd !== null,
  );
  const contents = query.data && !query.data.truncated ? query.data.contents : null;
  const isPending = query.isPending;
  // Read only once control.json turns out missing.
  const legacy =
    useProjectFileQuery(
      environmentId,
      cwd ?? "",
      LEGACY_PROJECT_FILE_NAME,
      cwd !== null && !isPending && query.data === null,
    ).data !== null;
  return useMemo(() => {
    if (contents === null) {
      return {
        status: isPending ? "loading" : legacy ? "legacy" : "missing",
        file: null,
        scripts: NO_SCRIPTS,
      } as const;
    }
    const file = parseControlProjectFile(contents);
    if (file === null) {
      return { status: "invalid", file: null, scripts: NO_SCRIPTS } as const;
    }
    return { status: "valid", file, scripts: file.scripts ?? NO_SCRIPTS } as const;
  }, [contents, isPending, legacy]);
}
