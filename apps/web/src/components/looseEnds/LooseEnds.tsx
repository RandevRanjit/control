import { useAtomValue } from "@effect/atom-react";
import { scopedThreadKey } from "@control/client-runtime/environment";
import type {
  OrchestrationV2LooseEnd,
  OrchestrationV2ThreadProjection,
  ScopedThreadRef,
} from "@control/contracts";
import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon, ChevronRightIcon, MailIcon, XIcon } from "lucide-react";
import { create } from "zustand";

import { useOpenLink } from "../../browser/useOpenLink";
import { writeTextToClipboard } from "../../hooks/useCopyToClipboard";
import { useNowMinute } from "../../hooks/useNowMinute";
import { shortcutLabelForCommand } from "../../keybindings";
import { serverEnvironment, primaryServerKeybindingsAtom } from "../../state/server";
import { shellEnvironment } from "../../state/shell";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { useOrchestrationCommand } from "../../state/use-orchestration-command";
import { jumpToMessage } from "../chat/timelineJump";
import { cn } from "~/lib/utils";
import { toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  actionLabel,
  closedLabel,
  filedLabel,
  splitLooseEnds,
} from "@control/client-runtime/state/loose-ends";

/** The chat whose popover is up; one at a time, so switching chats puts it away. */
const usePopover = create<{ readonly threadKey: string | null }>(() => ({ threadKey: null }));

/** Opens a chat's loose ends under the chat head's icon (⌘E, a card's mark). */
export function openLooseEnds(threadRef: ScopedThreadRef) {
  usePopover.setState({ threadKey: scopedThreadKey(threadRef) });
}

const closeLooseEnds = () => usePopover.setState({ threadKey: null });

export function toggleLooseEnds(threadRef: ScopedThreadRef) {
  if (usePopover.getState().threadKey === scopedThreadKey(threadRef)) closeLooseEnds();
  else openLooseEnds(threadRef);
}

const useLooseEndsOpen = (threadRef: ScopedThreadRef | null) =>
  usePopover((state) => threadRef !== null && state.threadKey === scopedThreadKey(threadRef));

/** Whether the Done fold is open is remembered on each client (§17.2). */
const DONE_OPEN_KEY = "control:loose-ends:done-open";
const readDoneOpen = () => {
  try {
    return window.localStorage.getItem(DONE_OPEN_KEY) === "true";
  } catch {
    return false;
  }
};

const TICK = (
  <svg viewBox="0 0 12 12" aria-hidden="true">
    <path
      d="M2.6 6.3l2.2 2.2 4.6-4.9"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

type PopoverProps = {
  readonly threadRef: ScopedThreadRef;
  readonly projection: Pick<OrchestrationV2ThreadProjection, "looseEnds" | "runs"> | null;
};

/**
 * The chat head's mail icon (HANDOFF §17.2), last in its tools: the open count, and the
 * popover (LE1) hung under it with this chat's open loose ends, then the Done fold.
 */
export function LooseEndsHeadIcon(props: PopoverProps) {
  const open = useLooseEndsOpen(props.threadRef);
  const count = (props.projection?.looseEnds ?? []).filter((item) => item.status === "open").length;
  const rootRef = useRef<HTMLSpanElement>(null);
  // A press anywhere else puts it away, as every other popover does; the icon's own click toggles.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) closeLooseEnds();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);
  return (
    <span ref={rootRef} className="s-le-root relative flex shrink-0 items-center">
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              className={cn(
                "d-loose s-le-ic [-webkit-app-region:no-drag]",
                count > 0 && "s-le-has",
              )}
              aria-label={count > 0 ? `Loose ends, ${count} open` : "Loose ends"}
              aria-expanded={open}
              data-open={open ? "" : undefined}
              onClick={() => toggleLooseEnds(props.threadRef)}
            >
              <MailIcon className="gi" />
              {count > 0 ? <b>{count}</b> : null}
            </button>
          }
        />
        <TooltipPopup side="bottom">Loose ends</TooltipPopup>
      </Tooltip>
      {open ? <Popover {...props} /> : null}
    </span>
  );
}

