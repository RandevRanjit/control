import {
  formatGb,
  type LocalModelError,
  OrchestratorMcpFailure,
  type ThreadId,
} from "@control/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as LocalModels from "../../../localModels/LocalModels.ts";
import * as ProjectionStore from "../../../orchestration-v2/ProjectionStore.ts";
import * as ProviderSessionManager from "../../../orchestration-v2/ProviderSessionManager.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import { LocalModelsToolkit } from "./tools.ts";

/** A refusal's message is its numbers, which the failed tool row shows as its meta (§18.4). */
const refused = (error: LocalModelError) =>
  new OrchestratorMcpFailure({ code: "model_unavailable", message: error.message });

/**
 * A wake over 40 GB asks the owner in the calling chat, as a permission request does (M4):
 * the chat needs him until he answers, and only his Approve wakes the model. A caller with no
 * live turn to ask in, such as an outside MCP client, gets the refusal instead.
 */
const askInChat =
  (input: {
    readonly threadId: ThreadId;
    readonly toolName: string;
    readonly projections: ProjectionStore.ProjectionStoreV2["Service"];
    readonly sessions: ProviderSessionManager.ProviderSessionManagerV2["Service"];
  }): LocalModels.AskOwner =>
  ({ model, needBytes, freeAfterBytes }) =>
    Effect.gen(function* () {
      const { providerThread } = yield* input.projections.getRunningTurnContext(input.threadId);
      const session =
        providerThread?.providerSessionId == null
          ? Option.none()
          : yield* input.sessions.get(providerThread.providerSessionId);
      if (providerThread === undefined || Option.isNone(session) || !session.value.askOwner) {
        return false;
      }
      return yield* session.value.askOwner({
        providerThread,
        toolName: `mcp__control__${input.toolName}`,
        title: "Wake a local model · over 40 GB",
        detail: `${model.name} takes ${formatGb(needBytes)} and leaves ${formatGb(freeAfterBytes)} free.`,
      });
    }).pipe(Effect.orElseSucceed(() => false));

const askFor = (toolName: string) =>
  Effect.gen(function* () {
    const scope = yield* McpInvocationContext.McpInvocationContext;
    if (scope.thread === undefined) return undefined;
    return askInChat({
      threadId: scope.thread.threadId,
      toolName,
      projections: yield* ProjectionStore.ProjectionStoreV2,
      sessions: yield* ProviderSessionManager.ProviderSessionManagerV2,
    });
  });

export const layer = McpToolAccess.toLayer(LocalModelsToolkit, {
  local_model_list: McpToolAccess.reads(() =>
    Effect.gen(function* () {
      const snapshot = yield* (yield* LocalModels.LocalModels).list;
      return {
        models: snapshot.models.map((model) => {
          const runtime = snapshot.runtimes.find((item) => item.modelId === model.id);
          return {
            id: model.id,
            name: model.name,
            state: runtime?.state ?? "asleep",
            ...(runtime?.needBytes === undefined ? {} : { needs: formatGb(runtime.needBytes) }),
            readsImages: model.projector !== undefined,
            calls: runtime?.calls ?? 0,
          };
        }),
        memory: {
          available: formatGb(snapshot.memory.availableBytes),
          keptBack: formatGb(snapshot.memory.keepBytes),
          swap: formatGb(snapshot.memory.swapUsedBytes),
        },
      };
    }),
  ),
  local_model_wake: McpToolAccess.writes(({ model }) =>
    Effect.gen(function* () {
      const ask = yield* askFor("local_model_wake");
      yield* (yield* LocalModels.LocalModels)
        .wake(model, ask === undefined ? {} : { ask })
        .pipe(Effect.mapError(refused));
      return { model, state: "ready" as const };
    }),
  ),
  local_model_sleep: McpToolAccess.writes(({ model }) =>
    Effect.gen(function* () {
      yield* (yield* LocalModels.LocalModels).sleep(model).pipe(Effect.mapError(refused));
      return { model, state: "asleep" as const };
    }),
  ),
  local_model_run: McpToolAccess.writes((input) =>
    Effect.gen(function* () {
      const ask = yield* askFor("local_model_run");
      const result = yield* (yield* LocalModels.LocalModels)
        .run(input, ask === undefined ? {} : { ask })
        .pipe(Effect.mapError(refused));
      return {
        model: result.model,
        answer: result.answer,
        files: result.fileCount,
        seconds: Math.round(result.ms / 100) / 10,
        ...(result.outTokens === undefined ? {} : { tokensOut: result.outTokens }),
      };
    }),
  ),
});
