// Measures version 1 (option D) as rendered: every named part's box, type and colour in both themes, into
// design/hybrid/v1/measure.md. Boxes are px from the top-left of the window (1512 x 945) or of the panel (440 x 945).
// usage: python3 assemble.py && node extract.cjs [ver] && node measure.cjs [ver, default v1.2]   (it reads <ver>/index.html, the standalone render)
const CDP = require('/opt/homebrew/lib/node_modules/chrome-remote-interface');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const VER = process.argv[2] || 'v1.2', V1 = path.join(path.dirname(__dirname), VER);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* [label, selector, scope]: scope W is the window, P0–P3 the Outputs, Folder, Browser and Terminal panels */
const PARTS = [
  ['## Window', null], ['window', '', 'W'], ['sidebar', '.t3-side', 'W'], ['centre', '.t3-main', 'W'], ['right panel', '.t3d-panel', 'W'],
  ['## Sidebar', null],
  ['top row', '.t3-top', 'W'], ['traffic lights', '.t3-top .lights', 'W'], ['sidebar toggle', '.t3-tg', 'W'], ['settings button', '.d-set', 'W'], ['logo', '.d-logo', 'W'],
  ['search row', '.t3-srch', 'W'], ['search field', '.t3-sf', 'W'], ['update note', '.hy-upd', 'W'], ['update note, version', '.hy-upd b', 'W'], ['update button', '.hy-upd .pill', 'W'],
  ['group row', '.group-row', 'W'], ['group pearl', '.group-row .pearl', 'W'], ['group name', '.hy-gn', 'W'], ['group count', '.group-row .n', 'W'],
  ['folder row', '.hy-ph', 'W'], ['folder icon', '.hy-ph .gi', 'W'], ['folder name', '.hy-ph > span', 'W'],
  ['card', '.t3-card', 'W'], ['card, selected', '.t3-card[data-act]', 'W'], ['line 1', '.t3-l1', 'W'], ['project mark', '.t3-fav', 'W'], ['project name', '.t3-pj', 'W'],
  ['state bar (bead bar)', '.t3-l1 .sbar', 'W'], ['lamp', '.t3-l1 .lamp', 'W'], ['line 2', '.d-l2', 'W'], ['chat name', '.t3-ttl', 'W'], ['tokens', '.d-tok', 'W'],
  ['line 3', '.t3-l3', 'W'], ['state words', '.t3-l3 > span:first-child', 'W'], ['branch glyph', '.t3-l3 .gi', 'W'], ['branch / worktree', '.t3-brn', 'W'],
  ['model', '.d-model', 'W'], ['effort meter', '.d-eff', 'W'], ['effort bar', '.d-eff i', 'W'], ['effort bar, lit', '.d-eff i.on', 'W'],
  ['fold strip', '.hy-folds', 'W'], ['fold (Snoozed)', '.hy-fold', 'W'], ['fold count', '.hy-fold .pearl.count', 'W'],
  ['usage block', '.hy-use', 'W'], ['usage key (5H)', '.hy-uk', 'W'], ['usage percent', '.hy-up', 'W'], ['usage reset', '.hy-ur', 'W'], ['usage line', '.use-line', 'W'], ['foot', '.t3-foot', 'W'],
  ['## Centre: head', null],
  ['head', '.t3-head', 'W'], ['loads', '.d-loads', 'W'], ['load (Hooks)', '.d-ld', 'W'], ['load icon', '.d-ld svg', 'W'], ['load count', '.d-ld b', 'W'], ['panel toggles', '.t3-tools', 'W'], ['panel toggle', '.t3-tools .t3-ib', 'W'],
  ['## Centre: thread', null],
  ['canvas', '.t3-canvas', 'W'], ['column', '.d-col', 'W'], ['turn', '.d-turn', 'W'], ['turn line (dashed)', '.d-line', 'W'],
  ['prompt', '.d-q', 'W'], ['prompt arrow →', '.d-q > .d-pin', 'W'], ['prompt band', '.d-qt', 'W'],
  ['tool stack', '.d-grp', 'W'], ['stack head', '.d-gh', 'W'], ['stack head pearl', '.d-gh .pearl', 'W'], ['stack head label', '.d-gh > span:nth-of-type(2)', 'W'], ['stack call count', '.d-n', 'W'],
  ['stack "+n above"', '.d-more', 'W'], ['stack chevron', '.d-cv', 'W'], ['rows', '.d-rows', 'W'], ['rail', '.d-rail', 'W'], ['row', '.d-row', 'W'], ['row bead', '.d-row > .pearl', 'W'],
  ['READ', '.d-row[data-k="read"] .d-k', 'W'], ['WRITE', '.d-row[data-k="write"]:not(.d-old) .d-k', 'W'], ['ERROR', '.d-row[data-k="error"] .d-k', 'W'], ['BASH', '.d-row[data-k="run"] .d-k', 'W'], ['BROWSER', '.d-row[data-k="web"] .d-k', 'W'],
  ['READ bead', '.d-row[data-k="read"] > .pearl', 'W'], ['ERROR bead', '.d-row[data-k="error"] > .pearl', 'W'], ['BASH bead', '.d-row[data-k="run"] > .pearl', 'W'], ['BROWSER bead', '.d-row[data-k="web"] > .pearl', 'W'],
  ['tool name (1.1)', '.d-row[data-k="read"] .d-kt', 'W'], ['stack head lamp (1.1)', '.d-gh > .lamp', 'W'], ['write +n (1.1)', '.d-pa', 'W'], ['write −n (1.1)', '.d-ma', 'W'], ['Loose ends (1.1)', '.d-loose', 'W'],
  ['row path', '.d-pt', 'W'], ['row meta', '.d-m', 'W'], ['faded row (5th back)', '.d-row.d-edge .d-k', 'W'],
  ['reply', '.d-say', 'W'], ['reply arrow ↳', '.d-say > .d-pin', 'W'], ['reply code', '.d-say code', 'W'], ['turn totals', '.d-tot', 'W'],
  ['## Centre: composer and strip', null],
  ['working line', '.t3-working', 'W'], ['working bar', '.t3-working .sbar', 'W'], ['composer wrap', '.t3-cwrap', 'W'], ['composer', '.t3-comp', 'W'], ['draft', '.t3-ed', 'W'],
  ['controls row', '.t3-cf', 'W'], ['control (model)', '.t3-ctl', 'W'], ['send / interrupt', '.t3-send', 'W'],
  ['strip', '.d-strip', 'W'], ['strip item (Local)', '.d-strip > span', 'W'], ['context block', '.d-ctxw', 'W'], ['context bar', '.d-cbar', 'W'], ['context: chat', '.d-cs', 'W'],
  ['context: compact mark', '.d-cmark', 'W'], ['legend', '.d-legend', 'W'], ['legend item', '.d-lg', 'W'], ['legend number', '.d-lg b', 'W'],
  ['## Right panel: tabs and Git', null],
  ['tab row', '.hy-tabs', 'W'], ['tab', '.hy-tab', 'W'], ['tab, selected', '.hy-tab[aria-selected="true"]', 'W'], ['Git head', '[data-tab="Git"] .hy-vh', 'W'], ['Graph | Diff', '[data-tab="Git"] .seg', 'W'],
  ['diff summary', '.hy-dsum', 'W'], ['added count', '.hy-dsum .hy-pn', 'W'], ['removed count', '.hy-dsum .hy-mn', 'W'], ['changed file', '.hy-df', 'W'], ['diff', '.hy-diff', 'W'], ['diff line', '.hy-dl', 'W'],
  ['diff line number', '.hy-ln', 'W'], ['removed line', '.hy-dl.hy-rem', 'W'], ['removed sign', '.hy-dl.hy-rem > .hy-sg', 'W'], ['removed word', '.hy-wr', 'W'], ['added line', '.hy-dl.hy-add', 'W'], ['added sign', '.hy-dl.hy-add > .hy-sg', 'W'], ['added word', '.hy-wa', 'W'],
  ['## Right panel: Outputs', null],
  ['head', '.hy-vh', 'P0'], ['head title', '.hy-vh b', 'P0'], ['turn heading', '.dp-th', 'P0'], ['output row', '.dp-o', 'P0'], ['output row, picked', '.dp-o[data-on]', 'P0'], ['row icon', '.dp-o .gi', 'P0'],
  ['row name', '.dp-nm', 'P0'], ['row meta', '.dp-mt', 'P0'], ['rendered report', '.dp-md', 'P0'], ['report heading', '.dp-md h5', 'P0'], ['report text', '.dp-md p', 'P0'], ['report code', '.dp-md code', 'P0'],
  ['report table cell', '.dp-md td', 'P0'], ['foot', '.hy-sfoot', 'P0'], ['foot button', '.hy-sfoot .pill', 'P0'],
  ['## Right panel: Folder', null],
  ['breadcrumb', '.dp-crumb', 'P1'], ['tree row', '.dp-f', 'P1'], ['tree row, picked', '.dp-f[data-on]', 'P1'], ['git mark', '.dp-gs[data-g="M"]', 'P1'], ['ignored row name', '.dp-dim .dp-nm', 'P1'], ['Quick Look', '.dp-ql', 'P1'], ['Quick Look keyword', '.dp-ql b', 'P1'], ['Quick Look string', '.dp-ql i', 'P1'],
  ['## Right panel: Browser', null],
  ['address', '.hy-url', 'P2'], ['pick tool, on', '.hy-pk[data-on]', 'P2'], ['site', '.dp-site', 'P2'], ['picked element', '.hy-cta', 'P2'], ['pick bar', '.hy-pickbar', 'P2'], ['pick bar Add', '.hy-pickbar .pill', 'P2'], ['foot', '.hy-sfoot', 'P2'],
  ['## Right panel: Terminal', null],
  ['shell tabs', '.hy-tmux', 'P3'], ['shell tab', '.hy-tx', 'P3'], ['shell tab, on', '.hy-tx[data-on]', 'P3'], ['terminal', '.hy-tty', 'P3'], ['terminal success mark', '.dp-ok', 'P3'], ['cursor', '.hy-bcur', 'P3'],
];

