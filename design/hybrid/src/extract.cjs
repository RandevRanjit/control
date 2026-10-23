// Extracts version 1 (option D) from the hybrid page into design/hybrid/v1/, so the app can be built from it 1:1:
//   tokens.css       every custom property both themes use, and the @font-face rules (fonts/ beside it)
//   control-v1.css   every rule that styles D's window or its panels, verbatim from the sources, in cascade order;
//                    selector lists are pruned to the parts that match, so A, B and C never leak in
//   index.html       the rendered window and the four panel tabs as static markup on those two files (no Bloom runtime)
// A rule is kept when any of its selectors matches an element inside .t3w.t3-d, html or body, in either theme, in either
// motion setting, with the tool stacks closed and open. Pseudo-elements and :hover-style states are stripped for matching.
// usage: python3 assemble.py && node extract.cjs [version folder, default v1.2] [trace variant, default simple]
//   version 1.0 was exported to v1/ with the Hue trace (commit 5ca6c032); 1.1 to v1.1/ and 1.2 to v1.2/, both with Simple
const CDP = require('/opt/homebrew/lib/node_modules/chrome-remote-interface');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');

const SRC = __dirname, HY = path.dirname(SRC), VER = process.argv[2] || 'v1.2', TV = process.argv[3] || 'simple', OUT = path.join(HY, VER), PAGE = path.join(HY, 'index.html');
const SCAFFOLD = ['.bl-scale > *'];   // the page's scaler, not the window's
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---- a small CSS splitter: top-level items with the comments in front of them, nested for @media and @supports ---- */
function split(css) {
  const items = []; let i = 0, pre = '';
  while (i < css.length) {
    if (css.startsWith('/*', i)) { const e = css.indexOf('*/', i + 2) + 2; pre += css.slice(i, e); i = e; continue; }
    if (/\s/.test(css[i])) { pre += css[i++]; continue; }
    const open = scan(css, i, '{'), prelude = css.slice(i, open).trim();
    let d = 0, j = open;
    for (; j < css.length; j++) {
      if (css.startsWith('/*', j)) { j = css.indexOf('*/', j + 2) + 1; continue; }
      if (css[j] === '"' || css[j] === "'") { j = css.indexOf(css[j], j + 1); continue; }
      if (css[j] === '{') d++; else if (css[j] === '}' && --d === 0) break;
    }
    const body = css.slice(open + 1, j);
    const nested = /^@(media|supports)/.test(prelude);
    items.push({ pre, prelude, body, kids: nested ? split(body) : null });
    pre = ''; i = j + 1;
  }
  return items;
}
function scan(s, i, ch) { for (; i < s.length; i++) { if (s[i] === '"' || s[i] === "'") i = s.indexOf(s[i], i + 1); else if (s[i] === ch) return i; } return -1; }
const parts = sel => { const out = []; let d = 0, cur = ''; for (const c of sel) { if (c === '(') d++; if (c === ')') d--; if (c === ',' && !d) { out.push(cur.trim()); cur = ''; } else cur += c; } out.push(cur.trim()); return out; };

const sources = [['tokens.css', fs.readFileSync(path.join(SRC, 'tokens.css'), 'utf8')], ['base.css', fs.readFileSync(path.join(SRC, 'base.css'), 'utf8')],
  ['lib.css', fs.readFileSync(path.join(SRC, 'lib.css'), 'utf8')], ['kit.css', fs.readFileSync(path.join(SRC, 'kit.css'), 'utf8')],
  ['parts/shell.html', (fs.readFileSync(path.join(SRC, 'parts/shell.html'), 'utf8').match(/<style[^>]*>([\s\S]*?)<\/style>/) || [])[1]]];
const tree = sources.map(([f, css]) => ({ f, items: split(css) }));
const selectors = new Set();
const walk = (items, fn) => items.forEach(it => it.kids ? walk(it.kids, fn) : fn(it));
tree.forEach(t => walk(t.items, it => { if (!it.prelude.startsWith('@')) parts(it.prelude).forEach(p => selectors.add(p)); }));

