---
name: test-mobile
description: Test CONTROL's iPhone app on a simulator through the Device panel and its returned AgentDevice command. Use for mobile verification, native-client builds, Metro launch, and mobile pairing against isolated development state.
---

# Test CONTROL on iPhone

## Open the device

Call `device_list`, then `device_open` with the selected host and device IDs.
CONTROL boots the simulator and shows its live stream in the Device panel. Follow
its returned `quickStart`, using the exact `agentDevice.command` and all
`targetArgs` on every operation. Use `device_screenshot` to inspect the screen.

If the device tools or the selected device are unavailable, report the blocker
and stop verification. Do not install or switch to another automation system.

## Use an isolated backend

Reuse this task's healthy backend. Otherwise run `vp run dev` from the
repository root, retain its terminal session, and read the actual backend port
from the dev-runner output. Use the worktree's ignored `.control` state. Never
run against `~/.control/userdata`. The browser panel is not required here.

Test with meaningful project and thread data. Read the shared
[SQLite fixture reference](../test-app/references/sqlite-fixtures.md) only
when inspecting or seeding SQLite. Stop the test server before fixture writes.

## Launch the dev app

From the checkout being tested, run:

```bash
node scripts/mobile-native-client.ts ensure ios <device-id>
```

This reuses a matching native client or builds and installs one. Authorized
mobile verification includes that build step unless the user prohibits it.

Start `vp run dev:client` from `apps/mobile`, or reuse a healthy Metro belonging
to this checkout. Open its printed development-client URL with AgentDevice
`open io.github.randevranjit.control.dev <url>` and all returned target arguments.
The simulator must be able to reach both Metro and the isolated backend.
Append `&disableAutoLaunch=1&disableFab=1` to the development-client URL query
when developer chrome would obscure screenshots or taps; the SDK 58 dev client
applies these preferences before the app loads.

## Pair and verify

Use the helper from the repository root, with the returned executable and target
arguments stored in `agent_device_command` and the Bash array
`agent_device_target_args`:

```bash
.claude/skills/test-mobile/scripts/pair-client.sh \
  <server-port> <base-dir> http://127.0.0.1:<server-port> \
  "$agent_device_command" "${agent_device_target_args[@]}"
```

It issues a fresh credential and opens the dev app's existing pairing route
through AgentDevice. For a remote backend, pass its reachable origin instead of
`http://127.0.0.1:<server-port>`.

Confirm the intended projects appear, exercise the affected flow, and capture
evidence. Retain the app and environment while iterating. At teardown, remove
the disposable connection, close the AgentDevice session, call `device_close`,
and stop only your backend and Metro processes.
