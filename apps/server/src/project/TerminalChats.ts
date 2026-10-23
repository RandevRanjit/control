import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

/**
 * CONTROL's bridge (HANDOFF-v2 §4): read-only access to the owner's terminal
 * Claude chats, from the transcripts Claude Code writes. A chat lives either
 * there or here, so only chats the interactive CLI wrote (`entrypoint` "cli")
 * count; CONTROL's own SDK chats and chats imported into CONTROL are left out.
 */

const HEAD_BYTES = 64 * 1024;
const MAX_READ_BYTES = 128 * 1024 * 1024;
const MAX_MESSAGE_CHARS = 4_000;
const SESSION_ID = /^[A-Za-z0-9-]+$/;

export interface TerminalChatMessage {
  readonly role: "user" | "assistant";
  readonly text: string;
  readonly createdAt: string;
}

interface TranscriptScan {
  readonly entrypoint: string | null;
  readonly title: string | null;
  readonly messages: ReadonlyArray<TerminalChatMessage>;
}

/** Claude Code's folder for a workspace under `projects/`: every other character becomes `-`. */
export function claudeProjectFolderName(workspaceRoot: string): string {
  return workspaceRoot.replace(/[^A-Za-z0-9]/g, "-");
}

function recordText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .flatMap((block: { readonly type?: unknown; readonly text?: unknown }) =>
      block?.type === "text" && typeof block.text === "string" ? [block.text.trim()] : [],
    )
    .filter((text) => text.length > 0)
    .join("\n");
}

function parseLine(line: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(line);
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** What a transcript (or its head) says: who wrote it, its title and its visible messages. */
export function scanTranscript(contents: string): TranscriptScan {
  let entrypoint: string | null = null;
  let aiTitle: string | null = null;
  const messages: Array<TerminalChatMessage> = [];
  for (const line of contents.split("\n")) {
    const record = parseLine(line);
    if (record === null) continue;
    if (entrypoint === null && typeof record.entrypoint === "string") {
      entrypoint = record.entrypoint;
    }
    if (typeof record.aiTitle === "string" && record.aiTitle.trim().length > 0) {
      aiTitle = record.aiTitle.trim();
    }
    if (record.isSidechain === true || record.isMeta === true || record.isCompactSummary === true) {
      continue;
    }
    if (record.type !== "user" && record.type !== "assistant") continue;
    const message = record.message as { readonly content?: unknown } | undefined;
    const text = recordText(message?.content);
    // Slash commands and their output are recorded as tagged user text.
    if (text.length === 0 || text.startsWith("<")) continue;
    messages.push({
      role: record.type,
      text,
      createdAt: typeof record.timestamp === "string" ? record.timestamp : "",
    });
  }
  const firstUser = messages.find((message) => message.role === "user");
  return {
    entrypoint,
    title: aiTitle ?? firstUser?.text.split("\n")[0]?.slice(0, 100) ?? null,
    messages,
  };
}

const projectFolder = Effect.fn("TerminalChats.projectFolder")(function* (
  claudeHome: string,
  workspaceRoot: string,
) {
  const path = yield* Path.Path;
  return path.join(claudeHome, "projects", claudeProjectFolderName(workspaceRoot));
});

const readHead = Effect.fn("TerminalChats.readHead")(function* (filePath: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  const file = yield* fileSystem.open(filePath, { flag: "r" });
  const bytes = yield* file.readAlloc(HEAD_BYTES);
  return Option.isNone(bytes) ? "" : new TextDecoder().decode(bytes.value);
}, Effect.scoped);

/** Terminal chats for a workspace, newest first. */
export const listTerminalChats = Effect.fn("TerminalChats.list")(function* (input: {
  readonly claudeHome: string;
  readonly workspaceRoot: string;
  readonly excludeSessionIds: ReadonlySet<string>;
  readonly limit: number;
}) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const folder = yield* projectFolder(input.claudeHome, input.workspaceRoot);
  const names = yield* fileSystem
    .readDirectory(folder)
    .pipe(Effect.orElseSucceed((): ReadonlyArray<string> => []));
  const files = yield* Effect.forEach(
    names.filter((name) => name.endsWith(".jsonl")),
    (name) =>
      fileSystem.stat(path.join(folder, name)).pipe(
        Effect.map((info) => ({
          sessionId: name.slice(0, -".jsonl".length),
          filePath: path.join(folder, name),
          info,
        })),
        Effect.option,
      ),
    { concurrency: 8 },
  );
  const candidates = files
    .flatMap((file) => Option.toArray(file))
    .filter((file) => file.info.type === "File" && !input.excludeSessionIds.has(file.sessionId))
    .map((file) => ({
      ...file,
      mtimeMs: Option.match(file.info.mtime, { onNone: () => 0, onSome: (date) => date.getTime() }),
    }))
    .toSorted((left, right) => right.mtimeMs - left.mtimeMs);

  const chats: Array<{
    readonly sessionId: string;
    readonly title: string;
    readonly updatedAt: string;
    readonly sizeBytes: number;
  }> = [];
  for (const candidate of candidates) {
    if (chats.length >= input.limit) break;
    const head = yield* readHead(candidate.filePath).pipe(Effect.orElseSucceed(() => ""));
    const scan = scanTranscript(head);
    if (scan.entrypoint !== "cli") continue;
    chats.push({
      sessionId: candidate.sessionId,
      title: scan.title ?? "Untitled chat",
      updatedAt: DateTime.formatIso(DateTime.makeUnsafe(candidate.mtimeMs)),
      sizeBytes: Number(candidate.info.size),
    });
  }
  return chats;
});

