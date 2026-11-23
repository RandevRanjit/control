# Releases

> For maintainers. Using CONTROL? See [docs/user](../user/).

There is one Control. Every push to main ships it.

`.github/workflows/release.yml` runs on each push to `main` (not pushes that only touch `apps/site`,
`docs`, `design` or Markdown) and on demand. One run at a time; a push during a run waits, and only
the newest waiting push builds next. On a macOS arm64 runner it:

1. versions the build `X.Y.<run>`, where `X.Y` comes from `apps/desktop/package.json` and `<run>` is
   the workflow's run number (`scripts/resolve-release.ts`). Bump `X.Y` there for a new series;
2. builds the DMG and zip with `--signed`: electron-builder signs with the Developer ID and
   notarises the app;
3. signs, notarises and staples the DMG, which electron-builder leaves unsigned, then re-stamps its
   sha512 and size in `latest-mac.yml` (`scripts/restamp-update-manifest.ts`);
4. checks the app with `codesign --verify` and `spctl`, then publishes a GitHub release marked
   latest, with the DMG, the zip, the blockmaps and `latest-mac.yml`.

A missing secret stops the run before anything builds: an unsigned app can't update itself.

## How the app updates

- `apps/desktop/src/updates/DesktopUpdates.ts` checks the latest GitHub release at startup and every
  4 minutes. The update's notes list every release since the running one.
- Nothing downloads on its own: the sidebar's update button downloads on the first click and
  restarts into the update on the second.
- Squirrel.Mac installs only into an app signed with the same Developer ID. A build from
  `scripts/update-mac-app.sh` is ad hoc and carries no feed, so it can't update itself; install a
  release's DMG to get back on the button.
- The feed is baked in at build time from `CONTROL_DESKTOP_UPDATE_REPOSITORY` (`owner/repo`).
  Without it the build has no `app-update.yml`.
- A **Control (Nightly)** install (up to 0.1.2-nightly) follows a feed that no longer gets releases.
  Install the DMG once and bin the old app; both have the same bundle ID, so permissions, threads
  and the `control-desktop` profile carry across.

## Secrets

Repository secrets the workflow reads:

- `CSC_LINK`: base64 of the Developer ID Application certificate and key, exported from Keychain
  Access as `.p12`.
- `CSC_KEY_PASSWORD`: that export's password.
- `APPLE_API_KEY`: the text of an App Store Connect Team API key (`.p8`, Developer access).
- `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`: that key's ID and the team's issuer ID.

`xcrun notarytool history --key <p8> --key-id <id> --issuer <issuer>` checks a key without
submitting anything.
