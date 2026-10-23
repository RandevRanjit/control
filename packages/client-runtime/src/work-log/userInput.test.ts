import { describe, expect, it } from "vite-plus/test";
import { ApprovalRequestId, type UserInputAttachmentAnswerPayload } from "@control/contracts";
import { getQuestionAnswerPreview, getQuestionTextPreview } from "./userInput.ts";

function answer(
  overrides: Partial<UserInputAttachmentAnswerPayload> = {},
): UserInputAttachmentAnswerPayload {
  return {
    requestId: ApprovalRequestId.make("request-1"),
    questionTextById: { scope: "Which repository?" },
    answers: { scope: "Use the private repository" },
    attachmentsByQuestionId: {},
    ...overrides,
  };
}

describe("getQuestionTextPreview", () => {
  it("joins the question texts", () => {
    expect(
      getQuestionTextPreview(
        answer({ questionTextById: { scope: "Which repository?", name: "What name?" } }),
      ),
    ).toBe("Which repository? · What name?");
  });

  it("normalizes whitespace and skips blank texts", () => {
    expect(
      getQuestionTextPreview(
        answer({ questionTextById: { scope: "Which\nrepository?", x: "  " } }),
      ),
    ).toBe("Which repository?");
  });

  it("returns an empty string without question texts", () => {
    expect(getQuestionTextPreview(answer({ questionTextById: undefined }))).toBe("");
  });
});

describe("getQuestionAnswerPreview", () => {
  const image = {
    type: "image" as const,
    id: "thread-1-shot",
    name: "shot.png",
    mimeType: "image/png",
    sizeBytes: 3,
  };
  // As the server stores an answer with attachments: the agent's copy of each path is appended.
  const reference =
    'Attached image "shot.png": "/Users/me/.control/userdata/attachments/thread-1-shot.png"';

  it("leaves out the attachment paths added for the agent", () => {
    expect(
      getQuestionAnswerPreview(
        answer({
          answers: {
            scope: `Loose ends, see the shot\n\n${reference}`,
            pick: ["First", reference],
          },
          attachmentsByQuestionId: { scope: [image], pick: [image] },
        }),
      ),
    ).toBe("Loose ends, see the shot · First");
  });

  it("names the attachments when they were the whole answer", () => {
    expect(
      getQuestionAnswerPreview(
        answer({ answers: { scope: reference }, attachmentsByQuestionId: { scope: [image] } }),
      ),
    ).toBe("shot.png");
  });
});
