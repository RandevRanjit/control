#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off - This is a build-time filesystem script.
// Re-stamps one file in an Electron updater manifest after it changed on disk:
//   node scripts/restamp-update-manifest.ts <manifest.yml> <file>
// The release workflow signs and staples the DMG after electron-builder wrote nightly-mac.yml.

import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import {
  parseUpdateManifest,
  serializeUpdateManifest,
  type UpdateManifest,
  type UpdateManifestFile,
} from "./lib/update-manifest.ts";

export function restampManifestFile(
  manifest: UpdateManifest,
  file: UpdateManifestFile,
): UpdateManifest {
  if (!manifest.files.some((entry) => entry.url === file.url)) {
    throw new Error(`The manifest lists no ${file.url}.`);
  }
  return {
    ...manifest,
    files: manifest.files.map((entry) => (entry.url === file.url ? file : entry)),
  };
}

if (import.meta.main) {
  const [manifestPath, filePath] = process.argv.slice(2);
  if (!manifestPath || !filePath) {
    throw new Error("Usage: restamp-update-manifest.ts <manifest.yml> <file>");
  }
  const bytes = NodeFS.readFileSync(filePath);
  const manifest = restampManifestFile(
    parseUpdateManifest(NodeFS.readFileSync(manifestPath, "utf8"), manifestPath, "macOS"),
    {
      url: NodePath.basename(filePath),
      sha512: NodeCrypto.createHash("sha512").update(bytes).digest("base64"),
      size: bytes.length,
    },
  );
  NodeFS.writeFileSync(manifestPath, serializeUpdateManifest(manifest, { platformLabel: "macOS" }));
}
