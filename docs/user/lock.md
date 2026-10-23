# Lock

A lock keeps you out of your chats until a time you choose. It is a commitment, not security:
it ends at a fixed time, at most 12 hours ahead, and nothing lifts it early. Quitting, restarting
and rebooting all leave it in place. You can only extend it.

Open the lock sheet with `mod+l` (unless the browser preview has focus), from the command palette,
or with **Lock…** in a group's menu. Choose a mode, how long, and press **Lock**. Customize
`lock.open` in **Settings → Keybindings**.

- **Full** locks everything. The window shows the lock plate, and every chat refuses your sends
  from every device.
- **Group** locks the groups you tick. They start as the groups with a working chat, less the one
  you're in. A locked group's sidebar rows show only the chats that need you.

Running turns carry on, and agents can still message each other, except that a locked group takes
messages only from its own chats. Agents can see a lock, through
Control's `lock_read` tool, but can't set, end or shorten one. A chat that needs you, with a
question or an approval, comes through: during a full lock the window comes forward without taking
focus and shows only those chats, and the plate returns once you've answered them. A failed chat
doesn't come through.

When nothing has needed you for 10 minutes, a note under the search offers a lock. **Later** hides
it until something next needs you.

## Terminal claude

A full lock also refuses new prompts in `claude` in any terminal, `claude -p` included. The first
lock adds a `UserPromptSubmit` hook to Claude's `settings.json` (`~/.claude`, or
`CLAUDE_CONFIG_DIR`), keeping the previous copy in `backups/` beside it. The hook reads Control's
lock file, so it does nothing once the lock ends; Control's own chats pass it. A refused prompt
stays in the box for after the lock.
