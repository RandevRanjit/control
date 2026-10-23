import { WS_METHODS } from "@control/contracts";
import type { Atom } from "effect/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "./runtime.ts";

/** CONTROL's full lock (design/hybrid/HANDOFF.md §16) for one environment. */
export function createLockEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  return {
    /** The running lock, pushed by the server; `until` is null when none runs. */
    state: createEnvironmentRpcSubscriptionAtomFamily(runtime, {
      label: "environment-data:lock:state",
      tag: WS_METHODS.subscribeLock,
    }),
    /** Locks everything until a time, or extends the running lock. */
    set: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:lock:set",
      tag: WS_METHODS.lockSet,
    }),
  };
}
