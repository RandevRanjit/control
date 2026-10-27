import type {
  OrchestrationV2LooseEnd,
  OrchestrationV2LooseEndAction,
  OrchestrationV2Run,
} from "@control/contracts";
import * as DateTime from "effect/DateTime";

type Run = Pick<OrchestrationV2Run, "id" | "ordinal" | "startedAt">;

const ms = (at: DateTime.Utc) => DateTime.toEpochMillis(at);
const closedMs = (item: OrchestrationV2LooseEnd) => ms(item.closedAt ?? item.updatedAt);

/** Open items in the order they were filed; closed ones newest first (HANDOFF §17.2). */
export function splitLooseEnds(items: ReadonlyArray<OrchestrationV2LooseEnd>) {
  return {
    open: items
      .filter((item) => item.status === "open")
      .sort((left, right) => ms(left.createdAt) - ms(right.createdAt)),
    closed: items
      .filter((item) => item.status !== "open")
      .sort((left, right) => closedMs(right) - closedMs(left)),
  };
}

/** `now` in the first minute, the clock the same day, the date before. */
export function whenLabel(atMs: number, nowMs: number): string {
  if (nowMs - atMs < 60_000) return "now";
  const at = DateTime.toDate(DateTime.makeUnsafe(atMs));
  if (at.toDateString() !== DateTime.toDate(DateTime.makeUnsafe(nowMs)).toDateString())
    return at.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return [at.getHours(), at.getMinutes()].map((n) => String(n).padStart(2, "0")).join(":");
}

/** The turn an item was filed in and when: `T12 · 23:20`. */
export function filedLabel(item: OrchestrationV2LooseEnd, runs: ReadonlyArray<Run>, nowMs: number) {
  const run = runs.find((candidate) => candidate.id === item.runId);
  const when = whenLabel(ms(item.createdAt), nowMs);
  return run === undefined ? when : `T${run.ordinal} · ${when}`;
}

/** How an item closed: `Done by you · 21:40`, `Dismissed by you · …`, `Closed by the agent · T13`. */
export function closedLabel(
  item: OrchestrationV2LooseEnd,
  runs: ReadonlyArray<Run>,
  nowMs: number,
) {
  const at = closedMs(item);
  if (item.closedBy === "agent") {
    // The turn the agent closed it in: the latest to start before it closed.
    const run = runs
      .filter((candidate) => candidate.startedAt !== null && ms(candidate.startedAt) <= at)
      .sort((left, right) => right.ordinal - left.ordinal)[0];
    return `Closed by the agent · ${run === undefined ? whenLabel(at, nowMs) : `T${run.ordinal}`}`;
  }
  return `${item.status === "dismissed" ? "Dismissed" : "Done"} by you · ${whenLabel(at, nowMs)}`;
}

/** A file can be revealed only on the machine it's on; elsewhere its path is copied (§17.5). */
export function actionLabel(action: OrchestrationV2LooseEndAction, canReveal: boolean) {
  if (action.kind === "link") return "Open";
  return action.kind === "file" && canReveal ? "Reveal" : "Copy";
}
