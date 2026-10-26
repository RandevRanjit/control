# CONTROL version 1: design handoff

Written 8 Oct 2026 at the end of the hybrid design session (design review 05). The owner (Randev) settled the look of
CONTROL v2's first release, which he calls **version 1**, as option **D** on `design/hybrid/index.html`. He refined it over
twelve passes, each made from screenshots. This file is for the session that builds it: HANDOFF-v2 §5, step 7
(Bloom reskin), in `apps/web` and `apps/desktop`.

**The bar is 1:1.** The owner's words: *"its really important the version 1 of the control app looks as close to this as
possible, like 1:1"*. The app is HTML and CSS too, so nothing here needs translating into another medium. Port the CSS;
don't redraw it.

---

## 0. What to open, in order

| # | What | Use it for |
|---|---|---|
| 1 | `design/hybrid/index.html#shell`, figures **S6** and **S7**, offline (`?shot=shell&fig=d` renders S6 alone; add `&theme=night`) | The design. Where anything below disagrees with the page, **the page wins**. |
| 2 | `design/hybrid/v1/index.html` | The same window and its four panel tabs as static markup on two stylesheets, with no Bloom runtime. Open DevTools on any element to read its computed style. `?theme=night`, `?motion=reduce`. |
| 3 | `design/hybrid/v1/tokens.css`, `design/hybrid/v1/control-v1.css` | The CSS to port. GENERATED from the page's sources by `src/extract.cjs`: every rule that styles D, verbatim, in cascade order, with the A/B/C rules pruned out. Rendered on the markup in (2), they are **pixel-equal to the page**: 0 pixels differ by more than 16/255 in either theme, across the window and all four panels (verified 8 Oct). |
| 4 | `design/hybrid/v1/measure.md` | 160 parts measured from the render: box, face/size/line-height/weight, colour and background in both themes, radius, padding. Use it to check a build, not to design from. |
| 5 | `design/hybrid/v1/shots/` | Reference PNGs at 2× with Reduce motion: `window-{field,night}.png` (1512 × 945) and `panel-{outputs,folder,browser,terminal}-{field,night}.png` (440 × 945). |
| 6 | This file | The rules behind the numbers, what each part means, what data it needs, and how to check the build. |
| 7 | `design/bloom/HANDOFF.md`, `design/bloom/index.html` | Bloom, which version 1 inherits from: tokens, lamps, bead bars, motion, colour proofs. Still binding where this file doesn't override it. |

`design/hybrid/v1/` is self-contained: it has its own `fonts/` and `behaviour.js` (the three behaviours, §10.3).

