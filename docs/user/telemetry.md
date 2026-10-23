# Product usage data

The CONTROL server records product usage events **locally only**. Nothing is sent off the machine.
Events are appended, one JSON object per line, to `telemetry.jsonl` in the server's state folder
(under `~/.control`); past 10 MB it rotates to `telemetry.1.jsonl`. Events include the provider,
model, reasoning effort, permission mode, turn result, duration, and main-agent token totals when
available.

Events do not include prompts, responses, file contents, authentication tokens, conversation IDs,
raw provider events, or child-agent output. Child-agent token use is excluded from the totals.

To disable collection, set `CONTROL_TELEMETRY_ENABLED=false` in the server's environment before
starting it. This stops product events from being recorded.

The desktop app reads the variable from your shell profile (for example `~/.zshrc`), so export it
there and restart the app.
