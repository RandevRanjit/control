/* ==================================================================
   HYBRID KIT. One dataset and the window pieces every section draws from, so each option shows the same chats.
   Bloom-side markup follows section 06 of design/bloom (parts/chat.html) class for class, renamed s-chat- -> hy-.
   T3-side markup follows T3 Code's web app at the fork point (apps/web/src), drawn in T3's palette (kit.css, .hy-t3).
   window.Hy is the only thing sections use.
   ================================================================== */
(() => {
'use strict';
const G = Bloom.gi, BAR = Bloom.bar;

/* ---------- the data: three groups (v2's Group entity), five folders, twelve chats ----------
   A group is user-named and holds chats from any folder; ORBIT holds a chat from the portfolio folder on purpose. */
const GROUPS = [
  { id: 'thesis', name: 'THESIS', tint: 'mint', home: '~/Documents/Thesis' },
  { id: 'orbit', name: 'ORBIT', tint: 'rose', home: '~/Projects/orbit-website' },
  { id: 'ctrl', name: 'CONTROL', tint: 'peri', home: '~/Projects/control' },
];
const PROJECTS = {
  thesis: { name: 'Thesis', path: '~/Documents/Thesis', mono: 'TH' },
  orbit: { name: 'orbit-website', path: '~/Projects/orbit-website', mono: 'OR' },
  port: { name: 'portfolio', path: '~/Projects/websites/portfolio', mono: 'PO' },
  ctrl: { name: 'control', path: '~/Projects/control', mono: 'CO' },
  relay: { name: 'relay', path: '~/Projects/relay', mono: 'RE' },
  scratch: { name: 'scratch', path: '~/.control/scratch', mono: '··' },
};
/* st: a Bloom state, plus 'intr' (interrupted: a turn cut by a crash or a quit). place: where T3 would file it. */
const CHATS = [
  { n: 'STATISTICS', title: 'Statistics week 6 notes', g: 'thesis', p: 'thesis', st: 'needs', sub: 'needs you', chip: 'BASH', age: '2m', diff: '' },
  { n: 'LINEAR_ALGEBRA', title: 'Linear algebra past paper', g: 'thesis', p: 'thesis', st: 'done', sub: 'done · main', age: '14m' },
  { n: 'SIGNALS_101', title: 'Signals problem set 4', g: 'thesis', p: 'thesis', st: 'intr', sub: 'interrupted · main', age: '3h' },
  { n: 'INTERNSHIPS', title: 'Internship applications', g: 'thesis', p: 'scratch', st: 'idle', sub: 'idle', age: '1d', place: 'snoozed', wake: 'Mon 09:00' },
  { n: 'ORBIT-WEBSITE', title: 'Release size in one place', g: 'orbit', p: 'orbit', st: 'working', sub: 'working', wt: 2, age: 'now', sel: true, diff: '+42 −13',
    wts: [['site-v2', '+38 −12', true], ['download-size', '+4 −1']] },
  { n: 'ORBIT-1-MARKET', title: 'Market the 1.0 launch', g: 'orbit', p: 'orbit', st: 'choose', sub: 'choose on return · main', age: '40m' },
  { n: 'PORTFOLIO-SCROLL', title: 'Fix the scroll jump in WebKit', g: 'orbit', p: 'port', st: 'failed', sub: 'failed · main', chip: 'EXIT 1', age: '2h' },
  { n: 'CONTROL', title: 'Groups entity: contracts', g: 'ctrl', p: 'ctrl', st: 'working', sub: 'working', wt: 1, age: '1m', diff: '+212 −40' },
  { n: 'DESIGN-EXPLORATION', title: 'T3 x Bloom hybrid', g: 'ctrl', p: 'ctrl', st: 'bg', sub: 'background · 2 agents', age: '4m' },
  { n: 'DEPS-AUDIT', title: 'Dependency audit', g: 'ctrl', p: 'ctrl', st: 'house', sub: 'dreaming', age: '9m' },
  { n: 'RELAY MAIN', title: 'Rep counter on the watch', g: null, p: 'relay', st: 'idle', sub: 'idle · main', age: '5h', pin: true },
  { n: 'CV-BUILD', title: 'CV build', g: null, p: 'scratch', st: 'outside', sub: 'lent to the CLI', age: '1h' },
];
const byGroup = id => CHATS.filter(c => c.g === id && c.place !== 'snoozed');
const loose = () => CHATS.filter(c => !c.g && c.place !== 'snoozed');
const snoozed = () => CHATS.filter(c => c.place === 'snoozed');
const pearl = (tint, p) => `<span class="pearl" data-tint="${tint}" style="--p:${p}px" aria-hidden="true"></span>`;

/* ---------- Bloom sidebar rows (section 06) ---------- */
function srow(c, ind, o = {}) {
  const chips = (c.chip ? `<span class="chip${c.st === 'needs' ? ' on-needs' : ''}">${c.chip}</span>` : '')
    + (o.proj ? `<span class="chip mark hy-pj">${PROJECTS[c.p].name}</span>` : '')
    + (c.pin ? `<span class="hy-pinned" title="pinned">${G('pin')}</span>` : '')
    + (c.place === 'snoozed' ? `<span class="chip mark">${c.wake}</span>` : '');
  return Bloom.row({ st: c.st, name: c.n, sub: c.sub, age: c.age, sel: !!c.sel && !o.nosel, ind, wt: c.wt || 0, right: chips })
    + (o.wts === false ? '' : (c.wts || []).map(([n, d, sel]) => `<div class="wt-row" aria-selected="${!!sel && !o.nosel}" style="--indent:${ind}px">${G('wt')}${n}<span class="st">${d}</span></div>`).join(''));
}
const grow = (g, n, o = {}) => `<div class="group-row hy-gr">${pearl(g.tint, 12)}<span class="hy-gn">${g.name}</span>${o.home ? `<span class="hy-home">${o.home}</span>` : ''}<span class="n">${n}</span>${G(o.folded ? 'chev-r' : 'chev-d')}</div>`;
const projHead = (p, n) => `<div class="hy-ph">${G('folder')}<span>${PROJECTS[p].name}</span><span class="n">${n}</span></div>`;
const usage = () => `<div class="hy-use"><span class="hy-uk">5H</span><span class="hy-up">71%</span><span></span><span class="hy-ur">01:10</span>${Bloom.usageLine(.71, { kind: '5h', w: '100%', label: '5 hour usage 71 %' })}
    <span class="hy-uk">7D</span><span class="hy-up">22%</span><span></span><span class="hy-ur">Sun</span>${Bloom.usageLine(.22, { kind: '7d', w: '100%', label: '7 day usage 22 %' })}</div>`;
const archive = () => `<div class="hy-arh">${G('chev-r')}<span>Archive</span>${Bloom.pearl({ n: 412, p: 18, label: '412 in the archive' })}</div>`;
const folds = () => `<div class="hy-folds"><span class="hy-fold">${G('snooze')}Snoozed${Bloom.pearl({ n: snoozed().length })}</span><span class="hy-fold">Settled${Bloom.pearl({ n: 3 })}</span><span class="hy-fold">Archive${Bloom.pearl({ n: 412 })}</span></div>`;
const snoozeFold = () => `<div class="hy-arh hy-snz">${G('chev-r')}<span>Snoozed</span><span class="hy-soft">wakes Mon 09:00</span>${Bloom.pearl({ n: snoozed().length, p: 18, label: 'snoozed' })}</div>`;

/* mode: 'flat' groups > chats (Bloom's own sidebar; o.proj adds the folder chip) | 'tree' groups > folders > chats | 'switch' one group at a time */
function bloomSide(o = {}) {
  const mode = o.mode || 'flat';
  let list = '';
  if (mode === 'switch') {
    const g = GROUPS.find(x => x.id === (o.group || 'orbit'));
    list = `<div class="hy-sw">${GROUPS.map(x => `<span class="hy-swi${x === g ? ' hy-on' : ''}">${pearl(x.tint, x === g ? 14 : 12)}<span>${x.name}</span>${Bloom.tally(byGroup(x.id).map(c => c.st === 'intr' ? 'idle' : c.st))}</span>`).join('')}<span class="hy-swi hy-all">All</span></div>`
      + `<div class="hy-swh"><span class="hy-gn">${g.name}</span><span class="hy-home">${g.home}</span></div>`
      + byGroup(g.id).map(c => srow(c, 14, { proj: true })).join('');
  } else {
    for (const g of GROUPS) {
      const rows = byGroup(g.id);
      list += grow(g, rows.length);
      if (mode === 'tree') {
        for (const p of [...new Set(rows.map(c => c.p))]) {
          const pr = rows.filter(c => c.p === p);
          list += projHead(p, pr.length) + pr.map(c => srow(c, 34)).join('');
        }
      } else list += rows.map(c => srow(c, 24, { proj: !!o.proj })).join('');
    }
    list += `<div class="hy-gap"></div><div class="hy-lh">Loose</div>` + loose().map(c => srow(c, 14, { proj: !!o.proj })).join('');
  }
  return `<aside class="hy-side">
  <div class="hy-top"><span class="lights"><i></i><i></i><i></i></span><span class="sp"></span><span class="hy-ib">${G('side')}</span></div>
  <div class="hy-sh"><span>Sessions</span><span class="sp"></span><span class="hy-ib">${G('find')}</span><span class="hy-ib">${G('plus')}</span></div>
  ${o.update ? `<div class="hy-upd">${G('spark')}<span>Claude <b class="t-num">2.1.295</b> is out</span><span class="pill sm">Update</span></div>` : ''}
  <div class="hy-list">${list}</div>${folds()}${usage()}
</aside>`;
}

/* ---------- the conversation (section 06's T13 and T14, finished turn shown at the reply) ---------- */
const PIN = '<span class="pearl xs hy-pin" aria-hidden="true"></span>';
const KIND = { read: 'READ', write: 'WRITE', agent: 'AGENT', error: 'ERROR', run: 'RUN' };
const dline = ([k, n, s, c]) => `<div class="hy-dl${k ? ' hy-' + k : ''}"><span class="hy-ln">${n}</span><span class="hy-sg">${s}</span><span>${c}</span></div>`;
const DIFF = {
  release: [['', 10, '', 'export const release = {'], ['', 11, '', '  version: "0.2.3",'], ['rem', 12, '−', '  size: <span class="hy-wr">"11.2 MB"</span>,'],
    ['add', 12, '+', '  <span class="hy-wa">bytes: 11_743_232</span>,'], ['add', 13, '+', '  size: <span class="hy-wa">formatSize(11_743_232)</span>,']],
  download: [['rem', 41, '−', '&lt;dd&gt;<span class="hy-wr">11.2 MB</span>&lt;/dd&gt;'], ['add', 41, '+', '&lt;dd&gt;<span class="hy-wa">{release.size}</span>&lt;/dd&gt;']],
};
const EV = [
  { k: 'read', p: 'lib/format.ts', m: '22 lines' },
  { k: 'agent', p: 'explore · 3 reads, no writes', bar: 'done' },
  { k: 'write', p: 'lib/release.ts', m: '+2 −1', body: `<div class="hy-diff">${DIFF.release.map(dline).join('')}</div>` },
  { k: 'write', p: 'app/download/page.tsx', m: '+1 −1', body: `<div class="hy-diff">${DIFF.download.map(dline).join('')}</div>` },
  { k: 'error', p: 'app/admin/page.tsx', m: 'Edit', body: '<div class="hy-note">String to replace not found in file.</div>' },
  { k: 'read', p: 'app/admin/page.tsx', m: '118 lines' },
  { k: 'write', p: 'app/admin/page.tsx', m: '+3 −1', fold: true },
  { k: 'run', p: 'bun run typecheck', m: 'no output', fold: true },
];
function card(e) {
  const open = !!e.body && !e.fold, meta = e.bar ? BAR(e.bar, { form: 'tip' }) : e.m;
  return `<div class="hy-cw"><div class="hy-cwi"><div class="hy-card" data-k="${e.k}"${open ? ' data-open' : ''}>${PIN}`
    + `<div class="hy-row"><span class="hy-k">${KIND[e.k]}</span><span class="hy-pt">${e.p}</span><span class="hy-m">${meta}</span>${e.body || e.fold ? G(open ? 'chev-d' : 'chev-r', 'hy-cv') : '<i></i>'}</div>`
    + (open ? `<div class="hy-body"><div class="hy-bi">${e.body}</div></div>` : '') + '</div></div></div>';
}
const folded = (n, q, meta) => `<div class="hy-turn hy-folded"><span class="hy-tp"><span class="pearl" style="--p:10px" aria-hidden="true"></span></span>`
  + `<div class="hy-card"><div class="hy-row hy-frow"><span class="hy-tn">${n}</span><span class="hy-pt">${q}</span><span class="hy-m">${meta}</span>${G('chev-r', 'hy-cv')}</div></div></div>`;
const live = st => st === 'working'
  ? `<span class="bead ramp-flow safe" style="--b:20px;--tile:1000%;--k:.35" aria-hidden="true"></span>` : '<span class="pearl" style="--p:14px" aria-hidden="true"></span>';
function convo() {
  return `<div class="hy-convo">
  ${folded('T12', 'tag v0.2.3 and attach the notarised DMG', '23:20 · 2m 10s · 4 reads · 1 write')}
  <div class="hy-turn"><span class="hy-tp"><span class="pearl" style="--p:14px" aria-hidden="true"></span></span><div class="hy-thread"></div>
    <p class="hy-q">/download says 11.2 MB but the DMG is 11.7</p><div class="hy-meta">T13 · 23:38 · 18s · reads only</div>
    <div class="hy-cards">${card({ k: 'read', p: '2 files', m: '', fold: true })}</div>
    <div class="hy-say">${PIN}The DMG grew in 0.2.3 and the label is a hand-typed string in two places. Neither page reads the file.</div></div>
  <div class="hy-turn"><span class="hy-tp hy-big">${live('working')}</span><div class="hy-thread"><i class="ramp-flow safe"></i></div>
    <p class="hy-q">put the release size in one place so /download and /admin can't drift</p>
    <div class="hy-meta">T14 · <b>running</b> · 23:41 · 41s · 3 writes · 1 error</div>
    <div class="hy-cards">${EV.map(card).join('')}</div>
    <div class="hy-say">${PIN}Both pages read <code>release.size</code> now. Checking <code>/download</code> on the dev server in tab 2.</div>
    <div class="hy-tail">${PIN}<span class="hy-k">…</span><span class="hy-pt">fetching localhost:3000/download</span><span class="hy-m">41s · ↓ 3.1k tokens</span></div></div>
</div>`;
}
/* the composer. o.t3: T3's controls (model, effort, mode, access, context meter) drawn in Bloom's material */
function composer(o = {}) {
  const ctl = o.t3
    ? `<span class="hy-pick">${G('spark')}Opus 5.5${G('chev-d')}</span><span class="hy-pick">High${G('chev-d')}</span><span class="hy-pick">Build${G('chev-d')}</span><span class="hy-pick">Full access${G('chev-d')}</span>`
    : `<span class="chip">⏵⏵ accept edits</span><span class="chip">opus 5.5</span>`;
  return `<div class="hy-comp">
  <div class="hy-draft">see the shot of button.cta on /download: still says 11.2 MB<i class="hy-caret"></i></div>
  <div class="hy-cbar">${ctl}<span class="sp"></span>${o.t3 ? `<span class="hy-ctxm">${Bloom.usageLine(.57, { ctx: true, label: 'context 57 %' })}<b>57%</b></span>` : ''}
    <span class="hy-stop"><span class="pill ghost sm">${G('stop')}Interrupt</span><span class="kbd">ESC</span></span><span class="pill sm" aria-label="Attach">${G('clip')}</span><span class="pill primary sm">${G('send')}Send</span></div>
</div>${o.t3 ? `<div class="hy-strip"><span>${G('folder')}Local</span><span class="hy-on">${G('wt')}New worktree</span><span class="sp"></span><span>${G('branch')}site-v2${G('chev-d')}</span></div>` : `<p class="hy-hint">${o.hint || 'Drafts stay drafts until you press Send.'}</p>`}`;
}
/* the head: o.bloom says only what the selected row doesn't (path + the one full bar); o.title is T3's title-first head in Bloom paint */
function head(o = {}) {
  const c = CHATS.find(x => x.sel);
  const who = o.title
    ? `<div class="hy-who hy-titled">${Bloom.lamp(c.st)}<span class="hy-tt">${c.title}</span><span class="chip mark">${PROJECTS[c.p].name}</span><span class="hy-br">${G('wt')}site-v2</span>${BAR(c.st)}</div>`
    : `<div class="hy-who hy-solo"><span class="hy-pth">${PROJECTS[c.p].path}</span>${BAR(c.st)}</div>`;
  const ctl = o.title
    ? `<span class="pill sm">${G('git')}Commit &amp; push</span><span class="pill sm">${G('term')}<span class="kbd">⌘J</span></span><span class="pill sm hy-on" aria-label="Panel">${G('panel')}</span>`
    : `${o.git ? `<span class="pill sm">${G('git')}Commit &amp; push <span class="hy-soft">· site-v2</span></span>` : ''}<span class="pill sm">${G('find')}<span class="kbd">⌘K</span></span><span class="pill sm hy-on" aria-label="Panel">${G('panel')}<span class="kbd">⌘⇧G</span></span>`;
  return `<div class="hy-head">${who}<span class="hy-ctl">${ctl}</span></div>`;
}

/* ---------- the right panel ---------- */
/* tabs: [[glyph, label, selected?]]; o.labels shows the selected tab's word beside its icon */
function tabs(list, o = {}) {
  return `<div class="hy-tabs" role="tablist">${list.map(([g, l, on]) => `<span class="hy-tab${o.labels && on ? '' : ' hy-ico'}" role="tab" aria-selected="${!!on}" title="${l}">${G(g)}${o.labels && on ? l : ''}</span>`).join('')}${o.plus ? `<span class="hy-tab hy-ico" title="New tab">${G('plus')}</span>` : ''}</div>`;
}
const FILES = [['M', 'lib/release.ts', '+2', '−1'], ['M', 'app/download/page.tsx', '+1', '−1'], ['A', 'app/admin/page.tsx', '+31', ''], ['M', 'docs/DESIGN.md', '+4', '−10']];
const diffView = () => `<div class="pane hy-v"><div class="hy-vh"><div class="seg sm"><button aria-pressed="false">Graph</button><button aria-pressed="true">Diff</button><button aria-pressed="false">PR</button></div><span class="sp"></span><span class="hy-soft">this turn · vs HEAD</span></div>
  <div class="hy-dsum"><span>4 files</span><span class="t-num hy-pn">+38</span><span class="t-num hy-mn">−12</span></div>
  ${FILES.map(([s, f, a, r]) => `<div class="hy-df"><span></span><span>${s}</span><span>${f}</span><span class="t-num"><span class="hy-pn">${a}</span> <span class="hy-mn">${r}</span></span></div>`).join('')}
  <div class="hy-diff hy-pd">${DIFF.release.map(dline).join('')}${DIFF.download.map(dline).join('')}</div></div>`;
const browserView = () => `<div class="pane hy-v"><div class="hy-vh">${G('chev-l')}${G('chev-r')}${G('reload')}<span class="input hy-url">localhost:3000/download</span><span class="hy-pk">${G('pick')}</span><span class="hy-pk">${G('shot')}</span></div>
  <div class="hy-site"><div class="hy-snav"><b>ORBIT</b><span>Features</span><span>Download</span><span>Changelog</span></div><h4 class="hy-sh1">Download ORBIT</h4>
  <p class="hy-sp">The arming layer for your DAW. One key, every track ready.</p><span class="hy-cta">Download for macOS · 11.7 MB</span></div></div>`;
function panel(o = {}) {
  const v = o.view || 'git';
  return `<div class="hy-panel">${tabs(o.tabs, o)}<div class="hy-views">${v === 'browser' ? browserView() : diffView()}</div></div>`;
}
const BLOOM_TABS = sel => [['out', 'Outputs'], ['files', 'Folder'], ['web', 'Browser'], ['git', 'Git'], ['term', 'Terminal']].map(([g, l]) => [g, l, l === sel]);

/* T3's terminal drawer (⌘J) under the conversation: the app's own shells, not Claude */
const drawer = () => `<div class="pane hy-drawer"><div class="hy-tmux"><span class="hy-tx" data-on><i>1</i>zsh</span><span class="hy-tx"><i>2</i>bun dev</span><span class="hy-ib">${G('plus')}</span><span class="sp"></span><span class="kbd">⌘J</span></div>
  <div class="hy-tty"><div><span class="hy-g">~/Projects/orbit-website</span> on <b>site-v2</b></div><div>$ bun run build</div><div><span class="hy-g">✓</span> compiled 41 routes in 3.2s</div><div><span class="hy-g">dist/</span>ORBIT-0.2.3.dmg  <b>11.7 MB</b></div><div>$ <i class="hy-bcur"></i></div></div></div>`;


/* ---------- T3's frame (S1 as it is, A in Bloom paint). Facts: apps/web/src at the fork point ---------- */
const T = (id, cls = '') => `<svg class="t3g ${cls}" aria-hidden="true"><use href="#t3-${id}"/></svg>`;
const FAV = { thesis: '--id-mint', orbit: '--id-rose', port: '--id-butter', ctrl: '--id-peri', relay: '--id-sage', scratch: '--id-lilac' };
const fav = p => `<span class="t3-fav" style="background:var(${FAV[p]})">${PROJECTS[p].mono}</span>`;
/* T3's live status slot (Sidebar.tsx 1293-1340): no icon animates; read-and-idle shows the age */
const T3ST = { needs: ['shieldq', 'Approval', 'warn'], working: ['cdash', 'Working', 'info'], choose: ['msgq', 'Input', 'indigo'], failed: ['calert', 'Failed', 'err'],
  done: ['ccheck', 'Done', 'ok'], bg: [null, 'Waiting', 'mfg'] };
const WORK_FOR = { 'ORBIT-WEBSITE': '41s', 'CONTROL': '3m 12s', 'DEPS-AUDIT': '' };
function t3status(c) {
  const s = T3ST[c.st];
  if (!s) return `<span class="t3-st">${c.age}</span>`;
  const [ic, label, col] = s;
  return `<span class="t3-st" style="color:var(--t3-${col})">${ic ? T(ic) : ''}${label}${c.st === 'working' && WORK_FOR[c.n] ? ' ' + WORK_FOR[c.n] : ''}</span>`;
}
const BRANCH = { 'ORBIT-WEBSITE': ['wt', 'site-v2'], 'CONTROL': ['wt', 'v2'] };
function t3line3(c, bloom) {
  const b = BRANCH[c.n];
  const where = c.p === 'scratch' ? `${T('laptop')}<span>Local</span>` : b ? `${T('folderg')}<span class="t3-brn">${b[1]}</span>` : `<span class="t3-brn">main</span>`;
  return `<div class="t3-l3">${where}${bloom ? `<span>· ${c.sub.replace(/ · main$/, '')}</span>` : ''}</div>`;
}
function t3card(c, bloom) {
  const right = bloom ? BAR(c.st, { form: 'compact' }) + Bloom.lamp(c.st) : t3status(c);
  return `<div class="t3-card"${c.sel ? ' data-act' : ''}${['working', 'bg'].includes(c.st) ? ' data-rec' : ''} data-st="${c.st}"><div class="t3-l1">${fav(c.p)}<span class="t3-pj">${PROJECTS[c.p].name}</span>${c.pin ? `<span class="t3-pinm">${T('pin')}</span>` : ''}${right}</div>`
    + `<div class="t3-ttl">${bloom ? c.n : c.title}</div>${t3line3(c, bloom)}</div>`;
}
const T3_ORDER = ['RELAY MAIN', 'ORBIT-WEBSITE', 'STATISTICS', 'CONTROL', 'ORBIT-1-MARKET', 'DESIGN-EXPLORATION', 'PORTFOLIO-SCROLL', 'LINEAR_ALGEBRA'];
function t3side(bloom) {
  const cards = T3_ORDER.map(n => t3card(CHATS.find(c => c.n === n), bloom)).join('');
  const snz = snoozed().map(c => `<div class="t3-slim">${fav(c.p)}<span class="t3-ttl">${bloom ? c.n : c.title}</span><span class="t3-wake">in 2d 14h</span></div>`).join('');
  return `<aside class="t3-side"><div class="t3-top"><span class="lights"><i></i><i></i><i></i></span><span class="t3-tg">${T('pleft')}</span>`
    + `<span class="t3-wm">${bloom ? 'CONTROL' : 'T3 <span>Code</span>'}</span></div>`
    + `<div class="t3-srch"><span class="t3-sf">${T('search')}Search</span><span class="t3-ib">${T('folder')}</span><span class="t3-ib">${T('folderplus')}</span><span class="t3-ib">${T('pen')}</span></div>`
    + `<div class="t3-list">${cards}<div class="t3-shh t3-snzh">Snoozed${T('chevd')}</div>${snz}<div class="t3-shh">Settled (3)${T('chevr')}</div></div>`
    + `<div class="t3-foot"><div class="t3-upd">${T('download')}<span>Claude 2.1.295 is available</span>${T('x')}</div><div class="t3-util"><span class="t3-ib">${T('settings')}</span><span class="t3-ib">${T('pr')}</span><span class="t3-ib">${T('chart')}</span></div></div></aside>`;
}
const wl = (ic, html, n, err) => `<div class="t3-wl"${err ? ' data-err' : ''}>${T(ic)}<span>${html}</span><span>${n || ''}</span></div>`;
const ad = d => `<span class="t3-n"><span class="t3-a">${d.split(' ')[0]}</span> <span class="t3-d">${d.split(' ')[1]}</span></span>`;
function t3main(bloom) {
  const c = CHATS.find(x => x.sel);
  const crumb = `${fav(c.p)}<span>${PROJECTS[c.p].name}</span><span>/</span>${bloom ? Bloom.lamp(c.st) : ''}<b>${bloom ? c.n : c.title}</b>${T('chevd')}`;
  const log = [wl('eye', 'Read <b>lib/format.ts</b>'), wl('bot', 'Subagent <b>explore</b> · every other place the size is typed', '14s'),
    wl('pen', `Edited <b>lib/release.ts</b> ${ad('+2 −1')}`), wl('pen', `Edited <b>app/download/page.tsx</b> ${ad('+1 −1')}`),
    wl('calert', 'Edit failed <b>app/admin/page.tsx</b> · string to replace not found', '', 1), wl('eye', 'Read <b>app/admin/page.tsx</b>'),
    wl('pen', `Edited <b>app/admin/page.tsx</b> ${ad('+3 −1')}`), wl('term', 'Ran <b>bun run typecheck</b>')].join('');
  const say = 'Both pages read <code>release.size</code> now. Checking <code>/download</code> on the dev server in tab 2.';
  return `<div class="t3-main"><div class="t3-head"><div class="t3-crumb">${crumb}</div><div class="t3-tools"><span class="t3-ib">${T('smenu')}</span><span class="t3-ib">${T('pbottom')}</span><span class="t3-ib" data-on>${T('pright')}</span></div></div>
  <div class="t3-canvas"><div class="t3-col">
    <div class="t3-ubub">/download says 11.2 MB but the DMG is 11.7</div>
    <div class="t3-fold">Worked for 18s${T('chevr')}<span>23:38</span></div>
    <div class="t3-prose">The DMG grew in 0.2.3 and the label is a hand-typed string in two places. Neither page reads the file.</div>
    <div class="t3-ubub">put the release size in one place so /download and /admin can't drift</div>
    <div class="t3-log">${log}</div>
    <div class="t3-prose">${say}</div>
    <div class="t3-working">${bloom ? BAR('working') : ''}Working for 41s</div>
  </div></div>
  <div class="t3-cwrap"><div class="t3-comp"><div class="t3-ed">see the shot of button.cta on /download: still says 11.2 MB</div>
    <div class="t3-cf"><div class="t3-cl"><span class="t3-ctl">${G('spark')}Claude Opus 5.5${T('chevd')}</span><span class="t3-sep"></span><span class="t3-ctl">${T('brain')}High${T('chevd')}</span><span class="t3-sep"></span><span class="t3-ctl">${T('lockopen')}Full access${T('chevd')}</span></div>
    <div class="t3-cr"><span class="t3-ib">${T('clip')}</span><span class="t3-send" title="Interrupt"><i></i></span></div></div></div>
    <div class="t3-strip"><span>${T('folder')}Local</span><span><b>${T('folderg')}New worktree</b></span><span>${T('branch')}site-v2${T('chevd')}</span></div></div></div>`;
}
const T3DIFF = [['lib/release.ts', '+2 −1', [['', 10, 'export const release = {'], ['', 11, '  version: "0.2.3",'], ['del', 12, '  size: "11.2 MB",'], ['add', 12, '  bytes: 11_743_232,'], ['add', 13, '  size: formatSize(11_743_232),'], ['', 14, '};']]],
  ['app/download/page.tsx', '+1 −1', [['', 40, '<dt>Size</dt>'], ['del', 41, '<dd>11.2 MB</dd>'], ['add', 41, '<dd>{release.size}</dd>']]]];
function t3panel(bloom) {
  const files = T3DIFF.map(([f, d, ls]) => `<div class="t3-df"><div class="t3-dfh">${T('chevd')}${f}<span>${ad(d)}</span></div>${ls.map(([k, n, t]) => `<div class="t3-dl${k ? ' t3-' + k : ''}"><span>${n}</span><span>${k === 'add' ? '+' : k === 'del' ? '−' : ''}</span><span>${t.replace(/</g, '&lt;')}</span></div>`).join('')}</div>`).join('');
  return `<div class="t3-panel"><div class="t3-tabs"><span class="t3-tab" data-on>${T('fdiff')}Diff</span><span class="t3-tab">${T('globe')}localhost:3000</span><span class="t3-tab">${T('tsq')}zsh</span><span class="t3-ib">${T('plus')}</span></div><div class="t3-dv">${files}</div></div>`;
}
function t3Win(skin = 'native') {
  const bloom = skin === 'bloom';
  return `<div class="bl-scale" data-w="1512" data-h="945"><div class="t3w t3-${skin}" data-region>${t3side(bloom)}${t3main(bloom)}${t3panel(bloom)}</div></div>`;
}

/* ---------- D, version 1: A's sidebar cards inside groups › folders, A's frame, a threaded centre, B's panel (design/hybrid/HANDOFF.md) ---------- */
/* D's lamps: working and housekeeping take the background lamp (the band in a ring); the bars keep their state */
const dlamp = st => ['working', 'house'].includes(st) ? 'bg' : st;
/* the model and its effort (5 steps: low, medium, high, xhigh, max) per chat */
const MODEL = { 'STATISTICS': ['Opus 5.5', 4], 'LINEAR_ALGEBRA': ['Sonnet 5.5', 3], 'SIGNALS_101': ['Opus 5.5', 5], 'ORBIT-WEBSITE': ['Opus 5.5', 5],
  'ORBIT-1-MARKET': ['Sonnet 5.5', 2], 'PORTFOLIO-SCROLL': ['Opus 5.5', 4], 'CONTROL': ['Opus 5.5', 5], 'DESIGN-EXPLORATION': ['Opus 5.5', 5],
  'DEPS-AUDIT': ['Haiku 5.5', 2], 'RELAY MAIN': ['Sonnet 5.5', 3], 'CV-BUILD': ['Opus 5.5', 3] };
const effort = n => `<span class="d-eff" role="img" aria-label="effort ${n} of 5">${[5, 4, 3, 2, 1].map(i => `<i${i <= n ? ' class="on"' : ''}></i>`).join('')}</span>`;
function dline3(c) {
  const b = BRANCH[c.n], words = c.sub.replace(/ · main$/, ''), [m, e] = MODEL[c.n] || ['Opus 5.5', 3];
  const git = c.p === 'scratch' ? '' : b ? `<span>·</span>${G('wt')}<span class="t3-brn">${b[1]}</span>` : `<span>·</span>${G('branch')}<span class="t3-brn">main</span>`;
  return `<div class="t3-l3"><span class="d-sw0">${words}</span>${git}<span class="d-model">${m}${effort(e)}</span></div>`;
}
/* line 2's right end: the tokens this chat has processed, static (pass 5) */
const dswap = c => `<span class="d-sw"><span class="d-tok" title="tokens processed in this chat">${Bloom.sample(c.n).tok}</span></span>`;
const dcard = c => `<div class="t3-card t3d-in"${c.sel ? ' data-act' : ''} data-st="${c.st}"><div class="t3-l1">${fav(c.p)}<span class="t3-pj">${PROJECTS[c.p].name}</span>${c.pin ? `<span class="t3-pinm">${T('pin')}</span>` : ''}${BAR(c.st, { form: 'compact' })}${Bloom.lamp(dlamp(c.st))}</div>`
  + `<div class="d-l2"><span class="t3-ttl">${c.n}</span>${dswap(c)}</div>${dline3(c)}</div>`;
/* settled and archived are one place for the owner */
const dfolds = () => `<div class="hy-folds"><span class="hy-fold">${G('snooze')}Snoozed${Bloom.pearl({ n: snoozed().length })}</span><span class="hy-fold">${G('tick')}Settled${Bloom.pearl({ n: 415 })}</span></div>`;
const LOGO = `<svg class="d-logo" width="27" height="17" viewBox="0 0 19 12" role="img" aria-label="CONTROL"><polyline points="1,11 1,9 4,9 4,6 7,6 7,3 10,3 10,6 13,6 13,9 16,9 16,11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" transform="translate(1 -1)"/></svg>`;
function dside() {
  let list = '';
  for (const g of GROUPS) {
    const rows = byGroup(g.id);
    list += grow(g, rows.length);
    for (const p of [...new Set(rows.map(c => c.p))]) {
      const pr = rows.filter(c => c.p === p);
      list += projHead(p, pr.length) + pr.map(dcard).join('');
    }
  }
  list += `<div class="hy-lh">Loose</div>` + loose().map(dcard).join('');
  return `<aside class="t3-side"><div class="t3-top"><span class="lights"><i></i><i></i><i></i></span><span class="t3-tg">${T('pleft')}</span><span class="t3-ib d-set">${T('settings')}</span><span class="t3-wm d-wm">${LOGO}</span></div>`
    + `<div class="t3-srch"><span class="t3-sf">${T('search')}Search</span><span class="t3-ib">${T('groupplus')}</span><span class="t3-ib">${T('pen')}</span></div>`
    + `<div class="hy-upd">${G('spark')}<span>Claude <b class="t-num">2.1.295</b> is out</span><span class="pill sm">Update</span></div>`
    + `<div class="t3-list">${list}</div>${dfolds()}${usage()}`
    + `<div class="t3-foot"><div class="t3-util"><span class="t3-ib">${T('chart')}</span></div></div></aside>`;
}

/* ---------- D's centre: each turn is a thread. The prompt, then each run of tool calls as a stack (newest at the bottom,
   the last five shown, older ones fading off the top; a click opens the whole stack), then Claude's reply; the turn ends on its totals ---------- */
const DK = { read: 'READ', write: 'WRITE', agent: 'AGENT', error: 'ERROR', run: 'BASH', skill: 'SKILL', web: 'BROWSER' };
/* the tool's own name, as Claude Code writes it, for the page's Simple variant (the error row is the Edit that failed) */
const DT = { read: 'Read', write: 'Write', agent: 'Agent', error: 'Edit', run: 'Bash', skill: 'Skill', web: 'Browser' };
/* a write's +n −n in the diff's own green and red */
const dmeta = m => (m || '').replace(/^\+(\d+) −(\d+)$/, '<span class="d-pa">+$1</span> <span class="d-ma">−$2</span>');
const drow = ([k, p, m]) => `<div class="d-row" data-k="${k}"><span class="pearl xs" aria-hidden="true"></span><span class="d-k">${DK[k]}</span><span class="d-kt">${DT[k]}</span><span class="d-pt">${p}</span><span class="d-m">${dmeta(m)}</span></div>`;
function dstack(head, rows, o = {}) {
  const hid = Math.max(0, rows.length - 5);
  const st = o.live ? 'working' : 'done';
  return `<div class="d-grp"${hid ? ' data-more' : ''}${o.live ? ' data-live' : ''}><button type="button" class="d-gh">${Bloom.pearl({ st, p: 10 })}${Bloom.lamp(dlamp(st === 'done' ? 'done' : 'working'), { d: 10 })}<span>${head}</span><span class="d-n">${rows.length} call${rows.length === 1 ? '' : 's'}</span>${hid ? `<span class="d-more">+${hid} above</span>` : ''}${G('chev-d', 'd-cv')}</button>`
    + `<div class="d-rows"><i class="ramp-flow d-rail" style="--ramp-use:var(--sb-${st});--tile:480px;--rp:${o.live ? 'var(--T)' : 'var(--T-breath)'}" aria-hidden="true"></i>${rows.map((r, i) => drow(r).replace('class="d-row"', `class="d-row${i < hid ? ' d-old' : ''}${i === hid && hid ? ' d-edge' : ''}"${o.live && i === rows.length - 1 ? ' data-run' : ''}`)).join('')}</div></div>`;
}
const ARW = '<svg class="d-pin" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M1.5 9H16M11.5 4.5L16 9L11.5 13.5"/></svg>';
const HOOKARW = '<svg class="d-pin" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M1.5 1V10H16M11.5 5.5L16 10L11.5 14.5"/></svg>';
const dq = t => `<div class="d-q">${ARW}<span class="d-qt">${t}</span></div>`;
const dsay = t => `<div class="d-say">${HOOKARW}${t}</div>`;
const dtot = t => `<div class="d-tot">${t}</div>`;
function dconvo() {
  return `<div class="d-turn"><i class="d-line" aria-hidden="true"></i>${dq('/download says 11.2 MB but the DMG is 11.7')}
    ${dstack('Worked for 18s', [['read', 'app/download/page.tsx', '64 lines'], ['read', 'app/admin/page.tsx', '118 lines']])}
    ${dsay('The DMG grew in 0.2.3 and the label is a hand-typed string in two places. Neither page reads the file.')}
    ${dtot('18s · ↑ 2.1k · ↓ 640 · no changes')}</div>
  <div class="d-turn"><i class="d-line" aria-hidden="true"></i>${dq('put the release size in one place so /download and /admin can\'t drift')}
    ${dstack('Worked for 20s', [['skill', 'release-notes', ''], ['read', 'lib/format.ts', '22 lines'], ['agent', 'explore · every other place the size is typed', '14s'],
      ['write', 'lib/release.ts', '+2 −1'], ['write', 'app/download/page.tsx', '+1 −1'], ['error', 'app/admin/page.tsx', 'string not found'], ['read', 'app/admin/page.tsx', '118 lines'],
      ['write', 'app/admin/page.tsx', '+3 −1'], ['run', 'bun run typecheck', 'no output']])}
    ${dsay('Both pages read <code>release.size</code> now. Checking <code>/download</code> on the dev server in tab 2.')}
    ${dstack('Working for 21s', [['run', 'bun run dev', 'port 3000'], ['web', 'open localhost:3000/download', ''], ['web', 'read button.cta', '']], { live: true })}</div>`;
}
/* the head: what this chat loads, with counts (the folder and the chat are on the selected sidebar card) */
const LOADS = [['hook', 'Hooks', 6], ['skill', 'Skills', 77], ['mcp', 'MCP', 5], ['plugin', 'Plugins', 9], ['bot', 'Agents', 12]];
const dloads = () => `<div class="d-loads">${LOADS.map(([g, l, n]) => `<span class="d-ld" title="${l}">${T(g)}<span>${l}</span><b>${n}</b></span>`).join('')}</div>`;
/* the context: what this chat holds, what is free, and where it compacts (the worktree is on the sidebar card). Window 1M */
const WINDOW = 1000000, COMPACT = 500000, USED = 320315;
const kfmt = n => Math.round(n / 1000) + 'k';
const dctx = () => `<div class="d-ctxw"><div class="d-cbar"><i class="d-cs" data-k="chat" style="width:${(USED / WINDOW * 100).toFixed(2)}%" title="chat ${USED.toLocaleString('en-GB')} tokens"></i><span class="d-cmark" style="left:${COMPACT / WINDOW * 100}%"></span></div>`
  + `<div class="d-legend"><span class="d-lg"><i data-k="chat"></i>Chat <b>${kfmt(USED)}</b></span><span class="d-lg"><i data-k="free"></i>Free <b>${kfmt(WINDOW - USED)}</b></span><span class="d-lg d-lgc"><i></i>Compacts at <b>${kfmt(COMPACT)}</b></span></div></div>`;
/* while a turn runs, Send queues the draft (T3's ListPlus, as the app draws it); the owner's call, 10 Oct */
const QUEUE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 5C11.6667 5 7.3333 5 3 5M11 12C8.3333 12 5.6667 12 3 12M16 19C11.6667 19 7.3333 19 3 19M18 9C18 11 18 13 18 15M21 12C19 12 17 12 15 12"/></svg>';
function dmain() {
  /* A's frame, composer and working bar; the head, the conversation and the strip change; the chat runs at Max (effort 5) */
  return t3main(true).replace('</svg>High<svg', '</svg>Max<svg')
    .replace('<span class="t3-send" title="Interrupt"><i></i></span>', `<span class="t3-send" title="Queue message">${QUEUE}</span>`)
    .replace(/<div class="t3-crumb">[\s\S]*?<\/div><div class="t3-tools">/, `${dloads()}<div class="t3-tools"><span class="t3-ib d-cmdk" title="Command palette (⌘K)">${T('cmd')}</span>`)
    .replace(/<div class="t3-col">[\s\S]*?(<div class="t3-working">)/, `<div class="t3-col d-col">${dconvo()}$1`)
    .replace(/<div class="t3-strip">[\s\S]*?<\/div><\/div><\/div>$/, `<div class="t3-strip d-strip"><span>${G('folder')}Local</span><span><b>${G('wt')}Worktree</b></span>${dctx()}</div></div></div>`);
}


/* ---------- D's right panel, tab by tab: Outputs (F28, F30), Folder (F31), Browser (F36, F37), Terminal. Git is the window's ---------- */
/* [heading, open, rows]: only the newest turn starts open; a closed one shows its count. Code a turn changed is Git's */
const OUTS = [
  ['T14 · now', 1, [['shot', 'button.cta.png', 'PNG · 212 × 40'], ['file', 'docs/DESIGN.md', '+4 −10', 1]]],
  ['T12 · 23:20', 0, [['out', 'dist/ORBIT-0.2.3.dmg', 'DMG · 11.7 MB'], ['file', 'CHANGELOG.md', 'Markdown'], ['file', 'notary-log.json', 'JSON · accepted']]],
];
const dOutputs = () => `<div class="pane hy-v dp-v"><div class="hy-vh"><b>Outputs</b><span>this thread, newest first</span><span class="sp"></span><span class="t-num">5</span></div>
  <div class="dp-list">${OUTS.map(([t, open, rows]) => `<div class="dp-th">${G(open ? 'chev-d' : 'chev-r')}${t}<span class="sp"></span>${open ? '' : `<span class="t-num">${rows.length}</span>`}</div>${open ? rows.map(([g, n, m, on]) => `<div class="dp-o"${on ? ' data-on' : ''}>${G(g)}<span class="dp-nm">${n}</span><span class="dp-mt">${m}</span></div>`).join('') : ''}`).join('')}</div>
  <div class="dp-md"><h5>Release size</h5><p>The DMG's size is read from the file at build time, never typed. <code>lib/release.ts</code> holds it in bytes; both pages format it with <code>formatSize</code>.</p>
  <table><tr><th>Page</th><th>Reads</th></tr><tr><td><code>/download</code></td><td><code>release.size</code></td></tr><tr><td><code>/admin</code></td><td><code>release.size</code></td></tr></table>
  <p>Never hand-type a size again: the build fails if <code>dist/</code> has no DMG.</p></div>
  <div class="hy-sfoot"><span>docs/DESIGN.md · rendered</span><span class="sp"></span><span class="pill ghost sm">Open</span><span class="pill ghost sm">Reveal</span></div></div>`;
/* [depth, name, dir: 'o' open | 'c' closed, git mark, age, selected] */
const TREE = [[0, 'app', 'o', 'M'], [1, 'admin', 'o', 'A'], [2, 'page.tsx', '', 'A', 'now'], [1, 'download', 'o', 'M'], [2, 'page.tsx', '', 'M', 'now'], [1, 'layout.tsx', '', '', '3d'], [1, 'page.tsx', '', '', '3d'],
  [0, 'dist', 'c', 'ignored'], [0, 'docs', 'o', 'M'], [1, 'DESIGN.md', '', 'M', 'now'], [0, 'lib', 'o', 'M'], [1, 'format.ts', '', '', '2d'], [1, 'release.ts', '', 'M', 'now', 1],
  [0, 'public', 'c'], [0, 'package.json', '', '', '1w'], [0, 'README.md', '', '', '1w']];
/* release.ts as the file's tab shows it: Plex on --deep, keywords lilac, strings green */
const SRC = ['<span class="dp-kw">import</span> { statSync } <span class="dp-kw">from</span> <span class="dp-st">"node:fs"</span>;', '',
  '<span class="dp-kw">export const</span> release = {', '  version: <span class="dp-st">"0.2.3"</span>,', '  size: statSync(<span class="dp-st">"dist/ORBIT-0.2.3.dmg"</span>).size,', '};', '',
  '<span class="dp-kw">export function</span> formatSize(bytes: <span class="dp-kw">number</span>) {', '  <span class="dp-kw">return</span> `${(bytes / 1e6).toFixed(1)} MB`;', '}'];
/* The tree at the left and the open file at its right, its tabs over it; the side glyph hides the tree (owner, 29 Oct) */
const dFolder = () => `<div class="pane hy-v dp-v dp-fold"><div class="dp-tree"><div class="hy-vh"><span class="input hy-url">Search files</span><span>4 changed</span></div>
  <div class="dp-list">${TREE.map(([d, n, dir, gs, age, on]) => `<div class="dp-f${gs === 'ignored' ? ' dp-dim' : ''}" style="--l:${d}"${on ? ' data-on' : ''}>${dir ? G(dir === 'o' ? 'chev-d' : 'chev-r', 'dp-cv') : '<i></i>'}${G(dir ? 'folder' : 'file')}<span class="dp-nm">${n}</span><span class="dp-gs" data-g="${gs || ''}">${gs && gs !== 'ignored' ? (dir ? '•' : gs) : ''}</span><span class="dp-mt">${gs === 'ignored' ? 'ignored' : age || ''}</span></div>`).join('')}</div></div>
  <div class="dp-file"><div class="hy-vh hy-tmux"><span class="hy-ib" data-on>${G('side')}</span><span class="hy-tx" data-on>${G('file')}release.ts</span><span class="hy-tx">${G('file')}DESIGN.md</span></div>
  <div class="hy-vh"><span class="dp-crumb">site-v2<span>›</span><b>lib</b></span></div>
  <div class="dp-src">${SRC.map((l, i) => `<div class="hy-dl"><span class="hy-ln">${i + 1}</span><span></span><span>${l}</span></div>`).join('')}</div></div></div>`;
const dBrowser = () => `<div class="pane hy-v dp-v"><div class="hy-vh">${G('chev-l')}${G('chev-r')}${G('reload')}<span class="input hy-url">localhost:3000/download</span><span class="hy-pk" data-on>${G('pick')}</span><span class="hy-pk">${G('shot')}</span></div>
  <div class="hy-site dp-site"><div class="hy-snav"><b>ORBIT</b><span>Features</span><span>Download</span><span>Changelog</span></div><h4 class="hy-sh1">Download ORBIT</h4>
  <p class="hy-sp">The arming layer for your DAW. One key, every track ready.</p><span class="hy-cta dp-picked">Download for macOS · 11.2 MB</span>
  <div class="hy-pickbar dp-pickbar">button.cta<span class="hy-soft">212 × 40</span><span class="pill sm primary">Add</span></div>
  <div class="hy-spec"><div><span>Version</span><span>0.2.3</span></div><div><span>Size</span><span>11.2 MB</span></div><div><span>Requires</span><span>macOS 14 or later</span></div><div><span>Chip</span><span>Apple silicon and Intel</span></div></div></div>
  <div class="hy-sfoot">${Bloom.lamp('working', { d: 9 })}<span>bun dev · tab 2</span><span class="t-num">:3000</span></div></div>`;
const TTY = ['<span class="hy-g">~/Projects/orbit-website</span> on <b>site-v2</b>', '$ bun run dev', '', '  <b>▲ Next.js 15.1.0</b>', '  - Local:    http://localhost:3000', '',
  ' <span class="dp-ok">✓</span> Ready in 1.4s', ' ○ Compiling /download ...', ' <span class="dp-ok">✓</span> Compiled /download in 812ms', ' GET /download <span class="dp-ok">200</span> in 902ms',
  ' ○ Compiling /admin ...', ' <span class="dp-ok">✓</span> Compiled /admin in 410ms', ' GET /admin <span class="dp-ok">200</span> in 455ms', ' <span class="dp-ok">✓</span> Compiled in 96ms (lib/release.ts)', ' GET /download <span class="dp-ok">200</span> in 38ms'];
const dTerminal = () => `<div class="pane hy-v dp-v"><div class="hy-vh hy-tmux"><span class="hy-tx"><i>1</i>claude</span><span class="hy-tx" data-on><i>2</i>bun dev</span><span class="hy-tx"><i>3</i>zsh</span><span class="hy-ib">${G('plus')}</span><span class="sp"></span><span>site-v2</span></div>
  <div class="hy-tty dp-tty">${TTY.map(l => `<div>${l}</div>`).join('')}<div><i class="hy-bcur"></i></div></div></div>`;
const DVIEW = { Outputs: dOutputs, Folder: dFolder, Browser: dBrowser, Terminal: dTerminal };
/* D's tab row: the five views, and Loose ends (mail) at the far right */
const dtabs = sel => tabs(BLOOM_TABS(sel)).replace(/<\/div>$/, `<span class="d-loose" role="button" title="Loose ends">${G('mail')}</span></div>`);
/* the window's panel holds every view; its tabs switch them, Git first */
const dViews = () => ['Outputs', 'Folder', 'Browser', 'Git', 'Terminal'].map(t => (t === 'Git' ? diffView() : DVIEW[t]()).replace('<div class="pane hy-v', `<div data-tab="${t}"${t === 'Git' ? '' : ' hidden'} class="pane hy-v`)).join('');
const dWin = () => `<div class="bl-scale" data-w="1512" data-h="945"><div class="t3w t3-bloom t3-d" data-region>${dside()}${dmain()}<div class="t3d-panel"><div class="hy-panel">${dtabs('Git')}<div class="hy-views">${dViews()}</div></div></div></div></div>`;
document.addEventListener('click', e => {
  const t = e.target.closest('.t3-d:not(.dp-w) .hy-tab'), p = t && t.closest('.hy-panel');
  if (!p) return;
  p.querySelectorAll('.hy-tab').forEach(x => x.setAttribute('aria-selected', String(x === t)));
  p.querySelectorAll('.hy-views > [data-tab]').forEach(v => { v.hidden = v.dataset.tab !== t.title; });
});
const dPanel = (tab, w = 440) => `<div class="bl-scale" data-w="${w}" data-h="945"><div class="t3w t3-bloom t3-d dp-w" style="width:${w}px" data-region><div class="t3d-panel"><div class="hy-panel">${dtabs(tab)}<div class="hy-views">${DVIEW[tab]()}</div></div></div></div></div>`;
/* the turn's dashed line runs from under the prompt's arrow to the last reply's arrow, in whole dashes: the gap is
   stretched so a dash starts and ends the line exactly. Layout units, so the window's scale doesn't matter */
const DASH = 13, GAP = 20;    /* the owner's, tuned on S6 (10 Oct) */
function dashes(root = document) {
  root.querySelectorAll('.d-turn').forEach(turn => {
    const line = turn.querySelector('.d-line'), q = turn.querySelector('.d-q > .d-pin'), says = turn.querySelectorAll('.d-say > .d-pin');
    if (!line || !q || !says.length) return;
    const tr = turn.getBoundingClientRect(), s = tr.height / turn.offsetHeight || 1, y = el => (el.getBoundingClientRect().top - tr.top) / s;
    const top = y(q) + 18 + GAP, bottom = y(says[says.length - 1]) + 1 - GAP, h = bottom - top;
    const n = Math.max(1, Math.round((h + GAP) / (DASH + GAP))), gap = n > 1 ? (h - n * DASH) / (n - 1) : 0;
    Object.assign(line.style, { top: top + 'px', height: h + 'px', backgroundSize: `3px ${DASH + gap}px` });
    line.style.setProperty('--dash', DASH + 'px');
  });
  /* a closed stack scrolls its older calls in place, so it opens at the newest */
  root.querySelectorAll('.d-grp[data-more]:not([data-open]) .d-rows').forEach(r => { r.scrollTop = r.scrollHeight; });
}
document.fonts.ready.then(() => dashes());
document.addEventListener('click', e => { if (e.target.closest('.t3-d .d-gh')) requestAnimationFrame(() => dashes()); });
/* a click on a stack's head opens or closes the whole stack */
document.addEventListener('click', e => { const h = e.target.closest('.t3-d .d-gh'); if (h) h.parentElement.toggleAttribute('data-open'); });

/* ---------- a window: sidebar | centre | panel, at 1512 x 945 like section 06 ---------- */
function win(o) {
  return `<div class="bl-scale" data-w="1512" data-h="945"><div class="window hy-win${o.cls ? ' ' + o.cls : ''}" data-region>
  ${o.side}<div class="hy-centre">${o.head}<div class="pane hy-well">${o.centre || convo()}${o.comp || composer()}</div>${o.drawer || ''}</div>${o.panel}</div></div>`;
}

const wire = el => el.querySelectorAll('.seg').forEach(x => Bloom.seg(x));

window.Hy = { dashes, dWin, dPanel, dcard, fav, usage, LOGO, dfolds, folds, T: (id, cls) => `<svg class="t3g ${cls || ''}" aria-hidden="true"><use href="#t3-${id}"/></svg>`, wire, drawer, t3Win, GROUPS, PROJECTS, CHATS, byGroup, loose, snoozed, pearl, srow, grow, bloomSide, convo, composer, head, tabs, panel, BLOOM_TABS, win, card, EV, PIN };
})();