/* ---- which selectors match, over every state ---- */
const MATCH = `(sels => {
  const scope = new Set([document.documentElement, document.body]);
  document.querySelectorAll('.t3w.t3-d').forEach(r => { scope.add(r); r.querySelectorAll('*').forEach(e => scope.add(e)); });
  const strip = s => s.replace(/::?(before|after|placeholder|selection|marker|-webkit-[\\w-]+)/g, '').replace(/:(hover|active|focus-visible|focus-within|focus|visited)/g, '');
  const hit = [];
  for (const s of sels) { let q; try { q = document.querySelectorAll(strip(s) || '*'); } catch (e) { hit.push('!' + s); continue; } for (const e of q) if (scope.has(e)) { hit.push(s); break; } }
  return hit;
})`;
async function matched(c, query) {
  const { Page, Runtime } = c;
  await Page.navigate({ url: 'file://' + PAGE + '?' + query }); await Page.loadEventFired(); await sleep(1500);
  const ev = async x => (await Runtime.evaluate({ expression: x, returnByValue: true })).result.value;
  const a = await ev(`${MATCH}(${JSON.stringify([...selectors])})`);
  await ev(`document.querySelectorAll('.t3-d .d-grp').forEach(g => g.setAttribute('data-open', ''))`);
  const b = await ev(`${MATCH}(${JSON.stringify([...selectors])})`);
  return [...a, ...b];
}

