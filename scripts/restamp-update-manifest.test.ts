import { describe, expect, it } from "vite-plus/test";

import { parseUpdateManifest } from "./lib/update-manifest.ts";
import { restampManifestFile } from "./restamp-update-manifest.ts";

const manifest = parseUpdateManifest(
  `version: 0.1.1-nightly.20261025.1
files:
  - url: Control-0.1.1-nightly.20261025.1-arm64.zip
    sha512: zipsum
    size: 125621344
  - url: Control-0.1.1-nightly.20261025.1-arm64.dmg
    sha512: unsigneddmg
    size: 131754935
path: Control-0.1.1-nightly.20261025.1-arm64.zip
sha512: zipsum
releaseDate: '2026-10-25T10:32:14.587Z'
`,
  "nightly-mac.yml",
  "macOS",
);

describe("restampManifestFile", () => {
  it("gives the re-signed DMG its new sha512 and size and leaves the zip the updater reads alone", () => {
    const dmg = {
      url: "Control-0.1.1-nightly.20261025.1-arm64.dmg",
      sha512: "signeddmg",
      size: 131760000,
    };
    const next = restampManifestFile(manifest, dmg);

    expect(next.files).toEqual([manifest.files[0], dmg]);
  });

  it("refuses a file the manifest doesn't list", () => {
    expect(() =>
      restampManifestFile(manifest, { url: "Control-other.dmg", sha512: "x", size: 1 }),
    ).toThrow("lists no Control-other.dmg");
  });
});
