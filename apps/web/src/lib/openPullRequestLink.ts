import type { EnvironmentId, PullRequestRef, ScopedThreadRef } from "@control/contracts";
import { useAtomValue } from "@effect/atom-react";
import { type MouseEvent, useCallback, useMemo } from "react";

import { pullRequestHostOf, type SourceControlProviderKind } from "@control/contracts";
import { parseChangeRequestUrl, type ChangeRequestLink } from "@control/shared/changeRequestUrl";
import {
  canonicalRepositoryKey,
  sourceControlRepositorySelector,
} from "@control/shared/sourceControl";

import { useOpenLink } from "../browser/useOpenLink";
import { stackedThreadToast, toastManager } from "../components/ui/toast";
import { useRightPanelStore } from "../rightPanelStore";
import type { EnvironmentProject } from "@control/client-runtime/state/shell";

import { useProjects, useServerConfigs } from "../state/entities";
import { serverEnvironment } from "../state/server";

export {
  parseChangeRequestUrl,
  type ChangeRequestLink,
  gitHubPullRequestBrowserUrl,
  pullRequestCandidateUrlFromReferenceAutolink,
  matchesLinkedPullRequestUrl,
  changeRequestRepositoryUrl,
} from "@control/shared/changeRequestUrl";

function resolvedForgejoRepository(project: EnvironmentProject): URL | null {
  const identity = project.repositoryIdentity;
  if (identity?.provider !== "forgejo" || !identity.webUrl) return null;
  try {
    const url = new URL(identity.webUrl);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/** Keep Forgejo servers on different HTTP ports separate when selecting a project. */
function matchesChangeRequestAuthority(
  project: EnvironmentProject,
  link: ChangeRequestLink,
): boolean {
  if (link.authority === undefined) return true;
  try {
    const remote = new URL(project.repositoryIdentity?.locator.remoteUrl ?? "");
    if (remote.protocol === "http:" || remote.protocol === "https:") {
      return remote.host.toLowerCase() === link.authority;
    }
  } catch {
    // SSH remotes do not specify the server's HTTP port; tea resolves the configured login.
  }
  return true;
}

/**
 * The project a link belongs to, or nothing. Matched the way the server matches: the repository
 * identity is the full path below the host where one was recorded — which is what nested GitLab
 * groups and Azure project paths need — and the host is the first segment of the canonical
 * remote, so github.com and an Enterprise install stay apart.
 */
export function findProjectForChangeRequest(
  projects: ReadonlyArray<EnvironmentProject>,
  link: ChangeRequestLink,
): EnvironmentProject | undefined {
  return projects.find((project) => {
    const identity = project.repositoryIdentity;
    if (!identity || !matchesChangeRequestAuthority(project, link)) return false;
    const kind = identity.provider as SourceControlProviderKind | undefined;
    if (kind === undefined) return false;
    const web = resolvedForgejoRepository(project);
    if (web)
      return (
        web.host.toLowerCase() === (link.authority ?? link.host).toLowerCase() &&
        web.pathname.replace(/^\/+|\/+$/g, "").toLowerCase() === link.repository.toLowerCase()
      );
    if (kind === "azure-devops") {
      return (
        canonicalRepositoryKey(identity.canonicalKey.toLowerCase()) ===
        canonicalRepositoryKey(`${link.host}/${link.repository}`.toLowerCase())
      );
    }
    const repository =
      identity.displayName ??
      (identity.owner && identity.name ? `${identity.owner}/${identity.name}` : null);
    return (
      repository !== null &&
      repository.toLowerCase() === link.repository.toLowerCase() &&
      (pullRequestHostOf(identity, kind) === link.host.toLowerCase() ||
        pullRequestHostOf(identity, kind) === link.authority)
    );
  });
}

export function resolvePullRequestPreviewTarget({
  environmentId,
  projects,
  pullRequestsEnabled,
  url,
}: {
  environmentId: EnvironmentId | null;
  projects: ReadonlyArray<EnvironmentProject>;
  pullRequestsEnabled: boolean;
  url: string;
}): { environmentId: EnvironmentId; input: PullRequestRef } | null {
  if (!pullRequestsEnabled || environmentId === null) return null;
  const parsed = parseChangeRequestUrl(url);
  if (parsed === null) return null;
  const project = findProjectForChangeRequest(
    projects.filter((candidate) => candidate.environmentId === environmentId),
    parsed,
  );
  if (project === undefined) return null;
  return {
    environmentId,
    input: {
      projectId: project.id,
      host: parsed.authority ?? parsed.host,
      repository: sourceControlRepositorySelector(project.repositoryIdentity) ?? parsed.repository,
      number: parsed.number,
    },
  };
}

export function usePullRequestPreviewTarget(environmentId: EnvironmentId | null, url: string) {
  const projects = useProjects();
  const serverConfig = useAtomValue(serverEnvironment.configValueAtom(environmentId));
  return useMemo(
    () =>
      resolvePullRequestPreviewTarget({
        environmentId,
        projects,
        pullRequestsEnabled: serverConfig?.environment.capabilities.pullRequests === true,
        url,
      }),
    [environmentId, projects, serverConfig, url],
  );
}

/**
 * Any project checked out from the link's host. Thread links are host-level, so a pull request
 * from a repository nobody has checked out is still linkable as long as one project on that
 * host can lend the server its credentials. The link's own project, when it exists, comes first.
 */
export function findProjectOnChangeRequestHost(
  projects: ReadonlyArray<EnvironmentProject>,
  link: ChangeRequestLink,
): EnvironmentProject | undefined {
  const own = findProjectForChangeRequest(projects, link);
  if (own !== undefined) return own;
  // Azure CLI reads use the checkout's organization and project, not host-wide credentials.
  if (
    canonicalRepositoryKey(`${link.host}/${link.repository}`.toLowerCase()).startsWith(
      "dev.azure.com/",
    )
  )
    return undefined;
  return projects.find((project) => {
    const identity = project.repositoryIdentity;
    const kind = identity?.provider as SourceControlProviderKind | undefined;
    const web = resolvedForgejoRepository(project);
    if (web) {
      const mount = web.pathname
        .replace(/^\/+|\/+$/g, "")
        .split("/")
        .slice(0, -2)
        .join("/");
      return (
        web.host.toLowerCase() === (link.authority ?? link.host).toLowerCase() &&
        (!mount || link.repository.toLowerCase().startsWith(`${mount.toLowerCase()}/`))
      );
    }
    return (
      identity != null &&
      kind !== undefined &&
      kind !== "azure-devops" &&
      matchesChangeRequestAuthority(project, link) &&
      (pullRequestHostOf(identity, kind) === link.host.toLowerCase() ||
        pullRequestHostOf(identity, kind) === link.authority)
    );
  });
}

/**
 * Opens a change request link in the thread's Git › PR view, and says whether it did. Anything
 * else — another organisation's repository, a host nothing here is checked out from, a link that
 * merely looks like one, or a link outside any thread — is left alone for the caller to handle as
 * the ordinary link it is.
 *
 * Resolving the project here is what makes recognising a URL safe: a lookalike hostname matches
 * no project and stays a link. Any change request opens in the panel, not only the thread's own,
 * since the panel is told which one to show.
 */
/** Cmd/Ctrl-click and middle-click send a pull request to the browser instead of the panel. */
export function shouldOpenPullRequestExternally(
  event: Pick<MouseEvent<HTMLElement>, "metaKey" | "ctrlKey"> &
    Partial<Pick<MouseEvent<HTMLElement>, "button">>,
): boolean {
  return event.metaKey || event.ctrlKey || event.button === 1;
}

export function useOpenChangeRequestLink(
  threadRef?: ScopedThreadRef,
): (
  event: Pick<
    MouseEvent<HTMLElement>,
    "preventDefault" | "stopPropagation" | "metaKey" | "ctrlKey"
  >,
  targetUrl: string,
  targetThreadRef?: ScopedThreadRef,
) => boolean {
  const allProjects = useProjects();
  const serverConfigs = useServerConfigs();
  return useCallback(
    (event, targetUrl, targetThreadRef) => {
      if (shouldOpenPullRequestExternally(event)) return false;
      const resolvedThreadRef = targetThreadRef ?? threadRef;
      const parsed = parseChangeRequestUrl(targetUrl);
      // Outside a thread there is no panel to show it in, so the host opens it.
      if (parsed === null || !resolvedThreadRef) return false;
      const reads = (environmentId: string) =>
        serverConfigs.get(environmentId as EnvironmentId)?.environment.capabilities.pullRequests ===
        true;
      // Beside a thread the panel reads on that thread's environment, so a project from another
      // one could not be read there whatever its remote says: two environments can hold the same
      // repository, and handing the panel the wrong one's id opens a surface that never loads.
      const projects = allProjects.filter(
        (project) => project.environmentId === resolvedThreadRef.environmentId,
      );
      const project =
        findProjectForChangeRequest(projects, parsed) ??
        findProjectOnChangeRequestHost(
          projects.filter(
            (candidate) =>
              serverConfigs.get(candidate.environmentId)?.environment.capabilities
                .threadPullRequests === true,
          ),
          parsed,
        );
      if (project === undefined || !reads(project.environmentId)) return false;
      const threadPullRequests =
        serverConfigs.get(project.environmentId)?.environment.capabilities.threadPullRequests ===
        true;
      event.preventDefault();
      event.stopPropagation();
      useRightPanelStore.getState().openPullRequest(resolvedThreadRef, {
        projectId: project.id,
        ...(threadPullRequests ? { host: parsed.authority ?? parsed.host } : {}),
        repository: threadPullRequests
          ? parsed.repository
          : (sourceControlRepositorySelector(project.repositoryIdentity) ?? parsed.repository),
        url: targetUrl,
        number: parsed.number,
      });
      return true;
    },
    [allProjects, serverConfigs, threadRef],
  );
}

export function useOpenPrLink(threadRef?: ScopedThreadRef) {
  const openChangeRequest = useOpenChangeRequestLink(threadRef);
  const openLink = useOpenLink(threadRef);
  return useCallback(
    (event: MouseEvent<HTMLElement>, prUrl: string, targetThreadRef?: ScopedThreadRef) => {
      // Buttons also pass this to onAuxClick for middle-click; a right-click is not an open.
      if (event.button > 1) return false;
      event.stopPropagation();
      const openInBrowser = shouldOpenPullRequestExternally(event);
      const isAnchor =
        event.currentTarget instanceof HTMLAnchorElement && event.currentTarget.href.length > 0;
      // A real link already knows how to cmd/ctrl/middle-click. Leave its default
      // action alone so the browser (or Electron's window-open handler) opens
      // the host. Buttons have no href, so they still go through openExternal.
      if (openInBrowser && isAnchor) return false;

      event.preventDefault();
      if (!openInBrowser && openChangeRequest(event, prUrl, targetThreadRef)) return true;

      // No project to show it in, so it is an ordinary link and follows the
      // "Open links in" setting; the modifier still forces the system browser.
      void openLink(prUrl, { event, threadRef: targetThreadRef }).catch((error: unknown) => {
        console.error(error);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Unable to open pull request link",
            description: error instanceof Error ? error.message : "An error occurred.",
          }),
        );
      });
      return false;
    },
    [openChangeRequest, openLink],
  );
}
