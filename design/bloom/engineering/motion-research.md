# Bloom motion system for CONTROL

> **Round-1 motion research (5 Oct).** Still valid for the clock (§1, incl. window and power states §1.4), easing (§2),
> Core Animation recipes (§6) and cost (§7). **Superseded** where it gives lamps colour, done a beckon or failed a
> ring-and-bar: see `../HANDOFF.md` Part 1 (lamps are ink only; done is a still tick; failed is a cross; colour lives
> in the bead bar). Paths like `brief/…` refer to the scratch build and are not in the repo.

Motion brief for `design/bloom/index.html`. This is an exploration: H13 is not edited, and §9 lists the H13 clauses this motion would amend.

**Read with:** `brief/bloom.md` (the analyst's frame corrections and translation) and the colour brief (draft at `brief/colour/out1.md`). Colour is theirs. I use their role names and draft values only to test the motion, and §10 lists where this brief disagrees with them.

**Sources:** the Bloom spec §6–7; contact sheet; `frame_stats.json`; `design/v2/index.html` D motion (CSS 619–650, legend 1205–1218); the spike's `app/Spike/Core/Lamp/{LampLayer,LampMotion,LampShape}.swift` and `Core/Frame/FramePacing.swift`; `design/tokens.toml`; spec §6 state table; `docs/specs/2026-10-01-sidebar-archive.md`; `brief/inventory.md` §2.

**Tested:**
- The CSS/JS kit runs headless in Chrome at fixed clock times: `brief/motion-kit/kit.html`, shots in `brief/motion-kit/shot_*.png`.
- The Swift kit typechecks under Swift 6 with strict concurrency on macOS 26, the project's settings: `brief/motion-kit/BloomMotion.swift`, checked with `xcrun swiftc -typecheck -swift-version 6 -strict-concurrency=complete -target arm64-apple-macosx26.0`, rc 0, no warnings.
- Nothing has run in the app yet, and there are no energy or frame numbers. §7.3 is the plan for measuring them.

---

## 0. What the reel teaches about motion

- **One loop, binary harmonics.** Colour repeats every 7 s and geometry every 14 s (bloom.md §1: the true loop is 14 s, two mirrored halves). Every period is 7 × 2ⁿ, and that is why the loop is seamless.
- **Space is sine, colour is linear.** No springs, overshoot or cuts.
- **Rest → stripes → rest is not keyframed.** It falls out of *linear time over a ramp that has plateaus*. A point on the flower sits in a plateau (the rest), then the bridge band passes (the stripes), then the next plateau arrives. CONTROL borrows that mechanism rather than the look.
- **Beads stay put and colour travels.** The bead arc at 1.4 s and 6.3 s is a run of same-hue beads that moves round the ring by phase offset. The petals themselves never move round.
- **Bridges, never blends.** Families meet through cream (bright) or navy and wine (the one dark junction). There is no two-stop crossfade anywhere in the reel.

---

## 1. The clock

### 1.1 The ladder

All durations are T = 7 s divided or multiplied by powers of two.

| Name | Duration | = | Kind | Used for |
|---|---|---|---|---|
| drift | 14 s | 2T | loop | Idle breath; housekeeping's core drift. 14 s is also the LCM of every loop, so the whole app lines up again every 14 s. |
| cycle | 7 s | T | loop | Working flow; Background{n} wave; choose-on-return tide; outside dip; loader colour; the lock screen's ramp (bloom.md motif 9). |
| breath | 3.5 s | T/2 | loop | Done beckon; failed stumble; loader breathe; focus ring; the leading usage bead from 80 %. |
| beat | 1.75 s | T/4 | loop | **Needs-you only.** This is the floor: no loop in CONTROL runs faster. |
| scene | 875 ms | T/8 | one-shot | Theme switch (2 × 437.5 ms); needs-you arrival bloom; done arrival; gone fade. |
| state | 437.5 ms | T/16 | one-shot | Lamp state change; row enter; live re-sort move; data tween (usage). |
| quick | 218.75 ms | T/32 | one-shot | Panel open; exits; press release; hover lift; pill slide; focus arrival; TRACE row grow; lamp change *into* needs-you; every Reduce-motion dissolve. |
| tap | 109.4 ms | T/64 | one-shot | Press down; row hover wash; selection; number swap; panel close. |

The old tokens map onto the ladder: `fast` 0.15 → tap or quick, `panel` 0.2 → quick. The old hover cap (≤ 150 ms) still holds.

### 1.2 One global phase

- **Epoch:** `epoch = now − fmod(now, 14)` with `now = CACurrentMediaTime()`. That is host time floored to a 14 s boundary. Host time is shared by every process on the machine, so the main window, the menu-bar panel and any helper land on the same phase grid without talking to each other. Today the spike's `LampLayer.epoch` is the launch instant. That is fine inside one process, but it can't line up across processes.
- **Every loop:** `beginTime = layer.convertTime(epoch − 14 + cue, from: nil)`.
  - `cue` is where the state's event sits inside its period (§3).
  - The −14 makes the loop, and every replicator instance, already running when the layer appears, so nothing "fills in".
- **Same state, same phase, on every row.** No per-row offsets, which would make a chaser running down the sidebar. Different states put their cues on different eighths of the wheel, so a full sidebar never throbs in unison.
- **Re-adding is free.** A recycled cell, a re-shown window or a theme swap re-adds the loop with the same `beginTime`, and it lands exactly in step. Nothing stores a phase.
- **Never wait for the beat.** One-shots (input feedback, a state change) start on the frame they're caused. Only their *loop* is phase-locked, and it is already running underneath when the one-shot ends. Never quantise a state change to the beat: that would add up to 1.75 s of latency to "needs you".
- **In the doc:** `document.timeline` is the epoch. After every render, each infinite animation gets `startTime = 0`. `?t=<ms>` pauses all of them at `currentTime = t` (§6.2, tested).

### 1.3 Frame-rate hints

| Use | `preferredFrameRateRange` | Why |
|---|---|---|
| Ambient loops | min 10, max 30, preferred 30 | A 3.5 s sine at 30 fps changes opacity by < 1 % a frame. Nobody can see that as steps. |
| Idle, Low Power Mode | min 8, max 15, preferred 15 | Idle's slope is ~0.13 % a frame at 15 fps. |
| Needs-you ripple, arrival | min 30, max 60, preferred 60 | The one loop that travels outward, and the hero. |
| Owner's input and theme scrim | the screen's top rate (`FramePacing.range`) | It must feel instant. |

Today the spike asks the screen's top rate for every lamp loop (`LampMotion.animation(range:)`). These numbers are hints, so check in Instruments that the panel really idles below 120 Hz when only lamps move (§7.3).

### 1.4 Window and power states

| Condition | What happens | Argument |
|---|---|---|
| Key window | Everything. | |
| **Visible but not key** (the owner in another app, CONTROL to the side) | **Every state loop keeps running at full.** Hover tracking is off (`.activeInActiveApp`). Selection and focus accents fade to the inactive tone over T/32 (macOS convention). The focus ring stops breathing. | This is the lamps' main job. The owner reads CONTROL from the corner of his eye while working elsewhere ("not get my focus stolen"). Pausing on un-key would blind the one view that matters. |
| **Occluded** (fully covered, another Space, minimised, ⌘H, screens asleep) | Remove every loop: it's the same still path as Reduce motion, minus the pose changes, because no one sees it. On becoming visible, re-add with `Clock.begin`, so everything re-enters in step. Running one-shots jump to their end. | Nobody can see it, and an animating layer keeps the render server compositing. Removal beats `layer.speed = 0`: it reuses the code path we already test (`LampLayer.set(still:)`), it is O(visible rows), and it leaves no paused timing state to upset `convertTime`. Signal: `NSWindow.didChangeOcclusionStateNotification` + `occlusionState.contains(.visible)`. |
| **Low Power Mode** (`ProcessInfo.isLowPowerModeEnabled`) or thermal `.serious` and above | The same motions with the frame hint at 15 fps. Idle's 14 s breath stills, because its ring already says idle. | Changing what a state's motion *is* on battery would change its meaning, but dropping frames doesn't. Slowing the periods is rejected: it breaks the harmonics and re-teaches every state. |
| On battery, normal mode | No change. | There is no evidence yet that a dozen ≤ 30 fps layer loops cost anything noticeable. Measure first (§7.3). |
| Reduce motion | Every loop stills to its pose (§3), and every one-shot becomes a dissolve of ≤ T/32. | C-073. |
| Live resize | No row or height animation (`inLiveResize`). Loops carry on. | The spike already removed row-height animations because rows trailed the resize (inventory §2.3). |

---

## 2. Easing and durations

| Token | CSS | `CAMediaTimingFunction(controlPoints:)` | Use |
|---|---|---|---|
| `sine` | `cubic-bezier(.37,0,.63,1)` | `0.37, 0, 0.63, 1` | Every spatial or opacity loop: two segments make one cosine. Also symmetric one-shots: state change, re-sort, the theme scrim. |
| `sineOut` | `cubic-bezier(.61,1,.88,1)` | `0.61, 1, 0.88, 1` | Arrivals of T/16 or longer: row inflate, needs-you ripple and arrival, data tweens, beckon rise. |
| `sineIn` | `cubic-bezier(.12,0,.39,0)` | `0.12, 0, 0.39, 0` | Departures: row deflate, panel close, the selection bar leaving. |
| `settle` | `cubic-bezier(.25,1,.5,1)` | `0.25, 1, 0.5, 1` | The owner's own hand, at T/32 or shorter: press down, hover in, panel open, pill slide, focus arrival. A fast start, so the response is felt on the first frame, and a soft landing. |
| `linear` | `linear` | `.linear` | Colour travel (ramp flow, loader hue, the chain wave's carrier) and anything that must never rest. |

- **No curve has a y outside [0, 1], so overshoot is impossible by construction.** `CASpringAnimation` and NSAnimation springs are banned.
- The spike's `.easeInEaseOut` (0.42, 0, 0.58, 1) is close but isn't the reel's curve. Swap it for `sine`.
- **The semantic rule: linear means work, sine means waiting, still means nothing to do.**
  - Working, Background{n}, housekeeping and the loader are linear: a machine doing something.
  - Needs-you, done, failed, choose, outside and idle are sine: a thing waiting, breathing.
  - Gone is still.

**Pairings:**
- Press: down at tap with `settle`, up at quick with `sine`.
- Hover: in at tap or quick with `settle`, out at quick with `sine`.
- Enter or exit: state with `sineOut` in, quick with `sineIn` out. Exits are shorter than entries, because the eye has already moved on.
- Panel: open at quick with `settle`, close at tap with `sineIn`.

---

## 3. Lamps: one motion per state

**How urgency is ranked.** Four levers, most salient first:
1. **Reach:** does the motion leave the lamp's footprint?
2. **Tempo:** the period.
3. **Channel:** scale > colour travel > fill level > opacity.
4. **Hue:** only needs-you is red.

Peripheral vision picks up motion and expansion far better than hue or small changes in lightness, so the loudest state must *move outward*, not just be red. That also keeps the column legible for red/green colour-blind eyes.

**Shapes.** The shapes are the visual brief's. The motion relies on them still telling every state apart when nothing moves. They are tested as placeholders in `kit.html`: filled bead, ring, ring + core, ring + bar, ring + half fill, open ring, and the bullseye ring for needs-you.

| State (rank) | Bloom motion | Period · cue | Curve | Channel and amplitude | Reduce-motion still (state survives as) |
|---|---|---|---|---|---|
| **Needs you** (1) | **Beat and ripple.** The bead swells fast and settles slowly. A soft ring of the same red leaves its edge every beat. It never dims. | 1.75 s · 0 | rise `sineOut` over T/16, fall `sine`; ripple `sineOut` | scale 1 → 1.16 → 1; halo scale 1 → 2.4, opacity .7 → 0. **The only loop that leaves its footprint.** | Filled red bead + a static outer ring at 1.7× (the bullseye: bloom.md motif 5) + the row's static red tint |
| **Failed** (2) | **Stumble.** Two soft dips, then stillness: arrhythmia, not alarm. | 3.5 s · 2.625 s | `sine` | Opacity 1 → .45 → 1 → .45 → 1 over the first T/4, then holds 1 | Ring + bar through it, in the failed colour |
| **Done, unseen** (3) | **Beckon.** The core swells quickly and settles slowly; it stops once seen (→ idle). On arrival it plays a single T/8 bloom (scale .92 → 1). | 3.5 s · 0.875 s | rise `sineOut` (T/16), settle `sine` | Core scale .6 → 1 → .6 | Ring + full-size core, in green |
| **Working** (4) | **Flow.** The chrome-safe ramp rises through a filled bead, one ramp per 7 s, and never rests: the reel's stripe state, held for good. | 7 s · 0 | `linear` | Colour travel (startPoint/endPoint, or translate in CSS); no scale or opacity change | Filled bead with the ramp frozen so a bridge band sits mid-bead: **the only striped bead** |
| **Background{n}** (5) | **Ring flow + wave.** The same rising ramp seen only in a ring (the working fill with its core out, as in D). Beside the name, a chain of n beads (cap 7, then `+k`) carries a highlight across once per 7 s. | 7 s · 0 | `linear` (ring), `sine` (wave) | Colour travel; the chain's highlight passes bead *i* at *i*·T/n | Striped ring + the chain at rest (count by shape) |
| **Choose on return** (6) | **Tide.** The half fill rises and falls inside the ring like liquid. | 7 s · 0 (crest at 3.5 s) | `sine` | Fill level 35 % ↔ 65 % (translate ±15 % of the lamp) | Ring + half fill at 50 % |
| **Housekeeping** (7) | **Drift.** A dim ring whose small core drifts slowly through the work colours: Claude's own chores, at half tempo. | 14 s · 0 | `linear` | Colour travel in the core only, opacity .8 | Dim ring + still core |
| **Outside** (8) | **Far light.** It holds, then dips once at the end of every cycle: alive, not ours. | 7 s · dip at 6.125–7 s | `sine` | Opacity .8 → .4 → .8 over T/8 | Open ring (a gap at the top), dim |
| **Idle** (9) | **Rest.** A breath you notice only if you look for it. | 14 s · 0 | `sine` | Opacity 1 → .82 → 1 | Ring, in the idle colour |
| Gone | No loop. "Dimmed": a T/8 fade to .35 and still. "Removed": the row deflates (§4.3). | n/a | `sine` | n/a | Dim ring |

### 3.1 Why each motion works

- **Needs-you out-shouts everything without being a strobe.**
  - It wins on all four levers. Its tempo is twice anything else's (no other loop runs faster than 3.5 s). It is the only motion that reaches outside the lamp. It is the only red. Its row carries a static red tint that reads even mid-cycle.
  - The bead **never goes dark**. The old 1 s step blink was red only half the time; a beat is red all the time.
  - It is not a strobe. It runs at 0.57 Hz, five times under WCAG 2.3.1's 3 flashes a second. It has no luminance step: the ripple fades out at its leading edge and the bead stays lit.
  - If the owner's feel test says it isn't loud enough, raise the reach (ripple 2.8×) before the tempo. Never go below 1.75 s and never step.
- **Working reads as flowing** because it is the one *continuous, linear* motion on a filled shape. It has no ease and no rest, so the eye reads a process rather than a breath. Its stripes come from the chrome-safe ramp, which has no red stop (colour brief `--ramp-safe-*`), so working can't be mistaken for needs-you.
- **Idle is nearly still:** a ±9 % opacity swell over 14 s, the reel's 98 % rest (bloom.md §3.5), on a 15 fps hint. Asked to choose, it would be the first motion to go (Low Power Mode does exactly that).
- **The tiers keep states apart even in peripheral vision.**
  - 1.75 s: needs-you only.
  - 3.5 s: the two "come and look" states, told apart by channel (the scale swell of done, the opacity double dip of failed).
  - 7 s: the busy and in-between states, told apart by shape and channel (filled flow, ring flow, tide, far dip).
  - 14 s: the quiet ones.
- **Cues on the wheel.** Needs-you beats at 0 and 1.75. Done's swell lands at 0.875 and failed's dips at 2.625, both between the beats. Outside dips at the end of the 7 s cycle. So the sidebar never pumps all at once.

### 3.2 Rules that apply to every lamp

- **At most one mover per row.** The lamp is the row's only ambient motion. Name, line 2 and the row tint never loop.
- **Transitions only for real changes.** A recycled cell for a different session sets its state with no transition. Only *the same session's* state change plays §4.1. The spike's `set()` compares `kind`, so a reused cell would otherwise play a transition it shouldn't.
- **The menu-bar icon stays a still template image** (H13 kept). Lamps inside the menu-bar panel join the same clock.

---

## 4. Transitions

### 4.1 Lamp state change: rest → stripes → settle

The old hue leaves through its bridge and the new state settles in with its loop already in phase. Total T/16 = 437.5 ms; T/32 into needs-you.

1. **Stripes** (first half, `sine`). A gradient three lamps tall, clipped to the bead and coloured bottom-to-top `[bridge…, old]`, rides upward. The old colour rises out of the bead and the bridge band passes through. This is the reel's break, run strictly along one bridge (bloom.md §2.4).
2. **Shape** (whole duration, `sine`). Ring ↔ filled inflates or deflates; the core scales.
   - CSS: one inset shadow whose spread is animated.
   - Core Animation: one `CAShapeLayer` whose `path` and `lineWidth` animate together, retargeting from the presentation layer.
3. **Settle** (second half, `sine`). The band dissolves (opacity 1 → 0) onto the new state, whose loop has been running in phase underneath since frame one.

**Which bridge.** The reel's topology gives every pair of families exactly one bridge (bloom.md §2.2):
- red ↔ green, green ↔ blue, and anything ↔ cream (working's family) pass through **cream**: a bright, ordinary change;
- blue ↔ red (idle, choose, house or outside ↔ needs or failed) passes through **navy and wine**: the system's single dark beat. That means "a calm session suddenly needs you" has its own drop.

**Rules:**
- **Into needs-you** runs at T/32. The red body is underneath from frame one, visible from about 110 ms and complete by 219 ms. The arrival bloom then plays once: halo 1 → 2.8×, opacity .6 → 0, T/8, `sineOut`. After that the beat carries on.
- **Out of needs-you:** the halo fades over T/32 before its loop is removed, so it never pops.
- **Interrupted:** retarget from the presentation values and start a new sweep from the colour currently showing. Never queue transitions.
- **The row echoes:** the row tint crossfades over T/16 to the new state's tint (bloom.md: about 6 % of the family). It holds for needs-you and fades back to field for everything else.
- **Reduce motion:** a T/32 dissolve (opacity .35 → 1) on the new pose. No sweep, no bloom.

### 4.2 A session going needs-you, end to end

| t | Lamp | Row | Elsewhere |
|---|---|---|---|
| 0 | The sweep starts (dark bridge if it came from blue); the body is already red | The red tint fades in over T/16 (`sineOut`); the name goes to semibold at once | |
| 219 ms | Red complete; arrival bloom starts | | |
| 1.1 s | The bloom ends; the beat and ripple continue (already in phase) | Tint holds | |
| 2 s calm | | | The menu-bar icon changes (spec: 2 s of calm), as a still template with no motion |

**The row does not move to the top because of needs-you.** Recency re-sort is the only thing that moves rows (§4.3).

### 4.3 Rows: enter, leave, re-sort

- **Enter** (new session, job, outside Claude, a chat brought back):
  - height 0 → row height at T/16 with `sineOut` (`NSOutlineView.insertItems(…, withAnimation: [.effectFade, .slideDown])` inside an `NSAnimationContext` at that duration);
  - text fades in from T/64;
  - the lamp scales .4 → 1 (`sine`) and arrives through the cream bridge into its first state.
- **Leave** (archive, end of session, forget):
  - the lamp sweeps through navy (a falling bridge);
  - the row collapses at T/32 with `sineIn` (`removeItems(…, withAnimation: [.effectFade, .slideUp])`).
- **Live re-sort** (spec: "the list re-sorts live, the moment the order changes"):
  - the moved row travels to its new place over T/16 with `sine` (`moveItem(at:inParent:to:inParent:)` in the same context; in the doc, FLIP, §6.2);
  - layout coalesces within one T/16 window, so a hook burst gives one move, not a shuffle. **State never waits; only position may lag, by at most 437 ms.**
- **Never during live resize. Under Reduce motion,** rows appear and disappear with a T/32 opacity dissolve and no height travel.
- Whether `NSOutlineView` takes its row-animation duration from the enclosing `NSAnimationContext` is to be **verified in the spike**. If it doesn't, its own ~0.25 s is acceptable.

### 4.4 Panels and bars

- **Right panel, ARCHIVE section, viewer split:**
  - **Lay out once, then animate the layer.** The final frame commits on frame one, so the terminal reflows exactly once (a SIGWINCH per frame would be expensive and ugly).
  - The panel's *content* layer slides 24 pt from its edge and fades in, at T/32 with `settle`. Close at T/64 with `sineIn`.
  - The short travel keeps it soft and stops a 440 pt sweep from dragging the eye.
- **Slide-up selection bar** ("N selected · ARCHIVE"): it rises 12 pt and fades in at T/32 with `settle`, and leaves at T/64 with `sineIn`. The "Archive anyway?" step replaces the bar's content with a T/32 crossfade.
- **Segmented controls and tab strip** (TURNS | DIFF, RECENT / NAME / FOLDER): the selected pill slides at T/32 with `settle`.
- **Sidebar selection** crossfades at T/64 with no slide: rows are far apart and re-sort live.
- **System sheets** (lock, restore, update) and the menu-bar panel's window keep AppKit's own animation. Don't fight them.

### 4.5 ARCHIVE row actions

| Action | Motion |
|---|---|
| **Archive** (⌘W, `x`, the bar, right-click) | The row leaves (§4.3). If ARCHIVE is open, the record enters at its top T/32 later, so the eye follows: out here, then in there. The ARCHIVE count crossfades at T/64 and its label swells once (scale 1 → 1.06 → 1, T/16, `sine`) to show where the row went. No flying rows. |
| **Archive anyway?** (a Claude mid-turn) | The only danger moment. The danger button presses like any control. Nothing pulses or shakes: urgency in a destructive confirm is pressure, not information. |
| **Bring back** (click) | The ARCHIVE row deflates (T/32, `sineIn`). The session inflates at the top of SESSIONS, T/32 later (T/16, `sineOut`), with its lamp slot empty until the daemon reports a state. Line 2 reads RESTORING over a three-bead chain whose highlight walks across (3.5 s, instance delay T/16). |
| **Forget** (right-click) | The row deflates through the navy bridge (T/32). It isn't destructive (the transcript stays), so it isn't danger-coloured. |
| **Search and sort** | **Nothing animates per keystroke**: there are 412+ rows and the work must stay in budget. Results swap at once; only the count crossfades (T/64). A sort change crossfades the whole list once (T/64). |
| **Hover** | Wash at T/64 with `settle`. No spatial hover on rows. |

### 4.6 Theme switch: Night ↔ Field without a flash

**The problem.** Crossfading every colour token per element sends the UI through mid-grey mush, where text and ground pass through equal lightness: an unreadable frame, then a jump. It's also thousands of transitions and layer colour animations at once.

**The rule: lightness moves one way only, through the bridge.**
- Night → Field passes through **cream**, the bright bridge. Lightness only rises: navy field (L ≈ .21) → cream (.89) → Field (.90).
- Field → Night passes through **navy**. Lightness only falls.
- Because lightness never goes up and then down, it can't flash.
- This is the reel's own rest → bridge → rest, at window scale.

**Sequence** (T/8 total; tested in the doc kit):
1. **Bloom out** (T/16, `sine`). A scrim of the bridge colour at .94 opacity grows from the toggle as a circle with a soft 64 pt front.
2. **Swap under cover.** Change the appearance with implicit actions disabled, then re-resolve every `CALayer` colour, because `cgColor` doesn't follow the appearance.
   - Running loops are untouched: they animate opacity, transform and gradient points, never `colors`.
   - The terminal palette (Ghostty config) and tmux theme swap here too. Hold the peak until the terminal surface has redrawn, or for T/64 at most.
3. **Dissolve** (T/16, `sine`). The scrim fades .94 → 0.

**Rules:**
- The scrim's colour is resolved to a literal before the swap, so it can't recolour mid-flight.
- When the system changes the appearance (not the toggle), the bloom starts from the top centre of the window.
- **Reduce motion:** the same three steps with no bloom: a T/32 fade up, the swap, a T/32 fade down.

---

## 5. Signature components

### 5.1 Bead-ring loader

- **Build:** 15 beads on a ring; `CAReplicatorLayer` with `instanceCount = 15` and `instanceTransform` = rotation of −2π/15 (clockwise when y is up).
- **Motion:**
  - `instanceDelay = 7/15 s`.
  - The bead's `backgroundColor` keyframes through the chrome-safe ramp over 7 s, linear. With the delay, the whole ramp sits round the ring once and turns once per 7 s.
  - A `transform.scale` breath of 1 → .92 over 3.5 s, `sine`, rides on top; with the same delay it makes two breath waves round the ring.
  - `beginTime = epoch − 14`, so all 15 instances are already running.
- **The beads never move; colour travels.** This answers bloom.md's "nothing rotates": nothing spins.
- **Where it goes:** indeterminate waits only, at 24 pt or larger. That means the Connecting, Daemon waiting and Restore pending empty states in the terminal column. Determinate progress uses the chain (§5.3).
- **No red:** the chrome-safe ramp only. The full signature ramp is for the lock screen and the app icon.
- **Reduce motion:** the wheel holds at phase 0 (a still hue wheel), and the empty state's words carry the wait.

### 5.2 Ramp-flow fill (working lamp, Background ring, housekeeping core, lock-screen band)

- **App:**
  - One `CAGradientLayer` holding the ramp **twice**, with stops at 0….5 and again at .5…1. It clips itself (`cornerRadius = w/2`, `masksToBounds`, no sublayers).
  - Animate `startPoint` and `endPoint` together, linear, one copy-length per period: start (.5, −2) → (.5, 0), end (.5, 2) → (.5, 4), y up. The visible 0…1 always lies inside start…end, so nothing clamps, and since the copies are identical the wrap is seamless.
  - One layer and one animation group, with no mask layer.
- **Why not animate `colors` or `locations`:**
  - `colors` ties the animation to the theme (rebuild on every swap) and interpolates in gamma sRGB.
  - `locations` needs extra stops to wrap.
  - Both re-render the gradient anyway.
  - For larger fills (the lock-screen band), use a doubled gradient translated inside a clipping container instead. A transform composites without re-rendering.
- **CSS:**
  - A pseudo-element 400 % tall carries `linear-gradient(to top, var(--ramp-safe)) 0 0/100% 50% repeat-y`, so one ramp is two bead heights.
  - Animate `transform: translateY(0 → -50%)`, linear, which is compositor-only.
  - The still pose is `translateY(-12.5%)`, which puts a bridge mid-bead (tested).
- **Bake the interpolation:**
  - Neither `CAGradientLayer` nor a CSS gradient in the default space interpolates perceptually.
  - The colour brief's stops already include plateaus and bridges. If any family-to-family glide looks muddy, add OKLab-interpolated intermediate stops to the token itself, so the doc and the app render the same thing.
  - Don't use `in oklab` in CSS only: the app can't follow it.

### 5.3 Bead-chain bars (5H / 7D), Background{n}, progress

- **Usage (5H 15 beads, 7D 14: bloom.md §3.3):**
  - Build: an empty-bead replicator under a filled-bead replicator. The filled one is masked by a plain layer whose width is `value × total`.
  - Change:
    - A new reading tweens the mask width over T/16 with `sineOut`.
    - The leading bead is the only striped one: its partial fill ends in a bridge.
  - Hot (≥ 80 %): the leading bead breathes (scale 1 → .92, 3.5 s). That says "the edge is moving" with no hue change. See §10.5 for the colour clash.
  - Reset (window rollover): the mask drains to 0 over T/16 with `sine`.
  - **At rest it is still.** Usage is data, not state, and it moves only when the data does.
- **Background{n}:**
  - Build: n beads, cap 7, then `+k`.
  - Motion: the replicator's bead `backgroundColor` runs base → highlight → base over the first 16 % of 7 s, with `instanceDelay = T/n`, so one highlight walks across the chain every 7 s. In CSS: `animation-delay: calc((i − n)·T/n)`.
  - Ending: when a task ends, its bead dissolves over T/16.
- **Progress** (restore, update, compaction):
  - 15 beads that fill in sequence, each inflating .6 → 1 at T/16 with `sineOut`.
  - A highlight wave runs only while progress advances. It stops when progress stalls, so a stalled job looks stalled.

### 5.4 Inflated press

- **Press:** the control's content layer scales to .96 at T/64 with `settle`, and back at T/32 with `sine`. It never goes past 1.
- **Depth at the same time:** the occlusion overlay deepens (navy inset alpha up about .15) and the cream rim dims. That is soft plastic squashing.
- **Implementation:** drive it from `isHighlighted` in `updateLayer()` on a standalone sublayer (anchor at the centre; a view's backing layer has its anchor at (0, 0) on macOS). Keyboard activation plays the same press and auto-releases after T/64.
- **Reduce motion:** no scale; only the occlusion and rim change (colour isn't motion).
- **Size:** on CONTROL's modest radii (6/10/14 pt, bloom.md §3.5), not 28 pt gloss pills. The press is the same at any size.

### 5.5 Hover lift

- **Buttons and chips:** translate up 1 pt and lift the top highlight (rim alpha up, about +.12). In at T/32 with `settle`, out at T/32 with `sine`.
- **Rows:** wash only (T/64). No spatial hover in lists, because many items moving under a sweeping pointer read as jitter.
- **Never** while the app is inactive.
- **Reduce motion:** brightening only.

### 5.6 Focus ring

- **Look:** a 2 pt ring, 4 pt outside the control, on a continuous-curve radius, in the focus colour (colour brief; not arm).
- **Arrival:** scale 1.08 → 1 at T/32 with `settle`, which draws the eye to where focus went.
- **Breath:** opacity 1 → .6 → 1 over 3.5 s with `sine`, while focus sits on a chrome control and the window is key.
- **Exception:** the terminal pane never gets a ring. Its cursor is its focus mark, and a ring there would breathe for hours.
- **App:** `focusRingType = .none` plus our own `CAShapeLayer`, added in `becomeFirstResponder` and removed in `resignFirstResponder`.
- **Reduce motion:** a static ring.

---

## 6. Implementation

### 6.1 CSS kit for the doc (verbatim from `brief/motion-kit/kit.css`, tested)

**Tokens it expects:** colour vars from the colour brief (`--lamp-{needs,working,bg,done,idle,choose,failed,house,outside}`, `--ramp-safe`, `--rs-a/b/c` for the loader's three plateaus, `--chain-empty`, `--chain-fill`, `--wave-hi`, `--cream`, `--navy`, `--wine`, `--puff`, `--puff-ink`, `--occl`, `--occl-deep`, `--rim`, `--rim-hi`, `--focus`).

**Markup:** `<span class="lamp st-working"><i></i></span>`. Size with `--d` on a selector more specific than `.lamp` (for example `.lamp.big{--d:24px}`) or inline.

**Gotcha found in testing:** a registered `@property` with `inherits:false` shadows any same-named variable children read. The scrim's radius is therefore `--scrim-r`, not `--r`, which the loader uses.

```css
:root{
  --T:7s; --T2:14s; --T-breath:3.5s; --T-beat:1.75s;
  --d-tap:109ms; --d-quick:219ms; --d-state:437.5ms; --d-scene:875ms;
  --e-sine:cubic-bezier(.37,0,.63,1);
  --e-out:cubic-bezier(.61,1,.88,1);
  --e-in:cubic-bezier(.12,0,.39,0);
  --e-settle:cubic-bezier(.25,1,.5,1);
}
/* Lamps: <span class="lamp st-…"><i></i></span>. The base style is the still pose (what Reduce motion
   shows); the motion layer only adds animation. Ring and fill are one inset shadow, so a state change
   inflates or deflates it (transition on box-shadow). Shapes are placeholders for the visual brief. */
.lamp{--d:10px;--rw:max(1.5px,calc(var(--d)*.2));position:relative;display:inline-block;flex:none;width:var(--d);height:var(--d);vertical-align:middle}
.lamp>i{position:absolute;inset:0;border-radius:50%;overflow:hidden;box-shadow:inset 0 0 0 var(--rw) var(--c);transition:box-shadow var(--d-state) var(--e-sine)}
.lamp>i::before{content:"";position:absolute;border-radius:50%}
.lamp::after{content:"";position:absolute;inset:0;border-radius:50%;pointer-events:none}
.lamp .sweep{position:absolute;left:0;right:0;bottom:0;height:300%;pointer-events:none}
.lamp .bloom{position:absolute;inset:0;border-radius:50%;background:radial-gradient(closest-side,#0000 50%,var(--c) 72%,#0000);pointer-events:none}

.st-needs{--c:var(--lamp-needs)}
.st-needs>i{box-shadow:inset 0 0 0 calc(var(--d)/2) var(--c)}
.st-needs::after{transform:scale(1.7);box-shadow:inset 0 0 0 1.5px var(--c);opacity:.45}
.st-working{--c:var(--lamp-working)}
.st-working>i{box-shadow:inset 0 0 0 calc(var(--d)/2) var(--c)}
.st-working>i::before,.st-bg>i::before{left:0;right:0;top:0;height:400%;border-radius:0;background:linear-gradient(to top,var(--ramp-safe)) 0 0/100% 50% repeat-y;transform:translateY(-12.5%)}
.st-bg{--c:var(--lamp-bg)}
.st-bg>i{-webkit-mask:radial-gradient(closest-side,#0000 calc(100% - var(--rw) - .5px),#000 calc(100% - var(--rw)));mask:radial-gradient(closest-side,#0000 calc(100% - var(--rw) - .5px),#000 calc(100% - var(--rw)))}
.st-done{--c:var(--lamp-done)}
.st-done>i::before{width:44%;height:44%;left:28%;top:28%;background:var(--c)}
.st-idle{--c:var(--lamp-idle)}
.st-failed{--c:var(--lamp-failed)}
.st-failed>i::before{left:24%;right:24%;top:calc(50% - var(--rw)/2);height:var(--rw);border-radius:var(--rw);background:var(--c)}
.st-house{--c:var(--lamp-house)}
.st-house>i::before{width:40%;height:40%;left:30%;top:30%;opacity:.8;background:linear-gradient(to top,var(--ramp-safe)) 0 0/100% 200% repeat-y}
.st-outside{--c:var(--lamp-outside)}
.st-outside>i{opacity:.8;-webkit-mask:conic-gradient(from 35deg,#000 290deg,#0000 0);mask:conic-gradient(from 35deg,#000 290deg,#0000 0)}
.st-choose{--c:var(--lamp-choose)}
.st-choose>i::before{left:0;right:0;top:50%;height:100%;border-radius:0;background:var(--c)}
.st-gone{--c:var(--lamp-idle)}
.st-gone>i{opacity:.35}

@media (prefers-reduced-motion:no-preference){
  html:not([data-motion=reduce]) .st-needs>i{animation:l-beat var(--T-beat) infinite}
  html:not([data-motion=reduce]) .st-needs::after{box-shadow:none;background:radial-gradient(closest-side,#0000 50%,var(--c) 72%,#0000);opacity:0;transform:none;animation:l-ripple var(--T-beat) var(--e-out) infinite}
  html:not([data-motion=reduce]) .st-working>i::before,
  html:not([data-motion=reduce]) .st-bg>i::before{transform:none;animation:l-flow var(--T) linear infinite}
  html:not([data-motion=reduce]) .st-done>i::before{animation:l-beckon var(--T-breath) infinite -2.625s}
  html:not([data-motion=reduce]) .st-failed>i{animation:l-stumble var(--T-breath) var(--e-sine) infinite -.875s}
  html:not([data-motion=reduce]) .st-house>i::before{animation:l-drift var(--T2) linear infinite}
  html:not([data-motion=reduce]) .st-choose>i::before{animation:l-tide var(--T) var(--e-sine) infinite}
  html:not([data-motion=reduce]) .st-outside>i{animation:l-far var(--T) var(--e-sine) infinite}
  html:not([data-motion=reduce]) .st-idle>i{animation:l-rest var(--T2) var(--e-sine) infinite}
}
@keyframes l-beat{0%{transform:scale(1);animation-timing-function:cubic-bezier(.61,1,.88,1)}25%{transform:scale(1.16);animation-timing-function:cubic-bezier(.37,0,.63,1)}100%{transform:scale(1)}}
@keyframes l-ripple{0%{transform:scale(1);opacity:.7}100%{transform:scale(2.4);opacity:0}}
@keyframes l-flow{to{transform:translateY(-50%)}}
@keyframes l-beckon{0%{transform:scale(.6);animation-timing-function:cubic-bezier(.61,1,.88,1)}12.5%{transform:scale(1);animation-timing-function:cubic-bezier(.37,0,.63,1)}100%{transform:scale(.6)}}
@keyframes l-stumble{0%,12.5%,25%,100%{opacity:1}6.25%,18.75%{opacity:.45}}
@keyframes l-drift{to{background-position:0 200%}}
@keyframes l-tide{0%,100%{transform:translateY(15%)}50%{transform:translateY(-15%)}}
@keyframes l-far{0%,87.5%,100%{opacity:.8}93.75%{opacity:.4}}
@keyframes l-rest{0%,100%{opacity:1}50%{opacity:.82}}

/* Bead-ring loader: 15 beads that never move; colour travels clockwise, one lap per 7 s.
   <div class="ring15"><i style="--i:0"></i>…<i style="--i:14"></i></div> */
.ring15{--r:14px;--b:5px;position:relative;width:calc(2*var(--r) + var(--b));height:calc(2*var(--r) + var(--b))}
.ring15>i{position:absolute;left:50%;top:50%;width:var(--b);height:var(--b);margin:calc(var(--b)/-2);border-radius:50%;
  transform:rotate(calc(var(--i)*24deg)) translateY(calc(-1*var(--r)));
  animation:r-hue var(--T) linear infinite,r-breathe var(--T-breath) var(--e-sine) infinite;
  animation-delay:calc((var(--i) - 15)*var(--T)/15);animation-play-state:paused}
@media (prefers-reduced-motion:no-preference){html:not([data-motion=reduce]) .ring15>i{animation-play-state:running}}
@keyframes r-hue{0%,8%{background-color:var(--rs-a)}20%,38%{background-color:var(--rs-b)}50%,58%{background-color:var(--rs-a)}70%,88%{background-color:var(--rs-c)}100%{background-color:var(--rs-a)}}
@keyframes r-breathe{0%,100%{scale:1}50%{scale:.92}}

/* Bead chain (5H / 7D usage). <div class="chain" style="--n:15;--v:.42"><i style="--i:0"></i>…</div>
   JS marks the leading bead .edge and the chain .hot from 80 %. */
.chain{--b:6px;display:flex;gap:3px}
.chain>i{position:relative;flex:none;width:var(--b);height:var(--b);border-radius:50%;overflow:hidden;box-shadow:inset 0 0 0 1px var(--chain-empty)}
.chain>i::before{content:"";position:absolute;inset:0;background:var(--chain-fill);transform-origin:left;
  transform:scaleX(clamp(0,calc(var(--v)*var(--n) - var(--i)),1));transition:transform var(--d-state) var(--e-out)}
.chain>i.edge::before{background:linear-gradient(90deg,var(--chain-fill) 55%,var(--cream))}
@media (prefers-reduced-motion:no-preference){html:not([data-motion=reduce]) .chain.hot>i.edge{animation:r-breathe var(--T-breath) var(--e-sine) infinite}}
@media (prefers-reduced-motion:reduce){.chain>i::before{transition:none}}
html[data-motion=reduce] .chain>i::before{transition:none}

/* Background{n}: a highlight crosses the chain once per 7 s. <div class="wave" style="--n:3">… */
.wave{--b:5px;display:flex;gap:3px}
.wave>i{flex:none;width:var(--b);height:var(--b);border-radius:50%;background:var(--lamp-bg)}
@media (prefers-reduced-motion:no-preference){html:not([data-motion=reduce]) .wave>i{animation:w-pass var(--T) var(--e-sine) infinite;animation-delay:calc((var(--i) - var(--n))*var(--T)/var(--n))}}
@keyframes w-pass{0%,16%,100%{background-color:var(--lamp-bg)}8%{background-color:var(--wave-hi)}}

/* Inflated control: press .96 in 109 ms, back in 219 ms, hover lift 1 px, focus ring that arrives and breathes. */
.puffy{position:relative;border:0;padding:7px 14px;border-radius:10px;background:var(--puff);color:var(--puff-ink);font:inherit;
  box-shadow:inset 0 -6px 12px var(--occl),inset 0 1px 0 var(--rim);
  transition:transform var(--d-quick) var(--e-sine),box-shadow var(--d-quick) var(--e-sine)}
.puffy:hover{transform:translateY(-1px);box-shadow:inset 0 -6px 12px var(--occl),inset 0 1px 0 var(--rim-hi);transition-timing-function:var(--e-settle)}
.puffy:active{transform:scale(.96);box-shadow:inset 0 -3px 10px var(--occl-deep),inset 0 1px 0 var(--rim);transition-duration:var(--d-tap);transition-timing-function:var(--e-settle)}
.puffy:focus-visible{outline:none}
.puffy:focus-visible::after{content:"";position:absolute;inset:-4px;border-radius:14px;box-shadow:0 0 0 2px var(--focus);pointer-events:none}
@media (prefers-reduced-motion:no-preference){html:not([data-motion=reduce]) .puffy:focus-visible::after{animation:f-in var(--d-quick) var(--e-settle) both,f-breathe var(--T-breath) var(--e-sine) infinite}}
@media (prefers-reduced-motion:reduce){.puffy:hover,.puffy:active{transform:none}}
html[data-motion=reduce] .puffy:hover,html[data-motion=reduce] .puffy:active{transform:none}
@keyframes f-in{from{scale:1.08}to{scale:1}}
@keyframes f-breathe{0%,100%{opacity:1}50%{opacity:.6}}

/* Theme scrim: the bridge colour blooms from the toggle with a soft 64 px front. */
@property --scrim-r{syntax:'<length>';inherits:false;initial-value:0px}
.scrim{position:fixed;inset:0;z-index:1000;pointer-events:none;opacity:.94;
  -webkit-mask:radial-gradient(circle at var(--x) var(--y),#000 calc(var(--scrim-r) - 64px),#0000 var(--scrim-r));
          mask:radial-gradient(circle at var(--x) var(--y),#000 calc(var(--scrim-r) - 64px),#0000 var(--scrim-r))}
```

### 6.2 Doc JS

What was tested:
- in `kit.html`: `Clock.lock`, `setLamp`, `arrive` and `setTheme` (phase 1, frozen);
- the transition geometry, checked frame by frame in `crop_sweeps.png`.

`enterRow`, `leaveRow`, `resort` and `openPanel` are **untested**.

```js
/* One clock: every infinite animation counts from the document timeline's zero; ?t=<ms> freezes them all there.
   Paused loops (the loader under Reduce motion) are left alone: setting startTime would unpause them. */
const Clock = {
  lock(t) {
    for (const a of document.getAnimations()) {
      const k = a.effect && a.effect.getTiming();
      if (!k || k.iterations !== Infinity || a.playState === 'paused' && t == null) continue;
      if (t == null) { if (a.startTime !== 0) a.startTime = 0; }
      else { a.pause(); a.currentTime = t; }
    }
  },
};
// Call Clock.lock() after every render and every state class change (a MutationObserver on class works).
const E = {sine: 'cubic-bezier(.37,0,.63,1)', out: 'cubic-bezier(.61,1,.88,1)', in: 'cubic-bezier(.12,0,.39,0)', settle: 'cubic-bezier(.25,1,.5,1)'};
const reduced = () => document.documentElement.dataset.motion === 'reduce' || matchMedia('(prefers-reduced-motion: reduce)').matches;
const FAMILY = {needs: 'red', failed: 'red', working: 'cream', bg: 'cream', done: 'green', idle: 'blue', choose: 'blue', house: 'blue', outside: 'blue', gone: 'blue'};
const bridge = (a, b) => [FAMILY[a], FAMILY[b]].sort().join() === 'blue,red'
  ? 'var(--wine) 0 14%, var(--navy) 24% 38%'      /* the one dark junction */
  : 'var(--cream) 0 38%';
function arrive(el) {                               // needs-you, once: wide bloom, then the beat carries on
  const b = document.createElement('b'); b.className = 'bloom'; el.append(b);
  b.animate([{transform: 'scale(1)', opacity: .6}, {transform: 'scale(2.8)', opacity: 0}], {duration: 875, easing: E.out, fill: 'forwards'})
    .finished.then(() => b.remove());
}
function setLamp(el, next) {                        // <span class="lamp st-idle" data-st="idle"><i></i></span>
  const prev = el.dataset.st;
  if (prev === next) return;
  const body = el.firstElementChild, from = getComputedStyle(el).getPropertyValue('--c').trim();
  el.classList.replace('st-' + prev, 'st-' + next);
  el.dataset.st = next;
  Clock.lock();                                     // the new loop joins in step
  if (reduced()) return void body.animate({opacity: [.35, 1]}, {duration: 219, easing: E.sine});
  const d = next === 'needs' ? 219 : 437.5;
  const s = document.createElement('b'); s.className = 'sweep';
  s.style.background = `linear-gradient(to top, ${bridge(prev, next)}, ${from} 62% 100%)`;
  body.append(s);
  s.animate([{transform: 'translateY(66.667%)'}, {transform: 'none'}], {duration: d / 2, easing: E.sine})
    .finished.then(() => s.animate({opacity: [1, 0]}, {duration: d / 2, easing: E.sine, fill: 'forwards'}).finished)
    .then(() => s.remove());
  if (next === 'needs') setTimeout(() => arrive(el), d);
  if (next === 'done') el.animate({scale: [.92, 1]}, {duration: 875, easing: E.out});
  if (next === 'gone') body.animate({opacity: [1, .35]}, {duration: 875, easing: E.sine});
}
async function setTheme(next, x = innerWidth / 2, y = 0) {   // origin: the toggle's centre
  const html = document.documentElement;
  if (html.dataset.theme === next) return;
  const s = document.createElement('div'); s.className = 'scrim';
  s.style.background = getComputedStyle(html).getPropertyValue(next === 'field' ? '--cream' : '--navy');  // a literal, fixed before the swap
  s.style.setProperty('--x', x + 'px'); s.style.setProperty('--y', y + 'px');
  document.body.append(s);
  const R = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + 64, still = reduced();
  if (still) s.style.setProperty('--scrim-r', '99999px');
  await (still ? s.animate({opacity: [0, .94]}, {duration: 219, easing: E.sine, fill: 'forwards'})
               : s.animate({'--scrim-r': ['0px', R + 'px']}, {duration: 437.5, easing: E.sine, fill: 'forwards'})).finished;
  html.dataset.theme = next;
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));   // the new theme has painted under the scrim
  await s.animate({opacity: [.94, 0]}, {duration: still ? 219 : 437.5, easing: E.sine, fill: 'forwards'}).finished;
  s.remove();
}
/* Rows: wrap each row as <div class="rw" style="display:grid;grid-template-rows:1fr"><div class="row" style="min-height:0;overflow:hidden">… (untested) */
function enterRow(w) {
  if (reduced()) return w.animate({opacity: [0, 1]}, {duration: 219, easing: E.sine});
  w.animate({gridTemplateRows: ['0fr', '1fr'], opacity: [0, 1]}, {duration: 437.5, easing: E.out});
  w.querySelector('.lamp')?.animate({scale: [.4, 1]}, {duration: 437.5, easing: E.sine});
}
function leaveRow(w) {
  const k = reduced() ? {opacity: [1, 0]} : {gridTemplateRows: ['1fr', '0fr'], opacity: [1, 0]};
  return w.animate(k, {duration: 219, easing: reduced() ? E.sine : E.in, fill: 'forwards'}).finished.then(() => w.remove());
}
function resort(list, apply) {                      // FLIP: lay out once, then let rows travel back to it
  const rows = [...list.children], top = new Map(rows.map(r => [r, r.getBoundingClientRect().top]));
  apply();
  if (reduced()) return;
  for (const r of rows) {
    const dy = top.get(r) - r.getBoundingClientRect().top;
    if (dy) r.animate({transform: [`translateY(${dy}px)`, 'none']}, {duration: 437.5, easing: E.sine});
  }
}
const openPanel = p => p.animate(reduced() ? {opacity: [0, 1]} : {transform: ['translateX(24px)', 'none'], opacity: [0, 1]},
                                 {duration: 219, easing: reduced() ? E.sine : E.settle});
```

### 6.3 AppKit and Core Animation recipe

The full kit is `brief/motion-kit/BloomMotion.swift`. It typechecks in Swift 6 strict mode for macOS 26. Contents:

| Group | Pieces |
|---|---|
| Timing | `Clock` (epoch, `begin`), `Beat` (ladder), `Ease` (curves), `Pace` (frame hints), `loop(...)` (a phase-locked `CAKeyframeAnimation` factory) |
| `BloomLamp` loops | `needs`, `flow`, `wave`, `beckon`, `stumble`, `tide`, `far`, `rest` |
| `BloomLamp` one-shots | `morph`, `sweep`, `arrive` |
| Components | `beadRing`, `UsageChain`, `PuffyButton` |
| Theme | `swapTheme` (the scrim) |
| Gating | `AmbientGate` (occlusion, Low Power, thermal, Reduce motion), `animateRows` |

**Layer recipe per lamp** (each lamp is at most 3 layers and at most 2 running animations):

| State | Layers | Loop keyPath(s) | Notes |
|---|---|---|---|
| Needs | `CAShapeLayer` body + `CAShapeLayer` halo behind it | body `transform.scale` keyframes; halo group `transform.scale` + `opacity` | Halo `contentsScale` = backing scale, or the ripple's edge blurs as it grows |
| Working | One `CAGradientLayer` (self-clipped), doubled ramp | group `startPoint` + `endPoint` | No mask, no sublayer |
| Background | Gradient + a ring `mask`, plus a `CAReplicatorLayer` chain | `startPoint`/`endPoint`; bead `backgroundColor` | The one lamp with a mask: one offscreen pass on a ~20 px target |
| Done | Ring shape + core shape | core `transform.scale` | |
| Failed | Ring + bar in one shape | `opacity` | |
| Choose | Ring + a clipping container + fill | fill `transform.translation.y` | |
| Housekeeping | Ring + small self-clipped gradient core | group `startPoint`/`endPoint` (14 s) | |
| Outside | Open-ring shape | `opacity` | |
| Idle | Ring shape | `opacity` (`Pace.calm`) | |

**How to drive it:**
- All of it is configured in the one `CATransaction` that applies a daemon View. Use `setDisableActions(true)` for model sets and explicit animations only.
- Set `actions = [key: NSNull()]` on standalone layers, as the spike does. Otherwise their implicit 0.25 s actions put off-clock motion everywhere.
- Every created layer gets `contentsScale = window.backingScaleFactor`, re-set in `viewDidChangeBackingProperties`. A `CAShapeLayer` or `CAGradientLayer` left at 1.0 draws soft on Retina.
- Beads are anti-aliased circles, so the old device-pixel snapping of squares is unnecessary. Lamp *centres* still land on device pixels so a breathing bead doesn't shimmer at rest.
- **Flipped hosts:** the spike's cells are flipped. Check the flow direction (colour must rise) and the replicator's rotation sign there, and negate if colours sink or the wheel turns anticlockwise. Both are one sign.

---

## 7. Cost

### 7.1 Where the work happens

- Every loop is a render-server animation, committed once on a state change. **No main-thread work happens per frame.** The only main-thread cost is adding or removing an animation in a View-apply transaction, which is microseconds even for 50 rows.
- The render server's work per frame is compositing the damaged rectangles. Those are 10–25 pt per lamp, the loader, and the chains' edge bead. The theme scrim is the only full-window composite, and it lasts at most 875 ms.
- Expected to stay well inside the spike's 4.17 ms gate, because it adds nothing on the main thread per frame. **Unmeasured.**

### 7.2 What to avoid (each one breaks the budget or energy)

- **Driving motion from the CPU.** No `CADisplayLink`, `NSTimer` or `Task.sleep` loops driving colours or positions, and no `draw(_:)` per frame. Each one wakes the main thread at 120 Hz and eats the 4.17 ms budget.
- **Blur and filters.** No animated `shadowRadius`, `shadowOpacity` or `shadowPath` (an offscreen pass plus a blur every frame). No `filters`, `backgroundFilters` or Core Image on moving layers. No `NSVisualEffectView` behind or under moving content: the blur re-renders every frame. Bloom has no blur anyway.
- **Gradient colour animation.** No animating `colors` on gradients: it re-renders, interpolates in gamma sRGB, and has to be rebuilt on every theme swap.
- **Rasterising moving content.** No `shouldRasterize` on a layer whose content animates (it re-rasterises every frame). It is fine on a static, complex stack that only moves by transform, such as a pressed button.
- **Masks in loops.** No `mask` + `masksToBounds` stacks on looping layers beyond the one Background ring. Prefer self-clipping (`cornerRadius` on a layer with no sublayers).
- **Path animation in loops.** No `path` animation in a loop: it re-tessellates every frame. It is fine for one-shot morphs at lamp size.
- **Layout animation.** No row, height or layout animation during live resize or scroll. Nothing animates per keystroke in ARCHIVE search.
- **Too many transactions.** Not one transaction per hook event. Batch per View apply.

### 7.3 Measurement plan (before anyone calls this cheap)

1. **Spike `--stress`:** add the Bloom lamp layers and re-run the 200-push hook burst and the fast diff scroll, with all nine states visible. The gate stays at p95 ≤ 4.17 ms.
2. **Energy:** with 12 lamps, Night, 60 s each, compare (a) all still, (b) Bloom at `Pace.ambient`, (c) Bloom at the top rate. Instruments' Energy Log or `sudo powermetrics --samplers gpu_power -i 1000`. Repeat with all 12 idle (the overnight case). The owner judges the gaps.
3. **Display rate:** Instruments' Core Animation FPS or Quartz Debug, to confirm the panel drops below 120 Hz when only ambient loops run. If it doesn't, the 30 fps hint buys nothing and the occlusion and Low Power rules carry the saving alone.

---

## 8. Motion principles and don'ts (for the doc, in the doc's voice)

### 8.1 Principles

1. **One clock.** Every loop runs at 1.75, 3.5, 7 or 14 s and counts from the same instant, so the window breathes as one object, the way the flower's turn and sway always line up.
2. **Motion says state.** Loops live only on things that have a state: lamps, loaders, the edge of a usage bar. Chrome moves only when you touch it, and stops when it's done.
3. **Linear is work, sine is waiting, still is nothing to do.**
4. **Urgency is tempo plus reach.** The faster and further a thing moves, the more it wants you. Needs-you alone beats at 1.75 s, and alone reaches past its own edge.
5. **Rest, stripes, settle.** Every change of state passes through its bridge once: cream for an ordinary change, navy and wine when calm turns to "needs you".
6. **Nothing steps, nothing bounces.** No blinks, no springs, no overshoot; every curve lands the way the flower does.
7. **Never wait for the beat.** A change shows on the next frame; only its loop falls into step.
8. **Still is a full answer.** With Reduce motion, every state keeps its shape and colour, and every transition becomes a short dissolve.

### 8.2 Don'ts

- **No hard-step blinks.** D's needs-you blink, failed double blink and outside dip retire. Turn the terminal cursor's blink off too (§10.9): it would be the last strobe in the window.
- **No loop faster than 1.75 s**, and nothing anywhere near 3 Hz.
- **No springs, overshoot or rubber-banding** in our own motion. Leave the system's scroll elasticity alone.
- **No per-row phase offsets.** Same-state lamps pulse together; no chasers down the sidebar.
- **No red in motion except needs-you.** The loader, the working flow and the chain are red-free. The full signature ramp appears only on the lock screen and the app icon.
- **No ambient motion on chrome:** not on panels, headers, the wordmark, backgrounds, empty states or text. No bobbing or swaying.
- **Nothing rotates.** Loader beads stay put and colour travels.
- **No animation that delays data.** No queued reveals in a burst (coalesce instead), no waiting for a beat, no animating ARCHIVE results while typing.
- **No odometer or rolling digits.** Numbers swap, with at most a T/64 crossfade.
- **No full-window flash.** A theme change moves lightness one way, through one bridge.
- **No height animation during live resize.**

---

## 9. H13 clauses this motion would amend (for the closing H13-delta panel)

| H13 / C-073 clause | Bloom motion | Change |
|---|---|---|
| "every lamp state has its own motion, idle included" | Kept: nine states, nine motions (§3), with new motions | Amend C-073's motion table |
| "motion says state and nothing else" | Kept for **ambient** motion. Amended: one-shot motion also answers the owner's input or a state change (press, hover, focus, panels, rows, theme), and every one-shot ends within 875 ms | Amend |
| "macOS Reduce motion stills them" | Kept, and extended: one-shots become dissolves of ≤ 219 ms; the theme swap dissolves; the loader freezes as a still wheel | Extend |
| D's stepped motions (needs-you 1 s blink, failed 2 s double blink, outside 6 s dip) | Replaced: nothing steps | Amend |
| "the menu bar icon is a template image with state by shape" | Kept: still | none |
| Tokens `[motion] fast = 0.15, panel = 0.2, easeInOut` | The T/2ⁿ ladder (109, 219, 437.5, 875 ms) and the sine family | Amend `tokens.toml` (controller) |
| Inventory: "only lamps and the TRACE stream move" | Lamps, TRACE, the loader, chain edges and the focus ring loop. Interaction motion is new | Amend |
| New law candidates | One clock (periods 1.75/3.5/7/14 s, phase-locked); no loop faster than 1.75 s; linear = work, sine = waiting | Add |

---

## 10. Conflicts and open questions (for synthesis and the owner)

1. **Needs-you tempo.** bloom.md §3.2 has a 3.5 s breathe (core L ±.04, rim alpha). This brief has a 1.75 s beat plus ripple. A ±.04 L change is below what peripheral vision catches, and the request is for needs-you to out-shout everything. The bullseye form (bloom.md motif 5) is kept as the shape and the still. **Recommend the beat.**
2. **Done.** bloom.md: a single 875 ms bloom, then still apart from a 7 s rim glint. This brief keeps that arrival and adds a 3.5 s beckon, because done-unseen ranks second in the icon order and the owner's workflow is fire-and-forget: done has to be findable among working sessions. If it feels too busy, fall back to bloom.md's glint.
3. **Failed and choose-on-return.** bloom.md has them still. C-073 says every state moves, so this brief gives them a stumble and a tide. Owner's call (it's H13).
4. **Transition length.** bloom.md: 875 ms. This brief: 437.5 ms (219 ms into needs-you). Hooks can flip states every few hundred ms; at lamp size, 437.5 ms still shows three bands of about 145 ms each, which is enough to read as stripes. The bridge topology is bloom.md's. **Recommend 437.5 ms.**
5. **Usage past its threshold.** bloom.md §3.3 shifts the filled beads toward crimson through wine. **That breaks the two-red law** (red means needs-you only, and the limit isn't needs-you). Motion's answer is the breathing leading bead; any warning hue goes to the colour brief, and must not be arm.
6. **The loader vs "nothing rotates".** Here the beads never move and only colour travels, it is used only for indeterminate waits, and it is red-free. If even travelling colour reads as spinning, use the linear 15-bead chain with a wave instead.
7. **Live re-sort ping-pong** (outside my area; LEDGER candidate). `last_active` updates on every tool use, so two working sessions will swap places at the top on each other's tool calls. Motion softens it (one 437 ms move per coalesced window) but can't fix it. Re-sorting on turn start, or a minimum dwell, would. Owner's call.
8. **Locked groups (K8).** Folded locked groups become a chain of lamp beads (bloom.md §3.3). Should their lamps still while locked (do-not-disturb), apart from needs-you, which breaks through anyway? This brief suggests yes. Owner's call.
9. **Terminal cursor blink** (outside my area; `tokens.toml [terminal]`). Ghostty's blink is a hard step at roughly 1–2 Hz. Propose `cursor-style-blink = false`, so the window has no strobe.
10. **Puffy controls.** bloom.md bans 28 pt gloss pills. The press (.96), hover lift and focus ring here are written for CONTROL's modest radii and don't need the gloss.
11. **Spike deltas to carry when Bloom is built** (not now): `LampMotion` swaps `.easeInEaseOut` for sine; the lamp loops use `Pace.ambient` instead of the screen's top rate; `LampLayer.epoch` floors to 14 s; and the `set()` path needs the "transition only for the same session" guard (§3.2).

---

## 11. How the doc should show motion (builder notes)

The doc's job is to let the owner *judge* motion, so give him controls rather than prose:

- **Global controls** in the header, next to the Night/Field toggle (which uses the §4.6 scrim from its own position):
  - a phase scrubber 0–14 s that pauses every loop at that time;
  - rate ¼×, ½× and 1× (`playbackRate`), for judging transitions in slow motion;
  - a Reduce-motion toggle (`data-motion="reduce"`).
- **URL parameters** for headless shots, as v2 does: `?t=<ms>`, `?motion=reduce`, `?theme=night|field`.
- **M1 The clock.**
  - A wheel: four concentric orbits (14, 7, 3.5 and 1.75 s), each carrying one bead, all phase-locked, so you can see the harmonics line up every 14 s.
  - Each state's cue drawn as a tick on the 7 s orbit.
  - A strip comparing a reel frame sequence (the contact sheet's first row) with a working lamp's flow on the same clock.
- **M2 Easing.** An SVG plot of each of the five curves, with a dot running along it on a T/2 loop. Label each with both its `cubic-bezier` and its `CAMediaTimingFunction` points, and its uses.
- **M3 Lamps.** One row per state, with:
  - the lamp live at 24 pt;
  - the lamp live at actual size;
  - the Reduce-motion still;
  - name, period and cue, and a one-line description in the owner's voice (below);
  - the CA keyPath, in mono.
- **M4 Transitions.**
  - A sidebar of 5 rows running a script on the clock: idle → working (1.75 s) → needs-you (5.25 s) → working (7 s) → done (8.75 s) → idle (12.25 s), plus a row entering and a row leaving every 14 s.
  - Buttons to fire any A → B change.
  - The theme switch demo is the header toggle.
  - An ARCHIVE strip showing archive, bring back and forget.
- **M5 Components.**
  - The loader in a "Connecting" empty state.
  - The usage chains with a slider for the value (cross 80 % to see the edge breathe).
  - The Background chain.
  - Puffy buttons (tab to them to see the focus ring).
  - The hover wash on rows.
- **M6** Principles, don'ts, cost notes, and the motion rows of the H13-delta panel.

**One-line lamp descriptions** (owner's register, for M3):

| State | Line |
|---|---|
| Needs you | Beats every 1.75 s and sends a soft ring past its own edge. The only red, the only thing that reaches outside itself, and it never goes dark. |
| Working | Colour rises through it, steadily, one ramp every 7 s. It never rests. |
| Background (n) | The working flow in a ring; beside the name, a light walks along n beads once every 7 s. |
| Done, unseen | Every 3.5 s the core swells in a beat and settles slowly. It stops once you've looked. |
| Failed | Two soft dips every 3.5 s, then still: a stumble, not a blink. |
| Choose on return | The half fill rises and falls like a tide, every 7 s. |
| Housekeeping | A dim ring whose core drifts slowly through the work colours, once every 14 s. |
| Outside | Holds, then dips once at the end of every 7 s: alive, not ours. |
| Idle | A 14 s breath, barely there. |
| Reduce motion | Every lamp stills into its shape: the ring round needs-you, the stripes in working, the half fill, the open ring. |
