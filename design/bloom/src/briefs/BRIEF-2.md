# BRIEF-2: Bloom 2 (binding; supersedes BRIEF.md where it says so)

The revision brief for `design/bloom/index.html`. Read this first, then BRIEF.md for everything this file does not supersede. Where the two disagree, this file wins. Paths are BRIEF.md's (`REPO`, `OUT`, `BUILD`, `SRC`), plus `C2 = SRC/colour2` (this revision's colour scripts and outputs).

**What the owner said, in one breath (6 Oct 2026):** Field is the favourite and becomes the default. Night's field becomes the plain near-black grey `#2F2E2E`; the navy `#131528` and its blue-black neighbours survive only as depth (round 3, below, retires them too). v1 reskinned direction D, so the pearls and the flowing ramps never reached the window: put them in the app. Failed becomes amber-yellow, not brown. Bring the gradients' saturation back. Drop the half-moon on done. Lamps lose their colour and keep their motion; each session gets a horizontal gradient ornament, the **state bar**, that carries the state colour (blue working, red needs you, amber failed, green done). And a wacky one: a centre without a terminal (new section `chat`).

**Round 3, later the same day.** "The blue-blacks just don't work here … occlusion is fine because it's shading only, but I feel like we just stick to normal non-hues for these": Night's wells and inputs become neutral grey, and `#060714` stays only as shading. The owner loves the Background bead form, so every state bar in a list becomes a bead bar, on the right of its row before the lamp, and lamps grow to 15 px. "The colours gradient is too sharp, I can clearly see bands of colours rather than smooth colours that flow": every state ramp becomes one smooth blend inside its family. Usage becomes a plain ink line ("we already have a lot of bead action going on"). Rows trade the word "claude" for Claude's spark and gain a context line and the chat's tokens.

---

## 1. What changed and why

