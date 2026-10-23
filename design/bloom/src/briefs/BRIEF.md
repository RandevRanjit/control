# BRIEF: the CONTROL Bloom design doc (binding)

Art director's build brief for `design/bloom/index.html`. Seven builders each write one section. This brief is the only document you need: it carries the thesis, the tokens, the page mechanics, the component library, your section's plan, the craft rules and every number you may print. Where it points you at a source file, it names the exact lines. Do not read the four specialist briefs beyond the lines you are pointed at.

Paths used below:

| Name    | Path                                                                                                                                                                             |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REPO`  | `/Users/me/Projects/control/.claude/worktrees/v2-design-expl`                                                                                                                    |
| `OUT`   | `REPO/design/bloom/index.html` (the deliverable; written only by the assembler)                                                                                                  |
| `BUILD` | `/private/tmp/claude-501/-Users-me-Projects-control/0d14c67f-3607-47f9-97f8-d8ee459b96f9/scratchpad/brief/build`                                                                 |
| `SRC`   | `/private/tmp/claude-501/-Users-me-Projects-control/0d14c67f-3607-47f9-97f8-d8ee459b96f9/scratchpad/brief` (`colour.md`, `motion.md`, `bloom.md`, `inventory.md`, `motion-kit/`) |

---

## 0. How the build works

- **The shell is done and tested.** `BUILD/tokens.css`, `base.css`, `lib.css`, `runtime.js`, `sprite.svg` and `reel.js` are the page's foundation. They are reproduced in the appendices. **Section builders never edit them.** If you need a change, say so in your report; work around it locally meanwhile with section-prefixed CSS.
- **You write one file:** `BUILD/parts/<id>.html`, holding at top level, in this order:
  1. one `<style data-part="<id>">` (every selector carries your prefix, see §5);
  2. one `<section id="<id>" class="bl-sec s-<prefix>-root">` (all your markup);
  3. one `<script data-part="<id>">` that calls `Bloom.section('<id>', { init, tick, theme })`.
- **Preview:** `python3 BUILD/assemble.py --only <id>` writes `BUILD/preview/<id>.html` (fonts resolve to the repo) and lints your part. Fix every `WARN`, or justify it in your report.
- **Check** (no visible windows, ever; these are all headless):
  - `node BUILD/shotcdp.js BUILD/preview/<id>.html "<query>" <out.png> <width> <height> <wait-ms> <full:0|1>`: real-time screenshot at any width; prints `HORIZONTAL OVERFLOW` if the page scrolls sideways.
  - `node BUILD/probe.js BUILD/preview/<id>.html "<query>" <wait-ms> "<js>"`: prints console output, exceptions and the result of `<js>`.
  - `BUILD/shot.sh <file> "<query>" <out.png> <w> <h>`: virtual-time screenshot (fast; minimum width 500 px).
- **Final assembly** is the controller's job: `python3 BUILD/assemble.py` (no flags) writes `OUT` from every part present, in section order.
- **Definition of done** for a part:
  1. `assemble.py --only <id>` prints no `WARN` you haven't justified.
  2. `probe.js` after 3000 ms shows no `EXCEPTION` and no `console.error`.
  3. You looked at: Night and Field at 1440 wide (full page), 390 wide (no overflow), `motion=reduce`, `type=regrade`, and two `?t=` values. Name the PNGs in your report.
  4. Every number you printed appears in §9 (number bank) or in the source lines you were pointed at. List any number you were unsure of.
  5. Report: the part path, the figure ids you built, what you left out and why, and any shell change you need.

---

## 1. Thesis

Bloom brings three things to CONTROL: **colour that means something, light as a choice, and motion on one clock.** It borrows the reel's system, not its flower: a cool field that is the blue family turned down, three softened primaries that only ever meet through cream or navy, inflated forms shaded with navy instead of grey, and every loop a power-of-two division or multiple of 7 seconds. What stays CONTROL is everything that makes it a tool: the terminal is the hero and the chrome stays calm; only arm red means _needs you_, and danger means destructive; state reads by shape first, then motion, then colour; Reduce motion stills every loop. Night stays the default, and Field is the same system with the lights on.

---

## 2. Decisions and the conflicts they settle

Fixed with the owner before this brief: one self-contained HTML doc in the family of `design/v2` and `design/mock`; dark-first ("Bloom Night") with a light, colourful "Bloom Field" on `#D6DEEE`; heavy focus on animation and colour theory; no hard lines (no hairline grid, soft inflated forms, radius); chrome face Rounded (Nunito standing in for SF Pro Rounded) with Neue Regrade on trial, Plex Mono for data; H13 treated as an exploration (spec unedited), ending in one panel that lists what Bloom would amend.

Where the sources disagree, this is binding:

| #   | Conflict                                                                                                                                       | Ruling                                                                                                                                                                                                       | Why                                                                                                                              |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Master loop: spec says 7 s, six identical cycles; bloom.md says the true loop is 14 s (two mirrored 7 s halves)                                | T = 7 s for colour and state; 14 s is the LCM and the clock's epoch, and the period of idle and housekeeping                                                                                                 | Colour repeats every 7 s; geometry every 14 s (bloom.md §1). Both are powers of two of 7 s                                       |
| 2   | Spec's 3.5 s head bob and "bloom open/close"                                                                                                   | Never quoted as measurements                                                                                                                                                                                 | bloom.md §1: aliasing at 0.7 s sampling                                                                                          |
| 3   | Night field: spec `#1B1F3F`, bloom.md `#0A1535`, colour.md `#131528`                                                                           | `#131528`                                                                                                                                                                                                    | Same text contrast as today's paper (15.0:1 vs 15.5:1); less chroma, so cream inks don't yellow after hours (colour.md §0, §2.1) |
| 4   | Cream, navy, crimson: bloom.md re-measured plateaus (`#ECD6C6`, `#0A1535`, `#DC0042`); spec's k-means values (`#DBC3C2`, `#262B5B`, `#D11E4A`) | Tokens use colour.md (k-means cream and navy; Bloom reds turned to raspberry). The plateau measurements appear only as measurement notes in Colour C1                                                        | Every contrast and CVD proof was computed on colour.md's values                                                                  |
| 5   | Needs-you: bloom.md crimson bullseye; colour.md arm                                                                                            | **Arm** (`#ff4438` Night, `#d90e0b` Field, each with a Display P3 value). bloom.md's bullseye survives as needs-you's _shape_: the still ring at 1.7×                                                        | The two-red law keeps its meaning; a hue moat keeps Bloom's reds 21.6° or more from arm                                          |
| 6   | Danger: bloom.md wine `#86253E`; colour.md terracotta `#d98d73` / rust `#9b3a20`                                                               | colour.md. Wine `#5c2b40` survives only as the dark transition bridge                                                                                                                                        | colour.md measured arm vs danger (ΔE 0.138 / 0.121)                                                                              |
| 7   | Usage past 80 %: bloom.md shifts beads to crimson via wine                                                                                     | No red. Filled beads step lightness (Night to the light step, Field to the deep step) and the leading bead breathes                                                                                          | Near the limit is neither needs-you nor destructive (colour.md §5.7, motion.md §10.5)                                            |
| 8   | 5H/7D: both blue (bloom.md) vs blue + green (colour.md)                                                                                        | 5H blue, 7D green                                                                                                                                                                                            | Two series, two families                                                                                                         |
| 9   | Needs-you motion: 3.5 s breathe (bloom.md) vs 1.75 s beat + ripple (motion.md)                                                                 | Beat + ripple; listed as open call Q1                                                                                                                                                                        | A ±0.04 L change is below peripheral detection; needs-you must out-shout everything                                              |
| 10  | Done: single 875 ms bloom + 7 s glint vs 3.5 s beckon                                                                                          | Beckon; open call Q2                                                                                                                                                                                         | Done ranks second; fire-and-forget means done must be findable                                                                   |
| 11  | Failed and choose-on-return: still vs moving                                                                                                   | Moving (stumble, tide); open call Q3                                                                                                                                                                         | H13: every state has its own motion                                                                                              |
| 12  | State-change length: 875 ms vs 437.5 ms                                                                                                        | 437.5 ms; 218.75 ms into needs-you                                                                                                                                                                           | Hooks flip states every few hundred ms; three ~145 ms bands still read as stripes                                                |
| 13  | Old D blink argument: colour.md §7.11 compares arm's 4.5:1 step blink with the safe ramp's 1.14:1 drift                                        | The doc says D's blink swung 4.5:1 and **retires**; Bloom's needs-you never dims. The safe ramp's 1.14:1 still explains why working never flashes                                                            | Motion retires every step (motion.md §8.2)                                                                                       |
| 14  | Puffy: spec's 28 px gloss pills; bloom.md bans them in the tool; the owner asked for soft forms                                                | Controls are pills and rounded rects with a soft material (cream or light lip on top, navy occlusion underneath, no gloss, no white). The 28 px `.puffy` exists only for doc-level hero and showcase objects | Softness without toy gloss in a dense tool                                                                                       |
| 15  | Rounded type: bloom.md calls it kitsch for body and terminal; owner chose a rounded chrome                                                     | Rounded (or Regrade) for chrome, prose and headings. Plex for anything you could paste into a shell: terminal, diffs, code, paths, session and branch names, numbers, keys, chips                            | Content is never decorated                                                                                                       |
| 16  | Night rim: 18–22 % (bloom.md) vs 0.45 (colour.md)                                                                                              | Both, different jobs: `--rim-mix` 0.45 at bead silhouettes (the 3:1 proof); a 20 % cream `--lip` on the top edge of controls                                                                                 | colour.md §7.8, Appendix I                                                                                                       |
| 17  | Done shape: motion kit's centred core vs D's corner square                                                                                     | Corner dot, top right (`.st-done`); housekeeping keeps the centred core                                                                                                                                      | No two states share a shape (D)                                                                                                  |
| 18  | `in oklab` gradients (colour.md) vs baked sRGB stops (motion.md)                                                                               | No `in oklab` in CSS: what the doc draws is what `CAGradientLayer` can draw. Transitions are 3 % wide, so the difference is not visible                                                                      | App parity                                                                                                                       |
| 19  | A "toast" component vs "CONTROL posts no banners, toasts or pop-ups" (inventory §1.11)                                                         | `.toast` is an in-place note inside its own region (selection bar, lock offer, unlock digest, PEER note, break-through band). Never floating, never takes focus, never over the terminal                     | Owner principle F26                                                                                                              |
| 20  | Spec's white top lift `rgba(255,255,255,.28)`                                                                                                  | `--lift` (ink-1 at 10 % in Night, overlay at 55 % in Field)                                                                                                                                                  | Nothing pure white                                                                                                               |
| 21  | Lamp size 8 pt (D) vs 10 px (kit)                                                                                                              | 10 px in rows, 24 px in showcases                                                                                                                                                                            | Ring + core shapes need the extra 2 px                                                                                           |
| 22  | Group header bead strips (bloom.md) vs the de-dup rule                                                                                         | A lamp strip only on folded or locked groups, where the rows are hidden                                                                                                                                      | "Each fact appears once per region"                                                                                              |
| 23  | Menu-bar panel header: chains with numbers on hover (bloom.md)                                                                                 | Chain plus the count, always visible                                                                                                                                                                         | Hover is not a glance                                                                                                            |
| 24  | Spec §7.6 WebGL hero                                                                                                                           | CSS beads; no WebGL, no libraries                                                                                                                                                                            | Performance, no network                                                                                                          |
| 25  | Needs-you halo in `BloomMotion.swift` (2.2×, .5 → 0) vs motion.md's table and CSS (2.4×, .7 → 0)                                               | 2.4×, .7 → 0. Quote the Swift with those values                                                                                                                                                              | The table and the tested CSS agree                                                                                               |
| 26  | Field rest-share numbers: colour.md (object share: blue 55 %, red 68/75 %, green 74 %) vs bloom.md (head region: B 95, R 90/97, G 76)          | Both are real; always say which: "of the object" or "of the head"                                                                                                                                            | Different denominators                                                                                                           |

---

## 3. Tokens

The complete token file is **Appendix A** (`tokens.css`). Night is `:root` and `[data-theme="night"]`; Field is `[data-theme="field"]`. Both selectors work on any element, so a figure can force a theme with `data-theme="field"` plus `class="themed"`.

**Rules for using tokens**

