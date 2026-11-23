import { createVoiceEnvironmentAtoms } from "@control/client-runtime/state/voice";

import { connectionAtomRuntime } from "../connection/runtime";
import { usePrimaryEnvironmentId } from "./environments";
import { useEnvironmentQuery } from "./query";

export const voiceEnvironment = createVoiceEnvironmentAtoms(connectionAtomRuntime);

/**
 * Dictation's model on the Mac the primary environment runs on, which writes down what this client
 * hears whichever environment the chat is in. Null until it arrives, and for good from a server
 * too old to have one.
 */
export function useVoiceModel() {
  const environmentId = usePrimaryEnvironmentId();
  const query = useEnvironmentQuery(
    environmentId === null ? null : voiceEnvironment.model({ environmentId, input: {} }),
  );
  return { environmentId, model: query.data ?? null };
}
