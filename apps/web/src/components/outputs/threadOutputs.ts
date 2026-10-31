import { formatAttachmentSize } from "@control/client-runtime/state/attachments";
import { whenLabel } from "@control/client-runtime/state/loose-ends";
import type { OrchestrationV2Run, RunId } from "@control/contracts";
import { filePreviewKind } from "@control/shared/filePreview";
import { extractMarkdownLinkHrefs } from "@control/shared/markdownLinks";
import * as DateTime from "effect/DateTime";

import { resolveMarkdownFileLinkMeta } from "../../markdown-links";

import {
  type ChatFileAttachment,
  type ChatImageAttachment,
  type ChatMessage,
  isFileAttachment,
  isImageAttachment,
  type TurnDiffSummary,
} from "../../types";

/**
 * One thing a turn made (design §5.3): a screenshot, a file, a page, a build output, or a document
 * or picture it wrote into the workspace. Code it changed is Git's, not an output (owner, 29 Oct).
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
  | { id: string; kind: "change"; name: string; meta: string; runId: RunId; path: string };

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

/** Workspace files a person reads rather than runs: documents, pictures, media and builds. */
const ARTEFACT_EXTENSION =
  /\.(md|markdown|mdx|txt|pdf|rtf|docx?|odt|pptx?|key|xlsx?|numbers|pages|csv|tsv|png|jpe?g|gif|webp|avif|heic|svg|ico|mp4|mov|webm|m4v|mp3|wav|m4a|aiff?|flac|dmg|zip|pkg|ipa|apk|aab|tar|gz|tgz|whl|msi|exe)$/i;

function changeMeta(file: TurnDiffSummary["files"][number]): string {
  if (file.kind === "added") return "new";
  const parts = [
    file.additions > 0 ? `+${file.additions}` : null,
    file.deletions > 0 ? `−${file.deletions}` : null,
  ].filter((part) => part !== null);
  return parts.length > 0 ? parts.join(" ") : file.kind;
}

/** Everything the agent made in a thread, grouped by turn, newest turn first. */
export function deriveThreadOutputs(input: {
  runs: ReadonlyArray<
    Pick<OrchestrationV2Run, "id" | "ordinal" | "requestedAt" | "startedAt" | "completedAt">
  >;
  messages: ReadonlyArray<ChatMessage>;
  /** Pages the agent published with `html_render`. */
  htmlRenders: ReadonlyArray<{ runId: RunId | null; attachmentId: string; title: string }>;
  checkpoints: ReadonlyArray<TurnDiffSummary>;
  /** Anchors the files the agent links in its reply; outside it, a link isn't an output. */
  workspaceRoot: string | null;
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
      const changes = input.checkpoints
        .filter((checkpoint) => checkpoint.runId === run.id)
        .flatMap((checkpoint) => checkpoint.files)
        .filter((file) => file.kind !== "deleted" && ARTEFACT_EXTENSION.test(file.path))
        .map((file): ThreadOutput => ({
          id: `change:${run.id}:${file.path}`,
          kind: "change",
          name: file.path,
          meta: changeMeta(file),
          runId: run.id,
          path: file.path,
        }));
      // A folder outside Git has no checkpoint diff, and Git never sees ignored files, so the
      // documents the agent links in its reply count too.
      const seen = new Set(changes.map((change) => change.id));
      const linked = replies
        .flatMap((message) => extractMarkdownLinkHrefs(message.text))
        .flatMap((href): ThreadOutput[] => {
          const path = resolveMarkdownFileLinkMeta(
            href,
            input.workspaceRoot ?? undefined,
          )?.workspaceRelativePath;
          const id = `change:${run.id}:${path}`;
          if (!path || !ARTEFACT_EXTENSION.test(path) || seen.has(id)) return [];
          seen.add(id);
          return [{ id, kind: "change", name: path, meta: extension(path), runId: run.id, path }];
        });
      const items = [...attachments, ...pages, ...changes, ...linked];
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
