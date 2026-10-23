import type { MessageId } from "@control/contracts";
import { create } from "zustand";

/**
 * Scrolls the open chat to a turn's prompt from outside the timeline (a loose end's turn).
 * The timeline takes the request once; a prompt it hasn't loaded is skipped.
 */
export const useTimelineJump = create<{ readonly messageId: MessageId | null }>(() => ({
  messageId: null,
}));

export const jumpToMessage = (messageId: MessageId) => useTimelineJump.setState({ messageId });