| # | Change | Why |
|---|---|---|
| 1 | Field is the default theme; the toggle reads **Field \| Night** | The owner's favourite. Pre-paint defaults to `field`; preferences live under a new storage key `bloom2`, so a v1 "night" choice does not override the new default |
| 2 | Night's page field is `#2F2E2E` (C 0.001: neutral). Chrome steps up from it in neutral grey and everything sunk steps down in the same grey: `--sunken` `#242323` (inputs, tracks, gutters) and `--deep` `#1B1A1A` (wells: terminal, chat centre, code, diffs), both at C ≤ 0.002. `--occlusion` `#060714` is the one blue-black left, and it is shading only | The navy field forced blue saturation and fought the indicators. Round 3: the blue-black wells (`#131528`, `#1e2030`) did not work either; neutral steps of about 0.04 L each way (§11.1) |
| 3 | Night inks lifted (ink-1 `#f5ebe4` … ink-4 `#a9aebf`), Night light family steps lifted to L 0.825–0.835, Night danger lifted to `#ea9d82` | A lighter field costs contrast. Every text tier is re-proved on field, raised, overlay, selection, sunken and deep (§11) |
| 4 | **Lamps carry no hue.** Ink tones only; each state keeps its own motion and a unique shape. Done is a ring with a centred core (◉); housekeeping becomes a dashed ring | Function split: lamp = motion (activity, urgency), bar = colour (state). The half-moon (v1's corner dot inside a ring) is gone everywhere |
| 5 | **State bar** (`.sbar`): one horizontal ramp per session, a smooth wave inside the state's family, flowing on the shared clock. In every list it is a **bead bar** (5 px beads at an 8 px pitch), a third of the row, on the right before the lamp; a quarter of the menu-bar panel; tip = three beads; showcases 10 px beads. The one session in focus keeps a continuous full bar (6 px); band (10 px) is a doc ornament | The owner liked the idle band ornament, then loved the Background beads (round 3). Colour has its own home, outside the lamp; round 3 drops the bridges inside a bar, which read as bands |
| 6 | **Failed is amber-yellow** (h 81–96), a new family in both themes | Clear of arm's 12°–55° moat by 25.8° (Field) and 27.3° (Night); never brown at its base step |
| 7 | **Pearls** (`.pearl`): the bead material at 8–20 px for identity, avatars, counts, tallies and the menu-bar panel | The pearl beads (C8 identity tints) were the look the owner wanted in the window |
| 8 | Saturation back: hero sage C 0.100 → 0.130 (Night) and 0.084 → 0.120 (Field); safe ramp v2 with C up to 0.129 (Night) and 0.160 (Field); state bars at C 0.12–0.18 | "Bring in some of the saturation of the gradients back". Arm alone stays above C 0.2 and past sRGB |
| 9 | The calibrated saturation rule replaces v1's "one saturated element per view" (§7) | Saturated colour is now allowed, but only in small, thin things; arm keeps the top of chroma and tempo |
| 10 | Night bead rim `--rim-mix` 0.45 → 0.60 | On `#2F2E2E` the 0.45 rim falls to 2.31:1; 0.60 is the smallest mix that gives every bead silhouette 3:1 on the field and on raised chrome (§11.6) |
| 11 | New section `chat` ("Without a terminal") after `window`; eight sections; sections after it renumber | The owner's wacky idea, with `SRC/research/chat.md` as its source |
| 12 | Theme switch keeps a pending target and retargets to the latest click (ledger 4); a primary pill's key hint uses the fill's own ink at .75 (ledger 2) | v1 verify catches |
| 13 | **Round 3 rows:** line 1 reads right to left: the 15 px lamp at the far right is the end cap, then the bead bar, then the name; line 2: Claude's spark and the state words, any chips, then the context line and %, the tokens this chat has spent, and the age, right-aligned. Rows 42 px; every lamp and every bar in one column | The owner's round 3. Lamps 1.5× (10 → 15 px); the word "claude" becomes the spark; working and Background share one bead bar (the lamp tells them apart) |
| 14 | **Usage is a plain ink line** (5H, 7D): ink-1 on the sunken track, rounded, no hue; past 80 % only the leading end breathes | "We already have a lot of bead action going on". Progress chains ("Restoring 7 sessions") keep their beads |
| 15 | **Smooth state ramps:** base → light → base → deep → base as one sine wave in OKLab (needs-you: arm ↔ arm-deep); no cream, navy or wine inside a bar. The bridges stay where families meet: the hero ramp, and the wipe when a bar changes state | "Bands of colours rather than smooth colours that flow": the steepest 2 px step falls from ΔE 0.236 to 0.0125 in a row bar (§11.3) |

---

## 2. Page mechanics (changes to BRIEF.md §4)

- **Default theme Field.** `html[data-theme]` from URL param, then stored preference (`localStorage['bloom2']`), then `field`. Night never follows the system appearance, and neither does Field.
- **Nav:** `Field | Night` (Field first). Section links are short so eight sections fit one row at 1440: Colour · Motion · Form · Window · Without a terminal · Around · H13 delta. Below 1440 the nav wraps as v1 did.
- **Theme switch (ledger 4):** a click only sets the target and marks the pressed pill at once; one runner owns the scrim and, at the swap, applies the latest target. A Field → Night → Field double click ends in Field with no extra scrim (driven headless: three click patterns, no stray scrim). The bridge is unchanged: cream into Field, navy into Night; lightness moves one way (§11.8).
- **Section order and numbers:** `masthead` 01 · `colour` 02 · `motion` 03 · `form` 04 · `window` 05 · **`chat` 06** · `around` 07 · `delta` 08. The runtime fills eight step beads; your header's `no` is your number above.
- **New section:** id `chat`, prefix `.s-chat-`, root class `s-chat-root`, keyframes `s-chat-*`, title "Without a terminal". A lint-clean stub is in `BUILD/parts/chat.html`; the chat builder replaces the whole file.
- **DOM budgets:** masthead 200 · colour 2,500 · motion 2,500 · form 1,500 · window 3,500 · **chat 3,000** · around 2,500 · delta 600. `OUT` stays under 1.5 MB (the gate fails at 1.6 MB).
- **Gate:** `SRC/gate.sh <part-id>` must print `GATE PASS`. The controller runs `gate.sh all`. Never write `OUT` yourself.

---

## 3. Tokens

The token file is `BUILD/tokens.css`. Field is `:root` and `[data-theme="field"]`; Night is `[data-theme="night"]`. A figure can force a theme with `data-theme` plus `class="themed"`, as before. Every colour below comes from `C2/derive2.py` (output `C2/out2.md`); `python3 C2/check_tokens.py` proves `tokens.css` matches it (it prints `TOKENS MATCH`).

**Rules for using tokens (BRIEF.md §3, revised)**
- Never type a colour in CSS. Role tokens first, then family tokens. The literal-colour exceptions of BRIEF.md §3 stand.
- **Surfaces in Night:** the page is `--field` (neutral grey). Chrome is `--raised` / `--overlay`. Anything sunk is the same neutral grey, a step down: `--sunken` `#242323` (inputs, tracks, seg tracks, gutters), `--deep` `#1B1A1A` (terminal, chat centre, code, diff and TRACE panes: `.pane`, `.panel.deep`). `--occlusion` `#060714` is the one blue-black, and it is **shading only**: box-shadows and inset gradients, never a fill. **No hued surface in Night** (selection, `--blue-wash`, is the one blue surface, and it rises). In Field, `--deep` equals `--field`, so Field looks exactly as v1.
- **Diffs, ANSI and TRACE live in wells.** Round 3 re-proves them in the neutral well (`C2/out2.md` §N ANSI, §O diffs, §B the `deep` column): the washes sit −0.049 L (removed) and +0.056 L (added) around it, ANSI slots 1–15 reach 6.45:1 or more. Do not put a diff wash on the grey field.
- **Usage is plain ink:** the 5H and 7D lines and a row's context line are ink on `--use-track`; never a hue (no `--use-5h`, `--use-7d` or `--hot-*`: those tokens are gone; the line takes `--use-ink`).
- **`--ramp`** (hero ramp): masthead hero, Colour figures, Form's bead stair, the lock plate, the app icon. Never next to state. **`--ramp-safe`**: the TRACE live rail, bead rings. The housekeeping bar takes `--sb-house`, the safe ramp's keys blended smoothly.
- **State colour lives only in:** state bars (`--sb-*` through `.sbar`), state pearls (`--st-*` through `.pearl[data-st]`), the needs-you row tint (`--needs-tint`) and the optional failed row tint (`--failed-tint`). Never text: state words stay ink.
- **Arm:** the needs-you bar, needs pearls of 12 px or less, the needs-you row tint, and the arm figures in Colour. Arm is never text. The bar is the one arm fill longer than a lamp, and it is never taller than 6 px in app chrome (10 px for a doc ornament band or showcase beads).
- **Amber:** the failed bar, failed pearls and the optional `--failed-tint`. Never text. `--amber-wash` / `--amber-word` are for a failure note's background only; in Night they read as warm umber, so they never carry the signal.

**The full token set, both themes** (generated from `BUILD/tokens.css` by `C2/tables.py`)

**Surfaces**

| Token | Field hex | Field OKLCH | Night hex | Night OKLCH |
| --- | --- | --- | --- | --- |
| `--field` | `#d6deee` | 0.899 0.024 264.4 | `#2f2e2e` | 0.302 0.001 17.2 |
| `--deep` | `#d6deee` | 0.899 0.024 264.4 | `#1b1a1a` | 0.219 0.002 17.3 |
| `--sunken` | `#cdd7ed` | 0.878 0.032 266.1 | `#242323` | 0.257 0.001 17.3 |
| `--raised` | `#e3e9f4` | 0.933 0.016 262.8 | `#383737` | 0.338 0.001 17.2 |
| `--overlay` | `#edf1f9` | 0.957 0.012 264.5 | `#424141` | 0.376 0.001 17.2 |
| `--selection` | `#e7edff` (= `blue-wash`) | 0.947 0.025 271.1 | `#373f5b` (= `blue-wash`) | 0.373 0.049 271.6 |
| `--seam` | `#b9c2d9` | 0.814 0.034 268.6 | `#4f4e4e` | 0.425 0.001 17.2 |
| `--occlusion` | `#262b5b` | 0.312 0.085 275.9 | `#060714` | 0.136 0.029 277.6 |

**Inks**

| Token | Field hex | Field OKLCH | Night hex | Night OKLCH |
| --- | --- | --- | --- | --- |
| `--ink-1` | `#262b5b` | 0.312 0.085 275.9 | `#f5ebe4` | 0.946 0.014 57.6 |
| `--ink-2` | `#333964` | 0.361 0.074 276.0 | `#ebdcd5` | 0.905 0.019 46.8 |
| `--ink-3` | `#414970` | 0.416 0.066 274.3 | `#c1c6d5` | 0.827 0.022 271.1 |
| `--ink-4` | `#525a7c` | 0.475 0.056 273.9 | `#a9aebf` | 0.752 0.025 272.7 |
| `--ghost` | `#7d85a0` | 0.620 0.042 272.2 | `#767882` | 0.574 0.015 276.9 |
| `--cream` | `#dbc3c2` | 0.837 0.027 20.6 | `#dbc3c2` | 0.837 0.027 20.6 |
| `--navy` | `#262b5b` | 0.312 0.085 275.9 | `#2a2f63` | 0.330 0.091 276.1 |

**Reds and bridges**

| Token | Field hex | Field OKLCH | Night hex | Night OKLCH |
| --- | --- | --- | --- | --- |
| `--arm` | `#d90e0b` | 0.559 0.225 29.0 | `#ff4438` | 0.662 0.225 28.5 |
| `--arm-deep` | `#861118` | 0.399 0.150 25.2 | `#c22823` | 0.531 0.191 27.9 |
| `--arm-dim` | `#e8ada5` | 0.800 0.071 27.5 | `#6b2620` | 0.370 0.100 27.9 |
| `--danger` | `#9b3a20` | 0.481 0.136 35.8 | `#ea9d82` | 0.766 0.100 40.1 |
| `--wine` | `#5c2b40` | 0.362 0.076 354.6 | `#5c2b40` | 0.362 0.076 354.6 |

**Amber (failed)**

| Token | Field hex | Field OKLCH | Night hex | Night OKLCH |
| --- | --- | --- | --- | --- |
| `--amber-light` | `#f0d565` | 0.874 0.135 95.9 | `#fde68a` | 0.924 0.115 95.7 |
| `--amber-base` | `#e4b125` | 0.786 0.152 86.3 | `#fccf47` | 0.871 0.155 90.0 |
| `--amber-deep` | `#c6911d` | 0.690 0.135 80.8 | `#eeb32f` | 0.801 0.152 82.3 |
| `--amber-wash` | `#f4eac4` | 0.935 0.051 95.0 | `#302b1f` | 0.291 0.022 88.0 |
| `--amber-word` | `#f0d680` | 0.879 0.110 93.1 | `#473c24` | 0.361 0.041 85.8 |

**State-bar families**

| Token | Field hex | Field OKLCH | Night hex | Night OKLCH |
| --- | --- | --- | --- | --- |
| `--bar-blue-l` | `#899ff3` | 0.720 0.125 271.8 | `#a4b7fa` | 0.790 0.098 271.8 |
| `--bar-blue-b` | `#5773e1` | 0.591 0.170 269.8 | `#6d8bf8` | 0.665 0.165 269.9 |
| `--bar-blue-d` | `#3653c5` | 0.490 0.181 268.1 | `#4768db` | 0.556 0.180 268.0 |
| `--bar-green-l` | `#93c35e` | 0.761 0.141 130.2 | `#b0dc75` | 0.841 0.140 128.1 |
| `--bar-green-b` | `#5da12a` | 0.640 0.165 134.9 | `#7cc74b` | 0.755 0.175 135.0 |
| `--bar-green-d` | `#397f19` | 0.531 0.150 138.1 | `#449a2f` | 0.611 0.165 140.0 |
| `--bar-lilac-l` | `#d1a9e3` | 0.790 0.091 315.2 | `#e1c0f0` | 0.851 0.074 315.2 |
| `--bar-lilac-b` | `#b283c7` | 0.680 0.110 315.0 | `#d0a4e4` | 0.780 0.101 315.0 |
| `--bar-lilac-d` | `#8f5da4` | 0.560 0.119 315.4 | `#b481cb` | 0.680 0.119 314.9 |

**Families (v1, Night light steps lifted)**

| Token | Field hex | Field OKLCH | Night hex | Night OKLCH |
| --- | --- | --- | --- | --- |
| `--rose-light` | `#ef9cac` | 0.780 0.101 7.1 | `#fcb1bf` | 0.835 0.089 6.9 |
| `--rose-base` | `#b54b6a` | 0.560 0.140 4.5 | `#ed7d99` | 0.722 0.140 5.3 |
| `--rose-deep` | `#7c2e45` | 0.420 0.110 4.8 | `#b94769` | 0.560 0.150 4.8 |
| `--rose-wash` | `#e9c8cf` | 0.863 0.038 3.6 | `#1d070e` | 0.170 0.040 1.8 |
| `--rose-word` | `#e7a8b6` | 0.795 0.076 4.3 | `#450f23` | 0.270 0.084 2.1 |
| `--green-light` | `#a2c580` | 0.781 0.101 130.3 | `#b1d391` | 0.826 0.096 130.4 |
| `--green-base` | `#4a7f1b` | 0.539 0.140 133.9 | `#7daf4e` | 0.697 0.139 131.8 |
| `--green-deep` | `#2b5a17` | 0.419 0.110 137.9 | `#48871e` | 0.560 0.150 135.9 |
| `--green-wash` | `#dbefd1` | 0.929 0.045 135.1 | `#1b2d17` | 0.275 0.046 140.0 |
| `--green-word` | `#c8f2ae` | 0.915 0.100 133.8 | `#254519` | 0.354 0.080 138.0 |
| `--blue-light` | `#a1b4f8` | 0.781 0.100 271.9 | `#b3c3fc` | 0.825 0.082 272.3 |
| `--blue-base` | `#465cb3` | 0.503 0.140 270.1 | `#7792ef` | 0.680 0.141 270.1 |
| `--blue-deep` | `#334889` | 0.420 0.111 267.9 | `#4f6dcc` | 0.560 0.151 268.1 |
| `--blue-wash` | `#e7edff` | 0.947 0.025 271.1 | `#373f5b` | 0.373 0.049 271.6 |
| `--lilac-light` | `#d0a4e4` | 0.780 0.101 315.0 | `#e0b7f3` | 0.835 0.093 315.0 |
| `--lilac-deep` | `#67327d` | 0.421 0.130 314.9 | `#b481cb` | 0.680 0.119 314.9 |

**Identity tints (pearls)**

| Token | Field hex | Field OKLCH | Night hex | Night OKLCH |
| --- | --- | --- | --- | --- |
| `--id-rose` | `#b86c81` | 0.621 0.100 2.6 | `#e299ac` | 0.760 0.090 2.4 |
| `--id-butter` | `#9e8337` | 0.620 0.100 89.5 | `#c7af6d` | 0.760 0.090 90.2 |
| `--id-sage` | `#65955a` | 0.620 0.100 139.8 | `#93c089` | 0.761 0.090 140.0 |
| `--id-mint` | `#209993` | 0.619 0.100 189.7 | `#66c4be` | 0.761 0.090 190.0 |
| `--id-peri` | `#6c84c3` | 0.621 0.100 267.6 | `#98afeb` | 0.759 0.090 268.0 |
| `--id-lilac` | `#9f72ad` | 0.619 0.100 318.0 | `#c99fd6` | 0.759 0.090 318.1 |

**Safe-ramp plateaus**

| Token | Field hex | Field OKLCH | Night hex | Night OKLCH |
| --- | --- | --- | --- | --- |
| `--rs-a` | `#333964` | 0.361 0.074 276.0 | `#dbc3c2` | 0.837 0.027 20.6 |
| `--rs-b` | `#305d12` | 0.430 0.115 135.8 | `#a2ce72` | 0.799 0.129 129.8 |
| `--rs-c` | `#2b44a6` | 0.430 0.160 268.0 | `#9cb0fb` | 0.771 0.110 272.2 |

**Per-state single colour (pearls, tallies)**

| Token | Field hex | Field OKLCH | Night hex | Night OKLCH |
| --- | --- | --- | --- | --- |
| `--st-needs` | `#d90e0b` (= `arm`) | 0.559 0.225 29.0 | `#ff4438` (= `arm`) | 0.662 0.225 28.5 |
| `--st-failed` | `#e4b125` (= `amber-base`) | 0.786 0.152 86.3 | `#fccf47` (= `amber-base`) | 0.871 0.155 90.0 |
| `--st-done` | `#5da12a` (= `bar-green-b`) | 0.640 0.165 134.9 | `#7cc74b` (= `bar-green-b`) | 0.755 0.175 135.0 |
| `--st-working` | `#5773e1` (= `bar-blue-b`) | 0.591 0.170 269.8 | `#6d8bf8` (= `bar-blue-b`) | 0.665 0.165 269.9 |
| `--st-bg` | `#899ff3` (= `bar-blue-l`) | 0.720 0.125 271.8 | `#a4b7fa` (= `bar-blue-l`) | 0.790 0.098 271.8 |
| `--st-choose` | `#b283c7` (= `bar-lilac-b`) | 0.680 0.110 315.0 | `#d0a4e4` (= `bar-lilac-b`) | 0.780 0.101 315.0 |
| `--st-house` | `#333964` (= `rs-a`) | 0.361 0.074 276.0 | `#dbc3c2` (= `rs-a`) | 0.837 0.027 20.6 |
| `--st-outside` | `#525a7c` (= `ink-4`) | 0.475 0.056 273.9 | `#a9aebf` (= `ink-4`) | 0.752 0.025 272.7 |
| `--st-idle` | `#b9c2d9` (= `seam`) | 0.814 0.034 268.6 | `#4f4e4e` (= `seam`) | 0.425 0.001 17.2 |
| `--st-gone` | `#b9c2d9` (= `seam`) | 0.814 0.034 268.6 | `#4f4e4e` (= `seam`) | 0.425 0.001 17.2 |

**Lamps (ink only)**

| Token | Field hex | Field OKLCH | Night hex | Night OKLCH |
| --- | --- | --- | --- | --- |
| `--lamp-needs` | `#262b5b` (= `ink-1`) | 0.312 0.085 275.9 | `#f5ebe4` (= `ink-1`) | 0.946 0.014 57.6 |
| `--lamp-failed` | `#262b5b` (= `ink-1`) | 0.312 0.085 275.9 | `#f5ebe4` (= `ink-1`) | 0.946 0.014 57.6 |
| `--lamp-done` | `#262b5b` (= `ink-1`) | 0.312 0.085 275.9 | `#f5ebe4` (= `ink-1`) | 0.946 0.014 57.6 |
| `--lamp-working` | `#333964` (= `ink-2`) | 0.361 0.074 276.0 | `#ebdcd5` (= `ink-2`) | 0.905 0.019 46.8 |
| `--lamp-bg` | `#333964` (= `ink-2`) | 0.361 0.074 276.0 | `#ebdcd5` (= `ink-2`) | 0.905 0.019 46.8 |
| `--lamp-choose` | `#414970` (= `ink-3`) | 0.416 0.066 274.3 | `#c1c6d5` (= `ink-3`) | 0.827 0.022 271.1 |
| `--lamp-house` | `#525a7c` (= `ink-4`) | 0.475 0.056 273.9 | `#a9aebf` (= `ink-4`) | 0.752 0.025 272.7 |
| `--lamp-outside` | `#525a7c` (= `ink-4`) | 0.475 0.056 273.9 | `#a9aebf` (= `ink-4`) | 0.752 0.025 272.7 |
| `--lamp-idle` | `#525a7c` (= `ink-4`) | 0.475 0.056 273.9 | `#a9aebf` (= `ink-4`) | 0.752 0.025 272.7 |
| `--lamp-band` | `#7d85a0` (= `ghost`) | 0.620 0.042 272.2 | `#767882` (= `ghost`) | 0.574 0.015 276.9 |
| `--lamp-bridge` | `#b9c2d9` (= `seam`) | 0.814 0.034 268.6 | `#4f4e4e` (= `seam`) | 0.425 0.001 17.2 |

**Roles**

| Token | Field hex | Field OKLCH | Night hex | Night OKLCH |
| --- | --- | --- | --- | --- |
| `--text-strong` | `#262b5b` (= `ink-1`) | 0.312 0.085 275.9 | `#f5ebe4` (= `ink-1`) | 0.946 0.014 57.6 |
| `--text-body` | `#262b5b` (= `ink-1`) | 0.312 0.085 275.9 | `#ebdcd5` (= `ink-2`) | 0.905 0.019 46.8 |
| `--text-secondary` | `#333964` (= `ink-2`) | 0.361 0.074 276.0 | `#c1c6d5` (= `ink-3`) | 0.827 0.022 271.1 |
| `--text-label` | `#414970` (= `ink-3`) | 0.416 0.066 274.3 | `#c1c6d5` (= `ink-3`) | 0.827 0.022 271.1 |
| `--text-caption` | `#525a7c` (= `ink-4`) | 0.475 0.056 273.9 | `#a9aebf` (= `ink-4`) | 0.752 0.025 272.7 |
| `--text-disabled` | `#7d85a0` (= `ghost`) | 0.620 0.042 272.2 | `#767882` (= `ghost`) | 0.574 0.015 276.9 |
| `--focus` | `#465cb3` (= `blue-base`) | 0.503 0.140 270.1 | `#b3c3fc` (= `blue-light`) | 0.825 0.082 272.3 |
| `--link` | `#334889` (= `blue-deep`) | 0.420 0.111 267.9 | `#b3c3fc` (= `blue-light`) | 0.825 0.082 272.3 |
| `--trace-read` | `#334889` (= `blue-deep`) | 0.420 0.111 267.9 | `#b3c3fc` (= `blue-light`) | 0.825 0.082 272.3 |
| `--trace-write` | `#2b5a17` (= `green-deep`) | 0.419 0.110 137.9 | `#b1d391` (= `green-light`) | 0.826 0.096 130.4 |
| `--trace-agent` | `#67327d` (= `lilac-deep`) | 0.421 0.130 314.9 | `#e0b7f3` (= `lilac-light`) | 0.835 0.093 315.0 |
| `--trace-error` | `#262b5b` (= `ink-1`) | 0.312 0.085 275.9 | `#f5ebe4` (= `ink-1`) | 0.946 0.014 57.6 |
| `--trace-live` | `#333964` (= `ink-2`) | 0.361 0.074 276.0 | `#dbc3c2` (= `cream`) | 0.837 0.027 20.6 |
| `--diff-add-mark` | `#2b5a17` (= `green-deep`) | 0.419 0.110 137.9 | `#b1d391` (= `green-light`) | 0.826 0.096 130.4 |
| `--diff-rem-mark` | `#7c2e45` (= `rose-deep`) | 0.420 0.110 4.8 | `#fcb1bf` (= `rose-light`) | 0.835 0.089 6.9 |
| `--use-ink` | `#262b5b` (= `ink-1`) | 0.312 0.085 275.9 | `#f5ebe4` (= `ink-1`) | 0.946 0.014 57.6 |
| `--use-track` | `#cdd7ed` (= `sunken`) | 0.878 0.032 266.1 | `#242323` (= `sunken`) | 0.257 0.001 17.3 |
| `--bar-track` | `#cdd7ed` (= `sunken`) | 0.878 0.032 266.1 | `#242323` (= `sunken`) | 0.257 0.001 17.3 |
| `--toggle-on` | `#465cb3` (= `blue-base`) | 0.503 0.140 270.1 | `#4f6dcc` (= `blue-deep`) | 0.560 0.151 268.1 |
| `--wave-hi` | `#465cb3` (= `blue-base`) | 0.503 0.140 270.1 | `#b3c3fc` (= `blue-light`) | 0.825 0.082 272.3 |

**Alpha and material tokens** (rgb() with alpha; never grey)

| Token | Field | Night |
| --- | --- | --- |
| `--needs-tint` | `rgb(217 14 11 / .06)` | `rgb(255 68 56 / .06)` |
| `--failed-tint` | `rgb(228 177 37 / .10)` | `rgb(252 207 71 / .06)` |
| `--occl` | `rgb(38 43 91 / .16)` | `rgb(6 7 20 / .55)` |
| `--occl-deep` | `rgb(38 43 91 / .28)` | `rgb(6 7 20 / .75)` |
| `--occl-light` | `rgb(38 43 91 / .16)` | `rgb(38 43 91 / .22)` |
| `--lip` | `rgb(237 241 249 / .90)` | `rgb(219 195 194 / .20)` |
| `--lip-hi` | `rgb(237 241 249 / 1)` | `rgb(219 195 194 / .32)` |
| `--lift` | `rgb(237 241 249 / .55)` | `rgb(245 235 228 / .10)` |
| `--pearl-lift` | `rgb(237 241 249 / .85)` | `rgb(245 235 228 / .55)` |
| `--well` | `inset 0 8px 12px -8px rgb(38 43 91 / .22)` | `inset 0 8px 12px -8px rgb(6 7 20 / .65)` |
| `--float` | `0 24px 48px -18px rgb(38 43 91 / .32), 0 2px 6px rgb(38 43 91 / .12)` | `0 24px 48px -16px rgb(6 7 20 / .70), 0 2px 6px rgb(6 7 20 / .35)` |
| `--rim-mix` | `0.30` | `0.60` |
| `--puff` | `var(--raised)` | `var(--overlay)` |
| `--puff-ink` | `var(--ink-1)` | `var(--ink-1)` |
| `--rim` | `var(--cream)` | `var(--cream)` |
| `--chain-empty` | `var(--seam)` | `var(--seam)` |

**Stop lists** (use inside `linear-gradient(to right, …)`)

- `--ramp` (field): `#cd1f66 0%, #cd1f66 11%, #fc7392 14%, #fc7392 25%, #dbc3c2 28%, #dbc3c2 31%, #91b45e 34%, #91b45e 45%, #539624 48%, #539624 58%, #dbc3c2 61%, #dbc3c2 64%, #8ba0f1 67%, #8ba0f1 77%, #3d5ad9 80%, #3d5ad9 89%, #262b5b 92%, #262b5b 97%, #cd1f66 100%`
- `--ramp` (night): `#cf2668 0%, #cf2668 11%, #fe799b 14%, #fe799b 25%, #dbc3c2 28%, #dbc3c2 31%, #98bd5e 34%, #98bd5e 45%, #5ea130 48%, #5ea130 58%, #dbc3c2 61%, #dbc3c2 64%, #8fa5fa 67%, #8fa5fa 77%, #4765e8 80%, #4765e8 89%, #2a2f63 92%, #2a2f63 97%, #cf2668 100%`
- `--ramp-safe` (field): `#333964 0%, #333964 8%, #305d12 20%, #305d12 38%, #333964 50%, #333964 58%, #2b44a6 70%, #2b44a6 88%, #333964 100%`
- `--ramp-safe` (night): `#dbc3c2 0%, #dbc3c2 8%, #a2ce72 20%, #a2ce72 38%, #dbc3c2 50%, #dbc3c2 58%, #9cb0fb 70%, #9cb0fb 88%, #dbc3c2 100%`
- `--sb-working` (field): `#5773e1 0%, #6681e7 5%, #748dec 10%, #7f97f0 15%, #869df2 20%, #899ff3 25%, #869df2 30%, #7f97f0 35%, #748dec 40%, #6681e7 45%, #5773e1 50%, #4d69d8 55%, #4360d1 60%, #3c59ca 65%, #3855c6 70%, #3653c5 75%, #3855c6 80%, #3c59ca 85%, #4360d1 90%, #4d69d8 95%, #5773e1 100%`
- `--sb-working` (night): `#6d8bf8 0%, #7e99f9 5%, #8da5fa 10%, #99affa 15%, #a1b5fa 20%, #a4b7fa 25%, #a1b5fa 30%, #99affa 35%, #8da5fa 40%, #7e99f9 45%, #6d8bf8 50%, #6180ef 55%, #5676e7 60%, #4e6fe1 65%, #496adc 70%, #4768db 75%, #496adc 80%, #4e6fe1 85%, #5676e7 90%, #6180ef 95%, #6d8bf8 100%`
- `--sb-done` (field): `#5da12a 0%, #6eab3c 5%, #7db54a 10%, #89bc55 15%, #90c15c 20%, #93c35e 25%, #90c15c 30%, #89bc55 35%, #7db54a 40%, #6eab3c 45%, #5da12a 50%, #529625 55%, #488d20 60%, #40851c 65%, #3b811a 70%, #397f19 75%, #3b811a 80%, #40851c 85%, #488d20 90%, #529625 95%, #5da12a 100%`
- `--sb-done` (night): `#7cc74b 0%, #8dce59 5%, #9bd364 10%, #a6d86d 15%, #aedb73 20%, #b0dc75 25%, #aedb73 30%, #a6d86d 35%, #9bd364 40%, #8dce59 45%, #7cc74b 50%, #6bb942 55%, #5cac3a 60%, #4fa234 65%, #479c30 70%, #449a2f 75%, #479c30 80%, #4fa234 85%, #5cac3a 90%, #6bb942 95%, #7cc74b 100%`
- `--sb-failed` (field): `#e4b125 0%, #e8bc3d 5%, #ebc64f 10%, #eece5b 15%, #efd362 20%, #f0d565 25%, #efd362 30%, #eece5b 35%, #ebc64f 40%, #e8bc3d 45%, #e4b125 50%, #dba722 55%, #d29e20 60%, #cc971f 65%, #c7931d 70%, #c6911d 75%, #c7931d 80%, #cc971f 85%, #d29e20 90%, #dba722 95%, #e4b125 100%`
- `--sb-failed` (night): `#fccf47 0%, #fcd65f 5%, #fddd71 10%, #fde27f 15%, #fde587 20%, #fde68a 25%, #fde587 30%, #fde27f 35%, #fddd71 40%, #fcd65f 45%, #fccf47 50%, #f8c640 55%, #f4bf39 60%, #f1b834 65%, #efb430 70%, #eeb32f 75%, #efb430 80%, #f1b834 85%, #f4bf39 90%, #f8c640 95%, #fccf47 100%`
- `--sb-needs` (field): `var(--arm) 0%, color-mix(in oklab, var(--arm) 97.6%, #861118) 5%, color-mix(in oklab, var(--arm) 90.5%, #861118) 10%, color-mix(in oklab, var(--arm) 79.4%, #861118) 15%, color-mix(in oklab, var(--arm) 65.5%, #861118) 20%, color-mix(in oklab, var(--arm) 50%, #861118) 25%, color-mix(in oklab, var(--arm) 34.5%, #861118) 30%, color-mix(in oklab, var(--arm) 20.6%, #861118) 35%, color-mix(in oklab, var(--arm) 9.5%, #861118) 40%, color-mix(in oklab, var(--arm) 2.4%, #861118) 45%, #861118 50%, color-mix(in oklab, var(--arm) 2.4%, #861118) 55%, color-mix(in oklab, var(--arm) 9.5%, #861118) 60%, color-mix(in oklab, var(--arm) 20.6%, #861118) 65%, color-mix(in oklab, var(--arm) 34.5%, #861118) 70%, color-mix(in oklab, var(--arm) 50%, #861118) 75%, color-mix(in oklab, var(--arm) 65.5%, #861118) 80%, color-mix(in oklab, var(--arm) 79.4%, #861118) 85%, color-mix(in oklab, var(--arm) 90.5%, #861118) 90%, color-mix(in oklab, var(--arm) 97.6%, #861118) 95%, var(--arm) 100%`
- `--sb-needs` (night): `var(--arm) 0%, color-mix(in oklab, var(--arm) 97.6%, #c22823) 5%, color-mix(in oklab, var(--arm) 90.5%, #c22823) 10%, color-mix(in oklab, var(--arm) 79.4%, #c22823) 15%, color-mix(in oklab, var(--arm) 65.5%, #c22823) 20%, color-mix(in oklab, var(--arm) 50%, #c22823) 25%, color-mix(in oklab, var(--arm) 34.5%, #c22823) 30%, color-mix(in oklab, var(--arm) 20.6%, #c22823) 35%, color-mix(in oklab, var(--arm) 9.5%, #c22823) 40%, color-mix(in oklab, var(--arm) 2.4%, #c22823) 45%, #c22823 50%, color-mix(in oklab, var(--arm) 2.4%, #c22823) 55%, color-mix(in oklab, var(--arm) 9.5%, #c22823) 60%, color-mix(in oklab, var(--arm) 20.6%, #c22823) 65%, color-mix(in oklab, var(--arm) 34.5%, #c22823) 70%, color-mix(in oklab, var(--arm) 50%, #c22823) 75%, color-mix(in oklab, var(--arm) 65.5%, #c22823) 80%, color-mix(in oklab, var(--arm) 79.4%, #c22823) 85%, color-mix(in oklab, var(--arm) 90.5%, #c22823) 90%, color-mix(in oklab, var(--arm) 97.6%, #c22823) 95%, var(--arm) 100%`
- `--sb-choose` (field): `#b283c7 0%, #bc8fd0 5%, #c499d7 10%, #cba2de 15%, #cfa7e2 20%, #d1a9e3 25%, #cfa7e2 30%, #cba2de 35%, #c499d7 40%, #bc8fd0 45%, #b283c7 50%, #a777bc 55%, #9d6db2 60%, #9664ab 65%, #915fa6 70%, #8f5da4 75%, #915fa6 80%, #9664ab 85%, #9d6db2 90%, #a777bc 95%, #b283c7 100%`
- `--sb-choose` (night): `#d0a4e4 0%, #d5ade8 5%, #dab4eb 10%, #debbee 15%, #e0bfef 20%, #e1c0f0 25%, #e0bfef 30%, #debbee 35%, #dab4eb 40%, #d5ade8 45%, #d0a4e4 50%, #c799dc 55%, #bf8fd5 60%, #b988d0 65%, #b583cc 70%, #b481cb 75%, #b583cc 80%, #b988d0 85%, #bf8fd5 90%, #c799dc 95%, #d0a4e4 100%`
- `--sb-house` (field): `#333964 0%, #314652 5%, #30503f 10%, #30572c 15%, #305c1b 20%, #305d12 25%, #305c1b 30%, #30572c 35%, #30503f 40%, #314652 45%, #333964 50%, #313d78 55%, #2f408a 60%, #2d4299 65%, #2b44a3 70%, #2b44a6 75%, #2b44a3 80%, #2d4299 85%, #2f408a 90%, #313d78 95%, #333964 100%`
- `--sb-house` (night): `#dbc3c2 0%, #cac7ab 5%, #bbca95 10%, #aecc83 15%, #a5ce77 20%, #a2ce72 25%, #a5ce77 30%, #aecc83 35%, #bbca95 40%, #cac7ab 45%, #dbc3c2 50%, #c8bed5 55%, #b6b9e5 60%, #a8b4f1 65%, #9fb1f8 70%, #9cb0fb 75%, #9fb1f8 80%, #a8b4f1 85%, #b6b9e5 90%, #c8bed5 95%, #dbc3c2 100%`

---

## 4. The state bar (`.sbar`) and the session row

**What it is.** A horizontal ornament per session that shows its state colour: one ramp per state, travelling left through a fixed track on the shared clock. Compositor-only: a pseudo-element wider than the bar by one tile translates by exactly one tile per period, so the wrap is invisible (seam ΔE 0.0000 for every ramp).

**Round 3: smooth, inside one family.** A state bar never crosses families, so it blends. One tile is one smooth wave in OKLab: base at 0, light at ¼, base at ½, deep at ¾, back to base, with weights from s = sin 2πx (light max(s, 0), deep max(−s, 0), base 1 − |s|), so it never passes a key colour and never holds still. Needs-you has no light step of its own, so its bar is a cosine between arm and arm-deep. Housekeeping blends the safe ramp's keys the same way (`--sb-house`). No cream, navy or wine inside a bar. Bridges stay where families meet: the hero ramp ("bridges, not blends", C6–C7) and the wipe when a session changes state. The CSS stop lists sample the curve every 5 %, so the browser's sRGB blend between neighbours stays on it; needs-you's stops are `color-mix(in oklab, var(--arm) …)`, so P3 arm stays P3 along the bar. Smoothness: the steepest 2 px step in any row bar is ΔE 0.0125 (it was 0.236 at a bridge), in the full bar 0.0093 (§11.3).

| State | Bar | Family (base / light / deep) | Period | Tile × | Reduce motion / still pose | Notes |
|---|---|---|---|---|---|---|
| needs you | flowing, arm | arm ↔ `--arm-deep` (cosine) | **1.75 s** (beat) | 0.5 | k = 0: arm | The only bar with arm; the fastest. Arm here is P3 where the screen allows |
| failed | flowing, amber | `--amber-base` / `-light` / `-deep` | 3.5 s | 0.75 | k = 0: base | Amber-yellow; never brown at base |
| done | flowing, green | `--bar-green-b` / `-l` / `-d` | 3.5 s | 0.75 | k = 0 | Alive (the owner asked for the hero band's aliveness here) |
| working | flowing, blue | `--bar-blue-b` / `-l` / `-d` | 7 s | 1 | k = 0 | Linear: work |
| background (n) | working's bar | the same ramp, the same beads | 7 s | 1 | k = 0 | Shares working's bar; the lamp (a ring, not a disc) and `Bloom.wave(n)` tell them apart |
| choose on return | flowing, lilac | `--bar-lilac-b` / `-l` / `-d` | 7 s | 1 | k = 0 | Lower chroma (max C 0.119): wants you later, not now |
| housekeeping | flowing, dim | `--sb-house` (safe keys) at opacity .7 | 14 s | 1 | k = 0 | Claude's own chores |
| outside | still, neutral | `--ink-4`; bead forms: open (ring) beads at .8 × .55; continuous forms: a gap at 70–78 % | none | | same | Open, like its lamp |
| idle | track only | `--bar-track` (neutral `--sunken`) | none | | same | Quiet |
| gone | faint track | track at opacity .4 | none | | same | Quieter |

**Forms, and when to use each**

| Form | Markup | Size | Tile | Use |
|---|---|---|---|---|
| compact (bead bar) | `Bloom.bar(st, {form:'compact'})`; `Bloom.row` puts it in | 5 px beads at an 8 px pitch, a third of the row (a quarter with `--sr-frac: 4`), rounded to whole beads | 240 px | Every session row, on the right before the lamp; the menu-bar panel's rows at a quarter of the panel; lock checklist, restore list |
| tip (bead bar) | `Bloom.bar(st, {form:'tip'})` | three beads, 24 × 5 px | 120 px | Dense rows with no room for a second line (ARCHIVE rows, ⌘K results, folded-group strips): in the row's right cluster |
| beads (bead bar) | `Bloom.bar(st, {form:'beads'})` | 10 px beads at a 14 px pitch, any width | 480 px | Doc showcases of a state's bar (Colour C8, Motion M3) |
| full (continuous) | `Bloom.bar(st)` | 6 px tall, any width | 360 px | The one session in focus, at the top of the view: the chat centre's header, the window band beside the session name, the lock break-through band. **At most one full bar per composed view** |
| band (continuous) | `Bloom.bar(st, {form:'band'})` | 10 px | 480 px | Doc ornaments only, never app chrome |

A bead bar is the bar's own ramp seen through a mask of beads (`radial-gradient` circles, `space` repeat), so the colour travels through the beads and the beads never move. Colour speed follows tile ÷ period (§11.3): compact working 34.3 px/s, compact needs-you 68.6 px/s; full working 51.4 px/s, full needs-you 102.9 px/s. Every bar of one state shares one phase (same state, same phase, on every row: no chasers).

**Markup:** `<span class="sbar compact" data-st="working" aria-hidden="true"></span>`. The bar is decorative and redundant (lamp + state word carry the state), so it is `aria-hidden`. Custom properties you may set: `--k` (0..1 phase and still pose), `--sb-h` (height of a continuous bar), `--tile-base`, and on a row `--sr-frac` (3 = a third, 4 = a quarter). Width comes from layout; a bar needs at least 12 px.

**The session row** (`lib.css` §13, built by `Bloom.row`). Line 1 reads right to left: the lamp at the far right (15 px) is the bar's end cap, then the bead bar (a third of the row's border box, rounded to the nearest whole bead), then the name (Plex 12.5, the rest of the line). Line 2: Claude's spark (the `spark` glyph, ink, 10 px) and the state words without "claude" (chrome face 11), any chips (`right`: LOGIN, EXIT 1, 138K, JOB, OUTSIDE, ✉ n, `Bloom.wave(n)`), then, right-aligned and starting under the first bead, the context line (28 px, ink-3 on the track) and its %, the tokens this chat has spent (Plex 10, e.g. `41k`) and the age, which ends under the lamp. Rows are 42 px. Every row is the same width, so every lamp and every bar sit in one column down the list. Outside rows (not Claude) have no spark and no context or tokens. The context and tokens are sample data from `Bloom.SAMPLE`, the same for a session wherever it appears (138K is inventory's own figure).

