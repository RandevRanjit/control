import {
  NodeId,
  ProviderSessionId,
  RuntimeRequestId,
  TurnItemId,
  type OrchestrationV2ThreadProjection,
} from "@control/contracts";
import { describe, expect, it, vi } from "vite-plus/test";
import { AsyncResult } from "effect/reactivity";
import * as Cause from "effect/Cause";
import { v2Now, v2Projection } from "./orchestrationV2TestFixtures.ts";
import {
  createQuestionHistoryProjector,
  derivePendingThreadRequests,
  declineForRedirect,
  declinePendingApprovals,
  type ApprovalResponder,
  type ThreadPendingApproval,
} from "./threadRequests.ts";

const requestId = RuntimeRequestId.make("async-question");
const nodeId = NodeId.make("async-question-node");

describe("declining approvals before sending", () => {
  const approval: ThreadPendingApproval = {
    requestId,
    requestKind: "command",
    createdAt: "2026-10-19T00:00:00Z",
    responseCapability: "live",
  };
  const second: ThreadPendingApproval = {
    ...approval,
    requestId: RuntimeRequestId.make("second-approval"),
  };

  it("declines every pending approval before the send continues", async () => {
    let resolve!: (value: Awaited<ReturnType<ApprovalResponder>>) => void;
    const firstResponse = new Promise<Awaited<ReturnType<ApprovalResponder>>>((done) => {
      resolve = done;
    });
    const respond = vi.fn<ApprovalResponder>(async (id) =>
      id === requestId ? firstResponse : AsyncResult.success(undefined),
    );
    const send = vi.fn();
    const submission = (async () => {
      if (await declinePendingApprovals([approval, second], respond)) send();
    })();
    expect(respond).toHaveBeenCalledWith(requestId, "decline");
    expect(send).not.toHaveBeenCalled();
    resolve(AsyncResult.success(undefined));
    await submission;
    expect(respond).toHaveBeenCalledWith(second.requestId, "decline");
    expect(send).toHaveBeenCalledOnce();
    // A send never approves anything: "Allow" comes only from the owner's Accept.
    expect(respond.mock.calls.map(([, decision]) => decision)).toEqual(["decline", "decline"]);
  });

  it.each([AsyncResult.failure(Cause.fail("decline failed")), undefined])(
    "does not send when a decline is unsuccessful: %s",
    async (response) => {
      const send = vi.fn();
      if (await declinePendingApprovals([approval], async () => response)) send();
      expect(send).not.toHaveBeenCalled();
    },
  );

  it("skips approvals the provider can no longer answer", async () => {
    const respond = vi.fn(async () => AsyncResult.success(undefined));
    expect(
      await declinePendingApprovals(
        [{ ...approval, responseCapability: "not_resumable" }],
        respond,
      ),
    ).toBe(true);
    expect(respond).not.toHaveBeenCalled();
  });
});

describe("a redirect against what was pending at send", () => {
  const shown: ThreadPendingApproval = {
    requestId: RuntimeRequestId.make("shown-approval"),
    requestKind: "command",
    createdAt: "2026-10-19T00:00:00Z",
    responseCapability: "live",
  };
  const arrived: ThreadPendingApproval = {
    ...shown,
    requestId: RuntimeRequestId.make("arrived-approval"),
  };
  /** The thread's pending requests as the client sees them, which the test moves on. */
  const makeThread = (approvals: ReadonlyArray<ThreadPendingApproval>) => {
    const state = { approvals, userInputCount: 0 };
    return { state, readPending: () => state };
  };

  it("declines what was shown and goes ahead when nothing new arrived", async () => {
    const thread = makeThread([shown]);
    const respond = vi.fn<ApprovalResponder>(async () => AsyncResult.success(undefined));
    expect(
      await declineForRedirect({
        shownApprovalIds: [shown.requestId],
        readPending: thread.readPending,
        respond,
      }),
    ).toEqual({ declined: true, blocked: null });
    expect(respond.mock.calls).toEqual([[shown.requestId, "decline"]]);
  });

  it("declines nothing when an approval arrived after send, e.g. during an upload", async () => {
    const thread = makeThread([shown, arrived]);
    const respond = vi.fn<ApprovalResponder>(async () => AsyncResult.success(undefined));
    expect(
      await declineForRedirect({
        shownApprovalIds: [shown.requestId],
        readPending: thread.readPending,
        respond,
      }),
    ).toEqual({ declined: false, blocked: "approval-arrived" });
    expect(respond).not.toHaveBeenCalled();
  });

  it("declines nothing when a question arrived after send", async () => {
    const thread = makeThread([shown]);
    thread.state.userInputCount = 1;
    const respond = vi.fn<ApprovalResponder>(async () => AsyncResult.success(undefined));
    expect(
      await declineForRedirect({
        shownApprovalIds: [shown.requestId],
        readPending: thread.readPending,
        respond,
      }),
    ).toEqual({ declined: false, blocked: "user-input-arrived" });
    expect(respond).not.toHaveBeenCalled();
  });

  it.each([
    ["an approval", "approval-arrived"],
    ["a question", "user-input-arrived"],
  ] as const)("stops the send when %s arrives during the decline", async (kind, blocked) => {
    const thread = makeThread([shown]);
    const respond = vi.fn<ApprovalResponder>(async () => {
      if (blocked === "approval-arrived") thread.state.approvals = [shown, arrived];
      else thread.state.userInputCount = 1;
      return AsyncResult.success(undefined);
    });
    expect(
      await declineForRedirect({
        shownApprovalIds: [shown.requestId],
        readPending: thread.readPending,
        respond,
      }),
    ).toEqual({ declined: true, blocked });
  });
});

