import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";

import { ControlProjectFile } from "@control/contracts";

import { fromLenientJson } from "./schemaJson.ts";

/**
 * Codec between the raw `control.json` file contents (lenient JSONC string) and the
 * decoded {@link ControlProjectFile}.
 */
export const ControlProjectFileFromJson = fromLenientJson(ControlProjectFile);

const decodeControlProjectFile = Schema.decodeExit(ControlProjectFileFromJson);

/**
 * Decode raw `control.json` contents, treating invalid or malformed files as
 * absent. Clients use this to read optional defaults (scripts, thread env
 * mode) without surfacing decode errors to the user.
 */
export function parseControlProjectFile(contents: string): ControlProjectFile | null {
  const decoded = decodeControlProjectFile(contents);
  return Exit.isSuccess(decoded) ? decoded.value : null;
}

/**
 * Build the JSON Schema document for `control.json` (draft 2020-12), for editors
 * that read a `$schema` reference.
 */
export function buildControlProjectFileJsonSchema(): Record<string, unknown> {
  // Closed objects, as before effect rc.113 changed the generator default;
  // editors then flag unknown keys in control.json.
  const document = Schema.toJsonSchemaDocument(ControlProjectFile, { onExcessProperty: "error" });
  const jsonSchema: Record<string, unknown> = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    ...document.schema,
  };
  if (document.definitions && Object.keys(document.definitions).length > 0) {
    jsonSchema.$defs = document.definitions;
  }
  return jsonSchema;
}
