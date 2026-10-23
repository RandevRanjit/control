import { assert, it } from "@effect/vitest";
import {
  type LocalModel,
  LocalModelId,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
} from "@control/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as PubSub from "effect/PubSub";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";

import { withLocalChatModels } from "./localChatModels.ts";
import type { ServerProviderShape } from "./ServerProvider.ts";

const claude: ServerProvider = {
  instanceId: ProviderInstanceId.make("claudeAgent"),
  driver: ProviderDriverKind.make("claudeAgent"),
  enabled: true,
  installed: true,
  version: "2.1.300",
  status: "ready",
  auth: { status: "authenticated" },
  checkedAt: "2026-10-18T00:00:00.000Z",
  models: [
    { slug: "claude-opus-5-5", name: "Claude Opus 5.5", isCustom: false, capabilities: null },
  ],
  slashCommands: [],
  skills: [],
};

const qwen: LocalModel = {
  id: LocalModelId.make("qwen-27b"),
  name: "Qwen 27B",
  file: "/models/qwen-27b.gguf",
  args: ["llama-server"],
  systemPrompt: "",
  idleMinutes: 10,
  chat: true,
};

const slugs = (provider: ServerProvider) => provider.models.map((model) => model.slug);

it.effect("Claude's model list ends with the local models offered in chats, as they change", () =>
  Effect.gen(function* () {
    const current = yield* Ref.make(claude);
    // Replays the last probe, so a reader that subscribes after it still sees it.
    const probes = yield* PubSub.unbounded<ServerProvider>({ replay: 1 });
    const managed: ServerProviderShape = {
      resolveMaintenance: () => Effect.die("unused"),
      getSnapshot: Ref.get(current),
      refresh: Ref.get(current),
      applyUsageLimits: () => Effect.void,
      streamChanges: Stream.fromPubSub(probes),
    };
    const offered = yield* SubscriptionRef.make<ReadonlyArray<LocalModel>>([qwen]);
    const snapshot = yield* withLocalChatModels(managed, SubscriptionRef.changes(offered));
    /** The first published snapshot whose slugs match, on the wrapper's own stream. */
    const published = (expected: ReadonlyArray<string>) =>
      snapshot.streamChanges.pipe(
        Stream.filter((provider) => slugs(provider).join() === expected.join()),
        Stream.runHead,
        Effect.map(Option.getOrThrow),
      );

    const first = yield* published(["claude-opus-5-5", "local:qwen-27b"]);
    assert.deepInclude(first.models[1], { name: "Qwen 27B", isLocal: true, isCustom: true });
    assert.deepStrictEqual(slugs(yield* snapshot.getSnapshot), slugs(first));

    // Turning the model off republishes Claude without it.
    yield* SubscriptionRef.set(offered, []);
    yield* published(["claude-opus-5-5"]);

    // A probe's snapshot keeps the local row, once.
    yield* SubscriptionRef.set(offered, [qwen]);
    yield* published(["claude-opus-5-5", "local:qwen-27b"]);
    yield* PubSub.publish(probes, { ...first, checkedAt: "probe" });
    const probed = yield* snapshot.streamChanges.pipe(
      Stream.filter((provider) => provider.checkedAt === "probe"),
      Stream.runHead,
      Effect.map(Option.getOrThrow),
    );
    assert.deepStrictEqual(slugs(probed), ["claude-opus-5-5", "local:qwen-27b"]);
  }).pipe(Effect.scoped),
);
