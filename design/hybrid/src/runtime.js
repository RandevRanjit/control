/* ==================================================================
   BLOOM RUNTIME. One clock for the whole page; theme / type / motion
   switches; ?shot= isolation; lamps, chains, rows, stair helpers.
   Sections talk to the page ONLY through window.Bloom.
   ================================================================== */
(() => {
'use strict';
const html = document.documentElement;
const Q = new URLSearchParams(location.search);
const T = 7000, T2 = 14000;
const D = { tap: 109.375, quick: 218.75, state: 437.5, scene: 875, beat: 1750, breath: 3500 };
const E = { sine: 'cubic-bezier(.37,0,.63,1)', out: 'cubic-bezier(.61,1,.88,1)', in: 'cubic-bezier(.12,0,.39,0)', settle: 'cubic-bezier(.25,1,.5,1)', linear: 'linear' };
const ORDER = ['masthead', 'shell', 'groups', 'states', 'picks'];
const tl = document.timeline;
const emit = (name, detail) => document.dispatchEvent(new CustomEvent('bloom:' + name, { detail }));
const store = (k, v) => { try { const s = JSON.parse(localStorage.getItem('bloom2') || '{}'); s[k] = v; localStorage.setItem('bloom2', JSON.stringify(s)); } catch (e) { /* private window: no memory, no harm */ } };   // 'bloom2': v1's stored Night must not override the new Field default
const reduced = () => html.dataset.motion === 'reduce';

/* ---------------- the clock ----------------
   Every infinite animation on the page shares one startTime (the epoch), so every loop is phase-locked:
   a lamp that appears late lands exactly in step. t() is the clock in ms; loops repeat every 14 s at most. */
let epoch = 0, rate = 1, paused = false, held = 0, raf = 0, syncQueued = false, lastReadout = -1;
const heldOneShots = new Set();
const t = () => paused ? held : (tl.currentTime - epoch) * rate;
const sections = [];
const isOff = el => { const s = el && el.closest ? el.closest('.bl-sec') : null; return !!(s && s.dataset.off === '1'); };

function sync() {
  syncQueued = false;
  const now = t();
  for (const a of document.getAnimations()) {
    const fx = a.effect;
    if (!fx) continue;
    if (a.playbackRate !== rate) a.playbackRate = rate;
    if (fx.getTiming().iterations !== Infinity) {          // one-shots: only follow pause / play
      if (paused && a.playState === 'running') {
        if (a instanceof CSSTransition) a.finish();          // a style change while paused lands at its end, like animate()
        else { a.pause(); heldOneShots.add(a); }
      }
      else if (!paused && heldOneShots.has(a)) { heldOneShots.delete(a); a.play(); }
      continue;
    }
    if (paused || isOff(fx.target)) {
      if (a.playState !== 'paused') a.pause();
      if (a.currentTime !== now) a.currentTime = now;
    } else if (a.startTime !== epoch || a.playState !== 'running') {
      a.startTime = epoch;                                   // resolves a paused animation too
    }
  }
}
const queueSync = () => { if (!syncQueued) { syncQueued = true; requestAnimationFrame(sync); } };

function frame() {
  raf = 0;
  const now = t();
  for (const s of sections) if (s.on && s.api.tick) { try { s.api.tick(now, s.el); } catch (e) { console.error('[bloom]', s.id, e); } }
  readout(now);
  if (!paused) raf = requestAnimationFrame(frame);
}
function readout(now) {
  const el = document.querySelector('.bl-clock');
  if (!el) return;
  const tenth = Math.floor((now % T2) / 100);
  if (tenth === lastReadout) return;
  lastReadout = tenth;
  el.textContent = 't ' + ((now % T2) / 1000).toFixed(2).padStart(5, '0') + ' s';
}
function play() {
  if (!paused) return;
  epoch = tl.currentTime - held / rate; paused = false; sync();
  if (!raf) raf = requestAnimationFrame(frame);
  emit('clock', { paused, rate });
}
function pause() {
  if (paused) return;
  held = t(); paused = true; sync(); frame();
  emit('clock', { paused, rate });
}
function seek(ms) {
  held = Math.max(0, ms); paused = true; sync(); frame();
  emit('clock', { paused, rate, t: held });
}
function setRate(r) {
  const now = t(); rate = r;
  if (!paused) epoch = tl.currentTime - now / r;
  sync(); emit('clock', { paused, rate });
}
const after = (ms, fn) => setTimeout(fn, ms / rate);
function animate(el, kf, opts) {                          // WAAPI one-shot that follows the page's rate and pause
  const a = el.animate(kf, opts);
  a.playbackRate = rate;
  if (paused) { a.finish(); }                              // a frozen page shows end states, never mid-sweeps
  return a;
}

/* ---------------- theme, type, motion ---------------- */
/* Ledger rule 4: a click only sets the target; one runner owns the scrim and, at the swap, applies the LATEST target.
   It never reads data-theme to decide whether to switch: `shown` is what it last committed. */
let themeTarget = null, themeRun = null, shown = null;
function setTheme(next, x = innerWidth / 2, y = 0) {   // motion.md §4.6: lightness moves one way, through one bridge
  if (shown === null) shown = html.dataset.theme;
  themeTarget = next; markSegs();
  if (paused) { themeTarget = null; if (next !== shown) { shown = next; html.dataset.theme = next; themed(next); } return Promise.resolve(); }
  if (!themeRun) themeRun = runTheme(x, y).finally(() => { themeRun = null; themeTarget = null; markSegs(); });
  return themeRun;
}
async function runTheme(x, y) {
  while (themeTarget !== null && themeTarget !== shown) {
    const toward = themeTarget;
    const s = document.createElement('div');
    s.className = 'scrim';
    s.style.background = getComputedStyle(html).getPropertyValue(toward === 'field' ? '--cream' : '--navy');   // a literal, fixed before the swap
    s.style.setProperty('--x', x + 'px'); s.style.setProperty('--y', y + 'px');
    document.body.append(s);
    const R = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + 64, still = reduced();
    if (still) s.style.setProperty('--scrim-r', '99999px');
    await (still ? s.animate({ opacity: [0, .94] }, { duration: D.quick, easing: E.sine, fill: 'forwards' })
                 : s.animate({ '--scrim-r': ['0px', R + 'px'] }, { duration: D.state, easing: E.sine, fill: 'forwards' })).finished;
    const next = themeTarget;                        // retarget: whatever was clicked last wins
    if (next !== shown) { shown = next; html.dataset.theme = next; }
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));   // the new theme has painted under the scrim
    await s.animate({ opacity: [.94, 0] }, { duration: still ? D.quick : D.state, easing: E.sine, fill: 'forwards' }).finished;
    s.remove();
    themed(shown);
  }
}
function themed(next) {
  store('theme', next); markSegs();
  for (const s of sections) if (s.api.theme) { try { s.api.theme(next, s.el); } catch (e) { console.error('[bloom]', s.id, e); } }
  emit('theme', { theme: next });
}
function setType(next) {
  html.dataset.type = next; store('type', next);
  document.fonts.ready.then(placeSegs);
  emit('type', { type: next });
}
function setMotion(next) {
  html.dataset.motion = next;
  requestAnimationFrame(() => { sync(); placeSegs(); });
  emit('motion', { motion: next });
}

