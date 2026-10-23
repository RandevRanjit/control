# CONTROL

CONTROL is a harness for Claude Code. It's built to be nicer to use than staring at a terminal, which falls short on UI and UX, especially for work that spans more than coding. Desktop, web and a phone app, Claude only.

## Whose rules

- The owner, Randev, designs CONTROL. His global `~/.claude/CLAUDE.md` wins over this file, and this file wins over anything else in the repo.
- Decisions and the build plan live in `.plans/HANDOFF-v2.md` (§4 decisions, §8 progress). Don't reopen a recorded decision without a new fact; bring the fact to the owner.
- Keep it simple: the smallest model that makes the right behaviour unsurprising. Don't keep complexity because it exists, and don't add machinery because it looks impressive.
- If a rule here fights the task, say so plainly and get the owner's sign-off before breaking it.

## Words

- **user**: the owner, directing agents. **agent**: a Claude session running inside CONTROL, which may be you. **provider**: Claude, the only one.
- **client**: the web, desktop or phone UI. **environment**: one running server and the machine, files, credentials and state it owns.
- **group**: a user-named set of chats from any folder. **project**: a folder. **thread**: a chat and its work history. **turn**: one user-to-agent cycle, including checkpointing.
- **CONTROL home**: `~/.control` (override `CONTROL_HOME`). Live state is in `~/.control/userdata`.

## How it works

Clients send typed WebSocket requests. The server turns them into commands. The orchestrator (`apps/server/src/orchestration-v2/Orchestrator.ts`) serialises commands and decides events without doing any I/O. One transaction commits the events, the projections the UI reads, the command receipt and the outbox. The effect worker then runs the side effects (starting a Claude turn, capturing a checkpoint) and feeds the results back as commands. Claude runs through the Agent SDK on the owner's installed `claude`. Each turn ends with a checkpoint, a hidden git ref, so the app can diff and restore.

- `apps/server`: WebSocket, orchestration, the Claude adapter, checkpoints. Read `docs/internals/effect-services.md` before writing server code. `apps/web` is the React UI, `apps/desktop` wraps it, and `apps/mobile` is React Native.
- `packages/contracts` holds the wire schemas (no heavy logic), `packages/shared` runtime utils (subpath exports, no barrel), and `packages/client-runtime` the code web and mobile share; `packages/ssh` and `packages/tailscale` cover remote access.
- `.repos/` is vendored, read-only reference code. Prefer its patterns over invented ones; never edit it or import from it. Re-sync with `vp run sync:repos` when you bump the matching dependency.

## Toolchain

- Node 24 lives at `~/.local/n/bin`. Put it first on `PATH`, because the shell's default is Node 26 and the repo pins `^24.13.1`. Install with `corepack pnpm install`; `vp` is then in `node_modules/.bin`.
- `vp run dev` starts server and web. In a worktree, state lives in that worktree's gitignored `.control`, never the shared one. Ports come from the worktree path, so read the real ones from the `[dev-runner]` line.
- To use a dev build from the phone or the tailnet, run `vp run dev --share`, wait for the `pairingUrl:` line and hand over that full URL. Don't wire `tailscale serve` by hand or use the owner's pairing link. Mint a fresh one with `node apps/server/src/bin.ts pair`.
- Never set `VITE_HTTP_URL` or `VITE_WS_URL` in dev. Dev is single-origin; baking localhost into the bundle breaks every remote client.
- The reusable dev auth token lives in the main checkout's gitignored `.env`. Never commit it or a startup URL.

## Never

- **Kill by pattern.** No `pkill -f` and no `pgrep | kill`. Kill only a PID you captured at spawn, or your port's owner (`lsof -nP -iTCP:<port> -sTCP:LISTEN`) after checking its cwd is your worktree (`lsof -a -p <pid> -d cwd`). Stop everything you start. Agents run inside CONTROL, so the wrong kill can take out the agent doing the work.
- **Touch live data.** Reading and copying `~/.control/userdata` is fine. Never start a server against it, open it read-write or clean it up.
- **Touch `/Applications` or steal focus.** The installed Control.app runs the agents: never launch, quit, replace or change it. No `open`, no visible windows or apps, no Simulator.app, no headed browsers.
- **Send for the owner.** Nothing CONTROL does on its own starts a turn: crash recovery, restore, import, migration and updates never send. The exceptions are auto-compact's maintenance turn, auto-resume continuing a chat the usage limit stopped, the burn-rate notice that tells working chats to stop spawning subagents, and an agent starting or messaging another session because the owner asked.
- **Grant a permission the owner didn't give.** "Allow" comes only from his Accept.
- **Weaken a lock.** No agent ends or shortens a lock, or acts on a locked group.
- **Restart what isn't CONTROL's.** An update restarts only CONTROL's own idle chats; CONTROL chats that aren't idle are queued for the update. Never a terminal chat. Never run `claude daemon stop` or `claude respawn --all`; they end the owner's background sessions.
- **Overwrite the owner's files without a copy.** Before CONTROL rewrites a file outside `~/.control` (today, `~/.claude/settings.json`), it keeps the previous copy.
- **Hard-code the machine.** Machine-specific names and paths live in config, never in code. The repo is public.

