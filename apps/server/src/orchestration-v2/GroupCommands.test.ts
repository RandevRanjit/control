import { assert, describe, it } from "@effect/vitest";
import { CommandId, EventId, GroupId, type GroupMutation } from "@control/contracts";
import * as DateTime from "effect/DateTime";
import * as Result from "effect/Result";

import { planGroupCommand } from "./GroupCommands.ts";
import type { GroupRow } from "./GroupStore.ts";

const now = DateTime.makeUnsafe("2026-10-09T12:00:00.000Z");
const groupId = GroupId.make("group-work");
const commandId = CommandId.make("command-group");

const row = (overrides: Partial<GroupRow> = {}): GroupRow => ({
  groupId,
  name: "Work",
  tint: "peri",
  homeFolder: null,
  lockedUntil: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  deletedAt: null,
  ...overrides,
});

const plan = (command: GroupMutation, group: GroupRow | undefined) =>
  planGroupCommand({ command, group, eventId: EventId.make("event:planned"), now });

describe("planGroupCommand", () => {
  it("creates a group with no home folder by default", () => {
    const planned = plan(
      { type: "group.create", commandId, groupId, name: "Work", tint: "mint" },
      undefined,
    );
    assert.isTrue(Result.isSuccess(planned));
    if (!Result.isSuccess(planned)) return;
    assert.equal(planned.success.type, "group.created");
    assert.equal(planned.success.aggregateKind, "group");
    assert.deepStrictEqual(planned.success.payload, {
      groupId,
      name: "Work",
      tint: "mint",
      homeFolder: null,
      createdAt: "2026-10-09T12:00:00.000Z",
      updatedAt: "2026-10-09T12:00:00.000Z",
    });
  });

  it("never recreates an id, even a deleted one", () => {
    const planned = plan(
      { type: "group.create", commandId, groupId, name: "Again", tint: "rose" },
      row({ deletedAt: "2026-10-02T00:00:00.000Z" }),
    );
    assert.isTrue(Result.isFailure(planned));
    if (!Result.isFailure(planned)) return;
    assert.equal(planned.failure._tag, "GroupCommandInvariantError");
  });

  it("updates only the fields it names, and null clears the home folder", () => {
    const planned = plan(
      { type: "group.update", commandId, groupId, tint: "sage", homeFolder: null },
      row({ homeFolder: "/work" }),
    );
    assert.isTrue(Result.isSuccess(planned));
    if (!Result.isSuccess(planned)) return;
    assert.deepStrictEqual(planned.success.payload, {
      groupId,
      tint: "sage",
      homeFolder: null,
      updatedAt: "2026-10-09T12:00:00.000Z",
    });
  });

  it("rejects updates and deletes of a missing or deleted group", () => {
    const deleted = row({ deletedAt: "2026-10-02T00:00:00.000Z" });
    for (const [command, group] of [
      [{ type: "group.update", commandId, groupId, name: "X" }, undefined],
      [{ type: "group.update", commandId, groupId, name: "X" }, deleted],
      [{ type: "group.delete", commandId, groupId }, undefined],
      [{ type: "group.delete", commandId, groupId }, deleted],
    ] as const) {
      const planned = plan(command, group);
      assert.isTrue(Result.isFailure(planned));
      if (!Result.isFailure(planned)) return;
      assert.equal(planned.failure._tag, "GroupCommandMissingGroupError");
    }
  });

  it("locks a group until a time, and only ever extends a lock", () => {
    const lock = (until: string, group: GroupRow | undefined) =>
      plan({ type: "group.lock", commandId, groupId, until }, group);

    const planned = lock("2026-10-09T14:00:00.000Z", row());
    assert.isTrue(Result.isSuccess(planned));
    if (!Result.isSuccess(planned)) return;
    assert.equal(planned.success.type, "group.meta-updated");
    assert.deepStrictEqual(planned.success.payload, {
      groupId,
      lockedUntil: "2026-10-09T14:00:00.000Z",
      updatedAt: "2026-10-09T12:00:00.000Z",
    });

    const locked = row({ lockedUntil: "2026-10-09T14:00:00.000Z" });
    assert.isTrue(Result.isSuccess(lock("2026-10-09T15:00:00.000Z", locked)));
    // Nothing lifts a lock early, past ends, over-long locks and missing groups are refused.
    for (const [until, group] of [
      ["2026-10-09T13:00:00.000Z", locked],
      ["2026-10-09T11:00:00.000Z", row()],
      ["2026-10-10T00:00:00.001Z", row()],
      ["not a time", row()],
    ] as const) {
      const refused = lock(until, group);
      assert.isTrue(Result.isFailure(refused));
      if (Result.isFailure(refused))
        assert.equal(refused.failure._tag, "GroupCommandInvariantError");
    }
    assert.isTrue(Result.isFailure(plan({ type: "group.delete", commandId, groupId }, locked)));
    const missing = lock("2026-10-09T14:00:00.000Z", undefined);
    assert.isTrue(Result.isFailure(missing));
    if (Result.isFailure(missing))
      assert.equal(missing.failure._tag, "GroupCommandMissingGroupError");
  });

  it("deletes an active group", () => {
    const planned = plan({ type: "group.delete", commandId, groupId }, row());
    assert.isTrue(Result.isSuccess(planned));
    if (!Result.isSuccess(planned)) return;
    assert.equal(planned.success.type, "group.deleted");
    assert.deepStrictEqual(planned.success.payload, {
      groupId,
      deletedAt: "2026-10-09T12:00:00.000Z",
    });
  });
});