/* ---------------- lamps (motion.md §4.1) and state bars (BRIEF-2 §3-4) ----------------
   Lamp = motion and shape in ink. Bar = the state's colour. A state change plays both together. */
const STATES = ['needs', 'working', 'bg', 'done', 'failed', 'choose', 'house', 'outside', 'idle', 'gone'];
const FAMILY = { needs: 'red', failed: 'amber', done: 'green', working: 'blue', bg: 'blue', choose: 'lilac', house: 'quiet', outside: 'quiet', idle: 'quiet', gone: 'quiet' };
const darkJunction = (a, b) => (FAMILY[a] === 'red') !== (FAMILY[b] === 'red') && ['quiet', 'blue', 'lilac'].includes(FAMILY[a] === 'red' ? FAMILY[b] : FAMILY[a]);
const bridgeOf = (a, b) => darkJunction(a, b)
  ? 'var(--wine) 0 14%, var(--navy) 24% 38%'             /* the one dark junction: calm -> needs you */
  : 'var(--cream) 0 38%';                                /* every other change passes through cream */
const lamp = (st, o = {}) => `<span class="lamp st-${st}${o.still ? ' still' : ''}${o.cls ? ' ' + o.cls : ''}" data-st="${st}"${o.d ? ` style="--d:${o.d}px"` : ''} role="img" aria-label="${o.label || st}"><i></i></span>`;
/* o.form: 'full' (default, the one continuous head bar) | 'band' (continuous doc ornament) | bead bars: 'compact' (rows),
   'tip' (three beads), 'beads' (doc showcases); o.k: phase 0..1; o.still; o.cls */
