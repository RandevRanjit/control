import { createLocalModelsEnvironmentAtoms } from "@control/client-runtime/state/localModels";
import { useEffect, useState } from "react";

import { connectionAtomRuntime } from "../connection/runtime";
import { usePrimaryEnvironmentId } from "./environments";
import { useEnvironmentQuery } from "./query";

export const localModelsEnvironment = createLocalModelsEnvironmentAtoms(connectionAtomRuntime);

/** The models on the Mac the primary environment runs on; the snapshot is null until it arrives. */
export function useLocalModels() {
  const environmentId = usePrimaryEnvironmentId();
  const query = useEnvironmentQuery(
    environmentId === null ? null : localModelsEnvironment.state({ environmentId, input: {} }),
  );
  return { environmentId, snapshot: query.data ?? null };
}

/** Now, redrawn every second while `active`: a waking model counts up. */
export function useSecondTick(active: boolean): number {
  const [nowMs, setNowMs] = useState(Date.now);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return nowMs;
}
