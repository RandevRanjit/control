import { createLocalModelsEnvironmentAtoms } from "@control/client-runtime/state/localModels";
import type { EnvironmentId } from "@control/contracts";
import { useAtomValue } from "@effect/atom-react";
import { useEffect, useState } from "react";

import { connectionAtomRuntime } from "../connection/runtime";
import { environmentPresentations } from "./presentation";
import { useEnvironmentQuery } from "./query";

export const localModelsEnvironment = createLocalModelsEnvironmentAtoms(connectionAtomRuntime);

/** One environment's models; null until the first push, or from a server without them. */
export function useLocalModels(environmentId: EnvironmentId) {
  return useEnvironmentQuery(localModelsEnvironment.state({ environmentId, input: {} })).data;
}

/** The connected environments: each runs its own models, on its own Mac. */
export function useConnectedEnvironmentIds(): ReadonlyArray<EnvironmentId> {
  const presentations = useAtomValue(environmentPresentations.presentationsAtom);
  return [...presentations]
    .filter(([, presentation]) => presentation.connection.phase === "connected")
    .map(([environmentId]) => environmentId);
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
