import type { LocalModel } from "@control/contracts";

/** `~/models/q.gguf`: a path under a Mac home folder, from the home. */
export const homeRelative = (path: string) => path.replace(/^\/Users\/[^/]+\//, "~/");

type ModelFiles = Pick<LocalModel, "file" | "projector">;

/**
 * A command line as the owner edits it (M2): the model's own files read `<file>` and
 * `<projector>`, and arguments with spaces are quoted.
 */
export const commandText = (args: LocalModel["args"], files: ModelFiles) =>
  args
    .map((arg) =>
      arg === files.file
        ? "<file>"
        : arg === files.projector
          ? "<projector>"
          : arg === "" || /\s|"/.test(arg)
            ? `"${arg.replaceAll('"', '\\"')}"`
            : arg,
    )
    .join(" ");

/** The command line back into arguments; null when it's empty or a quote is left open. */
export function parseCommand(text: string, files: ModelFiles): [string, ...Array<string>] | null {
  const args: Array<string> = [];
  for (const match of text.matchAll(/"((?:[^"\\]|\\.)*)"|(\S+)/g)) {
    const arg = match[1] === undefined ? match[2]! : match[1].replaceAll('\\"', '"');
    args.push(
      arg === "<file>" ? files.file : arg === "<projector>" ? (files.projector ?? arg) : arg,
    );
  }
  const quotes = (text.match(/(?<!\\)"/g) ?? []).length;
  const [first, ...rest] = args;
  return first === undefined || quotes % 2 === 1 ? null : [first, ...rest];
}

/** An added model sleeps after this many idle minutes (§18.2). */
export const DEFAULT_IDLE_MINUTES = 10;

/** The default system prompt for an added model: the job local models are for. */
export const DEFAULT_SYSTEM_PROMPT =
  "You process private files on the owner's Mac. Answer only what you're asked, and leave out anything that identifies a person: names, emails, phone numbers, addresses, account numbers and home folders.";
