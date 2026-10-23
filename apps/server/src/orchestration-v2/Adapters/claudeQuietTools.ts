/**
 * Quiet by default (HANDOFF-v2 §4): tool calls that take focus from the
 * owner's screen ask first and hold until answered, in every permission mode.
 * cua-driver works in the background by design, so it is not listed.
 */

// Shell separators that start a new command: ; & | newlines and $( or `.
const SHELL_COMMAND_BREAK = /;|&&?|\|\|?|\n|\$\(|`/;
const ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

function commandWords(segment: string): ReadonlyArray<string> {
  const words = segment.trim().split(/\s+/).filter(Boolean);
  let start = 0;
  while (start < words.length && (ENV_ASSIGNMENT.test(words[start]!) || words[start] === "sudo")) {
    start += 1;
  }
  return words.slice(start);
}

function programName(word: string | undefined): string | undefined {
  return word
    ?.replace(/^["']|["']$/g, "")
    .split("/")
    .pop();
}

/** Why this call takes focus, as its approval names it; null when it is quiet. */
export function focusStealingReason(toolName: string, toolInput: unknown): string | null {
  if (toolName.startsWith("mcp__computer-use__")) return toolName;
  if (toolName !== "Bash") return null;
  const command =
    typeof toolInput === "object" && toolInput !== null && "command" in toolInput
      ? (toolInput as { readonly command: unknown }).command
      : undefined;
  if (typeof command !== "string") return null;
  for (const segment of command.split(SHELL_COMMAND_BREAK)) {
    const program = programName(commandWords(segment)[0]);
    if (program === "screencapture" || program === "open") return program;
    if (program === "osascript" && /\bactivate\b/.test(command)) return "osascript activate";
  }
  return null;
}
