// @vitest-environment jsdom

import { scopeThreadRef } from "@control/client-runtime/environment";
import { type EnvironmentId, ThreadId } from "@control/contracts";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { AppAtomRegistryProvider } from "~/rpc/atomRegistry";

import { focusLinkPullRequestField, LinkPullRequestField } from "./LinkPullRequestField";

const threadRef = scopeThreadRef("env-1" as EnvironmentId, ThreadId.make("thread-1"));
const changeLink = vi.fn(async () => undefined);

vi.mock("~/state/entities", () => ({
  useThreadShell: () => ({ projectId: "project-1" }),
  useProjects: () => [
    {
      id: "project-1",
      environmentId: "env-1",
      repositoryIdentity: {
        canonicalKey: "github.com/acme/web",
        owner: "acme",
        name: "web",
        provider: "github",
        locator: {
          source: "git-remote",
          remoteName: "origin",
          remoteUrl: "https://github.com/acme/web.git",
        },
      },
    },
  ],
}));
vi.mock("~/hooks/usePullRequestLinking", () => ({
  usePullRequestLinking: () => ({ mode: "multiple", canLink: () => true, changeLink }),
}));

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  changeLink.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const input = () => container.querySelector<HTMLInputElement>("input")!;

async function type(value: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(() => {
    setValue.call(input(), value);
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("the link field at the foot of Git › PR", () => {
  it("links a bare number against the thread's repository on Enter, then empties", async () => {
    await act(() =>
      root.render(
        <AppAtomRegistryProvider>
          <LinkPullRequestField threadRef={threadRef} />
        </AppAtomRegistryProvider>,
      ),
    );
    await type("#42");
    expect(container.textContent).toContain("acme/web #42");
    await act(() =>
      input().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })),
    );
    expect(changeLink).toHaveBeenCalledWith(threadRef, "https://github.com/acme/web/pull/42", true);
    expect(input().value).toBe("");
  });

  it("says what it needs instead of linking nonsense", async () => {
    await act(() =>
      root.render(
        <AppAtomRegistryProvider>
          <LinkPullRequestField threadRef={threadRef} />
        </AppAtomRegistryProvider>,
      ),
    );
    await type("not a pull request");
    await act(() =>
      input().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })),
    );
    expect(changeLink).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Use a pull request URL, 123, or #123.");
  });

  it("takes the focus when the command palette asks to link one", async () => {
    await act(() =>
      root.render(
        <AppAtomRegistryProvider>
          <LinkPullRequestField threadRef={threadRef} />
        </AppAtomRegistryProvider>,
      ),
    );
    expect(document.activeElement).not.toBe(input());
    await act(() => focusLinkPullRequestField(threadRef));
    expect(document.activeElement).toBe(input());
  });
});
