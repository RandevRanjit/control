import { AuthOrchestrationOperateScope, EnvironmentHttpApi } from "@control/contracts";
import * as Effect from "effect/Effect";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";

import { annotateEnvironmentRequest, requireEnvironmentScope } from "../auth/http.ts";
import * as VoiceInput from "./VoiceInput.ts";

/** Dictation's recordings. */
export const layer = HttpApiBuilder.group(
  EnvironmentHttpApi,
  "voice",
  Effect.fnUntraced(function* (handlers) {
    const voice = yield* VoiceInput.VoiceInput;
    return handlers.handle(
      "transcribe",
      Effect.fn("environment.voice.transcribe")(function* (args) {
        yield* annotateEnvironmentRequest(args.endpoint.name);
        yield* requireEnvironmentScope(AuthOrchestrationOperateScope);
        return yield* voice.transcribe(args.payload);
      }),
    );
  }),
);
