# Releases

> For maintainers. Using CONTROL? See [docs/user](../user/).

## Nightly: every push to main

`.github/workflows/release.yml` runs on each push to `main` (not pushes that only touch `apps/site`,
`docs`, `design` or Markdown) and on demand. One run at a time; a push during a run waits, and only
the newest waiting push builds next. On a macOS arm64 runner it:

1. versions the build `X.Y.Z-nightly.YYYYMMDD.<run>`, where `X.Y.Z` is the patch after
   `apps/desktop/package.json`'s version (`scripts/resolve-nightly-release.ts`);
2. builds the DMG and zip with `--signed`: electron-builder signs with the Developer ID and
   notarises the app;
3. signs, notarises and staples the DMG, which electron-builder leaves unsigned, then re-stamps its
   sha512 and size in `nightly-mac.yml` (`scripts/restamp-update-manifest.ts`);
4. checks the app with `codesign --verify` and `spctl`, then publishes a GitHub prerelease
   (never marked latest) with the DMG, the zip, the blockmaps and `nightly-mac.yml`.

A missing secret stops the run before anything builds: an unsigned app can't update itself.

Nightlies are named **Control (Nightly)** and wear `assets/nightly`'s icon. Electron's profile is
`control-desktop` either way, so browser logins carry across.

## How the app updates

- `apps/desktop/src/updates/DesktopUpdates.ts` checks GitHub Releases at startup and every 4 minutes.
  A nightly install follows the `nightly` channel (`nightly-mac.yml`, prereleases included); a stable
  install follows `latest-mac.yml`.
- Nothing downloads on its own: the sidebar's update button downloads on the first click and
  restarts into the update on the second.
- Squirrel.Mac installs only into an app signed with the same Developer ID. A build from
  `scripts/update-mac-app.sh` is ad hoc and carries no feed, so it can't update itself; install a
  release's DMG to get back on the button.
- The feed is baked in at build time from `CONTROL_DESKTOP_UPDATE_REPOSITORY` (`owner/repo`).
  Without it the build has no `app-update.yml`.

## Secrets

Repository secrets the workflow reads:

- `CSC_LINK`: base64 of the Developer ID Application certificate and key, exported from Keychain
  Access as `.p12`.
- `CSC_KEY_PASSWORD`: that export's password.
- `APPLE_API_KEY`: the text of an App Store Connect Team API key (`.p8`, Developer access).
- `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`: that key's ID and the team's issuer ID.

`xcrun notarytool history --key <p8> --key-id <id> --issuer <issuer>` checks a key without
submitting anything.

## Stable: by hand

Stable releases (`latest-mac.yml`, marked latest, linked from the site) are cut on this Mac:

```bash
CONTROL_DESKTOP_SIGNED=true CONTROL_DESKTOP_UPDATE_REPOSITORY=RandevRanjit/control \
  APPLE_KEYCHAIN_PROFILE=<notarytool profile> vp run dist:desktop:dmg:arm64
```

Then sign, notarise and staple the DMG as the workflow's step 3 does, re-stamp `latest-mac.yml`
with `node scripts/restamp-update-manifest.ts`, and publish `vX.Y.Z` with the same four kinds of
file. Afterwards set `apps/desktop/package.json` to `X.Y.Z`, so nightlies move on to the next patch:
a nightly of `X.Y.Z` would sort below the stable release.
