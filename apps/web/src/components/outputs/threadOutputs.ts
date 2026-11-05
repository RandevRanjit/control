import { formatAttachmentSize } from "@control/client-runtime/state/attachments";
import { whenLabel } from "@control/client-runtime/state/loose-ends";
import type { OrchestrationV2Run, RunId } from "@control/contracts";
import { filePreviewKind } from "@control/shared/filePreview";
import { filedOutputsFromToolItem } from "@control/shared/toolOutput";
import * as DateTime from "effect/DateTime";

import type { TimelineEntry } from "../../session-logic";
import {
  type ChatFileAttachment,
  type ChatImageAttachment,
  type ChatMessage,
  isFileAttachment,
  isImageAttachment,
} from "../../types";

/**
 * One thing a turn handed the reader (design §5.3): a screenshot, a file or a page it sent, or
 * anything in the folder it filed with `output_add`. Code is Git's, not an output (owner, 5 Nov).
 */
export type ThreadOutput =
  | {
      id: string;
      kind: "shot" | "file" | "out";
      name: string;
      meta: string;
      attachment: ChatImageAttachment | ChatFileAttachment;
    }
  | { id: string; kind: "page"; name: string; meta: string; attachmentId: string }
  | { id: string; kind: "filed"; name: string; meta: string; path: string };

export interface ThreadOutputTurn {
  runId: RunId;
  ordinal: number;
  /** `T14 · now`, `T12 · 23:20`. */
  label: string;
  items: ThreadOutput[];
}

const extension = (name: string) => name.slice(name.lastIndexOf(".") + 1).toUpperCase();

const KIND_LABELS: Partial<Record<ReturnType<typeof filePreviewKind>, string>> = {
  markdown: "Markdown",
  html: "HTML",
};

function attachmentOutput(attachment: ChatImageAttachment | ChatFileAttachment): ThreadOutput {
  const kind = filePreviewKind(attachment);
  const sized = `${extension(attachment.name)} · ${formatAttachmentSize(attachment.sizeBytes)}`;
  return {
    id: attachment.id,
    kind: kind === "image" ? "shot" : kind === "unsupported" ? "out" : "file",
    name: attachment.name,
    meta: KIND_LABELS[kind] ?? (kind === "text" ? extension(attachment.name) : sized),
    attachment,
  };
}

/** The files completed `output_add` calls filed, each with the run that filed it. */
export function filedOutputsFromTimeline(entries: ReadonlyArray<TimelineEntry>) {
  return entries.flatMap((entry) => {
    const item = entry.kind === "work" ? entry.entry.structuredPayload : undefined;
    if (item?.type !== "dynamic_tool" || item.status !== "completed") return [];
    return (filedOutputsFromToolItem(item) ?? []).map((path) => ({ runId: item.runId, path }));
  });
}

/** Everything the agent made in a thread, grouped by turn, newest turn first. */
export function deriveThreadOutputs(input: {
  runs: ReadonlyArray<
    Pick<OrchestrationV2Run, "id" | "ordinal" | "requestedAt" | "startedAt" | "completedAt">
  >;
  messages: ReadonlyArray<ChatMessage>;
  /** Pages the agent published with `html_render`. */
  htmlRenders: ReadonlyArray<{ runId: RunId | null; attachmentId: string; title: string }>;
  /** Files the agent listed with `output_add`, relative to the thread's folder. */
  filed: ReadonlyArray<{ runId: RunId | null; path: string }>;
  nowMs: number;
}): ThreadOutputTurn[] {
  return input.runs
    .toSorted((left, right) => right.ordinal - left.ordinal)
    .flatMap((run) => {
      const replies = input.messages.filter(
        (message) => message.role === "assistant" && message.runId === run.id,
      );
      const attachments = replies
        .flatMap((message) => message.attachments ?? [])
        .flatMap((attachment) =>
          isImageAttachment(attachment) || isFileAttachment(attachment)
            ? [attachmentOutput(attachment)]
            : [],
        );
      const pages = input.htmlRenders
        .filter((render) => render.runId === run.id)
        .map((render): ThreadOutput => ({
          id: render.attachmentId,
          kind: "page",
          name: render.title,
          meta: "Page",
          attachmentId: render.attachmentId,
        }));
      const filed = [
        ...new Set(input.filed.filter((file) => file.runId === run.id).map((file) => file.path)),
      ].map((path): ThreadOutput => ({
        id: `filed:${run.id}:${path}`,
        kind: "filed",
        name: path,
        meta: extension(path.slice(path.lastIndexOf("/") + 1)),
        path,
      }));
      const items = [...attachments, ...pages, ...filed];
      if (items.length === 0) return [];
      const atMs = DateTime.toEpochMillis(run.completedAt ?? run.startedAt ?? run.requestedAt);
      return [
        {
          runId: run.id,
          ordinal: run.ordinal,
          label: `T${run.ordinal} · ${whenLabel(atMs, input.nowMs)}`,
          items,
        },
      ];
    });
}