**JS API** (`BUILD/runtime.js`)

| Call | Does |
|---|---|
| `Bloom.row({st, name, sub, right, age, sel, ind, cls, attrs, lamp, bar, spark, meta, ctx, tok, nameHTML, extra})` | HTML string for a session row. `sub` without "claude"; `right` = chips (line 2); `bar: false` for none; `spark: false` / `meta: false` (outside does both by default); `extra` = HTML appended inside |
| `Bloom.bar(st, {form, k, still, cls})` | HTML string. `form`: `'full'` (default), `'band'`, `'compact'`, `'tip'`, `'beads'` |
| `Bloom.setBar(el, st)` | The only way to change one bar. The old ramp is wiped off left to right by its bridge (cream; navy + wine between a calm state and needs-you: a change crosses families, so it bridges) while the new ramp already flows underneath: 437.5 ms, 218.75 ms into needs-you, `sine`. On a bead bar the wipe runs through the beads. Reduce motion: a 218.75 ms dissolve. Paused: jumps. A second call mid-wipe replaces the wipe |
| `Bloom.setState(el, st)` | A row (or any box): every lamp and every bar inside it change together; echoes `data-st` on a `.session-row`. **Use this for state changes** |
| `Bloom.setLamp(el, st)` | Still works for old callers. A lamp inside a `.session-row` also drives that row's bars |
| `Bloom.usageLine(v, {w, kind, label})`, `Bloom.chainHTML(n, v, '5h' \| '7d')` | Usage as a thin plain-ink line (`chainHTML` keeps the old call, as wide as its n beads were). `Bloom.setChain(el, v)` moves it and sets `.hot` at 80 % |
| `Bloom.ctx(v)`, `Bloom.sample(name)`, `Bloom.SAMPLE` | A row's context line and %; the sample context and tokens per session |
| `Bloom.preempt(region)` | A lit needs-you lamp **or** needs-you bar sets `data-preempt`; every hero ramp inside turns safe. State bars keep their colours: they are state, not ornament |
| `Bloom.STATES`, `Bloom.FAMILY` | The ten states in rank-ish order; `FAMILY` is `red` (needs), `amber` (failed), `green` (done), `blue` (working, bg), `lilac` (choose), `quiet` (house, outside, idle, gone) |

