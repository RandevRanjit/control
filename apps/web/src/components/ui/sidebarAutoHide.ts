import type { SidebarAutoHideDelay } from "@control/contracts";

/**
 * How long the pointer may be away before an auto-hidden sidebar slides out, as the Dock does,
 * per Settings › Appearance › Hide sidebar after.
 */
export const SIDEBAR_AUTO_HIDE_DELAYS_MS = {
  fast: 500,
  medium: 1_000,
  late: 2_000,
} satisfies Record<SidebarAutoHideDelay, number>;

/**
 * Reveal and hide timing for an auto-hidden sidebar. The pointer at the window's left edge (or
 * the toggle) reveals it; once the pointer has been away for the delay (`setDelayMs`, late until
 * set) it hides, unless `isHeld` says something in it is still in use, such as an open menu or a
 * field being typed in.
 */
export function createSidebarAutoHide(input: {
  readonly onRevealedChange: (revealed: boolean) => void;
  readonly isHeld: () => boolean;
}) {
  let delayMs: number = SIDEBAR_AUTO_HIDE_DELAYS_MS.late;
  let revealed = false;
  let pointerInside = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const cancel = () => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  };
  const set = (next: boolean) => {
    if (revealed === next) return;
    revealed = next;
    input.onRevealedChange(next);
  };
  const scheduleHide = () => {
    cancel();
    timer = setTimeout(() => {
      timer = null;
      if (pointerInside) return;
      if (input.isHeld()) scheduleHide();
      else set(false);
    }, delayMs);
  };
  const reveal = () => {
    set(true);
    if (!pointerInside) scheduleHide();
  };
  const hide = () => {
    cancel();
    set(false);
  };

  return {
    edgeEntered: reveal,
    pointerEntered: () => {
      pointerInside = true;
      cancel();
    },
    pointerLeft: () => {
      pointerInside = false;
      if (revealed) scheduleHide();
    },
    setRevealed: (next: boolean) => (next ? reveal() : hide()),
    toggle: () => (revealed ? hide() : reveal()),
    setDelayMs: (next: number) => {
      delayMs = next;
    },
    dispose: cancel,
  };
}

export type SidebarAutoHide = ReturnType<typeof createSidebarAutoHide>;
