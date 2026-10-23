# CONTROL in Bloom: handoff

Design review 04, four owner rounds (5–6 Oct 2026). Open `design/bloom/index.html` in a browser (works offline). The nav has
Field | Night, Regrade | Rounded, Pause, ¼× ½× 1× and Still (Reduce motion). `?shot=<section>&theme=…&t=<ms>` renders one
section for headless screenshots.

**Status.** An owner-reviewed design exploration. The spec (`docs/specs/2026-09-30-control-design.md`) is **not** edited:
the changes to H13 and the laws around it are proposals B1–B25 in the doc's section 08, and they become spec only when
the owner ticks them. Q-calls still open are listed there too.

This file has two parts:
- **Part 1, DESIGN**: what it looks like and what the owner decided.
- **Part 2, ENGINEERING**: how to build it.

---

## PART 1: DESIGN (owner-confirmed)

| Area | Decision |
|---|---|
| Themes | **Field is the default**: page `#D6DEEE`, ink navy `#262B5B`. **Night** is on `#2F2E2E`, a neutral near-black. Wells use neutral greys, not blue-blacks: `deep #1B1A1A` (terminal, chat, code, diffs) and `sunken #242323` (inputs, tracks). The blue-black `#060714` is occlusion only, as shading and never as a fill. |
| Type | **Neue Regrade** for chrome (`fonts/NeueRegrade-*`, free for commercial use). **IBM Plex Mono** for anything you could paste into a shell: terminal, diffs, paths, session and branch names, numbers, keys. Rounded is retired. |
| State colour | Lives in a per-session **bead bar**, not the lamp. In the sidebar it takes **a sixth of the row**, on the right, before the lamp; the menu-bar panel uses **a quarter**. Each state's colour: <br>• working and background: blue (they share one bar) <br>• needs you: arm red, the only bar that contains arm <br>• failed: amber-yellow, OKLCH h 81–96, clear of arm's 12–55° range <br>• done: green <br>• choose on return: lilac <br>• housekeeping: the safe ramp <br>• idle, outside, gone: quiet <br>Each ramp is a smooth blend inside its own family, with no visible bands, and flows on the clock. Under Reduce motion it holds a still pose that still shows its colour. |
| Lamps | Colourless: ink only, **15 px**, at the far right of the row. Each state has its own shape and motion: <br>• needs: bullseye, beats every 1.75 s <br>• working: ink disc with a bold field-coloured band rising through it, one band every 3.5 s <br>• background: the same band in a ring <br>• done: **a still tick** (no animation) <br>• failed: **a cross** with two soft dips every 3.5 s <br>• choose: a half fill that rises and falls like a tide <br>• housekeeping: dashed ring, slow fade over 14 s <br>• outside: open ring <br>• idle: ring <br>• gone: dim ring |
| Head bar | The one session in focus gets one continuous smooth bar at the top of the view. |
| Row line 2 | Claude's **spark** glyph (never the word "claude"), then the state words, then **either** a branch (branch glyph + name) **or** a worktree count (worktree glyph + n, with child rows naming each worktree and its diff). Never both. Then chips, a small context line with %, tokens spent in this chat, and age. Housekeeping reads just "dreaming". |
| Usage | 5H and 7D are a thin plain-ink line on a quiet track, not beads. Past 80 % only the leading end breathes. |
| Pearls | The bead material at 8–20 px, used for group identity, avatars, counts and tallies. A tally gives each session its own state colour, so arm marks only a needs-you session. |
| No duplicates | Each fact appears once per region. The chat head shows only the **path**, the head bar and its own controls (Loose ends, ⌘K, Panel). The lamp, pearl, name, state and worktree are already on the selected sidebar row. |
| Panel tabs | **Icons**: Trace, Outputs, Folder, Browser (a globe), Git, plus Terminal in the chat window. |
| **Centre: "Without a terminal"** | **Confirmed by the owner.** The centre is the conversation (section 06):<br>• TRACE folds into it, with reads, writes, errors and agents as compact cards;<br>• the terminal becomes a tab icon in the right panel;<br>• Diff lives inside Git as a Graph \| Diff mode. |
| Motion | One clock: T = 7 s.<br>• Loops run at 1.75, 3.5, 7 or 14 s, phase-locked to a 14 s epoch.<br>• One-shots take 109, 219, 437.5 or 875 ms.<br>• Curves are sine-family with no overshoot.<br>• Linear means work, sine means waiting, still means nothing to do.<br>• Reduce motion stills every loop. |
| Kept from CONTROL | The terminal (now a tab) is the work. Only arm means needs-you; danger means destructive. State reads by shape first, then motion, then colour. The menu-bar icon stays a still template image. CONTROL never presses Enter on its own. |

Section map of `index.html`:

| # | Section |
|---|---|
| 01 | masthead |
| 02 | colour: theory, families, contrast, CVD |
| 03 | motion: clock, every lamp and bar, transitions, CA recipes |
| 04 | form and type |
| 05 | the terminal-centred window, ARCHIVE + diff, rows |
| 06 | **without a terminal**: the confirmed centre plus its feasibility panel |
| 07 | menu bar, lock, icon, sheets |
| 08 | the H13 delta (B/Q) |

---

## PART 2: ENGINEERING (for the implementation session)

