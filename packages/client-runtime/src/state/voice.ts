import { type VoiceTranscribeInput, WS_METHODS } from "@control/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as SubscriptionRef from "effect/SubscriptionRef";
import type { HttpClient } from "effect/http";
import type { Atom } from "effect/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import * as EnvironmentSupervisor from "../connection/supervisor.ts";
import { makeEnvironmentHttpApiUrlBuilder } from "../rpc/http.ts";
import { executeAuthenticatedEnvironmentHttpRequest } from "./environmentHttpAuth.ts";
import { EnvironmentHttpConnectionNotReadyError } from "./pullRequests.ts";
import {
  createEnvironmentCommand,
  createEnvironmentRpcCommand,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "./runtime.ts";

/** Longer than the server takes for five minutes of speech, or gives up on one. */
const TRANSCRIBE_TIMEOUT_MS = 130_000;

/** Dictation for one environment: its machine's model, and turning a recording into text there. */
export function createVoiceEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | HttpClient.HttpClient | R, E>,
) {
  return {
    /** Whether the model is there, pushed as it downloads. */
    model: createEnvironmentRpcSubscriptionAtomFamily(runtime, {
      label: "environment-data:voice:model",
      tag: WS_METHODS.subscribeVoiceModel,
    }),
    install: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:voice:install",
      tag: WS_METHODS.voiceModelInstall,
    }),
    /** Stops a running download, or deletes the model. */
    remove: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:voice:remove",
      tag: WS_METHODS.voiceModelRemove,
    }),
    transcribe: createEnvironmentCommand(runtime, {
      label: "environment-data:voice:transcribe",
      execute: Effect.fn("clientRuntime.state.voice.transcribe")(function* (
        input: VoiceTranscribeInput,
      ) {
        const supervisor = yield* EnvironmentSupervisor.EnvironmentSupervisor;
        const prepared = yield* SubscriptionRef.get(supervisor.prepared);
        if (Option.isNone(prepared)) {
          return yield* new EnvironmentHttpConnectionNotReadyError({
            message: "The environment HTTP connection is not ready.",
          });
        }
        return yield* executeAuthenticatedEnvironmentHttpRequest({
          prepared: prepared.value,
          group: "voice",
          url: (httpBaseUrl) => makeEnvironmentHttpApiUrlBuilder(httpBaseUrl).voice.transcribe(),
          timeoutMs: TRANSCRIBE_TIMEOUT_MS,
          request: ({ client, headers }) => client.transcribe({ payload: input, headers }),
        });
      }),
    }),
  };
}