const bar = (st, o = {}) => `<span class="sbar${o.form && o.form !== 'full' ? ' ' + o.form : ''}${o.still ? ' still' : ''}${o.cls ? ' ' + o.cls : ''}" data-st="${st}"${o.k ? ` style="--k:${o.k}"` : ''} aria-hidden="true"></span>`;
function setBar(el, next) {                              // the old ramp is wiped off by its bridge; the new one is flowing underneath
  const prev = el.dataset.st;
  if (prev === next) return;
  el.querySelectorAll(':scope > .sb-old').forEach(x => x.remove());   // a retarget replaces the wipe in flight
  el.dataset.st = next;
  preempt(el.closest('[data-region]'));
  queueSync();
  if (paused) return;
  const s = document.createElement('b');
  s.className = 'sb-old'; s.dataset.st = prev; s.innerHTML = '<b><i></i></b>';
  if (darkJunction(prev, next)) s.style.setProperty('--sb-bridge', 'linear-gradient(to right, var(--navy) 0 45%, var(--wine) 55%)');
  el.append(s);
  if (reduced()) { animate(s, { opacity: [1, 0] }, { duration: D.quick, easing: E.sine, fill: 'forwards' }).finished.then(() => s.remove()); return; }
  const d = next === 'needs' ? D.quick : D.state, o = { duration: d, easing: E.sine, fill: 'forwards' };
  animate(s, { transform: ['translateX(0)', 'translateX(100%)'] }, o);
  animate(s.firstElementChild, { transform: ['translateX(0)', 'translateX(-100%)'] }, o).finished.then(() => s.remove());
}
function setState(el, next) {                            // a row (or any box): every lamp and bar inside it, together
  const lamps = el.matches('.lamp') ? [el] : [...el.querySelectorAll('.lamp')];
  const bars = el.matches('.sbar') ? [el] : [...el.querySelectorAll('.sbar')];
  lamps.forEach(l => setLamp(l, next, true));
  bars.forEach(b => setBar(b, next));
  if (el.classList.contains('session-row')) el.dataset.st = next;
}
/* Sample data for every session the mocks name (BRIEF-2 §4): the context it holds (share of the window) and the tokens
   this chat has spent. Consistent wherever a session appears; 138K is inventory's own figure (choose on return). */
const SAMPLE = {
  'STATISTICS': [.48, '64k'], 'LINEAR_ALGEBRA': [.31, '41k'], 'SIGNALS_101': [.69, '138k'], 'ORBIT-WEBSITE': [.57, '96k'],
  'CONTROL': [.34, '58k'], 'PORTFOLIO-WEBSITE': [.22, '27k'], 'PORTFOLIO-SCROLL': [.69, '138k'], 'RELAY MAIN': [.12, '9k'],
  'INTERNSHIPS': [.18, '22k'], 'CV-BUILD': [.41, '53k'], 'ORBIT-1-MARKET': [.26, '31k'], 'GT-LAYER-RETIRE': [.44, '72k'],
  'CTRL-MULTIPLEXER-IMPL': [.52, '83k'], 'DEPS-AUDIT': [.15, '18k'],
};
function sample(name) {
  if (SAMPLE[name]) return { ctx: SAMPLE[name][0], tok: SAMPLE[name][1] };
  let h = 7; for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) % 9973;     // unknown names: stable invented values
  return { ctx: .12 + (h % 60) / 100, tok: (8 + h % 90) + 'k' };
}
/* Usage (5H, 7D) and context: a thin plain-ink line on a quiet track. o.w: any CSS width (default 120 px); o.ctx: the row's
   32 px context line, which never breathes. Past 80 % a usage line's leading end breathes. */