### 2.1 Tokens

- `engineering/tokens.css` is the final token set for both themes: Field is `:root`, Night is `[data-theme=night]`. It covers surfaces, inks, the two reds, the families (rose, green, blue, amber, lilac), the state-bar ramps (`--sb-*`), the lamp tokens, materials, radii and motion.
- `engineering/colour-proofs.md` holds the computed proofs: WCAG and APCA per text tier and surface, arm separation (ΔE OK), CVD pair distances and ramp smoothness. Print no colour number that isn't in it.
- `design/tokens.toml` is the single source for Swift, Ghostty, tmux, the Claude theme and `ctrl-tokens`. It still encodes v1 H13 (mono only, zero radius, 1 px hairlines, a warm `#100f0d` field). Moving it to Bloom is a rewrite gated on the owner's B ticks (B1–B4, B10–B13, B19–B23). Display P3 values are given for arm.

### 2.2 Drawing it in AppKit and Core Animation

`engineering/BloomMotion.swift` and `engineering/BloomBar.swift` are **sketches, not compiled code**. They show the shared clock (`Clock`, `Beat`, `Ease`, `Pace`) and the layer recipes.

- **Clock.** Every loop's `beginTime` is set from `CACurrentMediaTime()`, phase-locked to the 14 s epoch, so a lamp or bar added later lands in step.
- **Bead bar.** A `CAGradientLayer` holding a doubled tile of the state ramp, animated on `transform.translation.x` (linear, the state's period). It is masked by a still row of circles: a `CAReplicatorLayer` of discs, or a pattern mask. The beads never move; the colour travels.
- **Lamps.** One shape per lamp, drawn as a single path or mask over the lamp's own bounds (tick, cross, ring, bullseye). Never a separately positioned child inside a ring: at 15 px the two snap apart (`src/agent-ledger.md` rule 6). Working and background use one gradient layer with the band stops, animated on start and end point.
- **Cost.** Render-server animations only: no per-frame main-thread drawing, no `CADisplayLink` redraws, no blur. Pause or slow ambient loops when the window isn't key or is occluded (`engineering/motion-research.md` §1.4 and §7). The 4.17 ms frame gate is **unmeasured** for Bloom.
- **More detail.** `engineering/motion-research.md` has the full clock, easing and layer recipes (§1, §2, §6). Read its header note first: its lamp colours are superseded.

### 2.3 The chat-first centre: build option C

Full research, with file and line references, is in `engineering/chat-centre.md`.

- **Stream.** The CONTROL mod forwards `session.append` rows (main loop and subagents, by transcript `uuid`) and `turn.step` text deltas to the daemon over `mod.sock`, the way `tool.call` goes today. It only observes, so H14 and H15 are untouched. When a session opens, the daemon backfills from the transcript `.jsonl`, which uses the same `uuid`s.
- **Input.** The composer is a native field. **Send** pre-types into Claude's prompt box (`PreTyped`, `send-keys -l`, unchanged), then sends one Enter.
  - This **needs a spec change, H1a (B25)**, which the owner must tick: an Enter reaches a pane only from the owner's own Send, one per gesture, never queued or scripted. Restore, import, new-session and update flows still never press Enter.
  - Implement it as a separate `TmuxCmd::Submit` that only the Send path can build.
- **Needs-you.** First cut: a read-only card built from the hook payload, with **Answer in terminal**, and the centre flips to the Terminal tab. Answering with buttons waits until a throwaway `tmux -L ctrltest-<pid> -f /dev/null` test proves a bare digit picks and confirms Claude's dialog. That is **unverified**.
- **Unchanged.** tmux still owns every PTY (H4). Restore, update, `ctrl attach` and slash commands keep working because the real TUI is still there, one tab away.
- **Not Fakechat or channels.** They only carry what Claude chooses to `reply`: no tool calls, diffs or dialogs. They also show a dev-channel dialog at every launch.
- **Open before building:**
  - Do `thinking` blocks reach `session.append` with text, or redacted?
  - The H1a wording is the owner's call.

### 2.4 Found on the way (for `docs/LEDGER.md`)

- `design/tokens.toml [terminal]` still uses arm for the cursor and ANSI slot 9. This predates C-075.
- Spec §6's state table still lists working → arm and needs-you → reversed row.
- `design/v2/index.html`'s header comment still says "state never animates".
- Live re-sort ping-pong: `last_active` changes on every tool use (Q7).
- The mastheads of `design/review-02` and `design/mock` both say "Design review 01".

### 2.5 Rebuilding or editing the doc

- `src/`: shell (`tokens.css`, `base.css`, `lib.css`, `runtime.js`, `sprite.svg`, `reel.js`), one part per section in `src/parts/`, and the assembler.
  - `python3 design/bloom/src/assemble.py` writes `index.html`.
  - `python3 design/bloom/src/assemble.py --only <id>` writes a preview.
  - `design/bloom/src/gate.sh all` is the gate: lint, probes, 390 px overflow, size.
  - Headless Chrome only (`shotcdp.js`, `probe.js`).
- `src/briefs/`: the binding build briefs. `BRIEF-2.md` supersedes `BRIEF.md`, and its last section lists the round-4 amendments.
- `src/agent-ledger.md`: eleven builder rules learned from verifier catches. Every builder obeys them.
