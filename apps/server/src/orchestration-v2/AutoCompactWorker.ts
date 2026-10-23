import {
  CLAUDE_PROMPT_CACHE_MINUTES,
  CommandId,
  MessageId,
  type OrchestrationV2Command,
} from "@control/contracts";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Scheduler from "../scheduling/Scheduler.ts";
import * as ServerSettings from "../serverSettings.ts";
import { AUTO_COMPACT_ID_PREFIX } from "./CommandPolicy.ts";
import * as ProjectionStore from "./ProjectionStore.ts";
import * as ThreadManagement from "./ThreadManagementService.ts";

/**
 * CONTROL's auto-compact (HANDOFF-v2 §4.1): a big chat left idle runs the
 * native /compact maintenance turn while its prompt cache is still warm, and
 * never after: a chat that slept past the cache compacts on its next send
 * (the composer's Compact chip) or not at all. The thread and its latest run
 * form the identity, so a chat compacts once per idle spell: the compaction
 * becomes the latest run, and a latest /compact is never compacted again. A
 * send that arrives during it queues behind it.
 */
export function autoCompactCommand(
  candidate: ProjectionStore.ProjectionAutoCompactCandidate,
): OrchestrationV2Command {
  const identity = `${AUTO_COMPACT_ID_PREFIX}${candidate.threadId}:${candidate.latestRunId}`;
  return {
    type: "message.dispatch",
    commandId: CommandId.make(identity),
    messageId: MessageId.make(identity),
    threadId: candidate.threadId,
    text: "/compact",
    attachments: [],
    dispatchMode: { type: "start_immediately" },
    createdBy: "user",
    creationSource: "server",
  };
}

const makeSweep = Effect.gen(function* () {
  const projections = yield* ProjectionStore.ProjectionStoreV2;
  const threads = yield* ThreadManagement.ThreadManagementService;
  const settings = yield* ServerSettings.ServerSettingsService;
  return Effect.fn("AutoCompactWorker.sweep")(function* () {
    const preferences = yield* settings.getSettings;
    if (!preferences.autoCompact) return;
    const now = yield* DateTime.now;
    const candidates = yield* projections.getAutoCompactCandidates({
      idleBefore: DateTime.subtractDuration(
        now,
        Duration.minutes(preferences.autoCompactIdleMinutes),
      ),
      endedAfter: DateTime.subtractDuration(now, Duration.minutes(CLAUDE_PROMPT_CACHE_MINUTES)),
      minTokens: preferences.autoCompactMinTokens,
    });
    if (candidates.length === 0) return;
    // While a chat on the same account is stopped by an unexpired usage limit,
    // compaction would fail on that limit and leave the idle chat showing it.
    const { threads: shells } = yield* threads.getShellSnapshot();
    const limitedAccounts = new Set(
      shells
        .filter(
          (shell) =>
            shell.lastErrorClass === "usage_limit" &&
            shell.usageLimitResetAt != null &&
            Date.parse(shell.usageLimitResetAt) > DateTime.toEpochMillis(now),
        )
        .map((shell) => shell.providerInstanceId),
    );
    for (const candidate of candidates) {
      const account = shells.find((shell) => shell.id === candidate.threadId)?.providerInstanceId;
      if (account !== undefined && limitedAccounts.has(account)) continue;
      yield* threads.dispatch(autoCompactCommand(candidate)).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("orchestration-v2.auto-compact.dispatch-failed", {
            threadId: candidate.threadId,
            cause,
          }),
        ),
      );
    }
  });
});

// Due work is derived from persisted runs and context usage, so a restart
// needs no timer restoration.
export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const sweep = yield* makeSweep;
    const scheduler = yield* Scheduler.Scheduler;
    yield* scheduler.register("auto-compact", sweep());
  }),
);