const usageLine = (v, o = {}) => `<span class="use-line${o.ctx ? ' ctx' : ''}${o.kind ? ' u' + o.kind : ''}${!o.ctx && v >= .8 ? ' hot' : ''}${o.still ? ' still' : ''}${o.cls ? ' ' + o.cls : ''}" style="--v:${v}${o.w ? ';--use-w:' + o.w : ''}" role="img" aria-label="${o.label || Math.round(v * 100) + ' %'}"><i></i></span>`;
const ctx = (v, o = {}) => `<span class="sr-ctx">${usageLine(v, { ctx: true, label: 'context ' + Math.round(v * 100) + ' %', ...o })}<b>${Math.round(v * 100)}%</b></span>`;
/* A session row (BRIEF-2 §4, lib.css §13). o: {st, name, nameHTML, sub, right, age, sel, ind, cls, attrs, lamp, bar, spark, meta, ctx, tok, extra}
   sub: the state words without "claude" (the spark stands for Claude); right: chips, shown on line 2 after the state words;
   bar: false for none, or options for Bloom.bar; spark: false for a non-Claude session (outside); meta: false hides the
   context line and tokens (outside does by default); extra: HTML appended inside the row (markers, overlays). */
/* Line 2 keeps a branch and a worktree apart: a session on a plain branch shows the branch glyph and its name; a session
   with worktrees shows how many (its child .wt-row rows name each one), never a branch. Worktree counts: inventory §1.2. */
const WT = { 'ORBIT-WEBSITE': 2, 'CONTROL': 1 }, BRANCHES = ['main', 'master'];
function subHTML(o) {
  const w = (o.sub || '').split(' · '), last = w[w.length - 1];
  if (w.length > 1 && BRANCHES.includes(last)) return w.slice(0, -1).join(' · ') + ` · <span class="sr-br">${gi('branch')}${last}</span>`;
  const n = o.wt !== undefined ? o.wt : WT[o.name];
  if (n) return (o.sub ? o.sub + ' · ' : '') + `<span class="sr-wtn" title="${n} worktree${n > 1 ? 's' : ''}" aria-label="${n} worktree${n > 1 ? 's' : ''}">${gi('wt')}${n}</span>`;   // glyph + count: line 2 is dense, the child rows name each worktree
  return o.sub || '';
}
function row(o) {
  const st = o.st, s = sample(o.name), spark = o.spark !== undefined ? o.spark : st !== 'outside', meta = o.meta !== undefined ? o.meta : st !== 'outside';
  return `<div class="session-row${o.cls ? ' ' + o.cls : ''}" data-st="${st}" aria-selected="${!!o.sel}"${o.ind !== undefined ? ` style="--indent:${o.ind}px"` : ''}${o.attrs ? ' ' + o.attrs : ''}>`
    + lamp(st, o.lamp || {}) + (o.bar === false ? '' : bar(st, { form: 'compact', ...(o.bar || {}) }))
    + (o.nameHTML || `<span class="sr-name">${o.name}</span>`) + `<span class="sr-right">${o.right || ''}</span>`
    + (spark ? gi('spark', 'sr-spark') : '') + `<span class="sr-sub">${subHTML(o)}</span>`
    + `<span class="sr-meta">${meta ? ctx(o.ctx !== undefined ? o.ctx : s.ctx) + `<span class="sr-tok" title="tokens this chat">${o.tok || s.tok}</span>` : ''}<span class="sr-age">${o.age || ''}</span></span>${o.extra || ''}</div>`;
}
const pearl = (o = {}) => o.n !== undefined
  ? `<span class="pearl count"${o.p ? ` style="--p:${o.p}px"` : ''}${o.label ? ` aria-label="${o.label}"` : ''}>${o.n}</span>`
  : `<span class="pearl${o.cls ? ' ' + o.cls : ''}"${o.tint ? ` data-tint="${o.tint}"` : ''}${o.st ? ` data-st="${o.st}"` : ''}${o.p ? ` style="--p:${o.p}px"` : ''} role="img" aria-label="${o.label || o.tint || o.st || 'pearl'}"></span>`;
