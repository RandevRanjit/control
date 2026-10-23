import {
  CommandId,
  isProviderNativeSubagentThread,
  MessageId,
  type ProviderInstanceId,
  type ServerProviderUsageWindow,
} from "@control/contracts";
import { elapsedShare, formatResetsIn, paceOf } from "@control/shared/usageLimits";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ProviderRegistry from "../provider/ProviderRegistry.ts";
import * as Scheduler from "../scheduling/Scheduler.ts";
import * as ServerSettings from "../serverSettings.ts";
import * as ThreadManagement from "./ThreadManagementService.ts";

/** What a working chat is told when its account's five-hour window runs ahead of pace. */
function paceNotice(window: ServerProviderUsageWindow, now: number): string {
  const elapsed = Math.round((elapsedShare(window, now) ?? 0) * 100);
  const resets = formatResetsIn(window, now);
  return [
    `Control: the 5-hour usage window is burning faster than it can last (${Math.round(window.usedPercent)}% used with ${elapsed}% of the window gone${resets ? `, ${resets}` : ""}).`,
    "Stop spawning subagents, workflows and parallel agents now, and continue sequentially in this thread.",
    "If you are already working by yourself in this single thread, carry on as you are.",
  ].join(" ");
}

const makeSweep = Effect.gen(function* () {
  const providers = yield* ProviderRegistry.ProviderRegistry;
  const threads = yield* ThreadManagement.ThreadManagementService;
  const settings = yield* ServerSettings.ServerSettingsService;
  // Saves a receipt lookup per chat per tick; the receipt is what dedupes.
  const told = new Set<string>();
  return Effect.fn("UsagePaceGuard.sweep")(function* () {
    if (!(yield* settings.getSettings).usagePaceNotice) return;
    const now = DateTime.toEpochMillis(yield* DateTime.now);
    const ahead = new Map<ProviderInstanceId, ServerProviderUsageWindow & { resetsAt: string }>();
    for (const provider of yield* providers.getProviders) {
      const session = provider.usageLimits?.windows.find((window) => window.kind === "session");
      if (session?.resetsAt && session.usedPercent < 100 && paceOf(session, now) === "ahead") {
        ahead.set(provider.instanceId, { ...session, resetsAt: session.resetsAt });
      }
    }
    if (ahead.size === 0) {
      told.clear();
      return;
    }
    const snapshot = yield* threads.getShellSnapshot();
    for (const thread of snapshot.threads) {
      const window = ahead.get(thread.providerInstanceId);
      const working =
        thread.status === "running" || (thread.pendingBackgroundTasks?.length ?? 0) > 0;
      if (!window || !working || isProviderNativeSubagentThread(thread)) continue;
      // The window's reset, to the minute, names it: the probe and the
      // streamed limit events report the same reset with different precision.
      const identity = `usage-pace:${thread.id}:${Math.round(Date.parse(window.resetsAt) / 60_000)}`;
      if (told.has(identity)) continue;
      told.add(identity);
      // Steers a running turn; a chat waiting on background subagents gets a turn.
      yield* threads
        .sendToThread({
          projectId: thread.projectId,
          commandId: CommandId.make(identity),
          messageId: MessageId.make(identity),
          threadId: thread.id,
          text: paceNotice(window, now),
          attachments: [],
          mode: "auto",
          createdBy: "system",
          creationSource: "server",
        })
        .pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning("orchestration-v2.usage-pace.notice-failed", {
              threadId: thread.id,
              cause,
            }),
          ),
        );
    }
  });
});

/**
 * Once per five-hour window, when an account burns faster than the window can
 * last (the same verdict Usage → Limits draws), every chat working on that
 * account is told to stop spawning subagents. A chat already working alone
 * carries on. Settings' "Pace notice to working chats" switches it off.
 */
export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const sweep = yield* makeSweep;
    const scheduler = yield* Scheduler.Scheduler;
    yield* scheduler.register("usage-pace-guard", sweep());
  }),
);
