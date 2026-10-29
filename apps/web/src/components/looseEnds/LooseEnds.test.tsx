// @vitest-environment jsdom

import { scopeThreadRef } from "@control/client-runtime/environment";
import {
  type EnvironmentId,
  type OrchestrationV2ThreadProjection,
  ThreadId,
} from "@control/contracts";
import * as DateTime from "effect/DateTime";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { selectActiveRightPanelSurface, useRightPanelStore } from "~/rightPanelStore";

vi.mock("@effect/atom-react", () => ({ useAtomValue: () => [] }));
vi.mock("../../state/server", () => ({ primaryServerKeybindingsAtom: "keybindings" }));
vi.mock("../../state/threads", () => ({ threadEnvironment: {} }));
vi.mock("../../state/use-orchestration-command", () => ({
  useOrchestrationCommand: () => vi.fn(),
}));
vi.mock("../../browser/useOpenLink", () => ({ useOpenLink: () => vi.fn() }));

import { LooseEndsHeadIcon } from "./LooseEnds";

const threadRef = scopeThreadRef("env-1" as EnvironmentId, ThreadId.make("thread-1"));
const at = DateTime.makeUnsafe("2026-10-29T12:00:00Z");
const projection = {
  runs: [],
  looseEnds: [
    {
      id: "le-1",
      threadId: threadRef.threadId,
      runId: null,
      line: "Approve the drawings",
      reason: "",
      action: { kind: "file", value: "/work/site/.plans/p3/sheet.png" },
      status: "open",
      closedBy: null,
      closedAt: null,
      createdAt: at,
      updatedAt: at,
    },
  ],
} as unknown as OrchestrationV2ThreadProjection;

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  useRightPanelStore.setState({
    byThreadKey: {},
    threadPanelVisibilityByThreadKey: {},
    userActionRevisionByThreadKey: {},
    closeRevisionByThreadKey: {},
    tabSurfaceIdsByThreadKey: {},
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const button = (label: string) =>
  [...container.querySelectorAll("button")].find((node) => node.textContent === label);

it("opens a loose end's file in the panel's file tab, not in Finder", async () => {
  await act(() =>
    root.render(
      <LooseEndsHeadIcon
        threadRef={threadRef}
        projection={projection}
        workspaceRoot="/work/site"
      />,
    ),
  );
  await act(() => container.querySelector<HTMLButtonElement>(".s-le-ic")!.click());
  const open = button("Open");
  expect(open, "the file's action reads Open").toBeDefined();
  await act(() => open!.click());

  const surface = selectActiveRightPanelSurface(
    useRightPanelStore.getState().byThreadKey,
    threadRef,
  );
  // Inside the thread's folder it opens by its workspace path, as a chat link does.
  expect(surface).toMatchObject({ kind: "file", relativePath: ".plans/p3/sheet.png" });
});