function Popover(props: PopoverProps) {
  const { threadRef, projection } = props;
  const nowMs = Date.parse(useNowMinute());
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const serverConfig = useAtomValue(serverEnvironment.configValueAtom(threadRef.environmentId));
  const close = useOrchestrationCommand(
    threadEnvironment.closeLooseEnd,
    "Failed to close the loose end",
  );
  const reopen = useOrchestrationCommand(
    threadEnvironment.reopenLooseEnd,
    "Failed to reopen the loose end",
  );
  const clear = useOrchestrationCommand(
    threadEnvironment.clearLooseEnds,
    "Failed to clear the done loose ends",
  );
  const openInEditor = useAtomCommand(shellEnvironment.openInEditor, "Failed to reveal the file");
  const openLink = useOpenLink(threadRef);
  const [doneOpen, setDoneOpen] = useState(readDoneOpen);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      closeLooseEnds();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  const runs = projection?.runs ?? [];
  const { open: openItems, closed } = splitLooseEnds(projection?.looseEnds ?? []);
  const shortcut = shortcutLabelForCommand(keybindings, "looseEnds.toggle");
  const canReveal =
    serverConfig?.shellRevealInFileManager === true &&
    serverConfig.availableEditors.includes("file-manager");

  const target = { environmentId: threadRef.environmentId };
  const settle = (item: OrchestrationV2LooseEnd, outcome: "done" | "dismissed") =>
    void close({
      ...target,
      input: { threadId: threadRef.threadId, looseEndId: item.id, outcome },
    });
  const undo = (item: OrchestrationV2LooseEnd) =>
    void reopen({ ...target, input: { threadId: threadRef.threadId, looseEndId: item.id } });
  const act = (item: OrchestrationV2LooseEnd) => {
    const action = item.action;
    if (action === null) return;
    if (action.kind === "link") void openLink(action.value);
    else if (action.kind === "file" && canReveal)
      void openInEditor({
        ...target,
        input: { cwd: action.value, editor: "file-manager", reveal: true },
      });
    else
      void writeTextToClipboard(action.value, action.kind === "file" ? "path" : "command").then(
        (didCopy) => {
          if (didCopy)
            toastManager.add({ type: "success", title: "Copied", description: action.value });
        },
        () =>
          toastManager.add({ type: "error", title: "Couldn't copy", description: action.value }),
      );
  };
  const toggleDone = () => {
    const next = !doneOpen;
    setDoneOpen(next);
    try {
      window.localStorage.setItem(DONE_OPEN_KEY, String(next));
    } catch {
      // A private window keeps the fold for this session only.
    }
  };
  const turnOf = (item: OrchestrationV2LooseEnd) =>
    runs.find((run) => run.id === item.runId)?.userMessageId ?? null;

  return (
    <div className="s-le-root contents">
      <div className="panel float s-le-pop" role="dialog" aria-label="Loose ends">
        <div className="s-le-ph">
          Loose ends
          {openItems.length > 0 ? (
            <span className="s-le-pc">
              <span className="t-num">{openItems.length}</span> open
            </span>
          ) : null}
          <span className="sp" />
          {shortcut === null ? null : <span className="kbd">{shortcut}</span>}
        </div>
        {openItems.length === 0 ? (
          <div className="s-le-empty">
            <b>Nothing open in this thread.</b>
            When an agent hands you something to do, it shows here.
          </div>
        ) : (
          <div className="s-le-list">
            {openItems.map((item) => {
              const messageId = turnOf(item);
              return (
                <div key={item.id} className="s-le-it">
                  <button
                    type="button"
                    className="s-le-box"
                    aria-label={`Done: ${item.line}`}
                    onClick={() => settle(item, "done")}
                  />
                  <div className="s-le-tx">
                    <div className="s-le-t">{item.line}</div>
                    {item.reason === "" ? null : <div className="s-le-w">{item.reason}</div>}
                    {messageId === null ? (
                      <div className="s-le-m">{filedLabel(item, runs, nowMs)}</div>
                    ) : (
                      <button
                        type="button"
                        className="s-le-m"
                        onClick={() => jumpToMessage(messageId)}
                      >
                        {filedLabel(item, runs, nowMs)}
                      </button>
                    )}
                  </div>
                  <div className="s-le-acts">
                    {item.action === null ? null : (
                      <button type="button" className="pill ghost sm" onClick={() => act(item)}>
                        {actionLabel(item.action, canReveal)}
                      </button>
                    )}
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <button
                            type="button"
                            className="s-le-x"
                            aria-label={`Dismiss: ${item.line}`}
                            onClick={() => settle(item, "dismissed")}
                          >
                            <XIcon className="gi" />
                          </button>
                        }
                      />
                      <TooltipPopup>Dismiss</TooltipPopup>
                    </Tooltip>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {closed.length === 0 ? null : (
          <>
            <div className="s-le-fold">
              <button
                type="button"
                className="s-le-fl"
                aria-expanded={doneOpen}
                onClick={toggleDone}
              >
                {doneOpen ? (
                  <ChevronDownIcon className="gi" />
                ) : (
                  <ChevronRightIcon className="gi" />
                )}
                Done
                <span className="pearl count">{closed.length}</span>
              </button>
              <button
                type="button"
                className="pill ghost sm"
                onClick={() => void clear({ ...target, input: { threadId: threadRef.threadId } })}
              >
                Clear
              </button>
            </div>
            {doneOpen ? (
              <div className="s-le-list">
                {closed.map((item) => (
                  <div key={item.id} className="s-le-it s-le-done">
                    <span className="s-le-box" data-on="">
                      {TICK}
                    </span>
                    <div className="s-le-tx">
                      <div className="s-le-t">{item.line}</div>
                      <div className="s-le-m">{closedLabel(item, runs, nowMs)}</div>
                    </div>
                    <div className="s-le-acts">
                      <button type="button" className="pill ghost sm" onClick={() => undo(item)}>
                        Undo
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
