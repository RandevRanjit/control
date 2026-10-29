import {
  createVcsActionManager,
  createVcsEnvironmentAtoms,
} from "@control/client-runtime/state/vcs";
import type { EnvironmentId } from "@control/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { AtomRegistry } from "effect/reactivity";

import { connectionAtomRuntime } from "../connection/runtime";
import { appAtomRegistry } from "../rpc/atomRegistry";

export const vcsEnvironment = createVcsEnvironmentAtoms(connectionAtomRuntime);
export const vcsActionManager = createVcsActionManager(connectionAtomRuntime);

/**
 * A checkout's first local status (no fetch, no auto-pull), or null when it
 * fails or takes over a few seconds. The thread delete dialog reads it.
 */
export function readLocalVcsStatus(environmentId: EnvironmentId, cwd: string) {
  const atom = vcsEnvironment.status({ environmentId, input: { cwd, includeRemote: false } });
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        yield* AtomRegistry.mount(appAtomRegistry, atom);
        // The status stays "waiting" while subscribed, so take the first value.
        return yield* AtomRegistry.getResult(appAtomRegistry, atom, { suspendOnWaiting: false });
      }),
    ).pipe(
      Effect.timeoutOption(6_000),
      Effect.map(Option.getOrNull),
      Effect.orElseSucceed(() => null),
    ),
  );
}
