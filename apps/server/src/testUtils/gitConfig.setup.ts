// @effect-diagnostics nodeBuiltinImport:off - vitest runs setup files outside any Effect runtime.
import * as NodeChildProcess from "node:child_process";
import * as NodePath from "node:path";

// Pins git behaviour for every repository the suite creates, ahead of the
// host's ~/.gitconfig. Git for Windows installs with core.autocrlf=true,
// which checks committed LF files out as CRLF and breaks every byte-exact
// content assertion; a signing key or a non-default init branch on the
// developer's machine breaks fixtures the same way, as does an
// init.templateDir that adds hooks or leaves out .git/info, so new
// repositories get git's own templates. Set as environment so
// each git child the driver spawns sees it without touching the fixtures.
const entries: ReadonlyArray<readonly [key: string, value: string]> = [
  ["core.autocrlf", "false"],
  ["core.filemode", "false"],
  ["core.longpaths", "true"],
  ["commit.gpgsign", "false"],
  ["tag.gpgsign", "false"],
  ["init.defaultBranch", "main"],
  [
    "init.templateDir",
    NodePath.resolve(
      NodeChildProcess.execFileSync("git", ["--exec-path"], { encoding: "utf8" }).trim(),
      "../../share/git-core/templates",
    ),
  ],
];

const existing = Number(process.env.GIT_CONFIG_COUNT ?? "0");
process.env.GIT_CONFIG_COUNT = String(existing + entries.length);
entries.forEach(([key, value], index) => {
  process.env[`GIT_CONFIG_KEY_${existing + index}`] = key;
  process.env[`GIT_CONFIG_VALUE_${existing + index}`] = value;
});
