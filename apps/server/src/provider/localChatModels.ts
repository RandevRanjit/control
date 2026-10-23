import {
  type LocalModel,
  localModelSlug,
  type ServerProvider,
  type ServerProviderModel,
} from "@control/contracts";
import * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";

import type { ServerProviderShape } from "./ServerProvider.ts";

/** A local model the owner offered in chats, as a row in Claude's model list. */
const localChatModel = (model: LocalModel): ServerProviderModel => ({
  slug: localModelSlug(model.id),
  name: model.name,
  isCustom: true,
  isLocal: true,
  capabilities: null,
});

/**
 * Claude's snapshot with the local models offered in chats after its own, republished whenever
 * that list changes. A chat on one runs Claude Code against the model (see ClaudeAdapterV2).
 */
export const withLocalChatModels = (
  snapshot: ServerProviderShape,
  chatModels: Stream.Stream<ReadonlyArray<LocalModel>>,
): Effect.Effect<ServerProviderShape, never, Scope.Scope> =>
  Effect.gen(function* () {
    const local = yield* SubscriptionRef.make<ReadonlyArray<ServerProviderModel>>([]);
    yield* chatModels.pipe(
      Stream.runForEach((models) => SubscriptionRef.set(local, models.map(localChatModel))),
      Effect.forkScoped,
    );
    const add = (provider: ServerProvider) =>
      Effect.map(SubscriptionRef.get(local), (models) => ({
        ...provider,
        models: [...provider.models.filter((model) => model.isLocal !== true), ...models],
      }));
    return {
      ...snapshot,
      getSnapshot: Effect.flatMap(snapshot.getSnapshot, add),
      refresh: Effect.flatMap(snapshot.refresh, add),
      streamChanges: Stream.merge(
        snapshot.streamChanges.pipe(Stream.mapEffect(add)),
        SubscriptionRef.changes(local).pipe(
          Stream.mapEffect(() => Effect.flatMap(snapshot.getSnapshot, add)),
        ),
      ),
    };
  });
