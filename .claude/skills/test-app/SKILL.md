---
name: test-app
description: Test CONTROL's web and desktop UI against isolated development state, with Playwright or CONTROL's own browser panel. Use for browser verification, browser pairing recovery, and test fixtures. Use test-mobile for the iPhone app.
---

# Test CONTROL web and desktop

Verify with Playwright (headless) or CONTROL's built-in browser panel; no need
to ask first. For the iPhone app, use [test-mobile](../test-mobile/SKILL.md).

## Start the app

Reuse this task's healthy dev server. Otherwise run `vp run dev` from the
repository root and retain its terminal session. Use the worktree's ignored
`.control` state and read the actual ports and pairing URL from the dev-runner
output. Never run against `~/.control/userdata` or set `VITE_HTTP_URL` or
`VITE_WS_URL`.

Test with meaningful project and thread data. Read
[references/sqlite-fixtures.md](references/sqlite-fixtures.md) only when
inspecting or seeding SQLite. Stop the test server before direct fixture writes.

## Use the browser panel

Call `preview_status`, then `preview_open` if the browser panel is
closed. Navigate to the complete startup pairing URL once with
`preview_navigate`, then use `preview_snapshot` and the panel's interaction tools.
If the token was consumed or expired, run `node apps/server/src/bin.ts pair`
for a fresh one. Keep using the same tab.

## Verify and retain

Exercise the affected flow and capture the state that proves it works. Keep
the server, state, and panel available while the user inspects or iterates.
An assistant turn ending is not teardown. Stop only processes you started,
using retained terminal sessions or captured PIDs.

When sharing is requested, start with `vp run dev --share` and give the user
a fresh complete pairing URL that you have not consumed. Keep other credentials
out of screenshots, commits, and replies.
