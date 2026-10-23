/* CONTROL version 1 · the window's three behaviours, lifted from design/hybrid/src/kit.js (HANDOFF.md §4.4, §4.5, §5.1).
   extract.cjs inlines this file into index.html. */

/* The turn's dashed line runs from under the prompt's arrow to the last reply's arrow in whole dashes: the gap is
   stretched so a dash starts and ends the line exactly. One dash is the reply arrow's tail (y 1 to 10 of its 18 box).
   Layout units, so a scaled window doesn't matter. Re-fit whenever a turn's height changes. */
const DASH = 9, GAP = 6;
function dashes(root = document) {
  root.querySelectorAll('.d-turn').forEach(turn => {
    const line = turn.querySelector('.d-line'), q = turn.querySelector('.d-q > .d-pin'), says = turn.querySelectorAll('.d-say > .d-pin');
    if (!line || !q || !says.length) return;
    const tr = turn.getBoundingClientRect(), s = tr.height / turn.offsetHeight || 1, y = el => (el.getBoundingClientRect().top - tr.top) / s;
    const top = y(q) + 18 + GAP, bottom = y(says[says.length - 1]) + 1 - GAP, h = bottom - top;
    const n = Math.max(1, Math.round((h + GAP) / (DASH + GAP))), gap = n > 1 ? (h - n * DASH) / (n - 1) : 0;
    Object.assign(line.style, { top: top + 'px', height: h + 'px', backgroundSize: `2px ${DASH + gap}px`, '--dash': DASH + 'px' });
  });
}
document.fonts.ready.then(() => dashes());

document.addEventListener('click', e => {
  /* a tool stack opens to every call (the last five show when closed), then the turn's line is re-fitted */
  const h = e.target.closest('.t3-d .d-gh');
  if (h) { h.parentElement.toggleAttribute('data-open'); requestAnimationFrame(() => dashes()); return; }
  /* the panel's icon tabs switch its views */
  const t = e.target.closest('.t3-d:not(.dp-w) .hy-tab'), p = t && t.closest('.hy-panel');
  if (!p) return;
  p.querySelectorAll('.hy-tab').forEach(x => x.setAttribute('aria-selected', String(x === t)));
  p.querySelectorAll('.hy-views > [data-tab]').forEach(v => { v.hidden = v.dataset.tab !== t.title; });
});
