// @effect-diagnostics nodeBuiltinImport:off - Real files and mtimes are what this scan reads.
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { assert, it } from "@effect/vitest";
import { RunId, ThreadId } from "@control/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as ProjectionStore from "./ProjectionStore.ts";
import * as RunOutputs from "./RunOutputs.ts";

const threadId = ThreadId.make("thread:outputs");
const childId = ThreadId.make("thread:outputs-child");
const staleChildId = ThreadId.make("thread:outputs-stale-child");
const previousRunId = RunId.make("run:outputs:1");
const runId = RunId.make("run:outputs:2");

const previousEnd = DateTime.makeUnsafe("2026-11-03T15:00:00.000Z");
const requestedAt = DateTime.makeUnsafe("2026-11-03T15:10:00.000Z");
const seconds = (at: DateTime.Utc, offset: number) =>
  DateTime.toDateUtc(DateTime.add(at, { seconds: offset }));

const run = { id: runId, ordinal: 2, requestedAt } as never;
const previousRun = { id: previousRunId, ordinal: 1, completedAt: previousEnd } as never;
const command = (id: string, itemRunId: RunId | null, output: string) =>
  ({ id, type: "command_execution", runId: itemRunId, input: "python build.py", output }) as never;
const subagent = (childThreadId: ThreadId, itemRunId: RunId, completedAt: DateTime.Utc | null) =>
  ({ type: "subagent", runId: itemRunId, childThreadId, completedAt }) as never;

/** Answers the way the store does, so a query for the wrong item types finds nothing. */
const projections = (
  records: Record<string, { runs?: ReadonlyArray<never>; turnItems: ReadonlyArray<never> }>,
) =>
  Layer.mock(ProjectionStore.ProjectionStoreV2)({
    getThreadRecords: ((
      id: ThreadId,
      _fields: unknown,
      filter?: ProjectionStore.ProjectionRecordFilter,
    ) =>
      Effect.succeed({
        runs: records[id]?.runs ?? [],
        turnItems: (records[id]?.turnItems ?? []).filter(
          (item: { type: string; runId: RunId | null }) =>
            (filter?.turnItemTypes === undefined ||
              filter.turnItemTypes.includes(item.type as never)) &&
            (filter?.turnItemRunIds === undefined || filter.turnItemRunIds.includes(item.runId)),
        ),
      })) as never,
  });

/** Writes files into a throwaway folder, each dated by when the test says it changed. */
const folderWith = (files: Record<string, Date>) =>
  Effect.acquireRelease(
    Effect.promise(async () => {
      const cwd = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "run-outputs-"));
      for (const [path, changedAt] of Object.entries(files)) {
        const target = NodePath.join(cwd, path);
        await NodeFSP.mkdir(NodePath.dirname(target), { recursive: true });
        await NodeFSP.writeFile(target, "x");
        await NodeFSP.utimes(target, changedAt, changedAt);
      }
      return cwd;
    }),
    (cwd) => Effect.promise(() => NodeFSP.rm(cwd, { recursive: true, force: true })),
  );

it.effect("lists what changed in the window and the run names, and nothing else", () =>
  Effect.gen(function* () {
    const during = seconds(requestedAt, 30);
    const crops = Object.fromEntries(
      Array.from({ length: 6 }, (_, index) => [`figures/crop-${index}.png`, during]),
    );
    const cwd = yield* folderWith({
      "Exam pack/HF R.pdf": during,
      "Exam pack/DCS R.pdf": during,
      "old.pdf": seconds(previousEnd, -3600),
      ".plans/scratch.pdf": during,
      "node_modules/pkg/readme.md": during,
      "build.py": during,
      "plot.png": during,
      ...crops,
    });
    const named = [
      "Exam pack/HF R.pdf",
      "old.pdf",
      ".plans/scratch.pdf",
      "readme.md",
      "build.py",
      "plot.png",
      ...Object.keys(crops),
    ].join("\n");

    const outputs = yield* RunOutputs.runOutputs({ threadId, run, cwd }).pipe(
      Effect.provide(
        projections({
          [threadId]: {
            runs: [previousRun, run],
            turnItems: [command("c1", runId, named)],
          },
        }),
      ),
    );

    assert.deepEqual([...outputs].toSorted(), ["Exam pack/HF R.pdf", "plot.png"]);
  }).pipe(Effect.scoped),
);

it.effect("counts a background build that landed between runs", () =>
  Effect.gen(function* () {
    const cwd = yield* folderWith({ "pack.pdf": seconds(previousEnd, 4) });

    const outputs = yield* RunOutputs.runOutputs({ threadId, run, cwd }).pipe(
      Effect.provide(
        projections({
          [threadId]: {
            runs: [previousRun, run],
            turnItems: [command("c1", runId, "-rw-r--r-- pack.pdf")],
          },
        }),
      ),
    );

    assert.deepEqual(outputs, ["pack.pdf"]);
  }).pipe(Effect.scoped),
);

it.effect("opens a thread's first window when its first run was asked for", () =>
  Effect.gen(function* () {
    const cwd = yield* folderWith({
      "before.pdf": seconds(requestedAt, -5),
      "after.pdf": seconds(requestedAt, 5),
    });

    const outputs = yield* RunOutputs.runOutputs({ threadId, run, cwd }).pipe(
      Effect.provide(
        projections({
          [threadId]: {
            runs: [run],
            turnItems: [command("c1", runId, "before.pdf after.pdf")],
          },
        }),
      ),
    );

    assert.deepEqual(outputs, ["after.pdf"]);
  }).pipe(Effect.scoped),
);

it.effect("takes a subagent's word for it, but not one that finished before the window", () =>
  Effect.gen(function* () {
    const during = seconds(requestedAt, 30);
    const cwd = yield* folderWith({ "sheet.pdf": during, "stale.pdf": during });

    const outputs = yield* RunOutputs.runOutputs({ threadId, run, cwd }).pipe(
      Effect.provide(
        projections({
          [threadId]: {
            runs: [previousRun, run],
            turnItems: [
              subagent(childId, previousRunId, DateTime.add(previousEnd, { seconds: 60 })),
              subagent(
                staleChildId,
                previousRunId,
                DateTime.subtract(previousEnd, { seconds: 60 }),
              ),
            ],
          },
          [childId]: { turnItems: [command("child", runId, "wrote sheet.pdf")] },
          [staleChildId]: { turnItems: [command("stale", previousRunId, "wrote stale.pdf")] },
        }),
      ),
    );

    assert.deepEqual(outputs, ["sheet.pdf"]);
  }).pipe(Effect.scoped),
);

it.effect("doesn't count a file the run only read", () =>
  Effect.gen(function* () {
    const cwd = yield* folderWith({ "theirs.pdf": seconds(requestedAt, 30) });

    const outputs = yield* RunOutputs.runOutputs({ threadId, run, cwd }).pipe(
      Effect.provide(
        projections({
          [threadId]: {
            runs: [previousRun, run],
            turnItems: [
              {
                type: "dynamic_tool",
                runId,
                toolName: "Read",
                input: { file_path: "theirs.pdf" },
              } as never,
            ],
          },
        }),
      ),
    );

    assert.deepEqual(outputs, []);
  }).pipe(Effect.scoped),
);

it.effect("finds nothing in a folder that has gone", () =>
  RunOutputs.runOutputs({ threadId, run, cwd: "/nonexistent/run-outputs" }).pipe(
    Effect.provide(projections({ [threadId]: { runs: [previousRun, run], turnItems: [] } })),
    Effect.map((outputs) => assert.deepEqual(outputs, [])),
  ),
);
