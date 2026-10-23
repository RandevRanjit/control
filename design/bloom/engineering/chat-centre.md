# Chat-first centre: research for the owner's "wacky" idea

Date 2026-10-06. Researcher's answer to revision note (4): drop the terminal as the centre piece, draw a chat UI that still
drives Claude Code (fakechat / channels were the suggested pipe), and make the terminal a small tab next to BROWSER and GIT.

Short version, so you can stop here if you want:

- **Channels (fakechat) are the wrong pipe for the centre.** They carry one thing in (a message, framed as an outside event)
  and one thing out (whatever Claude chooses to pass to a `reply` tool). Tool calls, diffs, thinking, questions, plan
  approval and slash commands never reach the web page. Permission prompts can be relayed, but only tool approvals.
- **CONTROL already has a better pipe.** The CONTROL mod (`plugin/hooks/register.ts`) runs inside every Claude session, and the
  mod API has `session.append` (every conversation row: prompt, response block, tool use, tool result, notice, as Messages
  API blocks) and `turn.step` (the response as it streams). That is the whole chat, live, with no file tailing.
- **Recommendation: option C**, "chat view over the real TUI". Keep Claude's TUI running in tmux exactly as today; draw the
  centre as a conversation from the mod's stream; your composer pre-types into Claude's own prompt box; your Send is one
  keystroke you made. The terminal becomes the `TERMINAL` tab in the right panel, and the centre flips to it on its own for
  the few dialogs CONTROL can't draw yet. It needs one spec amendment (H1, Send), keeps every other hard rule, and keeps
  restore, update and resume working unchanged.
- The idea is a good one: the centre today repeats TRACE line for line (section 3). The chat-first layout gets rid of that
  repetition whichever pipe you pick.

---

## 1. What fakechat and channels actually give

### 1.1 The contract

Sources: <https://code.claude.com/docs/en/channels>, <https://code.claude.com/docs/en/channels-reference>, fakechat source
<https://github.com/anthropics/claude-plugins-official/tree/main/external_plugins/fakechat> (`server.ts`, 295 lines, read in full;
local copy `scratchpad/fakechat/server.ts`).

- A channel is an MCP server Claude Code spawns over stdio. It declares `capabilities.experimental['claude/channel']`
  and pushes `notifications/claude/channel` with `{content, meta}` (channels-reference, "Server options", "Notification format").
- **In:** the model receives `<channel source="plugin:fakechat:fakechat" chat_id="web" message_id="…" user="web" ts="…">text</channel>`
  (fakechat `server.ts:135-148`). It is an event in the conversation, not a typed user turn; the terminal shows it as
  `← fakechat · web: …` (channels, "Quickstart"). In the mod's terms its origin is `{ kind: 'channel', server }`, not
  `composer` (`plugin/types/claude-code/index.d.ts:8418-8426`).
- **Out:** Claude replies only by calling the server's `reply` tool (`text`, `reply_to`, `files`) or `edit_message`
  (`server.ts:67-92`). fakechat's own instructions to Claude: "Anything you want them to see must go through the reply tool —
  your transcript output never reaches the UI" (`server.ts:63`). The channels page says the same from the other side: "you
  see the inbound message in your terminal but not the reply text. The terminal shows the tool call and a confirmation".
- Notifications are fire-and-forget: "Claude Code doesn't acknowledge notifications … drops the events silently" if the
  channel isn't registered. Several messages that arrive while Claude is busy are delivered together on the next turn.
- fakechat specifically: Bun server on `127.0.0.1:8787` (`FAKECHAT_PORT`, `server.ts:20`), WebSocket `/ws`, `/upload` for
  files (saved to `~/.claude/channels/fakechat/inbox/`), one HTML page in a `<pre>` log. README: "There's no history, no search,
  no access.json, no skill. Single browser tab, fresh on every reload. This is a dev tool, not a messaging bridge." It does
  **not** declare the permission capability (`server.ts:62`).
- Launch: `claude --channels plugin:fakechat@claude-plugins-official`. Needs Bun, claude.ai or Console auth; research
  preview; flags hidden from `--help`; "syntax and protocol contract may change" (channels, "Research preview"). Events only
  arrive while the session is open.
