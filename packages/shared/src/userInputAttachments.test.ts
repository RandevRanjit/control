import { describe, expect, it } from "vite-plus/test";

import {
  formatUserInputAttachmentReference,
  stripUserInputAttachmentReferences,
} from "./userInputAttachments.ts";

describe("user input attachment references", () => {
  it("strips the lines it formats, and nothing the owner wrote", () => {
    const references = [
      formatUserInputAttachmentReference({ type: "image", name: "shot.png" }, "/a/shot.png"),
      formatUserInputAttachmentReference({ type: "file", name: 'spec "final".txt' }, "/a/b\\c.txt"),
    ];
    const answer = 'Attached is the "plan": see it\nsecond line';
    expect(stripUserInputAttachmentReferences(`${answer}\n\n${references.join("\n")}`)).toBe(
      answer,
    );
    expect(stripUserInputAttachmentReferences(references.join("\n"))).toBe("");
  });
});