- Never type a colour in CSS. Use the role tokens first (`--text-*`, `--lamp-*`, `--trace-*`, `--diff-*`, `--use-*`, `--focus`, `--link`, `--selection`), then the family tokens. The only literal colours allowed in a part are: D's old palette in Form F2's comparison, a PDF's or a website's own colours, the Obsidian gem, simulated CVD colours (Colour C12), the H13 diff pair (Colour C10), and measured reel colours shown as data. Prefer putting them in JS data rather than CSS. The lint will warn; justify each in your report.
- `--ramp` (hero ramp) only in: the masthead hero, Colour C6 and C9's pre-emption demo, Form F5's small bead stair, the lock plate, the app icon. Everything next to state uses `--ramp-safe`.
- `--arm` only on the needs-you lamp, its ripple, its row tint (`--needs-tint`) and the arm figures in Colour C8, C9 and C12. **Arm is never text and never a fill larger than a lamp** (C9's distance chart bars are data, the one exception).

**Colour tokens at a glance** (values in Appendix A)

| Group          | Tokens                                                                                                          | Job                                                                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Surfaces       | `--field --sunken --raised --overlay --seam --occlusion`                                                        | Field is the page and the terminal. Raised: chrome, cards. Overlay: floating things. Sunken: wells. Seam: the only "line". Occlusion: navy shading only |
| Inks           | `--ink-1 … --ink-4 --ghost --cream --navy`                                                                      | Night inks are warm (h 45–61) at the light end and cool below; Field inks are Bloom's navy                                                              |
| Two reds       | `--arm --arm-dim --danger`                                                                                      | Needs you; the unlit half of an arm bead; destructive consequence                                                                                       |
| Families       | `--rose-* --green-* --blue-*` × `light base deep wash word`, `--lilac-light` (+ `--lilac-deep` in Field)        | Rose: the removed-diff wash and hero only. Green: made, complete, done. Blue: looking, navigation, focus                                                |
| Identity       | `--id-rose --id-butter --id-sage --id-mint --id-peri --id-lilac`                                                | Group tints: a bead or edge marker, never text                                                                                                          |
| Ramps          | `--ramp --ramp-safe`                                                                                            | Stop lists: use inside `linear-gradient(…)`                                                                                                             |
| Material (+)   | `--puff --puff-ink --occl --occl-deep --occl-light --lip --lip-hi --lift --well --float --rim-mix --needs-tint` | Inflated controls, wells, floating overlays, row echo                                                                                                   |
| Motion kit (+) | `--wine --lamp-bg --rs-a/b/c --chain-empty --wave-hi --hot-5h --hot-7d --toggle-on`                             | Bridges and component colours                                                                                                                           |

**Type**

| Token                        | Value                                                                                                          | Use                                                                                        |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `--f-chrome`                 | Rounded by default; `html[data-type="regrade"]` swaps it to Regrade                                            | Chrome, prose, headings, labels, buttons, state words                                      |
| `--f-rounded`                | `'BloomRounded'` = `fonts/Nunito-Variable.ttf` (wght 200–1000), standing in for SF Pro Rounded                 |                                                                                            |
| `--f-regrade`                | `'BloomRegrade'` = `fonts/NeueRegrade-Variable.ttf` (wght 300–800), falling back to Rounded for missing glyphs | Regrade has no `…` `→` `⌘` `⌥` `⇧` and no tabular figures                                  |
| `--f-mono`                   | `'BloomPlex'` = `../mock/fonts/IBMPlexMono-{Regular,Medium,SemiBold}.otf` (400/500/600)                        | Terminal, diffs, code, paths, session and branch names, numbers, keys, chips, the wordmark |
| `--w-reg --w-med --w-strong` | Rounded 500 / 620 / 760; Regrade 400 / 520 / 640                                                               | Nunito runs light, so it sits about 100 heavier for the same colour on the page            |

The static `NeueRegrade-{Regular,Medium,Semibold}.otf` files are the AppKit candidates; the page loads only the variable files. Neither chrome face has `⌘ ⌥ ⇧`; they fall back to the system font. `⌃` is drawn as a path where it matters (nav keys in Form F4 note this). Use the `.t-*` classes in `base.css` for the doc's type scale. **Gotcha:** custom properties resolve where they are defined, so to force a face locally (Form F4 specimens) set `font-family` directly, not `--f-chrome`.

**Radius:** `--r-xs 4` (code spans, diff word marks) · `--r-s 6` (keycaps, small swatches) · `--r-m 10` (rows, inputs, square buttons) · `--r-l 14` (panes, viewers, panels, popovers, menu-bar panel) · `--r-win 16` (window frame) · `--r-xl 20` (sheets, doc cards) · `--r-puffy 28` (doc hero and showcase objects only) · `--r-pill 999` (buttons, segmented controls, toggles, chips, chains). In AppKit every radius is `cornerCurve = .continuous`.

**Space:** doc scale `--s-1 … --s-10` = 4, 8, 12, 16, 24, 32, 48, 64, 96, 144 px. App mocks keep the app's own sizes (inventory §4, lines 493–532): rows 40, group 28, worktree 22, band 42, heads 34, tool row 30, sidebar 272, panel 440, terminal cell 7.2 × 17 at 12 px.

**Motion:** `--T 7s · --T2 14s · --T-breath 3.5s · --T-beat 1.75s` (loops); `--d-tap 109.375ms · --d-quick 218.75ms · --d-state 437.5ms · --d-scene 875ms` (one-shots); `--e-sine (.37,0,.63,1) · --e-out (.61,1,.88,1) · --e-in (.12,0,.39,0) · --e-settle (.25,1,.5,1)` and `linear`. The same values are on `Bloom.T`, `Bloom.D`, `Bloom.E` in JS. **Linear means work, sine means waiting, still means nothing to do.** No curve leaves y ∈ [0, 1], so overshoot is impossible; never write a spring or a bounce.

---

## 4. Page mechanics (all provided by the shell)

**Head pre-paint script** sets `html[data-theme|data-type|data-motion]` before first paint from: URL param, then stored preference (theme, type only), then defaults (Night, Rounded; motion = `reduce` if `prefers-reduced-motion: reduce`, else `full`). Night never follows the system appearance: dark-first is the owner's call.

**Sticky nav** (`.bl-nav`, solid `--field` with a 24 px fade underneath, no line): the stair mark + `CONTROL` wordmark (Plex 600, .26em) + "Bloom"; section links (pill highlight on the section in view); controls:

- **Night | Field** segmented: `Bloom.setTheme(v, x, y)` blooms a scrim of the bridge colour from the toggle (cream into Field, navy into Night), swaps under cover, dissolves. Lightness only ever moves one way. Stored.
- **Rounded | Regrade** segmented: instant swap of `--f-chrome`. Stored.
- **Pause / Play**: freezes or resumes every loop and every scripted demo on the page together.
- **¼× ½× 1×**: slows every loop and every one-shot together, to judge transitions.
- **Still** switch: previews Reduce motion (`html[data-motion="reduce"]`): every loop stops at its still pose, one-shots become ≤ 219 ms dissolves.
- **Clock readout** `t 03.50 s` (Plex, position in the 14 s cycle).
- Wraps to two rows under 1180 px; the rate control and readout hide under 520 px.

**One clock.** Every infinite CSS or WAAPI animation on the page is given the same `startTime` (the epoch) by the runtime, so every loop is phase-locked: a lamp added later lands exactly in step (tested: 149 loops, one start time; pause, play, rate change and Still all keep them locked). Consequences for you:

- Write loops as CSS animations guarded by `html[data-motion="full"]` and `:not(.still)`. Put cue offsets in `animation-delay` (negative). The base style is the still pose.
- Never call `document.getAnimations()`, never set `startTime`, never use `setInterval` or your own `requestAnimationFrame` loop. Script-driven demos compute their state **from `t`** in `tick(t, el)`, so `?t=` shots are exact and Pause freezes them too.
- If you add an animation by changing inline `style` (not a class), call `Bloom.sync()` afterwards.

**Off-screen sections pause.** An `IntersectionObserver` (25 % margin) marks each `.bl-sec` `data-off="1"` when out of view; the runtime pauses its loops and stops calling its `tick`. When it returns, its loops re-lock to the clock. Keep every animation inside your section.

**URL parameters** (combine freely): `?theme=night|field` · `&type=rounded|regrade` · `&motion=full|reduce` · `&t=<ms>` (pause every loop and demo at that moment of the clock) · `&shot=<section-id>` (only that section, no nav or footer, 24 px padding) · `&fig=<data-fig>` (with `shot`: only that figure). Give every figure a `data-fig` id that is stable and unique within your section (the ids in §6).

**Network:** none. Fonts are local; the reel thumbnails are inline (`Bloom.reel`, 47 KB). No CDN, no Google Fonts, no images from the web.

**Runtime API** (`window.Bloom`; full code in `BUILD/runtime.js`)

| Call                                                                                                                  | Does                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Bloom.section(id, { init(el), tick(t, el), theme(name, el) })`                                                       | Register your section. `init` once (build DOM here); `tick` every frame while on screen and playing, and once after a seek; `theme` after a theme switch                                                             |
| `Bloom.t()`                                                                                                           | Clock time in ms (frozen while paused). Phase in a loop: `t % 7000`, `t % 14000`                                                                                                                                     |
| `Bloom.reduced()`, `Bloom.paused()`                                                                                   | Still mode on? Clock paused?                                                                                                                                                                                         |
| `Bloom.seek(ms)`, `Bloom.play()`, `Bloom.pause()`, `Bloom.setRate(r)`                                                 | Drive the clock (Motion's scrubber uses `seek`)                                                                                                                                                                      |
| `Bloom.lamp(state, {d, still, cls, label})`                                                                           | HTML string for a lamp. States: `needs working bg done failed choose house outside idle gone`                                                                                                                        |
| `Bloom.setLamp(el, state)`                                                                                            | The only way to change a lamp: plays rest → bridge → settle (437.5 ms; 218.75 ms + arrival bloom into needs), echoes `data-st` on its `.session-row`, updates pre-emption. Dissolves under Still; jumps while paused |
| `Bloom.preempt(region?)`                                                                                              | Re-check `[data-region]` elements: any lit needs-you sets `data-preempt`, which turns every hero ramp inside to the safe ramp                                                                                        |
| `Bloom.chainHTML(n, v, kind, {still, label})` with kind `'5h'`, `'7d'` or `'progress'`; `Bloom.setChain(el, v)`       | Bead chain; marks the striped leading bead and `.hot` from 80 %                                                                                                                                                      |
| `Bloom.wave(n)`                                                                                                       | Background{n} chain (cap 7, then `+k`)                                                                                                                                                                               |
| `Bloom.ring({r, b, still})`                                                                                           | The 15-bead wait                                                                                                                                                                                                     |
| `Bloom.seg(el, onChange(value, button))`                                                                              | Wire a `.seg`; adds the sliding pill                                                                                                                                                                                 |
| `Bloom.rise(el)`, `Bloom.sink(el)`                                                                                    | A `.toast` or bar arriving (12 px rise, 219 ms settle) or leaving (109 ms)                                                                                                                                           |
| `Bloom.enterRow(w)`, `Bloom.leaveRow(w)`, `Bloom.resort(list, applyFn)`, `Bloom.openPanel(p)`                         | Row enter / leave (wrapper `<div style="display:grid;grid-template-rows:1fr"><div style="min-height:0;overflow:hidden">row</div></div>`), FLIP re-sort, panel slide                                                  |
| `Bloom.animate(el, keyframes, opts)`                                                                                  | Any other one-shot: follows rate and pause                                                                                                                                                                           |
| `Bloom.setTheme(name, x, y)`                                                                                          | Theme switch with the bridge scrim from (x, y)                                                                                                                                                                       |
| `Bloom.stairPts(x0, y0, g)`, `Bloom.stairSVG(g, sw, {shut, paint, cls, label})`, `Bloom.stairBeads(g, pitch, {shut})` | The L3 stair (inventory §5): points, a round-joined SVG, bead centres at equal arc length (`{beads:[{x,y,s}], w, h, length}`; `g = {t:1,r:1,a:1,f:.5}` with pitch .5 gives 21 beads open, 30 shut)                   |
| `Bloom.gi(name, cls)`                                                                                                 | A glyph from the sprite: `ctrl wt spin chev-r chev-l chev-d hgf hge plus x set side panel find trace out folder file web git undock pick shot reload mail sess chat lock play pause`                                 |
| `Bloom.fit(root?)`                                                                                                    | Scale `.bl-scale[data-w][data-h]` figures to their column (also runs on resize)                                                                                                                                      |
| `Bloom.token(name, el?)`                                                                                              | Read a CSS variable's computed value                                                                                                                                                                                 |
| `Bloom.reel`                                                                                                          | `{credit, frames: [{t, src}] × 10 (0.0–6.3 s, 216 × 384), still: {t: 34.3, src} (432 × 768)}`: WebP data URIs of the reel's first cycle and its cleanest frame                                                       |
| events                                                                                                                | `document.addEventListener('bloom:theme' \| 'bloom:type' \| 'bloom:motion' \| 'bloom:clock', e => e.detail)`                                                                                                         |

**Section markup frame** (copy it):

```html
<section id="colour" class="bl-sec s-colour-root">
  <header class="bl-sh">
    <div class="no">02 <span class="bl-steps"></span></div>
    <!-- runtime fills the 7 step beads -->
    <h2>Colour</h2>
    <p class="meta">Two themes, three families, two bridges. Every number computed in OKLCH.</p>
  </header>
  <p class="bl-lead">…</p>
  <h3 class="bl-sub"><span class="id">C1</span>What the reel measures as</h3>
  <div class="bl-prose"><p>…</p></div>
  <figure class="fig" data-fig="measured" data-region>
    …
    <figcaption class="cap"><span class="id">C1</span><b>Title.</b> Note.</figcaption>
  </figure>
</section>
```

---

## 5. Component library

All CSS is **Appendix C** (`lib.css`), tested in both themes, both faces, Still mode and at 390 px. Section prefixes for your own CSS:

| Section id | Prefix       | Root class      |
| ---------- | ------------ | --------------- |
| `masthead` | `.s-mast-`   | `s-mast-root`   |
| `colour`   | `.s-colour-` | `s-colour-root` |
| `motion`   | `.s-motion-` | `s-motion-root` |
| `form`     | `.s-form-`   | `s-form-root`   |
| `window`   | `.s-win-`    | `s-win-root`    |
| `around`   | `.s-around-` | `s-around-root` |
| `delta`    | `.s-delta-`  | `s-delta-root`  |

Every selector in your `<style>` must contain your prefix, and every `@keyframes` name must start with it without the dot (`s-motion-orbit`); the lint checks both. You may _combine_ a shared class with yours (`.s-win-side .session-row`), never restyle a shared class globally. Never use `#id` selectors (ids are for anchors and `data-fig` for shots). Put section-level custom properties on your root class (`.s-colour-root { --s-colour-gap: 24px }`).

| #   | Component                                                  | Markup                                                                                                                                                                                                                                                                                                                                                                    | Variants and rules                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Inflated surface** `.puffy`                              | `<div class="puffy" data-hue="rose"></div>`                                                                                                                                                                                                                                                                                                                               | Radius 28, soft top lift, navy occlusion underneath, top lip. `data-hue` = `rose`, `green`, `blue`, `cream` or `navy`; `.sm` (radius 14, shallower). Per theme by tokens: Night occlusion `#060714` at .55 and a cream lip at 20 %; Field navy `#262b5b` at .16 and a near-white lip. **Doc-level hero and showcase objects only**, never app chrome                                                                                                                                                                                                                  |
| 2   | **Bead** `.bead`                                           | `<span class="bead" style="--b:24px;--c:var(--green-base)"></span>`                                                                                                                                                                                                                                                                                                       | One inflated sphere, 12 px and up: body colour, occlusion toward the lower edge (to `--occlusion` at 85 %), lift on top, cream rim at the silhouette by `--rim-mix` (0.45 Night, 0.30 Field). `.flat` drops the shading (use under 12 px)                                                                                                                                                                                                                                                                                                                             |
| 3   | **Ramp flow** `.ramp-flow`                                 | `<div class="ramp-flow x" style="height:64px"></div>`; flowing bead: `<span class="bead ramp-flow breathe" style="--b:56px;--k:.25;--tile:1000%"></span>`                                                                                                                                                                                                                 | Colour travels, the shape never moves (compositor-only translate of a doubled tile). `--k` 0..1 = phase along a chain or ring (its delay and its still pose); `--tile` = one ramp period as % of the element (100 % for bands, 1000 % for beads: a bead then rests in one plateau and a bridge passes through it); `--rp` = period (default 7 s; the lock band uses `var(--T2)`). `.x` horizontal; `.safe` uses `--ramp-safe`; `.breathe` adds the 3.5 s .94 breath, phase-lagged by `--k`; `.still` freezes it. Inside `[data-preempt]` every hero ramp becomes safe |
| 4   | **Lamp** `.lamp.st-*`                                      | `Bloom.lamp('working')` → `<span class="lamp st-working" data-st="working"><i></i></span>`                                                                                                                                                                                                                                                                                | `--d` size (10 rows, 24 showcases). Shapes: needs filled + still ring at 1.7× (bullseye) · working filled, striped by the safe ramp (the only striped bead) · bg ring flowing · done ring + corner dot top right · failed ring + bar · choose ring + half fill · house ring + centred drifting core · outside ring open at the top · idle ring · gone dim ring. Motions in §6 Motion M3. Change state only with `Bloom.setLamp`. `.still` pins one lamp to its Reduce-motion pose (Motion M3's still column)                                                          |
| 5   | **Bead chain** `.bead-chain`                               | `Bloom.chainHTML(15, .71, '5h')`                                                                                                                                                                                                                                                                                                                                          | 5H 15 beads (one = 20 min), 7D 14 beads (one = 12 h), progress 15. Empty beads are track colour; filled beads `--use-5h` / `--use-7d`; the leading partial bead ends in a cream bridge (the only striped bead); from 80 % filled beads step lightness (`--hot-*`) and the leading bead breathes 3.5 s. At rest the chain is still: usage is data, not state                                                                                                                                                                                                           |
| 6   | **Bead wave** `.bead-wave`                                 | `Bloom.wave(3)`                                                                                                                                                                                                                                                                                                                                                           | Background{n}: n cream beads (cap 7, then `+k`); a highlight walks across once per 7 s (instance delay T/n)                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 7   | **Bead ring** `.bead-ring`                                 | `Bloom.ring({r:24, b:8})`                                                                                                                                                                                                                                                                                                                                                 | Indeterminate waits only (Connecting, Daemon waiting, Restore pending), 24 px or larger. 15 beads that never move; the safe ramp's colours travel round once per 7 s with a 3.5 s breath. Nothing rotates. Still: a still hue wheel                                                                                                                                                                                                                                                                                                                                   |
| 8   | **Pill button** `.pill`                                    | `<button class="pill primary">Create <span class="kbd">↩</span></button>`                                                                                                                                                                                                                                                                                                 | Height 28 (`.sm` 22), full pill, chrome face 13/620. `.primary` (ink-1 fill, field text: one per view), `.ghost`, `.danger` (danger text: destructive confirmations only). Hover: lifts 1 px and the lip brightens (T/32 settle). Press: squashes to .96 (T/64) and the occlusion deepens. Focus: a 2 px focus ring 4 px outside that arrives (1.08 → 1) and breathes on 3.5 s. Never arm                                                                                                                                                                             |
| 9   | **Segmented** `.seg`                                       | `<div class="seg" role="group" aria-label="Mode"><button aria-pressed="true">Turns</button><button aria-pressed="false">Diff</button></div>` + `Bloom.seg(el, fn)`                                                                                                                                                                                                        | A sunken pill track; the selected pill slides (T/32 settle). `.sm`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 10  | **Toggle** `.toggle`                                       | `<button class="toggle" role="switch" aria-checked="true" aria-label="Sound"><i></i></button>`                                                                                                                                                                                                                                                                            | Booleans (Settings). On = `--toggle-on` (blue), knob slides 14 px                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 11  | **Chip** `.chip`                                           | `<span class="chip">LOGIN</span>`                                                                                                                                                                                                                                                                                                                                         | Plex 9.5/500 upper case in a pill. `.on-needs` (on a needs-you row), `.mark` (no box: JOB, OUTSIDE), `.data` (diff stats, sizes, mixed case), `.guest` (dashed: docked app)                                                                                                                                                                                                                                                                                                                                                                                           |
| 12  | **Keycap, input** `.kbd`, `.input`                         | `<span class="kbd">⌘K</span>`, `<span class="input">${Bloom.gi('find')}<span class="ph">name, folder, prompt</span></span>`                                                                                                                                                                                                                                               | `.kbd.theirs` dashed: keys CONTROL leaves to Claude (⇧TAB, ESC)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 13  | **Session row** `.session-row` (+ `.group-row`, `.wt-row`) | `<div class="session-row" data-st="needs" aria-selected="false" style="--indent:24px">${Bloom.lamp('needs')}<span class="sr-name">STATISTICS</span><span class="sr-right"><span class="chip on-needs">LOGIN</span><span class="sr-age">2m</span></span><span class="sr-sub">needs you · claude · main</span></div>`                                                       | 40 px, two lines, rounded, inset 6 px. Name Plex 12.5/500; line 2 chrome 11. Needs-you: semibold ink-1 name + `--needs-tint` (6 % arm). Selected: `--selection` (rises in both themes). `.multi`: raised. Hover wash at T/64. House name ink-3, outside ink-4. `.group-row` (28 px, chevron, name, count; `.lamp-strip` only when folded or locked). `.wt-row` (22 px, worktree glyph, Plex 11.5, diff stat right)                                                                                                                                                    |
| 14  | **Panel** `.panel`                                         | `<div class="panel"><div class="panel-h">Trace</div>…</div>`                                                                                                                                                                                                                                                                                                              | Raised, radius 14. `.well` (sunken + top navy inset: terminal wells, inputs, gutters), `.float` (overlay + navy float shadow + lip: anything that floats), `.flush`. `.seam`: the 2 px rounded line, only where a tone step can't separate                                                                                                                                                                                                                                                                                                                            |
| 15  | **Window frame** `.window`                                 | `<div class="bl-scale" data-w="1512" data-h="945"><div class="window" data-region><div class="window-band"><span class="lights"><i></i><i></i><i></i></span><span class="name">ORBIT-WEBSITE</span><span class="path">~/Projects/orbit-website</span></div><div class="window-body"><div>sidebar</div><div class="pane">terminal</div><div>panel</div></div></div></div>` | 1512 × 945 drawn 1:1, scaled by `.bl-scale`. Radius 16, chrome `--raised`, band 42, body grid 272 / 1fr / 440 with 6 px gutters; `.pane` = a field-coloured, radius-14 region (the terminal and each viewer). Traffic lights in `--seam` (the platform's curve, zero chroma)                                                                                                                                                                                                                                                                                          |
| 16  | **Toast (in-place note)** `.toast`                         | `<div class="toast"><b>3 selected</b><span class="sp"></span><button class="pill sm">Archive</button><button class="pill ghost sm">Esc</button></div>`                                                                                                                                                                                                                    | Lives inside its region; arrives with `Bloom.rise`, leaves with `Bloom.sink`. Never fixed to the viewport, never takes focus, never covers the terminal                                                                                                                                                                                                                                                                                                                                                                                                               |

---

## 6. Section plan

Seven sections, in this order. Colour and Motion are the heavy ones: they carry most of the page's live demos and words. Every figure id below is binding (it is the `?fig=` id); the C/M/F/W/A ids are the caption ids. Figures marked (opt.) are the first to drop if time runs out; everything else is required.

### 6.1 `masthead`: Bloom (prefix `.s-mast-`)

**Purpose.** Say what this sheet proposes in one breath, show the system alive, and say how to reply.

**Contents, top to bottom**

1. Meta row (`.t-cap`, space-between): "Design review 04 · Bloom · 5 Oct 2026" | "Exploration · H13 unedited · Night by default, Field on the toggle".
2. `h1.t-display`: **CONTROL in Bloom.** Solid `--text-strong`. No gradient text, ever.
3. `p.bl-lead`: "A redraw of CONTROL's look after one motion loop: Bloom, an inflated flower whose colour flows through it every 7 seconds. This sheet borrows the loop's system, not its flower: a cool field that is the blue family turned down, three softened primaries that only meet through cream or navy, inflated forms shaded with navy instead of grey, and every loop a power of two of 7 seconds. Night stays the default. Field is the same system with the lights on."
4. **Hero** `data-fig="hero"` (no card: flat field, volumetric object; at least 70 % of the band is empty field). Height `clamp(380px, 52vw, 640px)`. The CONTROL stair as **21 inflated beads**: `Bloom.stairBeads({t:1,r:1,a:1,f:.5}, .5)`. Unit `U = min(width × .62 / 5, height × .62 / 2.5)`; bead diameter `1.3 × .5 × U` (30 % overlap, like petals tucking under each other); centred. Each bead: `class="bead ramp-flow breathe"`, `--k` = its arc fraction `s`, `--tile:1000%`. One full ramp lies along the stair and moves one turn per 7 s, so each bead rests in a family, then a bridge (cream or navy) passes through it as stripes: the reel's rest → stripes → rest. The breath (.94 ↔ 1, 3.5 s) runs along the stair as a wave. Re-lay out on resize (your own `ResizeObserver`). No lamps anywhere in the masthead (so nothing pre-empts the hero).
5. **Reel strip** `data-fig="reel"`: the ten `Bloom.reel.frames` (54 × 96 px, radius 10, gap 8) under the hero. In `tick(t)`, the frame at `floor((t % 7000) / 700)` is at opacity 1 and the rest at .4 (class swap, opacity transition T/32). Still: all at 1. Caption (id pill "Hero"): "**The stair as 21 beads.** One ramp lies along it and turns once every 7 s, so each bead rests in a family, then a bridge passes through it. Below, the reel's first 7 s every 0.7 s, on the same clock. Source: 'Bloom' by teknosis_sis."
6. **Reply** (`.card`, max 980 px): label "Reply with", text: "Your chrome face (**R** Rounded or **G** Regrade), whether Night stays the default, and the **B** numbers from the H13 delta you accept, for example: **R, Night default, B1–B11 yes, B14 yes, Q1 beat**." Link to `#delta`.
7. **How to drive this sheet** (`.t-small`, one paragraph): "Night | Field switches the theme through its bridge. Rounded | Regrade swaps the chrome face. Pause, ¼× and ½× hold or slow every loop on the page together, so transitions can be judged. Still shows exactly what Reduce motion shows."
8. **Changes | Stays** (two plain lists side by side, `.grid-2`, no icons, no cards):
   - Changes: "Colour that means something: three families and two bridges, each with one job." · "Light as a choice: Bloom Field, built on the reel's own #D6DEEE." · "Soft forms: radius, inflated controls, no hairlines." · "Motion on one clock: 1.75, 3.5, 7 and 14 s, phase-locked across the window." · "A rounded chrome face; Plex stays for everything you could paste into a shell."
   - Stays: "The terminal is the hero; the chrome stays calm." · "Only arm red means needs you; danger means destructive." · "State reads by shape first, then motion, then colour." · "Reduce motion stills every loop." · "The menu-bar icon is a still template image." · "CONTROL never presses Enter and never posts a banner."

**Animations:** hero ramp flow (7 s linear), hero breath wave (3.5 s sine), reel playhead (tick).
**Acceptance:** the hero is the only saturated thing in the masthead; beads never move position; under Still the hero shows its t = 0 pose with red, green and blue rests and at least one cream bridge visible (check `?motion=reduce`); at 390 px the hero scales down whole with no overflow; Field shows the beads with navy-occluded edges on `#D6DEEE`.

### 6.2 `colour`: Colour (prefix `.s-colour-`) — heavy

**Purpose.** Prove the colour system: where it comes from, why it works (theory), what every colour means, and that arm stays the only signal red. Every number from colour.md.

**Header:** number 02; title "Colour"; meta "Two themes, three families, two bridges. Every number computed in OKLCH."; lead: "Bloom's palette is three softened primaries, a warm cream and a cool navy, on a field that is the blue family at a sixth of its chroma. CONTROL keeps that structure and gives each channel one job: chroma is urgency, hue is identity, lightness is data. Arm stays the one signal red: Bloom's own reds are turned out of its way and step aside when it lights."

**Data.** Put every table you need into one `const DATA = {…}` at the top of your script, transcribed from `SRC/colour.md`, with a comment naming the section and line range for each block. Never compute colour maths at runtime; the numbers are already computed. Pointers: §1 lines 33–50; §2 54–92; §3 96–125; §4 129–172; §5 176–293; §6 295–304; §7 308–351; Appendix A 498–534 (ladders); B 536–596 (families, H-K); C 598–658 (ramps); D 660–685 (semantic); E 687–727 (arm separation); F 729–766 (text contrast); G 768–808 (non-text); H 810–868 (CVD); J 881–921 (diffs); K 923–926 (tints); L 928–931 (chroma); M 933–936 (P3); N 938–959 (ANSI); B.1 1124–1166; B.2 1168–1199; B.3 1201–1228. Plus `SRC/bloom.md` lines 7–29 (corrections) and 86–97 (rest vs stripes).

**Figures**

- **C1 `measured`: What the reel measures as.** `Bloom.reel.still` (frame 049, 34.3 s, the cleanest frame) beside the measured palette (field, cream, navy, coral / red base / crimson, sage / green base / grass, periwinkle / cobalt) with hex and OKLCH (colour.md B.1). Two share bars: whole reel (field 77.3, red 5.9, green 5.5, blue 5.0, cream 3.7, navy 2.6 %) and object only (red 25.9, green 24.1, blue 22.0, cream 16.4, navy 11.5 %). A small "averages vs plateaus" note from bloom.md §1: the k-means crimson `#D11E4A` is a plateau of `#DC0042`; the true navy floor is `#0A1535`; the plateau cream `#ECD6C6` sits at the field's lightness (L 0.890 vs 0.899), its warm twin. Say plainly: tokens keep the k-means values because every proof below was computed on them. Mention the Instagram macroblocking is an artefact, not the look.
- **C2 `rhythm`: Rest, then break.** The ten frames of one cycle with a stacked share bar under each (colour.md B.2 per-frame rows) and bloom.md §2.4's labels (REST at 0.7, 2.8, 3.5, 5.6 s; dark breaks at 1.4 and 6.3 s). Playhead from `tick(t)`. Text: rest is about 40 % of the reel's cycle and the break 60 %; cream makes the bright breaks and navy the one dark break; CONTROL turns that round to about 98 % rest (theory 7.6).
- **C3 `wheel`: A softened triad.** SVG OKLCH hue circle: the base hues (4.9°, 132.3°, 268.7°; gaps 127.4°, 136.5°, 96.1°), sRGB's primaries as ghost ticks (29.2°, 142.5°, 264.1°: Bloom's red sits 24° toward pink), the field's hue (264.4°), arm at 28.5° inside its reserved arc 12°–55° (shaded), CTRL's turned red family (h 2–7), and the 37° where a direct coral → sage blend would pass, inside the arc. Theory 7.1 and 7.10 beside it.
- **C4 `ladders`: Two neutral ladders.** Night and Field side by side, always both (force each column's `data-theme`): occlusion → ink-1 as stacked swatches with hex, OKLCH, WCAG and APCA Lc vs field (Appendix A). Mark "the warm flip" at ink-2 in Night (h 45) and say: darks carry the field's hue (276–278), lights carry cream's warmth (45–61); nothing is pure black or white. Theory 7.2 (cream and navy as value poles; CTRL's working ink `#cfc9bc` and Bloom's cream share OKLab L 0.837, ΔE 0.026). Small simultaneous-contrast demo (opt.): the same cream square on both fields (theory 7.4: the field's complement is h 84, so warm things advance and blue recedes).
- **C5 `families`: Families on plateaus.** Rose, green, blue × light, base, deep, wash, word for the current theme (Appendix B), plus lilac. With it, an **OKLCH lightness × chroma chart** (SVG): every family step as a dot at its (C, L), coloured with itself, the three plateaus drawn as soft horizontal bands, and above each dot a short tick at its hue's sRGB chroma ceiling (Appendix B's "C max sRGB" column), so the "tone-mapped, never at the wall" point is visible; arm plotted alone beyond the ceiling (P3). The iso-lightness of Bloom's light steps (coral 0.726, sage 0.724, periwinkle 0.722). The H-K table: naive vs corrected base L, L** spread Night 3.63 → 0.30, Field 5.0 → 0.17 (theory 7.7: arm reads 12 units brighter than it measures, L* 57.7 vs L** 70.1). The gamut note: blue binds at the light end (sRGB allows C 0.101 at L .80, h 272).
- **C6 `ramp`: The ramp.** A wide `.ramp-flow.x` band (height 72, radius 20) of the hero ramp, flowing, with the nine stop names and plateau ranges ticked under it (raspberry 0–11, coral 14–25, cream 28–31, sage 34–45, grass 48–58, cream 61–64, periwinkle 67–77, cobalt 80–89, navy 92–97 %); shares (red 28.2, green 27.7, blue 25.0, cream 11.2, navy 8.0 %); "62 % plateau, 11 % separator, 27 % transition; seam ΔE 0.0000". Under it the safe ramp band with its numbers (Night: luminance 1.14:1, max C 0.096, min ΔE to arm 0.263; Field: 1.35:1, 0.111, 0.307). Theory 7.11 in the doc's words: the safe ramp changes hue at almost constant luminance, so it can live anywhere near state without ever flashing.
- **C7 `bridges`: Bridges, not blends.** Three rows: coral → sage, grass → periwinkle, cobalt → crimson. Each shows the two-stop blend with its OKLab midpoint swatch and numbers (`#d09685` L .725 C .075 h 37, a dirty salmon inside arm's arc; `#6c9f97` h 183.8 C .056, grey-teal; `#915496` h 324.3 C .121, purple) against Bloom's path through its separator (cream, cream, navy). Theory 7.3. Static figure.
- **C8 `meanings`: What each colour means.** Table, current theme, live lamps: the ten lamp states (lamp, token, Night hex, Field hex, why: colour.md §5.1); selection, focus, link (§5.3); TRACE kinds READ / WRITE / AGENT / ERROR / live (§5.4); 5H and 7D chains at 71 % and 22 % (§5.7); the six identity tints as beads (§5.6, both themes). Above it, the three channels as one line each with numbers: chroma = urgency (Night needs-you 0.225, failed 0.100, done 0.094, neutrals ≤ 0.034), hue = identity, lightness = data. The budget (theory 7.5): 75 % or more neutral surfaces, about 20 % ink and washes, 5 % or less chromatic, exactly one element above C 0.2.
- **C9 `arm`: Arm stays the only signal red.** (a) "Distance from arm" bar chart for the current theme: every chromatic token from Appendix E, sorted, each bar in its own colour, labelled "hero ramp only", "chrome" or "two-red law", value printed. (b) The six layers as a numbered list with their numbers (§5.2: hue moat; chroma cap; pre-emption; gamut, arm alone past sRGB, `color(display-p3 0.993 0.249 0.161)`, 24 % beyond sRGB's chroma at that L and hue; motion; CVD). Layer 5 is rewritten per conflict 13: "Motion. Needs-you is the only loop that reaches past its own edge, at the fastest tempo; the safe ramp drifts at 1.14:1 and never flashes. D's step blink (a 4.52:1 swing) retires." (c) Live pre-emption demo `data-region`: a small mock corner with a hero-ramp ornament band and an idle lamp; a pill "Light a needs-you" toggles the lamp idle ↔ needs with `Bloom.setLamp`; the band turns to the safe ramp while it is lit. (d) Arm vs danger: two beads and ΔE 0.138 (Night) / 0.121 (Field); "Arm is never text."
- **C10 `diffs`: Diffs, the Bloom pair** (H13 delta B10). The real T14 write, side by side, current theme: "H13 as written" (removed on the arm_dim wash, added on the grey step: colour.md J's H13 rows) vs "Bloom" (removed on a rose wash that sinks below the field, added on a sage wash that rises above it, marks in the family colour). Lines: `12 − size: "11.2 MB",` · `12 + bytes: 11_743_232,` · `13 + size: formatSize(11_743_232),` in Plex 12 with line numbers in a sunken gutter. Under each, removed-vs-added ΔE: normal / protan / deutan / tritan (Night: H13 0.096 / 0.104 / 0.083 / 0.106, Bloom 0.132 / 0.135 / 0.106 / 0.129; Field: H13 0.069 / 0.070 / 0.056 / 0.080, Bloom 0.101 / 0.097 / 0.071 / 0.093). The four reasons from §5.5 in one short paragraph each.
- **C11 `contrast`: Contrast.** Text matrix (Appendix F) and non-text matrix (G) for the current theme, as `.bl-table`s: cells "ratio / Lc"; the two Field shortfalls (ink-1 on rose wash 8.63 / 72; ink-4 on rose wash 4.38 / 56) marked with a small rose bead and the fix (diff line numbers live in the sunken gutter). Theory 7.9 (light on dark is not symmetric; the Field ceiling: navy on `#D6DEEE` 9.84:1 / Lc 79.9, black would only reach 86.4). Re-render on `theme`.
- **C12 `cvd`: Colour-blind check.** The lamp set at 24 px four times (normal, protan, deutan, tritan) using Appendix H's simulated hexes for the current theme, drawn with the real lamp shapes (literal colours allowed here). The pair table; flag Field's three pairs under 0.06 (needs/done deutan 0.045, needs/failed protan 0.029, done/failed deutan 0.050) with "carried by shape and motion". Night: every pair 0.068 or more, except idle/housekeeping, which share a colour by design.
- **C13 `ansi` (opt.): Terminal palette.** ANSI 16, both themes, with WCAG / Lc (Appendix N); slot 9 is a light clay, ΔE 0.199 / 0.164 from arm, so a CLI's bright red never wears needs-you.

**Theory placement.** colour.md §7.1–7.11, each condensed to two to four sentences in the owner's register and placed beside its figure (as mapped above); 7.8 (the cream rim) belongs to Form F3, so link to it.
**Animations:** C2 playhead, C6 ramp flow, C8 live lamps and chains, C9 pre-emption swap, lamps in C12 (they move; the colours are the simulation).
**Acceptance:** every number traceable to the pointed lines; ladders and bridges show both themes regardless of the toggle; theme-dependent figures re-render on `theme` (or use CSS variables); no arm outside C9's demos and lamps; the section survives Field without any text below its tier (use role tokens).

### 6.3 `motion`: Motion (prefix `.s-motion-`) — heavy

**Purpose.** Let the owner _judge_ motion, not read about it: one clock he can scrub, every lamp live with its still, every transition fireable, every component pressable, and the Core Animation recipe for each.

**Header:** number 03; title "Motion"; meta "One clock: 1.75, 3.5, 7 and 14 s."; lead: "The reel loops because every period in it is a power of two of 7 seconds. CONTROL takes the clock, not the flower: every loop runs at 1.75, 3.5, 7 or 14 s from one shared instant, so the window breathes as one object. Linear means work, sine means waiting, still means nothing to do."

**Data pointers** (`SRC/motion.md`): §0 lines 16–22; §1.1 ladder 30–43; §1.2 phase 45–54; §1.3 frame rates 56–65; §1.4 window and power 67–77; §2 easing 81–102; §3 lamps 106–151; §4.1 transitions 157–176; §4.2 end-to-end 178–187; §4.3 rows 189–202; §4.4 panels 204–213; §4.5 ARCHIVE 215–224; §4.6 theme 226–246; §5 components 250–325; §6.3 layer recipe 542–574; §7 cost 578–601; §8 principles and don'ts 605–630; §11 one-line lamp descriptions 698–711. Swift: `SRC/motion-kit/BloomMotion.swift` lines 9–66 (Clock, Beat, Ease, Pace, loop), 72–115 (`needs`, `flow`).

**Figures**

- **M1 `clock`: One clock.** SVG of four concentric orbits (14, 7, 3.5, 1.75 s, outer to inner), one bead on each, positioned by CSS `rotate` animations of each period (phase-locked by the runtime; this diagram is the one thing on the page that rotates, because it is a diagram of time, not app UI). Cue ticks on the 7 s orbit: needs-you's beats every 1.75 s, done's swell at 0.875 s (+3.5), failed's dips at 2.625 s (+3.5), outside's dip 6.125–7 s, choose's crest 3.5 s. A scrubber (`input type=range`, 0–14000) calls `Bloom.seek(v)`; the nav's Play resumes. The duration ladder table (motion.md §1.1: name, ms, kind, used for). One line under it: "Same state, same phase, on every row; different states on different eighths of the wheel, so a full sidebar never throbs in unison."
- **M2 `easing`: Five curves.** One small SVG plot per curve (sine, sineOut, sineIn, settle, linear) with a dot tracing it there and back on 3.5 s (outer element translates x linearly, inner translates y with the curve; `animation-direction: alternate`, 1.75 s each way, so there is never a cut). Under each: the CSS `cubic-bezier`, the `CAMediaTimingFunction(controlPoints:)` values, and its uses (§2). Big line: "No curve leaves y ∈ [0, 1], so overshoot is impossible by construction."
- **M3 `lamps`: Every lamp, live and still.** Ten rows (rank order: needs, failed, done, working, bg, choose, house, outside, idle, gone). Columns: live at 24 px; live at 10 px on a mini session row; the Reduce-motion still at 24 px (`.still`); name; period · cue; curve; channel and amplitude; the owner-voice line (§11 table, verbatim); the CA keyPath (§6.3) in Plex. A caption on why the tiers keep states apart in peripheral vision (§3.1: 1.75 s needs-you alone; 3.5 s the two "come and look" states; 7 s busy and in-between; 14 s quiet). Needs-you's numbers: 0.57 Hz, five times under WCAG 2.3.1's three flashes a second; never dims.
- **M4 `script`: A sidebar on the clock** `data-region`. Five rows with real names, driven by `tick(t)` from `t % 14000` (deterministic; a seek jumps without transitions): STATISTICS idle → working at 1.75 s (and re-sorts to the top with `Bloom.resort`) → needs-you at 5.25 s → working at 7 s → done at 8.75 s → idle at 12.25 s; CONTROL steady bg with `Bloom.wave(3)`; RELAY MAIN house; INTERNSHIPS idle; DEPS-AUDIT enters at 3.5 s (`enterRow`) and leaves at 10.5 s (`leaveRow`). At the 14 s wrap the rows travel back to their starting order with the same FLIP move (no cut). A thin timeline under the rows with the event ticks and a playhead. Caption: the bridge each change takes (cream, or navy + wine for idle → needs-you).
- **M5 `matrix`: Fire any change.** A 24 px lamp; two rows of state pills ("from" is the current state; tap a "to" pill to run `Bloom.setLamp`). Readout: "via cream, 437.5 ms" or "via navy and wine, 218.75 ms + arrival bloom". Hint: use ¼× in the nav to watch the stripes.
- **M6 `e2e`: A session going needs-you, end to end.** motion.md §4.2's table, plus "the row does not jump to the top because of needs-you; only recency re-sorts".
- **M7 `bars`: Panels and bars.** Live: a `.seg` (Turns | Diff), a `.seg` (Recent | Name | Folder); "Select 3" pill → the selection `.toast` rises; its Esc sinks it; its Archive swaps its content for "Archive anyway? CONTROL is mid-turn in 1" with a danger pill (T/32 crossfade; nothing pulses or shakes); a panel `openPanel` demo.
- **M8 `archive`: ARCHIVE row actions.** A mini sidebar and an ARCHIVE list (rows from inventory §1.3); pills Archive / Bring back / Forget play motion.md §4.5 (archive: row leaves, record enters at the ARCHIVE top T/32 later, the count crossfades and its label swells once; bring back: the archive row deflates, the session inflates at the top of Sessions with "restoring" over a 3-bead walking chain; forget: deflates through the navy bridge). Note: search and sort never animate per keystroke.
- **M9 `theme`: Theme without a flash.** A small chart of lightness over the switch (Night L .204 → cream .837 → Field .899; Field → navy .312 → Night .204): it only ever moves one way. A pill "Switch from here" calls `Bloom.setTheme(next, x, y)` with the pill's centre.
- **M10 `components`: Signature components.** The bead ring in a "Connecting" empty state ("Waiting for the daemon. Sessions live in tmux, so nothing is lost meanwhile."); usage chains (5H at 71 %, 7D at 22 %) with a slider for 5H (cross 80 % to see the edge breathe); Background chains (3, and 9 to show `+2`); a progress chain "Restoring 7 sessions" (`chainHTML(15, v, 'progress')`, `setChain` from `tick`) that fills bead by bead over the 14 s clock and stalls for 3.5 s at bead 11, where nothing moves at all ("a stalled job looks stalled"); pills to hover, press and Tab to (focus ring arrives and breathes); rows with the hover wash.
- **M11 `ca`: Core Animation recipes.** The per-lamp layer recipe table (§6.3); three code blocks in Plex 11.5 on a sunken panel: `Clock` + `loop(...)`, `BloomLamp.needs` (with the halo at 2.4×, .7 → 0; conflict 25), `BloomLamp.flow`; the frame-rate hints (ambient 10–30 preferring 30; calm 8–15 preferring 15; hero 30–60 preferring 60); window and power states (§1.4, short); what to avoid (§7.2, as a list); the measurement plan (§7.3), saying plainly: "Unmeasured. Nothing has run in the app yet."
- **M12 `rules`: Principles and don'ts.** The eight principles and the don'ts (§8), set large and plain.

**Animations:** everything above; this section is the motion catalogue.
**Acceptance:** at `?t=0`, `?t=1750`, `?t=5250` and `?t=8750` shots the script figure shows idle, working (top), needs-you, done respectively; under Still every lamp shows its still shape and the scrubber still moves the clock; pressing a "to" pill mid-transition retargets cleanly (no queued sweeps); M1's orbits line up again at 14 s.

### 6.4 `form`: Form and type (prefix `.s-form-`)

**Purpose.** Show how "less hard and sharp lines" is done without losing CONTROL's precision: radius, separation without lines, the inflated material, and the two chrome faces against Plex.

**Header:** number 04; title "Form and type"; meta "Soft forms, no hairlines, a rounded chrome face."; lead: "Edges come from temperature and tone, not strokes. A raised thing separates from its ground by a small step in lightness and a warm lip; a sunk thing by a cool navy shadow on its top edge. Nothing is outlined, and nothing casts a grey shadow."

**Figures**

- **F1 `radius`: The softness scale.** Live specimens of each radius token on real objects (chip 6 → pill, row 10, pane 14, window 16, sheet 20, showcase 28, pill), each labelled with where it is used (§3). Note: AppKit uses continuous corners.
- **F2 `edges`: Edges without lines.** The same fragment (sidebar head, two rows, the terminal's top-left corner, the panel tab strip) drawn twice: as D (warm paper `#100f0d`/`#1a1815`/`#211e1a`, ink `#ece7da`, 1 px `#2c2823` rules, zero radius; literal colours allowed here) and as Bloom (tone steps, 6 px gutters, radius, one 2 px seam). Surface steps under it (Night 1.06–1.50:1, Field 1.07–1.32:1). Then lost and found edges: a cream object on the Field field (same lightness, the edge dissolves) next to a cobalt one (the edge is found), with one sentence: an edge between equal lightnesses reads by temperature, not value.
- **F3 `material`: The inflated material.** A 96 px bead exploded into its layers in both themes side by side: body → + navy occlusion → + top lift → + cream rim. The rim proof (colour.md Appendix I, lines 870–879): a fully occluded edge against Night's field measures 1.01–1.05:1 (it vanishes), 2.03–2.21:1 with a 0.30 rim, 3.07–3.27:1 with 0.45, which clears the 3:1 graphics threshold, so 0.45 is not taste (theory 7.8). Field needs only 0.30. Then the three material grades on real objects: flat (surfaces), soft (controls: `.pill`, `.seg`, `.toggle`) and inflated (`.bead`, `.puffy`, showcase only). Then the shadow law: navy occlusion vs a grey drop shadow (labelled "don't").
- **F4 `type`: Two chrome faces and Plex.** Three columns with fixed families (set `font-family` directly): Rounded (Nunito, standing in for SF Pro Rounded), Neue Regrade, IBM Plex Mono. Each column sets the same real strings at app and display sizes: "Nothing needs you. Lock for 2h?" · "Quiet since 15:50 · 4 working · 1 done" · "Sessions", "Archive", "Trace" · buttons "Restore", "Lock", "Go to tab" · "No early unlock. Until 18:00 nothing lifts it: not quitting CONTROL, not restarting the daemon, not rebooting." The Plex column shows what stays Plex: "ORBIT-WEBSITE ~/Projects/orbit-website +38 −12 now", "T14 put the release size in one place so /download and /admin can't drift", "12 + bytes: 11_743_232,", "5H 71% 01:10 · 7D 22% Sun". Under it: the rule table (what is chrome face vs Plex, §3), the weight note (Nunito about 100 heavier), the glyph-coverage note (neither chrome face has ⌘ ⌥ ⇧; Regrade lacks … and →; ⌃ is drawn), and one line in `font-family: ui-rounded` labelled "SF Pro Rounded, if your browser exposes it (Safari does)". The nav toggle also swaps every chrome string on the page, so say "try the toggle".
- **F5 `glyphs`: Glyphs and the mark.** The 16-grid glyph set (sprite) at 16 px and 32 px, D's square caps and mitred joins beside Bloom's round caps and joins for four glyphs (draw D's inline). The stair mark at nav size, lockup size (t r a 6, f 3, stroke 4) and as beads (a still, small version of the hero).
- **F6 `space` (opt.): Space.** The doc keeps about 70 % empty field around hero objects (the reel's is about 75 %); the app keeps its density (rows 40, sidebar 272, panel 440) because the terminal needs the width. One sentence each.

**Acceptance:** F2's D half is visibly D (lines, zero radius) and the Bloom half has no line except the one seam; F3 numbers exactly as Appendix I; F4 shows all three faces regardless of the toggle; Field works throughout.

### 6.5 `window`: The window (prefix `.s-win-`)

**Purpose.** The real app, redrawn: the main window in both themes, ARCHIVE with the diff, and the row states at 1:1. The terminal stays the hero.

**Header:** number 05; title "The window"; meta "Main window in both themes, ARCHIVE and the diff."; lead: "The same window, the same sessions and the same Claude turn as direction D, so only the look moves. Regions are soft panes in the chrome with 6 pt gutters; nothing is outlined. Colour lives only in lamps, kind labels and the diff."

**Content source:** `SRC/inventory.md` §1.1 band (lines 52–65), §1.2 sidebar (67–110, the session table at 85–96), §1.3 ARCHIVE (112–125), §1.4 usage (127–132), §1.5 terminal (134–178, transcript 147–172), §1.6 right panel (180–251: TRACE 189–208, OUTPUTS 210–215, DIFF 239–244, guest tab 183–185), §2.3 TRACE stream timing (382), §2.5 diff rules (416–422), §4 sizes (493–532). Every name and mock number comes from there; do not invent new ones.

**Figures**

- **W1 `main-night`** (`data-theme="night"` + `themed` on the figure) and **W2 `main-field`** (`data-theme="field"`): one `win()` template rendered twice, 1512 × 945 in `.bl-scale`. Contents:
  - Band: lights, `ORBIT-WEBSITE` (Plex 600 13), `~/Projects/orbit-website`, spacer, chip-pill "Loose ends · 1 unsent draft" (mail glyph), `.pill.sm` "Find ⌘K", toggle-pill "Panel ⌘⇧G" (on).
  - Sidebar (chrome, no pane): head "Sessions" + plus and sidebar glyph buttons; groups THESIS (3) and PROJECTS (3) and the ungrouped rows exactly as inventory lines 85–96 (states, chips `LOGIN`, `JOB`, `OUTSIDE`, `EXIT 1`, envelope counts, ages, worktree rows `site-v2 +38 −12` selected and `download-size +4 −1`, `v2 +212 −40`); ORBIT-WEBSITE selected; ARCHIVE header collapsed with `412`; usage footer: "5H" `chainHTML(15,.71,'5h')` 71 % 01:10, "7D" `chainHTML(14,.22,'7d')` 22 % Sun, timers "2h 14m active" / "38m quiet" with the hourglass glyphs.
  - Terminal pane (`--field`, Plex 12/17): tab strip (1 claude active, 2 bun dev, 3 zsh, +, "⌃ Tab" hint) as soft tabs (active tab = the pane's own tone, joined to it); the transcript from inventory 147–172 with Claude's glyphs; Claude's diff rows on Bloom's washes; the unsent draft in the prompt box; `⏵⏵ accept edits on`; cursor cream (Night) / ink-1 (Field), not blinking. No ramp colour in terminal text.
  - Right panel: tab strip (Trace, Outputs, Folder, Browser, Git; Trace and Outputs open; the guest tab "Obsidian · docked" as `.chip.guest` with the real gem colours `#a88bfa #7c4dde #5b2fb5` and an undock glyph). TRACE pane over OUTPUTS pane:
    - TRACE live, driven by `tick(t)` from `t % 14000` on v2's schedule (events at 0.9, 2.2, 3.6, 5.0, 6.4, 7.6, 8.8 s; the turn marks done at 10 s): T14 "put the release size in one place so /download and /admin can't drift", meta "running · 23:41 · 31s · 3 writes · 1 error" counting; kind labels in `--trace-read/write/agent/error`; mini diffs on Bloom washes; the ERROR message on a sunken note, never danger; the live turn's rail is a 2 px `.ramp-flow.safe` (radius 1). Each new row grows in at T/32 with `sineOut` (`Bloom.animate` on its wrapper's `grid-template-rows` 0fr → 1fr and opacity; motion.md's ladder puts "TRACE row grow" at quick). On first render and after a seek, draw the state at `t` with no animation; animate only events crossed while playing. Older turns T13, T12 ▸, T11 ▸ as inventory 204–206. Footnote "Bash runs stay in the terminal. DIFF shows the same writes as one diff against HEAD."
    - OUTPUTS: "this chat · newest first", Reveal; rows (`press/orbit-press-kit.pdf 4m` selected, `public/og/download.png 1200×630 · 6m`, `docs/release-0.2.3.md 38 lines · 21m`, `docs/size-audit.md 12 lines · 40m`); the PDF page preview keeps its own off-white `#f3f0e8` (not ours); pager "‹ 1 / 2 › · Space Quick Look".
  - STATISTICS's needs-you lamp is the only arm in the window; the window is a `data-region`.
- **W3 `archive`: ARCHIVE open with the diff** (follows the global theme). The same frame; ARCHIVE expanded (search `.input` "name, folder, prompt ⌘F", `.seg.sm` Recent | Name | Folder, the twelve archive rows of inventory 117–122 with session or chat glyphs, SIGNALS_101 multi-selected with two others and the selection `.toast` "3 selected · Archive · Esc" at the sidebar's foot); the right panel's TRACE in DIFF mode (`.seg` Turns | Diff): "4 files +38 −12", file rows with C marker, M/A status and stats (inventory 241), hunks with `@@ -8,9 +8,10 @@` headers, line numbers in the sunken gutter, a long line wrapped under its code, footer "live · FSEvents · 23:41:07".
- **W4 `rows`: Rows at 1:1** (current theme). Session rows in every state and interaction: selected, hovered, multi-selected, renaming (an `.input` in the row), drag target, needs-you, background (CONTROL with `Bloom.wave(3)` beside its age), outside, housekeeping, choose-on-return (`138K`), failed (`EXIT 1`); a worktree row selected; a folded locked group (K8): "ORBIT · locked until 18:00" with its `.lamp-strip`; the hidden-sidebar band (⌘B) carrying lights, the session's lamp and name.

**Acceptance:** one arm element per region; no hairline anywhere; Plex for every identifier, path and number, chrome face for labels and state words; both forced-theme windows read correctly whatever the toggle says; TRACE frames at `?t=4000` and `?t=11000` differ as the schedule says; DOM under 1,500 nodes per window; `fit()` keeps windows inside the column at 390 px.

### 6.6 `around`: Around the window (prefix `.s-around-`)

**Purpose.** Everything that isn't the main window: menu bar, lock (the one place the full ambient bloom lives), the app icon, sheets, and the in-place notes that replace toasts.

**Header:** number 06; title "Around the window"; meta "Menu bar, lock, icon, sheets and notes."; lead: "The menu-bar icon stays a still template image: state by shape. The panel under it gets the bead grammar. The lock screen is the one CONTROL screen where nothing needs you, so it is the one place the whole ramp is allowed to move."

**Content source:** `SRC/inventory.md` §1.7 icon (253–268), §1.8 panel (270–286), §1.9 sheets (288–299), §1.11 notes (311–316), §1.12 lock (318–331), §5 stair and icon geometry (536–582).

**Figures**

- **A1 `icon-states`: Menu-bar icon.** The L3 stair as a template glyph at 18 pt (t 6, r 6, a 7, f 3, stroke 3; corner square 8; tick 2) in its states: idle, working (apex step filled), done (corner square), needs-you (reversed canvas), update tick, off (45 % alpha, `!`), full lock (shut stair). Drawn monochrome on a menu-bar strip in both appearances (a dark strip and a light strip), with the count beside it. Round caps and joins (B9). Caption: state by shape, never colour or motion; it changes only after a 2 s settle.
- **A2 `panel`: The menu-bar panel**, 360 wide, radius 14, `.panel.float`, three states side by side: Normal (header stair + `CONTROL` + "Claude 2.1.287"; a header line of three short chains with counts: needs you 2, working 3, done 1; sections Needs you (STATISTICS login [Go to tab] 2m; CV-BUILD exit 1 2h), Working 3, Housekeeping 1, Done 1 [Clear], Usage chains, "Claude 2.1.288 out [Restart]" with "3 can restart now · 1 waits for housekeeping · 1 held", footer: idle lamp, "CTRL 0.2.0", Lock, Open, settings glyph); Lock offer (an in-place `.toast` at the top: "Nothing needs you. Lock for 2h?" / "Quiet since 15:50 · 4 working · 1 done" / Group, Full … Later); While locked (the digest "While locked · 16:00–18:00 6 [Clear]" with the six rows of inventory line 286). Lamps live on the shared clock.
- **A3 `lock`: The lock screen, the one ambient bloom.** A full-lock window plate (`.window` without sidebar or panes, field background): the **shut** stair as 30 inflated beads (`stairBeads(g, .5, {shut:true})`) carrying the full hero ramp on the slow 14 s period (`--rp: var(--T2)`), "Locked" (t-display), "until 18:00", "4 working · 1 done", "No early unlock. This window opens by itself if a session needs you." Nothing else moves. Beside it, the break-through window (K16) as its own `data-region`: the band carries RELAY MAIN's needs-you lamp and "Locked until 18:00 · re-locks when answered", and one pane shows Claude's question UI ("Which threshold should the rep detector use for curls?" 0.8 g / 0.6 g / Adaptive / Type something.; "Enter to select · ↑/↓ to navigate · Esc to cancel"). If you keep a small bead stair in its band as the lock mark, build it as `.bead.ramp-flow` so pre-emption turns it to the safe ramp: in break-through the arm lamp is the only saturated thing. Under both, the `ctrl lockscreen` text version in Plex (box-drawing shut stair, "LOCKED until 18:00 · 4 working · 1 done").
- **A4 `app-icon`: App icon.** A squircle (SVG superellipse path or radius 22.5 %) on the Night field with the bead stair carrying a still frame of the hero ramp (choose a phase where red, green and blue rests are all visible), at 256, 128, 64 and 32 px; the favicon beside it. One line: the icon is the only other place the full ramp appears, and it does not move.
- **A5 `sheets`: Sheets and the ⌘K finder.** `.panel.float` at radius 20 with real content from inventory 292–298: D1 New session (fields as `.input`, Group, Folder + Choose, Worktree On | Off + `week-5-lab`, the pre-types strip "Pre-types claude -w week-5-lab · not run · Enter is yours", Cancel / Create primary); the Lock sheet K4 (Mode Group | Full, group checklist with lamps, For 30M | 1H | 2H | Until 18:00, the no-early-unlock sentence in ink (never danger), Cancel / Lock primary); D3 Restore at login (list with lamps, snapshot radios, Skip / Dry-run / Restore); D5 ⌘K finder (input with caret, groups Sessions / Worktrees / Tabs / Actions, matched letters underlined, footer keys as `.kbd`); D6 Settings rows with `.toggle`s and the watchdog log lines in Plex. "Archive anyway?" as the one danger moment.
- **A6 `notes`: Notes, not toasts.** The rule set large: "CONTROL posts no banners, no toasts and no pop-ups. A note lives inside its own region and never takes focus." Then each in-place note live: the selection bar, the lock offer, the unlock digest, the PEER note ("ORBIT-APP changed lib/release.ts 4m ago / in its worktree app-0.2.4, not yet on main"), the break-through band note, the `DAEMON DOWN` band word. Replay pill: re-rises them with `Bloom.rise`.
- **A7 `empty` (opt.): Empty states** in the terminal column: Connecting (with `Bloom.ring`), Daemon down, No sessions ([New] `⌘T new`, `⌘K find`), No session selected (keys) — inventory line 299.

**Acceptance:** the menu-bar icon is monochrome and still; the lock plate is the only ambient full ramp outside the masthead and Colour; in break-through the ramp is safe and the arm lamp is the only saturated thing; no note is `position: fixed`.

### 6.7 `delta`: What Bloom changes in H13 (prefix `.s-delta-`)

**Purpose.** The closing panel: exactly which H13 clauses (and the laws around it) Bloom would amend, keep or add, each with a reply id, plus the open calls. The spec is not edited.

**Header:** number 07; title "What Bloom changes in H13"; meta "Spec unedited. Reply with B and Q numbers."; lead: "H13 today, verbatim: _ORBIT design laws in every surface: mono type (Departure Mono, IBM Plex Mono; no Inter), zero radius, 1px hairlines, the two-red law (`arm` = needs you, the one red a glance meets; working is cream; `danger` = destructive consequence; C-075), every lamp state has its own motion, idle included, and motion says state and nothing else; macOS Reduce motion stills them (C-073), the menu bar icon is a template image with state by shape. Diffs: removed = `arm_dim`, added = brighter grey, never green._" (spec line 50; quote it in a sunken `.card`).

**Figure `delta` (binding content).** One table, rows grouped "H13's clauses" then "Laws around H13". Columns: id · today (verbatim, Plex for quoted tokens) · Bloom (a pill-badge: Keep / Amend / Extend / Add) · proposed wording · why, with numbers · see (link to the figure). Badge colours: Keep and Extend `--raised`; Amend `--blue-wash`; Add `--green-wash`. Never arm.

| ID  | Today                                                                                                                      | Bloom                | Proposed wording                                                                                                                                                                                                                                                                                                            | Why                                                                                                                                                                          | See          |
| --- | -------------------------------------------------------------------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| B1  | "ORBIT design laws in every surface"                                                                                       | Amend                | CONTROL's own laws in every surface. It keeps from ORBIT the wordmark (Plex 600, .26em), the stair mark and "red means state".                                                                                                                                                                                              | Bloom needs radius, ramps, eased motion and navy shading: four things ORBIT bans                                                                                             | `#masthead`  |
| B2  | "mono type (Departure Mono, IBM Plex Mono; no Inter)"                                                                      | Amend                | Chrome in a rounded sans (SF Pro Rounded in AppKit; Neue Regrade on trial). IBM Plex Mono for everything you could paste into a shell: terminal, diffs, code, paths, session and branch names, numbers, keys. No Inter. Departure Mono keeps one job: the menu-bar count                                                    | The owner's softer chrome; content is never decorated                                                                                                                        | Form F4      |
| B3  | "zero radius"                                                                                                              | Amend                | Radii 4, 6, 10, 14, 16, 20 and pills, on continuous corners                                                                                                                                                                                                                                                                 | "Less hard and sharp lines"                                                                                                                                                  | Form F1      |
| B4  | "1px hairlines"                                                                                                            | Amend                | No hairlines. Regions separate by tone steps (Night 1.06–1.50:1, Field 1.07–1.32:1) and 6 pt gutters; where tone cannot, a 2 pt rounded seam                                                                                                                                                                                | colour.md §2                                                                                                                                                                 | Form F2      |
| B5  | "the two-red law (arm = needs you, the one red a glance meets; working is cream; danger = destructive consequence; C-075)" | Amend (meaning kept) | `arm` = needs you: the one _signal_ red and the only colour past sRGB. Working is cream in Night and navy ink in Field. `danger` = destructive consequence. Bloom's own reds stay outside arm's 12°–55° hue arc, are capped at C 0.10 in chrome, and give way while arm is lit                                              | Closest chrome token to arm ΔE 0.178 (Night) / 0.155 (Field); safe ramp 0.263 / 0.307; arm vs danger 0.138 / 0.121; cream on the Field field is 1.23:1, too faint for a lamp | Colour C9    |
| B6  | "every lamp state has its own motion, idle included"                                                                       | Keep                 | Nine states, nine motions (Motion M3), on beads; shapes still tell every state apart with no motion                                                                                                                                                                                                                         |                                                                                                                                                                              | Motion M3    |
| B7  | "and motion says state and nothing else"                                                                                   | Amend                | Ambient motion says state and nothing else. One-shot motion may also answer your hand (press, hover, focus, panels, rows, theme) and ends within 875 ms                                                                                                                                                                     |                                                                                                                                                                              | Motion M7    |
| B8  | "macOS Reduce motion stills them (C-073)"                                                                                  | Extend               | Reduce motion stills every loop at its shape; one-shots become dissolves of 219 ms or less; the wait ring holds as a still hue wheel; the theme switch dissolves                                                                                                                                                            |                                                                                                                                                                              | Motion M3    |
| B9  | "the menu bar icon is a template image with state by shape"                                                                | Keep                 | Unchanged: still, template, state by shape. Its strokes take round caps and joins like the mark                                                                                                                                                                                                                             |                                                                                                                                                                              | Around A1    |
| B10 | "Diffs: removed = arm_dim, added = brighter grey, never green"                                                             | Amend                | Removed = a rose wash below the field; added = a sage wash above it; the +/− marks in the family colour. Arm's hue never appears in a diff                                                                                                                                                                                  | Removed vs added, Bloom vs H13: Night 0.132 vs 0.096 (deutan 0.106 vs 0.083); Field 0.101 vs 0.069 (deutan 0.071 vs 0.056); rose wash vs arm 0.528                           | Colour C10   |
| B11 | Chroma budget zero beyond the two reds (`tokens.toml`, D)                                                                  | Amend                | Three families (rose h 2–7, green h 130–138, blue h 268–272) plus cream and navy. Chroma follows urgency; at most one element above C 0.2 in view: arm, or the hero ramp when nothing needs you                                                                                                                             | colour.md §7.5                                                                                                                                                               | Colour C8    |
| B12 | Dark only ("the menu bar is dark only", mock)                                                                              | Amend                | Two themes: Bloom Night (default) and Bloom Field. The switch passes through one bridge, so lightness never flashes                                                                                                                                                                                                         |                                                                                                                                                                              | Motion M9    |
| B13 | No blur, gradient, translucency or shadow except the primary's key-travel shadow (D)                                       | Amend                | Gradients only as multi-stop ramps (the hero ramp in ambient places, the safe ramp next to state) and bead shading. Depth by navy occlusion: inset on objects; a soft navy shadow only under things that float. Still no blur, glass, glow, parallax or grey shadow. The key-travel shadow retires: a press is a .96 squash |                                                                                                                                                                              | Form F3      |
| B14 | Motion tokens `fast 0.15`, `panel 0.2`, easeInOut; D's stepped blinks                                                      | Amend                | One clock: T = 7 s; one-shots 109, 219, 437.5, 875 ms; loops 1.75, 3.5, 7, 14 s, phase-locked to a 14 s epoch; sine-family curves; nothing steps; no loop faster than 1.75 s                                                                                                                                                | Needs-you at 0.57 Hz, five times under WCAG 2.3.1's limit                                                                                                                    | Motion M1–M2 |
| B15 | Terminal: cursor = arm (C-018); ANSI greens hold greys; slot 9 = arm                                                       | Amend                | Cursor cream (Night) / ink-1 (Field), not blinking. Green slots carry green. Slot 9 is a light clay                                                                                                                                                                                                                         | Slot 9 vs arm ΔE 0.199 / 0.164                                                                                                                                               | Colour C13   |
| B16 | Spec §6: done = hollow grey; needs-you = reversed row                                                                      | Amend                | Done, unseen takes the green family. A needs-you row gets a 6 % arm tint and a semibold name; the bullseye ring is needs-you's still                                                                                                                                                                                        | Chroma follows urgency                                                                                                                                                       | Window W4    |
| B17 | (new)                                                                                                                      | Add                  | Pre-emption: while a needs-you is lit in a window, every hero ramp in it turns to the safe ramp                                                                                                                                                                                                                             | No other red on screen                                                                                                                                                       | Colour C9    |
| B18 | (new)                                                                                                                      | Add                  | Linear means work, sine means waiting, still means nothing to do                                                                                                                                                                                                                                                            |                                                                                                                                                                              | Motion M2    |

**Open calls** (owner decides; recommendation first):

| ID  | Call                                                             | Recommended                                                                                  | Alternative                            |
| --- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------- |
| Q1  | Needs-you tempo                                                  | 1.75 s beat + ripple (if not loud enough, raise the ripple's reach to 2.8× before the tempo) | 3.5 s breathe                          |
| Q2  | Done, unseen                                                     | 3.5 s beckon, stops once seen                                                                | One 875 ms bloom, then a 7 s rim glint |
| Q3  | Failed and choose-on-return                                      | Stumble and tide                                                                             | Still                                  |
| Q4  | State-change length                                              | 437.5 ms (218.75 into needs-you)                                                             | 875 ms                                 |
| Q5  | Locked groups                                                    | Their lamps still while locked; needs-you still breaks through                               | Lamps keep moving                      |
| Q6  | Terminal cursor                                                  | No blink (it would be the window's last strobe)                                              | Blink                                  |
| Q7  | Live re-sort ping-pong (`last_active` changes on every tool use) | Re-sort on turn start, or a minimum dwell                                                    | Re-sort on every event                 |
| Q8  | Field's terminal                                                 | Light, on `#D6DEEE`                                                                          | A Night terminal inside Field chrome   |
| Q9  | Chrome face                                                      | Rounded (SF Pro Rounded)                                                                     | Neue Regrade                           |
| Q10 | Session names                                                    | Plex (identifiers)                                                                           | Chrome face                            |

**Found on the way** (for `docs/LEDGER.md`, one line each): `tokens.toml [terminal]` still uses arm for the cursor and ANSI slot 9 (predates C-075); spec §6's state table still lists working → arm and needs-you → reversed row; v2's header comment still says "state never animates"; re-sort ping-pong (Q7).

**Close** with a sunken `.card`: "Reply with: R or G; B numbers you accept; Q answers. For example: R, B1–B11 yes, B13 yes, B15 later, Q1 beat, Q5 yes."
**Acceptance:** every "today" cell is verbatim; every number is in §9; the badge never uses arm; ids are stable (B1–B18, Q1–Q10) and anchorable (`id="B5"` on each row).

---

## 7. Craft rules

1. **No hairline grids.** No 1 px borders, rules or table lines anywhere in Bloom figures. Separate by tone steps, space, 6 pt gutters, and (rarely) the 2 px rounded `.seam`. Tables separate rows by alternating tone (`.bl-table`).
2. **Nothing pure black or white.** No `#000`, `#fff`, `black`, `white`, `rgba(0,0,0,…)`, `rgba(255,255,255,…)`. Darkest is `--occlusion`, lightest `--overlay` / `--ink-1`.
3. **No grey drop shadows.** Depth is navy: `--occl` insets on objects, `--well` on sunk things, `--float` only under things that float.
4. **No overshoot, no springs, no bounce, no steps, no cuts.** Every loop is a power of two of 7 s and phase-locked; nothing loops faster than 1.75 s; nothing in the app rotates (M1's orbits are a diagram).
5. **One saturated focal element per composed view** (a hero, a window, a panel, a card): arm when something needs you, otherwise at most one hero-ramp object. Data figures (swatches, charts, matrices) are exempt.
6. **Generous negative space.** About 70 % empty field around hero objects; sections start 144 px apart; prose at 68 characters.
7. **No glassmorphism, blur, glow, grain, noise, textures or parallax.** The reel is perfectly clean.
8. **No two-stop gradients.** Gradients are the multi-stop ramps or the material's shading, nothing else.
9. **No flower.** No petals, stems or figurative bloom, as logo, mascot or ornament. Borrow the system: the field, the ramp, inflated beads, bead repetition, the clock.
10. **Content is never decorated.** No ramp colour in terminal text, diff text, code or paths.
11. **No AI-template tells.** No gradient text, no three-card feature grids with icons, no icon-per-bullet lists, no stock "hero + subhead + CTA", no lorem, no emoji, no fake testimonials, no "magic" or "sparkle" glyphs.

## 8. Performance rules

1. Loops animate **transform and opacity only** (compositor). Allowed exceptions, all tiny: `background-color` on bead-ring and wave beads (5–8 px), `background-position` on the housekeeping core.
2. One-shots (≤ 875 ms) may also animate colour or `box-shadow` on elements of 24 px or less, the row tint, and `grid-template-rows` for one entering or leaving row.
3. Never animate `filter`, `backdrop-filter`, blur, `width`/`height`/`top`/`left` (except the row case above), or a shadow on anything large.
4. No `setInterval`, no own `requestAnimationFrame` loops: `tick(t)` only, and keep it cheap (compare, then touch the DOM only on change).
5. Off-screen sections pause automatically; never start animations outside your section.
6. `will-change` only on large continuously animated things (the hero beads may use `will-change: transform` on their `::before`); never on hundreds of small items.
7. DOM budget: masthead 200 nodes, colour 2,500, motion 2,500, form 1,500, window 3,500 (two windows plus W3/W4), around 2,500, delta 600.
8. No external network, no libraries, no `<img src>` except `Bloom.reel` data URIs and inline SVG.

## 9. Number bank

Every number the doc prints in prose, captions or tables comes from here or from the source lines named in §6 for your section. Mock data (ages, diff stats, sizes, times) comes from `inventory.md` and is the owner's sample data. If a number is in neither, do not print it.

**The reel (spec, bloom.md, colour.md B.2)**

- 1080 × 1920, 42 s, 60 frames at 0.7 s. Field `#D6DEEE`, identical at every sampled pixel and frame. About 75 % negative space. Head centre within 518–562 px of 1080 (±2 %). Stem base sways 487–748 px over 14 s. 14–16 petals per ring.
- True loop 14 s: frames 14 s apart differ by 2.3 (codec noise); 7 s apart, 24.4 direct and 10.8 mirrored.
- Rest ≈ 40 % of the cycle, break ≈ 60 %; rests in time: blue → red → green → blue. Head region dominant share: B 95 at 0.7 s, R 90 at 2.8 s, R 97 at 3.5 s, G 76 at 5.6 s. Cream is 30–40 % of every striped frame; navy 11–21 % at the 1.4 s and 6.3 s junction frames.
- Bead anatomy (frame 049): crimson core ~40 % of the radius, wine/navy ring ~15 %, blue band ~30 %, cream rim the last 5–8 %; about 70 % of silhouette pixels are cream or light (376 of 535).
- Bridges: wine `#86253E → #5C2B40 → #3F2639`; lavender `#A5B3E2 → #CECCE1`; mauve `#E5B2CD`.

**Colour (colour.md)**

- Night field `#131528` oklch(20.4 % 0.038 277.9): ink-1 15.04:1 / Lc −93.5 (today's paper: 15.52:1 / −92.0). Field: navy on `#D6DEEE` 9.84:1 / Lc 79.9; black would reach 15.54 / 86.4; navy on white 13.30 / 99.5.
- Surface steps: Night field/raised 1.10, /sunken 1.06, /overlay 1.27, /seam 1.50, /selection 1.28. Field 1.11, 1.07, 1.19, 1.32, 1.16.
- Triad base hues 4.9°, 132.3°, 268.7° (gaps 127.4°, 136.5°, 96.1°); sRGB primaries 29.2°, 142.5°, 264.1°. Light steps at L 0.726 / 0.724 / 0.722.
- Pixel shares: field 77.3 · red 5.9 · green 5.5 · blue 5.0 · cream 3.7 · navy 2.6 %. Object: red 25.9 · green 24.1 · blue 22.0 · cream 16.4 · navy 11.5 %. Rest frames (of the object): blue 55 % at 0.7 s, red 68 % / 75 % at 2.8 / 3.5 s, green 74 % at 5.6 s; transitional frames 31–43 % at most.
- Ramp: plateaus 62 %, separators 11 %, transitions 27 % (3 % wide); shares red 28.2, green 27.7, blue 25.0, cream 11.2, navy 8.0 %; seam ΔE 0.0000. Safe ramp: Night Y 0.505–0.580 (1.14:1), C ≤ 0.096, min ΔE to arm 0.263, ≥ 9.52:1 on the field; Field 1.35:1, C ≤ 0.111, 0.307, ≥ 6.02:1.
- Blends without bridges: coral → sage `#d09685` (0.725 0.075 37.0, ΔE 0.164 from arm); grass → periwinkle `#6c9f97` (0.664 0.056 183.8); cobalt → crimson `#915496` (0.541 0.121 324.3; sRGB midpoint L 0.490 vs OKLab 0.541).
- Arm Night `#ff4438` oklch(66.2 % 0.225 28.5); P3 oklch(0.672 0.268 30) = `color(display-p3 0.993 0.249 0.161)`, 24 % beyond sRGB's max chroma (0.216) at that L and hue; fallback ΔE 0.045; 5.26:1 on the field. Field arm `#d90e0b`, P3 `color(display-p3 0.822 0.085 0.028)`, fallback ΔE 0.028, 3.87:1.
- Moat 12°–55°; Bloom reds turned to h 2–7 (crimson 15.2° → 4°, ΔE 0.041). Unmitigated Bloom vs arm: crimson 0.117, red base 0.101, coral 0.110 (5–6 JND). Closest chrome token id-rose 0.178 / 0.155; rose-light 0.197 / 0.259; hero stops 0.124–0.147 / 0.096–0.192; worst hero transition 0.092 sRGB, 0.128 P3 (Night), 0.094 / 0.110 (Field). Arm vs danger 0.138 / 0.121.
- Working: CTRL's `#cfc9bc` and Bloom cream `#dbc3c2` share OKLab L 0.837, ΔE 0.026. Cream on the Field field 1.23:1.
- Chroma by urgency, Night: needs-you 0.225 · failed 0.100 · done 0.094 · neutrals ≤ 0.034. Field: 0.225 · 0.136 · 0.140 · ≤ 0.074. Budget: ≥ 75 % neutral (C ≤ 0.046), ~20 % ink and washes (C ≤ 0.09), ≤ 5 % chromatic, one element above C 0.2.
- H-K: Night base L** spread 3.63 → 0.30; Field 5.0 → 0.17. Arm L* 57.7 vs L** 70.1; cream 80.7 vs 81.4. Blue binds at the light end: sRGB C max 0.101 at L .80, h 272 (P3 0.110).
- Rim: occluded edge vs Night field 1.01–1.05; with 0.30 rim 2.03–2.21; with 0.45 3.07–3.27. Field 8.35–9.22 → 4.34–4.69 → 3.19–3.38.
- Non-text lows: Night arm on selection 4.11; Field done on sunken 3.35. Usage fill vs track: Night 5H 4.09, 7D 4.65; Field 4.22, 3.35.
- CVD: Night every lamp pair ≥ 0.068 except idle/housekeeping (shared by design). Field pairs under 0.06: needs/done deutan 0.045, needs/failed protan 0.029, done/failed deutan 0.050. Arm vs field under protan / deutan / tritan: Night 3.65 / 6.30 / 4.55; Field 5.96 / 3.14 / 3.31.
- Diffs: see B10 and C10. Washes vs field: Night removed −0.035 L, added +0.070; Field −0.037, +0.030. Rose wash vs arm 0.528; rose word 0.422. Marks under deutan 0.049 (Night).
- Field text shortfalls: ink-1 on rose wash 8.63 / Lc 72; ink-4 on rose wash 4.38 / 56.
- Identity tints: closest pair rose/lilac 0.068 / 0.076; Field tints 2.57–2.83:1 against the field (decorative, redundant with the name).
- D's step blink: arm vs arm at 15 % over the field, a 4.52:1 swing (retired).
- Simultaneous contrast: field h 264.4, its complement h 84.4.

**Motion (motion.md)**

- Ladder: 14 s drift · 7 s cycle · 3.5 s breath · 1.75 s beat (needs-you only) · 875 ms scene · 437.5 ms state · 218.75 ms quick · 109.4 ms tap.
- Cues: needs-you 0; done 0.875 s; failed 2.625 s; outside dip 6.125–7 s; choose crest 3.5 s.
- Needs-you: scale 1 → 1.16 → 1; halo 1 → 2.4, opacity .7 → 0; arrival bloom 1 → 2.8, .6 → 0 over 875 ms; 0.57 Hz; five times under WCAG 2.3.1's three flashes a second.
- Idle: opacity 1 → .82 (a ±9 % swell) over 14 s. Outside: .8 → .4 → .8 over T/8. Choose: fill 35 % ↔ 65 %. Done core .6 → 1. Failed dips to .45 twice in the first T/4.
- Transitions: 437.5 ms, three bands of about 145 ms; 218.75 ms into needs-you; the row tint crossfades over T/16.
- Frame rates: ambient 10–30 (30), calm 8–15 (15), hero 30–60 (60).
- Press .96 at T/64; hover lift 1 pt; focus ring 2 pt, 4 pt out, arrives 1.08 → 1, breathes 1 → .6 over 3.5 s; panel content slides 24 pt; selection bar rises 12 pt.
- Theme: Night L .204 → cream .837 → Field .899; Field → navy .312 → Night .204; scrim .94, front 64 pt, T/16 + T/16.
- Cost: unmeasured; the gate is the spike's 4.17 ms per frame (240 Hz).

## 10. Copy rules

- British English (colour, grey, centre, organise, behaviour). Sentence case for headings and labels; small upper case only in Plex chips and keycaps.
- The owner's voice: direct, plain, first-hand, specific. Short sentences. Say what a thing does and why, with the number. Prefer colons and full stops to dashes.
- Banned words: seamless (except the ramp's literal seam), delightful, elevate, unlock (except the lock feature), effortless, stunning, vibrant, harmonious, beautiful, magical, sleek, cutting-edge, journey, leverage, empower, "not just X but Y", "whether you're…".
- Names exactly as the owner writes them: `ORBIT-WEBSITE`, `STATISTICS`, `RELAY MAIN`, `CONTROL`, `ctrl`. Claude Code, not "Claude code". Arm, danger, cream, navy: lower case in prose.
- Good: "Beats every 1.75 s and sends a soft ring past its own edge. The only red, the only thing that reaches outside itself, and it never goes dark." Bad: "A vibrant, pulsing indicator that elegantly draws your attention."

## 11. Controller's final check (after every part is in)

1. `python3 BUILD/assemble.py` → `OUT`; no unexplained `WARN`.
2. `node BUILD/probe.js OUT "" 4000 "document.querySelectorAll('.bl-sec').length"` → 7, no `EXCEPTION`, no `console.error`.
3. For each section id: `node BUILD/shotcdp.js OUT "shot=<id>&t=1750" <png> 1440 900 1500 1` in Night and with `&theme=field`; once at 390 wide with no `HORIZONTAL OVERFLOW`; once with `&motion=reduce`; once with `&type=regrade`.
4. Two shots at the same `?t=` are identical (determinism); the nav's Pause stops every section's loops and demos together.
5. `OUT` is under 1.5 MB; it loads nothing from the network (fonts from `design/bloom/fonts` and `design/mock/fonts` only; tested: they load from `file://` in a plain Chrome).
6. Delete `BUILD/preview/` if you like; nothing in `REPO` other than `design/bloom/index.html` is written by this build.

---

## Appendix A: `tokens.css` (verbatim, in the shell)

```css
/* ==================================================================
   BLOOM TOKENS. Colour values are colour.md §8 verbatim (derive.py).
   Additions marked "+" are material/motion tokens set by BRIEF.md.
   Night is the default and does not follow prefers-color-scheme.
   ================================================================== */
:root,
[data-theme="night"] {
  color-scheme: dark;
  --field: #131528;
  --sunken: #0c0e1d;
  --raised: #1b1e34;
  --overlay: #252942;
  --seam: #30354e;
  --occlusion: #060714;
  --ink-1: #f2e9e2;
  --ink-2: #e2d2cb;
  --ink-3: #b3b8cc;
  --ink-4: #979db4;
  --ghost: #5d627a;
  --cream: #dbc3c2;
  --navy: #2a2f63;
  --arm: #ff4438;
  --arm-dim: #6b2620;
  --danger: #d98d73;
  --rose-light: #f3a4b3;
  --rose-base: #ed7d99;
  --rose-deep: #b94769;
  --rose-wash: #1d070e;
  --rose-word: #450f23;
  --green-light: #aaca89;
  --green-base: #7daf4e;
  --green-deep: #48871e;
  --green-wash: #1b2d17;
  --green-word: #254519;
  --blue-light: #a8bafc;
  --blue-base: #7792ef;
  --blue-deep: #4f6dcc;
  --blue-wash: #21294f;
  --lilac-light: #d5abe8;
  --id-rose: #e299ac;
  --id-butter: #c7af6d;
  --id-sage: #93c089;
  --id-mint: #66c4be;
  --id-peri: #98afeb;
  --id-lilac: #c99fd6;
  --ramp:
    #cf2668 0%, #cf2668 11%, #fe799b 14%, #fe799b 25%, #dbc3c2 28%, #dbc3c2 31%, #9dba74 34%,
    #9dba74 45%, #5ea130 48%, #5ea130 58%, #dbc3c2 61%, #dbc3c2 64%, #8fa5fa 67%, #8fa5fa 77%,
    #4765e8 80%, #4765e8 89%, #2a2f63 92%, #2a2f63 97%, #cf2668 100%;
  --ramp-safe:
    #dbc3c2 0%, #dbc3c2 8%, #aaca89 20%, #aaca89 38%, #dbc3c2 50%, #dbc3c2 58%, #a8bafc 70%,
    #a8bafc 88%, #dbc3c2 100%;
  --rim-mix: 0.45;
  --text-strong: var(--ink-1);
  --text-body: var(--ink-2);
  --text-secondary: var(--ink-3);
  --text-label: var(--ink-3);
  --text-caption: var(--ink-4);
  --text-disabled: var(--ghost);
  --lamp-needs: var(--arm);
  --lamp-working: var(--cream);
  --lamp-done: var(--green-light);
  --lamp-failed: var(--danger);
  --lamp-idle: var(--ink-4);
  --lamp-choose: var(--ink-3);
  --lamp-house: var(--ink-4);
  --lamp-outside: var(--ink-4);
  --focus: var(--blue-light);
  --link: var(--blue-light);
  --selection: var(--blue-wash);
  --trace-read: var(--blue-light);
  --trace-write: var(--green-light);
  --trace-agent: var(--lilac-light);
  --trace-error: var(--ink-1);
  --trace-live: var(--cream);
  --diff-add-wash: var(--green-wash);
  --diff-add-word: var(--green-word);
  --diff-add-mark: var(--green-light);
  --diff-rem-wash: var(--rose-wash);
  --diff-rem-word: var(--rose-word);
  --diff-rem-mark: var(--rose-light);
  --use-5h: var(--blue-base);
  --use-7d: var(--green-base);
  --use-track: var(--seam);
  --rim: var(--cream);
  /* + bridges and motion-kit colours */
  --wine: #5c2b40; /* bloom.md: measured wine bridge, the one dark junction (with navy) */
  --lamp-bg: var(--lamp-working);
  --rs-a: #dbc3c2;
  --rs-b: #aaca89;
  --rs-c: #a8bafc; /* --ramp-safe's three plateaus (bead-ring hue keys) */
  --chain-empty: var(--seam);
  --wave-hi: var(--blue-light);
  --hot-5h: var(--blue-light);
  --hot-7d: var(--green-light); /* usage >= 80 %: the light step (colour.md §5.7) */
  --toggle-on: var(--blue-deep);
  /* + material */
  --puff: var(--overlay);
  --puff-ink: var(--ink-1);
  --occl: rgb(6 7 20 / 0.55);
  --occl-deep: rgb(6 7 20 / 0.75);
  --occl-light: rgb(38 43 91 / 0.22);
  --lip: rgb(219 195 194 / 0.2);
  --lip-hi: rgb(219 195 194 / 0.32);
  --lift: rgb(242 233 226 / 0.1);
  --well: inset 0 8px 12px -8px rgb(6 7 20 / 0.65);
  --float: 0 24px 48px -16px rgb(6 7 20 / 0.7), 0 2px 6px rgb(6 7 20 / 0.35);
  --needs-tint: rgb(255 68 56 / 0.06); /* bloom.md §3.2: the row echo, about 6 % of the family */
}
[data-theme="field"] {
  color-scheme: light;
  --field: #d6deee;
  --sunken: #cdd7ed;
  --raised: #e3e9f4;
  --overlay: #edf1f9;
  --seam: #b9c2d9;
  --occlusion: #262b5b;
  --ink-1: #262b5b;
  --ink-2: #333964;
  --ink-3: #414970;
  --ink-4: #525a7c;
  --ghost: #7d85a0;
  --cream: #dbc3c2;
  --navy: #262b5b;
  --arm: #d90e0b;
  --arm-dim: #e8ada5;
  --danger: #9b3a20;
  --rose-light: #ef9cac;
  --rose-base: #b54b6a;
  --rose-deep: #7c2e45;
  --rose-wash: #e9c8cf;
  --rose-word: #e7a8b6;
  --green-light: #a2c580;
  --green-base: #4a7f1b;
  --green-deep: #2b5a17;
  --green-wash: #dbefd1;
  --green-word: #c8f2ae;
  --blue-light: #a1b4f8;
  --blue-base: #465cb3;
  --blue-deep: #334889;
  --blue-wash: #e7edff;
  --lilac-light: #d0a4e4;
  --lilac-deep: #67327d;
  --id-rose: #b86c81;
  --id-butter: #9e8337;
  --id-sage: #65955a;
  --id-mint: #209993;
  --id-peri: #6c84c3;
  --id-lilac: #9f72ad;
  --ramp:
    #cd1f66 0%, #cd1f66 11%, #fc7392 14%, #fc7392 25%, #dbc3c2 28%, #dbc3c2 31%, #98b076 34%,
    #98b076 45%, #539624 48%, #539624 58%, #dbc3c2 61%, #dbc3c2 64%, #8ba0f1 67%, #8ba0f1 77%,
    #3d5ad9 80%, #3d5ad9 89%, #262b5b 92%, #262b5b 97%, #cd1f66 100%;
  --ramp-safe:
    #333964 0%, #333964 8%, #2b5a17 20%, #2b5a17 38%, #333964 50%, #333964 58%, #334889 70%,
    #334889 88%, #333964 100%;
  --rim-mix: 0.3;
  --text-strong: var(--ink-1);
  --text-body: var(--ink-1);
  --text-secondary: var(--ink-2);
  --text-label: var(--ink-3);
  --text-caption: var(--ink-4);
  --text-disabled: var(--ghost);
  --lamp-needs: var(--arm);
  --lamp-working: var(--ink-2);
  --lamp-done: var(--green-base);
  --lamp-failed: var(--danger);
  --lamp-idle: var(--ink-4);
  --lamp-choose: var(--ink-3);
  --lamp-house: var(--ink-4);
  --lamp-outside: var(--ink-4);
  --focus: var(--blue-base);
  --link: var(--blue-deep);
  --selection: var(--blue-wash);
  --trace-read: var(--blue-deep);
  --trace-write: var(--green-deep);
  --trace-agent: var(--lilac-deep);
  --trace-error: var(--ink-1);
  --trace-live: var(--ink-2);
  --diff-add-wash: var(--green-wash);
  --diff-add-word: var(--green-word);
  --diff-add-mark: var(--green-deep);
  --diff-rem-wash: var(--rose-wash);
  --diff-rem-word: var(--rose-word);
  --diff-rem-mark: var(--rose-deep);
  --use-5h: var(--blue-base);
  --use-7d: var(--green-base);
  --use-track: var(--sunken);
  --rim: var(--cream);
  /* + bridges and motion-kit colours */
  --wine: #5c2b40;
  --lamp-bg: var(--lamp-working);
  --rs-a: #333964;
  --rs-b: #2b5a17;
  --rs-c: #334889;
  --chain-empty: var(--seam);
  --wave-hi: var(--blue-base);
  --hot-5h: var(--blue-deep);
  --hot-7d: var(--green-deep); /* usage >= 80 %: the deep step (colour.md §5.7) */
  --toggle-on: var(--blue-base);
  /* + material */
  --puff: var(--raised);
  --puff-ink: var(--ink-1);
  --occl: rgb(38 43 91 / 0.16);
  --occl-deep: rgb(38 43 91 / 0.28);
  --occl-light: rgb(38 43 91 / 0.16);
  --lip: rgb(237 241 249 / 0.9);
  --lip-hi: rgb(237 241 249 / 1);
  --lift: rgb(237 241 249 / 0.55);
  --well: inset 0 8px 12px -8px rgb(38 43 91 / 0.22);
  --float: 0 24px 48px -18px rgb(38 43 91 / 0.32), 0 2px 6px rgb(38 43 91 / 0.12);
  --needs-tint: rgb(217 14 11 / 0.06);
}
/* Arm is the one colour past sRGB (colour.md §3.3) */
@supports (color: color(display-p3 1 0 0)) {
  :root,
  [data-theme="night"] {
    --arm: color(display-p3 0.993 0.249 0.161);
  }
  [data-theme="field"] {
    --arm: color(display-p3 0.822 0.085 0.028);
  }
}

/* Theme-independent tokens */
:root {
  /* type: chrome face switches with html[data-type]; Plex carries content */
  --f-rounded:
    "BloomRounded", ui-rounded, system-ui, sans-serif; /* Nunito, standing in for SF Pro Rounded */
  --f-regrade:
    "BloomRegrade", "BloomRounded", system-ui, sans-serif; /* Regrade lacks … → ⌘ ⌥ ⇧: they fall back */
  --f-mono: "BloomPlex", ui-monospace, Menlo, monospace;
  --f-chrome: var(--f-rounded);
  --w-reg: 500;
  --w-med: 620;
  --w-strong: 760;
  /* radius */
  --r-xs: 4px;
  --r-s: 6px;
  --r-m: 10px;
  --r-l: 14px;
  --r-win: 16px;
  --r-xl: 20px;
  --r-puffy: 28px;
  --r-pill: 999px;
  /* space (doc); app mocks keep the app's own sizes (inventory §4) */
  --s-1: 4px;
  --s-2: 8px;
  --s-3: 12px;
  --s-4: 16px;
  --s-5: 24px;
  --s-6: 32px;
  --s-7: 48px;
  --s-8: 64px;
  --s-9: 96px;
  --s-10: 144px;
  /* motion: T = 7 s, every duration is T x 2^n (motion.md §1.1) */
  --T: 7s;
  --T2: 14s;
  --T-breath: 3.5s;
  --T-beat: 1.75s;
  --d-tap: 109.375ms;
  --d-quick: 218.75ms;
  --d-state: 437.5ms;
  --d-scene: 875ms;
  --e-sine: cubic-bezier(0.37, 0, 0.63, 1);
  --e-out: cubic-bezier(0.61, 1, 0.88, 1);
  --e-in: cubic-bezier(0.12, 0, 0.39, 0);
  --e-settle: cubic-bezier(0.25, 1, 0.5, 1);
}
html[data-type="regrade"] {
  --f-chrome: var(--f-regrade);
  --w-reg: 400;
  --w-med: 520;
  --w-strong: 640;
}
```

## Appendix B: `base.css` (verbatim, in the shell)

```css
/* ==================================================================
   BLOOM BASE: fonts, page, nav, section frame, figures, tables, shots.
   Paths are relative to design/bloom/index.html.
   ================================================================== */
@font-face {
  font-family: "BloomRounded";
  src: url("fonts/Nunito-Variable.ttf") format("truetype");
  font-weight: 200 1000;
  font-style: normal;
  font-display: block;
}
@font-face {
  font-family: "BloomRegrade";
  src: url("fonts/NeueRegrade-Variable.ttf") format("truetype");
  font-weight: 300 800;
  font-style: normal;
  font-display: block;
}
@font-face {
  font-family: "BloomPlex";
  src: url("../mock/fonts/IBMPlexMono-Regular.otf") format("opentype");
  font-weight: 400;
  font-display: block;
}
@font-face {
  font-family: "BloomPlex";
  src: url("../mock/fonts/IBMPlexMono-Medium.otf") format("opentype");
  font-weight: 500;
  font-display: block;
}
@font-face {
  font-family: "BloomPlex";
  src: url("../mock/fonts/IBMPlexMono-SemiBold.otf") format("opentype");
  font-weight: 600;
  font-display: block;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}
html {
  background: var(--field);
  -webkit-text-size-adjust: 100%;
}
body {
  margin: 0;
  background: var(--field);
  color: var(--text-body);
  font: var(--w-reg) 15px/1.6 var(--f-chrome);
  -webkit-font-smoothing: antialiased;
  font-synthesis: none;
  overflow-x: hidden;
}
h1,
h2,
h3,
h4,
p,
figure,
ul,
ol {
  margin: 0;
}
h1,
h2,
h3,
h4 {
  font-weight: var(--w-strong);
  color: var(--text-strong);
}
b,
strong {
  font-weight: var(--w-med);
  color: var(--text-strong);
}
a {
  color: var(--link);
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
}
button {
  font: inherit;
  color: inherit;
}
::selection {
  background: var(--selection);
  color: var(--text-strong);
}
:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 3px;
}
code,
kbd,
samp,
.mono {
  font-family: var(--f-mono);
  font-variant-numeric: tabular-nums;
}
code {
  font-size: 0.86em;
  color: var(--text-strong);
  background: var(--raised);
  padding: 0.12em 0.45em;
  border-radius: var(--r-xs);
}
.gi {
  width: 1em;
  height: 1em;
  flex: none;
  vertical-align: -0.14em;
  overflow: visible;
}
.sp {
  flex: 1;
}
.themed {
  background: var(--field);
  color: var(--text-body);
} /* use on any element that sets its own data-theme */

/* ---------- type classes (chrome face unless noted; never set content in the chrome face) ---------- */
.t-display {
  font: var(--w-strong) clamp(44px, 6.2vw, 80px)/1 var(--f-chrome);
  letter-spacing: -0.015em;
  color: var(--text-strong);
}
.t-h2 {
  font: var(--w-strong) clamp(30px, 3.6vw, 44px)/1.08 var(--f-chrome);
  letter-spacing: -0.01em;
  color: var(--text-strong);
}
.t-h3 {
  font: var(--w-strong) 22px/1.25 var(--f-chrome);
  color: var(--text-strong);
}
.t-lead {
  font: var(--w-reg) 18px/1.6 var(--f-chrome);
  color: var(--text-body);
}
.t-body {
  font: var(--w-reg) 15px/1.6 var(--f-chrome);
  color: var(--text-body);
}
.t-small {
  font: var(--w-reg) 13px/1.5 var(--f-chrome);
  color: var(--text-secondary);
}
.t-label {
  font: var(--w-med) 12px/1.35 var(--f-chrome);
  color: var(--text-label);
}
.t-cap {
  font: var(--w-reg) 12px/1.45 var(--f-chrome);
  color: var(--text-caption);
}
.t-mono {
  font: 400 12.5px/1.5 var(--f-mono);
  color: var(--text-body);
  font-variant-numeric: tabular-nums;
}
.t-mono-s {
  font: 400 11px/1.45 var(--f-mono);
  color: var(--text-caption);
  font-variant-numeric: tabular-nums;
}
.t-num {
  font-family: var(--f-mono);
  font-variant-numeric: tabular-nums;
}

/* ---------- nav ---------- */
.bl-nav {
  position: sticky;
  top: 0;
  z-index: 50;
  background: var(--field);
}
.bl-nav::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  top: 100%;
  height: 24px;
  pointer-events: none;
  background: linear-gradient(var(--field), transparent);
}
.bl-nav-in {
  max-width: 1440px;
  margin: 0 auto;
  padding: 0 48px;
  min-height: 60px;
  display: flex;
  align-items: center;
  gap: 20px;
}
.bl-wm {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--ink-1);
  text-decoration: none;
  white-space: nowrap;
  font: 600 12px/1 var(--f-mono);
  letter-spacing: 0.26em;
}
.bl-wm em {
  font: var(--w-med) 13px/1 var(--f-chrome);
  letter-spacing: 0;
  color: var(--ink-4);
  font-style: normal;
}
.bl-links {
  display: flex;
  gap: 2px;
  overflow-x: auto;
  scrollbar-width: none;
  flex: 1;
  min-width: 0;
}
.bl-links::-webkit-scrollbar {
  display: none;
}
.bl-links a {
  font: var(--w-med) 13px/1 var(--f-chrome);
  color: var(--ink-3);
  text-decoration: none;
  padding: 9px 12px;
  border-radius: var(--r-pill);
  white-space: nowrap;
  transition:
    background-color var(--d-tap) var(--e-settle),
    color var(--d-tap) var(--e-settle);
}
.bl-links a:hover,
.bl-links a[aria-current="true"] {
  background: var(--raised);
  color: var(--ink-1);
}
.bl-ctrls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
}
.bl-still {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}
.bl-clock {
  font: 400 11px/1 var(--f-mono);
  color: var(--ink-4);
  min-width: 6.2em;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
@media (max-width: 1180px) {
  .bl-nav-in {
    flex-wrap: wrap;
    padding: 8px 16px;
    gap: 6px 10px;
  }
  .bl-links {
    order: 3;
    flex-basis: 100%;
  }
  .bl-ctrls {
    flex: 1 1 100%;
    flex-wrap: wrap;
    order: 2;
  }
}
@media (max-width: 520px) {
  .bl-clock,
  .bl-ctrls .seg[data-bind="rate"] {
    display: none;
  }
}

/* ---------- sheet and sections ---------- */
.bl-sheet {
  max-width: 1440px;
  margin: 0 auto;
  padding: 0 48px 160px;
}
@media (max-width: 720px) {
  .bl-sheet {
    padding: 0 16px 96px;
  }
}
.bl-sec {
  padding-top: var(--s-10);
  scroll-margin-top: 64px;
}
.bl-sh {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: end;
  gap: 12px 32px;
  margin-bottom: var(--s-5);
}
.bl-sh .no {
  display: flex;
  align-items: center;
  gap: 12px;
  font: 500 12px/1 var(--f-mono);
  color: var(--ink-4);
  margin-bottom: 14px;
  grid-column: 1 / -1;
}
.bl-sh h2 {
  font: var(--w-strong) clamp(30px, 3.6vw, 44px)/1.08 var(--f-chrome);
  letter-spacing: -0.01em;
  color: var(--text-strong);
}
.bl-sh .meta {
  font: var(--w-reg) 13px/1.45 var(--f-chrome);
  color: var(--text-caption);
  text-align: right;
  max-width: 34ch;
}
@media (max-width: 720px) {
  .bl-sh {
    grid-template-columns: 1fr;
  }
  .bl-sh .meta {
    text-align: left;
  }
}
.bl-lead {
  font: var(--w-reg) 18px/1.6 var(--f-chrome);
  color: var(--text-body);
  max-width: 68ch;
  margin-bottom: var(--s-8);
}
.bl-sub {
  font: var(--w-strong) 22px/1.25 var(--f-chrome);
  color: var(--text-strong);
  margin: var(--s-9) 0 var(--s-2);
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.bl-sub .id {
  font: 500 11px/1 var(--f-mono);
  color: var(--ink-3);
  background: var(--raised);
  padding: 6px 9px;
  border-radius: var(--r-pill);
  transform: translateY(-3px);
}
.bl-prose {
  max-width: 68ch;
}
.bl-prose p + p {
  margin-top: 12px;
}
.bl-prose p {
  color: var(--text-body);
}
.bl-steps {
  display: inline-flex;
  gap: 4px;
}
.bl-steps i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--seam);
}
.bl-steps i.on {
  background: var(--ink-3);
}

/* ---------- figures, captions, cards ---------- */
.fig {
  margin: 0 0 var(--s-8);
  min-width: 0;
}
.card {
  background: var(--raised);
  border-radius: var(--r-xl);
  padding: var(--s-6);
}
.card.sunk {
  background: var(--sunken);
  box-shadow: var(--well);
}
.cap {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 12px;
  margin-top: var(--s-3);
  font: var(--w-reg) 13px/1.45 var(--f-chrome);
  color: var(--text-caption);
  max-width: 100ch;
}
.cap .id {
  font: 500 11px/1 var(--f-mono);
  color: var(--ink-2);
  background: var(--raised);
  padding: 5px 8px;
  border-radius: var(--r-pill);
}
.cap b {
  font-weight: var(--w-med);
  color: var(--text-secondary);
}
.grid-2 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--s-5);
}
.grid-3 {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--s-5);
}
@media (max-width: 900px) {
  .grid-2,
  .grid-3 {
    grid-template-columns: 1fr;
  }
}

/* ---------- tables: rows separated by tone, never by rules ---------- */
.bl-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0 2px;
  font: var(--w-reg) 13px/1.45 var(--f-chrome);
  color: var(--text-body);
}
.bl-table th {
  font: var(--w-med) 12px/1.3 var(--f-chrome);
  color: var(--text-caption);
  text-align: left;
  padding: 6px 12px;
  vertical-align: bottom;
}
.bl-table td {
  padding: 8px 12px;
  vertical-align: top;
  background: color-mix(in srgb, var(--raised) 55%, transparent);
}
.bl-table tr:nth-child(even) td {
  background: transparent;
}
.bl-table td:first-child {
  border-radius: var(--r-m) 0 0 var(--r-m);
}
.bl-table td:last-child {
  border-radius: 0 var(--r-m) var(--r-m) 0;
}
.bl-table .num,
.bl-table code,
.bl-table .mono {
  font-family: var(--f-mono);
  font-variant-numeric: tabular-nums;
  font-size: 12px;
}
.bl-scroll {
  overflow-x: auto;
  scrollbar-width: thin;
}

/* ---------- scaled window figures (runtime fits them to the column) ---------- */
.bl-scale {
  position: relative;
  width: 100%;
} /* not overflow:hidden: the window's navy float shadow must show */
.bl-scale > * {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
}

/* ---------- footer ---------- */
.bl-foot {
  max-width: 1440px;
  margin: 0 auto;
  padding: var(--s-8) 48px var(--s-9);
  color: var(--text-caption);
  font-size: 13px;
}
@media (max-width: 720px) {
  .bl-foot {
    padding: var(--s-7) 16px;
  }
}

/* ---------- shot mode (?shot=<section-id>[&fig=<fig-id>]) ---------- */
body.shot .bl-nav,
body.shot .bl-foot {
  display: none;
}
body.shot .bl-sheet {
  max-width: none;
  padding: 24px;
}
body.shot .bl-sec {
  padding-top: 0;
}
.bl-shot-hide {
  display: none !important;
}
```

## Appendix C: `lib.css`, the component library (verbatim, in the shell)

```css
/* ==================================================================
   BLOOM COMPONENT LIBRARY. Shared by every section; sections never
   restyle these, they only set the documented custom properties.
   Every loop is guarded by html[data-motion="full"] and :not(.still):
   the base style IS the Reduce-motion pose.
   ================================================================== */

/* ---------- keyframes (shared) ---------- */
@keyframes bl-flow-y {
  from {
    transform: translateY(0);
  }
  to {
    transform: translateY(-50%);
  }
}
@keyframes bl-flow-x {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(-50%);
  }
}
@keyframes bl-breathe {
  0%,
  100% {
    scale: 1;
  }
  50% {
    scale: 0.92;
  }
}
@keyframes bl-hero-breathe {
  0%,
  100% {
    scale: 1;
  }
  50% {
    scale: 0.94;
  }
}
@keyframes l-beat {
  0% {
    transform: scale(1);
    animation-timing-function: cubic-bezier(0.61, 1, 0.88, 1);
  }
  25% {
    transform: scale(1.16);
    animation-timing-function: cubic-bezier(0.37, 0, 0.63, 1);
  }
  100% {
    transform: scale(1);
  }
}
@keyframes l-ripple {
  0% {
    transform: scale(1);
    opacity: 0.7;
  }
  100% {
    transform: scale(2.4);
    opacity: 0;
  }
}
@keyframes l-flow {
  to {
    transform: translateY(-50%);
  }
}
@keyframes l-beckon {
  0% {
    transform: scale(0.6);
    animation-timing-function: cubic-bezier(0.61, 1, 0.88, 1);
  }
  12.5% {
    transform: scale(1);
    animation-timing-function: cubic-bezier(0.37, 0, 0.63, 1);
  }
  100% {
    transform: scale(0.6);
  }
}
@keyframes l-stumble {
  0%,
  12.5%,
  25%,
  100% {
    opacity: 1;
  }
  6.25%,
  18.75% {
    opacity: 0.45;
  }
}
@keyframes l-drift {
  to {
    background-position: 0 200%;
  }
}
@keyframes l-tide {
  0%,
  100% {
    transform: translateY(15%);
  }
  50% {
    transform: translateY(-15%);
  }
}
@keyframes l-far {
  0%,
  87.5%,
  100% {
    opacity: 0.8;
  }
  93.75% {
    opacity: 0.4;
  }
}
@keyframes l-rest {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.82;
  }
}
@keyframes r-hue {
  0%,
  8% {
    background-color: var(--rs-a);
  }
  20%,
  38% {
    background-color: var(--rs-b);
  }
  50%,
  58% {
    background-color: var(--rs-a);
  }
  70%,
  88% {
    background-color: var(--rs-c);
  }
  100% {
    background-color: var(--rs-a);
  }
}
@keyframes w-pass {
  0%,
  16%,
  100% {
    background-color: var(--lamp-bg);
  }
  8% {
    background-color: var(--wave-hi);
  }
}
@keyframes f-in {
  from {
    scale: 1.08;
  }
  to {
    scale: 1;
  }
}
@keyframes f-breathe {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

/* ---------- 1. inflated surface: .puffy ----------
   Doc-level hero and showcase objects only (28 px radius). App chrome uses .pill / .panel.
   Set --puff-c for a hue: var(--rose-base) | var(--green-base) | var(--blue-base) | var(--cream) | var(--navy). */
.puffy {
  --puff-c: var(--puff);
  --od: 10px;
  --ob: 18px;
  position: relative;
  border-radius: var(--r-puffy);
  background: radial-gradient(120% 90% at 50% 10%, var(--lift), transparent 58%), var(--puff-c);
  box-shadow:
    inset 0 calc(var(--od) * -1) var(--ob) var(--occl),
    inset 0 1px 0 var(--lip);
}
.puffy.sm {
  --od: 6px;
  --ob: 12px;
  border-radius: var(--r-l);
}
.puffy[data-hue] {
  --occl: color-mix(in srgb, var(--occlusion) 45%, transparent);
}
.puffy[data-hue="rose"] {
  --puff-c: var(--rose-base);
}
.puffy[data-hue="green"] {
  --puff-c: var(--green-base);
}
.puffy[data-hue="blue"] {
  --puff-c: var(--blue-base);
}
.puffy[data-hue="cream"] {
  --puff-c: var(--cream);
}
.puffy[data-hue="navy"] {
  --puff-c: var(--navy);
}

/* ---------- 2. bead: one inflated sphere (12 px and up) ----------
   <span class="bead" style="--b:24px;--c:var(--green-base)"></span>
   Shading = navy occlusion toward the lower edge + soft top lift + cream rim at the silhouette (--rim-mix). */
.bead {
  --b: 16px;
  --c: var(--blue-base);
  position: relative;
  display: inline-block;
  flex: none;
  width: var(--b);
  height: var(--b);
  border-radius: 50%;
  background: var(--c);
  overflow: hidden;
  isolation: isolate;
  vertical-align: middle;
}
.bead::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 50%;
  pointer-events: none;
  background:
    radial-gradient(
      closest-side,
      transparent 80%,
      color-mix(in srgb, var(--rim) calc(var(--rim-mix) * 100%), transparent) 100%
    ),
    radial-gradient(40% 28% at 50% 24%, var(--lift), transparent),
    radial-gradient(
      62% 62% at 50% 38%,
      transparent 58%,
      color-mix(in srgb, var(--occlusion) 85%, transparent) 100%
    );
}
.bead.flat::after {
  display: none;
}

/* ---------- 3. ramp-flow: the ramp travelling through a shape ----------
   Colour moves, the shape never does. One period of the ramp = --tile of the element's height (default 100 %).
   --k (0..1) is this element's phase on the ring/chain; --rp the period (default 7 s; the lock band uses var(--T2)).
   .safe = chrome-safe ramp (no red). Inside [data-preempt] every ramp becomes the safe ramp (colour.md §4.2).
   Combine with .bead for flowing beads: <span class="bead ramp-flow" style="--b:56px;--k:.25;--tile:1000%"></span> */
.ramp-flow {
  --ramp-use: var(--ramp);
  --rp: var(--T);
  --k: 0;
  --tile: 100%;
  position: relative;
  overflow: hidden;
  isolation: isolate;
}
.ramp-flow.safe,
[data-preempt] .ramp-flow {
  --ramp-use: var(--ramp-safe);
}
.ramp-flow.bead {
  background: none;
}
.ramp-flow::before {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: calc(var(--tile) * 2);
  z-index: -1;
  background: linear-gradient(to bottom, var(--ramp-use)) 0 0 / 100% 50% repeat-y;
  transform: translateY(calc(var(--k) * -50%));
}
.ramp-flow.x::before {
  right: auto;
  bottom: 0;
  height: auto;
  width: calc(var(--tile) * 2);
  background: linear-gradient(to right, var(--ramp-use)) 0 0 / 50% 100% repeat-x;
  transform: translateX(calc(var(--k) * -50%));
}
html[data-motion="full"] .ramp-flow:not(.still)::before {
  animation: bl-flow-y var(--rp) linear infinite;
  animation-delay: calc(var(--k) * var(--rp) * -1);
}
html[data-motion="full"] .ramp-flow.x:not(.still)::before {
  animation-name: bl-flow-x;
}
html[data-motion="full"] .ramp-flow.breathe:not(.still) {
  animation: bl-hero-breathe var(--T-breath) var(--e-sine) infinite;
  animation-delay: calc(var(--k) * var(--T-breath) * -1);
}

/* ---------- 4. lamp: one per session state (motion.md §3, kit.css, tested) ----------
   <span class="lamp st-working" data-st="working"><i></i></span>   size: --d (10 px in rows, 24 px in showcases)
   States: needs working bg done failed choose house outside idle gone. Change state ONLY via Bloom.setLamp(el, st).
   .still freezes one lamp at its Reduce-motion pose regardless of the page's motion setting. */
.lamp {
  --d: 10px;
  --rw: max(1.5px, calc(var(--d) * 0.2));
  position: relative;
  display: inline-block;
  flex: none;
  width: var(--d);
  height: var(--d);
  vertical-align: middle;
}
.lamp > i {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  overflow: hidden;
  box-shadow: inset 0 0 0 var(--rw) var(--c);
  transition: box-shadow var(--d-state) var(--e-sine);
}
.lamp > i::before {
  content: "";
  position: absolute;
  border-radius: 50%;
}
.lamp::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 50%;
  pointer-events: none;
}
.lamp .sweep {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 300%;
  pointer-events: none;
}
.lamp .bloom {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: radial-gradient(closest-side, transparent 50%, var(--c) 72%, transparent);
  pointer-events: none;
}
.st-needs {
  --c: var(--lamp-needs);
}
.st-needs > i {
  box-shadow: inset 0 0 0 calc(var(--d) / 2) var(--c);
}
.st-needs::after {
  transform: scale(1.7);
  box-shadow: inset 0 0 0 1.5px var(--c);
  opacity: 0.45;
} /* the bullseye: needs-you's still */
.st-working {
  --c: var(--lamp-working);
}
.st-working > i {
  box-shadow: inset 0 0 0 calc(var(--d) / 2) var(--c);
}
.st-working > i::before,
.st-bg > i::before {
  left: 0;
  right: 0;
  top: 0;
  height: 400%;
  border-radius: 0;
  background: linear-gradient(to top, var(--ramp-safe)) 0 0 / 100% 50% repeat-y;
  transform: translateY(-12.5%);
} /* still: a bridge mid-bead */
.st-bg {
  --c: var(--lamp-bg);
}
.st-bg > i {
  -webkit-mask: radial-gradient(
    closest-side,
    transparent calc(100% - var(--rw) - 0.5px),
    #000 calc(100% - var(--rw))
  );
  mask: radial-gradient(
    closest-side,
    transparent calc(100% - var(--rw) - 0.5px),
    #000 calc(100% - var(--rw))
  );
}
.st-done {
  --c: var(--lamp-done);
}
.st-done > i::before {
  width: 40%;
  height: 40%;
  left: 48%;
  top: 12%;
  background: var(--c);
} /* corner dot, top right: D's done grammar */
.st-idle {
  --c: var(--lamp-idle);
}
.st-failed {
  --c: var(--lamp-failed);
}
.st-failed > i::before {
  left: 24%;
  right: 24%;
  top: calc(50% - var(--rw) / 2);
  height: var(--rw);
  border-radius: var(--rw);
  background: var(--c);
}
.st-house {
  --c: var(--lamp-house);
}
.st-house > i::before {
  width: 40%;
  height: 40%;
  left: 30%;
  top: 30%;
  opacity: 0.8;
  background: linear-gradient(to top, var(--ramp-safe)) 0 0 / 100% 200% repeat-y;
}
.st-outside {
  --c: var(--lamp-outside);
}
.st-outside > i {
  opacity: 0.8;
  -webkit-mask: conic-gradient(from 35deg, #000 290deg, transparent 0);
  mask: conic-gradient(from 35deg, #000 290deg, transparent 0);
}
.st-choose {
  --c: var(--lamp-choose);
}
.st-choose > i::before {
  left: 0;
  right: 0;
  top: 50%;
  height: 100%;
  border-radius: 0;
  background: var(--c);
}
.st-gone {
  --c: var(--lamp-idle);
}
.st-gone > i {
  opacity: 0.35;
}
html[data-motion="full"] .st-needs:not(.still) > i {
  animation: l-beat var(--T-beat) infinite;
}
html[data-motion="full"] .st-needs:not(.still)::after {
  box-shadow: none;
  background: radial-gradient(closest-side, transparent 50%, var(--c) 72%, transparent);
  opacity: 0;
  transform: none;
  animation: l-ripple var(--T-beat) var(--e-out) infinite;
}
html[data-motion="full"] .st-working:not(.still) > i::before,
html[data-motion="full"] .st-bg:not(.still) > i::before {
  transform: none;
  animation: l-flow var(--T) linear infinite;
}
html[data-motion="full"] .st-done:not(.still) > i::before {
  animation: l-beckon var(--T-breath) infinite -2.625s;
}
html[data-motion="full"] .st-failed:not(.still) > i {
  animation: l-stumble var(--T-breath) var(--e-sine) infinite -0.875s;
}
html[data-motion="full"] .st-house:not(.still) > i::before {
  animation: l-drift var(--T2) linear infinite;
}
html[data-motion="full"] .st-choose:not(.still) > i::before {
  animation: l-tide var(--T) var(--e-sine) infinite;
}
html[data-motion="full"] .st-outside:not(.still) > i {
  animation: l-far var(--T) var(--e-sine) infinite;
}
html[data-motion="full"] .st-idle:not(.still) > i {
  animation: l-rest var(--T2) var(--e-sine) infinite;
}

/* ---------- 5. bead-chain: data as beads (5H 15, 7D 14, progress 15) ----------
   Build with Bloom.chain(el, {n, v, kind:'5h'|'7d'|'progress'}); it marks the leading bead .edge and the chain .hot from 80 %. */
.bead-chain {
  --b: 7px;
  --gap: 3px;
  --chain-fill: var(--use-5h);
  display: inline-flex;
  gap: var(--gap);
  align-items: center;
  vertical-align: middle;
}
.bead-chain > i {
  position: relative;
  flex: none;
  width: var(--b);
  height: var(--b);
  border-radius: 50%;
  overflow: hidden;
  background: var(--use-track);
  box-shadow: inset 0 0 0 1px var(--chain-empty);
}
.bead-chain > i::before {
  content: "";
  position: absolute;
  inset: 0;
  background: var(--chain-fill);
  transform-origin: left;
  transform: scaleX(clamp(0, calc(var(--v) * var(--n) - var(--i)), 1));
  transition: transform var(--d-state) var(--e-out);
}
.bead-chain > i.edge::before {
  background: linear-gradient(90deg, var(--chain-fill) 55%, var(--cream));
}
.bead-chain.u7d {
  --chain-fill: var(--use-7d);
}
.bead-chain.u5h.hot {
  --chain-fill: var(--hot-5h);
}
.bead-chain.u7d.hot {
  --chain-fill: var(--hot-7d);
}
.bead-chain.progress {
  --chain-fill: var(--lamp-working);
}
html[data-motion="full"] .bead-chain.hot:not(.still) > i.edge {
  animation: bl-breathe var(--T-breath) var(--e-sine) infinite;
}
html[data-motion="reduce"] .bead-chain > i::before {
  transition: none;
}

/* ---------- 6. bead-wave: Background{n}, a highlight walks the chain once per 7 s ----------
   Bloom.wave(n) -> HTML. Cap 7 beads, then "+k" in Plex. */
.bead-wave {
  --b: 5px;
  display: inline-flex;
  gap: 3px;
  align-items: center;
  vertical-align: middle;
}
.bead-wave > i {
  flex: none;
  width: var(--b);
  height: var(--b);
  border-radius: 50%;
  background: var(--lamp-bg);
}
.bead-wave > em {
  font: 400 10px/1 var(--f-mono);
  font-style: normal;
  color: var(--text-caption);
  margin-left: 2px;
}
html[data-motion="full"] .bead-wave:not(.still) > i {
  animation: w-pass var(--T) var(--e-sine) infinite;
  animation-delay: calc((var(--i) - var(--n)) * var(--T) / var(--n));
}

/* ---------- 7. bead-ring: the indeterminate wait (15 beads, colour travels, nothing rotates) ----------
   Bloom.ring({r, b}) -> HTML. Chrome-safe colours only. Reduce motion: a still hue wheel (each bead keeps --still). */
.bead-ring {
  --r: 14px;
  --b: 5px;
  position: relative;
  display: inline-block;
  width: calc(2 * var(--r) + var(--b));
  height: calc(2 * var(--r) + var(--b));
  flex: none;
}
.bead-ring > i {
  position: absolute;
  left: 50%;
  top: 50%;
  width: var(--b);
  height: var(--b);
  margin: calc(var(--b) / -2);
  border-radius: 50%;
  background: var(--still);
  transform: rotate(calc(var(--i) * 24deg)) translateY(calc(-1 * var(--r)));
}
html[data-motion="full"] .bead-ring:not(.still) > i {
  animation:
    r-hue var(--T) linear infinite,
    bl-breathe var(--T-breath) var(--e-sine) infinite;
  animation-delay: calc((var(--i) - 15) * var(--T) / 15);
}

/* ---------- 8. pill: every button ----------
   <button class="pill">Cancel</button>  .primary | .ghost | .danger | .sm   Key hint: <kbd class="kbd">⌘K</kbd> inside. */
.pill {
  --pill-c: var(--puff);
  --pill-ink: var(--puff-ink);
  --pill-occl: var(--occl);
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  height: 28px;
  padding: 0 14px;
  border: 0;
  border-radius: var(--r-pill);
  font: var(--w-med) 13px/1 var(--f-chrome);
  color: var(--pill-ink);
  background: var(--pill-c);
  cursor: pointer;
  white-space: nowrap;
  box-shadow:
    inset 0 -5px 10px var(--pill-occl),
    inset 0 1px 0 var(--lip);
  transition:
    transform var(--d-quick) var(--e-sine),
    box-shadow var(--d-quick) var(--e-sine),
    background-color var(--d-quick) var(--e-sine);
}
.pill:hover {
  transform: translateY(-1px);
  box-shadow:
    inset 0 -5px 10px var(--pill-occl),
    inset 0 1px 0 var(--lip-hi);
  transition-timing-function: var(--e-settle);
}
.pill:active {
  transform: scale(0.96);
  box-shadow:
    inset 0 -2px 8px var(--occl-deep),
    inset 0 1px 0 var(--lip);
  transition-duration: var(--d-tap);
  transition-timing-function: var(--e-settle);
}
.pill.primary {
  --pill-c: var(--ink-1);
  --pill-ink: var(--field);
  --pill-occl: var(--occl-light);
}
.pill.ghost {
  --pill-c: transparent;
  --pill-ink: var(--text-secondary);
  box-shadow: none;
}
.pill.ghost:hover {
  background: var(--raised);
  color: var(--text-strong);
  box-shadow: none;
}
.pill.danger {
  --pill-ink: var(--danger);
}
.pill.sm {
  height: 22px;
  padding: 0 10px;
  font-size: 12px;
  gap: 5px;
}
.pill:focus-visible {
  outline: none;
}
.pill:focus-visible::after {
  content: "";
  position: absolute;
  inset: -4px;
  border-radius: var(--r-pill);
  box-shadow: 0 0 0 2px var(--focus);
  pointer-events: none;
}
html[data-motion="full"] .pill:focus-visible::after {
  animation:
    f-in var(--d-quick) var(--e-settle) both,
    f-breathe var(--T-breath) var(--e-sine) infinite;
}
html[data-motion="reduce"] .pill:hover,
html[data-motion="reduce"] .pill:active {
  transform: none;
}

/* ---------- 9. seg: segmented control (Night|Field, Turns|Diff, Recent|Name|Folder) ----------
   <div class="seg" role="group" aria-label="Theme"><button aria-pressed="true">Night</button><button aria-pressed="false">Field</button></div>
   Bloom.seg(el, onChange) wires it and adds the sliding pill. */
.seg {
  position: relative;
  display: inline-flex;
  padding: 3px;
  gap: 0;
  border-radius: var(--r-pill);
  background: var(--sunken);
  box-shadow: var(--well);
  isolation: isolate;
}
.seg > button {
  position: relative;
  z-index: 1;
  height: 24px;
  padding: 0 12px;
  border: 0;
  background: none;
  border-radius: var(--r-pill);
  cursor: pointer;
  font: var(--w-med) 12.5px/1 var(--f-chrome);
  color: var(--text-caption);
  white-space: nowrap;
  transition: color var(--d-quick) var(--e-settle);
}
.seg > button[aria-pressed="true"] {
  color: var(--text-strong);
}
.seg > .seg-pill {
  position: absolute;
  z-index: 0;
  top: 3px;
  bottom: 3px;
  left: 0;
  width: var(--w, 0px);
  transform: translateX(var(--x, 0px));
  border-radius: var(--r-pill);
  background: var(--puff);
  box-shadow:
    inset 0 -3px 6px var(--occl),
    inset 0 1px 0 var(--lip);
  transition:
    transform var(--d-quick) var(--e-settle),
    width var(--d-quick) var(--e-settle);
}
.seg.sm > button {
  height: 20px;
  padding: 0 9px;
  font-size: 11.5px;
}
html[data-motion="reduce"] .seg > .seg-pill {
  transition: none;
}

/* ---------- 10. toggle: boolean switch (Settings rows) ----------
   <button class="toggle" role="switch" aria-checked="true" aria-label="Sound"><i></i></button> */
.toggle {
  position: relative;
  width: 36px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: var(--r-pill);
  background: var(--sunken);
  box-shadow:
    var(--well),
    inset 0 0 0 1px var(--seam);
  cursor: pointer;
  flex: none;
  transition: background-color var(--d-quick) var(--e-sine);
}
.toggle > i {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--ink-3);
  box-shadow:
    inset 0 -3px 5px var(--occl),
    inset 0 1px 0 var(--lip);
  transition:
    transform var(--d-quick) var(--e-settle),
    background-color var(--d-quick) var(--e-sine);
}
.toggle[aria-checked="true"] {
  background: var(--toggle-on);
  box-shadow: inset 0 2px 6px -2px var(--occl);
}
.toggle[aria-checked="true"] > i {
  transform: translateX(14px);
  background: var(--ink-1);
}
html[data-motion="reduce"] .toggle > i {
  transition: background-color var(--d-quick) var(--e-sine);
}

/* ---------- 11. chip: a terse tag in a pill (Plex, upper case) ----------
   <span class="chip">LOGIN</span>  .on-needs (needs-you row) | .mark (no box: JOB, OUTSIDE) | .data (diff stats, sizes) */
.chip {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 7px;
  border-radius: var(--r-pill);
  background: var(--raised);
  font: 500 9.5px/1 var(--f-mono);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary);
  white-space: nowrap;
}
.chip.on-needs {
  background: var(--overlay);
  color: var(--text-strong);
}
.chip.mark {
  background: none;
  padding: 0;
  color: var(--text-caption);
}
.chip.data {
  text-transform: none;
  letter-spacing: 0;
  font-size: 10.5px;
}
.chip.guest {
  background: none;
  color: var(--text-secondary);
  outline: 1.5px dashed var(--seam);
  outline-offset: -1.5px;
}

/* ---------- 12. kbd, input ---------- */
.kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  border-radius: var(--r-s);
  background: var(--raised);
  box-shadow:
    inset 0 -2px 4px var(--occl),
    inset 0 1px 0 var(--lip);
  font:
    500 11px/1 var(--f-mono),
    system-ui;
  color: var(--text-secondary);
  white-space: nowrap;
}
.pill .kbd {
  background: none;
  box-shadow: none;
  padding: 0;
  min-width: 0;
  height: auto;
  color: var(--text-caption);
  font-weight: 400;
}
.kbd.theirs {
  background: none;
  box-shadow: none;
  outline: 1.5px dashed var(--seam);
  outline-offset: -1.5px;
} /* keys CONTROL leaves to Claude */
.input {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 28px;
  padding: 0 10px;
  border-radius: var(--r-m);
  background: var(--sunken);
  box-shadow: var(--well);
  font: 400 12px/1 var(--f-mono);
  color: var(--text-strong);
}
.input .ph {
  color: var(--text-disabled);
  font-family: var(--f-chrome);
}

/* ---------- 13. session-row, group-row, wt-row (app sidebar, 1:1 sizes from inventory §4) ---------- */
.session-row {
  --indent: 14px;
  position: relative;
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr) auto;
  grid-template-rows: 17px 14px;
  column-gap: 9px;
  row-gap: 1px;
  align-items: center;
  min-height: 40px;
  margin: 0 6px;
  padding: 4px 10px 4px var(--indent);
  border-radius: var(--r-m);
  cursor: default;
  transition: background-color var(--d-tap) var(--e-settle);
}
.session-row:hover {
  background: color-mix(in srgb, var(--raised) 70%, var(--overlay));
}
.session-row > .lamp {
  grid-row: 1;
}
.session-row .sr-name {
  grid-row: 1;
  grid-column: 2;
  font: 500 12.5px/17px var(--f-mono);
  color: var(--text-body);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.session-row .sr-right {
  grid-row: 1;
  grid-column: 3;
  display: flex;
  align-items: center;
  gap: 8px;
}
.session-row .sr-age {
  font: 400 10.5px/1 var(--f-mono);
  color: var(--text-caption);
}
.session-row .sr-sub {
  grid-row: 2;
  grid-column: 2 / 4;
  font: var(--w-reg) 11px/14px var(--f-chrome);
  color: var(--text-caption);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.session-row[data-st="needs"] {
  background: var(--needs-tint);
}
.session-row[data-st="needs"] .sr-name {
  font-weight: 600;
  color: var(--text-strong);
}
.session-row[data-st="house"] .sr-name {
  color: var(--text-secondary);
}
.session-row[data-st="outside"] .sr-name {
  color: var(--text-caption);
}
.session-row[aria-selected="true"] {
  background: var(--selection);
}
.session-row[aria-selected="true"] .sr-name {
  color: var(--text-strong);
}
.session-row.multi {
  background: var(--raised);
}
.group-row {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 28px;
  margin: 6px 6px 0;
  padding: 0 10px 0 12px;
  border-radius: var(--r-m);
  font: var(--w-strong) 11.5px/1 var(--f-chrome);
  letter-spacing: 0.02em;
  color: var(--text-secondary);
}
.group-row .gi {
  width: 10px;
  height: 10px;
  color: var(--text-caption);
}
.group-row .n {
  margin-left: auto;
  font: 400 10.5px/1 var(--f-mono);
  color: var(--text-caption);
}
.group-row .lamp-strip {
  display: inline-flex;
  gap: 3px;
} /* folded / locked groups only: one lamp per hidden session */
.wt-row {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 22px;
  margin: 0 6px;
  padding: 0 10px 0 calc(var(--indent, 24px) + 18px);
  border-radius: var(--r-m);
  font: 400 11.5px/1 var(--f-mono);
  color: var(--text-secondary);
}
.wt-row .gi {
  width: 12px;
  height: 12px;
  color: var(--text-caption);
}
.wt-row .st {
  margin-left: auto;
  font-size: 10.5px;
  color: var(--text-caption);
}
.wt-row[aria-selected="true"] {
  color: var(--text-strong);
  background: color-mix(in srgb, var(--selection) 70%, transparent);
}

/* ---------- 14. panel: any region or viewer ----------
   .panel (raised) | .panel.well (sunk: terminal wells, inputs, diff gutters) | .panel.float (anything that floats: menus, ⌘K, sheets, the menu-bar panel) */
.panel {
  background: var(--raised);
  border-radius: var(--r-l);
  padding: var(--s-4);
  min-width: 0;
}
.panel.well {
  background: var(--sunken);
  box-shadow: var(--well);
}
.panel.float {
  background: var(--overlay);
  box-shadow:
    var(--float),
    inset 0 1px 0 var(--lip);
}
.panel.flush {
  padding: 0;
  overflow: hidden;
}
.panel-h {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  font: var(--w-med) 12px/1.3 var(--f-chrome);
  color: var(--text-label);
}
.seam {
  height: 2px;
  border-radius: 1px;
  background: var(--seam);
  margin: 8px 12px;
} /* the only line: where a tone step cannot separate */

/* ---------- 15. window: the CONTROL window frame (drawn 1:1, scaled by .bl-scale) ----------
   <div class="bl-scale" data-w="1512" data-h="945"><div class="window" data-region> band + body </div></div> */
.window {
  position: relative;
  width: 1512px;
  height: 945px;
  border-radius: var(--r-win);
  background: var(--raised);
  overflow: hidden;
  display: grid;
  grid-template-rows: 42px minmax(0, 1fr);
  color: var(--text-body);
  font: var(--w-reg) 12px/17px var(--f-chrome);
  box-shadow:
    var(--float),
    inset 0 1px 0 var(--lip);
  contain: layout paint;
}
.window-band {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 12px 0 14px;
  min-width: 0;
}
.window-band .name {
  font: 600 13px/1 var(--f-mono);
  letter-spacing: 0.04em;
  color: var(--text-strong);
  white-space: nowrap;
}
.window-band .path {
  font: 400 11px/1 var(--f-mono);
  color: var(--text-caption);
  white-space: nowrap;
}
.lights {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  flex: none;
  margin-right: 6px;
}
.lights i {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--seam);
} /* the platform's lights, inactive: its curve, zero chroma */
.window-body {
  display: grid;
  grid-template-columns: 272px minmax(0, 1fr) 440px;
  gap: 6px;
  padding: 0 6px 6px 0;
  min-height: 0;
}
.pane {
  background: var(--field);
  border-radius: var(--r-l);
  overflow: hidden;
  min-height: 0;
  min-width: 0;
}

/* ---------- 16. toast: an in-place note. CONTROL posts no banners, toasts or pop-ups ----------
   A .toast lives inside its own region (the selection bar, the lock offer, the unlock digest, a PEER note, the break-through band).
   Never fixed to the viewport, never takes focus, never covers the terminal. Enter with Bloom.rise(el), leave with Bloom.sink(el). */
.toast {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 38px;
  padding: 6px 6px 6px 14px;
  border-radius: var(--r-l);
  background: var(--overlay);
  box-shadow: inset 0 1px 0 var(--lip);
  font: var(--w-reg) 13px/1.4 var(--f-chrome);
  color: var(--text-body);
}
.toast b {
  font-weight: var(--w-med);
}
.toast .t-num {
  color: var(--text-caption);
  font-size: 11.5px;
}

/* ---------- 17. theme scrim (runtime only): the bridge colour blooms from the toggle with a soft 64 px front ---------- */
@property --scrim-r {
  syntax: "<length>";
  inherits: false;
  initial-value: 0px;
}
.scrim {
  position: fixed;
  inset: 0;
  z-index: 1000;
  pointer-events: none;
  opacity: 0.94;
  -webkit-mask: radial-gradient(
    circle at var(--x) var(--y),
    #000 calc(var(--scrim-r) - 64px),
    transparent var(--scrim-r)
  );
  mask: radial-gradient(
    circle at var(--x) var(--y),
    #000 calc(var(--scrim-r) - 64px),
    transparent var(--scrim-r)
  );
}
```

## Appendix D: the shell's other files

- `BUILD/runtime.js`: `window.Bloom` (API in §4). Read it if you need a detail; never edit it.
- `BUILD/sprite.svg`: the glyph symbols (`Bloom.gi(name)`).
- `BUILD/reel.js`: `window.BLOOM_REEL` (`Bloom.reel`).
- `BUILD/assemble.py`: assembly and the part lint. `BUILD/parts/_test.html` is the shell's own component check: read it as a worked example of a part (it is not assembled into the doc).
- `BUILD/shot.sh`, `BUILD/shotcdp.js`, `BUILD/probe.js`: the headless checks in §0.
