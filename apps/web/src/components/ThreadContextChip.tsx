import type { ThreadContextRecord } from "@control/contracts";
import { Link } from "@tanstack/react-router";
import { MessagesSquareIcon } from "lucide-react";

import { useReferencedThread } from "~/state/threads";
import { ContextChip, ContextChipLabel } from "./ContextChip";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";

const THREAD_CHIP_TOOLTIP = {
  ready: "Open thread",
  loading: "Loading thread",
  failed: "Could not load thread",
  missing: "Thread no longer available",
} as const;

/**
 * Inline chip for an attached thread, in the composer and in sent messages. Prefers the
 * live title so a renamed thread never shows a stale label, and opens the thread on click.
 */
export function ThreadContextChip(props: {
  record: Pick<ThreadContextRecord, "environmentId" | "threadId" | "title">;
  copyMarkdown?: string;
}) {
  const { environmentId, threadId } = props.record;
  // The shell leaves older settled threads out, so a missing row loads before it can be gone.
  const referenced = useReferencedThread(environmentId, threadId);
  const title =
    (referenced.status === "ready" ? referenced.thread.title.trim() : "") || props.record.title;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <ContextChip
            kind="thread"
            render={<Link to="/$environmentId/$threadId" params={{ environmentId, threadId }} />}
            aria-label={`Thread, ${title}`}
            data-markdown-copy={props.copyMarkdown}
            className="no-underline"
          >
            <MessagesSquareIcon />
            <ContextChipLabel>{title}</ContextChipLabel>
          </ContextChip>
        }
      />
      <TooltipPopup side="top">{THREAD_CHIP_TOOLTIP[referenced.status]}</TooltipPopup>
    </Tooltip>
  );
}