**Version 1.2 (20 Oct 2026) is the current design.** It is 1.1 with what §3, §19.5 and §20 changed in the window, all
listed in §21: the search row without the folder button, the ⌘K button in the head, and Lucide's icons at §20's sizes.
1.2's files are in `design/hybrid/v1.2/`, with the same layout as `v1/`: tokens, `control-v1.css`, markup, `measure.md`,
shots. 1.1 (§15) stays in `v1.1/` and 1.0 in `v1/` (exported at `5ca6c032`). If 1.1 is already built, §21 is everything
to change; otherwise build 1.2 directly from `v1.2/`. 1.2's export matches the page in both themes: at most 32 pixels a
shot differ by more than 16/255, and each is antialiasing on a curve (an icon's edge, the spark, a pearl).

---

## 1. What the owner cares about (read this before anything else)

These are the standards he held every pass to, in his own words where he gave them. A build that has the right parts but
breaks one of these isn't 1:1.

1. **Geometry is exact, never approximately right.** The turn's dashed line must use *"dashes the same len"*, with no
   *"sudden cutoff"* where the line ends on a partial dash. The owner set the dash, gap, width and strength by eye on
   S6's tuner on 10 Oct (§4.4). Nothing may continue past the last reply
   (*"there are a few more dotted lines which shouldnt be there"*). The tool trace's line must be *"dead straight"*
   through the bead centres. The arrows are *"center[ed] between the message and left border"*. Measure these; don't
   eyeball them (§4.4 gives the algorithm).
2. **Sizes match by measurement.** *"The numbers font size is slightly bigger than the text, so make sure they
   match."* Departure Mono numbers sit beside Regrade labels at the same px, because the two faces' digits and caps
   measure the same height (71.2 against 72.7 per 100 px). The folder icon draws 0.8× the group pearl
   (*"the circle is like 1x then the folder should be 0.8x"*). Effort bars are 1.5 px each with 1 px gaps.
3. **Say each fact once.**
   - The owner asked *"I see two github icons?"*, so the second was removed.
   - `site-v2` was dropped from the strip under the composer *"because we already have the worktree show on the left
     chat sidebar"*.
   - The head's breadcrumb was removed, because the selected card already says the folder and the chat.
   - CLAUDE.md was dropped from the head (*"no point in that"*).
   - The pull-request button was removed, because Git holds the PR.
4. **Surfaces meet flat, edge to edge.**
   - The right panel has no rounded corners, top or bottom. The only thing between it and the centre is *"a thin line
     just like S1"*.
   - The prompt band *"span[s] the entire horizontal width"* of the centre pane, from the sidebar edge to that line.
5. **Both voices are equal.** *"You have greyed out the AI's response… make both white."* The prompt and the reply are
   in the same strong ink. The prompt is marked by a tone band behind it (lighter in Night, darker in Field, inside the
   colour scheme), not by dimming the reply.
6. **Colour that means something, strong enough to read.**
   - Each tool gets its own colour, on its name **and** its bead: *"Bash and Browser need to pop more… one each for a
     tool"*. Muted names that are *"too close to white"* were rejected.
   - The diff's removed red uses T3's own red (*"mirror the red color in the diff of S1 of the T3 code as is"*), because
     Bloom's rose wash was *"too dark and need[ed] to pop more"*.
7. **Words are written properly.** Labels are capitalised: *"it should not be "chat" or "free" the first letter should
   be caps"*. Items in a row are spread evenly (*"space it evenly"*), not bunched to the left. Buttons are one word
   (Update, Open, Reveal, Preview, Add).
8. **Icons are consistent.** One set, Lucide as T3 ships it, and one icon per meaning (§20): *"we have to change and
   make sure we have a standard for the icon"* (owner, 16 Oct, when the settings button drew a sun). CONTROL's marks
   stay its own: *"there is no reason to change the control lock logo"* (18 Oct). The branch icon
   sits before `main` and the worktree icon before a worktree, everywhere: on the card, in the strip and in the panel.
   The new-worktree icon under the composer *"matches the ones on the left"*.
9. **Motion only where it means work.** The token count on a card is static. A context bar swapping with it every 2 s
   was tried and dropped: *"let it be static"*. Lamps and bars keep Bloom's clock.
10. **Hierarchy is drawn by indent.**
    - Groups › folders › chats each step in.
    - The tool trace sits one step further in than its stack's head bead, so its line starts under the label, not under
      the bead. There is no stub joining the head bead to the first call.
11. **Don't bloat the thread.**
    - Tool calls stack, showing the last five, with *"+n above"*; the older ones scroll in place. A click opens the rest.
    - The prompt is open text on a band, not a chat bubble (*"remove the text bubble around the user prompt"*).

---

## 2. The window

| | |
|---|---|
| Size | 1512 × 945 at 1:1 (the owner's MacBook window). Radius 16. |
| Columns | sidebar **256** · centre **816** (flexes) · right panel **440** |
| Themes | **Field** (default): page `#D6DEEE`, ink `#262B5B`. **Night**: `#2F2E2E` chrome, wells `#1B1A1A`. Field is `:root`; Night is `[data-theme="night"]` on `html` (`v1/tokens.css`). Neither follows `prefers-color-scheme`. |
| Surfaces | Sidebar on `--raised` (`#E3E9F4` / `#383737`). The centre has no fill of its own. The right panel and the wells are on `--deep` (`#D6DEEE` / `#1B1A1A`). Inputs and tracks are on `--sunken` (`#CDD7ED` / `#242323`). |
| Faces | Regrade for chrome and conversation text. Plex Mono for anything you could paste into a shell (code, paths, names, branches, most numbers). Departure Mono only for the head's load counts (§7). |

The root element is `.t3w.t3-bloom.t3-d`. `[data-region]` on it scopes needs-you preemption (§6.4).

---

## 3. Sidebar (256)

Top to bottom (box numbers are in `measure.md` §Sidebar):

1. **Top row, 52 high.** Traffic lights (16, 20). The sidebar toggle at x 96 and the **settings** button (the gear) at x 124,
   both 28 × 28. Then the **stair logo** (27 × 17, ink), centred in the space left to the right of the settings button.
   There is no wordmark.
2. **Search row, 38.** A 176 × 32 field (radius 10, on the card tone `--hy-card`, `#DAE1F0` / `#232222`), then two
   icon buttons: **New group** (a circle with a plus, in place of T3's project filter; owner, 11 Oct) and **New chat**
   (the pen). There is no folder button: the pen's *New thread in…* picker ends with **Add folder…**, which adds a
   folder and starts a chat in it (owner, 16 Oct).
3. **Update note** (from C), 240 × 34, radius 10, on `--overlay`.
   - It reads: spark glyph, `Claude 2.1.295 is out` (the version in Plex 520), then an **Update** pill at the right.
   - It shows only while an update exists. The button updates every idle chat now and queues the working ones
     (HANDOFF-v2 §4).
4. **List**, which scrolls under a 28 px fade at its foot. The tiers are:
   - **Group row, 28.** A 12 px pearl in the group's identity tint, then the NAME in Regrade 11.5 / 640 caps
     (letter-spacing .02em). The count sits at the right in Plex 10.5, with a chevron.
   - **Folder row, 22**, indented 16. A 12 px folder icon that draws 10 px (**0.8 of the 12 px pearl**), then the
     folder name in Plex 11.
   - **Chat card**: 224 × 78, radius 10, padding 8 10, indented to x 24. Three lines:
     - **Line 1 (20).**
       - The project mark: 16 px square, radius 25 %, the project's monogram in Plex 7.5 / 600 on its identity tint.
       - The project name in Regrade 12 / 500.
       - The **bead bar** (compact, 48 × 5), then the **lamp** (15 px) at the far right.
     - **Line 2 (19).** The chat name in Plex 12.5 / 500 (`STATISTICS`). At the right, the **tokens processed** in this
       chat, Plex 10, caption ink (`64k`). It is static, with no "tokens" word.
     - **Line 3 (17).** Left to right:
       - the **state words** in Regrade 11 (`needs you`, `working`, `interrupted`);
       - ` · `, then the git info: the **branch icon** + `main`, or the **worktree icon** + its name
         (`site-v2`), in Plex 10.5. The order is always *state, then git*.
       - at the right, the **model** (`Opus 5.5`, Plex 10) and the **effort meter**: five stacked horizontal bars, each
         9 × 1.5 with 1 px gaps, lit from the bottom. Lit bars are `--text-label`; unlit bars are `--seam`. 1 = low,
         2 = medium, 3 = high, 4 = xhigh, 5 = max (all five lit).
     - The **selected** card fills with `--selection` (`#E7EDFF` / `#373F5B`) and takes a soft inset lip and occlusion
       (`--t3-rowsh`). A needs-you card carries a 6 % arm wash.
   - A **Loose** heading over chats that belong to no group.
5. **Fold strip, 38.** **Snoozed** (the alarm clock) and **Settled** (the tick), each with a count pearl. Archive is
   merged into Settled: *"settled and archived are the same thing for me"*. A click opens the fold in place of the
   list.
6. **Usage, 90.** `5H 71% 01:10` and `7D 22% Sun`: the key in Plex 10.5 / 500, the percent in Plex 11 / 600 and the
   reset at the right. Under each is a 3 px plain-ink line on a quiet track (Bloom's usage line). Past 80 %, only the
   leading end breathes.
7. **Foot, 40.** One icon, the chart, which opens statistics. Statistics and settings are designed later (§12).

---

## 4. Centre (816)

### 4.1 Head, 52

There is no breadcrumb. The head says **what this chat loads**, then **what it started**: five pills, each 26 high on a
pill radius.

- Each pill holds an icon (14), a label in Regrade 11 / 520, and a count in **Departure 11**.
- In order: `Hooks 6`, `Skills 77`, `MCP 5`, `Plugins 9`, `Agents 3`.
- **Agents** counts the subagents and workflows this chat started, not the agent types it loads (owner, 21 Oct). While
  any runs, its icon and count take `--st-working`. Its list: **Running** (name; elapsed, or `workflow`), then **Done**
  (name; `done`, `failed` or `stopped`, and how long), newest first.
- At the right: the **⌘K button** (§19.5), two panel toggles, 32 × 32: details and right, then the **Loose ends** icon
  (§17.2), last (owner, 26 Oct). The bottom toggle (the terminal drawer) is gone (owner, 22 Oct); its keybinding still
  opens the drawer.

### 4.2 Canvas and column

The canvas is padded 0 24 8 and its top edge fades over 72 px. The column is centred, at most 736 wide. Turns stack to
the bottom of the canvas, above the composer.

### 4.3 A turn

One `.d-turn`, padded `6 0 16 34`. The 34 px left gutter holds the arrows and the dashed line. In order:

1. **The prompt.** Open text, not a bubble.
   - Regrade 14.5 / 22, weight 520, `--text-strong`.
   - It sits on a **band**: `--sunken` (`#CDD7ED` in Field, `#242323` in Night), padded 8.5 above and below, so the
     band is 39 high (1.3× the first cut).
   - The band runs **edge to edge across the centre pane**: a full-bleed box-shadow, clipped by the canvas, with square
     corners.
   - The **→ arrow** (18 × 18) sits in the gutter, 8 px from the pane's content edge and 8 px from the text.
2. **Tool stacks**, one per run of tool calls, inset 22 from the text edge (§4.5).
3. **The reply.**
   - Regrade 14 / 22, weight 400, **`--text-strong`**, the same ink as the prompt. At most 620 wide in the Comfortable chat
     width; Wide and Full let it fill the lane, as the prompt band does (owner, 26 Oct).
   - The **↳ arrow** (18 × 18) sits in the gutter at the same x as →.
   - Inline code is Plex 12.5 on the card tone, radius 4.
4. **The turn's totals**, Plex 10.5 on an 11 px line, in caption ink: `18s · ↑ 2.1k · ↓ 640 · no changes`. The whole-pixel
   line keeps every turn on whole pixels, which the app's list needs.

A turn can hold several stacks and replies, alternating; the last reply ends the turn's line.

### 4.4 The turn's dashed line (get this exactly right)

- The line is 3 px wide, `color-mix(--ink-4 20%)`, at x 8 in the gutter, so it runs down the arrows' tails.
- **The dash is 13 px** and the gap **at least 20 px**: the owner's, tuned by eye on S6 on 10 Oct.
- It **starts 20 px below →** and **ends 20 px above ↳'s tail** on the **last** reply of the turn. Nothing is drawn
  past the last reply.
- **It breaks at every ↳ before the last** (the owner, 12 Oct): it ends 20 px above that ↳'s tail and starts again
  20 px below its box, so no arrow sits on the line. Each piece is fitted on its own.
- It holds a **whole number of dashes**: n = round((h + 20) / 33). The gap is stretched to (h − 13n) / (n − 1), so the
  line starts and ends on a full dash.
- It is drawn as a repeating gradient (`background-size: 3px <dash + gap>`). JS sets top, height and the period
  (`dashes()` in `v1.2/behaviour.js`).
- **Re-fit whenever the turn's height changes**: fonts loading, a stack opening, a streamed reply growing, a resize.
  Work in layout units (`offsetHeight`), so any scale on an ancestor doesn't skew it.
- The arrows are stroked paths, so they scale cleanly:
  - **→** is `M1.5 9H16 M11.5 4.5L16 9L11.5 13.5`.
  - **↳** is `M1.5 1V10H16 M11.5 5.5L16 10L11.5 14.5`.
  - Both: stroke 2, round caps and joins, no fill. → takes `--text-strong`; ↳ takes `--text-caption`.

### 4.5 A tool stack

- **Head, 26.** A **10 px pearl in the stack's state**: done is green (`#5DA12A` / `#7CC74B`), working is blue. Then:
  - the label in Regrade 12.5 / 520 (`Worked for 18s`, `Working for 21s`; strong ink while live);
  - the call count in Plex 10.5 (`9 calls`);
  - `+4 above` as a chip, when calls are hidden;
  - a chevron at the far right, which turns over when the stack is open.
- **Rows** are inset **38 px** from the head, one step further in than the head's bead. Their beads sit under the
  head's label, not under its bead.
- **The rail**: Bloom's flowing ramp in the stack's state colour (`--sb-done` green, `--sb-working` blue).
  - It is 1.4 px wide (0.7× the first cut) and centred exactly on the row beads (x 375).
  - It runs from the **first row bead's centre to the last's**. There is no stub up to the head bead.
  - It flows on the 7 s clock while live and breathes on 3.5 s when done.
- **Row, 24.** The grid is `58 px | 1fr | auto`, gap 8:
  - a **6 px bead** at x 372, in the **tool's colour**;
  - the **tool name** in Plex 10 / 500, letter-spacing .06em, caps, in the **tool's colour**;
  - the target in Plex 11.5 (`app/admin/page.tsx`, `bun run dev`);
  - the meta at the right in Plex 10.5, caption ink (`118 lines`, `+3 −1`, `string not found`, `port 3000`).
- **Last five.** Closed, a stack is five rows tall (120 px) and opens scrolled to its newest call; the older calls
  scroll in place above. The top 36 px of the rows fades out, so the fifth call back fades. A click on the head opens
  every call; re-fit the turn's line afterwards.

**Tool colours** (Hue, the owner's pick). The bead and the name share one colour. Each tool has its own family:

| Tool | Field | Night | Token |
|---|---|---|---|
| READ | `#334889` | `#7792EF` | `--blue-deep` / `--blue-base` |
| WRITE | `#2B5A17` | `#7DAF4E` | `--green-deep` / `--green-base` |
| ERROR | `#B54B6A` | `#ED7D99` | `--rose-base` |
| BASH | `#C6911D` | `#FCCF47` | `--amber-deep` / `--amber-base` |
| BROWSER | `#209993` | `#66C4BE` | `--id-mint` |
| AGENT, SKILL | `#67327D` | `#B481CB` | `--lilac-deep` |

- ERROR is **rose**, by the owner's final call (pass 12). Rose is Bloom's softened red family, kept out of arm's
  reserved arc (Bloom colour C3), so arm red stays needs-you's alone.
- SKILL shares AGENT's lilac. Bloom has no seventh family clear of the others: butter is too close to BASH's amber,
  peri to READ's blue, sage to WRITE's green. Ask the owner if a skill-heavy thread needs its own colour.
- An ERROR row's target stays in ink (`--trace-error`); only its name and bead are rose.

### 4.6 Working line, composer, strip

- **Working line.** The blue working bar (96 × 6) with `Working for 41s` beside it, in Regrade 12.5, caption ink. It
  stays as it was: *"the text box… and the little blue bar stay as is"*.
- **Composer.** T3's, in Bloom's material: 736 × 88, radius 14, on `--raised`.
  - The draft is in Regrade at the prompt size from Settings → Appearance (14 by default), on an 18 line (owner,
    11 Oct; the shots still show Plex 12.5).
  - The controls row holds the model (`Claude Opus 5.5`), effort (`Max`, the card's effort 5) and access
    (`Full access`) pickers, in Regrade 12 / 500 with chevrons, then attach and the round **send** button (32, ink).
    While a turn runs, Send with a draft **queues** it (T3's list-plus glyph, 16, in `--field`); Stop shows only with
    no draft (owner, 10 Oct).
  - Nothing is ever sent for the owner (H1).
- **Strip under the composer.** It tucks under the card: radius 0 0 18 18, on the card tone, padded 24 14 9 14. Left to
  right:
  - `Local` with the folder glyph;
  - the workspace with the **worktree icon** (Plex, strong): `Worktree` once a chat runs in one, `New worktree`
    while a draft would make one (owner, 10 Oct);
  - **the context**: a 6 px bar on the sunken track.
- **The context bar.**
  - **Chat** is the used part, filled in `--ink-3`.
  - **Free** is the rest of the track.
  - The **auto-compact mark** is a 1.5 px dashed line in `--danger`, 4 px over and under the bar, at the threshold.
- **The legend** sits 15 px under the bar, spread **evenly** (`space-between`) across the bar's width: `Chat 320k`,
  `Free 680k`, `Compacts at 500k`. The owner set its face, size and spacing on S6 on 10 Oct.
  - Labels are Regrade 12, the size of `Local`, capitalised.
  - Numbers are Regrade 12 / 520 with tabular figures: one face for the whole line.
  - Each item has a swatch: a 7 px dot for Chat, a 1.25 px ring for Free, the 10 px dashed mark for Compacts at.
- There are exactly three items, *"chat, free and compact"*. A finer breakdown (system, tools, MCP…) was rejected as
  *"way too granular"*.

---

## 5. Right panel (440)

### 5.1 The panel and its tabs

- **Flat.** No radius anywhere. It sits on `--deep` and meets the centre with one 1 px `--seam` line (`box-shadow:
  -1px 0 0`).
- **Tab row, 52.** Five icon tabs, 30 × 26 on a pill radius: **Outputs, Folder, Browser, Git, Terminal** (icons in §20.2). The selected
  tab takes strong ink. Its `--deep` fill is the flat panel's own tone, so the ink alone marks it.
- **The tabs switch the view.** The window opens on Git. Every view sits under the row; one shows at a time.

### 5.2 Git (Diff mode shown)

- **Head, 34.** `Graph | Diff` as a segmented control (Graph is F33, later), then `this turn · vs HEAD` at the right.
- **Summary, 26.** `4 files +38 −12`. Plus is in the green mark, minus in the red mark (Plex 11.5 / 520).
- **Changed files.** 24 high, radius 8. A status letter (M, A), the path in Plex 11.5, and `+n −n` at the right.
- **Diff.** Plex 11 / 16 on `--deep`, radius 6. Line numbers sit on `--sunken`.
  - Added lines take Bloom's green wash, with words on `--green-word`.
  - **Removed lines take T3's own red, as S1 draws it**:
    - Field: wash `#FEF2F2`, sign `#B91C1C`, word `rgb(239 68 68 / .18)`.
    - Night: wash `rgb(239 68 68 / .10)`, sign `#F87171`, word `rgb(239 68 68 / .26)`.
  - T3 has no word marks, so the word takes the same red, stronger.

### 5.3 Outputs (F28, F30)

- **Head.** `Outputs`, `this chat, newest first`, and the count at the right.
- **List.** Grouped under turn headings (`T14 · now`, `T12 · 23:20`). Each row is 28 high: a 14 px kind icon (shot,
  file, diff, out; §20.2), the name in Plex 11.5 and the meta at the right (`PNG · 212 × 40`, `DMG · 11.7 MB`). The picked row
  takes the card tone.
- **Preview.** The picked output renders underneath, on `--deep`, radius 10. A Markdown report is shown rendered:
  - the heading in Regrade 16 / 640, text in Regrade 13, code in Plex on the card tone;
  - tables with a seam line between rows.
- **Foot, 40.** The picked output's name and how it is shown, then **Open** and **Reveal**.

### 5.4 Folder (F31)

- **Head.** The breadcrumb `orbit-website › site-v2` in Plex, then `4 changed`.
- **Tree.** Rows are 26 high and step in 16 px per level, with chevrons on folders and file icons on files.
  - Git's mark sits next to the age at the right: **M** in the write green, **A** in the read blue.
  - Ignored folders (`dist`) are dimmed, with `ignored` in place of an age.
- **Quick Look.** The picked file shows on `--deep`, radius 10, in Plex 11.5 / 18, with line numbers. Keywords take
  the lilac; strings take the green.
- **Foot.** `lib/release.ts · 14 lines`, then **Preview** and **Reveal**.

### 5.5 Browser (F36, F37)

- **Head.** Back, forward and reload, the address (`localhost:3000/download`, Plex 11 in a 24 high field), then the
  **pick** and **shot** tools. The active tool is raised.
- **The page.** It renders in its own colours, inset 14.
- **Picking an element.**
  - The picked element (`button.cta`) gets a 1.5 px dashed cream outline at 5 px.
  - A **pick bar** shows under it: `button.cta`, `212 × 40`, and **Add**. Add puts the element and its screenshot into
    the composer as a draft, never sent (H1).
- **Foot.** A lamp for the dev server's state, `bun dev · tab 2`, then the port.

### 5.6 Terminal

- **Head.** The session's shells as tabs: `1 claude`, `2 bun dev` (on), `3 zsh`, then `+`, with the worktree at the
  right.
- **Body.** The shell, in Plex 11 / 16, bottom-aligned, with success marks in the write green and a block cursor.
- These are the app's own shells. Claude never types into them, and they die when the owner quits from the menu bar.
  There is no drawer under the conversation: the terminal is this tab.

---

## 6. States

### 6.1 Lamps (15 px, colourless, far right of line 1)

Bloom's lamps, with two version 1 changes:

| State | Lamp | Bar | Line 3 words |
|---|---|---|---|
| working | **background lamp**: the band rising through a ring | blue, flowing | `working` |
| background (agents running) | background lamp | blue | `background · 2 agents` |
| needs you (approval, input) | bullseye, beats every 1.75 s | arm red, the only red bar | `needs you` |
| choose on return | half fill, tide | lilac | `choose on return` |
| failed, limited | cross, two dips every 3.5 s | amber | `failed · exit 1`, `limited · resets 01:10` |
| done | still tick | green | `done` |
| idle | ring | quiet | `idle` |
| compacting (housekeeping) | **background lamp** | the safe ramp | `dreaming` |
| **interrupted** | **ring cut top to bottom by one bar as thick as the ring** (`--rw`), still | the working bar held still at half strength | `interrupted` |
| lent to the CLI | open ring | quiet | `lent to the CLI` |

- Working and compacting wear the background lamp, at the owner's wish: *"both are technically working… I'd prefer the
  lamp for the waiting one"*.
- Interrupted (pass 8): *"a single vertical line the same thickness as the circle it is in"*.
- Draw each lamp as one mask over the lamp's own box, never a positioned child (Bloom ledger rule 6). At 15 px the two
  snap apart otherwise.

### 6.2 Stack heads

A stack's head pearl and its rail take the turn's state: **green when worked, blue while working**.

### 6.3 Places, not states

Pinned, snoozed and settled are where a chat sits; the lamp and bar still say what it is doing.

- **Pinned** is a pin glyph after the project name, and the chat holds the top of its group.
- **Snoozed** and **Settled** fold into the strip (§3.5). Archive is Settled.

### 6.4 Needs-you preempts

While any needs-you lamp or bar is in a region, the region gets `[data-preempt]`. Every flowing ramp in it then becomes
the safe ramp, so the needs-you bar is the only red on screen (Bloom colour §4.2; `preempt()` in
`design/hybrid/src/runtime.js`).

---

## 7. Type

| Face | File (in `v1/fonts/`) | Licence | Used for |
|---|---|---|---|
| **Neue Regrade** (variable, 300–800) | `NeueRegrade-Variable.ttf` | free for commercial use (Bloom HANDOFF) | All chrome: labels, buttons, state words, the prompt, the composer draft and the reply. Weights 400 / 520 / 640 (`--w-reg`, `--w-med`, `--w-strong` under `html[data-type="regrade"]`). |
| **IBM Plex Mono** 400 / 500 / 600 | `IBMPlexMono-*.otf` | OFL | Anything you could paste into a shell: chat, branch and worktree names; paths, commands and inline code; the diff and the changed-file list; tool names and targets; tokens, sizes, model names; the terminal. |
| **Departure Mono** 400 | `DepartureMono-Regular.woff2` | OFL (`DepartureMono-LICENSE.txt`) | **Only** the head's load counts (`Hooks 6`) and the context legend's numbers (`Chat 320k`), each at the same px as its label (11). |

- Code moved from Departure back to Plex in pass 6: *"just have whatever font is used to say the worktree on the
  sidebar… for code"*. Keep Departure off code.
- Regrade lacks `…` and `→ ⌘ ⌥ ⇧`, which fall back. The thread's arrows are drawn SVG, not characters.

---

## 8. Colour

- **Tokens.** `v1/tokens.css` holds every custom property both themes use. Bloom's proofs (WCAG, APCA, CVD, arm
  separation) are in `design/bloom/engineering/colour-proofs.md`. Print no colour that isn't a token, except T3's diff
  red (§5.2), the lock plate's white and black (§16.3) and the browser page's own colours.
- **Arm red means needs-you only**, and danger means destructive. The context bar's compact mark uses `--danger`
  dashed, as a threshold, not a state.
- **Failed is amber** as a state (lamp and bar). In the trace, ERROR is rose (§4.5); the two jobs are separate.
- **Selection** is the one blue fill in the chrome: the selected card.
- **Identity tints** (mint, rose, peri, butter, sage, lilac) belong to groups and projects: the pearls and the project
  marks. Every surface draws a project as the card does: its monogram on its tint.
- **Floating panels** (`.panel.float`: popovers, sheets, the head pills' lists) wear the menus' glass and follow
  Settings › Glass opacity, as menus and selects do (owner, 25 Oct). The menu-bar panel stays solid: it is its own
  window, with nothing behind it to blur.

---

## 9. Motion

Bloom's clock is unchanged (`design/bloom/HANDOFF.md`, Motion):

- T = 7 s. Loops run at 1.75, 3.5, 7 or 14 s, and one-shots take 109, 219, 437.5 or 875 ms.
- Curves are sine-family with no overshoot.
- **Every infinite animation is phase-locked to one 14 s epoch.** Set every loop's `startTime` to the epoch, so a lamp
  that mounts late lands in step (`sync()` in `design/hybrid/src/runtime.js`). In React, run one hook over
  `document.getAnimations()` on mount and on each frame where animations were added.
- Reduce motion (`html[data-motion="reduce"]`) stills every loop to its still pose. The reference shots use it.
- What moves in version 1:
  - the lamps;
  - the bead bars;
  - a live stack's rail (7 s);
  - a finished stack's rail breathing (3.5 s);
  - the usage line past 80 %;
  - the lock plate's logo (§16.3).
- Nothing else moves. The token count is static; there is no shimmer on compaction (the lamp says it).

---

## 10. Building it in `apps/web`

### 10.1 Port the CSS, then make the components emit the same markup

1. Put `v1/tokens.css` at the top of `apps/web/src/index.css`, after `@import "tailwindcss"`, and the fonts in
   `apps/web/src/assets` (or `public/`). Map T3's own variables onto Bloom's tokens, so T3's `components/ui`
   primitives (dialogs, menus, tooltips, toasts) take the look too: `--background → --field`, `--foreground →
   --text-body`, `--muted-foreground → --text-caption`, `--border → --seam`, `--radius → 10px`, and so on.
2. Load `v1/control-v1.css` as one layer (`@layer control`), class names as they are. It is the resolved cascade for
   these surfaces; rewriting it as Tailwind utilities would cost the 1:1 for nothing.
3. Make each React component render the markup in `v1/index.html` for its part: same elements, classes and attributes.
   Rename classes later if you like, once the build matches.
4. Icons come from `lucide-react`, by §20's table. The page's sprite (`design/hybrid/src/sprite.svg`, inlined in
   `v1/index.html`) only lets the page draw them offline; don't port it.

The third column gives likely homes, read from file names at the fork point. Confirm each one when you open it.

| Part | Root class in `v1/index.html` | Where it lands in T3 (`apps/web/src/components/`) |
|---|---|---|
| Window grid | `.t3w.t3-bloom.t3-d` | `AppSidebarLayout.tsx`, `ThreadRouteView.tsx` |
| Sidebar | `aside.t3-side` | `Sidebar.tsx`, `sidebar/SidebarChrome.tsx`, `sidebar/SidebarUpdatePill.tsx` (the update note) |
| Group / folder / card | `.group-row`, `.hy-ph`, `.t3-card` | `Sidebar.tsx` (the new Group entity, HANDOFF-v2 step 6), `ThreadStatusIndicators.tsx` (lamp + bar replace the status label) |
| Fold strip, usage | `.hy-folds`, `.hy-use` | `Sidebar.tsx` shelves; `usage/` |
| Head | `.t3-head` with `.d-loads` | `chat/ChatHeader.tsx` (the breadcrumb goes) |
| Thread | `.d-col` › `.d-turn` | `chat/MessagesTimeline.tsx`, `chat/WorkLog.tsx` (the stack), `ChatMarkdown.tsx` (reply text) |
| Working line | `.t3-working` | `chat/ComposerActivityStatus.tsx` |
| Composer | `.t3-comp` | `chat/ChatComposer.tsx`, `chat/ComposerSurface.tsx`; pickers in `chat/ProviderModelPicker.tsx`, `chat/TraitsPicker.tsx` |
| Strip and context | `.t3-strip.d-strip` | `BranchToolbar.tsx` (branch selector removed from the strip), `chat/ContextWindowMeter.tsx` |
| Right panel | `.t3d-panel` › `.hy-panel` | `RightPanelTabs.tsx`, `DiffPanel.tsx`, `chat/ChangedFilesTree.tsx`, `preview/` (Browser), `ThreadTerminalDrawer.tsx` (moves into the Terminal tab) |

### 10.2 The data each part needs

| Part | Fields |
|---|---|
| Group row | name, identity tint, chat count, collapsed |
| Folder row | folder name, chat count |
| Card | project (name, monogram, tint), chat name, state (§6.1), **tokens processed** (formatted `64k`), branch **or** worktree name, model display name, **effort 1–5**, pinned, selected |
| Update note | new Claude version, or nothing |
| Folds | snoozed count, settled count (settled includes archived) |
| Usage | 5H and 7D: percent, reset time |
| Head | counts of hooks, skills, MCP servers and plugins loaded for this chat; the subagents and workflows it started, running and done |
| Turn | prompt text; then an ordered list of stacks and replies; totals (duration, ↑ in, ↓ out, files changed) |
| Stack | state (working / done), label (`Worked for 18s`), calls: kind (read, write, error, run, web, agent, skill), target, meta |
| Context | tokens in the chat, window size, auto-compact threshold |
| Panel | Git: files, ±, hunks with word ranges. Outputs: items per turn (kind, name, meta, renderable). Folder: tree with git status and ages. Browser: URL, picked element and box. Terminal: shell tabs. |

### 10.3 The three behaviours (`v1/behaviour.js`)

1. **`dashes()`**: fits each turn's dashed line (§4.4). Run it after layout, on fonts ready, on stack open and close,
   while a reply streams, and on resize. A `ResizeObserver` on each `.d-turn` covers all of them.
2. **A stack opens** to every call, and closes, on a click of its head (`data-open`).
3. **Panel tabs** switch the view (`aria-selected` on the tab, `hidden` on the views).

`[data-preempt]` (§6.4) and the phase-locked clock (§9) are the other two pieces of logic the look depends on.

### 10.4 What goes from T3's UI

- The breadcrumb.
- The pull-request button: Git holds the PR.
- The second GitHub icon.
- The branch picker in the strip: the sidebar card says the branch.
- The terminal drawer: the Terminal tab replaces it.
- Status labels and icons: the lamp and bar replace them.
- Bubble messages.
- Text-chip panel tabs.

---

## 11. Checking the build is 1:1

1. **Seed** a sandbox data folder with T3's `migrate-dev-db` pattern (never `~/.t3/userdata` or `~/.control`), using
   the page's twelve chats, ORBIT-WEBSITE selected, and its two turns. The fixture is every string in `design/hybrid/src/kit.js`:
   `GROUPS`, `PROJECTS`, `CHATS`, `MODEL`, `dconvo()`, `LOADS`, the context numbers, `OUTS`, `TREE`, `TTY`, `DIFF`.
2. **Render** the window at 1512 × 945 with Reduce motion, in each theme. Capture at 2× with Electron's
   `webContents.capturePage()` or headless Chrome on the web build.
3. **Compare** against `v1/shots/window-<theme>.png`. Pass means no pixel off by more than 16/255, the same tolerance
   the extraction met. Then open each panel tab and compare against `v1/shots/panel-<tab>-<theme>.png`.
4. **Probe** the parts in `v1/measure.md` with the same selectors (`node design/hybrid/src/measure.cjs` shows how). A
   box more than 0.5 px off, or a font or colour that differs, is a bug.
5. Show the owner the two window shots side by side with the reference, at the end of step 7.

---

## 12. Not in version 1's design yet

- **Statistics** (the chart in the sidebar foot) and **Settings** (the gear in the top row): their screens come later,
  at the owner's word (*"we can worry about the statistics section and settings section later"*).
- **Git's Graph mode** (F33). Only Diff is drawn.
- A locked group's rows in the sidebar (the full lock is §16), the update queue in motion, needs-you cards in the thread (permission, question, plan),
  thinking blocks, PDF viewing (F29 beyond the Outputs preview), quiet notes, and the mobile reskin.
- The empty states: no chats, no group, a new chat.

When one of these is designed, draw it on `design/hybrid/index.html` as D first, then extend `v1/` with the extractor.

---

## 13. The twelve passes (what he said, what changed)

| Pass | The owner | Version 1 now |
|---|---|---|
| 1 | Start from A; take C's groups › folders › chats with indents, its usage bars, fold strip and update note; Bloom's branch glyph by `main`, Bloom's worktree glyph; *state then git* on line 3; B's right panel with the terminal. | §3, §5 |
| 2 | Folder at 0.8 of the pearl. Model and a 5-bar effort meter on each card; tokens above it. Settled and archive merged, with an icon. The logo, not the word CONTROL. Working and compacting on the waiting lamp. The centre as a thread like the markdown example, with tool calls stacked (top five, click to expand). The composer and blue bar stay. | §3, §4.3, §4.5, §6.1 |
| 3 | Settings beside the sidebar toggle, the logo centred in what's left. No bubble around the prompt; the trace indented; a line along prompt and reply. No "tokens" word. One worktree glyph everywhere; one GitHub icon. | §1, §3, §4.3 |
| 4 | Effort as stacked horizontal bars (his image). A dotted line, → for the prompt and ↳ for the reply. Beads that flow in colour like C, green worked and blue working. | §3, §4.4, §4.5 |
| 5 | Equal dashes with no cut-off, nothing after the last reply. The breadcrumb replaced by hooks, skills, MCP and so on with icons. Static tokens. `site-v2` out of the strip; a context breakdown with auto-compact in its place. | §4.1, §4.4, §4.6 |
| 6 | Three context items only. Code in the sidebar's worktree face (Plex); Departure only for head and legend numbers, matched in size. The panel flat, one thin line. The reply as white as the prompt; a band behind the prompt. Smaller row beads; a dead-straight line. | §4.3, §4.6, §5.1, §7 |
| 7 | Band full width. Legend capitalised and spread evenly, Departure numbers at the label's size. Pause bars touch the ring. No CLAUDE.md. Trace line 0.7×. Bigger arrows centred in the gutter. Fewer, longer dashes, 1:1 with the arrow's tail. | §4.3, §4.4, §4.6 |
| 8 | Band edge to edge across the pane, 1.3× tall. Dash gap 1.2×. Interrupted as one bar the ring's thickness. | §4.3, §4.4, §6.1 |
| 9 | The trace one step in; no line from the head bead to the first call. | §4.5 |
| 10 | Tool names and beads stronger than near-white (four variants tried). The diff's red as T3's, to pop. | §4.5, §5.2 |
| 11 | Hue, a colour per tool. Mock-ups of Outputs, Folder, Browser and Terminal. Statistics and settings later. | §4.5, §5.3–5.6 |
| 12 | ERROR rose, BASH yellow, BROWSER mint. The panel tabs must work. | §4.5, §5.1 |

---

## 14. Changing or regenerating version 1

The page is built from `design/hybrid/src/`. The kit is `kit.css`, `kit.js` and `sprite.svg`; the parts are in
`parts/*.html`; Bloom's shell is `tokens.css`, `base.css`, `lib.css` and `runtime.js`.

```sh
cd design/hybrid/src
./gate.sh                 # assemble index.html; probes, 390 px overflow, size → GATE PASS
node extract.cjs v1.2 simple   # v1.2/tokens.css, control-v1.css, index.html (+ fonts); args: folder, trace variant
node measure.cjs v1.2          # v1.2/measure.md and v1.2/shots/
```

- Edit the sources, never the files in `v1/`; they are generated, except `v1/behaviour.js`. `behaviour.js` mirrors
  `dashes()` and the two click handlers in `kit.js`, so change both together.
- Headless Chrome only. Open no visible windows.

---

## 15. Version 1.1 (9 Oct 2026): what changed from 1.0

Four changes. Everything else in §1–§14 holds. Files: `design/hybrid/v1.1/`.

1. **The tool trace is Simple.** The owner: *"keeping it simple"*. The busy parts went: no rail, no caps, and no colour
   per tool. The beads stayed, but quiet: *"removing it is too plain and keeping it feels like a lot is going on"*.
   - **No rail.** Nothing joins the row beads. The turn's dashed line (§4.4) is unchanged.
   - **Rows are written like S2's work log** (T3's chat in Bloom's paint):
     - the tool's name as Claude Code writes it, `Read`, `Write`, `Edit`, `Bash`, `Browser`, `Agent`, `Skill`, in
       Regrade 12.5, regular weight, `--text-secondary`. A failed call is named by the tool that failed (`Edit`), not
       "ERROR";
     - its target straight after, in Plex 11.5, `--text-strong`;
     - the meta at the right in Regrade 12, caption ink.
     - The columns are `auto | 1fr | auto`, gap 6; the row is still 24 high and inset 38 as in 1.0.
   - **Beads are flat, like Claude Code's ●.** 7 px with no pearl shading, centred where 1.0's 6 px bead was (x 375):
     - a finished call: `--text-strong` at **25 % opacity**;
     - the running call: full strength, **blinking** hard on and off every 1.75 s (`--T-beat`, down to 15 %). Under
       Reduce motion it holds full;
     - a failed call: full, in **T3's red** (`--diff-rem-mark`: `#B91C1C` Field, `#F87171` Night).
   - **Stack heads wear lamps, not pearls.** The 10 px **working lamp** is the background lamp (the band rising
     through a ring), as on the sidebar. A finished stack shows the 10 px **still tick**.
   - Hue's colours (§4.5) stay in the tokens. The Folder view's git marks and the Quick Look syntax still use them.
2. **A write's meta is coloured**: `+3` in the diff's green (`--diff-add-mark`), `−1` in the diff's red
   (`--diff-rem-mark`). This applies to every row whose meta is `+n −n`.
3. **Loose ends**: a mail icon, 30 × 26 on a pill radius, caption ink, first in the chat head's tools, left of ⌘K. It
   left the right panel's tab row on 22 Oct (owner), so it shows with the panel shut. It opens the Loose ends popover
   (§17).
4. **The strip under the composer** is unchanged from 1.0, legend and all. A version without the legend was tried on
   9 Oct and brought back.

In `v1.1/index.html` the window's root carries `data-tv="simple"`. The page selects its trace variant with that attribute,
and `control-v1.css` keys 1.1's rules on it. Keep the attribute, or drop the `[data-tv="simple"]` part from those
selectors when you port them; the result is the same.

---

## 16. Lock (11 Oct 2026)

The full lock's surfaces, drawn as section 06 of the page (figures L1–L4) and approved by the owner on 11 Oct, with
the plate's logo changed at his word. The CSS is the `<style>` block of `src/parts/lock.html`: every rule is scoped to
`.s-lk-` and coloured by tokens, so port it as it is. It isn't in `v1.2/`; render the figure itself as the reference
(`index.html?shot=lock&fig=<offer|sheet|sheet-group|plate|through|term>&motion=reduce`).

**The lock.** It is a commitment device, not security. The end time is absolute: fixed when Lock is pressed, at most
12 h ahead, and kept through quitting, relaunching and rebooting. Nothing ends it early; a lock can only be extended. A
**full** lock refuses your sends in every chat, from every client, and new prompts in terminal `claude`. A **group**
lock does the same for the groups ticked (it exists: HANDOFF-v2 §8 step 8). Running turns, agents' messages to each
other and answers to a pending request always pass. A chat that **needs you** (a question or an approval) comes
through until you've answered it. A failure doesn't. Agents can **read** a lock over MCP (`t3_lock_read`: the full lock
and each group lock still running) but never set, end or shorten one.

### 16.1 The offer (L1)

- It shows once **no chat has needed you for 10 minutes**. Idle chats don't block it; failed chats don't count as
  needing you. It never shows during a lock.
- It is the update note's form and slot (§3.3): `.hy-upd`, 34 high, radius 10, on `--overlay`. Under the update note
  when both show.
- It reads: the lock glyph (`g-lock`, the shut stair, 11 px), `Nothing needs you`, then `Later` (ghost pill) and `Lock`
  (pill) at the right.
- **Lock** opens the sheet set to Full for 2 h; only the sheet's Lock commits. **Later** hides it until something next
  needs you. Nothing pops: it waits for the next look.

### 16.2 The sheet, ⌘L (L2, L2b)

- Opened by ⌘L, by the offer's Lock, and by **Lock…** in a group's menu, which replaces the menu's three presets and
  opens the sheet in Group mode with that group ticked.
- The app's dialog backdrop (`--field` at 60 %, 4 px blur). The sheet is `.panel.float`, 460 wide, radius 20, padded
  18 20.
- Top to bottom:
  - `Lock` and the `⌘L` key (Regrade 12 / 520, `--text-label`);
  - the question, Regrade 16 / 640 with the time in Plex: `Lock everything until 18:00?`, `Lock CONTROL until
    18:00?`;
  - one line on what it holds, Regrade 13, `--text-secondary`: `11 chats, 4 of them working. Their turns run on.`;
  - a two-column form (labels 64 wide, Regrade 12 / 520): **Mode** (`Group | Full`, a small seg); **Covers** in Full
    (`The window` shows the lock plate, `Every chat` refuses your sends from every device, `claude` refuses new prompts
    in any terminal) or **Groups** in Group (a row per group: box, pearl, NAME in caps, `3 chats · 1 working`);
    **For** (`30 min | 1 h | 2 h`, then an `Until 18:00` field: typing a time picks it, a preset fills it);
  - the promise, Regrade 12.5 / 520 in `--text-strong`: *No early unlock. Nothing lifts it before 18:00: not quitting
    CONTROL, not restarting, not rebooting. A chat that needs you comes through until you've answered it.* It is ink,
    not danger, and Lock is the primary pill;
  - `Cancel` (ghost) and `Lock ↩` (primary). Esc cancels.
- Group mode starts with the groups that have a working chat ticked, less the open chat's group.
- Opened during a lock, the sheet can only extend: presets that would end sooner go, and Lock reads **Extend**.

### 16.3 The plate (L3)

- During a full lock the window is the plate, whatever brought it up. There is no sidebar, panel or composer.
- The window's lights, then centred: the logo, `Locked` (Regrade 84 / 640), `until 18:00` (Regrade 26, time in Plex
  500), the counts (`4 working · 2 done`, Regrade 13 / 520, `--text-secondary`; working is a running turn, background
  agents or compaction, done is finished and unopened), and *No early unlock. A chat that needs you opens here, until
  you've answered it.* (Regrade 13, caption ink).
- **Background: white in Field, black in Night** (the owner: *"let the background be black or white depending on the
  theme"*). Text keeps its theme ink.
- **The logo** is the sidebar's stair (§3.1, `.d-logo`: viewBox 19 × 12, stroke 2, round caps and joins) at 20 px a
  unit, drawn as 5 px square cells in `--ink-1`: a cell is part of the logo when its centre is within the stroke. The
  box is 340 × 200, 52 above `Locked`. Bloom's bead stair was tried and dropped: *"I dont like the coloured beads,
  this logo on the top left we have here is great… just do an animation on the logo, so its got a smooth dither
  animation"*.
- **The dither.** A band of shadow crosses the logo left to right with a slight lean, once every 7 s (T), phase-locked
  like every loop (§9):
  - the light at a cell is a raised cosine, `0.5 + 0.5 cos(2π(t/T − p))`, with `p = (i + j/2) · 5 / 408` for cell
    column i and row j;
  - each cell has a 4 × 4 Bayer threshold, `b = (B[j mod 4][i mod 4] + 0.5) / 16` with B = `0 8 2 10 / 12 4 14 6 /
    3 11 1 9 / 15 7 13 5`; the cell is lit (opacity 1) while the light is over `0.6 b`, and otherwise holds at .22. So
    about 70 % of the logo is lit at any moment;
  - the page does it with 16 step-end keyframe sets (one per threshold) and a delay per cell
    (`html[data-motion="full"]` only). A canvas is fine in the app if it follows the same clock and freezes with it.
- Under Reduce motion every cell is lit: the plain logo, still.
- ⌘L on the plate opens the sheet to extend.

### 16.4 Break-through (L3b)

- When a chat needs you during a full lock, the window comes forward **without taking focus** and shows only the chats
  that need you; the plate comes back once none do.
- It is the normal window with: the update and offer notes replaced by `Locked until 18:00` (the same note form, the
  lock glyph, the time in Plex 520); the list holding only the needing chats' cards, without their group and folder
  rows; the search row, the folds, usage, the foot, the right panel and the head's panel toggles gone; the sidebar
  toggle and settings hidden in place, so the logo stays put.
- The chat is open. The request is answered in the composer as the app already draws it; a typed send is refused.

### 16.5 Terminal `claude` (L4)

- A `UserPromptSubmit` hook in `~/.claude/settings.json` (backed up before CONTROL writes it) reads CONTROL's lock file
  and refuses the prompt with JSON on stdout: `{"decision": "block", "reason": "CONTROL is locked until 18:00. Nothing
  lifts it early."}`. Past midnight the time reads `10:00 tomorrow`.
- Use JSON, not exit 2: Claude Code prints an exit-2 block with the hook's command path in front of the message.
- Claude Code 2.1.295 prints `⏺ UserPromptSubmit operation blocked by hook:`, the reason, then `Original prompt: …`, in
  its warning colour, and leaves the prompt in the box. `claude -p` prints the same words on stdout and **exits 0**.
- CONTROL's own chats pass the hook; the server already refuses your sends to them and must let agents' messages
  through. Running turns and permission prompts never reach the hook.

---

## 17. Loose ends (12 Oct 2026)

Drawn as section 07 of the page (figures LE1–LE4) and approved by the owner on 12 Oct. The CSS is the `<style>` block of
`src/parts/loose.html`: every rule is scoped to `.s-le-` and coloured by tokens. Render a figure as the reference with
`index.html?shot=loose&fig=<pop|done|empty|cards|settle|phone|phone-sheet>&motion=reduce`.

**What a loose end is.** Something an agent has handed the owner to do, or a question it's waiting on him to answer,
kept with its chat until it's done: make the forum accounts, send the drafted emails, send a photo of the meter, say
which forums to post on. Agents file them over MCP; CONTROL never guesses one from a reply. These are not loose ends:
unsent composer text, an agent's own TodoWrite list, and pending questions and approvals (needs-you holds those). Each
chat has its own loose ends, with nothing shared between chats. Nothing pings: a new loose end changes no lamp, shows no
toast and never breaks through a lock. The count is the only signal.

### 17.1 An item

- **Fields:** a line in the agent's words; a reason (a sentence or two); the turn it was filed in; and at most one
  action: a link (**Open**), a file (**Reveal**) or a command (**Copy**).
- **Open** until it closes in one of three ways: the owner ticks it **done**, the owner **dismisses** it (×), or the
  agent closes it once it can see the thing is done. A closed item records who closed it and when. **Undo** reopens it.

### 17.2 The icon and the popover (LE1, LE1b, LE1c)

- **The icon** is 1.1's `.d-loose` (§15.3). While anything is open it takes strong ink and the count (Plex 10.5 / 500;
  width auto, padding 0 8, gap 4). With nothing open it is as 1.1 draws it: caption ink, no number. While its popover
  is up it is held in the open fill.
- **Opening it.** The icon opens a popover under itself. **⌘E** opens and closes it
  (`looseEnds.toggle`; ⌘⇧E is effort). A click on a card's mark opens that chat with the popover up. Esc or a press outside it closes it.
- **The popover:** `.panel.float`, 372 wide, radius 14, padding 6, 6 under the icon with its right edge on the icon's, as
  the head pills' lists hang; a long list scrolls inside it, 8 short of the window's foot.
  - The head is 30 high: `Loose ends`, then `3 open`, then the `⌘E` key.
  - Items are listed in the order they were filed. Each row:
    - grid `16 | 1fr | auto`, gap 4 10, padding 9 8 9 10, radius 10, the raised tone on hover;
    - the box, from the lock sheet (§16.2);
    - the line, Regrade 13 / 18 / 520, strong;
    - the reason, Regrade 12 / 17, secondary;
    - the turn, Plex 10.5 in caption ink, 5 px under the reason. A click on it scrolls the thread to that turn;
    - the action as a ghost `.pill.sm`, and a 22 px round × (Dismiss) that shows on hover.
- **The Done fold** is 30 high, with a seam line above it: a chevron, `Done` and a 16 px count pearl, and at its right a
  ghost `.pill.sm` **Clear**, which removes the chat's closed items for good (owner, 26 Oct). Opened, it lists closed
  items newest first, each with:
  - the line struck through, regular weight, in caption ink;
  - how it closed: `Done by you · 21:40`, `Dismissed by you · …` or `Closed by the agent · T13`;
  - **Undo**.

  Whether the fold is open is remembered on each client.
- **Empty:** `Nothing open in this chat.` and one line under it. The Done fold stays if anything has closed.

### 17.3 On the cards (LE2)

- Any chat with a loose end open shows the 12 px mail icon and the count (Plex 10.5 / 500, secondary ink, gap 3) on
  **line 2, just before the tokens** (owner, 12 Oct). A long chat name is truncated to make room. Line 3 would cut the
  state words, and line 1 the project name.
- A click on the mark opens that chat with its popover up. Settled cards keep the mark.

### 17.4 Settling (LE3)

- Settling a chat with anything open asks first, on every path: the menu, ⌘⇧S, a drop on the Settled fold, and the
  phone's settle.
- The dialog is `.panel.float`, 400 wide, radius 20, padded 18 20, on the app's dialog backdrop (§16.2). It reads:
  - `Settle RELAY MAIN?` (the name in Plex);
  - one line saying the loose ends stay with the chat;
  - the open lines, in a well;
  - `Cancel` and `Settle ↩`.
- Settle keeps the loose ends open, with the chat. A chat with nothing open settles as it does today.

### 17.5 The phone (LE4)

- The chat header's right items gain **`envelope`** (an SF Symbol) beside `list.bullet`, with the count as a badge while
  anything is open.
- It opens a native sheet at the medium detent, which drags to large. It holds the same list, Done fold (with Clear)
  and actions.
- Rows are touch size: a 22 px round box, a 15 / 21 line, a 13.5 reason and 30 high buttons.
- A file's action is **Copy** (its path) on the phone, because the file is on the Mac.
- The phone's reskin isn't designed yet (§12), so the header stays native; only the sheet is CONTROL's drawing.

### 17.6 Engine (for the build)

- **Events**, thread-scoped, typed in contracts, new fields optional:
  - `loose-end.filed` (id, line, reason, turnId, action?);
  - `loose-end.closed` (id, outcome `done | dismissed`, by `owner | agent`);
  - `loose-end.reopened` (id).
- **Projection.** A loose-ends projection keyed by thread rebuilds from those events. The thread shell carries the open
  count (optional), so the sidebar gets it without loading detail.
- **Agents** use the `control` MCP, bound to the calling chat; an agent can't touch another chat's loose ends:
  - `loose_end_add {line, reason, action?: {kind: link | file | command, value}}` returns the id;
  - `loose_end_list` returns this chat's items, open and closed;
  - `loose_end_close {id}` closes one as done, by the agent.

  The names follow D7 (no `t3_` prefix). The server's MCP instructions tell every agent: *when you hand the owner
  something only he can do, or end a turn waiting on his answer, file it with `loose_end_add`; close it with
  `loose_end_close` once you can see it's done.*
- **The owner** closes and reopens items through orchestration commands, as with settle
  (`createEnvironmentRpcCommand`); the server stays authoritative.
- **Locks.** Closing or reopening a loose end isn't a send, so a lock never blocks it. A loose end never breaks
  through a lock.
- A **forked** chat doesn't copy its parent's loose ends.

---

## 18. Local models (12 Oct 2026)

Drawn as section 08 of the page (figures M1–M5) and approved by the owner on 13 Oct. The CSS is the `<style>` block of
`src/parts/models.html`: every rule is scoped to `.s-lm-` and coloured by tokens. Render a figure as the reference with
`index.html?shot=models&fig=<win|notes|settings|add|ask|short|phone-home|phone-settings>&motion=reduce`.

**What it is.** Models that run on this Mac, for the few jobs where private data must not reach Claude. A local model
is a **tool**, not a provider; Claude stays the only chat (HANDOFF-v2 §4). An agent hands a model files by path and
gets back only its answer. CONTROL starts each model as its own `llama-server` process and owns that process: it
records the PID, watches it, sleeps it when idle, and kills it on quit and after a crash. Both the owner and agents
can wake a model. It runs the owner's GGUF files today. A model entry is just a command that serves the OpenAI API on
a port, so an MLX server can be added later without a redesign.

### 18.1 States

| State | What is running | Shown as |
|---|---|---|
| **asleep** | nothing | no note; Settings shows the open ring (`outside` lamp) |
| **waking** | the process is up and loading (`/health` answers 503), then the warm-up runs | background lamp, `waking · 0:41` |
| **ready** | `/health` answers 200 and the warm-up is done; the idle timer runs | idle ring, `ready · 33 GB` |
| ready, **in use** | one or more calls running; the idle timer is held | background lamp, `in use · 1 call` |

- **asleep → waking**: the owner's Wake, an agent's `local_model_wake`, or a call to an asleep model. Each passes the
  memory check (§18.3) first. Over 40 GB, it also needs the owner's approval; a send to a chat on the model is that
  approval (owner, 22 Oct).
- **waking → ready**: `/health` answers 200. Then the model's system prompt runs once, as a 1-token completion, so
  llama-server caches it and every later call reuses that cache.
- **back to asleep**:
  - from waking: Sleep, a failed load, the process exiting, or no 200 within 5 minutes;
  - from ready: the idle time passing (10 minutes by default, set per model) with no call running, Sleep, or the
    process exiting. An exit records its code, which shows on the Settings row.
- **Quit** puts every model to sleep.

### 18.2 The record: no ghost models

- **Spawning.** CONTROL spawns `llama-server` detached, in its own process group, with output going to
  `userdata/logs/local-models/<id>.log`. CONTROL sets `--host 127.0.0.1 --port <free port>`; the rest of the command is
  the model's.
- **The record** is `userdata/local-models/running.json`, written with `writeFileStringAtomically` straight after the
  spawn. Each entry holds the model id, the PID, the process's start time (`ps -o lstart=`), the port, the file and the
  full argv. If the record can't be written, CONTROL kills the process group and the wake fails, so a process never
  runs unrecorded.
- **Sleeping a model:** SIGTERM to the group (`signalProcessGroup`), up to 10 s for it to exit, then SIGKILL. The entry
  goes only once the exit is seen.
- **At server start**, CONTROL checks each entry. The PID must be alive, its start time must match the record, and its
  command line must still hold the recorded file and port.
  - If all three hold, CONTROL kills the group, as for Sleep.
  - If any fails, the PID now belongs to something else: CONTROL drops the entry and touches nothing.

  Every model is asleep after a start: **restart kills, it never adopts** (owner, 12 Oct).
- **Quitting.** The server's shutdown sleeps every model before it exits. Quitting Control from the menu bar stops the
  server (HANDOFF-v2 §4).
- **Never by pattern.** CONTROL kills only PIDs it recorded and has just verified. A model it didn't start (the owner's
  `qwen-stack` on :8080, say) is never touched; it shows as **Apps** in the memory bar.

### 18.3 Memory

- **Total** is `hw.memsize`. **Available** is free + inactive + speculative + purgeable pages × the page size, from
  `vm_stat`.
- **Swap in use** is `used` from `sysctl vm.swapusage`.
- **A model's need.** The footprint measured at its last wake (`footprint <pid>` once ready, which counts Metal's
  allocations), stored on the model. Before the first wake, an estimate from the file, the projector, the context
  length and `--cache-ram`.
- **The rule:** wake only if available − need ≥ **15 GB** and no swap is in use (owner, 13 Oct). A refusal gives the
  numbers (`needs 42 GB · 31 GB to spare`, or `swap in use · 2.1 GB`) and touches nothing else. CONTROL doesn't sleep other models to make room.
- **Over 40 GB asks.** A wake from the UI confirms in place. A wake from an agent becomes a pending request in its chat
  (M4): the chat needs you, and only the owner's Approve wakes the model. Decline fails the call. A chat's send doesn't
  ask: the send is the approval (owner, 22 Oct).

### 18.4 A call

- `local_model_run {model, instruction, files: [path…], maxTokens?}`:
  - CONTROL reads the files itself. A folder means the files directly inside it. Images go in as image parts when the
    model has a projector.
  - It sends the model's system prompt, then the instruction and each file under a `--- path ---` header, to
    `/v1/chat/completions` with streaming off.
  - It returns the answer, its length and the time taken. The files' contents never appear in the tool result, the
    transcript or the event log.
- A call to an asleep model wakes it first, under the same checks. The call's timeout covers the wake.
- Calls to one model run one at a time; the rest queue, and the note counts them. The idle timer restarts when the
  last call ends.
- If the files won't fit the model's context, the call fails with the token counts. CONTROL never truncates silently.
- What the answer says is the model's. The system prompt is the guard, set per model in Settings (M2). CONTROL
  doesn't scan the answer.
- In the thread it's an ordinary tool row: `Local model`, `run qwen-27b · 14 files`, then the time and the answer's
  length. A refused wake is a failed row, with the numbers as its meta.

### 18.5 Surfaces

- **The note (M1, M1b).** `.hy-upd`, one per awake model, under the update note and the lock offer. It reads:
  - an 11 px lamp;
  - the name, Plex 11.5 / 500;
  - the state words in caption ink;
  - **Sleep**.

  A click on the name opens Settings › Local models. Sleep while waking stops the load.
- **Settings › Local models (M2).**
  - **The memory bar** has Apps, Models, Free and the dashed **Kept back** mark, with the context bar's legend style
    (§4.6). **Swap** ends the legend as text, with no swatch.
  - **A row** holds the lamp, the name, the file, the state with its memory and when it sleeps, the PID and port while
    awake, and Wake or Sleep.
  - **Selecting a row** opens its fields:
    - Name and File;
    - Command: editable. The host and port are shown as CONTROL's and can't be edited;
    - System prompt;
    - Sleeps after (minutes);
    - Memory (measured);
    - Remove.

    Changes apply at the model's next wake.
  - **The rules line** repeats 40 GB, 15 GB and what quitting does.
- **Add (M3)** lists the GGUFs in `~/models` and the Hugging Face cache. A projector beside a model is attached to it.
  **Browse** picks any other file. The command is filled from the file, and from `serve.sh`'s flags when one sits
  beside it.
- **The phone (M5)** gets the note at the top of the chat list, and Settings › Local models with Wake and Sleep. Adding,
  editing and removing are desktop only.
- **Command palette:** `Local models` (opens Settings) and `Sleep local models`. There's no keybinding.

### 18.6 Engine (for the build)

- **Contracts**, new fields optional:
  - `LocalModel {id, name, file, projector?, args, systemPrompt, idleMinutes, measuredBytes?}`;
  - `LocalModelRuntime {modelId, state, pid?, port?, since, sleepsAt?, calls, footprintBytes?, lastExit?}`;
  - `LocalMemory {totalBytes, availableBytes, keepBytes, swapUsedBytes}`.
- **The service** is `LocalModels` in `apps/server/src/localModels/`: `list`, `scan`, `register`, `update`, `remove`,
  `wake`, `sleep`, `run` and `subscribe`. Each WS handler and MCP tool decodes its input and calls one method.
- **The registry** is a CONTROL-only setting in CONTROL's own store (HANDOFF-v2 §4.1). The runtime isn't
  event-sourced, because it is the processes themselves: it starts empty at every server start, after the record has
  been cleared (§18.2).
- **MCP** (`control`): `local_model_list`, `local_model_wake {model}`, `local_model_sleep {model}`, `local_model_run`.
  No `t3_` prefix (D7).
- **RPC.** Wake and sleep are commands any paired client may send. `register`, `update` and `remove` go in
  `CLIENT_GUARDED_RPC_SCOPES` under a scope the desktop holds and paired phones don't, because a model's command runs on
  the Mac.
- **Tests** never load a model:
  - the "model" is a small script serving `/health` and `/v1/chat/completions`;
  - wake, ready, idle sleep, a crash, and restart cleanup run against it;
  - the idle timer runs on Effect's `TestClock`;
  - a test for the restart rule plants a record whose PID belongs to another process, and checks it survives.

---

## 19. Menu bar (16 Oct 2026)

Drawn as section 09 of the page (figures MB1–MB4) and approved by the owner on 16 Oct. The CSS is the `<style>` block of
`src/parts/menubar.html`: every rule is scoped to `.s-mb-` and coloured by tokens. Render a figure as the reference with
`index.html?shot=menubar&fig=<icons|panel|settings|head>&motion=reduce`.

**What it is.** HANDOFF-v2 §4: the desktop app is a window and a menu-bar item in one process, and Quit in the menu bar
stops the server and every agent. Step 5 of the v2 build took that for the app menu's Quit, which T3 already had, so the
item was never built. Bloom drew it (`design/bloom/src/parts/around.html` A1, A2). This is that drawing in hybrid's
tokens and grammar. The icon is CONTROL's one ambient signal: CONTROL never opens the panel itself, posts no banners,
and nothing pings. It is desktop only, because the phone and the browser have no menu bar.

### 19.1 The icon (MB1)

- **A macOS template image**: black on clear, recoloured by the system for a dark or a light bar. It has no colour and
  no motion. The canvas is 30 × 18 pt. The stair is the kit's `LOGO` line at 1.5× (`3.75,15 3.75,12 8.25,12 8.25,7.5
  12.75,7.5 12.75,3 17.25,3 17.25,7.5 21.75,7.5 21.75,12 26.25,12 26.25,15`), 2 pt with round caps and joins.
- **The files** are in `design/hybrid/menubar/`: `<state>.svg` for idle, working, done, failed, needs, lock and off,
  and `<state>-update.svg` for each but off. Rasterise each at 30 × 18 and 60 × 36 as `<state>Template.png` and
  `<state>Template@2x.png`, so Electron treats them as templates. They come from section 09's `glyph()`. `node
  src/probe.cjs index.html shot=menubar 3000 "JSON.stringify(MenubarIcons())"` prints them; add
  `xmlns="http://www.w3.org/2000/svg"` when you write them out.

| State | Shape | Count beside it |
|---|---|---|
| idle | the stair alone | none |
| working | the top step filled (4.5 × 4.5 under the apex) | chats with a turn running |
| done, unseen | a tick on the right shoulder, 1.75 pt | chats finished since you last opened them |
| failed | a cross on the right shoulder, 1.75 pt | chats failed or limited since you last opened them |
| needs you | reversed: a block (radius 4) with the stair cut out | chats that need you, choose on return included |
| full lock | the shut stair, as `g-lock` | none |
| server off | the stair at 45 % opacity | `!` |
| Claude update out | a 4.2 pt dot on the left shoulder, over any state but off | the state's own |

- **One state shows.** The first that holds wins: server off, needs you, full lock, failed, done, working, idle. A chat
  that needs you shows during a full lock, because it comes through the lock (§16.4).
- **The count** is the item's title text (`tray.setTitle`), not part of the image, so there is one image per state.
  The icon counts what the panel shows (§19.3), so a locked group's working, done and failed chats aren't counted.
- **It changes only after a state has held for 2 s**, so a turn that ends and starts again doesn't flicker it.
- **Done and failed** clear once the chat is opened, from any client. They use the sidebar's own test,
  `hasUnseenCompletion` (`apps/web/src/components/Sidebar.logic.ts`), on the server's `lastVisitedAt`.
- **Server off** means the server isn't answering. The panel then shows only the header, `Server off`, and the footer.

### 19.2 The panel (MB2)

- **Opening and closing.** A click on the item opens it; a second click, Esc, a click anywhere else, or anything that
  opens the window closes it. The item shows pressed while it's open. Nothing else opens it.
- **The frame.** `.panel.float`, 360 wide, padded 6, radius 14, in the app's theme. It hangs 6 px under the item,
  centred on it and kept on screen. It grows with its content up to the screen's visible height less 40. Past that,
  the sections scroll under a 28 px fade, and the header, notes, usage and footer stay put.
- **Top to bottom:**
  - **Header, 40.** `LOGO` (27 × 17, `--ink-1`), `CONTROL` in Plex 12 / 600 with .26em tracking, and at the right
    `Claude 2.1.294` (Regrade 12, caption ink; the version in Plex 11 / 500). It is the version running, never the
    update's, which only the update note shows.
  - **Notes**, in the sidebar's slot order: the Claude update note (§3.3, same Update), the lock offer (§16.1, same
    rule; it is one offer, so Later hides it here and in the window), and a group lock's note (§19.3).
  - **Sections**: **Needs you** (needs you and choose on return), **Working** (every chat with a turn running,
    background agents and auto-compact's turn included) and **Done** (done, failed or limited since you last opened
    the chat). A section with no chats isn't shown. Each heading is 28 high: Regrade 12 / 520 in label ink, with the
    count in Plex 11 / 500, caption ink. Under it come the sidebar's cards (§3.4) at the panel's width, unchanged:
    project mark, project, compact bead bar and lamp; the chat's name and its tokens, with the Loose ends mark (§17.3)
    if it has one; state words, git, model and effort. In each section the newest change is first. A hovered card
    takes `--hy-card`.
  - **With nothing in any section**: `Nothing running.` (Regrade 13 / 500, secondary ink) over `No chat needs you,
    and none has finished since you last looked.` (caption ink).
  - **Usage**: the sidebar's block (§3.6), with a seam above it.
  - **Footer, 40**, with a seam above it: ghost pills **Lock**, **Open** and **Settings**, then **Quit** at the far
    right.
- **What a click does.**
  - A card brings the window forward with that chat open, and closes the panel.
  - Lock opens the window on the lock sheet (⌘L).
  - Open brings the window forward, or reopens it if it was closed.
  - Settings opens the window at Settings.
  - Quit is the app menu's Quit, and takes the same path: it stops the server and every agent.

### 19.3 Locks (MB2)

- **Full lock.**
  - The sections hold only the chats that need you, which come through as they do in the window (§16.4). Under them,
    one line in caption ink says what's behind the lock, as the plate does: `3 working and 1 done behind the lock.`
  - No notes show, as the plate has none.
  - The footer's Lock becomes the lock glyph and `until 18:00` as plain text, with no action. Nothing in the panel
    ends or shortens a lock.
  - Open shows the plate.
- **Group lock.**
  - That group's chats leave every section, except one that needs you, which comes through.
  - A note in the offer's slot reads `ORBIT is locked until 18:00` (the lock glyph; the group's name and the time in
    strong ink). There is one note per lock still running.
  - Lock stays, because more can be locked.
- The panel has no composer, so it never sends anything. It never shows a locked group's chats.

### 19.4 Turning it off (MB3)

- Settings › General has a **Menu bar icon** switch, on by default. Off removes the item and its panel. The window
  and the app menu's Quit stay, and the Dock icon reopens a closed window.
- The row exists in the desktop app only.

### 19.5 The ⌘K button (MB4)

- It sits in the chat's head, after the Loose ends icon in `.t3-tools`, 6 px plus the row's 2 px gap from the panel toggles. It is
  `.t3-ib`: the toggles' 32 × 32 box, 16 px glyph and caption ink.
- Hovered, it takes `--t3-accent` (`--hy-card`) and `--t3-fg`, the fill an open toggle wears.
- The glyph is the ⌘ key (`t3-cmd`, Lucide's Command), so it doesn't read as the sidebar's search (`t3-search`), which
  finds chats.
- A click toggles the palette, as ⌘K does. The tooltip reads `Command palette (⌘K)`.
- **The palette itself stays as it is today**, T3's (owner, 16 Oct). Bloom's ⌘K finder (D5) isn't taken in.

### 19.6 Engine (for the build)

- **The item.** Electron's `Tray`, in the main process that owns the server, with the template images from §19.1 and
  the count from `setTitle`. One pure function maps the threads, the locks, the update and the server's health to
  `{state, count}`. Test it over the priority list and the lock rules. The 2 s settle sits after that function, on a
  clock the test can drive.
- **The panel.** A frameless, transparent `BrowserWindow`, positioned from `tray.getBounds()` and hidden on blur. It
  loads the web app's own panel route, so it draws with the sidebar card's component and uses the same WebSocket. It
  reads the projections the sidebar reads. Its actions call the same commands the window uses.
- **Off.** The switch is a desktop setting. Turning it off destroys the `Tray` and the panel window.
- **Not built, because v2 lacks them** (they are in Bloom's A2):
  - Bloom's Housekeeping section;
  - the while-locked digest;
  - Go to tab;
  - Done's Clear;
  - the active and quiet timers under usage;
  - the CTRL version in the footer;
  - the pearl tallies and quarter-width bead bars.

---

## 20. Icons (16 Oct 2026)

The owner, 16 Oct: *"we have to change and make sure we have a standard for the icon… We need to make sure all of our
items are consistent"*. The settings button drew a sun, which reads as brightness. The page's sprite mixed Bloom's
hand-drawn 16-grid glyphs with loose copies of Lucide icons, and the app copied it, while the rest of the app (T3's
code) draws real `lucide-react`. He approved the standard below on 16 Oct: Lucide for every icon. On 18 Oct he kept
CONTROL's marks its own (§20.3): *"there is no reason to change the control lock logo"*, and the spark over T3's mark:
*"I like the before version of the claude icon more"*.

### 20.1 The rule

- **One set: Lucide, as T3 ships it** (`lucide-react` 0.564 in `apps/web`). Import the icon; never draw, copy or
  retouch a path. Lucide's defaults stay: 24 grid, stroke 2, round caps and joins, `currentColor`.
- **One icon per meaning.** A meaning wears the same icon in the sidebar, the head, the panel, the palette, menus and
  the menu-bar panel. A new meaning takes a Lucide icon nothing else uses, and gets a row in §20.2.
- **Three sizes: 16, 14 and 12 px.** 16 in the 32 px icon buttons (the head's toggles and ⌘K, the sidebar's top and
  search rows, attach) and the composer's pickers. 14 in fields, tabs, pills, toolbars and panel rows. 12 beside small
  type: a card's lines, notes, folds, the strip, folder rows, row actions and chevrons.
- **The phone uses SF Symbols**, as T3's phone app does: the same meaning, Apple's symbol for it (`gearshape`,
  `magnifyingglass`, `square.and.pencil`, `envelope`, `arrow.triangle.branch`, `folder`, `xmark`,
  `chevron.left`), at iOS sizes. The page's phone figures draw Lucide in their place.

### 20.2 Meanings

| Meaning | Lucide | Where |
|---|---|---|
| Settings | `Settings` (the gear) | sidebar top row; palette |
| Search | `Search` | sidebar search field |
| Command palette | `Command` | the ⌘K button (§19.5) |
| New chat | `SquarePen` | search row |
| New group | `CirclePlus` | search row |
| Add | `Plus` | terminal tabs |
| Folder, `Local` | `Folder` | folder rows; the strip |
| Add folder | `FolderPlus` | the pen's picker |
| Worktree | `FolderGit2` | card line 3; the strip; menu-bar panel; the workspace picker (a worktree checkout, New worktree) |
| Branch | `GitBranch` | card line 3; menu-bar panel |
| Loose ends | `Mail` | chat head; card line 2 |
| Supervised, Auto-accept edits, Auto, Full access | `Lock`, `PenLine`, `KeyRound`, `LockOpen` | composer access picker; these padlocks mean permissions, not CONTROL's lock. Auto's key: owner, 18 Oct |
| Pin | `Pin` | card line 1 |
| Snoozed | `AlarmClock` | fold strip; snooze menus |
| Settled | `Check` | fold strip |
| Dismiss | `X` | loose end rows |
| Open, closed | `ChevronDown`, `ChevronRight` | groups; stacks; folds; pickers |
| Back | `ChevronLeft` | browser; statistics |
| Sidebar | `PanelLeft` | sidebar toggle |
| Details, right panel | `SquareMenu`, `PanelRight` | head toggles |
| Statistics | `ChartNoAxesColumn` | sidebar foot |
| Attach | `Paperclip` | composer |
| Effort | `Brain` | composer effort picker |
| Outputs, Folder, Browser, Git, Terminal | `FileOutput`, `Files`, `Globe`, `FileDiff`, `SquareTerminal` | panel tabs |
| Screenshot, file, diff, build output | `Camera`, `File`, `FileDiff`, `FileOutput` | Outputs rows |
| Reload, pick an element | `RefreshCw`, `MousePointerClick` | browser toolbar (with `Camera`) |
| Hooks, Skills, MCP, Plugins, Agents | `Webhook`, `Sparkles`, `Plug`, `Blocks`, `Bot` | head pills (§4.1) |
| An MCP server connected, needing sign-in, failed, connecting, off | `CircleCheck`, `LogIn`, `CircleX`, `CircleDashed`, `CircleMinus` | the MCP pill's list, 12 px, the word on hover (owner, 22 Oct: "use icons not text") |
| New (a provider or model) | `Sparkles` | the model picker's rail badge, 8 px. The one icon two meanings share: owner, 20 Oct |

### 20.3 Not icons

These are CONTROL's marks, not icons, and stay its own:

- the stair logo, and the menu-bar icon drawn from it (§19.1), whose full-lock state is the shut stair;
- the lock glyph, the shut stair (`g-lock`), wherever CONTROL's lock shows: the lock offer, the locked notes, the menu-bar
  panel, the palette and the phone;
- the spark (`g-spark`), the Claude mark, in the ink of the place it sits; not T3's `ClaudeAI`;
- lamps, bead bars, pearls, the effort meter and the project monogram;
- file-type icons (the file tree, a file's tab), which are T3's Pierre icons. The page draws Lucide's `File` there.

### 20.4 The page and the app

- The page's sprite (`src/sprite.svg`) holds Lucide's paths verbatim under the kit's names (`g-*` through `Bloom.gi`,
  `t3-*` through `Hy.T`), so the page draws offline. `g-lock` and `g-spark` keep their own drawing. `v1.2/index.html` inlines this
  sprite at §20's sizes; `v1.1/index.html` keeps the one from before §20.
- In the app, every sprite `<Glyph>` that draws an icon becomes its `lucide-react` icon from §20.2. `g-lock` and
  `g-spark` stay `<Glyph>`; the sprite (`apps/web/src/control/sprite.svg`) keeps only the marks. Bloom's 16-grid
  glyphs are kept in `design/bloom/src/sprite.svg`.

---

## 21. Version 1.2 (20 Oct 2026): what changed from 1.1

The owner chose on 20 Oct to cut one current export, so the app builds from one source. 1.2 is the page as it stands,
exported with `extract.cjs v1.2 simple`. Everything in the window that changed since 1.1 is below; the figures in
§16–§19 (lock, Loose ends, local models, menu bar) aren't in the export, as before.

1. **The search row** is a 176 × 32 field, then **New group** (the circle with a plus) and **New chat** (§3). 1.1's two
   folder buttons are gone.
2. **The ⌘K button** sits first in the head's toggles (§19.5). The loads row narrows from 680 to 640.
3. **Every icon is Lucide's** at §20's sizes: the gear for settings, `GitBranch` and `FolderGit2` on the cards,
   `AlarmClock` on the Snoozed fold, the head pills' icons and the panel's tab icons (§20.2). The stair logo, the spark,
   lamps, bars and pearls are unchanged (§20.3).
