import { useFullLockUntil } from "../../state/lock";
import { Glyph } from "../control/bloom";
import { clockLabel } from "./lock.logic";
import { openLockSheet } from "./LockSheet";
import { offerLater, useLockChats, useLockOffer } from "./useLock";

/**
 * The lock's note in the update note's slot (HANDOFF §16.1, §16.4): `Locked until` during a
 * break-through, otherwise the offer once nothing has needed you for 10 minutes. The menu-bar
 * panel passes `onLock`, since its Lock opens the window on the sheet (§19.2).
 */
export function SidebarLockNote(props: { readonly onLock?: () => void }) {
  const until = useFullLockUntil();
  const needs = useLockChats().some((chat) => chat.needs);
  const offer = useLockOffer(needs, until !== null);
  if (until !== null) {
    return (
      <div className="s-lk-root">
        <div className="hy-upd s-lk-note">
          <Glyph id="g-lock" />
          <span>
            Locked until <b className="t-num">{clockLabel(Date.parse(until))}</b>
          </span>
        </div>
      </div>
    );
  }
  if (!offer) return null;
  return (
    <div className="s-lk-root">
      <div className="hy-upd s-lk-offer">
        <Glyph id="g-lock" />
        <span>Nothing needs you</span>
        <button type="button" className="pill ghost sm" onClick={offerLater}>
          Later
        </button>
        <button
          type="button"
          className="pill sm"
          onClick={props.onLock ?? (() => openLockSheet({ mode: "Full" }))}
        >
          Lock
        </button>
      </div>
    </div>
  );
}