const tally = (states, o = {}) => `<span class="tally" role="img" aria-label="${o.label || states.join(', ')}">${states.map(st => `<span class="pearl" data-st="${st}"></span>`).join('')}</span>`;
function arrive(el) {                                    // needs-you, once: a wide bloom, then the beat carries on
  if (reduced() || paused) return;
  const b = document.createElement('b'); b.className = 'bloom'; el.append(b);
  animate(b, [{ transform: 'scale(1)', opacity: .6 }, { transform: 'scale(2.8)', opacity: 0 }], { duration: D.scene, easing: E.out, fill: 'forwards' })
    .finished.then(() => b.remove());
}
function setLamp(el, next, lampOnly) {                    // old callers: a lamp inside a .session-row also drives that row's bars
  const prev = el.dataset.st;
  if (prev === next) return;
  const body = el.firstElementChild, from = getComputedStyle(el).getPropertyValue('--c').trim();
  el.classList.replace('st-' + prev, 'st-' + next);
  el.dataset.st = next;
  const row = el.closest('.session-row');
  if (row) { row.dataset.st = next; if (!lampOnly) row.querySelectorAll('.sbar').forEach(b => setBar(b, next)); }
  preempt(el.closest('[data-region]'));
  queueSync();
  body.querySelectorAll('.sweep').forEach(x => x.remove());          // a retarget replaces the sweep in flight
  if (next !== 'needs') el.querySelectorAll(':scope > .bloom').forEach(x => x.remove());
  if (paused) return;
  if (reduced()) { animate(body, { opacity: [.35, 1] }, { duration: D.quick, easing: E.sine }); return; }
  const d = next === 'needs' ? D.quick : D.state;
  const s = document.createElement('b'); s.className = 'sweep';
  s.style.background = `linear-gradient(to top, var(--lamp-bridge) 0 38%, ${from} 62% 100%)`;   /* lamps bridge in ink; the bar carries the colour bridge */
  body.append(s);
  animate(s, [{ transform: 'translateY(66.667%)' }, { transform: 'none' }], { duration: d / 2, easing: E.sine })
    .finished.then(() => animate(s, { opacity: [1, 0] }, { duration: d / 2, easing: E.sine, fill: 'forwards' }).finished)
    .then(() => s.remove());
  if (next === 'needs') after(d, () => { if (el.dataset.st === 'needs') arrive(el); });
  if (next === 'done') animate(el, { scale: [.92, 1] }, { duration: D.scene, easing: E.out });
  if (next === 'gone') animate(body, { opacity: [1, .35] }, { duration: D.scene, easing: E.sine });
}
/* Pre-emption (colour.md §4.2): while a needs-you is lit in a region, every hero ramp in it becomes the safe ramp. */
function preempt(region) {
  const regions = region ? [region] : document.querySelectorAll('[data-region]');
  for (const r of regions) r.toggleAttribute('data-preempt', !!r.querySelector('.lamp.st-needs, .sbar[data-st="needs"]'));
}

/* ---------------- chains, wave, ring ---------------- */
function chainState(n, v) { const f = v * n, i = Math.floor(f); return { edge: f > i && i < n ? i : -1, hot: v >= .8 }; }
/* '5h' / '7d': the usage line, as wide as the old chain of n beads (o.w overrides); 'progress': beads, as before */
function chainHTML(n, v, kind = '5h', o = {}) {
  if (kind !== 'progress') return usageLine(v, { kind, w: n * 10 - 3 + 'px', ...o });
  const { edge } = chainState(n, v);
  let beads = '';
  for (let i = 0; i < n; i++) beads += `<i style="--i:${i}"${i === edge ? ' class="edge"' : ''}></i>`;
  return `<span class="bead-chain progress${o.still ? ' still' : ''}" style="--n:${n};--v:${v}" role="img" aria-label="${o.label || Math.round(v * 100) + ' %'}">${beads}</span>`;
}
function setChain(el, v) {                               // a usage line or a progress chain
  el.style.setProperty('--v', v);
  el.setAttribute('aria-label', Math.round(v * 100) + ' %');
  if (el.classList.contains('use-line')) { el.classList.toggle('hot', v >= .8 && !el.classList.contains('ctx')); return; }
  const n = el.children.length, { edge } = chainState(n, v);
  [...el.children].forEach((b, i) => b.classList.toggle('edge', i === edge));
}
function wave(n, o = {}) {
  const m = Math.min(n, 7);
  let beads = '';
  for (let i = 0; i < m; i++) beads += `<i style="--i:${i}"></i>`;
  return `<span class="bead-wave${o.still ? ' still' : ''}" style="--n:${m}" role="img" aria-label="${n} background tasks">${beads}${n > 7 ? `<em>+${n - 7}</em>` : ''}</span>`;
}
function ringStill(p) {                                    // the r-hue keyframe colour at progress p (0..1)
  const k = [[.14, 'a'], [.29, 'b'], [.44, 'b'], [.54, 'a'], [.64, 'a'], [.79, 'c'], [.94, 'c'], [1.01, 'a']];
  return 'var(--rs-' + k.find(([lim]) => p < lim)[1] + ')';
}
function ring(o = {}) {
  let beads = '';
  for (let i = 0; i < 15; i++) beads += `<i style="--i:${i};--still:${ringStill(((15 - i) % 15) / 15)}"></i>`;
  return `<span class="bead-ring${o.still ? ' still' : ''}" style="${o.r ? `--r:${o.r}px;` : ''}${o.b ? `--b:${o.b}px` : ''}" role="img" aria-label="waiting">${beads}</span>`;
}

