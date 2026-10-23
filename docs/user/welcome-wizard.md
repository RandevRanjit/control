# Welcome wizard

CONTROL shows a setup flow the first time you open a new installation. Existing
workspaces skip this flow.

## Connect your computers

Select one or more computers to set up. If you opened CONTROL directly from a
server or the desktop app, that computer is already connected and selected.
It is identified by its name, which may differ from the device running your
browser.

You can add more computers before continuing:

- **Add a computer** connects directly to a server on your network or tailnet.
  Start the server with `ctrl serve`, then run `ctrl pair --tailscale` and paste
  the pairing link. You can also run `ctrl serve --host <address>` and use
  `ctrl pair` when the server is already reachable on your network.

Saved computers are selected by default. Uncheck any you do not want to set up; this does not disconnect them.
Continue when your selected computers are connected. Setup checks
agents across the selected computers, then offers project import grouped by computer.

If CONTROL cannot confirm the workspace during startup, the setup flow shows
**Still connecting** instead of opening the app. Select **Reload** to try again.

If CONTROL cannot read your saved settings, it shows **Could not read settings**.
Select **Retry** after storage becomes available. Setup does not replace
unreadable settings with defaults.

## Check your agents

CONTROL checks each selected computer for Claude Code. If an agent is
not installed or signed in, select its action to open a terminal with the
correct command ready to run. Install uses the vendor's own installer, which
keeps **Update now** working in Settings. Other providers can be enabled in
Settings.

The setup terminal uses the home directory and environment configured for the
selected provider instance. Sensitive values remain redacted in Settings and
terminal metadata while the terminal process can use them.

## Import your projects

CONTROL finds directories that Claude Code has used. Git repositories
are listed first, newest activity on top. When the remote is on GitHub, the
group shows the repository as `owner/name`. Clones with the same remote share
one group. Directories that are not git repositories sit under "Other folders".

The default selection includes git repositories active within the last 30 days
with at least three conversations. Use the checkboxes, or "Select all" and
"Select none", to change the selection. Linked git worktrees and anything under `Downloads` are not
offered.

A large or malformed history can reach the scan limit. CONTROL keeps the
projects it found and warns when projects or conversations may be missing.

Imported projects include Claude conversations active within the last
30 days. You can continue those conversations in CONTROL.

Conversation import is best effort. CONTROL keeps the first user prompt and the
newest remaining visible user and assistant messages, with 200 messages total.
It omits tool activity and attachments. It reads one conversation at
a time and skips files larger than 16 MiB. It ignores malformed records and skips
unreadable or unparseable conversations.

Each import attempt reads up to 100 conversation files and 64 MiB per project,
with up to 100,000 input records. Run import again to continue a large batch.
Completed conversations are not imported again. You can continue without the
remaining history.

You can continue without configuring agents or importing projects, or return to an earlier step
using the setup progress bar. Navigation pauses while an import is running.
