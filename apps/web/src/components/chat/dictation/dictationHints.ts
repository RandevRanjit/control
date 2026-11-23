/** Enough to fill the model's prompt; the server cuts what doesn't fit. */
const MAX_HINTS = 60;
const MAX_HINT_LENGTH = 40;
/** The newest messages hold the names the owner is about to say. */
const MAX_MESSAGES = 12;

const WORD = /[\p{L}\p{N}_][\p{L}\p{N}_./-]*[\p{L}\p{N}_]/gu;

/**
 * A word speech alone can't spell: `ClaudeAdapterV2`, `pnpm-lock.yaml`, `MCP`, `h264`. Capitals
 * count only past the first letter, unless the word is mid-sentence, like a product's name.
 */
const isName = (word: string, midSentence: boolean) =>
  /\p{Ll}.*\p{Lu}|\p{Lu}{2}|\p{L}[\d_./-]|\d\p{L}/u.test(word) ||
  (midSentence && /^\p{Lu}\p{Ll}{2}/u.test(word));

/**
 * The names this chat uses, likeliest first, so dictation spells them as they're written: the
 * given ones, such as the branch, then what the messages mention, newest message first.
 */
export function dictationHints(input: {
  readonly names: ReadonlyArray<string | null | undefined>;
  /** Oldest first, as the chat holds them. */
  readonly messages: ReadonlyArray<{ readonly text: string }>;
}): ReadonlyArray<string> {
  const hints = new Map<string, string>();
  const add = (hint: string) => {
    const key = hint.toLowerCase();
    if (hint.length > 1 && hint.length <= MAX_HINT_LENGTH && !hints.has(key)) hints.set(key, hint);
  };
  for (const name of input.names) if (name) add(name);
  for (const { text } of input.messages.slice(-MAX_MESSAGES).toReversed()) {
    for (const match of text.matchAll(WORD)) {
      if (hints.size >= MAX_HINTS) return [...hints.values()];
      // Somebody says a path's last part, and a link isn't dictated at all.
      const word = match[0].slice(match[0].lastIndexOf("/") + 1);
      const before = text.slice(Math.max(0, match.index - 2), match.index);
      if (isName(word, /^[\p{Ll},] $/u.test(before))) add(word);
    }
  }
  return [...hints.values()];
}