/* ---------------- segmented controls ---------------- */
const segs = new Set();
function placeSeg(el) {
  const on = el.querySelector('button[aria-pressed="true"]'), pill = el.querySelector('.seg-pill');
  if (!on || !pill) return;
  pill.style.setProperty('--x', on.offsetLeft + 'px');
  pill.style.setProperty('--w', on.offsetWidth + 'px');
}
const placeSegs = () => segs.forEach(placeSeg);
function seg(el, onChange) {
  if (!el.querySelector('.seg-pill')) el.insertAdjacentHTML('beforeend', '<i class="seg-pill" aria-hidden="true"></i>');
  segs.add(el);
  el.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || !el.contains(b) || b.getAttribute('aria-pressed') === 'true') return;
    el.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    placeSeg(el);
    onChange && onChange(b.dataset.v || b.textContent.trim(), b);
  });
  placeSeg(el);
  return el;
}
function markSegs() {
  document.querySelectorAll('.seg[data-bind="theme"], .seg[data-bind="type"]').forEach(el => {
    const v = el.dataset.bind === 'theme' && themeTarget ? themeTarget : html.dataset[el.dataset.bind];
    el.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
    placeSeg(el);
  });
}

/* ---------------- one-shots: notes, rows, panels (motion.md §4.3-4.4, §6.2) ---------------- */
const sunk = new WeakMap();                              // sink holds its end pose; the next rise lets go of it
const rise = el => { const s = sunk.get(el); if (s) { s.cancel(); sunk.delete(el); }
  return animate(el, reduced() ? { opacity: [0, 1] } : { transform: ['translateY(12px)', 'none'], opacity: [0, 1] }, { duration: D.quick, easing: reduced() ? E.sine : E.settle }); };
const sink = el => { const a = animate(el, reduced() ? { opacity: [1, 0] } : { transform: ['none', 'translateY(12px)'], opacity: [1, 0] }, { duration: D.tap, easing: E.in, fill: 'forwards' });
  sunk.set(el, a); return a.finished; };
function enterRow(w) {          // w = <div class="rw" style="display:grid;grid-template-rows:1fr"><div style="min-height:0;overflow:hidden">row</div></div>
  if (reduced()) return animate(w, { opacity: [0, 1] }, { duration: D.quick, easing: E.sine });
  animate(w, { gridTemplateRows: ['0fr', '1fr'], opacity: [0, 1] }, { duration: D.state, easing: E.out });
  const l = w.querySelector('.lamp'); if (l) animate(l, { scale: [.4, 1] }, { duration: D.state, easing: E.sine });
}
function leaveRow(w) {
  const k = reduced() ? { opacity: [1, 0] } : { gridTemplateRows: ['1fr', '0fr'], opacity: [1, 0] };
  return animate(w, k, { duration: D.quick, easing: reduced() ? E.sine : E.in, fill: 'forwards' }).finished.then(() => w.remove());
}
function resort(list, apply) {   // FLIP: lay out once, then let moved rows travel back to it
  const rows = [...list.children], top = new Map(rows.map(r => [r, r.getBoundingClientRect().top]));
  apply();
  if (reduced() || paused) return;
  for (const r of rows) { const dy = top.get(r) - r.getBoundingClientRect().top; if (dy) animate(r, { transform: [`translateY(${dy}px)`, 'none'] }, { duration: D.state, easing: E.sine }); }
}
const openPanel = p => animate(p, reduced() ? { opacity: [0, 1] } : { transform: ['translateX(24px)', 'none'], opacity: [0, 1] }, { duration: D.quick, easing: reduced() ? E.sine : E.settle });

