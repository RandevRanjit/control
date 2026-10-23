import * as Schema from "effect/Schema";

const quote = Schema.encodeSync(Schema.fromJsonString(Schema.String));
const REFERENCE_LINE = /^Attached \S+ "(?:[^"\\]|\\.)*": "(?:[^"\\]|\\.)*"$/;

/**
 * The line the server appends to a question's answer for each attachment, so the
 * agent can open the file. The answer is stored with these lines.
 */
export function formatUserInputAttachmentReference(
  attachment: { readonly type: string; readonly name: string },
  path: string,
): string {
  return `Attached ${attachment.type} ${quote(attachment.name)}: ${quote(path)}`;
}

/** The answer as the owner wrote it: clients draw the attachments, not their paths. */
export function stripUserInputAttachmentReferences(text: string): string {
  return text
    .split("\n")
    .filter((line) => !REFERENCE_LINE.test(line))
    .join("\n")
    .trimEnd();
}
