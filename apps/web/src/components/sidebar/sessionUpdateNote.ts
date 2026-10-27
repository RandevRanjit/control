import type { ServerProviderSessionUpdates } from "@control/contracts";

/**
 * "out": a newer CLI is installed and chats can update now (design v1 §3.3).
 * "waiting": nothing to press, so the note only reports the wait: an install is under way (from
 * either prompt, Settings or another client) or every outdated chat is queued.
 */
export type SessionUpdateNoteView =
  | { readonly kind: "out"; readonly version: string | null }
  | { readonly kind: "waiting"; readonly text: string };

const chats = (count: number) => (count === 1 ? "1 thread" : `${count} threads`);

/** CONTROL's Claude update note (HANDOFF-v2 §4): null when every session runs the installed CLI. */
export function sessionUpdateNoteView(
  updates: ServerProviderSessionUpdates | null,
  installing: boolean,
): SessionUpdateNoteView | null {
  if (updates === null || updates.outdated + updates.waiting === 0) return null;
  if (installing) return { kind: "waiting", text: "Updating Claude…" };
  if (updates.outdated > 0) return { kind: "out", version: updates.installedVersion };
  return { kind: "waiting", text: `${chats(updates.waiting)} update when idle` };
}
