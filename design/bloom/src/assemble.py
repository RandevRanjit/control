#!/usr/bin/env python3
"""Assemble design/bloom/index.html from the shell (tokens, base, lib, runtime, sprite, reel) and the section parts.

usage:
  python3 assemble.py                       # every part present -> design/bloom/index.html
  python3 assemble.py --only colour         # one or more parts (comma list) -> a preview file
  python3 assemble.py --only _test --out /path/x.html

A part is parts/<id>.html holding, at top level and in this order: one <style data-part="<id>">, one
<section id="<id>" class="bl-sec" ...>, one <script data-part="<id>">. The assembler lints each part and
prints warnings; fix every warning or say in your report why it stands.
"""

import argparse
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_BLOOM = os.path.dirname(HERE)  # design/bloom: src/ sits inside it
ORDER = [  # (id, nav label, prefix). Labels are short so eight sections fit one nav row at 1440.
    ("masthead", "Bloom", "mast"),
    ("colour", "Colour", "colour"),
    ("motion", "Motion", "motion"),
    ("form", "Form", "form"),
    ("window", "Window", "win"),
    ("chat", "Without a terminal", "chat"),
    ("around", "Around", "around"),
    ("delta", "H13 delta", "delta"),
]
PREFIX = {i: p for i, _, p in ORDER}
PREFIX["_test"] = "test"


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
    section = src[a : b + len("</section>")]
    return "\n".join(styles), section, "\n".join(scripts)


EMOJI = re.compile(
    "[\U0001f300-\U0001faff☀-⛿]"
)  # not Dingbats: Claude's own ✻ is content


