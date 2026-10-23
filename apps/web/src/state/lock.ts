import { createLockEnvironmentAtoms } from "@control/client-runtime/state/lock";
import { useEffect, useState } from "react";

import { connectionAtomRuntime } from "../connection/runtime";
import { usePrimaryEnvironmentId } from "./environments";
import { useEnvironmentQuery } from "./query";

export const lockEnvironment = createLockEnvironmentAtoms(connectionAtomRuntime);

/** When the primary environment's full lock ends, or null; it turns null on its own at that time. */
export function useFullLockUntil(): string | null {
  const environmentId = usePrimaryEnvironmentId();
  const query = useEnvironmentQuery(
    environmentId === null ? null : lockEnvironment.state({ environmentId, input: {} }),
  );
  const until = query.data?.until ?? null;
  // The server pushes no change when a lock runs out, so the client ends it on time.
  const [ended, setEnded] = useState<string | null>(null);
  useEffect(() => {
    if (until === null) return;
    const timer = setTimeout(() => setEnded(until), Date.parse(until) - Date.now());
    return () => clearTimeout(timer);
  }, [until]);
  return until === ended ? null : until;
}
