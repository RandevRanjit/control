import * as NodeOS from "node:os";
import type { LocalModelCandidate, LocalModelScanInput } from "@control/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { expandHomePathWith } from "../pathExpansion.ts";

/** Folders deep enough for `~/models/<model>/<file>` and the cache's `models--x/snapshots/<rev>/`. */
const MAX_DEPTH = 4;
const SERVER_DIRS = ["/opt/homebrew/bin", "/usr/local/bin"];

const unquote = (token: string) =>
  token.length >= 2 && (token[0] === '"' || token[0] === "'") && token.at(-1) === token[0]
    ? token.slice(1, -1)
    : token;

/** Flags whose value CONTROL sets itself: the model, the projector, the host and the port. */
const OWN_FLAGS = new Set(["-m", "--model", "--mmproj", "--host", "--port"]);

/**
 * The flags a `serve.sh` passes llama-server, with its variables' defaults filled in
 * (`-c "$CTX"` where `CTX="${CTX:-32768}"` gives `-c 32768`). The model, projector, host and
 * port go, since CONTROL sets them; anything it can't resolve goes too. Null without a
 * llama-server line.
 */
export function serveScriptFlags(script: string): Array<string> | null {
  const lines = script
    .replace(/\\\n/g, " ")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("#"));

  const variables = new Map<string, string>();
  for (const assignment of lines) {
    const withDefault = /^\s*([A-Za-z_]\w*)="?\$\{\1:-([^}]*)\}"?\s*$/.exec(assignment);
    const plain = /^\s*([A-Za-z_]\w*)=("[^"$]*"|'[^']*'|[^\s"'$]+)\s*$/.exec(assignment);
    if (withDefault !== null) variables.set(withDefault[1]!, withDefault[2]!);
    else if (plain !== null) variables.set(plain[1]!, unquote(plain[2]!));
  }
  const resolve = (token: string): string | null => {
    const value = unquote(token);
    if (value.includes("[@]") || value === "$@") return null;
    const inline = /^\$\{\w+:-([^}]*)\}$/.exec(value);
    if (inline !== null) return inline[1]!;
    const named = /^\$\{?(\w+)\}?$/.exec(value);
    if (named !== null) return variables.get(named[1]!) ?? null;
    return value.includes("$") ? null : value;
  };

  // The command is llama-server itself or a variable holding it (`exec "$SERVER"`).
  const tokenize = (line: string) => line.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  const commandAt = (tokens: ReadonlyArray<string>) => (tokens[0] === "exec" ? 1 : 0);
  const runsServer = (tokens: ReadonlyArray<string>) => {
    const command = tokens[commandAt(tokens)];
    return (
      command !== undefined &&
      !command.includes("=") &&
      (resolve(command) ?? "").endsWith("llama-server")
    );
  };
  const tokens = lines.map(tokenize).find(runsServer);
  if (tokens === undefined) return null;
  const start = commandAt(tokens);
  const flags: Array<string> = [];
  for (let index = start + 1; index < tokens.length; index += 1) {
    const token = unquote(tokens[index]!);
    if (OWN_FLAGS.has(token)) {
      index += 1;
      continue;
    }
    const value = resolve(tokens[index]!);
    if (value === null) {
      // An unresolved value takes its flag with it.
      if (flags.at(-1)?.startsWith("-") && !token.startsWith("-")) flags.pop();
      continue;
    }
    flags.push(value);
  }
  return flags;
}

/** The candidates Add offers, newest folder layout first: ~/models, then the Hugging Face cache. */
/** A model's name from its file, without the quantisation: `Qwen3.8-27B-Uncensored`. */
export const modelName = (fileName: string) =>
  fileName.replace(/\.gguf$/i, "").replace(/[-._](?:I?Q\d\w*|B?F16|F32)$/i, "");

export const scanForModels = (input: LocalModelScanInput) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const home = NodeOS.homedir();

    const isFile = (file: string) =>
      fs.stat(file).pipe(
        Effect.map((info) => (info.type === "File" ? Number(info.size) : null)),
        Effect.orElseSucceed(() => null),
      );

    const ggufsUnder = (dir: string, depth: number): Effect.Effect<Array<string>> =>
      Effect.gen(function* () {
        const names = yield* fs.readDirectory(dir).pipe(Effect.orElseSucceed(() => []));
        const found: Array<string> = [];
        for (const name of names.toSorted()) {
          if (name.startsWith(".")) continue;
          const entry = path.join(dir, name);
          const info = yield* fs.stat(entry).pipe(Effect.orElseSucceed(() => null));
          if (info?.type === "File" && name.toLowerCase().endsWith(".gguf")) found.push(entry);
          else if (info?.type === "Directory" && depth > 1) {
            found.push(...(yield* ggufsUnder(entry, depth - 1)));
          }
        }
        return found;
      });

    const server = yield* Effect.gen(function* () {
      // Local models run on macOS, where PATH separates with ":".
      const dirs = [...(process.env.PATH ?? "").split(":"), ...SERVER_DIRS];
      for (const dir of dirs) {
        if (dir === "") continue;
        const candidate = path.join(dir, "llama-server");
        if ((yield* isFile(candidate)) !== null) return candidate;
      }
      return "llama-server";
    });

    const files =
      input.file === undefined
        ? [
            ...(yield* ggufsUnder(path.join(home, "models"), MAX_DEPTH)),
            ...(yield* ggufsUnder(path.join(home, ".cache", "huggingface", "hub"), MAX_DEPTH)),
          ]
        : [expandHomePathWith(input.file, path)];

    const isProjector = (file: string) => path.basename(file).toLowerCase().startsWith("mmproj");
    const candidates: Array<LocalModelCandidate> = [];
    for (const file of files) {
      if (isProjector(file) && input.file === undefined) continue;
      const sizeBytes = yield* isFile(file);
      if (sizeBytes === null) continue;
      const dir = path.dirname(file);
      const siblings = (yield* fs
        .readDirectory(dir)
        .pipe(Effect.orElseSucceed(() => []))).toSorted();
      const projectorName = siblings.find(
        (name) => isProjector(name) && name.toLowerCase().endsWith(".gguf"),
      );
      const projector = projectorName === undefined ? undefined : path.join(dir, projectorName);
      const script = siblings.includes("serve.sh")
        ? yield* fs.readFileString(path.join(dir, "serve.sh")).pipe(Effect.orElseSucceed(() => ""))
        : "";
      const flags = serveScriptFlags(script) ?? ["-ngl", "999"];
      candidates.push({
        name: modelName(path.basename(file)),
        file,
        ...(projector === undefined ? {} : { projector }),
        args: [
          server,
          "-m",
          file,
          ...(projector === undefined ? [] : ["--mmproj", projector]),
          ...flags,
        ],
        sizeBytes,
      });
    }
    return candidates;
  });