const PROBE = `(parts => {
  const W = document.querySelector('.t3w.t3-d:not(.dp-w)'), P = [...document.querySelectorAll('.t3w.t3-d.dp-w')];
  const hex = c => { if (!c || c === 'rgba(0, 0, 0, 0)' || c === 'transparent') return '—';
    const sm = c.match(/^color\\(srgb ([\\d.e-]+) ([\\d.e-]+) ([\\d.e-]+)(?: \\/ ([\\d.]+))?\\)$/);
    if (sm) { const a = sm[4] === undefined ? 1 : +sm[4]; return '#' + [1, 2, 3].map(k => Math.round(Math.min(1, Math.max(0, +sm[k])) * 255).toString(16).padStart(2, '0')).join('') + (a < 1 ? ' @' + Math.round(a * 100) + '%' : ''); }
    const cv = document.createElement('canvas').getContext('2d'); cv.fillStyle = '#000'; cv.fillStyle = c; const f = cv.fillStyle;   // canvas normalises any colour
    if (f.startsWith('#')) return f; const m = f.match(/rgba?\\(([^)]+)\\)/); if (!m) return c;
    const [r, g, b, a] = m[1].split(',').map(s => +s.trim()); return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('') + (a < 1 ? ' @' + Math.round(a * 100) + '%' : ''); };
  return parts.map(([label, sel, scope]) => {
    if (!sel && sel !== '') return { label };
    const root = scope === 'W' ? W : P[+scope[1]], el = sel === '' ? root : root.querySelector(sel);
    if (!el) return { label, sel, missing: true };
    const r = el.getBoundingClientRect(), o = root.getBoundingClientRect(), cs = getComputedStyle(el);
    const fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').replace('Bloom', '');
    const pad = [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].map(v => parseFloat(v)).join(' ');
    return { label, sel, box: [r.left - o.left, r.top - o.top, r.width, r.height].map(v => +v.toFixed(1)).join(', '),
      font: el.tagName === 'svg' || el.tagName === 'SVG' ? '—' : fam + ' ' + parseFloat(cs.fontSize) + '/' + (cs.lineHeight === 'normal' ? 'n' : parseFloat(cs.lineHeight)) + ' ' + cs.fontWeight + (cs.letterSpacing !== 'normal' && cs.letterSpacing !== '0px' ? ' ls ' + cs.letterSpacing : ''),
      color: hex(cs.color), bg: hex(cs.backgroundColor), radius: cs.borderRadius === '0px' ? '0' : cs.borderRadius, pad: pad === '0 0 0 0' ? '0' : pad };
  });
})`;

