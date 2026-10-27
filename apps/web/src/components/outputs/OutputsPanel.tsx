import type { EnvironmentId, OrchestrationV2Run, RunId } from "@control/contracts";
import { Camera, File, FileDiff, FileOutput, type LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";

import type { ChatMessage, TurnDiffSummary } from "~/types";
import { cn } from "~/lib/utils";

import { AttachmentFilePreview } from "../files/AttachmentFilePreview";
import { deriveThreadOutputs, type ThreadOutput } from "./threadOutputs";

/** §20.2: screenshot, file, diff, build output; a published page is a file. */
const KIND_ICONS: Record<ThreadOutput["kind"], LucideIcon> = {
  shot: Camera,
  file: File,
  page: File,
  diff: FileDiff,
  out: FileOutput,
};

/**
 * The panel's Outputs view (design §5.3): everything the agent made in this thread, grouped by
 * turn, newest first, with the picked one shown underneath. A changed file opens in Git, which
 * holds the diff.
 */
export function OutputsPanel(props: {
  environmentId: EnvironmentId;
  messages: ReadonlyArray<ChatMessage>;
  runs: ReadonlyArray<
    Pick<OrchestrationV2Run, "id" | "ordinal" | "requestedAt" | "startedAt" | "completedAt">
  >;
  htmlRenders: ReadonlyArray<{ runId: RunId | null; attachmentId: string; title: string }>;
  checkpoints: ReadonlyArray<TurnDiffSummary>;
  onOpenDiff: (runId: RunId, path: string) => void;
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
  // Until something is picked, the newest thing that can be shown here is.
  const picked =
    items.find((item) => item.id === pickedId && item.kind !== "diff") ??
    items.find((item) => item.kind !== "diff") ??
    null;

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
          Screenshots, files and changes the agent makes show here.
        </p>
      ) : (
        <div
          className={cn("dp-list overflow-y-auto", picked === null ? "flex-1" : "max-h-[45%]")}
          role="list"
        >
          {turns.map((turn) => (
            <div key={turn.runId} role="group" aria-label={turn.label}>
              <div className="dp-th">{turn.label}</div>
              {turn.items.map((item) => {
                const Icon = KIND_ICONS[item.kind];
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="listitem"
                    className="dp-o w-full cursor-pointer text-left"
                    data-on={item.id === picked?.id ? "" : undefined}
                    onClick={() => {
                      if (item.kind === "diff") props.onOpenDiff(item.runId, item.path);
                      else setPickedId(item.id);
                    }}
                  >
                    <Icon className="gi" />
                    <span className="dp-nm">{item.name}</span>
                    <span className="dp-mt">{item.meta}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
      {picked === null || picked.kind === "diff" ? null : (
        <div className="flex min-h-0 flex-1 flex-col" data-outputs-preview>
          {picked.kind === "page" ? (
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