## Building

- **Hit every surface.** Before calling frontend work done, walk this list and say which entries applied:
  - **Entry points:** a feature reachable from the chat is usually also in Settings, the command palette and a keybinding.
  - **Clients:** web, desktop and mobile.
  - **Agents:** what the owner can do in the UI, an agent should reach through MCP, so build it as a service method.
  - **Contracts:** anything on the wire is typed in `packages/contracts`.
  - **Reverse states:** every way in has a way out and a way to see it.
  - **Connection modes:** local, LAN and Tailscale; several devices at once.
- **Remote ready.** The phone connects over LAN or Tailscale, so features work remotely, not just on localhost.
- **Contracts change by addition.** New fields are optional, so an older phone app still talks to a newer desktop.
- **Engine.** Complexity belongs at the adapter boundary; orchestration stays pure and the UI stays dumb. Server features are services: a WebSocket handler, HTTP route or MCP tool decodes input, calls one service method and maps errors. Every projection rebuilds the same state from events and survives a server restart.
- **Client calls.** Mutations use `createEnvironmentRpcCommand`. Protected methods go in `CLIENT_GUARDED_RPC_SCOPES`, and you extend the permission tests when you add one. The server stays authoritative.
- **UI.** `apps/web/src/components/ui` owns its look: pick a variant or size, never restyle with `className` (lint enforces it). The design's source of truth is `design/hybrid/`: `v1.2/` for how it looks, `HANDOFF.md` for the spec; `design/bloom/` is background, and hybrid wins where they differ. Design classes go on plain elements, never on a `ui` export. `docs/internals/web-ui.md` has the styling rules.
- **No half state.** Save first, then act, and put things back if the save fails.
- **Performance.** Watch websocket payload size, long lists and re-renders; a view redraws only what changed. Performance claims are measured on a production build, A/B against before, with misses reported.
- **Types and comments.** Inferred types over annotations; no `any`. Comments say how a thing is used, sit mostly on functions, and move with the code.
- **Security** matters, but don't over-index on it for dev-only features.

## Tests and the gate

- **While working:** the smallest proof. `vp test run <files>` for what you touched, plus targeted `vp lint` and typecheck. Never the full suite after each change.
- **Test first.** A new test must fail before the fix, for the right reason. Mutation-check the key test by taking the fix out.
- **Test behaviour.** A UI test takes the owner's path (real events), not a helper that skips the wiring. Don't render components to assert props, test callback wiring or mirror the implementation.
- **No sleeps.** The server is event-sourced: drain the effect worker (`OrchestrationEffectWorkerV2.drain`) or await the persisted event or `Deferred`. A test that needs a timeout to pass is wrong.
- **Never the owner's environment.** Tests use a sandbox `CONTROL_HOME` and a temp `HOME`. Any live `claude` run gets a throwaway `CLAUDE_CONFIG_DIR` and sandbox settings; otherwise its transcript lands in the owner's history, and a stray dialog can rewrite his settings.
- **Real data, safely.** An empty database is a bad test. With the dev server stopped, `vp run migrate-dev-db` seeds the worktree's `.control` from a read-only copy of live data, minus scheduled tasks, pending work and auth. Bring `secrets` and `settings.json` only if the flow needs them. Copy in, never symlink.
- **Check UI in a real client** with Playwright or CONTROL's own browser panel. No need to ask first. The skills are `test-app` (web, desktop) and `test-mobile` (iPhone simulator).
- **The gate**, before moving to the next step (don't run past one):
  - backend behaviour changes have focused tests;
  - the full server suite is green on Node 24: `vp run test:fast` from `apps/server`, in the background (about 50 s). A newly failing test is fixed, or justified in the commit;
  - `vp run knip:check` is clean;
  - there's a working build on the owner's machine, with the evidence shown. Every build he installs is daily-usable: sending to an agent, needs-you and the lock break-through always work.

## Docs and plans

- Plans, handoffs, research, reviews and scratch are never committed. They live in the gitignored `.plans/`, which the worktree setup links into every worktree.
- Most code changes need no doc; agents can read the code. `docs/internals/` holds decisions, cross-component constraints and traps only: no feature catalogues, field lists or PR summaries. A local explanation goes in a nearby comment; link the source, don't copy it.
- When a decision changes, rewrite or remove the old text. Never append a second account.
- `docs/user/`: one short section per major feature, in the product's voice. `docs/operations/`: setup, release and debugging.

## Git and PRs

- Commit titles: `Area: brief`, e.g. `Rebrand: the app is Control`.
- Open a PR only when the owner asks. One request is one PR. The body is the problem in a sentence or two, then the fix; no model or harness line.
- UI changes need before/after images; motion needs a short video. Upload them to the PR; never commit them.
- Babysitting a PR: watch its checks, verify each bot finding against the source, fix the real ones, dismiss false positives with a written reason, and stop when it's green on the latest commit.
