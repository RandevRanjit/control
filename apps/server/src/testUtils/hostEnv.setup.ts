// @effect-diagnostics nodeBuiltinImport:off - vitest runs setup files outside any Effect runtime.
// Keeps the developer's shell environment out of the suite. macOS hands out
// TMPDIR under /var, a symlink to /private/var, while the server canonicalises
// the paths it compares; and a GitHub token exported in the shell outranks the
// fakes the source-control tests install.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";

process.env.TMPDIR = NodeFS.realpathSync(NodeOS.tmpdir());

for (const name of ["GH_TOKEN", "GITHUB_TOKEN", "GH_ENTERPRISE_TOKEN", "GITHUB_ENTERPRISE_TOKEN"]) {
  delete process.env[name];
}