/* ---------------- the stair (inventory §5), softened: round caps and joins ---------------- */
function stairPts(x0, y0, { t, r, a, f }) {
  return [[x0, y0 + 2 * r + f], [x0, y0 + 2 * r], [x0 + t, y0 + 2 * r], [x0 + t, y0 + r], [x0 + 2 * t, y0 + r], [x0 + 2 * t, y0],
    [x0 + 2 * t + a, y0], [x0 + 2 * t + a, y0 + r], [x0 + 3 * t + a, y0 + r], [x0 + 3 * t + a, y0 + 2 * r], [x0 + 4 * t + a, y0 + 2 * r], [x0 + 4 * t + a, y0 + 2 * r + f]];
}
function stairSVG(g, sw, o = {}) {
  const w = 4 * g.t + g.a + sw, h = 2 * g.r + g.f + sw, pts = stairPts(sw / 2, sw / 2, g).map(p => p.join(',')).join(' ');
  const tag = o.shut ? 'polygon' : 'polyline';
  return `<svg class="${o.cls || ''}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${o.label || 'CONTROL'}"><${tag} points="${pts}" fill="none" style="stroke:${o.paint || 'currentColor'}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
function stairBeads(g, pitch, o = {}) {  // bead centres at equal arc length along the stair; s = arc fraction 0..1. o.shut adds the floor (lock).
  const P = stairPts(0, 0, g), seg = [];
  if (o.shut) P.push(P[0]);
  let L = 0;
  for (let i = 1; i < P.length; i++) { const l = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); seg.push([P[i - 1], P[i], L, l]); L += l; }
  const n = Math.round(L / pitch), out = [];
  for (let k = 0; k <= (o.shut ? n - 1 : n); k++) {          // a closed ring does not repeat its first bead
    const d = k * L / n, [p0, p1, s0, l] = seg.find(([, , s0, l]) => d <= s0 + l + 1e-9);
    const u = l ? (d - s0) / l : 0;
    out.push({ x: p0[0] + (p1[0] - p0[0]) * u, y: p0[1] + (p1[1] - p0[1]) * u, s: d / L });
  }
  return { beads: out, w: 4 * g.t + g.a, h: 2 * g.r + g.f, length: L };
}

/* ---------------- small helpers ---------------- */
const gi = (name, cls = '') => `<svg class="gi ${cls}" aria-hidden="true"><use href="#g-${name}"/></svg>`;
const token = (name, el = html) => getComputedStyle(el).getPropertyValue('--' + name).trim();
const scalers = new Set();
let ro = null;
function fit(root = document) {
  root.querySelectorAll('.bl-scale').forEach(el => {
    if (!scalers.has(el)) { scalers.add(el); if (ro) ro.observe(el); }
    const w = +el.dataset.w, h = +el.dataset.h, s = Math.min(1, el.clientWidth / w), c = el.firstElementChild;
    if (!c || !w) return;
    c.style.transform = `scale(${s})`;
    el.style.height = Math.ceil(h * s) + 'px';
  });
}
function section(id, api) { sections.push({ id, api, el: null, on: true }); }

/* ---------------- start ---------------- */
function wireNav() {
  const nav = document.querySelector('.bl-nav');
  if (!nav) return;
  nav.querySelectorAll('.seg').forEach(el => seg(el, (v, b) => {
    if (el.dataset.bind === 'theme') { const r = b.getBoundingClientRect(); setTheme(v, r.left + r.width / 2, r.top + r.height / 2); }
    if (el.dataset.bind === 'type') setType(v);
    if (el.dataset.bind === 'rate') setRate(+v);
  }));
  markSegs();
  const pp = nav.querySelector('[data-act="play"]');
  const paint = () => { if (pp) { pp.setAttribute('aria-pressed', String(!paused)); pp.innerHTML = gi(paused ? 'play' : 'pause') + (paused ? 'Play' : 'Pause'); } };
  if (pp) pp.addEventListener('click', () => { paused ? play() : pause(); });
  document.addEventListener('bloom:clock', paint); paint();
  const still = nav.querySelector('[data-act="still"]');
  if (still) {
    const p = () => still.setAttribute('aria-checked', String(reduced()));
    still.addEventListener('click', () => { setMotion(reduced() ? 'full' : 'reduce'); p(); });
    p();
  }
  const links = [...nav.querySelectorAll('.bl-links a')];
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    links.forEach(a => a.setAttribute('aria-current', String(a.hash === '#' + e.target.id)));
  }), { rootMargin: '-45% 0px -50% 0px' });
  document.querySelectorAll('.bl-sec').forEach(s => io.observe(s));
}
function fillSteps() {
  document.querySelectorAll('.bl-sec').forEach(sec => {
    const k = ORDER.indexOf(sec.id), el = sec.querySelector('.bl-steps');
    if (el) el.innerHTML = ORDER.map((_, i) => `<i class="${i === k ? 'on' : ''}"></i>`).join('');
  });
}
function observeSections() {
  const io = new IntersectionObserver(es => es.forEach(e => {
    e.target.dataset.off = e.isIntersecting ? '0' : '1';
    const s = sections.find(x => x.el === e.target); if (s) s.on = e.isIntersecting;
  }), { rootMargin: '25% 0px 25% 0px' });
  document.querySelectorAll('.bl-sec').forEach(s => io.observe(s));
}
function shotMode(id, fig) {
  document.body.classList.add('shot');
  const sec = document.getElementById(id);
  if (!sec) return;
  document.querySelectorAll('.bl-sec').forEach(s => { if (s !== sec) s.classList.add('bl-shot-hide'); });
  const f = fig && sec.querySelector(`[data-fig="${fig}"]`);
  if (f) for (let n = f; n && n !== sec; n = n.parentElement)
    for (const sib of n.parentElement.children) if (sib !== n && !/^(STYLE|SCRIPT)$/.test(sib.tagName)) sib.classList.add('bl-shot-hide');
  sections.forEach(s => { s.on = s.el === sec; });
}
function start() {
  ro = new ResizeObserver(() => { fit(); placeSegs(); });
  wireNav();
  fillSteps();
  for (const s of sections) {
    s.el = document.getElementById(s.id);
    if (!s.el) { console.warn('[bloom] no section element for', s.id); continue; }
    try { s.api.init && s.api.init(s.el); } catch (e) { console.error('[bloom]', s.id, e); }
  }
  fit(); preempt();
  const shot = Q.get('shot');
  if (shot) shotMode(shot, Q.get('fig')); else observeSections();
  new MutationObserver(queueSync).observe(document.body, { subtree: true, childList: true, attributes: true,
    attributeFilter: ['class', 'data-st', 'data-off', 'data-preempt', 'aria-pressed', 'aria-checked', 'aria-selected', 'hidden'] });
  document.fonts.ready.then(() => { placeSegs(); fit(); });
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', e => { if (!Q.get('motion')) setMotion(e.matches ? 'reduce' : 'full'); });
  const q = Q.get('t');
  sync(); raf = requestAnimationFrame(frame);
  // ?t= freezes the clock after the first painted frames: a flowing layer frozen before it ever paints can drop out
  // under a bead mask in mobile Chrome (the beads show only their track)
  if (q !== null) requestAnimationFrame(() => requestAnimationFrame(() => seek(+q)));
}

window.Bloom = {
  T, T2, D, E, ORDER, reel: window.BLOOM_REEL || null,
  t, reduced, paused: () => paused, rate: () => rate, play, pause, seek, setRate, sync, after, animate,
  section, start, setTheme, setType, setMotion, emit,
  lamp, setLamp, arrive, preempt, bridgeOf, FAMILY, STATES, bar, setBar, setState, pearl, tally, row, sample, SAMPLE, ctx, usageLine,
  chainHTML, setChain, wave, ring, seg, placeSeg, rise, sink, enterRow, leaveRow, resort, openPanel,
  stairPts, stairSVG, stairBeads, gi, token, fit,
};
})();
