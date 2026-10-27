import { changeRequestUrlFor as changeRequestWebUrl } from "@control/shared/changeRequestUrl";
export { changeRequestUrlFor as changeRequestWebUrl } from "@control/shared/changeRequestUrl";
import {
  pullRequestHostOf,
  type ScopedThreadRef,
  type SourceControlProviderKind,
} from "@control/contracts";
import { scopedThreadKey } from "@control/client-runtime/environment";
import { useAtomValue } from "@effect/atom-react";
import { LinkIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { parseChangeRequestUrl } from "~/lib/openPullRequestLink";
import { parsePullRequestReference } from "~/pullRequestReference";
import { useProjects, useThreadShell } from "~/state/entities";
import { usePullRequestLinking } from "~/hooks/usePullRequestLinking";
import { useRightPanelStore } from "~/rightPanelStore";
import { appAtomRegistry } from "~/rpc/atomRegistry";
import { Atom } from "effect/reactivity";
import { Button } from "../ui/button";

/** The thread whose link field should take the focus, set by the command palette's Link pull request. */
const linkPullRequestFieldThreadAtom = Atom.make<string | null>(null).pipe(
  Atom.keepAlive,
  Atom.withLabel("pull-requests:link-field-thread"),
);

/** Opens Git › PR on the thread and puts the cursor in its link field (design §22). */
export function focusLinkPullRequestField(threadRef: ScopedThreadRef): void {
  useRightPanelStore.getState().open(threadRef, "pull-requests");
  appAtomRegistry.set(linkPullRequestFieldThreadAtom, scopedThreadKey(threadRef));
}

interface ResolvedLink {
  readonly host: string;
  readonly repository: string;
  readonly number: number;
  readonly url: string;
}

/**
 * Which pull request an input names, or why it cannot. A URL carries its own host and
 * repository and may point at any repository on a host this environment has a project for; a
 * bare `#123` can only mean the thread's own repository.
 */
export function resolveLinkPullRequestInput(input: {
  readonly reference: string;
  readonly project: {
    readonly host: string;
    readonly repository: string;
    readonly webUrl: (number: number) => string | null;
  } | null;
  readonly hasProject: (reference: ResolvedLink) => boolean;
}): { link: ResolvedLink } | { error: string } | null {
  const parsed =
    parseChangeRequestUrl(input.reference.trim()) !== null
      ? input.reference.trim()
      : parsePullRequestReference(input.reference);
  if (parsed === null) return null;
  const url = parseChangeRequestUrl(parsed);
  if (url !== null) {
    if (!input.hasProject({ ...url, url: parsed })) {
      return { error: `No project in this environment can read ${url.host}/${url.repository}.` };
    }
    return {
      link: { host: url.host, repository: url.repository, number: url.number, url: parsed },
    };
  }
  const number = Number(parsed);
  if (!Number.isSafeInteger(number) || number < 1) return null;
  if (input.project === null) {
    return { error: "Paste a full URL to link a pull request from another repository." };
  }
  const webUrl = input.project.webUrl(number);
  const webReference = webUrl === null ? null : parseChangeRequestUrl(webUrl);
  if (webUrl === null || webReference === null) {
    return { error: "Paste a full URL; this project's host has no known pull request URL." };
  }
  return {
    link: { ...webReference, url: webUrl },
  };
}

/**
 * The foot of Git › PR (design §22, SC1): type a pull request's link or number and press Enter to
 * link it to the thread. A URL can point at any repository on a host this environment has a project
 * for; a bare number means the thread's own repository.
 */
export function LinkPullRequestField({ threadRef }: { threadRef: ScopedThreadRef }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [reference, setReference] = useState("");
  const [dirty, setDirty] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const projectId = useThreadShell(threadRef)?.projectId ?? null;
  const projects = useProjects();
  const ownProject = useMemo(() => {
    const project = projects.find(
      (candidate) =>
        candidate.environmentId === threadRef.environmentId && candidate.id === projectId,
    );
    const identity = project?.repositoryIdentity;
    if (!project || !identity) return null;
    const repository =
      identity.displayName ??
      (identity.owner && identity.name ? `${identity.owner}/${identity.name}` : null);
    if (repository === null) return null;
    const kind = identity.provider as SourceControlProviderKind;
    const host = pullRequestHostOf(identity, kind);
    return {
      host,
      repository,
      webUrl: (number: number) =>
        kind === "forgejo" && identity.webUrl
          ? `${identity.webUrl.replace(/\/+$/, "")}/pulls/${number}`
          : changeRequestWebUrl(kind, host, repository, number, identity.locator.remoteUrl),
    };
  }, [projectId, projects, threadRef.environmentId]);
  const linking = usePullRequestLinking(threadRef.environmentId);

  const focusFor = useAtomValue(linkPullRequestFieldThreadAtom);
  useEffect(() => {
    if (focusFor !== scopedThreadKey(threadRef)) return;
    appAtomRegistry.set(linkPullRequestFieldThreadAtom, null);
    inputRef.current?.focus();
  }, [focusFor, threadRef]);

  const resolved = useMemo(
    () =>
      resolveLinkPullRequestInput({
        reference,
        project: ownProject,
        hasProject: (candidate) => linking.canLink(candidate.url),
      }),
    [linking, ownProject, reference],
  );

  const submit = async () => {
    setDirty(true);
    if (pending || resolved === null || "error" in resolved) return;
    setSubmitError(null);
    setPending(true);
    try {
      await linking.changeLink(threadRef, resolved.link.url, true);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Could not link the pull request.");
      return;
    } finally {
      setPending(false);
    }
    setReference("");
    setDirty(false);
  };

  const validation =
    !dirty || reference.trim().length === 0
      ? null
      : resolved === null
        ? "Use a pull request URL, 123, or #123."
        : "error" in resolved
          ? resolved.error
          : null;
  const message = validation ?? submitError;

  return (
    <footer className="s-sc-link">
      <label className="s-sc-lf">
        <LinkIcon aria-hidden />
        <input
          ref={inputRef}
          value={reference}
          disabled={pending}
          aria-label="Link a pull request"
          placeholder="Link a pull request: its link or #number"
          onChange={(event) => {
            setReference(event.target.value);
            setSubmitError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && reference.length > 0) {
              event.stopPropagation();
              setReference("");
              setDirty(false);
            }
            if (event.key !== "Enter") return;
            event.preventDefault();
            void submit();
          }}
        />
      </label>
      <Button
        type="button"
        size="xs"
        variant="ghost"
        disabled={pending || resolved === null || "error" in resolved}
        onClick={() => void submit()}
      >
        {pending ? "Linking..." : "Link"}
      </Button>
      {message !== null ? (
        <p className="s-sc-lm" data-error="">
          {message}
        </p>
      ) : resolved !== null && "link" in resolved ? (
        <p className="s-sc-lm">
          {resolved.link.host}/{resolved.link.repository} #{resolved.link.number}
        </p>
      ) : null}
    </footer>
  );
}
