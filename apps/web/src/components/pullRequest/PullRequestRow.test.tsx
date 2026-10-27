// @vitest-environment jsdom

import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { EnvironmentPullRequestEntry } from "./pullRequestList.logic";
import { PullRequestRow } from "./PullRequestRow";

const entry = (state: "open" | "closed") =>
  ({
    environmentId: "env-1",
    provider: "github",
    host: "github.com",
    projectId: "project-1",
    projectTitle: "control",
    repository: "acme/control",
    title: "Panel: the Git tab holds the pull request",
    number: 5012,
    url: "https://github.com/acme/control/pull/5012",
    author: { login: "mira", name: null, avatarUrl: null },
    headBranch: "feat/pr",
    baseBranch: "main",
    state,
    isDraft: false,
    mergeability: "mergeable",
    additions: 1,
    deletions: 0,
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-02T00:00:00Z",
    viewerReviewRequested: false,
    labels: [],
  }) as unknown as EnvironmentPullRequestEntry;

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

const render = (props: Partial<ComponentProps<typeof PullRequestRow>>) =>
  act(() =>
    root.render(
      <PullRequestRow
        entry={entry("open")}
        showProjectTitle
        showProvider={false}
        onSelect={() => undefined}
        speedMode={false}
        onActed={() => undefined}
        {...props}
      />,
    ),
  );
const pick = () => container.querySelector<HTMLElement>('[aria-label="Pick #5012"]');

describe("picking pull requests to close together", () => {
  it("offers a box on an open row once the list can pick, and says when it is ticked", async () => {
    const onPick = vi.fn();
    await render({});
    expect(pick()).toBeNull();

    await render({ onPick });
    await act(() => pick()!.click());
    expect(onPick).toHaveBeenCalledWith(entry("open"), true);

    await render({ onPick, picked: true });
    expect(pick()!.getAttribute("aria-checked")).toBe("true");
    await act(() => pick()!.click());
    expect(onPick).toHaveBeenLastCalledWith(entry("open"), false);
  });

  it("has nothing to pick on a row that cannot be closed", async () => {
    await render({ entry: entry("closed"), onPick: vi.fn() });
    expect(pick()).toBeNull();
  });
});
