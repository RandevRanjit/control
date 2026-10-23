# Control

Control is a desktop and mobile control surface for Claude Code sessions on this Mac. It runs your
installed `claude` through the Agent SDK, keeps every chat alive, and groups chats from any folder.

Control v2 is a hard fork of [T3 Code](https://github.com/pingdotgg/t3code) (MIT); see
[NOTICE](./NOTICE). It is a personal build: there are no published installers.

## Requirements

- macOS on Apple silicon.
- [Claude Code](https://claude.com/product/claude-code), installed and signed in (`claude auth login`).
- Node 24 and the Vite+ `vp` command-line tool (`curl -fsSL https://vite.plus | bash`).

## Build from source

```bash
vp i
vp run build:desktop
```

Runtime state lives in `~/.control` (override with `CONTROL_HOME`). Development and tests must never
run against it; seed a sandbox with `vp run migrate-dev-db`.

## Documentation

Full docs live in [docs/](./docs).

- [Install and first run](./docs/user/install.md)
- [Permission modes](./docs/user/permission-modes.md)
- [Keyboard shortcuts](./docs/user/keybindings.md)
- [Project settings](./docs/user/project-settings.md)
- [Appearance preferences](./docs/user/appearance.md)
- [Lock](./docs/user/lock.md)
- [Loose ends](./docs/user/loose-ends.md)
- [Remote access from a phone or another machine](./docs/user/remote-access.md)
- [Connect Claude Code, Codex, ChatGPT and other agents over MCP](./docs/user/outside-agents.md)
- [Keeping app and server in sync](./docs/user/updating.md)
- [Source control integrations](./docs/user/source-control.md)
- Multiple accounts: [Claude](./docs/user/providers-claude.md)
- [Run Control as a background service](./docs/user/background-service.md)

Building from source? Start at [docs/internals/overview.md](./docs/internals/overview.md).
