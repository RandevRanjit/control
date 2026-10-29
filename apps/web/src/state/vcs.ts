import {
  createVcsActionManager,
  createVcsEnvironmentAtoms,
} from "@control/client-runtime/state/vcs";
import type { EnvironmentId, VcsStatusResult } from "@control/contracts";
import { AsyncResult } from "effect/reactivity";

import { connectionAtomRuntime } from "../connection/runtime";
import { appAtomRegistry } from "../rpc/atomRegistry";

export const vcsEnvironment = createVcsEnvironmentAtoms(connectionAtomRuntime);
export const vcsActionManager = createVcsActionManager(connectionAtomRuntime);

/**
 * A checkout's freshly read local status (no fetch, no auto-pull), or null when
 * it fails or takes over a few seconds. The thread delete dialog reads it.
 */
export function readLocalVcsStatus(
  environmentId: EnvironmentId,
  cwd: string,
): Promise<VcsStatusResult | null> {
  const atom = vcsEnvironment.status({
    environmentId,
    input: { cwd, includeRemote: false, refreshLocal: true },
  });
  const unmount = appAtomRegistry.mount(atom);
  // A subscription kept alive by an earlier read holds an old value: restart it
  // and wait for the value its fresh read delivers.
  const held = appAtomRegistry.get(atom);
  const stale = AsyncResult.isSuccess(held) ? held.value : undefined;
  if (!AsyncResult.isInitial(held)) appAtomRegistry.refresh(atom);
  let unsubscribe = () => {};
  return new Promise<VcsStatusResult | null>((resolve) => {
    setTimeout(() => resolve(null), 6_000);
    unsubscribe = appAtomRegistry.subscribe(
      atom,
      (result) => {
        if (AsyncResult.isFailure(result)) resolve(null);
        else if (AsyncResult.isSuccess(result) && result.value !== stale) resolve(result.value);
      },
      { immediate: true },
    );
  }).finally(() => {
    unsubscribe();
    unmount();
  });
}