Driven headless in `BUILD/parts/_test.html`: every state pill fires `setState` on a row plus `setBar` on two big bars; a retarget 100 ms into a change leaves 0 wipes and 0 sweeps afterwards; under ¼× a wipe is visibly in flight and gone at its end; under Still the change is a dissolve with 0 flowing bars; 36 bar loops share one start time; at `?t=1750` the working bar sits at −60 px (1750 / 7000 × 240) and the needs-you bar at 0, exactly.

---

## 5. Lamps: motion and shape, no hue

Lamps are ink only. Colour-vision deficiency cannot touch them, so shape and motion carry state for everyone; the bar adds colour for those who see it. Sizes: **15 px in session rows and the menu-bar panel** (round 3: 1.5× v1, at the far right as the bead bar's end cap; ring 3 px), 10 px elsewhere in chrome, 24 px in showcases. Every glyph is one shape over the lamp's own box (ledger 6): the done core is a radial gradient, and failed's ring and bar are one mask over the box with soft 0.7 px edges, so neither drifts off centre at fractional positions. Measured on 124 row-lamp crops across the page at DPR 1 and 2 (`r3` lamp check): the done core within 0.13 px of the ring's centre, needs and working within 0.12 px, the failed bar within 0.2 px, and 0.33 px at DPR 1 inside a window drawn at 92 % (the pixel grid's limit; it reads centred).

| Rank | State | Shape (still pose) | Motion | Period · cue | Curve | Ink |
|---|---|---|---|---|---|---|
| 1 | needs you | filled disc + still ring at 1.7× (bullseye) | beat 1 → 1.16 → 1 and a ripple 1 → 2.4, .7 → 0; arrival bloom 1 → 2.8, .6 → 0 over 875 ms | 1.75 s · 0 | sineOut / sine | ink-1 |
| 2 | failed | ring + bar through it (⊖) | stumble: opacity 1 → .45 → 1 → .45 → 1 in the first T/4, then holds | 3.5 s · 2.625 s | sine | ink-1 |
| 3 | done | **ring + centred core (◉)**; the core is 44 % of the lamp | beckon: core .6 → 1 → .6; arrival scale .92 → 1 over 875 ms | 3.5 s · 0.875 s | sineOut / sine | ink-1 |
| 4 | working | filled disc crossed by an ink band | flow: two bands per tile rise through the disc, one every 3.5 s | 7 s · 0 | linear | ink-2, band `--lamp-band` |
| 5 | background (n) | ring crossed by the band | ring flow, plus `Bloom.wave(n)` on line 2 | 7 s · 0 | linear | ink-2 |
| 6 | choose on return | ring + half fill | tide: fill level 35 % ↔ 65 % | 7 s · crest 3.5 s | sine | ink-3 |
| 7 | housekeeping | **dashed ring** (four dashes) | chores: opacity .8 → .45 → .8 | 14 s · 0 | linear | ink-4 |
| 8 | outside | open ring (gap at the top) | far light: .8 → .4 → .8 over 6.125–7 s | 7 s | sine | ink-4 |
| 9 | idle | ring | rest: opacity 1 → .82 → 1 | 14 s · 0 | sine | ink-4 |
| — | gone | dim ring (.35) | none | | | ink-4 |

- **No crescent, no half-moon, no corner dot, for any state, anywhere on the page.** v1's done corner dot inside a ring drew a half-moon; it is gone from `lib.css`. Do not draw D's done grammar either, not even as a comparison: describe it in words if you need it.
- **State changes** (`setLamp` / `setState`): the lamp morphs its shape and an ink band (`--lamp-bridge`, the seam tone) sweeps through it (437.5 ms; 218.75 ms into needs-you); the colour bridge now plays on the bar. Reduce motion: a 218.75 ms dissolve.
- Non-text contrast: every lamp ink clears 3:1 on every surface in both themes (lowest: Night ink-4 on overlay 4.60, Field ink-4 on sunken 4.67). The working band against its disc: 3.29:1 Night, 3.00:1 Field.

---

## 6. Pearls (`.pearl`)

The bead material at app size (8–20 px), made for chrome: one element, no pseudo-element, still. Layers: body `--c` + navy occlusion toward the lower edge + a specular lift high on the left (`--pearl-lift`) + a cream rim at the silhouette (`--rim-mix`). Under 10 px (`.xs`, and every pearl in a `.tally`) it drops the lift so it stays crisp.

| Use | Markup | Size | Rule |
|---|---|---|---|
| Group or project identity, avatars | `Bloom.pearl({tint:'mint', p:10})` → `data-tint` = rose, butter, sage, mint, peri, lilac | 10–20 px | Beside the group name (`.group-row`), on a project header, as an avatar. Never text on a tint. Decorative and redundant with the name |
| A session's state in a list | `Bloom.pearl({st:'done', p:12})` → `data-st` any state | 8–12 px | Uses `--st-*`. A needs pearl is arm: 12 px or less |
| Tallies (folded groups, the menu-bar panel header, lock digests) | `Bloom.tally(['needs','working','done'])` | 8 px each, 3 px gap | One pearl per session, each coloured by its own session's state (ledger 1): arm never marks a session that is not needs-you |
| Counts | `Bloom.pearl({n:412, p:18})` | 16–20 px tall pill | Neutral body (`--puff`) with Plex 600 ink-1 digits; never a tinted count. Under 16 px the digit is too small: use plain Plex text instead |

---

## 7. The calibrated saturation rule (replaces BRIEF.md §7 rule 5 and colour.md §7.5's "exactly one element above C 0.2")

**Saturation by area, not by count.**
1. **Area.** In any app view at least 75 % stays neutral (field, chrome, wells) and the chromatic area stays at 5 % or less. Bead bars are 5 px beads in rows and the one continuous bar for the session in focus is 6 px; pearls are 20 px or less. Nothing chromatic is a surface, a panel fill or text.
2. **Where saturation may live:** state bars, pearls, and the doc's hero objects (masthead stair, Colour figures, lock plate, app icon). Nowhere else.
3. **Ceiling.** Every bar, pearl and accent colour stays at C 0.181 or less and under 96 % of its sRGB ceiling (`python3 C2/wall.py` lists the exceptions: arm, and Field's near-white `--blue-wash`, whose ceiling at L 0.947 is C 0.025). Arm alone reaches C 0.225, at the wall, and past it in P3.
4. **Tempo.** Needs-you alone flows at 1.75 s (and alone has a lamp that reaches past its footprint). Failed and done flow at 3.5 s, working, background and choose at 7 s, housekeeping at 14 s; idle, outside and gone hold still.
5. **One wide bar per view.** Only the session in focus gets a continuous full bar; every list uses bead bars (rows) or tips.
6. **Pre-emption stays.** While a needs-you is lit in a region, every hero ramp in it turns safe. State bars keep their colours.

---

## 8. Craft rules (BRIEF.md §7, revised; every one binds)

1. **No hairline grids.** No 1 px borders, rules or table lines. A state bar is an ornament, never a divider, a rule or a progress bar; one bar per session per region.
2. **Nothing pure black or white.** Night's field `#2F2E2E` is grey, not black; the darkest colour is `--occlusion` `#060714`.
3. **No grey drop shadows.** Every shadow and occlusion is blue-black (`#060714`) in Night and navy (`#262b5b`) in Field, at alpha.
4. **No overshoot, no springs, no bounce, no steps, no cuts.** Bars flow linearly and loop seamlessly; nothing in the app rotates.
5. **Saturation by area** (§7), replacing "one saturated element per view".
6. **Generous negative space** around doc hero objects; the app keeps its density (rows 42, sidebar 272, panel 440).
7. **No glassmorphism, blur, glow, grain, noise, textures or parallax.**
8. **No two-stop gradients.** Gradients are the multi-stop ramps (hero, safe, the smooth state ramps) or the material's shading. The one exception is the 437.5 ms navy-to-wine bridge band that rides a bar's wipe. **No bridge inside a state bar** (round 3): a state bar stays in one family and blends; bridges are for crossing families.
9. **No flower** imagery.
10. **Content is never decorated.** No ramp, bar or state colour in terminal text, diff text, code, paths or state words.
11. **No AI-template tells** (gradient text included).
12. **Lamps carry no hue** (§5).
13. **No hued surface in Night** (round 3). Wells (`--deep` `#1B1A1A`) and inputs (`--sunken` `#242323`) are the field's own neutral grey. The one blue-black, `--occlusion` `#060714`, is shading only: shadows and inset gradients, never a fill.
16. **Usage is plain ink**, never a hue and never beads: one thin line.
14. **No crescent, half-moon or corner-dot done glyph**, anywhere.
15. **Pearls never carry text**, except the neutral count pearl.

---

## 9. Component library changes (`BUILD/lib.css`)

| Component | Change |
|---|---|
| 2 `.bead` | Night rim mix 0.60 (token). Field unchanged |
| 4 `.lamp` | Ink only; done = ring + centred core; housekeeping = dashed ring with the 14 s chores fade; working and background bands are ink. Round 3: failed's bar is a gradient over the lamp box (ledger 6); 15 px in rows |
| 5 `.bead-chain` | Progress only ("Restoring 7 sessions"). Usage left it |
| 5b `.use-line` | New (round 3): usage and context as a thin rounded plain-ink line on `--use-track`; `.hot` from 80 %: only the leading end breathes (`bl-lead`, 3.5 s); `.ctx` is the 28 px context line in ink-3 |
| 8 `.pill` | `.pill.primary .kbd` takes the fill's own ink at .75 (5.56:1 Night, 6.23:1 Field; ledger 2) |
| 9 `.seg` | Example now reads Field \| Night |
| 13 `.session-row` | Round 3 (§4): name; bead bar a third of the row (`--sr-frac`), whole beads; the 15 px lamp at the far right; line 2 spark, state words, chips, then context line + %, tokens, age. 42 px. Placement by grid area, so the DOM order is free |
| 14 `.panel` | New `.panel.deep`: the well (Night `#1B1A1A`, neutral, below the field) |
| 15 `.window` | `.pane` is now `--deep` (Night `#1B1A1A`, Field `#d6deee`); chrome stays `--raised` |
| 18 `.sbar` | New: the state bar (§4). Round 3: bead forms `.compact`, `.tip`, `.beads` (a mask of beads over the flowing ramp; outside = open beads); continuous `full` and `.band`; smooth ramps; working and background share one bar |
| 19 `.pearl`, `.tally` | New: pearls (§6) |

Runtime additions: `Bloom.bar`, `Bloom.setBar`, `Bloom.setState`, `Bloom.pearl`, `Bloom.tally`, `Bloom.STATES`; round 3: `Bloom.row`, `Bloom.usageLine`, `Bloom.ctx`, `Bloom.sample` / `Bloom.SAMPLE` (`chainHTML` for 5H/7D now draws the line). New glyphs for `Bloom.gi`: `term` (the terminal as a panel tab), `send`, `stop`, `clip` (attachment), `diff`; round 3: `spark` (Claude's mark: a hub and twelve tapered rays, one filled path on the 16 grid).

**Gotchas.** Change state only through `setState` / `setBar` / `setLamp` (they keep lamps, bars, row tints and pre-emption in step). Never animate a bar's colours or width: it is a translate on a compositor layer. A bar's still pose is its `--k`; `?t=` shots are exact. `getAnimations`, `setInterval` and your own `requestAnimationFrame` stay banned in parts.

---

## 10. Where the new components go (pointers, not a section plan)

- **window:** a redesign, not D reskinned. Pearls carry group identity in the sidebar headers and tallies on folded groups; every session row has its bead bar and 15 px lamp at the right (§4); the focused session gets the one continuous full bar (band or header); wells are `--deep`; usage is the plain ink line. If you keep a terminal, it is a deep well; consider the chat centre from `chat`.
- **chat:** the centre as a conversation (source `SRC/research/chat.md`, option C), drawn in a `--deep` well; the session header carries the full bar and the lamp; the terminal is a `term` glyph tab next to Browser and Git in the right panel. Diffs, errors and kind labels sit in the well: diff washes and kind labels take §11.1's numbers for the neutral well.
- **around:** the menu-bar panel's rows carry bead bars at a quarter of the panel (`--sr-frac: 4`) and 15 px lamps; a pearl tally with counts in its header, count pearls. The lock plate keeps the hero ramp; in break-through the needs-you bar is the only arm. **The menu-bar icon's done state must not use a corner square or dot** (rule 14): give done another template mark and say so.
- **colour:** prove the new things: Night ladder on `#2F2E2E`, the state bars per state with their numbers, amber against its neighbours, the CVD story (lamps carry no hue; bar pairs in §11.4), arm separation with the bars, the rim at 0.60.
- **motion:** the lamp table above (colourless), the bar's flow and wipe (`setState`), the bar periods by rank; round 3: lamp + bead bar per state with a Core Animation recipe, and the usage line's slider (M10).
- **masthead, form, delta:** Field is the default ("Field by default, Night on the toggle"); Form's material figure shows Night's rim at 0.60; the delta table gains rows for lamp-without-hue, the state bar, amber failed, Night `#2F2E2E` and Field default. Delta re-checks every number in its table against §11 and §12 (B5's Field safe-ramp 0.307 and Night arm-vs-danger 0.138 are stale; B12's "Night (default)" is reversed).

---

## 11. NUMBER BANK 2

Every number the doc prints comes from here, from BRIEF.md §9 where §12 does not mark it stale, from `SRC/research/chat.md`, or from `inventory.md` mock data. The full tables behind this bank are `C2/out2.md` (generated by `python3 C2/derive2.py`); any number in that file may be printed as well. Contrast is WCAG ratio / APCA Lc; ΔE is ΔE_OK; CVD is Machado 2009 at severity 1.0.

### 11.1 Night ladder on `#2F2E2E`

| Token | Hex | OKLCH | vs field (WCAG / Lc) | vs deep |
|---|---|---|---|---|
| occlusion (shading only) | `#060714` | 0.136 0.029 277.6 | 1.48 | 1.15 |
| deep | `#1b1a1a` | 0.219 0.002 17.3 | 1.28 | 1.00 |
| sunken | `#242323` | 0.257 0.001 17.3 | 1.16 | 1.11 |
| field | `#2f2e2e` | 0.302 0.001 17.2 | 1.00 | 1.28 |
| raised | `#383737` | 0.338 0.001 17.2 | 1.14 | 1.46 |
| overlay | `#424141` | 0.376 0.001 17.2 | 1.33 | 1.71 |
| selection | `#373f5b` | 0.373 0.049 271.6 | 1.31 | 1.67 |
| seam | `#4f4e4e` | 0.425 0.001 17.2 | 1.63 / −8.8 | 2.09 |
| ghost | `#767882` | 0.574 0.015 276.9 | 3.08 / −26.5 | 3.95 |
| ink-4 | `#a9aebf` | 0.752 0.025 272.7 | 6.12 / −53.9 | 7.85 |
| ink-3 | `#c1c6d5` | 0.827 0.022 271.1 | 7.93 / −67.5 | 10.18 |
| cream | `#dbc3c2` | 0.837 0.027 20.6 | 8.12 / −68.8 | 10.42 |
| ink-2 | `#ebdcd5` | 0.905 0.019 46.8 | 10.14 / −82.4 | 13.01 |
| ink-1 | `#f5ebe4` | 0.946 0.014 57.6 | 11.53 / −91.2 | 14.79 |

- The field's chroma is 0.001: neutral, and so are its steps (round 3): deep C 0.0016, sunken C 0.0015, one grey from well to seam by OKLCH L 0.219 → 0.257 → 0.302 → 0.338 → 0.376 → 0.425 (steps 0.038, 0.045, 0.036, 0.038, 0.049). Occlusion is the one blue-black, shading only. Selection is the one blue surface, and it rises (vs raised 1.14, vs field 1.31; ink-1 on it 8.83 / −86).
- Night text, worst surface per tier (all pass): ink-1 8.67 / −86 and ink-2 7.62 / −77 on overlay (body 7 / 75); ink-3 5.96 / −62 on overlay (label 4.5 / 60); ink-4 4.60 / −48 on overlay (caption 4.5 / 45); danger 4.67 / −49 on overlay (emphasis 4.5 / 45). The full matrix, including the light accent steps, deep and the washes, is `C2/out2.md` §B.
- Night accent steps (labels) on the field: blue-light 7.82 / −67, green-light 8.12 / −69, lilac-light 7.89 / −67, rose-light 7.85 / −67; on overlay 5.88–6.10 / −61 to −63.
- In the well (`--deep` `#1B1A1A`, round 3): text on deep ink-1 14.79 / −95, ink-2 13.01 / −86, ink-3 10.18 / −71, ink-4 7.85 / −57; on sunken ink-1 13.35 / −93 … ink-4 7.09 / −56. TRACE labels in the well: blue-light 10.03 / −70, green-light 10.42 / −72, lilac-light 10.12 / −71. Diff washes sit −0.049 L (removed, `#1d070e`, ΔE 0.063) and +0.056 L (added, `#1b2d17`, ΔE 0.073) around the well; ink-1 on them 16.42 / −95 and 12.47 / −92; the lowest text on a wash, ink-4 on green-word, 4.88 / −49 (caption 4.5 / 45); marks in the well rose-light 10.07 / −70, green-light 10.42 / −72; removed vs added wash ΔE 0.132 (protan / deutan / tritan 0.135 / 0.106 / 0.129). ANSI (colour.md Appendix N hexes) in the well: slots 1–15 6.45–14.50:1, slot 0 1.44:1 (the usual exception); slot 9 vs arm 0.199. `C2/out2.md` §N, §O.
- Field text is v1's (BRIEF.md §9), plus on the new Field washes: ink-1 on amber-wash 11.03 / 87, on amber-word 9.27 / 76.

### 11.2 Amber, the failed family

| Step | Field | OKLCH | Night | OKLCH |
|---|---|---|---|---|
| light | `#f0d565` | 0.874 0.135 95.9 | `#fde68a` | 0.924 0.115 95.7 |
| base | `#e4b125` | 0.786 0.152 86.3 | `#fccf47` | 0.871 0.155 90.0 |
| deep | `#c6911d` | 0.690 0.135 80.8 | `#eeb32f` | 0.801 0.152 82.3 |
| wash | `#f4eac4` | 0.935 0.051 95.0 | `#302b1f` | 0.291 0.022 88.0 |
| word | `#f0d680` | 0.879 0.110 93.1 | `#473c24` | 0.361 0.041 85.8 |

- Hues 80.8–95.9 (Field) and 82.3–95.7 (Night): clear of arm's 55° moat edge by 25.8° and 27.3°.
- Amber against its neighbours (ΔE Field / Night): base vs arm 0.296 / 0.291; deep vs arm 0.220 / 0.229; base vs done's base 0.196 / 0.172; base vs id-butter 0.174 / 0.129; deep vs id-butter 0.080 / 0.076 (a pearl is never a bar, so this pair never meets as state); base vs danger 0.329 / 0.158.
- Under CVD, amber base vs done's base: protan 0.094 / 0.069, deutan 0.159 / 0.127, tritan 0.227 / 0.178; their light steps fall to 0.055 under protan in Night (the lamp carries it).
- Against the field: Night base 9.13:1; Field base 1.46:1, deep 2.08:1. Field's failed bar reads by hue (yellow is the Field field's complement, h 84.4) and by its navy bridge; the lamp and the state word carry it for everyone.

### 11.3 State bars

| State | Field base | Night base | max C (F / N) | min ΔE to arm along the bar, sRGB (P3), F / N | lum ratio within the bar (F / N) | steepest 2 px step, compact / full (F / N) | base vs field (F / N) | base vs raised (F / N) |
|---|---|---|---|---|---|---|---|---|
| needs you | `#d90e0b` (arm) | `#ff4438` (arm) | 0.225 / 0.225 | the arm bar | 1.91 / 1.69 | 0.0108 / 0.0066, 0.0091 / 0.0065 | 3.87 / 3.96 | 4.29 / 3.47 |
| failed | `#e4b125` | `#fccf47` | 0.152 / 0.155 | 0.220 (0.234) / 0.229 (0.248) | 1.93 / 1.52 | 0.0085 / 0.0063, 0.0057 / 0.0053 | 1.46 / 9.13 | 1.62 / 8.00 |
| done | `#5da12a` | `#7cc74b` | 0.165 / 0.175 | 0.309 (0.333) / 0.322 (0.357) | 2.42 / 2.26 | 0.0103 / 0.0072, 0.0124 / 0.0093 | 2.36 / 6.53 | 2.61 / 5.72 |
| working, background | `#5773e1` | `#6d8bf8` | 0.181 / 0.180 | 0.335 (0.359) / 0.309 (0.346) | 2.60 / 2.51 | 0.0092 / 0.0061, 0.0091 / 0.0061 | 3.14 / 4.32 | 3.48 / 3.79 |
| choose | `#b283c7` | `#d0a4e4` | 0.119 / 0.119 | 0.223 (0.248) / 0.223 (0.263) | 2.46 / 1.87 | 0.0085 / 0.0066, 0.0063 / 0.0055 | 2.23 / 6.52 | 2.47 / 5.71 |
| housekeeping | `#333964` (ink-2) | `#dbc3c2` (cream) | 0.160 / 0.129 | 0.302 (0.328) / 0.263 (0.292) | 1.41 / 1.26 | 0.0125 / 0.0085, 0.0089 / 0.0064 | (at .7) | |

- Smooth (round 3): every ramp is one sine wave inside its family, so nearest-key shares are base 33–34 %, light 33 %, deep 33 % (needs-you: arm 50 %, arm-deep 50 %). Seam ΔE 0.0000 for every ramp. The steepest 2 px step in any bar: compact (a row) 0.0125 Field, 0.0124 Night; full 0.0085 / 0.0093; tip 0.0220 / 0.0221. Round 2's template stepped 0.236 / 0.210 at a bridge. Luminance ratio within a bar 1.26–2.60:1 (was 6.72–10.01 with the bridges). A coloured bar comes no nearer cream than ΔE 0.096 (Field) / 0.069 (Night) and no nearer navy than 0.203 / 0.243: no bridge, no plateau. Housekeeping's base is the safe ramp's own (ink-2 in Field, cream in Night): it blends through it.
- Measured in the assembled page, from pixels (`C2/ramp_px.js` + `ramp_px.py`, `?t=1750`, DPR 1): the head bar (window W1/W2/W5, chat X1/X2) steps at most ΔE 0.0061 (Field) / 0.0068 (Night) per 2 px, where round 2's stepped 0.067 and sat on cream and navy plateaus (ΔE 0.000 from each); a row bar's ramp under its beads at most 0.0130 / 0.0129 (round 2's compact bar 0.205); neighbouring beads, 8 px apart, differ by 0.043 / 0.041 at most; no flowing state ramp comes nearer cream than 0.069 or navy than 0.203. Every bead in a row is whole (11 in the 272 px sidebar).
- Closest bar token to arm: amber-deep 0.220 (Field), bar-lilac-d 0.223 (Night). Closest chrome token is still id-rose, 0.155 (Field) and 0.178 (Night).
- Periods: needs-you 1.75 s, failed and done 3.5 s, working, background and choose 7 s, housekeeping 14 s; idle, outside and gone still. Tiles: full 360 px, compact 240, tip 120, beads and band 480, × 0.5 for needs-you and × 0.75 for failed and done. Bead bars: 5 px beads at an 8 px pitch (11 beads in the 272 px sidebar's rows, 11 in the menu-bar panel's), showcases 10 px at 14 px.
- Colour speed (px/s), full / compact: needs-you 102.9 / 68.6; failed and done 77.1 / 51.4; working, background and choose 51.4 / 34.3; housekeeping 25.7 / 17.1.
- Bar wipe: 437.5 ms (218.75 ms into needs-you); bridge band max(8 px, 6 %) wide; Reduce motion 218.75 ms dissolve.

### 11.4 CVD (bars' base plateaus; lamps carry no hue)

| Pair | Field worst (sim) | Night worst (sim) |
|---|---|---|
| needs / failed | 0.220 (deutan) | 0.204 (deutan) |
| needs / done | 0.065 (deutan) | 0.081 (deutan) |
| needs / working | 0.295 (deutan) | 0.278 (protan) |
| needs / choose | 0.215 (deutan) | 0.213 (deutan) |
| failed / done | 0.094 (protan) | 0.069 (protan) |
| failed / working | 0.292 (tritan) | 0.276 (tritan) |
| failed / choose | 0.133 (tritan) | 0.093 (tritan) |
| done / working | 0.083 (tritan) | 0.119 (tritan) |
| done / choose | 0.126 (tritan) | 0.123 (tritan) |
| working / choose | 0.097 (protan) | 0.113 (protan) |

- Every pair stays at 0.065 or more in every simulation, both themes. Base lightness (what survives any CVD): Field needs 0.559, working 0.591, done 0.640, choose 0.680, failed 0.786; Night needs 0.662, working 0.665, done 0.755, choose 0.780, failed 0.871.
- The story for the doc: state never depends on the bar. Ten lamp shapes, ten motions, and the state word carry it; the bar is colour on top. Background shares working's bar (its lamp is a ring, and `Bloom.wave(n)` counts its jobs); outside's beads are open rings; idle and gone have no flow. The smooth ramps keep the base plateaus' colours, so these pair numbers are unchanged.

### 11.5 Hero ramp and safe ramp

- Hero ramp: stops and positions as v1 except sage: Night `#98bd5e` (0.750 0.130 126.9, was `#9dba74`, ΔE 0.030), Field `#91b45e` (0.724 0.120 127.4, was `#98b076`, ΔE 0.036), now 67 % and 64 % of their sRGB ceiling. Plateaus 62 %, separators 11 %, transitions 27 %; seam ΔE 0.0000. Shares Night red 28.2, green 27.6, blue 25.0, cream 11.3, navy 8.0 %; Field red 28.0, green 27.6, blue 25.0, cream 11.5, navy 8.0 %. Closest approach to arm unchanged: 0.092 sRGB / 0.128 P3 (Night), 0.094 / 0.110 (Field).
- Safe ramp v2: Night cream → `#a2ce72` (0.799 0.129 129.8) → cream → `#9cb0fb` (0.771 0.110 272.2): luminance 1.26:1, max C 0.129, min ΔE to arm 0.263 (P3 0.292), at least 6.46:1 on the field. Field ink-2 → `#305d12` (0.430 0.115 135.8) → ink-2 → `#2b44a6` (0.430 0.160 268.0): 1.41:1, max C 0.160, min ΔE to arm 0.302 (P3 0.328), at least 5.75:1.

### 11.6 Material, pearls, controls

- Night rim (silhouette of a fully occluded bead edge, cream mixed over it): at 0.45, 2.31–2.69 vs the field and 2.02–2.36 vs raised (fails); at **0.60, 3.44–3.80 vs the field, 3.01–3.33 vs raised, 4.41–4.87 vs deep**. Field keeps 0.30: 3.99–4.69 vs its field.
- Identity pearls vs the field: Night 6.05–6.58:1; Field 2.57–2.83:1 (decorative, redundant with the name). Closest pair rose / lilac 0.068 (Night) / 0.076 (Field), as v1.
- Count pearls (ink-1 on `--puff`): Night 8.67 / −86, Field 10.91 / 86.
- Primary pill: label 11.53:1 (Night), 9.84:1 (Field); key hint at .75 opacity 5.56:1 (Night), 6.23:1 (Field).
- Usage (round 3) is a plain ink line: ink-1 vs its track (`--sunken`) 13.35:1 Night, 9.21:1 Field; the track vs raised 1.32 / 1.18, vs overlay 1.54 / 1.28. A row's context line, ink-3 on the same track: 9.19 / 6.03.
- Row tints: needs-you (arm at 6 % over raised) ink-1 9.58 / −88 Night, 9.89 / 80 Field; failed (`--failed-tint`) 8.78 / −86 Night, 10.34 / 83 Field.
- Focus (`blue-light`, Night) on every surface: 5.88 (overlay) to 10.03 (deep).
- Rows (round 3): lamps 15 px (ring 3 px, the done core 44 %, 6.6 px), the bead bar a third of the row's border box rounded to the nearest whole bead, rows 42 px; the context line 28 × 3 px; Plex 10 for %, tokens and age.

### 11.7 Arm and the reds

- Arm Night `#ff4438` on the new field 3.96:1 (on deep 5.07:1); under protan / deutan / tritan vs the field 2.76 / 4.73 / 3.44. Field arm 3.87:1 and P3 values as v1.
- Night danger `#ea9d82` (0.766 0.100 40.1): arm vs danger ΔE 0.165; Field 0.121 as v1. Night arm-deep `#c22823`, Field arm-deep `#861118` (vs Field danger 0.086: they never meet; danger is text only on destructive confirmations).
- Night rose-light `#fcb1bf` vs arm 0.226.

### 11.8 Motion (adds to BRIEF.md §9 Motion)

- Lamps as v1 (beat 1.75 s; stumble, beckon 3.5 s; flow, tide, far 7 s; rest 14 s), plus housekeeping's chores fade .8 → .45 → .8 over 14 s, linear; working's band passes once every 3.5 s.
- Bars: §11.3. Theme switch lightness: Night L 0.302 → cream 0.837 → Field 0.899; Field → navy 0.312 → Night 0.302 (it only ever moves one way).

---

## 12. STALE in BRIEF.md §9 and in round 2 (do not print these)

| v1 number | Why stale | Print instead |
|---|---|---|
| "Night field `#131528` oklch(20.4 % 0.038 277.9): ink-1 15.04:1 / Lc −93.5" | Night's field is `#2F2E2E`; round 3 retires `#131528` (v1's navy, history only) | §11.1 (ink-1 11.53 / −91.2 on the field, 14.79 on deep) |
| Night surface steps "field/raised 1.10, /sunken 1.06, /overlay 1.27, /seam 1.50, /selection 1.28" | New ladder | §11.1 (1.14, 1.19, 1.33, 1.63, 1.31). Field's 1.11, 1.07, 1.19, 1.32, 1.16 stand |
| Hero ramp shares "red 28.2, green 27.7, blue 25.0, cream 11.2, navy 8.0 %" | Sage moved | §11.5 |
| Safe ramp "Night Y 0.505–0.580 (1.14:1), C ≤ 0.096, min ΔE to arm 0.263, ≥ 9.52:1 on the field; Field 1.35:1, C ≤ 0.111, 0.307, ≥ 6.02:1" | Safe ramp v2 | §11.5. Keep the theory (isoluminant drift never flashes) with the new 1.26:1 |
| Arm Night "5.26:1 on the field" | New field | 3.96:1 on the field, 5.07:1 on deep |
| "rose-light 0.197" (Night) | Night light steps lifted | 0.226 |
| "Arm vs danger 0.138" (Night) | Night danger lifted | 0.165 (Field 0.121 stands) |
| "Working: … Bloom cream is the working lamp" framing, "cream on the Field field 1.23:1" as a lamp reason | Lamps carry no hue | The ΔE 0.026 / L 0.837 fact may stay as history, not as a lamp colour |
| Chroma by urgency "Night: needs-you 0.225 · failed 0.100 · done 0.094 · neutrals ≤ 0.034. Field: 0.225 · 0.136 · 0.140 · ≤ 0.074" and "Budget: … one element above C 0.2" | Lamps colourless; failed and done are bars; the budget is §7 | §11.3 max C per bar; §7 |
| Rim "Night 1.01–1.05 → 2.03–2.21 → 3.07–3.27" printed as the Night proof | Measured on `#131528`, v1's field | §11.6 (0.60). The v1 trio may be printed only labelled "on v1's field, `#131528`" |
| Non-text lows "Night arm on selection 4.11; Field done on sunken 3.35" | Lamps are ink | §5 (Night ink-4 on overlay 4.60, Field ink-4 on sunken 4.67) |
| Usage fill vs track "Night 5H 4.09, 7D 4.65", and round 2's "5.48, 6.22" (Night) and "4.22, 3.35" (Field) | Usage is a plain ink line (round 3) | §11.6: 13.35 Night, 9.21 Field |
| CVD "Night every lamp pair ≥ 0.068 …; Field pairs under 0.06: needs/done deutan 0.045, needs/failed protan 0.029, done/failed deutan 0.050" | Lamps carry no hue; failed is amber | §11.4 |
| "Arm vs field under protan / deutan / tritan: Night 3.65 / 6.30 / 4.55" | New field | 2.76 / 4.73 / 3.44 (Field's 5.96 / 3.14 / 3.31 stand) |
| Identity tints "Night … WCAG vs field 8.05–8.75" (colour.md K) | New field | 6.05–6.58 |
| "Simultaneous contrast: field h 264.4, its complement h 84.4" applied to Night | Night's field is neutral | Field only (it stands for Field) |
| Theme "Night L .204 → cream .837 → Field .899; Field → navy .312 → Night .204" | New field | §11.8 |
| Night family light steps "L 0.80 / C 0.095" and their v1 contrasts (colour.md §3.1, Appendix F Night) | Lifted to 0.825–0.835 | §3 tables, §11.1 |
| v1 masthead / B12 copy "Night stays the default" | Field is the default | "Field by default, Night on the toggle" |
| Round 2: `--deep` `#131528` (0.204 0.038 277.9), `--sunken` `#1e2030` (0.249 0.030 278.4), "blue-black" wells, inputs, tracks or sockets in Night | Round 3: neutral | `#1B1A1A`, `#242323` (§11.1); occlusion `#060714` shading only |
| Round 2's vs-deep column (ink-1 15.35, ink-2 13.50, ink-3 10.56, ink-4 8.14, cream 10.81, seam 2.17 …), "the well 1.33", "sunken 1.19" vs field | New wells | §11.1 (14.79, 13.01, 10.18, 7.85, 10.42, 2.09; deep 1.28, sunken 1.16) |
| Diff washes "−0.035 L / +0.070 L" in the well; ANSI "6.69–15.04:1 in the well, slot 0 1.50"; TRACE "10.41 / 10.81 in Night's well"; focus "10.41 (deep)"; rim "4.57–5.05 vs deep"; arm "5.26 on deep" | Measured on `#131528` | §11.1, §11.6, §11.7 (−0.049 / +0.056; 6.45–14.50, 1.44; 10.03 / 10.42; 10.03; 4.41–4.87; 5.07) |
| Round 2's bar template "base 0–14 · light 17–28 · cream bridge 31–34 · … dark bridge 72–77", "71 % hue plateau, 8 % bridge plateau, 21 % transition", shares "cream 5–6 %, dark bridge 8 %", "arm holds 53 %", "a cream glint, wine", "luminance ratio within a bar 6.72–10.01", min ΔE to arm along a bar "0.184 / 0.295 / 0.305 (Field), 0.180 / 0.263 / 0.261 (Night)" | Smooth in-family ramps | §4, §11.3. A round-2 number may appear only as the "was" of a before-and-after (e.g. "the steepest step falls from 0.236 to 0.0125") |
| Round 2's row: "compact bar, 3 px, between the two lines", "the row stays 40", lamp 10 px at the left, "tip 22 × 6", "background differs from working by form (beads)", "the track is sunken: blue-black in Night", the word "claude" on line 2 | Round 3 rows | §4: bead bar a third of the row at the right, 15 px lamp, rows 42, spark |
| Usage beads or pearls in sockets, `--use-5h` blue / `--use-7d` green, `--hot-*` deep and light steps | Usage is plain ink | §3, §11.6 |

Everything else in BRIEF.md §9 stands: the reel, the measured palette and shares, triad hues, blends without bridges (the theory: crossing families wants a bridge; a state bar never crosses one), arm's P3 values and the moat, hero stops vs arm, H-K, Field's text and diff numbers, motion. Diffs and the ANSI table are re-measured in the neutral well (§11.1).

---

## 13. Files and tools

- `C2/derive2.py` → `C2/out2.md` (every table above; round 3 adds §E smooth bars with their 2 px steps, §J usage lines, §N ANSI and §O diffs in the neutral well) and `C2/tokens2.css`; `C2/check_tokens.py` (tokens.css matches derive2: `TOKENS MATCH`); `C2/tables.py` (the §3 tables, straight from tokens.css); `C2/wall.py` (tokens at their sRGB chroma ceiling); `C2/compose_brief2.py` (this file from `BRIEF-2.src.md` plus the tables).
- `C2/eval.js <html> "<query>" <width> <wait> "<js>"`: a headless probe at any width (phones included), for driving controls. `C2/shotfig.js <html> "<query>" <selector> <out.png> [width] [dpr] [wait] ["<js first>"]`: one element at 2× for a close look.
- `C2/ramp_px.js <html> "<query>" <out-dir> "<selector>" …` + `python3 C2/ramp_px.py <theme>`: the smoothness proof from pixels (each bar's middle row every 2 px, a bead bar's ramp with its mask lifted, and its beads one by one).
- `BUILD/parts/_test.html` (`gate.sh _test`) exercises every new and changed component in both themes: the Night ladder swatches, lamps live and still, every bar form for every state, both themes side by side in one figure, the state pills (setState + setBar), pearls (tints at 8–20 px, states, tally, counts), beads at Night's 0.60 rim, ramps, chains, controls (the primary pill's key hint), rows built by `Bloom.row` (bead bars, 15 px lamps, spark, context, tokens), the usage line, `.panel.deep`, and a window whose band carries a full bar.

## Round 4 amendments (2026-10-06, supersede the sections above where they differ)
- Row bead bar: a SIXTH of the row (`--sr-frac: 6`); the menu-bar panel keeps a quarter. Row grid is 7 columns: `1fr auto auto 8px <bar> 8px 15px`; line 2's meta spans 3–7 so it never covers the chips.
- Line 2 separates branch from worktree: plain branch → branch glyph + name (`g-branch`); a session with worktrees → worktree glyph + count (`.sr-wtn`, title "N worktrees"), child `.wt-row`s name each worktree. Never both. (`runtime.js` `subHTML`, `WT` map.)
- Housekeeping rows read "dreaming" only.
- Done lamp: a still tick (✓), no animation. Failed lamp: a cross (✕) that keeps its stumble (two soft dips every 3.5 s). Both are one SVG mask over the lamp box (ledger 6).
- Working/Background lamps: ink-1 (was ink-2) with a field-coloured band ~30 % of the lamp tall (`--lamp-band: var(--field)`), so the rise reads at 15 px.
- Panel tabs are icons in both windows (Trace, Outputs, Folder, Browser, Git; + Terminal in the chat window). In the chat window Diff lives inside Git as a Graph | Diff mode; there is no Diff tab.
- Delta: Q2 (done's motion) and Q11 (the centre) are decided by the owner and removed; B24 is "your pick"; B6 amended (done is still).
