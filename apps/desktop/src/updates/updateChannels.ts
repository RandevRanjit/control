import type { DesktopUpdateChannel } from "@control/contracts";

// Nightlies carry the date until the 0.1.3 bump (X.Y.Z-nightly.YYYYMMDD.N), then X.Y.Z-nightly.N.
const NIGHTLY_VERSION_PATTERN = /^[^-+]+-nightly\.(?:\d{8}\.)?\d+$/;
// Preview builds are the maintainers' test train, cut by hand from unreleased
// branches to exercise the release flow. They share nightly's branding but
// are packaged without an update feed (see
// isDesktopPreviewVersion in scripts/build-desktop-artifact.ts), so the
// channel a preview install reports is cosmetic: it never checks for updates
// and no updater feed ever lists a preview release.
const PRERELEASE_VERSION_PATTERN = /^[^-+]+-(?:nightly|preview)\.(?:\d{8}\.)?\d+$/;

export function isNightlyDesktopVersion(version: string): boolean {
  return PRERELEASE_VERSION_PATTERN.test(version);
}

export function resolveDefaultDesktopUpdateChannel(appVersion: string): DesktopUpdateChannel {
  return NIGHTLY_VERSION_PATTERN.test(appVersion) ? "nightly" : "latest";
}
