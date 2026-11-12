import type { ServerProvider, ServerProviderSessionUpdates } from "@control/contracts";

import {
  canOneClickUpdateProviderCandidate,
  isProviderUpdateCandidate,
} from "../ProviderUpdateLaunchNotification.logic";

/**
 * "out": a newer Claude is on offer, or installed with chats still on an older one; Update does
 * both (design v1 §3.3). `failure` is why the last install of the offered version failed.
 * "waiting": nothing to press, so the note only reports the wait: an install is under way (from
 * the note, Settings or another client) or every outdated chat is queued.
 */
export type SessionUpdateNoteView =
  | { readonly kind: "out"; readonly version: string | null; readonly failure: string | null }
  | { readonly kind: "waiting"; readonly text: string };

/** A newer Claude its installer fetches in one go (the server's `installOnOffer`). */
export type ClaudeUpdateOffer = { readonly version: string; readonly failure: string | null };

/** The newer Claude the note's Update would install, if any. */
export function claudeUpdateOffer(
  providers: ReadonlyArray<ServerProvider>,
): ClaudeUpdateOffer | null {
  const provider = providers
    .filter(isProviderUpdateCandidate)
    .find((candidate) => canOneClickUpdateProviderCandidate(candidate, providers));
  if (provider === undefined) return null;
  const failed = provider.updateState?.status === "failed";
  return {
    version: provider.versionAdvisory.latestVersion,
    failure: failed ? (provider.updateState?.message ?? "The install failed.") : null,
  };
}

const chats = (count: number) => (count === 1 ? "1 thread" : `${count} threads`);

/** CONTROL's one Claude update notice (HANDOFF-v2 §4): null when there is nothing to update. */
export function sessionUpdateNoteView(
  updates: ServerProviderSessionUpdates | null,
  installing: boolean,
  offer: ClaudeUpdateOffer | null,
): SessionUpdateNoteView | null {
  if (installing) return { kind: "waiting", text: "Updating Claude…" };
  if (offer !== null) return { kind: "out", version: offer.version, failure: offer.failure };
  if (updates === null || updates.outdated + updates.waiting === 0) return null;
  if (updates.outdated > 0)
    return { kind: "out", version: updates.installedVersion, failure: null };
  return { kind: "waiting", text: `${chats(updates.waiting)} update when idle` };
}
