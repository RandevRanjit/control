import { expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import { Tool } from "effect/ai";

import { advertisedJsonSchema } from "./advertisedJsonSchema.ts";

it("drops JSON noise, merges tagged unions, and keeps null", () => {
  const Every = Schema.Struct({ ms: Schema.Int });
  const tool = Tool.make("example", {
    parameters: Schema.Struct({
      threadId: Schema.optional(Schema.NullOr(Schema.String)),
      beforeRunId: Schema.NullOr(Schema.String),
      limit: Schema.optional(Schema.Int),
      every: Schema.Union([Every, Schema.fromJsonString(Every)]),
      target: Schema.optional(
        Schema.NullOr(
          Schema.Union([
            Schema.Struct({ kind: Schema.Literal("url"), url: Schema.String }),
            Schema.Struct({ kind: Schema.Literal("number"), number: Schema.Int }),
          ]),
        ),
      ),
    }),
  });

  expect(advertisedJsonSchema(tool)).toEqual({
    type: "object",
    properties: {
      threadId: { anyOf: [{ type: "string" }, { type: "null" }] },
      beforeRunId: { anyOf: [{ type: "string" }, { type: "null" }] },
      limit: { type: "integer" },
      every: { type: "object", properties: { ms: { type: "integer" } }, required: ["ms"] },
      target: {
        anyOf: [
          {
            type: "object",
            properties: {
              kind: { type: "string", enum: ["url", "number"] },
              url: { type: "string" },
              number: { type: "integer" },
            },
            required: ["kind"],
          },
          { type: "null" },
        ],
      },
    },
    required: ["beforeRunId", "every"],
  });
});

it("keeps a NullOr's null on an optional property, where null and omitted differ", () => {
  const tool = Tool.make("example", {
    parameters: Schema.Struct({
      beforeRunId: Schema.optional(Schema.NullOr(Schema.String)),
      limit: Schema.optional(Schema.Int),
    }),
  });

  expect(advertisedJsonSchema(tool)).toEqual({
    type: "object",
    properties: {
      beforeRunId: { anyOf: [{ type: "string" }, { type: "null" }] },
      limit: { type: "integer" },
    },
  });
});

it("types a merged tag from its values", () => {
  const tool = Tool.make("example", {
    parameters: Schema.Struct({
      level: Schema.Union([
        Schema.Struct({ level: Schema.Literal(1), a: Schema.String }),
        Schema.Struct({ level: Schema.Literal(2), b: Schema.String }),
      ]),
      flag: Schema.Union([
        Schema.Struct({ on: Schema.Literal(true), a: Schema.String }),
        Schema.Struct({ on: Schema.Literal(false), b: Schema.String }),
      ]),
    }),
  });

  const { properties } = advertisedJsonSchema(tool) as {
    properties: Record<string, { properties: Record<string, unknown> }>;
  };
  expect(properties.level!.properties.level).toEqual({ type: "number", enum: [1, 2] });
  expect(properties.flag!.properties.on).toEqual({ type: "boolean", enum: [true, false] });
});

it("keeps a JSON-string branch when no object branch is left beside it", () => {
  const Every = Schema.Struct({ ms: Schema.Int });
  const tool = Tool.make("example", {
    parameters: Schema.Struct({ every: Schema.NullOr(Schema.fromJsonString(Every)) }),
  });

  const { properties } = advertisedJsonSchema(tool) as {
    properties: Record<string, { anyOf: Array<unknown> }>;
  };
  expect(properties.every!.anyOf).toHaveLength(2);
  expect(properties.every!.anyOf[0]).toMatchObject({
    type: "string",
    contentMediaType: "application/json",
  });
  expect(properties.every!.anyOf[1]).toEqual({ type: "null" });
});