export type TerminalChatReadOutcome =
  | {
      readonly _tag: "Found";
      readonly title: string;
      readonly messages: ReadonlyArray<TerminalChatMessage>;
      readonly truncated: boolean;
    }
  | { readonly _tag: "NotFound" }
  | { readonly _tag: "TooLarge" };

const NOT_FOUND: TerminalChatReadOutcome = { _tag: "NotFound" };
const TOO_LARGE: TerminalChatReadOutcome = { _tag: "TooLarge" };

/** One terminal chat's latest messages, oldest first. */
export const readTerminalChat = Effect.fn("TerminalChats.read")(function* (input: {
  readonly claudeHome: string;
  readonly workspaceRoot: string;
  readonly sessionId: string;
  readonly excludeSessionIds: ReadonlySet<string>;
  readonly limit: number;
}) {
  if (!SESSION_ID.test(input.sessionId) || input.excludeSessionIds.has(input.sessionId)) {
    return NOT_FOUND;
  }
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const filePath = path.join(
    yield* projectFolder(input.claudeHome, input.workspaceRoot),
    `${input.sessionId}.jsonl`,
  );
  const info = yield* fileSystem.stat(filePath).pipe(Effect.option);
  if (Option.isNone(info) || info.value.type !== "File") return NOT_FOUND;
  if (Number(info.value.size) > MAX_READ_BYTES) return TOO_LARGE;
  const contents = yield* fileSystem.readFileString(filePath).pipe(Effect.option);
  if (Option.isNone(contents)) return NOT_FOUND;
  const scan = scanTranscript(contents.value);
  if (scan.entrypoint !== "cli") return NOT_FOUND;
  const latest = scan.messages.slice(-input.limit).map((message) => ({
    ...message,
    text:
      message.text.length > MAX_MESSAGE_CHARS
        ? `${message.text.slice(0, MAX_MESSAGE_CHARS)}…`
        : message.text,
  }));
  const found: TerminalChatReadOutcome = {
    _tag: "Found",
    title: scan.title ?? "Untitled chat",
    messages: latest,
    truncated: scan.messages.length > latest.length,
  };
  return found;
});