const projection: OrchestrationV2ThreadProjection = {
  ...v2Projection,
  runtimeRequests: [
    {
      id: requestId,
      nodeId,
      providerTurnId: null,
      nativeRequestRef: null,
      kind: "user_input",
      status: "pending",
      responseCapability: { type: "message" },
      createdAt: v2Now,
      resolvedAt: null,
    },
  ],
  turnItems: [
    {
      id: TurnItemId.make("async-question-item"),
      threadId: v2Projection.thread.id,
      runId: null,
      nodeId,
      providerThreadId: null,
      providerTurnId: null,
      nativeItemRef: null,
      parentItemId: null,
      ordinal: 0,
      status: "completed",
      title: null,
      startedAt: v2Now,
      completedAt: v2Now,
      updatedAt: v2Now,
      type: "user_input_request",
      requestId,
      responseMode: "message",
      questions: [
        {
          id: "next",
          header: "Next",
          question: "What should happen next?",
          required: true,
          allowCustomAnswer: false,
          options: [{ label: "Continue", value: "  continue  ", description: "Resume work" }],
        },
      ],
    },
  ],
};

describe("pending v2 questions", () => {
  it("keeps message responses available after the originating runtime exits", () => {
    expect(projection.providerSessions).toEqual([]);
    expect(derivePendingThreadRequests(projection).userInputs).toEqual([
      {
        requestId,
        createdAt: "2026-06-20T00:00:00.000Z",
        responseCapability: "message",
        responseMode: "message",
        dismissible: true,
        questions: [
          {
            id: "next",
            header: "Next",
            question: "What should happen next?",
            required: true,
            allowCustomAnswer: false,
            multiSelect: false,
            options: [{ label: "Continue", value: "  continue  ", description: "Resume work" }],
          },
        ],
      },
    ]);
  });

  it("only marks asynchronous questions as dismissible", () => {
    const live = {
      ...projection,
      runtimeRequests: projection.runtimeRequests.map((request) => ({
        ...request,
        responseCapability: {
          type: "live" as const,
          providerSessionId: ProviderSessionId.make("live-session"),
        },
      })),
      turnItems: projection.turnItems.map((item) =>
        item.type === "user_input_request" ? { ...item, responseMode: undefined } : item,
      ),
    };
    expect(derivePendingThreadRequests(live).userInputs[0]?.dismissible).toBe(false);
  });

  it("removes answered requests from the composer while retaining their answers in projection data", () => {
    const answered = {
      ...projection,
      runtimeRequests: projection.runtimeRequests.map((request) => ({
        ...request,
        status: "resolved" as const,
        resolvedAt: v2Now,
        answers: { next: "  continue  " },
      })),
    };
    expect(derivePendingThreadRequests(answered).userInputs).toEqual([]);
    expect(answered.runtimeRequests[0]?.answers).toEqual({ next: "  continue  " });
  });
});

it("restores old text answers without mutating history or replacing unchanged rows", () => {
  const project = createQuestionHistoryProjector();
  const item = projection.turnItems[0]!;
  const row = {
    item,
    position: 0,
    sourceItemId: item.id,
    sourceThreadId: item.threadId,
    visibility: "local" as const,
  };
  const rows = [row];
  const pending = { visibleTurnItems: rows, runtimeRequests: projection.runtimeRequests };
  expect(project(pending)).toBe(rows);
  const answered = {
    ...pending,
    runtimeRequests: [
      {
        ...projection.runtimeRequests[0]!,
        status: "resolved" as const,
        answers: { next: "Continue" },
      },
    ],
  };
  const result = project(answered);
  expect(result[0]?.item).toMatchObject({
    questionAnswer: {
      answers: { next: "Continue" },
      attachmentsByQuestionId: {},
      questionTextById: { next: "What should happen next?" },
    },
  });
  expect(row.item).not.toHaveProperty("questionAnswer");
  expect(project(answered)).toBe(result);
  expect(project({ ...answered, visibleTurnItems: [...rows] })[0]).toBe(result[0]);
});
