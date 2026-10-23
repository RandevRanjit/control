import * as NodeOS from "node:os";
import {
  formatGb,
  LOCAL_MODEL_ASK_BYTES,
  LOCAL_MODEL_KEEP_BYTES,
  type LocalMemory,
} from "@control/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { darwinAvailableMemory } from "../resourceTelemetry/HostResources.ts";

const SIZE_UNITS: Record<string, number> = { B: 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3 };

/** `used` from `sysctl -n vm.swapusage`: `total = 2048.00M  used = 1093.25M  free = …`. */
export function parseSwapUsed(output: string): number | null {
  const match = /\bused = ([\d.]+)([BKMG])\b/.exec(output);
  if (match === null) return null;
  const bytes = Math.round(Number(match[1]) * SIZE_UNITS[match[2]!]!);
  return Number.isSafeInteger(bytes) ? bytes : null;
}

/** `phys_footprint` from `footprint -f bytes --noCategories <pid>`; it counts Metal's allocations. */
export function parseFootprint(output: string): number | null {
  const match = /phys_footprint:\s+(\d+) B\b/.exec(output);
  return match === null ? null : Number(match[1]);
}

/**
 * What a wake needs before the model has ever been measured (§18.3): the model and projector
 * files plus the prompt cache `--cache-ram` lets it grow (in MiB; -1 is unlimited, so it adds
 * nothing countable). The context's own cache isn't readable without the file's metadata; the
 * footprint measured at the first wake replaces the estimate.
 */
export function estimateNeedBytes(input: {
  readonly fileBytes: number;
  readonly projectorBytes: number;
  readonly args: ReadonlyArray<string>;
}): number {
  const flag = input.args.indexOf("--cache-ram");
  const cacheMib = flag === -1 ? 0 : Number(input.args[flag + 1]);
  return (
    input.fileBytes +
    input.projectorBytes +
    (Number.isFinite(cacheMib) && cacheMib > 0 ? cacheMib * 1024 ** 2 : 0)
  );
}

export type WakeVerdict =
  | { readonly _tag: "wake" }
  /** Over 40 GB: the owner approves first. */
  | { readonly _tag: "ask"; readonly needBytes: number; readonly freeAfterBytes: number }
  /** `meta` is the numbers the refusal shows: `needs 42 GB · 31 GB to spare`. */
  | { readonly _tag: "refuse"; readonly meta: string };

/**
 * The wake rule (design/hybrid/HANDOFF.md §18.3, owner 13 Oct): wake only if what's available
 * less the need leaves 15 GB, and no swap is in use. Over 40 GB asks, unless the owner already
 * approved. A refusal touches nothing: no other model sleeps to make room.
 */
export function wakeVerdict(input: {
  readonly memory: LocalMemory;
  readonly needBytes: number;
  readonly approved: boolean;
}): WakeVerdict {
  const { memory, needBytes } = input;
  if (memory.swapUsedBytes > 0) {
    return { _tag: "refuse", meta: `swap in use · ${formatGb(memory.swapUsedBytes)}` };
  }
  const spare = memory.availableBytes - memory.keepBytes;
  if (needBytes > spare) {
    return {
      _tag: "refuse",
      meta: `needs ${formatGb(needBytes)} · ${formatGb(Math.max(0, spare))} to spare`,
    };
  }
  if (needBytes > LOCAL_MODEL_ASK_BYTES && !input.approved) {
    return { _tag: "ask", needBytes, freeAfterBytes: memory.availableBytes - needBytes };
  }
  return { _tag: "wake" };
}

const run = (command: string, args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    return yield* spawner
      .string(ChildProcess.make(command, args, { stdin: "ignore", stderr: "ignore" }))
      .pipe(Effect.timeout("5 seconds"));
  });

export class LocalMemoryReadError extends Schema.TaggedError<LocalMemoryReadError>()(
  "LocalMemoryReadError",
  { cause: Schema.optional(Schema.Defect()) },
) {
  override get message(): string {
    return "Couldn't read the Mac's memory.";
  }
}

/** The Mac's memory now. Local models run on macOS, where `vm_stat` and `sysctl` answer. */
const readLocalMemory = Effect.gen(function* () {
  const [vmStat, swap] = yield* Effect.all(
    [run("/usr/bin/vm_stat", []), run("/usr/sbin/sysctl", ["-n", "vm.swapusage"])],
    { concurrency: 2 },
  ).pipe(Effect.mapError((cause) => new LocalMemoryReadError({ cause })));
  const availableBytes = darwinAvailableMemory(vmStat);
  const swapUsedBytes = parseSwapUsed(swap);
  if (availableBytes === null || swapUsedBytes === null) {
    return yield* new LocalMemoryReadError({});
  }
  return {
    totalBytes: NodeOS.totalmem(),
    availableBytes,
    keepBytes: LOCAL_MODEL_KEEP_BYTES,
    swapUsedBytes,
  } satisfies LocalMemory;
});

/** A process's footprint, or null when `footprint` can't read it. */
const readFootprint = (pid: number) =>
  run("/usr/bin/footprint", ["-f", "bytes", "--noCategories", String(pid)]).pipe(
    Effect.map(parseFootprint),
    Effect.orElseSucceed(() => null),
  );

/** How the local models read memory; tests give it fixed numbers instead of the Mac's. */
export class LocalMemoryProbe extends Context.Service<
  LocalMemoryProbe,
  {
    readonly read: Effect.Effect<LocalMemory, LocalMemoryReadError>;
    readonly footprint: (pid: number) => Effect.Effect<number | null>;
  }
>()("@control/server/localModels/memory/LocalMemoryProbe") {}

export const layerMemoryProbe = Layer.effect(
  LocalMemoryProbe,
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const provide = Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner);
    return LocalMemoryProbe.of({
      read: provide(readLocalMemory),
      footprint: (pid) => provide(readFootprint(pid)),
    });
  }),
);
