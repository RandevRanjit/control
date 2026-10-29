import type { ScopedThreadRef } from "@control/contracts";
import { type ComponentProps, useLayoutEffect, useMemo, useRef } from "react";
import {
  deriveTimelineEntriesFromVisibleTurnItemsWithState,
  type TimelineEntriesInput,
  type TimelineEntriesProjection,
  type TimelineEntry,
} from "../../session-logic";
import { useThreadVisibleTurnItems } from "../../state/entities";
import {
  peekRememberedThreadTimeline,
  rememberReadyThreadTimeline,
  resolveThreadSwitchTimeline,
  timelineHasEphemeralPreviewUrls,
} from "../ChatView.logic";
import { MessagesTimeline } from "./MessagesTimeline";

export type LiveTimelineEntriesInput = Omit<TimelineEntriesInput, "visibleTurnItems">;

/**
 * The thread's timeline entries with the streamed text. ChatView reads the thread through its
 * quiet atoms, which hold through text deltas; this reads the live turn items, so a delta
 * re-renders only the component that calls it.
 */
export function useLiveTimelineEntries(input: {
  /** Null until the thread's detail may load; see resolveThreadDetailRef. */
  readonly threadDetailRef: ScopedThreadRef | null;
  readonly activeThreadKey: string | null;
  readonly entriesInput: LiveTimelineEntriesInput;
  /** A local draft's optimistic rows; null for a server thread. */
  readonly draftEntries: ReadonlyArray<TimelineEntry> | null;
}): ReadonlyArray<TimelineEntry> {
  const { activeThreadKey, draftEntries } = input;
  const { optimisticMessages, attachmentUrlById, attempts, nodes, plans } = input.entriesInput;
  const visibleTurnItems = useThreadVisibleTurnItems(input.threadDetailRef);
  const projectionRef = useRef<{
    readonly threadKey: string | null;
    readonly projection: TimelineEntriesProjection;
  } | null>(null);
  const serverEntries = useMemo(() => {
    const previous = projectionRef.current;
    const projection = deriveTimelineEntriesFromVisibleTurnItemsWithState(
      {
        visibleTurnItems,
        optimisticMessages,
        ...(attachmentUrlById === undefined ? {} : { attachmentUrlById }),
        ...(attempts === undefined ? {} : { attempts }),
        ...(nodes === undefined ? {} : { nodes }),
        ...(plans === undefined ? {} : { plans }),
      },
      previous?.threadKey === activeThreadKey ? previous.projection : null,
    );
    projectionRef.current = { threadKey: activeThreadKey, projection };
    return projection.entries;
  }, [
    activeThreadKey,
    attachmentUrlById,
    attempts,
    nodes,
    optimisticMessages,
    plans,
    visibleTurnItems,
  ]);
  return draftEntries ?? serverEntries;
}

/** The timeline with the streamed text; see useLiveTimelineEntries. */
export function ThreadTimeline({
  threadDetailRef,
  entriesInput,
  draftEntries,
  activeThreadKey,
  syncing,
  detailLoading,
  readyMarkdownCwd,
  readyWorkspaceRoot,
  ...timelineProps
}: Omit<ComponentProps<typeof MessagesTimeline>, "timelineEntries"> & {
  threadDetailRef: ScopedThreadRef | null;
  entriesInput: LiveTimelineEntriesInput;
  draftEntries: ReadonlyArray<TimelineEntry> | null;
  activeThreadKey: string | null;
  syncing: boolean;
  detailLoading: boolean;
  readyMarkdownCwd: string | null;
  readyWorkspaceRoot: string | null;
}) {
  const entries = useLiveTimelineEntries({
    threadDetailRef,
    activeThreadKey,
    entriesInput,
    draftEntries,
  });
  const displayed = resolveThreadSwitchTimeline({
    loading: entries.length === 0 && syncing,
    activeThreadKey,
    nextEntries: entries,
    rememberedForActive: peekRememberedThreadTimeline<typeof entries>(activeThreadKey),
  });
  useLayoutEffect(() => {
    if (detailLoading || entries.length === 0 || timelineHasEphemeralPreviewUrls(entries)) {
      return;
    }
    rememberReadyThreadTimeline({
      threadKey: activeThreadKey,
      entries,
      markdownCwd: readyMarkdownCwd,
      workspaceRoot: readyWorkspaceRoot,
    });
  }, [activeThreadKey, detailLoading, entries, readyMarkdownCwd, readyWorkspaceRoot]);
  return <MessagesTimeline {...timelineProps} timelineEntries={displayed.entries} />;
}
