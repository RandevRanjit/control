/**
 * CONTROL's Claude update (HANDOFF-v2 §4), behind both of its prompts: the update note on the sidebar
 * and menu bar, and the provider update toast. Either Update does the whole job, so neither prompt
 * needs pressing again after the other.
 */
import type { ServerProvider, ServerProviderSessionUpdates } from "@control/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as ProviderSessionManager from "../orchestration-v2/ProviderSessionManager.ts";
import * as ProviderMaintenanceRunner from "./providerMaintenanceRunner.ts";
import * as ProviderRegistry from "./ProviderRegistry.ts";

/** A newer CLI its installer fetches in one go, as the toast offers it, with no update already under way. */
const installOnOffer = (provider: ServerProvider) =>
  provider.enabled &&
  provider.versionAdvisory?.status === "behind_latest" &&
  provider.versionAdvisory.canUpdate &&
  provider.versionAdvisory.updateCommand !== null &&
  provider.compatibilityAdvisory?.latestVersionStatus !== "broken" &&
  provider.compatibilityAdvisory?.latestVersionStatus !== "unsupported" &&
  provider.updateState?.status !== "queued" &&
  provider.updateState?.status !== "running";

export class ProviderSessionUpdates extends Context.Service<
  ProviderSessionUpdates,
  {
    /** Live sessions on an older binary than the installed one: the note's counts. */
    readonly read: Effect.Effect<ServerProviderSessionUpdates>;
    /**
     * The note's Update: installs a newer CLI first when one is on offer, then releases idle chats
     * onto the installed binary and queues working ones. A failed install still moves them onto what
     * is installed; the provider's update state reports the failure.
     */
    readonly update: Effect.Effect<ServerProviderSessionUpdates>;
    /** An install from the toast or Settings: once it succeeds, idle chats move onto the new binary. */
    readonly updateProvider: ProviderMaintenanceRunner.ProviderMaintenanceRunner["Service"]["updateProvider"];
  }
>()("@control/server/provider/ProviderSessionUpdates") {}

const make = Effect.gen(function* () {
  const providerRegistry = yield* ProviderRegistry.ProviderRegistry;
  const providerSessions = yield* ProviderSessionManager.ProviderSessionManagerV2;
  const providerMaintenanceRunner = yield* ProviderMaintenanceRunner.ProviderMaintenanceRunner;

  const sessionUpdates = (apply: boolean) =>
    Effect.gen(function* () {
      let installedVersion: string | null = null;
      let runningVersion: string | null = null;
      let outdated = 0;
      let waiting = 0;
      for (const provider of yield* providerRegistry.getProviders) {
        if (provider.version === null) continue;
        const counts = yield* providerSessions.updateOutdated({
          instanceId: provider.instanceId,
          installedVersion: provider.version,
          apply,
        });
        if (counts.outdated + counts.waiting === 0) continue;
        installedVersion = provider.version;
        runningVersion = counts.runningVersion;
        outdated += counts.outdated;
        waiting += counts.waiting;
      }
      return { installedVersion, runningVersion, outdated, waiting };
    });

  const updateProvider: ProviderSessionUpdates["Service"]["updateProvider"] = (target) => {
    const driver = typeof target === "string" ? target : target.provider;
    return providerMaintenanceRunner
      .updateProvider(target)
      .pipe(
        Effect.tap(({ providers }) =>
          providers.some(
            (provider) =>
              provider.driver === driver && provider.updateState?.status === "succeeded",
          )
            ? sessionUpdates(true)
            : Effect.void,
        ),
      );
  };

  const update = Effect.gen(function* () {
    for (const provider of yield* providerRegistry.getProviders) {
      if (!installOnOffer(provider)) continue;
      yield* updateProvider({ provider: provider.driver, instanceId: provider.instanceId }).pipe(
        Effect.ignore,
      );
    }
    return yield* sessionUpdates(true);
  });

  return ProviderSessionUpdates.of({ read: sessionUpdates(false), update, updateProvider });
});

export const layer = Layer.effect(ProviderSessionUpdates, make);