- A channel CONTROL writes itself is not on the allowlist, so every launch needs
  `--dangerously-load-development-channels server:<name>`, which "first shows a full-screen warning dialog … Select **I am using
  this for local development** to continue" (channels-reference, "Test it"). That dialog needs a key from you at every start,
  every restore and every update restart. `allowedChannelPlugins` (which would list CONTROL's channel) is a managed setting
  documented for Team and Enterprise plans only; whether a Pro/Max machine can set it locally is UNVERIFIED.

### 1.2 What the web page never sees

| Thing                                                                                                                             | Reaches a channel UI?                              | Why                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude's normal answer text                                                                                                       | **No**, unless Claude also calls `reply`           | Only `reply` reaches the page (`server.ts:63`). You get a second, model-chosen summary, not the answer.                                                          |
| Tool calls (Read, Edit, Bash, Agent)                                                                                              | No                                                 | Nothing in the contract emits them.                                                                                                                              |
| Diffs / file writes                                                                                                               | No                                                 | Same. A `reply` can attach a file, nothing more.                                                                                                                 |
| Thinking                                                                                                                          | No                                                 | Same.                                                                                                                                                            |
| Permission prompts                                                                                                                | **Tool approvals only**, and only with relay (1.3) | fakechat doesn't declare it; a CONTROL channel could.                                                                                                            |
| AskUserQuestion menus                                                                                                             | No                                                 | Not relayed; terminal only. Under `-p` they are disabled outright (channels, "Quickstart" footnote).                                                             |
| Plan-mode approval (ExitPlanMode)                                                                                                 | No                                                 | Same.                                                                                                                                                            |
| Project trust, MCP consent, elicitation, the dev-channel warning                                                                  | No                                                 | "Project trust and MCP server consent dialogs don't relay" (channels-reference, "Relay permission prompts").                                                     |
| Slash commands, skills by `/name`, `@file` completion, Shift+Tab mode cycle, Esc to interrupt, `/rewind`, `/compact`, image paste | No                                                 | Text sent through a channel is message content inside a `<channel>` tag, not composer input. `/compact` typed in fakechat is just the word "/compact" to Claude. |
| Status line, spinner, elapsed time, tokens, context size, model                                                                   | No                                                 | TUI-only.                                                                                                                                                        |
| Background tasks, subagent progress, todo list                                                                                    | No                                                 | TUI-only.                                                                                                                                                        |

### 1.3 Permission relay, precisely

From channels-reference, "Relay permission prompts":

- Server declares `capabilities.experimental['claude/channel/permission']: {}`. Claude Code (v2.1.234+) sends
  `notifications/claude/channel/permission_request` with `request_id` (five letters a–z without `l`), `tool_name`,
  `description` (Claude's description, never the command; may be the constant `Run shell command`) and `input_preview`
  (arguments as JSON-shaped text; sanitised, 3,500 code points per field, credentials masked as `[REDACTED]`).
- The server answers `notifications/claude/channel/permission` with `{request_id, behavior: 'allow' | 'deny'}`. "Neither
  verdict affects future calls": there is no "yes, and don't ask again" through relay.
- The local terminal dialog stays open in parallel; whichever answer arrives first wins.
- Covers tool approvals (`Bash`, `Write`, `Edit`, and MCP tools, including the channel's own `reply` the first time).
  Not questions, plan approval, trust, MCP consent or elicitation.
- Requires the channel to be registered for the session (`--channels` or the dev flag), so the dev-flag dialog problem above
  applies to relay too.

**Rule check.** A CONTROL-drawn approve button that emits `behavior: 'allow'` is not the mod answering `tool.check` (H15 is
scoped to the mod, `docs/specs/2026-09-30-control-design.md:52`), but it is CONTROL sending an allow. If you ever take this
route, H15 needs a sibling rule: "an allow leaves CONTROL only from your own click on that one request".

---

## 2. Architecture options for a chat-first centre

Facts the options are measured against:

- Today: tmux owns every PTY (H4, spec `:41`); the centre is a Ghostty surface on `ctrl attach` (spec `:134`); restore
  pre-types `claude --resume <id>` and never presses Enter (H1, spec `:38`, `:143-150`); updates respawn verified Claude panes
  (H11, spec `:48`, `:152-161`); the mod reports `session.start/end`, `turn.start/complete`, `tool.call`, `session.measure`
  over `mod.sock` and gates `prompt.submit` for origins `composer` and `bridge` under a full lock (`plugin/hooks/register.ts:9`,
  `:68-121`); it never submits (H14) and never allows (H15) (spec `:51-52`).
- TRACE (F27) is `mapped`, not built (`docs/CHECKLIST.md:71`); the U2 spike draws it from fixtures. So the dedupe in
  section 3 costs nothing already shipped.
- The mod API already exposes the full conversation:
  - `session.append` "fires once per row a conversation of this session keeps (a prompt, a response block, a tool result,
    a notice), before it is stored", with `door`, `origin`, `uuid` (same as the transcript file) and `agentId` for subagents
    (`plugin/types/claude-code/index.d.ts:4196-4207`, `:10023-10050`). Blocks are Messages API blocks: `text`, `tool_use`,
    `tool_result`, `thinking`, `image` (`:567-600`).
  - `turn.step` streams the response chunk by chunk (`:1135-1139`), so assistant text can type itself out live.
  - `$.prompt.fill` puts a draft in Claude's prompt box without sending (`:2860-2872`); `$.prompt.read` reads it.
  - `$.prompt.submit` exists (`:2835-2847`) but H14 forbids it, and its origin would read as `plugin` to the model.
  - Hooks already give the needs-you payloads: `PermissionRequest` (`tool_name`, `tool_input`, `permission_suggestions[]`),
    `PreToolUse` AskUserQuestion/ExitPlanMode (`tool_input` with the questions and options), `Elicitation`
    (`docs/research/map-research.md:43-45`).

### Ranked

| Rank  | Option                                                                                                                                         | Fidelity                                                                                                                                                                                                                                                                              | What breaks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Effort                                                                                                                                                                                                                                        | Risk                                                                                                               |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **1** | **C. Chat view over the real TUI** (tmux unchanged; mod `session.append` + `turn.step` stream; composer pre-types; your Send is one keystroke) | Full. Claude still sees a typed `composer` turn; slash commands, skills, `@`, modes, Esc, `/rewind` all still work because the TUI is still there. Every row the transcript keeps reaches the chat.                                                                                   | H1's second sentence ("Text reaches a pane only as pre-typed literal input") needs an amendment for Send. Dialogs need either native cards that map to keys or a flip to the terminal. History before CONTROL opened needs a backfill from the transcript JSONL.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Medium. Mod: one more `on('session.append')` and `on('turn.step')` forwarding to `mod.sock`. Daemon: a per-session conversation store and push. App: a chat renderer (the TRACE row kit is most of it). No change to restore, update or tmux. | Low. If the chat view breaks, the terminal tab still runs everything.                                              |
| 2     | **B. Headless: `claude -p --input-format stream-json --output-format stream-json`, or the Agent SDK**                                          | Highest _structure_: every event typed; `canUseTool` gives approvals and AskUserQuestion as data you answer with buttons (approve-and-remember via `suggestions`); interrupt; subagent streams via `parent_tool_use_id`.                                                              | No TUI: built-in terminal commands (`/login` and the like) are gone, slash commands only partly work (skills yes; `/model` and friends as arguments only). tmux no longer owns the process (H4's world), so restore (§8), update restart (§9), H11's pane verification and the `ctrl attach` surface all need rewriting around a daemon-owned child. Plan mode, todo list, image paste, `@` completion, Shift+Tab, the mod's panes and toasts: all rebuilt or lost. Resume works (`--resume <id>` or the `.jsonl` path). **Auth:** the Agent SDK docs say third-party products may not offer claude.ai login; CONTROL is meant to ship (cask, Apache-2.0), so driving `claude -p` on other people's subscriptions is a policy question to settle first. | High. A second runtime beside tmux, plus a UI for everything the TUI gives free.                                                                                                                                                              | High. Feature drift every Claude release; the owner loses the real terminal for the very sessions CONTROL manages. |
| 3     | **A. A CONTROL-owned channel (fakechat-style) for input, plus hooks/transcript for the stream**                                                | Low for input. Your message arrives as an outside `<channel>` event, not your turn; Claude must call `reply` to answer (a second, chosen text, and a permission ask the first time); no slash commands. The stream side is fine because it comes from the mod/hooks, not the channel. | Dev-channel warning dialog at every launch, restore and update restart (needs your key each time; restore and AUTO update can't finish on their own). Lock: `origin.kind` is `channel`, not in `GATED` (`register.ts:9`), so a full lock would not stop it until the gate learns `channel`. Research preview: flags and protocol may change.                                                                                                                                                                                                                                                                                                                                                                                                            | Medium (a Bun MCP server) plus all of C's stream work anyway.                                                                                                                                                                                 | High: preview API, allowlist friction, and a model that treats your words as an external event.                    |
| —     | Remote Control (`bridge` origin)                                                                                                               | Would be ideal (your phone already drives a local session this way)                                                                                                                                                                                                                   | The protocol is claude.ai's, not open; CONTROL can't be a Remote Control client.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | —                                                                                                                                                                                                                                             | Not available.                                                                                                     |
| —     | fakechat as-is                                                                                                                                 | —                                                                                                                                                                                                                                                                                     | One page per session on one port, no history, no access control, no relay, `<pre>` log. A demo.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | —                                                                                                                                                                                                                                             | Not a product path.                                                                                                |

### Recommendation: C, in this shape

1. **Stream.** The mod forwards `session.append` rows (main loop and subagents, keyed by `uuid` and `agentId`) and
   `turn.step` text deltas to the daemon over `mod.sock`, the way `tool.call` goes today (`register.ts:105-116`). Observing
   only: H14 and H15 untouched. On opening a session the daemon backfills from `transcript_path`
   (`~/.claude/projects/<slug>/<uuid>.jsonl`, `map-research.md:31`, `:82`), which uses the same `uuid`s, so live rows
   join the backfill without duplicates.
2. **Input.** CONTROL's composer is a native text field. Typing stays in CONTROL; Send pre-types the text into Claude's
   prompt box (`PreTyped`, `send-keys -l`, unchanged) and then sends one Enter. Claude sees an ordinary `composer` turn, so
   the lock gate applies as it does today. `/` and `@` in the composer pass straight through to Claude's own completion
   by mirroring keystrokes, or (simpler first cut) CONTROL completes them itself from the skills list and the folder tree.
   **Spec change needed:** H1 gains "H1a: an Enter reaches a pane only from your own Send in CONTROL's composer, one per
   gesture, never queued, never scripted; restore, import, new-session and update flows still never press Enter". `PreTyped`
   stays as it is; the Enter is a separate `TmuxCmd::Submit` that only the composer's Send path can build.
3. **Needs-you.** The centre draws a card from the hook payload you already parse: permission (tool, command or path,
   the suggestion line), question (header chip, question, 2–4 options, "Type something"), plan approval. First cut: the
   card is read-only with **Answer in terminal** and the centre flips to the terminal tab for the dialog, then flips
   back on the next `session.append`. Later cut: buttons send the dialog's own keys (the owner's click). Whether Claude
   Code's dialogs accept a bare digit to pick and confirm is UNVERIFIED: test it in a throwaway `tmux -L ctrltest-<pid>`
   pane before building buttons.
4. **Terminal.** The Ghostty surface moves to a `TERMINAL` tab in the right panel's strip, next to `BROWSER` and `GIT`
   (your note 4). It is still the live `ctrl attach`, so tab 2's `bun dev` and anything else in tmux are one click
   away, and nothing about restore or update changes.

Why not A, even though you named fakechat: the thing you want is the centre showing _the work_, and channels only show
what Claude decides to `reply`. The pipe you actually need (every row of the conversation) is the mod, which CONTROL
already ships into every session.

---

## 3. The dedupe map

Today = what the D mock shows (`inventory.md:134-178` terminal, `:189-208` TRACE, `:127-132` footer).
Chat-first = where it lives in option C's layout. "Inline" means a row in the conversation; "collapsed" means a one-line
row that opens in place.

| Information                                                              | Today                                                                                                                     | Chat-first                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Your prompt                                                              | Terminal (`> …`) **and** TRACE turn header (`T14` + text)                                                                 | Inline: the turn opens with your prompt as its header, with `T14 · 23:41` beside it. Once, not twice.                                                                                                                                                                                                                                                              |
| Assistant text                                                           | Terminal only (`⏺ Both pages read release.size now…`)                                                                     | Inline, full width, streamed live from `turn.step`. The centre's main body.                                                                                                                                                                                                                                                                                        |
| Tool call, general                                                       | Terminal (`⏺ Read(app/page.tsx) ⎿ Read 212 lines`) **and** TRACE (`READ app/page.tsx 212 lines`)                          | Inline, collapsed: one 20 pt row per call in TRACE's grammar (kind label, path, meta). Consecutive reads fold to `READ 3 files ▸`.                                                                                                                                                                                                                                 |
| File read                                                                | Terminal **and** TRACE                                                                                                    | Inline collapsed row (above). The file name opens it in FOLDER / Quick Look.                                                                                                                                                                                                                                                                                       |
| Write / diff                                                             | Terminal (inline diff) **and** TRACE (WRITE row + mini diff) **and** DIFF mode                                            | Inline: WRITE row with its mini diff open for the live turn, collapsed in older turns. Whole-turn and whole-branch diff stays in the right panel's `DIFF`.                                                                                                                                                                                                         |
| Bash run                                                                 | Terminal only (TRACE leaves it out by your rule)                                                                          | Inline collapsed: `RUN bun run typecheck · no output`; expands to the output (first 20 lines, then "show all"). Long-running processes (dev servers) stay in the TERMINAL tab.                                                                                                                                                                                     |
| Bash output                                                              | Terminal only                                                                                                             | Collapsed under its RUN row; never shown by default.                                                                                                                                                                                                                                                                                                               |
| Errors                                                                   | Terminal (`⎿ Error: String to replace not found in file.`) **and** TRACE (ERROR row + note)                               | Inline: ERROR row with the sunken note open, never danger red (C10).                                                                                                                                                                                                                                                                                               |
| Agent / subagent                                                         | Terminal (`⏺ Task(explore: …) ⎿ Done (3 reads · 6.1k tokens · 14s)`) **and** TRACE (`AGENT explore · 3 reads, no writes`) | Inline collapsed: `AGENT explore · 3 reads, no writes ▸`; opens to the subagent's own rows (from `agentId`), indented on the rail.                                                                                                                                                                                                                                 |
| Thinking                                                                 | Terminal (`✻ Thinking…`, full only with ctrl+o)                                                                           | Collapsed: `thought for 6s ▸`. Opens to the thinking text when the block carries it (some models return it summarised or empty: render what comes).                                                                                                                                                                                                                |
| Permission prompt                                                        | Terminal dialog; sidebar lamp and `PERMISSION` chip                                                                       | Inline card at the foot of the conversation (tool, the exact command or path, the options). First cut: "Answer in terminal" + automatic flip. Sidebar lamp and chip unchanged.                                                                                                                                                                                     |
| Question menu (AskUserQuestion)                                          | Terminal dialog; sidebar lamp                                                                                             | Inline card: header chip, question, option list, "Type something". Same first cut as permissions.                                                                                                                                                                                                                                                                  |
| Plan approval                                                            | Terminal dialog                                                                                                           | Inline card showing the plan as Markdown; same first cut.                                                                                                                                                                                                                                                                                                          |
| Status line, mode (`⏵⏵ accept edits on`)                                 | Terminal bottom                                                                                                           | Composer: a mode chip on the left of the composer; model chip (`opus 5.5`) beside it.                                                                                                                                                                                                                                                                              |
| Spinner, elapsed, tokens this turn (`✻ Fetching… (41s · ↓ 3.1k tokens)`) | Terminal                                                                                                                  | The live turn's last row: `… fetching localhost:3000/download` with `41s · ↓ 3.1k` at right; the turn header meta counts up (`running · 23:41 · 31s · 3 writes · 1 error`).                                                                                                                                                                                        |
| Context size, 5H/7D, cost                                                | Sidebar footer (from `session.measure`); context only as a chip (`138K`)                                                  | Unchanged (footer). Context size also as a dim figure in the composer's right corner. Cost: dropped from the default view (you're on a subscription, so 5H/7D is the figure that matters); `session.measure` does carry `cost` as `/cost` totals it (`plugin/types/claude-code/index.d.ts:10566-10568`), so it can sit in the session's hover card if you want it. |
| Timing per turn                                                          | TRACE meta (`23:41 · 31s`)                                                                                                | Turn header meta, once.                                                                                                                                                                                                                                                                                                                                            |
| Unsent draft (from BROWSER "Add to prompt")                              | Terminal prompt box                                                                                                       | Composer, with the screenshot as an attachment chip. Still never sent for you.                                                                                                                                                                                                                                                                                     |
| TRACE as a tab                                                           | Right panel                                                                                                               | Retired as a separate list: its rows _are_ the conversation now. What stays in the right panel is `DIFF` (all writes against HEAD), `OUTPUTS`, `FOLDER`, `BROWSER`, `GIT` and the new `TERMINAL`. Optional: a slim turn index (T11–T14 ticks) on the conversation's rail to jump between turns.                                                                    |

---

## 4. Mock content for the chat centre (real strings only)

Session ORBIT-WEBSITE, `~/Projects/orbit-website`, worktree `site-v2`, model `opus 5.5`, mode `accept edits`.
Every string below is from `inventory.md:147-178` (terminal transcript) and `:189-208` (TRACE), or `BRIEF.md:333`
(TRACE live schedule). Where the two sources disagree, the note says which one is used. Nothing here is new content.

### T11 (folded)

```
T11  the hero spacing is off on mobile, put it on the 8 pt grid  ▸        22:58 · 6m · 6 reads · 3 writes · 1 agent
```

Meta from TRACE (`inventory.md:206`). Keep folded: the terminal's scrollback shows only 2 reads and 2 updates for it, so
there is no full row list to draw. Its last assistant line, if you show one under the fold:
`The hero sits on the 8 pt grid now; /download is next.`

### T12 (folded)

```
T12  tag v0.2.3 and attach the notarised DMG  ▸                           23:20 · 2m 10s · 4 reads · 1 write
```

TRACE only (`inventory.md:205`); no rows or reply exist anywhere. Keep folded.

### T13 (open, finished)

```
T13  /download says 11.2 MB but the DMG is 11.7                           23:38 · 18s · reads only
     READ   app/download/page.tsx        64 lines
     READ   app/admin/page.tsx           118 lines
     The DMG grew in 0.2.3 and the label is a hand-typed string in two places. Neither page reads the file.
```

### T14 (open, live)

Header: `T14  put the release size in one place so /download and /admin can't drift`
Meta: `running · 23:41 · 31s · 3 writes · 1 error` (counts up while live).

Rows in order (the TRACE stream, `inventory.md:203`; the terminal agrees and adds the RUN):

```
READ   lib/format.ts                22 lines
AGENT  explore · 3 reads, no writes ▸           (expanded meta from the terminal: Done (3 reads · 6.1k tokens · 14s))
WRITE  lib/release.ts               +2 −1
         10   export const release = {
         11     version: "0.2.3",
         12 −   size: "11.2 MB",
         12 +   bytes: 11_743_232,
         13 +   size: formatSize(11_743_232),
WRITE  app/download/page.tsx        +1 −1
         41 −   <dd>11.2 MB</dd>
         41 +   <dd>{release.size}</dd>
ERROR  app/admin/page.tsx           Edit
         String to replace not found in file.
READ   app/admin/page.tsx           118 lines
WRITE  app/admin/page.tsx           +3 −1          (no lines exist in any source: draw it collapsed, stat only)
RUN    bun run typecheck            no output      (terminal only, `inventory.md:167`; TRACE omits Bash)
```

The two context lines (10, 11) of the `lib/release.ts` diff come from the terminal (`inventory.md:161-162`); the
mini diff in TRACE shows only lines 12–13. Use whichever matches the row style you pick, but don't add more.

Assistant text after the rows:
`Both pages read release.size now. Checking /download on the dev server in tab 2.`

Live tail row:
`…  fetching localhost:3000/download` with `41s · ↓ 3.1k tokens` at right (terminal spinner `inventory.md:169`, TRACE
running row `:202`). If the mock loops on a timer, use TRACE's live schedule from `BRIEF.md:333`: events at 0.9, 2.2, 3.6,
5.0, 6.4, 7.6, 8.8 s, turn done at 10 s, loop at 14 s; place RUN and the assistant text after the 8.8 s row, before 10 s.

### Composer

- Draft (unsent, from the BROWSER viewer): `see @/tmp/ctrl-shot-0412.png (button.cta on /download): still says 11.2 MB`
  with an attachment chip `ctrl-shot-0412.png · button.cta · 212 × 40` (size from BROWSER, `inventory.md:227`).
- Left chips: `accept edits` (mode), `opus 5.5` (model, from the pane title `inventory.md:141`).
- Right: Send. A hint under it in the footnote voice: `Drafts stay drafts until you press Send.`

### Needs-you cards (for the other sessions' states, same strings as the terminal mock)

Permission (session with `git push`, `inventory.md:174-176`):

```
Bash command
git push origin launch-pipeline
Do you want to proceed?
1. Yes
2. Yes, and don't ask again for git push commands in ~/Projects/orbit
3. No, and tell Claude what to do differently (esc)
```

Question (`inventory.md:176-177`):

```
Which threshold should the rep detector use for curls?
0.8 g   ·   0.6 g   ·   Adaptive   ·   Type something.
```

First-cut button under either card: `ANSWER IN TERMINAL`. The card's footnote: `CONTROL shows this; Claude's own dialog takes the answer.`

### Right panel tab strip in the chat-first layout

`DIFF · OUTPUTS · FOLDER · BROWSER · GIT · TERMINAL` (TERMINAL as a glyph tab, as you asked), guest tab unchanged.
TERMINAL's body is the existing tab bar + Ghostty surface (`1 claude`, `2 bun dev`, `3 zsh`, `inventory.md:135-138`).

---

## 5. Open questions to settle before building (not design decisions)

1. Does a bare digit in Claude Code's permission dialog pick and confirm? Decides whether card buttons can answer
   (test in `tmux -L ctrltest-<pid> -f /dev/null`, H8).
2. Do `thinking` blocks reach `session.append` with text for the models you use, or redacted? Decides whether
   "thought for 6s ▸" can open.
3. H1a wording: your call. Without it, Send can only pre-type, and you press Enter in the TERMINAL tab.
4. If CONTROL ever ships beyond your own machine, option B's auth note matters; option C uses your own interactive
   `claude`, as today.

## Sources

- Channels: <https://code.claude.com/docs/en/channels> (Quickstart, Security, Enterprise controls, Research preview)
- Channels reference: <https://code.claude.com/docs/en/channels-reference> (Server options, Notification format, Expose a
  reply tool, Relay permission prompts, Test during the research preview)
- fakechat: <https://github.com/anthropics/claude-plugins-official/tree/main/external_plugins/fakechat> (`server.ts`,
  `README.md`, `.mcp.json`)
- Headless / stream-json: <https://code.claude.com/docs/en/headless>
- Agent SDK overview (auth note): <https://code.claude.com/docs/en/agent-sdk/overview>
- Agent SDK approvals and AskUserQuestion: <https://code.claude.com/docs/en/agent-sdk/user-input>
- Repo: `docs/specs/2026-09-30-control-design.md:38-53` (H1–H16), `:55-82` (processes, data flow), `:108-128` (state),
  `:130-141` (window), `:143-161` (restore, update); `plugin/hooks/register.ts:9`, `:68-121`;
  `plugin/types/claude-code/index.d.ts:1135-1139` (`turn.step`), `:2835-2884` (`$.prompt`), `:4196-4207` and
  `:10023-10050` (`session.append`), `:8368-8426` (PromptOrigin, `channel`); `docs/research/map-research.md:31`, `:43-45`,
  `:82`; `docs/CHECKLIST.md:71` (F27 mapped)
- Brief: `inventory.md:127-132`, `:134-178`, `:189-208`; `BRIEF.md:333`
