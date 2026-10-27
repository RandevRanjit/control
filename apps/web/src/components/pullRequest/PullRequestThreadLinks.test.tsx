// @vitest-environment jsdom

import { scopeThreadRef } from "@control/client-runtime/environment";
import { type EnvironmentId, ProjectId, ThreadId } from "@control/contracts";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { Menu, MenuPopup, MenuTrigger } from "../ui/menu";
import { PullRequestThreadLinks } from "./PullRequestThreadLinks";

const environmentId = "env-1" as EnvironmentId;
const threadRef = scopeThreadRef(environmentId, ThreadId.make("thread-1"));
const url = "https://github.com/acme/web/pull/42";

vi.mock("~/state/entities", () => ({
  useServerConfigs: () =>
    new Map([["env-1", { environment: { capabilities: { threadPullRequests: true } } }]]),
  useThreadShell: (ref: unknown) => (ref === null ? null : { pullRequests: [] }),
  useThreadShells: () => [],
  useProjects: () => [],
}));
vi.mock("~/hooks/usePullRequestLinking", () => ({
  usePullRequestLinking: () => ({
    mode: "multiple",
    canLink: () => true,
    isLinked: () => false,
    changeLink: vi.fn(),
  }),
}));
vi.mock("~/state/query", () => ({
  useEnvironmentQuery: () => ({ data: null, error: null }),
}));

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
});

describe("a pull request's thread links in its menu", () => {
  it("links it to this thread or, through the picker, to another one", async () => {
    const onPickerOpenChange = vi.fn();
    await act(() =>
      root.render(
        <Menu open>
          <MenuTrigger>More</MenuTrigger>
          <MenuPopup>
            <PullRequestThreadLinks
              display="menu-item"
              environmentId={environmentId}
              reference={{
                projectId: ProjectId.make("project-1"),
                repository: "acme/web",
                number: 42,
              }}
              url={url}
              threadRef={threadRef}
              onPickerOpenChange={onPickerOpenChange}
            />
          </MenuPopup>
        </Menu>,
      ),
    );
    const items = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    expect(items.map((item) => item.textContent)).toEqual([
      "Link to this thread",
      "Link to another thread…",
    ]);
    await act(() => items[1]!.click());
    expect(onPickerOpenChange).toHaveBeenCalledWith(true);
  });
});