(async () => {
  const port = 9300 + Math.floor(Math.random() * 600), dir = path.join(SRC, '.chrome-' + port);
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', '--allow-file-access-from-files', '--hide-scrollbars',
    `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, 'about:blank'], { stdio: 'ignore' });
  let c; for (let i = 0; i < 50 && !c; i++) { try { c = await CDP({ port }); } catch (e) { await sleep(100); } }
  await c.Page.enable(); await c.Runtime.enable();
  await c.Emulation.setDeviceMetricsOverride({ width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  const keep = new Set(), bad = new Set();
  for (const q of ['shot=shell&theme=field', 'shot=shell&theme=night', 'shot=shell&theme=field&motion=reduce', 'shot=shell&theme=night&motion=reduce'].map(q => q + '&tv=' + TV))
    for (const s of await matched(c, q)) s.startsWith('!') ? bad.add(s.slice(1)) : keep.add(s);

  /* the rendered markup: D's window at 1:1 and the four panels, with the inline styles the page's scripts set */
  const ev = async x => (await c.Runtime.evaluate({ expression: x, returnByValue: true })).result.value;
  await c.Page.navigate({ url: 'file://' + PAGE + '?shot=shell&theme=field&tv=' + TV }); await c.Page.loadEventFired(); await sleep(1500);
  const win = await ev(`document.querySelector('.t3w.t3-d:not(.dp-w)').outerHTML`);
  const panels = await ev(`[...document.querySelectorAll('.t3w.t3-d.dp-w')].map(e => e.outerHTML)`);
  await c.close(); chrome.kill(); setTimeout(() => fs.rmSync(dir, { recursive: true, force: true }), 300);

  /* ---- write ---- */
  const keyframes = new Set(), used = [];
  const tokens = [], rules = [];
  const isRoot = p => /^(:root|html|\[data-(theme|type)=[^\]]+\])(\[[^\]]+\])*$/.test(p.replace(/\s+/g, ''));
  const emit = (it, into) => {
    if (it.prelude.startsWith('@font-face') || it.prelude.startsWith('@keyframes')) return;
    const ps = parts(it.prelude).filter(p => keep.has(p) && !SCAFFOLD.includes(p));
    if (!ps.length) return null;
    const root = ps.every(isRoot);
    const custom = /--[\w-]+\s*:/.test(it.body);
    if (root && !custom && ps.join() === 'html') return null;   // html's page background: not the app's
    for (const m of it.body.matchAll(/animation(?:-name)?\s*:\s*([^;]+)/g)) m[1].split(/[\s,]+/).forEach(n => keyframes.add(n));
    const text = `${comment(it.pre)}${ps.join(',\n')} {${it.body}}\n`;
    (root && custom ? tokens : into).push(text);
    return true;
  };
  const comment = pre => { const cs = pre.match(/\/\*[\s\S]*?\*\//g); return cs ? cs[cs.length - 1] + '\n' : ''; };
  for (const t of tree) {
    rules.push(`\n/* ===== from design/hybrid/src/${t.f} ===== */\n`);
    for (const it of t.items) {
      if (it.kids) {
        const inner = [], tk = [];
        for (const k of it.kids) { const ps = parts(k.prelude).filter(p => keep.has(p)); if (!ps.length) continue; const root = ps.every(isRoot);
          (root ? tk : inner).push(`  ${ps.join(', ')} {${k.body}}\n`); }
        if (tk.length) tokens.push(`${it.prelude} {\n${tk.join('')}}\n`);
        if (inner.length) rules.push(`${comment(it.pre)}${it.prelude} {\n${inner.join('')}}\n`);
      } else emit(it, rules);
    }
  }
  for (const t of tree) walk(t.items, it => { const m = it.prelude.match(/^@keyframes\s+([\w-]+)/); if (m && keyframes.has(m[1])) used.push(`@keyframes ${m[1]} {${it.body}}\n`); });
  const faces = [
    `@font-face { font-family: 'BloomRegrade'; src: url('fonts/NeueRegrade-Variable.ttf') format('truetype'); font-weight: 300 800; font-style: normal; font-display: block; }`,
    `@font-face { font-family: 'BloomPlex'; src: url('fonts/IBMPlexMono-Regular.otf') format('opentype'); font-weight: 400; font-display: block; }`,
    `@font-face { font-family: 'BloomPlex'; src: url('fonts/IBMPlexMono-Medium.otf') format('opentype'); font-weight: 500; font-display: block; }`,
    `@font-face { font-family: 'BloomPlex'; src: url('fonts/IBMPlexMono-SemiBold.otf') format('opentype'); font-weight: 600; font-display: block; }`,
    `@font-face { font-family: 'Departure'; src: url('fonts/DepartureMono-Regular.woff2') format('woff2'); font-weight: 400; font-display: block; }`];
  fs.mkdirSync(path.join(OUT, 'fonts'), { recursive: true });
  const head = what => `/* CONTROL ${VER.replace('v', 'version ')} · ${what}. GENERATED by design/hybrid/src/extract.cjs from the hybrid page's sources; edit the sources, then re-run. */\n`;
  fs.writeFileSync(path.join(OUT, 'tokens.css'), head('tokens: Field is :root, Night is [data-theme="night"]') + faces.join('\n') + '\n\n' + tokens.join('\n'));
  fs.writeFileSync(path.join(OUT, 'control-v1.css'), head('every rule that draws the window, in cascade order') + rules.join('\n') + '\n/* ===== keyframes ===== */\n' + used.join('\n'));
  for (const [from, to] of [['../bloom/fonts/NeueRegrade-Variable.ttf', 'NeueRegrade-Variable.ttf'], ['../mock/fonts/IBMPlexMono-Regular.otf', 'IBMPlexMono-Regular.otf'],
    ['../mock/fonts/IBMPlexMono-Medium.otf', 'IBMPlexMono-Medium.otf'], ['../mock/fonts/IBMPlexMono-SemiBold.otf', 'IBMPlexMono-SemiBold.otf'],
    ['fonts/DepartureMono-Regular.woff2', 'DepartureMono-Regular.woff2'], ['fonts/DepartureMono-LICENSE.txt', 'DepartureMono-LICENSE.txt']])
    fs.copyFileSync(path.join(HY, from), path.join(OUT, 'fonts', to));
  const sprite = fs.readFileSync(path.join(SRC, 'sprite.svg'), 'utf8');
  if (!fs.existsSync(path.join(OUT, 'behaviour.js'))) fs.copyFileSync(path.join(HY, 'v1', 'behaviour.js'), path.join(OUT, 'behaviour.js'));
  const behaviour = fs.readFileSync(path.join(OUT, 'behaviour.js'), 'utf8');
  fs.writeFileSync(path.join(OUT, 'index.html'), `<!doctype html>
<html lang="en-GB" data-theme="field" data-type="regrade" data-motion="full">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CONTROL ${VER}</title>
<!-- GENERATED by design/hybrid/src/extract.cjs. The window and the four panel tabs as static markup on tokens.css and control-v1.css.
     ?theme=night, ?motion=reduce. Open DevTools on any element for its exact computed style. -->
<script>(() => { const h = document.documentElement, q = new URLSearchParams(location.search);
  if (q.get('theme') === 'night') h.dataset.theme = 'night'; if (q.get('motion') === 'reduce') h.dataset.motion = 'reduce'; })();</script>
<link rel="stylesheet" href="tokens.css">
<link rel="stylesheet" href="control-v1.css">
<style>body { padding: 24px; background: var(--field); } .v1-panels { display: flex; flex-wrap: wrap; gap: 24px; margin-top: 24px; } .v1-panels > .t3w { flex: none; }</style>
</head>
<body>
${sprite}
${win}
<div class="v1-panels">
${panels.join('\n')}
</div>
<script>
${behaviour}
</script>
</body>
</html>
`);
  console.log(`kept ${keep.size} of ${selectors.size} selectors; ${tokens.length} token blocks, ${used.length} keyframes${bad.size ? '; unparsable: ' + [...bad].join(' | ') : ''}`);
  const outside = [...keep].filter(s => !SCAFFOLD.includes(s) && /\.(bl-|s-shell-|fig\b|cap\b)/.test(s));
  if (outside.length) console.log('selectors that lean on the page around the window:\n  ' + outside.join('\n  '));
})();
