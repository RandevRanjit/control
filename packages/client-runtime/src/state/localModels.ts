import { WS_METHODS } from "@control/contracts";
import type { Atom } from "effect/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "./runtime.ts";

/** Local models (design/hybrid/HANDOFF.md §18) for one environment. */
export function createLocalModelsEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  return {
    /** Every model, what each is doing, and the memory, pushed by the server. */
    state: createEnvironmentRpcSubscriptionAtomFamily(runtime, {
      label: "environment-data:local-models:state",
      tag: WS_METHODS.subscribeLocalModels,
    }),
    wake: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:local-models:wake",
      tag: WS_METHODS.localModelsWake,
    }),
    sleep: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:local-models:sleep",
      tag: WS_METHODS.localModelsSleep,
    }),
    /** The GGUFs Add offers. */
    scan: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:local-models:scan",
      tag: WS_METHODS.localModelsScan,
    }),
    // Adding, editing and removing are the desktop's (CLIENT_GUARDED_RPC_SCOPES).
    register: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:local-models:register",
      tag: WS_METHODS.localModelsRegister,
    }),
    update: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:local-models:update",
      tag: WS_METHODS.localModelsUpdate,
    }),
    remove: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:local-models:remove",
      tag: WS_METHODS.localModelsRemove,
    }),
  };
}
