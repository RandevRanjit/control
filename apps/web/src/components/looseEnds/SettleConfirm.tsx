import type { ScopedThreadRef } from "@control/contracts";
import { useRef } from "react";
import { create } from "zustand";

import { readThreadShell, useThreadProjection } from "../../state/entities";
import { Dialog, DialogPopup } from "../ui/dialog";

type Request = {
  readonly refs: ReadonlyArray<ScopedThreadRef>;
  readonly resolvers: ReadonlyArray<(settle: boolean) => void>;
};
const useRequest = create<{ request: Request | null }>(() => ({ request: null }));
let gathering: { refs: ScopedThreadRef[]; resolvers: Array<(settle: boolean) => void> } | null =
  null;

/**
 * Asks before settling a chat that still has loose ends open (HANDOFF §17.4). Every settle path
 * comes through here; settles started together (a range, a drop of several) share one dialog.
 */
export function confirmSettle(ref: ScopedThreadRef): Promise<boolean> {
  return new Promise((resolve) => {
    if (gathering === null) {
      gathering = { refs: [], resolvers: [] };
      queueMicrotask(() => {
        const batch = gathering!;
        gathering = null;
        const open = useRequest.getState().request;
        useRequest.setState({
          request:
            open === null
              ? batch
              : {
                  refs: [...open.refs, ...batch.refs],
                  resolvers: [...open.resolvers, ...batch.resolvers],
                },
        });
      });
    }
    gathering.refs.push(ref);
    gathering.resolvers.push(resolve);
  });
}

function answer(settle: boolean) {
  const request = useRequest.getState().request;
  useRequest.setState({ request: null });
  for (const resolve of request?.resolvers ?? []) resolve(settle);
}

/** Mounted with the app: the dialog while a settle waits on it. */
export function SettleConfirmHost() {
  const request = useRequest((state) => state.request);
  return request === null ? null : <SettleConfirm refs={request.refs} />;
}

/** One chat's open lines, in the dialog's well; the chat is named when several settle at once. */
function OpenLines(props: { readonly threadRef: ScopedThreadRef; readonly named: boolean }) {
  const thread = useThreadProjection(props.threadRef);
  const title = readThreadShell(props.threadRef)?.title ?? "";
  return (thread?.projection.looseEnds ?? [])
    .filter((item) => item.status === "open")
    .map((item) => (
      <span key={item.id}>{props.named ? `${title} · ${item.line}` : item.line}</span>
    ));
}

function SettleConfirm(props: { readonly refs: ReadonlyArray<ScopedThreadRef> }) {
  const settleButton = useRef<HTMLButtonElement>(null);
  const shells = props.refs.map((ref) => readThreadShell(ref));
  const open = shells.reduce((sum, shell) => sum + (shell?.openLooseEndCount ?? 0), 0);
  const single = props.refs.length === 1;
  const count = open === 1 ? "One loose end is" : `${open} loose ends are`;
  return (
    <Dialog
      open
      onOpenChange={(isOpen) => {
        if (!isOpen) answer(false);
      }}
    >
      <DialogPopup
        variant="bare"
        showCloseButton={false}
        bottomStickOnMobile={false}
        aria-label="Settle"
        initialFocus={settleButton}
      >
        <form
          className="s-le-root"
          onSubmit={(event) => {
            event.preventDefault();
            answer(true);
          }}
        >
          <div className="panel float s-le-dlg">
            <p className="s-le-q">
              Settle {single ? <code>{shells[0]?.title}</code> : `${props.refs.length} chats`}?
            </p>
            <p className="s-le-qs">
              {single
                ? `${count} still open. ${open === 1 ? "It stays" : "They stay"} with the chat in Settled, and the card keeps its mark.`
                : `${count} still open across them. They stay with their chats in Settled, and the cards keep their marks.`}
            </p>
            <div className="s-le-ol">
              {props.refs.map((ref) => (
                <OpenLines
                  key={`${ref.environmentId}:${ref.threadId}`}
                  threadRef={ref}
                  named={!single}
                />
              ))}
            </div>
            <div className="s-le-dlf">
              <span className="sp" />
              <button type="button" className="pill ghost" onClick={() => answer(false)}>
                Cancel
              </button>
              <button ref={settleButton} type="submit" className="pill primary">
                Settle <span className="kbd">↩</span>
              </button>
            </div>
          </div>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