def lint(pid, css, section, js):
    w = []
    pre = PREFIX.get(pid, pid)
    head = re.match(r"<section\b[^>]*>", section).group(0)
    if f'id="{pid}"' not in head or "bl-sec" not in head:
        w.append(
            f'section tag must be <section id="{pid}" class="bl-sec ..."> (got {head[:80]})'
        )
    # every selector in the part's CSS must carry the section prefix
    body = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    for sel in re.findall(r"([^{};]+)\{", body):
        sel = sel.strip()
        if sel.startswith("@"):
            kf = re.match(r"@(?:-webkit-)?keyframes\s+([\w-]+)", sel)
            if kf and not kf.group(1).startswith(f"s-{pre}-"):
                w.append(f"keyframes name must start with s-{pre}-: {kf.group(1)}")
            continue  # @media / @supports / @container preludes
        if (
            not sel
            or sel.startswith(("from", "to"))
            or re.fullmatch(r"[\d.%,\s]+", sel)
        ):
            continue
        for s in sel.split(","):
            if f".s-{pre}-" not in s:
                w.append(f"selector without .s-{pre}- prefix: {s.strip()[:70]}")
    for m in re.finditer(r"([^{}]+)\{([^{}]*animation\s*:[^{}]*)\}", body):
        if 'data-motion="full"' not in m.group(1) and "data-motion=full" not in m.group(
            1
        ):
            w.append(
                f'looping/animated rule not guarded by html[data-motion="full"]: {m.group(1).strip()[:70]}'
            )
    hexes = set(re.findall(r"#[0-9a-fA-F]{3,8}\b", body))
    if hexes:
        w.append(
            f"literal colours in CSS (use tokens, or justify): {sorted(hexes)[:8]}"
        )
    if re.search(
        r":[^;{}]*\b(white|black)\b|rgba?\(\s*(0[\s,]+0[\s,]+0|255[\s,]+255[\s,]+255)\b",
        body,
    ):
        w.append(
            "pure black or white in CSS (darkest is --occlusion, lightest --overlay / --ink-1)"
        )
    if "!important" in body:
        w.append("!important in part CSS")
    if re.search(r"https?://", css + section + js):
        w.append("external URL in part (no network)")
    if "setInterval" in js:
        w.append("setInterval: drive motion from Bloom.section(...).tick(t) instead")
    if re.search(r"\bdocument\.timeline\b|getAnimations\(", js):
        w.append(
            "talks to the timeline directly: use Bloom.t(), Bloom.sync(), Bloom.seek()"
        )
    if "localStorage" in js:
        w.append("localStorage in a part: only the runtime stores preferences")
    if EMOJI.search(css + section + js):
        w.append("emoji found")
    if re.search(r"lorem|ipsum", section, re.I):
        w.append("placeholder text (lorem) found")
    if f"Bloom.section('{pid}'" not in js and f'Bloom.section("{pid}"' not in js:
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
  <a class="bl-wm" href="#top">{stair}CONTROL <em>Bloom</em></a>
  <nav class="bl-links" aria-label="Sections">{links}</nav>
  <div class="bl-ctrls">
    <div class="seg sm" data-bind="theme" role="group" aria-label="Theme"><button data-v="field" aria-pressed="true">Field</button><button data-v="night" aria-pressed="false">Night</button></div>
    <div class="seg sm" data-bind="type" role="group" aria-label="Chrome typeface"><button data-v="regrade" aria-pressed="true">Regrade</button><button data-v="rounded" aria-pressed="false">Rounded</button></div>
    <button class="pill ghost sm" data-act="play" aria-pressed="true">Pause</button>
    <div class="seg sm" data-bind="rate" role="group" aria-label="Speed"><button data-v="0.25" aria-pressed="false">&#188;&#215;</button><button data-v="0.5" aria-pressed="false">&#189;&#215;</button><button data-v="1" aria-pressed="true">1&#215;</button></div>
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
  h.dataset.type = pick('type', ['rounded', 'regrade'], 'regrade');
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
        os.path.dirname(os.path.abspath(out)) != REPO_BLOOM
    ):  # previews elsewhere: point fonts at the repo files
        base = base.replace("url('fonts/", f"url('file://{REPO_BLOOM}/fonts/").replace(
            "url('../mock/fonts/",
            f"url('file://{os.path.dirname(REPO_BLOOM)}/mock/fonts/",
        )
    doc = f"""<!doctype html>
<html lang="en-GB" data-theme="field" data-type="regrade" data-motion="full">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CONTROL Bloom</title>
<meta name="description" content="Design review 04, revision 2: CONTROL in the Bloom aesthetic. State colour in flowing bars, lamps that only move, pearls in the chrome, and a centre without a terminal.">
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
{"".join(f'<style data-part="{p}">{c}</style>' + chr(10) for p, c, _, _ in parts)}</head>
<body>
{read("sprite.svg")}
{nav_html(ids)}
<main class="bl-sheet" id="top">
{chr(10).join(s for _, _, s, _ in parts)}
</main>
<footer class="bl-foot"><p>Design review 04 · Bloom, revision 2 · 6 Oct 2026. Sources: the Bloom reel ('Bloom' by teknosis_sis) and its measured spec; docs/VISION.md; docs/specs/2026-09-30-control-design.md (H13 unedited); design/tokens.toml; design/v2 (direction D); design/mock (reviews 01 and 02); Claude Code's channels documentation and the fakechat plugin. Session names are the owner's working set; every number in the mocks is invented sample data, every number in the prose is measured or computed.</p>
<p style="margin-top:8px">Screenshots: <code>?shot=&lt;section&gt;</code>, <code>&amp;fig=&lt;figure&gt;</code>, <code>&amp;theme=field</code>, <code>&amp;type=regrade</code>, <code>&amp;motion=reduce</code>, <code>&amp;t=&lt;ms&gt;</code> freezes every loop at that moment of the 14 s clock.</p></footer>
<script id="bloom-reel">{read("reel.js")}</script>
<script id="bloom-runtime">
{read("runtime.js")}
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
    ap.add_argument(
        "--out",
        help="output path (default: design/bloom/index.html, or a preview in build/preview/ with --only)",
    )
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
        else os.path.join(REPO_BLOOM, "index.html")
    )
    os.makedirs(os.path.dirname(out), exist_ok=True)
    build(ids, out)
