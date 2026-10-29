import type { EnvironmentId, OrchestrationV2Run, RunId } from "@control/contracts";
import { Camera, ChevronDown, ChevronRight, File, FileOutput, type LucideIcon } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";

import type { ChatMessage, TurnDiffSummary } from "~/types";
import { cn } from "~/lib/utils";

import { AttachmentFilePreview } from "../files/AttachmentFilePreview";
import { deriveThreadOutputs, type ThreadOutput } from "./threadOutputs";

/** §20.2: screenshot, file, build output; a published page and a written document are files. */
const KIND_ICONS: Record<ThreadOutput["kind"], LucideIcon> = {
  shot: Camera,
  file: File,
  page: File,
  change: File,
  out: FileOutput,
};

/**
 * The panel's Outputs view (design §5.3): what the agent made in this thread, grouped by turn,
 * newest first, with the picked one shown underneath. Only the newest turn starts open; older
 * turns open on a click (owner, 29 Oct).
 */
export function OutputsPanel(props: {
  environmentId: EnvironmentId;
  messages: ReadonlyArray<ChatMessage>;
  runs: ReadonlyArray<
    Pick<OrchestrationV2Run, "id" | "ordinal" | "requestedAt" | "startedAt" | "completedAt">
  >;
  htmlRenders: ReadonlyArray<{ runId: RunId | null; attachmentId: string; title: string }>;
  checkpoints: ReadonlyArray<TurnDiffSummary>;
  /** Shows a workspace file the agent wrote, as Folder does. */
  renderWorkspaceFile: (path: string) => ReactNode;
}) {
  const turns = useMemo(
    () =>
      deriveThreadOutputs({
        runs: props.runs,
        messages: props.messages,
        htmlRenders: props.htmlRenders,
        checkpoints: props.checkpoints,
        nowMs: Date.now(),
      }),
    [props.runs, props.messages, props.htmlRenders, props.checkpoints],
  );
  const items = turns.flatMap((turn) => turn.items);
  const [pickedId, setPickedId] = useState<string | null>(null);
  // Until something is picked, the newest thing is.
  const picked = items.find((item) => item.id === pickedId) ?? items[0] ?? null;
  // Null until the reader opens or closes one: then only the newest turn is open.
  const [openRunIds, setOpenRunIds] = useState<ReadonlySet<RunId> | null>(null);
  const openTurns = openRunIds ?? new Set(turns.slice(0, 1).map((turn) => turn.runId));
  const toggleTurn = (runId: RunId) => {
    const next = new Set(openTurns);
    if (next.has(runId)) next.delete(runId);
    else next.add(runId);
    setOpenRunIds(next);
  };

  return (
    <div className="pane hy-v dp-v min-h-0 flex-1" data-outputs-panel>
      <div className="hy-vh">
        <b>Outputs</b>
        <span>this thread, newest first</span>
        <span className="sp" />
        <span className="t-num">{items.length}</span>
      </div>
      {turns.length === 0 ? (
        <p className="px-3.5 py-3 text-muted-foreground text-xs">
          Screenshots, documents, pages and builds the agent makes show here. Code it changes is in
          Git.
        </p>
      ) : (
        <div
          className={cn("dp-list overflow-y-auto", picked === null ? "flex-1" : "max-h-[45%]")}
          role="list"
        >
          {turns.map((turn) => {
            const open = openTurns.has(turn.runId);
            return (
              <div key={turn.runId} role="group" aria-label={turn.label}>
                <button
                  type="button"
                  className="dp-th flex w-full cursor-pointer items-center gap-1 text-left"
                  aria-expanded={open}
                  onClick={() => toggleTurn(turn.runId)}
                >
                  {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                  {turn.label}
                  <span className="sp" />
                  {open ? null : <span className="t-num">{turn.items.length}</span>}
                </button>
                {open
                  ? turn.items.map((item) => {
                      const Icon = KIND_ICONS[item.kind];
                      return (
                        <button
                          key={item.id}
                          type="button"
                          role="listitem"
                          className="dp-o w-full cursor-pointer text-left"
                          data-on={item.id === picked?.id ? "" : undefined}
                          onClick={() => setPickedId(item.id)}
                        >
                          <Icon className="gi" />
                          <span className="dp-nm">{item.name}</span>
                          <span className="dp-mt">{item.meta}</span>
                        </button>
                      );
                    })
                  : null}
              </div>
            );
          })}
        </div>
      )}
      {picked === null ? null : (
        <div className="flex min-h-0 flex-1 flex-col" data-outputs-preview>
          {picked.kind === "change" ? (
            props.renderWorkspaceFile(picked.path)
          ) : picked.kind === "page" ? (
            <AttachmentFilePreview
              key={`${props.environmentId}:${picked.attachmentId}`}
              name={`${picked.name}.html`}
              mimeType="text/html"
              sizeBytes={0}
              asset={{ environmentId: props.environmentId, attachmentId: picked.attachmentId }}
              htmlRender
            />
          ) : (
            <AttachmentFilePreview
              key={`${props.environmentId}:${picked.attachment.id}`}
              name={picked.attachment.name}
              mimeType={picked.attachment.mimeType}
              sizeBytes={picked.attachment.sizeBytes}
              asset={{ environmentId: props.environmentId, attachmentId: picked.attachment.id }}
              htmlRender={
                "htmlRender" in picked.attachment && picked.attachment.htmlRender === true
              }
            />
          )}
        </div>
      )}
    </div>
  );
}
