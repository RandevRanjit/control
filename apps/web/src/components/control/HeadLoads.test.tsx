// @vitest-environment jsdom

import { scopeThreadRef } from "@control/client-runtime/environment";
import {
  type EnvironmentId,
  type OrchestrationV2ProviderThreadLoads,
  ThreadId,
} from "@control/contracts";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

vi.mock("../../browser/useOpenLink", () => ({ useOpenLink: () => openLink }));
const openLink = vi.fn();

import { HeadLoads } from "./HeadLoads";
import type { HeadAgents } from "./headAgents.logic";

const loads: OrchestrationV2ProviderThreadLoads = {
  hooks: 0,
  skills: 2,
  mcpServers: 2,
  plugins: 0,
  agents: 1,
  names: {
    hooks: [],
    skills: ["review", "plan"],
    mcpServers: [
      {
        name: "claude.ai Google Calendar",
        status: "connected",
        source: "claudeai",
        tools: ["create_event", "update_event"],
      },
      { name: "claude.ai Google Drive", status: "needs-auth", source: "claudeai", tools: [] },
    ],
    plugins: [],
    agents: ["Explore"],
    about: {
      skills: { review: { description: "Reads a diff for bugs.", source: "user" } },
      agents: { Explore: { description: "Searches code.", source: "built-in" } },
      plugins: {},
    },
  },
};

const agents: HeadAgents = {
  started: 1,
  running: 0,
  turns: [
    {
      id: "run:run-1",
      ordinal: 1,
      label: "Review the diff",
      agents: [
        {
          id: "a",
          kind: "subagent",
          name: "Read the diff",
          timing: null,
          outcome: "done",
          childThreadId: ThreadId.make("child-a"),
          children: [],
        },
      ],
    },
  ],
  workflows: [],
};

const actions = { compose: vi.fn(), switchLoad: vi.fn(), openThread: vi.fn() };
let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const render = () =>
  act(() =>
    root.render(
      <HeadLoads
        threadRef={scopeThreadRef("env-1" as EnvironmentId, ThreadId.make("thread-1"))}
        loads={loads}
        off={undefined}
        agents={agents}
        actions={actions}
      />,
    ),
  );
const click = (node: Element | undefined) =>
  act(() => {
    node?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
const pill = (label: string) =>
  click(
    [...container.querySelectorAll("button")].find((node) => node.textContent?.includes(label)),
  );
const row = (name: string) =>
  [...document.querySelectorAll<HTMLElement>(".d-ldt-row")].find(
    (node) => node.querySelector(".d-ldt-name")?.textContent === name,
  );
const names = () => [...document.querySelectorAll(".d-ldt-name")].map((node) => node.textContent);

it("folds a server's tools under it, behind the guide, away from the next server", async () => {
  await render();
  await pill("MCP");
  await click(row("claude.ai Google Calendar")?.querySelector(".d-ldt-main") ?? undefined);
  const kids = row("claude.ai Google Calendar")?.nextElementSibling;
  expect(kids?.className).toBe("d-ldt-kids");
  expect(
    [...(kids?.querySelectorAll(".d-ldt-name") ?? [])].map((node) => node.textContent),
  ).toEqual(["create_event", "update_event"]);
  // The next server is not inside the fold.
  expect(kids?.contains(row("claude.ai Google Drive") ?? null)).toBe(false);
});

it("switches a server off for the chat, and offers a sign-in where claude.ai wants one", async () => {
  await render();
  await pill("MCP");
  await click(row("claude.ai Google Drive")?.querySelector('[role="switch"]') ?? undefined);
  expect(actions.switchLoad).toHaveBeenCalledWith({
    kind: "mcpServer",
    name: "claude.ai Google Drive",
    on: false,
  });
  await click(
    [...(row("claude.ai Google Drive")?.querySelectorAll("button") ?? [])].find(
      (node) => node.textContent === "Sign in",
    ),
  );
  expect(openLink).toHaveBeenCalledWith("https://claude.ai/settings/connectors");
});

it("filters a list and puts a clicked skill in the composer", async () => {
  await render();
  await pill("Skills");
  expect(names()).toEqual(["plan", "review"]);
  const filter = document.querySelector<HTMLInputElement>('input[type="search"]')!;
  await act(() => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    set.call(filter, "bugs");
    filter.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(names()).toEqual(["review"]);
  await click(row("review")?.querySelector(".d-ldt-main") ?? undefined);
  expect(actions.compose).toHaveBeenCalledWith("/review ");
});

it("opens a subagent's thread and asks for an agent type in the composer", async () => {
  await render();
  await pill("Agents");
  await click(row("Read the diff")?.querySelector(".d-ldt-main") ?? undefined);
  expect(actions.openThread).toHaveBeenCalledWith("child-a");
  await render();
  await pill("Agents");
  await click(row("Explore")?.querySelector(".d-ldt-main") ?? undefined);
  expect(actions.compose).toHaveBeenCalledWith("Use the Explore agent to ");
});
