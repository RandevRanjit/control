// @effect-diagnostics nodeBuiltinImport:off - Reads file types and mtimes without a stat per folder entry.
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";

import type { OrchestrationV2Run, OrchestrationV2TurnItem, ThreadId } from "@control/contracts";
import { isArtefactPath } from "@control/shared/artefactFiles";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import * as ProjectionStore from "./ProjectionStore.ts";

const SKIPPED_FOLDERS = new Set(["node_modules", "__pycache__"]);
/** Stops a project pointed at somewhere vast from holding up the end of a turn. */
const SCAN_TIMEOUT = Duration.seconds(5);
const IMAGE = /\.(png|jpe?g|gif|webp|avif|heic|svg|ico)$/i;
/** More new images than this in one folder are a build's working files, not things to read. */
const MAX_IMAGES_PER_FOLDER = 5;
/** What the run did and said. A file it only read doesn't count as one it made. */
const EVIDENCE_TYPES = [
  "command_execution",
  "file_change",
  "assistant_message",
] satisfies ReadonlyArray<OrchestrationV2TurnItem["type"]>;

const encodeEvidence = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

/** Workspace-relative artefacts changed since `sinceMs`, leaving out hidden folders and files. */
const changedArtefacts = async (cwd: string, sinceMs: number) => {
  const changed: string[] = [];
  const folders = [cwd];
  for (let folder = folders.pop(); folder !== undefined; folder = folders.pop()) {
    const entries = await NodeFSP.readdir(folder, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const path = NodePath.join(folder, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED_FOLDERS.has(entry.name)) folders.push(path);
      } else if (entry.isFile() && isArtefactPath(entry.name)) {
        const stat = await NodeFSP.stat(path).catch(() => null);
        if (stat !== null && stat.mtimeMs >= sinceMs) changed.push(NodePath.relative(cwd, path));
      }
    }
  }
  return changed;
};

const withoutBulkImages = (paths: ReadonlyArray<string>) => {
  const imagesByFolder = new Map<string, number>();
  for (const path of paths) {
    if (!IMAGE.test(path)) continue;
    const folder = NodePath.dirname(path);
    imagesByFolder.set(folder, (imagesByFolder.get(folder) ?? 0) + 1);
  }
  return paths.filter(
    (path) =>
      !IMAGE.test(path) ||
      (imagesByFolder.get(NodePath.dirname(path)) ?? 0) <= MAX_IMAGES_PER_FOLDER,
  );
};

/**
 * The documents a run left in a folder Git can't diff, whichever way it made them. Threads share a
 * folder, so a timestamp alone would claim another thread's files: a file counts when it changed
 * since the previous run ended (a background build can land between runs) and this run, or a
 * subagent working in it, names it.
 */
export const runOutputs = Effect.fn("RunOutputs.runOutputs")(function* (input: {
  readonly threadId: ThreadId;
  readonly run: OrchestrationV2Run;
  readonly cwd: string;
}) {
  const projections = yield* ProjectionStore.ProjectionStoreV2;
  const { runs, turnItems: subagents } = yield* projections.getThreadRecords(
    input.threadId,
    ["runs", "turnItems"],
    { turnItemTypes: ["subagent"], messageRoles: [] },
  );
  const since =
    runs.find((run) => run.ordinal === input.run.ordinal - 1)?.completedAt ?? input.run.requestedAt;
  const scanned = yield* Effect.promise(() =>
    changedArtefacts(input.cwd, DateTime.toEpochMillis(since)),
  ).pipe(Effect.timeoutOption(SCAN_TIMEOUT));
  const changed = Option.getOrElse(scanned, () => []);
  if (changed.length === 0) return [];

  const own = yield* projections.getThreadRecords(input.threadId, ["turnItems"], {
    turnItemTypes: EVIDENCE_TYPES,
    turnItemRunIds: [input.run.id],
    messageRoles: [],
  });
  const children = yield* Effect.forEach(
    subagents.flatMap((item) =>
      item.type === "subagent" &&
      item.childThreadId !== null &&
      (item.runId === input.run.id ||
        item.completedAt === null ||
        DateTime.isGreaterThanOrEqualTo(item.completedAt, since))
        ? [item.childThreadId]
        : [],
    ),
    (childThreadId) =>
      projections.getThreadRecords(childThreadId, ["turnItems"], {
        turnItemTypes: EVIDENCE_TYPES,
        messageRoles: [],
      }),
    { concurrency: 4 },
  );
  const evidence = encodeEvidence([own, ...children].flatMap((records) => records.turnItems));
  return withoutBulkImages(changed.filter((path) => evidence.includes(NodePath.basename(path))));
});
