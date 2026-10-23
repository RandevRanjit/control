#!/usr/bin/env python3
"""Assemble design/hybrid/index.html from Bloom's shell (tokens, base, lib, runtime, sprite), the hybrid kit and the section parts.

usage:
  python3 assemble.py                       # every part present -> design/hybrid/index.html
  python3 assemble.py --only shell          # one or more parts (comma list) -> a preview in src/preview/

Parts follow Bloom's contract (design/bloom/src/assemble.py): one <style data-part>, one <section id class="bl-sec">,
one <script data-part> registering Bloom.section(id). The kit (kit.css, kit.js) is shared by every section.
"""

import argparse
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUTDIR = os.path.dirname(HERE)  # design/hybrid
DESIGN = os.path.dirname(OUTDIR)  # design
ORDER = [
    ("masthead", "Hybrid", "mast"),
    ("shell", "Shell", "shell"),
    ("groups", "Groups", "grp"),
    ("states", "States", "st"),
    ("picks", "Decisions", "pick"),
    ("lock", "Lock", "lk"),
    ("loose", "Loose ends", "le"),
    ("models", "Local models", "lm"),
    ("menubar", "Menu bar", "mb"),
]
PREFIX = {i: p for i, _, p in ORDER}


def read(name):
    with open(os.path.join(HERE, name), encoding="utf-8") as f:
        return f.read()


def parse_part(pid):
    src = read(os.path.join("parts", pid + ".html"))
    styles = re.findall(r"<style\b[^>]*>(.*?)</style>", src, re.S)
    scripts = re.findall(r"<script\b[^>]*>(.*?)</script>", src, re.S)
    a, b = src.find("<section"), src.rfind("</section>")
    if a < 0 or b < 0:
        sys.exit(f"[{pid}] no <section> found")
    return "\n".join(styles), src[a : b + len("</section>")], "\n".join(scripts)


def lint(pid, css, section, js):
    w = []
    pre = PREFIX[pid]
    head = re.match(r"<section\b[^>]*>", section).group(0)
    if f'id="{pid}"' not in head or "bl-sec" not in head:
        w.append(f'section tag must be <section id="{pid}" class="bl-sec ...">')
    body = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    for sel in re.findall(r"([^{};]+)\{", body):
        sel = sel.strip()
        if (
            sel.startswith("@")
            or not sel
            or sel.startswith(("from", "to"))
            or re.fullmatch(r"[\d.%,\s]+", sel)
        ):
            continue
        for s in sel.split(","):
            if f".s-{pre}-" not in s:
                w.append(f"selector without .s-{pre}- prefix: {s.strip()[:70]}")
    for m in re.finditer(r"([^{}]+)\{([^{}]*animation\s*:[^{}]*)\}", body):
        if 'data-motion="full"' not in m.group(1):
            w.append(
                f'animation not guarded by html[data-motion="full"]: {m.group(1).strip()[:70]}'
            )
    hexes = set(re.findall(r"#[0-9a-fA-F]{3,8}\b", body))
    if hexes:
        w.append(f"literal colours in CSS (use tokens): {sorted(hexes)[:8]}")
    if "!important" in body:
        w.append("!important in part CSS")
    if re.search(r"https?://", css + section + js):
        w.append("external URL in part (no network)")
    if "setInterval" in js or "localStorage" in js:
        w.append("setInterval / localStorage in a part")
    if re.search(r"lorem|ipsum", section, re.I):
        w.append("placeholder text (lorem) found")
    if f"Bloom.section('{pid}'" not in js:
        w.append(f"script does not register Bloom.section('{pid}', ...)")
    return w


def nav_html(ids):
    links = "".join(
        f'<a href="#{i}" aria-current="false">{t}</a>'
        for i, t, _ in ORDER
        if i in ids and i != "masthead"
    )
    stair = (
        '<svg width="19" height="12" viewBox="0 0 19 12" aria-hidden="true"><polyline points="1,11 1,9 4,9 4,6 7,6 7,3 10,3 '
        '10,6 13,6 13,9 16,9 16,11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" '
        'transform="translate(1 -1)"/></svg>'
    )
    return f"""<header class="bl-nav"><div class="bl-nav-in">
  <a class="bl-wm" href="#top">{stair}CONTROL <em>Hybrid</em></a>
  <nav class="bl-links" aria-label="Sections">{links}</nav>
  <div class="bl-ctrls">
    <div class="seg sm" data-bind="theme" role="group" aria-label="Theme"><button data-v="field" aria-pressed="true">Field</button><button data-v="night" aria-pressed="false">Night</button></div>
    <button class="pill ghost sm" data-act="play" aria-pressed="true">Pause</button>
    <span class="bl-still"><span class="t-cap">Still</span><button class="toggle" role="switch" data-act="still" aria-checked="false" aria-label="Preview Reduce motion"><i></i></button></span>
    <span class="bl-clock">t 00.00 s</span>
  </div>
</div></header>"""


