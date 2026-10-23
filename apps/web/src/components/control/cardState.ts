import type { GroupTint, ModelSelection } from "@control/contracts";

import type { SidebarThreadStatus } from "../Sidebar.logic";

/** Design v1 card states (§6.1): `data-st` on the card and its bar. */
export type CardState = "needs" | "working" | "bg" | "failed" | "done" | "idle" | "intr";

export interface CardStateView {
  readonly st: CardState;
  /** The lamp's state class: working wears the background lamp (§6.1). */
  readonly lamp: CardState;
  /** Line 3's state words. */
  readonly words: string;
}

export function resolveCardState(input: {
  readonly status: SidebarThreadStatus;
  readonly isUnread: boolean;
  readonly hasBackgroundWork: boolean;
  readonly latestRunStatus: string | null;
}): CardStateView {
  switch (input.status) {
    case "approval":
    case "input":
      return { st: "needs", lamp: "needs", words: "needs you" };
    case "working":
      return { st: "working", lamp: "bg", words: "working" };
    case "failed":
      return { st: "failed", lamp: "failed", words: "failed" };
    case "limited":
      return { st: "failed", lamp: "failed", words: "limited" };
  }
  if (input.hasBackgroundWork) return { st: "bg", lamp: "bg", words: "background" };
  if (input.latestRunStatus === "interrupted") {
    return { st: "intr", lamp: "intr", words: "interrupted" };
  }
  if (input.isUnread) return { st: "done", lamp: "done", words: "done" };
  return { st: "idle", lamp: "idle", words: "idle" };
}

const EFFORT_LEVELS: Readonly<Record<string, number>> = {
  low: 1,
  medium: 2,
  high: 3,
  xhigh: 4,
  max: 5,
};

/** The effort meter's lit bars, 1 (low) to 5 (max); null when the model has no effort. */
export function effortLevel(selection: ModelSelection): number | null {
  const value = selection.options?.find((option) => option.id === "effort")?.value;
  return typeof value === "string" ? (EFFORT_LEVELS[value] ?? null) : null;
}

const TINTS: ReadonlyArray<GroupTint> = ["mint", "rose", "peri", "butter", "sage", "lilac"];

/** A project without a stored tint takes a stable one from its id. */
export function projectTint(projectId: string): GroupTint {
  let hash = 0;
  for (const char of projectId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TINTS[hash % TINTS.length]!;
}

/** Two-letter project mark: the first two letters or digits of its name. */
export function projectMonogram(name: string): string {
  return (name.match(/[\p{L}\p{N}]/gu) ?? []).slice(0, 2).join("").toUpperCase();
}