(async () => {
  const port = 9300 + Math.floor(Math.random() * 600), dir = path.join(__dirname, '.chrome-' + port);
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', '--allow-file-access-from-files', '--hide-scrollbars',
    `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, 'about:blank'], { stdio: 'ignore' });
  let c; for (let i = 0; i < 50 && !c; i++) { try { c = await CDP({ port }); } catch (e) { await sleep(100); } }
  await c.Page.enable(); await c.Runtime.enable();
  await c.Emulation.setDeviceMetricsOverride({ width: 1600, height: 1100, deviceScaleFactor: 2, mobile: false });
  const res = {}, SHOTS = path.join(V1, 'shots');
  fs.mkdirSync(SHOTS, { recursive: true });
  const ev = async x => (await c.Runtime.evaluate({ expression: x, returnByValue: true })).result.value;
  /* reference shots at 2x, Reduce motion's still poses: the window, then each panel tab */
  const shoot = async (sel, i, file) => {
    const r = JSON.parse(await ev(`(() => { const b = document.querySelectorAll(${JSON.stringify(sel)})[${i}].getBoundingClientRect(); return JSON.stringify({ x: b.x + scrollX, y: b.y + scrollY, width: b.width, height: b.height, scale: 1 }); })()`));
    fs.writeFileSync(path.join(SHOTS, file), Buffer.from((await c.Page.captureScreenshot({ format: 'png', clip: r, captureBeyondViewport: true })).data, 'base64'));
  };
  for (const th of ['field', 'night']) {
    await c.Page.navigate({ url: `file://${V1}/index.html?theme=${th}&motion=reduce` }); await c.Page.loadEventFired(); await sleep(1500);
    res[th] = await ev(`${PROBE}(${JSON.stringify(PARTS)})`);
    await shoot('.t3w.t3-d:not(.dp-w)', 0, `window-${th}.png`);
    for (const [i, tab] of ['outputs', 'folder', 'browser', 'terminal'].entries()) await shoot('.t3w.t3-d.dp-w', i, `panel-${tab}-${th}.png`);
  }
  await c.close(); chrome.kill(); setTimeout(() => fs.rmSync(dir, { recursive: true, force: true }), 300);
  const lines = [`# CONTROL ${VER.replace('v', 'version ')} · measured`, '',
    `GENERATED by \`design/hybrid/src/measure.cjs\` from \`${VER}/index.html\` (the standalone render, pixel-equal to the page). Re-run after any change.`,
    'Box is `x, y, w, h` in px from the top-left of the window (1512 × 945) or, for the panel tabs, of the 440 × 945 panel. Font is face size/line-height weight.',
    'Colours are the computed values, Field then Night; `@n%` is alpha. Padding is top right bottom left. Use this to check a build, not to design from: the CSS is the source.', ''];
  const missing = [];
  res.field.forEach((f, i) => {
    const n = res.night[i];
    if (!f.sel && f.sel !== '') { lines.push('', f.label, '', '| part | selector | box | font | colour Field / Night | background Field / Night | radius | padding |', '|---|---|---|---|---|---|---|---|'); return; }
    if (f.missing) { missing.push(f.label + ' ' + f.sel); return; }
    const pair = (a, b) => a === b ? a : `${a} / ${b}`;
    lines.push(`| ${f.label} | \`${f.sel || '(root)'}\` | ${f.box} | ${f.font} | ${pair(f.color, n.color)} | ${pair(f.bg, n.bg)} | ${f.radius} | ${f.pad} |`);
  });
  fs.writeFileSync(path.join(V1, 'measure.md'), lines.join('\n') + '\n');
  console.log(`measured ${res.field.filter(f => f.box).length} parts${missing.length ? '; MISSING: ' + missing.join(' | ') : ''}`);
})();