FAVICON = (
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' "
    "fill='%232f2e2e'/%3E%3Cpolyline points='4,23 4,19.5 9,19.5 9,14.5 14,14.5 14,9.5 18,9.5 18,14.5 23,14.5 23,19.5 28,19.5 28,23' "
    "fill='none' stroke='%23f2e9e2' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"
)

PREPAINT = """(() => { const h = document.documentElement, q = new URLSearchParams(location.search); let s = {};
  try { s = JSON.parse(localStorage.getItem('bloom2') || '{}'); } catch (e) {}
  const pick = (k, ok, d) => { const v = q.get(k) || s[k]; return ok.includes(v) ? v : d; };
  h.dataset.theme = pick('theme', ['field', 'night'], 'field');
  h.dataset.type = 'regrade';
  const m = q.get('motion');
  h.dataset.motion = m === 'reduce' || m === 'full' ? m : (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduce' : 'full');
})();"""


def build(ids, out):
    parts = [(i, *parse_part(i)) for i in ids]
    warned = False
    for pid, css, sec, js in parts:
        for m in lint(pid, css, sec, js):
            warned = True
            print(f"WARN [{pid}] {m}")
    base = read("base.css")
    if (
        os.path.dirname(os.path.abspath(out)) != OUTDIR
    ):  # previews elsewhere: point fonts at the repo files
        base = base.replace("url('../", f"url('file://{DESIGN}/")
        base = base.replace("url('fonts/", f"url('file://{OUTDIR}/fonts/")
    doc = f"""<!doctype html>
<html lang="en-GB" data-theme="field" data-type="regrade" data-motion="full">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CONTROL Hybrid</title>
<meta name="description" content="Design review 05, settled: CONTROL v2 as T3 Code's app in Bloom's design. Version 1 is D.">
<link rel="icon" href="{FAVICON}">
<script>{PREPAINT}</script>
<style id="bloom-tokens">
{read("tokens.css")}
</style>
<style id="bloom-base">
{base}
</style>
<style id="bloom-lib">
{read("lib.css")}
</style>
<style id="hybrid-kit">
{read("kit.css")}
</style>
{"".join(f'<style data-part="{p}">{c}</style>' + chr(10) for p, c, _, _ in parts)}</head>
<body>
{read("sprite.svg")}
{nav_html(ids)}
<main class="bl-sheet" id="top">
{chr(10).join(s for _, _, s, _ in parts)}
</main>
<footer class="bl-foot"><p>Design review 05 · Hybrid, settled 8 Oct 2026 · version 1 is D (design/hybrid/HANDOFF.md). Sources: design/bloom (review 04, owner-confirmed), docs/HANDOFF-v2.md §4, docs/HANDOFF-design.md, T3 Code's web app at the fork point (apps/web/src). Session names are the owner's working set; every number in the mocks is invented sample data.</p>
<p style="margin-top:8px">Screenshots: <code>?shot=&lt;section&gt;</code>, <code>&amp;fig=&lt;figure&gt;</code>, <code>&amp;theme=field|night</code>, <code>&amp;motion=reduce</code>, <code>&amp;t=&lt;ms&gt;</code> freezes every loop at that moment of the 14 s clock.</p></footer>
<script id="bloom-runtime">
{read("runtime.js")}
</script>
<script id="hybrid-kit-js">
{read("kit.js")}
</script>
{"".join(f'<script data-part="{p}">{j}</script>' + chr(10) for p, _, _, j in parts)}<script>Bloom.start();</script>
</body>
</html>
"""
    with open(out, "w", encoding="utf-8") as f:
        f.write(doc)
    print(
        f"wrote {out} ({len(doc) // 1024} KB, parts: {', '.join(ids)}){' with warnings' if warned else ''}"
    )


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="comma list of part ids")
    ap.add_argument("--out")
    a = ap.parse_args()
    present = [
        i
        for i, _, _ in ORDER
        if os.path.exists(os.path.join(HERE, "parts", i + ".html"))
    ]
    ids = a.only.split(",") if a.only else present
    out = a.out or (
        os.path.join(HERE, "preview", "-".join(ids) + ".html")
        if a.only
        else os.path.join(OUTDIR, "index.html")
    )
    os.makedirs(os.path.dirname(out), exist_ok=True)
    build(ids, out)
