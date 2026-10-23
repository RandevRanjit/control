// Design v1's dashed turn line (§4.4, `dashes()` in v1/behaviour.js), fitted
// over the timeline's flat rows: a turn is a prompt row and the rows after it,
// so each row draws its own segment of the turn's line, phase-shifted so the
// segments join into pieces of whole dashes. The line breaks at every reply's
// ↳, so a turn with several replies draws one piece per reply.

// The owner's dash and gap, tuned on design/hybrid's S6 on 10 Oct (§4.4).
const DASH = 13;
const GAP = 20;
const PIN = 18;

export interface TurnLineRow {
  readonly top: number;
  readonly height: number;
  /** Top of the prompt's → arrow, when the row is a prompt. */
  readonly askPin: number | null;
  /** Top of the reply's ↳ arrow, when the row is a reply. */
  readonly replyPin: number | null;
}

export interface TurnLineSegment {
  /** Offsets within the row. */
  readonly top: number;
  readonly height: number;
  /** One dash plus its stretched gap. */
  readonly period: number;
  /** Background offset that keeps the dashes in phase across rows. */
  readonly offset: number;
}

const NONE: TurnLineSegment = { top: 0, height: 0, period: DASH + GAP, offset: 0 };

/** Rows in visual order; one segment per row (height 0 when it draws none). */
export function fitTurnLines(rows: ReadonlyArray<TurnLineRow>): TurnLineSegment[] {
  const segments = rows.map(() => NONE);
  let start = rows.findIndex((row) => row.askPin !== null);
  while (start !== -1) {
    let end = start + 1;
    while (end < rows.length && rows[end]!.askPin === null) end += 1;
    // Each piece runs from a gap below → (or the ↳ before) to a gap above
    // the next ↳'s tail, which starts 1 into its box.
    let first = start;
    let top = rows[start]!.askPin! + PIN + GAP;
    for (let index = start; index < end; index += 1) {
      const pin = rows[index]!.replyPin;
      if (pin === null) continue;
      fitPiece(rows, segments, first, index, top, pin + 1 - GAP);
      first = index;
      top = pin + PIN + GAP;
    }
    start = end < rows.length ? end : -1;
  }
  return segments;
}

/** Draws one piece of whole dashes over rows `first`..`last`. A reply's ↳ sits
 * near its row's top, so the piece above it ends in an earlier row and no row
 * meets two pieces. */
function fitPiece(
  rows: ReadonlyArray<TurnLineRow>,
  segments: TurnLineSegment[],
  first: number,
  last: number,
  top: number,
  bottom: number,
): void {
  const height = bottom - top;
  if (height <= 0) return;
  const count = Math.max(1, Math.round((height + GAP) / (DASH + GAP)));
  const period = DASH + (count > 1 ? (height - count * DASH) / (count - 1) : 0);
  for (let index = first; index <= last; index += 1) {
    const row = rows[index]!;
    const from = Math.max(top, row.top);
    const to = Math.min(bottom, row.top + row.height);
    if (to > from) {
      segments[index] = { top: from - row.top, height: to - from, period, offset: top - from };
    }
  }
}

/** Measures every timeline row under `root` and positions its `.d-line`. */
export function fitTimelineTurnLines(root: HTMLElement): void {
  const measured = Array.from(root.querySelectorAll<HTMLElement>("[data-timeline-row-kind]"))
    .map((element) => {
      const box = element.getBoundingClientRect();
      const ask = element.querySelector(".d-q > .d-pin");
      const reply = element.querySelector(".d-say > .d-pin");
      const row: TurnLineRow = {
        top: box.top,
        height: box.height,
        askPin: ask ? ask.getBoundingClientRect().top : null,
        replyPin: reply ? reply.getBoundingClientRect().top : null,
      };
      return { element, row };
    })
    .toSorted((a, b) => a.row.top - b.row.top);
  const segments = fitTurnLines(measured.map((entry) => entry.row));
  measured.forEach(({ element }, index) => {
    const line = element.querySelector<HTMLElement>(":scope > .d-line");
    const segment = segments[index]!;
    if (!line) return;
    line.style.top = `${segment.top}px`;
    line.style.height = `${segment.height}px`;
    line.style.backgroundSize = `3px ${segment.period}px`;
    line.style.backgroundPositionY = `${segment.offset}px`;
  });
}
