# Install CONTROL

CONTROL runs Claude Code chats on your Mac and lets you control them from its
desktop, web, or mobile app.

## Requirements

- macOS on Apple silicon.
- [Claude Code](https://claude.com/product/claude-code), installed and signed in with
  `claude auth login`. You can launch CONTROL first and set Claude up afterwards.

## Desktop app

Download the latest DMG from [GitHub Releases](https://github.com/RandevRanjit/control/releases/latest),
open it and drag CONTROL to Applications. Releases are signed and notarised, and the
app updates itself from the same page.

### The `ctrl` command

The desktop app includes the `ctrl` command-line tool. To run it from any
terminal, open **Settings → General → About** and choose **Install** next to
**ctrl command**. It adds a `ctrl` link to a folder on your `PATH`. Open a new
terminal afterwards. **Remove** takes it off again.

### Open a project from a terminal

With the desktop app already running on the same machine:

```bash
ctrl app
```

This opens a new thread for the current directory, adding the project if needed.
Pass a path, such as `ctrl app ../my-project`, to open another directory. It requires
the desktop app, so a standalone server or an SSH session is not enough. If the
command cannot reach the app, start or update the desktop app and try again.

## From source

For an Intel Mac, or to work on CONTROL, build it with Node.js 24 and `vp`
([Install vp](https://github.com/RandevRanjit/control#build-from-source)):

```bash
git clone https://github.com/RandevRanjit/control
cd control && vp i && vp run build:desktop
node apps/server/dist/bin.mjs
```

A server run this way doesn't update itself; update it with `git pull` and a rebuild.

## Mobile app

The iPhone app isn't on the App Store. Build it with your own Apple developer account,
following [apps/mobile/README.md](../../apps/mobile/README.md). The phone connects to a server on another machine; follow
[remote access](./remote-access.md) to link it with a pairing URL.

If the app crashes during launch, open Settings → Diagnostics on the next launch
that succeeds. It lists startup crashes from the last 7 days with the error and
component stack that store crash reports leave out. Copy the report and paste it
into a GitHub issue. Error messages can quote values from the app, so read it over
before sharing.

## Providers

Open **Settings → Providers** in the web or desktop app, select the environment,
and enable the provider you want. Installation, login, and configuration belong
to that environment's machine, even when you connect from a phone or another
computer.

| Provider | Install and authenticate                                                                     |
| -------- | -------------------------------------------------------------------------------------------- |
| Claude   | Install [Claude Code](https://claude.com/product/claude-code), then run `claude auth login`. |

Provider CLIs must be on the server's `PATH`. If CONTROL cannot find one, set its
**Binary path** in provider settings, especially when using a version manager.

CONTROL warns when a provider version has known compatibility problems with your
release. Check **Settings → Providers** on that environment for the recommended
version or range. When its package manager supports installing a specific version,
you can install the recommendation there. Otherwise use the provider's installer
on the environment's machine. An unlisted version is unverified.

When a provider CLI is behind its latest release, its provider card shows the
available version. **Update now** runs the installer that owns the CLI
(Homebrew, or a global npm, pnpm, Yarn, Bun, Volta, or Vite+ install), or the
CLI's own update command when CONTROL cannot tell. Update a CLI installed with
mise through mise. Homebrew installs
compare against the version Homebrew offers, which can trail the npm release by
a few hours.

Add another provider instance for a separate account or configuration. Each
instance can have its own environment variables, such as API keys or a custom
base URL. Mark secret values as sensitive; after saving, CONTROL does not display
their original values.

For provider-specific setup and accounts, see [Claude](./providers-claude.md).

## Next steps

- [Working with threads](./thread-sidebar.md): start tasks and organize parallel work.
- [Permission modes](./permission-modes.md): choose when agents ask before acting.
- [Remote access](./remote-access.md): connect from another device.
- [Running in the background](./background-service.md): keep a Linux or macOS host available.
- [Updating CONTROL](./updating.md): update the app and connected servers.
