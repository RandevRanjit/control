import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { vi } from "vite-plus/test";

const openDatabaseAsync = vi.hoisted(() => vi.fn());

vi.mock("expo-sqlite", () => ({ openDatabaseAsync }));

/** Files in the fake app sandbox, by path. */
const files = vi.hoisted(() => new Set<string>());
vi.mock("expo-file-system", () => {
  class Directory {
    readonly uri: string;
    constructor(parent: { readonly uri: string }, name: string) {
      this.uri = `${parent.uri}/${name}`;
    }
  }
  class File {
    readonly uri: string;
    constructor(parent: { readonly uri: string }, name: string) {
      this.uri = `${parent.uri}/${name}`;
    }
    get exists() {
      return files.has(this.uri);
    }
    move(destination: File) {
      files.delete(this.uri);
      files.add(destination.uri);
    }
  }
  return { Directory, File, Paths: { document: { uri: "documents" } } };
});

import * as MobileDatabase from "./mobile-database";

describe("mobile database legacy cache migration", () => {
  it.effect("keeps acquisition failures typed on database operations", () =>
    Effect.scoped(
      Effect.gen(function* () {
        openDatabaseAsync.mockRejectedValueOnce(new Error("SQLite unavailable"));

        const database = yield* MobileDatabase.make;
        const result = yield* Effect.result(database.loadPreferencesJson);

        expect(result).toMatchObject({
          _tag: "Failure",
          failure: { _tag: "MobileDatabaseError", operation: "open" },
        });
      }),
    ),
  );

  it.effect("moves the database saved under its old name before opening it", () =>
    Effect.scoped(
      Effect.gen(function* () {
        files.clear();
        files.add("documents/SQLite/t3code-client.db");
        files.add("documents/SQLite/t3code-client.db-wal");
        openDatabaseAsync.mockRejectedValueOnce(new Error("stop after opening"));

        const database = yield* MobileDatabase.make;
        yield* Effect.result(database.loadPreferencesJson);

        expect([...files].sort()).toEqual([
          "documents/SQLite/control-client.db",
          "documents/SQLite/control-client.db-wal",
        ]);
        expect(openDatabaseAsync).toHaveBeenLastCalledWith("control-client.db");
      }),
    ),
  );

  it("maps legacy thread records to their SQLite identity", () => {
    const payload = JSON.stringify({
      schemaVersion: 2,
      environmentId: "environment-1",
      threadId: "thread-1",
      snapshot: {},
    });

    expect(MobileDatabase.decodeLegacyCacheRecord("connection-thread-snapshots", payload)).toEqual({
      environmentId: "environment-1",
      kind: "thread",
      cacheKey: "thread-1",
      schemaVersion: 2,
      payload,
    });
  });

  it("preserves the old shell payload for schema decoding after migration", () => {
    const payload = JSON.stringify({
      schemaVersion: 1,
      environmentId: "environment-1",
      snapshotReceivedAt: "2026-07-01T00:00:00.000Z",
      snapshot: {},
    });

    expect(MobileDatabase.decodeLegacyCacheRecord("shell-snapshots", payload)).toEqual({
      environmentId: "environment-1",
      kind: "shell",
      cacheKey: "snapshot",
      schemaVersion: 1,
      payload,
    });
  });

  it("skips malformed legacy records", () => {
    expect(MobileDatabase.decodeLegacyCacheRecord("connection-vcs-refs", "{not-json")).toBeNull();
    expect(
      MobileDatabase.decodeLegacyCacheRecord(
        "connection-vcs-refs",
        JSON.stringify({ schemaVersion: 1, environmentId: "environment-1" }),
      ),
    ).toBeNull();
  });
});
