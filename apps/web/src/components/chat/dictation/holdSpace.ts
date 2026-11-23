/** A held Space starts listening after this long; a tapped one is let go sooner. */
export const HOLD_SPACE_MS = 300;

export interface HoldSpaceTarget {
  /** Whether a Space pressed here is typed into the prompt. */
  readonly isEditor: (element: EventTarget | null) => boolean;
  readonly canListen: () => boolean;
  /** The prompt as Space goes down, before the space is typed. */
  readonly readPrompt: () => string;
  /** Takes the typed space back out and listens. False when the prompt has moved on. */
  readonly listen: (before: string) => boolean;
  /** Space is up: stop listening and write it down. */
  readonly finish: () => void;
}

/**
 * What a typed space replaced, from the prompt before it and the prompt and caret after it. Null
 * when anything else changed too. The caret before it isn't asked: the editor learns of a moved
 * caret only once the browser tells it, which can be after the key.
 */
export function spanOfTypedSpace(
  before: string,
  after: string,
  caret: number,
): { readonly start: number; readonly end: number } | null {
  const start = caret - 1;
  const rest = after.slice(caret);
  const end = before.length - rest.length;
  return end >= start &&
    after[start] === " " &&
    before.slice(0, start) === after.slice(0, start) &&
    before.slice(end) === rest
    ? { start, end }
    : null;
}

/**
 * Hold Space to talk, let go to have it written down. A tap still types a space straight away, so
 * the hold takes its one space back once it's clear it was a hold. Returns a function that stops
 * watching.
 */
export function watchHeldSpace(view: Window, target: HoldSpaceTarget): () => void {
  let held:
    | { readonly phase: "pressed"; readonly timer: number }
    | { readonly phase: "listening" }
    | null = null;

  const letGo = () => {
    if (held?.phase === "pressed") view.clearTimeout(held.timer);
    const wasListening = held?.phase === "listening";
    held = null;
    if (wasListening) target.finish();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.code === "Space" && held !== null) {
      // The keyboard repeats a held key; only the first press types.
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (held?.phase === "pressed") letGo();
    if (
      event.code !== "Space" ||
      event.repeat ||
      event.isComposing ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      event.shiftKey ||
      !target.isEditor(event.target) ||
      !target.canListen()
    ) {
      return;
    }
    const before = target.readPrompt();
    const timer = view.setTimeout(() => {
      held = target.listen(before) ? { phase: "listening" } : null;
    }, HOLD_SPACE_MS);
    held = { phase: "pressed", timer };
  };
  const onKeyUp = (event: KeyboardEvent) => {
    if (event.code === "Space") letGo();
  };
  // A click while Space is down moves the caret, and another window takes the key-up with it.
  const onPointerDown = () => {
    if (held?.phase === "pressed") letGo();
  };

  view.addEventListener("keydown", onKeyDown, true);
  view.addEventListener("keyup", onKeyUp, true);
  view.addEventListener("pointerdown", onPointerDown, true);
  view.addEventListener("blur", letGo);
  return () => {
    letGo();
    view.removeEventListener("keydown", onKeyDown, true);
    view.removeEventListener("keyup", onKeyUp, true);
    view.removeEventListener("pointerdown", onPointerDown, true);
    view.removeEventListener("blur", letGo);
  };
}
