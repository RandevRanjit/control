import * as Schema from "effect/Schema";

import {
  IsoDateTime,
  NonNegativeInt,
  PortSchema,
  PositiveInt,
  TrimmedNonEmptyString,
} from "./baseSchemas.ts";

/** A gigabyte as macOS counts memory (2^30 bytes), so a 128 GB Mac reads 128. */
export const GB = 1024 ** 3;
/** Memory the way the notes and refusals print it: `2.1 GB` under 10, `42 GB` above. */
export const formatGb = (bytes: number): string => {
  const gb = bytes / GB;
  return `${gb < 10 ? (Math.round(gb * 10) / 10).toString() : Math.round(gb).toString()} GB`;
};
/** A wake must leave this much memory free (design/hybrid/HANDOFF.md §18.3). */
export const LOCAL_MODEL_KEEP_BYTES = 15 * GB;
/** A wake that needs more than this asks the owner first (§18.3). */
export const LOCAL_MODEL_ASK_BYTES = 40 * GB;

export const LocalModelId = TrimmedNonEmptyString.pipe(Schema.brand("LocalModelId"));
export type LocalModelId = typeof LocalModelId.Type;

/**
 * A model CONTROL can wake (§18.6): a command that serves the OpenAI API, run on a port
 * CONTROL picks. Edits apply at the model's next wake.
 */
export const LocalModel = Schema.Struct({
  id: LocalModelId,
  name: TrimmedNonEmptyString,
  /** The GGUF the command loads. */
  file: TrimmedNonEmptyString,
  /** The vision projector, when the model reads images. */
  projector: Schema.optional(TrimmedNonEmptyString),
  /** The command line, executable first, without --host and --port: CONTROL adds those. */
  args: Schema.NonEmptyArray(Schema.String),
  /** Sent ahead of every call, and once at the wake so the server caches it. */
  systemPrompt: Schema.String,
  /** Minutes ready with no call running before the model sleeps. */
  idleMinutes: PositiveInt,
  /** The footprint measured at the last wake; it sizes the next one. */
  measuredBytes: Schema.optional(NonNegativeInt),
  /**
   * Offered in the chat model picker, where the chat runs Claude Code against this model. Off
   * unless the owner turns it on, so a model built for one job never shows there.
   */
  chat: Schema.optional(Schema.Boolean),
});
export type LocalModel = typeof LocalModel.Type;

const LOCAL_MODEL_SLUG_PREFIX = "local:";
/** A chat-enabled local model's slug in Claude's model list. */
export const localModelSlug = (id: LocalModelId) => `${LOCAL_MODEL_SLUG_PREFIX}${id}`;
/** The local model a model slug names, or null for any other slug. */
export const localModelIdFromSlug = (slug: string): LocalModelId | null => {
  const id = slug.startsWith(LOCAL_MODEL_SLUG_PREFIX)
    ? slug.slice(LOCAL_MODEL_SLUG_PREFIX.length).trim()
    : "";
  return id === "" ? null : LocalModelId.make(id);
};

export const LocalModelState = Schema.Literals(["asleep", "waking", "ready"]);
export type LocalModelState = typeof LocalModelState.Type;

/** What one model is doing now. It isn't stored: every model is asleep after a server start. */
export const LocalModelRuntime = Schema.Struct({
  modelId: LocalModelId,
  state: LocalModelState,
  pid: Schema.optional(PositiveInt),
  port: Schema.optional(PortSchema),
  /** When the model entered its state. */
  since: IsoDateTime,
  /** When a ready model with no call running goes to sleep. */
  sleepsAt: Schema.optional(IsoDateTime),
  /** Calls running or queued: one runs at a time, the rest wait. */
  calls: NonNegativeInt,
  /** Measured once the model is ready. */
  footprintBytes: Schema.optional(NonNegativeInt),
  /** What a wake needs: the last measured footprint, else an estimate from the files. */
  needBytes: Schema.optional(NonNegativeInt),
  /** How the last process ended, shown on the Settings row. */
  lastExit: Schema.optional(
    Schema.Struct({
      at: IsoDateTime,
      code: Schema.NullOr(Schema.Int),
      signal: Schema.NullOr(Schema.String),
    }),
  ),
});
export type LocalModelRuntime = typeof LocalModelRuntime.Type;

/** The Mac's memory as the wake rule reads it (§18.3). */
export const LocalMemory = Schema.Struct({
  totalBytes: NonNegativeInt,
  /** Free, inactive, speculative and purgeable pages. */
  availableBytes: NonNegativeInt,
  /** What a wake must leave free. */
  keepBytes: NonNegativeInt,
  swapUsedBytes: NonNegativeInt,
});
export type LocalMemory = typeof LocalMemory.Type;

/** Every model, what each is doing, and the memory: what Settings and the notes draw. */
export const LocalModelsSnapshot = Schema.Struct({
  models: Schema.Array(LocalModel),
  runtimes: Schema.Array(LocalModelRuntime),
  memory: LocalMemory,
});
export type LocalModelsSnapshot = typeof LocalModelsSnapshot.Type;

/** A GGUF found for Add, with a command filled from the file and any `serve.sh` beside it. */
export const LocalModelCandidate = Schema.Struct({
  name: TrimmedNonEmptyString,
  file: TrimmedNonEmptyString,
  projector: Schema.optional(TrimmedNonEmptyString),
  args: Schema.NonEmptyArray(Schema.String),
  sizeBytes: NonNegativeInt,
});
export type LocalModelCandidate = typeof LocalModelCandidate.Type;

/** Looks in ~/models and the Hugging Face cache, or reads the one file Browse picked. */
export const LocalModelScanInput = Schema.Struct({
  file: Schema.optional(TrimmedNonEmptyString),
});
export type LocalModelScanInput = typeof LocalModelScanInput.Type;

const LocalModelFields = {
  name: LocalModel.fields.name,
  file: LocalModel.fields.file,
  projector: LocalModel.fields.projector,
  args: LocalModel.fields.args,
  systemPrompt: LocalModel.fields.systemPrompt,
  idleMinutes: LocalModel.fields.idleMinutes,
  chat: LocalModel.fields.chat,
};

export const LocalModelRegisterInput = Schema.Struct(LocalModelFields);
export type LocalModelRegisterInput = typeof LocalModelRegisterInput.Type;

/**
 * Replaces the model's fields; a changed file or command drops the measured footprint. A missing
 * `chat` keeps the current one, so an older client's edit doesn't turn it off.
 */
export const LocalModelUpdateInput = Schema.Struct({ id: LocalModelId, ...LocalModelFields });
export type LocalModelUpdateInput = typeof LocalModelUpdateInput.Type;

export const LocalModelRemoveInput = Schema.Struct({ id: LocalModelId });
export type LocalModelRemoveInput = typeof LocalModelRemoveInput.Type;

/** `approved` is the owner's in-place confirmation for a wake over 40 GB. */
export const LocalModelWakeInput = Schema.Struct({
  id: LocalModelId,
  approved: Schema.optional(Schema.Boolean),
});
export type LocalModelWakeInput = typeof LocalModelWakeInput.Type;

/** Sleeps one model, or every awake model when `id` is absent. */
export const LocalModelSleepInput = Schema.Struct({
  id: Schema.optional(LocalModelId),
});
export type LocalModelSleepInput = typeof LocalModelSleepInput.Type;

export class LocalModelError extends Schema.TaggedError<LocalModelError>()("LocalModelError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {}
