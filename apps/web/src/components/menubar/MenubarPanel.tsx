import { scopeThreadRef, scopedThreadKey } from "@control/client-runtime/environment";
import type { EnvironmentGroup } from "@control/client-runtime/state/models";
import { type DesktopMenubarAction, isGroupLocked } from "@control/contracts";
import { useAtomValue } from "@effect/atom-react";
import { FolderGit2Icon, GitBranchIcon, MailIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { useClientSettings } from "../../hooks/useSettings";
import { useTheme } from "../../hooks/useTheme";
import { formatContextWindowTokens } from "../../lib/contextWindow";
import { selectProjectGroupingSettings } from "../../logicalProject";
import { deriveProviderEntriesByEnvironment } from "../../providerInstances";
import { buildSidebarProjectSnapshots } from "../../sidebarProjectGrouping";
import { useEnvironmentIdentities, usePrimaryEnvironmentId } from "../../state/environments";
import { useGroups, useProjects } from "../../state/entities";
import { useFullLockUntil } from "../../state/lock";
import { useEnvironmentPresentation } from "../../state/presentation";
import { useEnvironmentQuery } from "../../state/query";
import {
  environmentServerConfigsAtom,
  primaryServerProvidersAtom,
  serverEnvironment,
} from "../../state/server";
import { useUiStateStore } from "../../uiStateStore";
import { getTriggerDisplayModelLabel } from "../chat/providerIconUtils";
import { ControlSprite, EffortMeter, Glyph, Lamp, StairLogo, StateBar } from "../control/bloom";
import { effortLevel, projectMonogram, projectTint, resolveCardState } from "../control/cardState";
import { clockLabel, groupKeyOf, type LockChat } from "../lock/lock.logic";
import { SidebarLockNote } from "../lock/SidebarLockNote";
import { useLockChats, useTrackLockOffer } from "../lock/useLock";
import {
  hasUnseenCompletion,
  resolveSidebarThreadStatus,
  resolveThreadLastVisitedAt,
} from "../Sidebar.logic";
import { SidebarUsageStrip } from "../sidebar/SidebarChrome";
import { SidebarSessionUpdateNote } from "../sidebar/SidebarSessionUpdateNote";
import { sessionUpdateNoteView } from "../sidebar/sessionUpdateNote";
import { menubarIcon, menubarView, settleIcon } from "./menubar.logic";

const act = (action: DesktopMenubarAction) => void window.desktopBridge?.menubar?.act(action);

/**
 * The menu-bar panel (design/hybrid/HANDOFF.md §19.2, §19.3), drawn in its own hidden window. It
 * also works out the item above it and sends it to the desktop app, after the 2 s settle.
 */
export function MenubarPanel() {
  useTheme();
  const until = useFullLockUntil();
  const chats = useLockChats();
  useTrackLockOffer(chats.some((chat) => chat.needs));
  const lockedGroups = useLockedGroups();
  const view = menubarView({
    chats,
    fullLock: until !== null,
    lockedGroupKeys: new Set(lockedGroups.map(groupKeyOf)),
  });
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const connection = useEnvironmentPresentation(primaryEnvironmentId).presentation?.connection;
  const serverUp = primaryEnvironmentId === null || connection?.phase === "connected";
  const updates = useEnvironmentQuery(
    primaryEnvironmentId === null
      ? null
      : serverEnvironment.providerSessionUpdates({
          environmentId: primaryEnvironmentId,
          input: {},
        }),
  );
  const icon = menubarIcon({
    serverUp,
    fullLock: until !== null,
    update: sessionUpdateNoteView(updates.data, false)?.kind === "out",
    view,
  });
  useSettledIcon(icon);
  const { panelRef, sectionsRef, contentRef, overflowing } = useFitWindow();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") act({ type: "close" });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const cards = useCardContext();
  const section = (title: string, list: ReadonlyArray<LockChat>) =>
    list.length === 0 ? null : (
      <div>
        <div className="s-mb-sh">
          {title}
          <span className="t-num">{list.length}</span>
        </div>
        {list.map((chat) => (
          <MenubarCard key={chat.thread.id} chat={chat} context={cards} />
        ))}
      </div>
    );
  const empty =
    view.needs.length + view.working.length + view.done.length === 0 && view.behind === null;

  return (
    <div className="s-mb-root">
      <ControlSprite />
      <div className="t3w t3-bloom t3-d s-mb-host" data-region>
        <div ref={panelRef} className="panel float s-mb-p" role="dialog" aria-label="CONTROL">
          <div className="s-mb-hd">
            <StairLogo />
            <span className="s-mb-wm">CONTROL</span>
            <span className="sp" />
            <ClaudeVersion running={updates.data?.runningVersion} />
          </div>
          {serverUp && until === null ? (
            <>
              <SidebarSessionUpdateNote />
              <SidebarLockNote onLock={() => act({ type: "lock" })} />
              {lockedGroups.map((group) => (
                <div key={groupKeyOf(group)} className="hy-upd s-mb-note">
                  <Glyph id="g-lock" />
                  <span>
                    <b>{group.name}</b> is locked until{" "}
                    <b className="t-num">{clockLabel(Date.parse(group.lockedUntil ?? ""))}</b>
                  </span>
                </div>
              ))}
            </>
          ) : null}
          <div ref={sectionsRef} className="s-mb-secs" data-overflow={overflowing || undefined}>
            <div ref={contentRef}>
              {!serverUp ? (
                <div className="s-mb-empty">
                  <b>Server off</b>
                </div>
              ) : (
                <>
                  {section("Needs you", view.needs)}
                  {section("Working", view.working)}
                  {section("Done", view.done)}
                  {view.behind === null ? null : (
                    <p className="s-mb-behind">
                      {view.behind.working} working and {view.behind.done} done behind the lock.
                    </p>
                  )}
                  {empty ? (
                    <div className="s-mb-empty">
                      <b>Nothing running.</b>No chat needs you, and none has finished since you last
                      looked.
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
          {serverUp ? <SidebarUsageStrip /> : null}
          <div className="s-mb-ft">
            {until === null ? (
              <button type="button" className="pill ghost sm" onClick={() => act({ type: "lock" })}>
                Lock
              </button>
            ) : (
              <span className="s-mb-until">
                <Glyph id="g-lock" />
                until <b>{clockLabel(Date.parse(until))}</b>
              </span>
            )}
            <button type="button" className="pill ghost sm" onClick={() => act({ type: "open" })}>
              Open
            </button>
            <button
              type="button"
              className="pill ghost sm"
              onClick={() => act({ type: "settings" })}
            >
              Settings
            </button>
            <span className="sp" />
            <button type="button" className="pill ghost sm" onClick={() => act({ type: "quit" })}>
              Quit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The header's `Claude 2.1.294`: the version chats run, never the update's (§19), which only the note shows. */
function ClaudeVersion(props: { readonly running: string | null | undefined }) {
  const providers = useAtomValue(primaryServerProvidersAtom);
  const version =
    props.running ?? providers.find((provider) => provider.driver === "claudeAgent")?.version;
  return version ? (
    <span className="s-mb-ver">
      Claude <b>{version}</b>
    </span>
  ) : null;
}

/** Sends the item's state to the desktop app once it has settled. */
function useSettledIcon(icon: ReturnType<typeof menubarIcon>) {
  const settle = useMemo(
    () =>
      settleIcon(
        (next) => void window.desktopBridge?.menubar?.setIcon(next),
        (run, ms) => {
          const timer = setTimeout(run, ms);
          return () => clearTimeout(timer);
        },
      ),
    [],
  );
  useEffect(() => settle(icon));
}

/**
 * Sizes the window to the panel: its natural height, which the desktop app caps at the screen's
 * visible height less 40. Past that the sections scroll under the fade. The panel is capped at
 * the window, so a part that grows or arrives late (the usage strip, a note) changes no size but
 * its own: every part is watched, and what spills past the panel counts.
 */
function useFitWindow() {
  const panelRef = useRef<HTMLDivElement>(null);
  const sectionsRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const sections = sectionsRef.current;
    const content = contentRef.current;
    if (!panel || !sections || !content) return;
    const measure = () => {
      const hidden = content.offsetHeight - sections.clientHeight;
      const spilled = panel.scrollHeight - panel.clientHeight;
      setOverflowing(hidden > 0);
      void window.desktopBridge?.menubar?.resize(Math.ceil(panel.offsetHeight + spilled + hidden));
    };
    const observer = new ResizeObserver(measure);
    const watch = () => {
      observer.disconnect();
      observer.observe(content);
      for (const part of panel.children) observer.observe(part);
    };
    const parts = new MutationObserver(watch);
    parts.observe(panel, { childList: true });
    watch();
    return () => {
      parts.disconnect();
      observer.disconnect();
    };
  }, []);
  return { panelRef, sectionsRef, contentRef, overflowing };
}

/** The groups under a lock still running; re-renders when the next one ends. */
function useLockedGroups(): ReadonlyArray<EnvironmentGroup> {
  const groups = useGroups();
  const [now, setNow] = useState(() => Date.now());
  const locked = groups.filter((group) => isGroupLocked(group, now));
  const nextEnd = Math.min(...locked.map((group) => Date.parse(group.lockedUntil ?? "")));
  useEffect(() => {
    if (!Number.isFinite(nextEnd)) return;
    const timer = setTimeout(() => setNow(Date.now()), nextEnd - Date.now());
    return () => clearTimeout(timer);
  }, [nextEnd]);
  return locked;
}

/** What a card reads beyond its chat: the project's name and tint, and the model's label. */
function useCardContext() {
  const projects = useProjects();
  const groupingSettings = useClientSettings(selectProjectGroupingSettings);
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const environments = useEnvironmentIdentities();
  const serverConfigs = useAtomValue(environmentServerConfigsAtom);
  return useMemo(() => {
    const labels = new Map(environments.map((env) => [env.environmentId, env.label] as const));
    const names = new Map<string, string>(
      buildSidebarProjectSnapshots({
        projects,
        settings: groupingSettings,
        primaryEnvironmentId,
        resolveEnvironmentLabel: (environmentId) => labels.get(environmentId) ?? null,
      }).flatMap((group) =>
        group.memberProjects.map(
          (project) => [`${project.environmentId}:${project.id}`, group.displayName] as const,
        ),
      ),
    );
    return {
      projects: new Map(
        projects.map((project) => [`${project.environmentId}:${project.id}`, project]),
      ),
      names,
      providers: deriveProviderEntriesByEnvironment(
        [...serverConfigs].map(
          ([environmentId, config]) => [environmentId, config.providers, config.settings] as const,
        ),
      ),
    };
  }, [environments, groupingSettings, primaryEnvironmentId, projects, serverConfigs]);
}

/**
 * The sidebar's card (§3.4), as SidebarThreadRow draws it, less its hover actions: the panel
 * changes nothing, and a click opens the chat in the window.
 */
function MenubarCard(props: {
  readonly chat: LockChat;
  readonly context: ReturnType<typeof useCardContext>;
}) {
  const { thread } = props.chat;
  const threadKey = scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
  const localVisit = useUiStateStore((state) => state.threadLastVisitedAtById[threadKey]);
  const lastVisitedAt = resolveThreadLastVisitedAt(thread.lastVisitedAt, localVisit);
  const card = resolveCardState({
    status: resolveSidebarThreadStatus(thread),
    isUnread: hasUnseenCompletion({ ...thread, lastVisitedAt }),
    hasBackgroundWork: thread.pendingBackgroundTasks.length > 0,
    latestRunStatus: thread.latestRun?.status ?? null,
  });
  const projectKey = `${thread.environmentId}:${thread.projectId}`;
  const projectName = props.context.names.get(projectKey) ?? null;
  const instanceId = thread.runtime?.providerInstanceId ?? thread.modelSelection.instanceId;
  const model = props.context.providers
    .get(thread.environmentId)
    ?.get(instanceId)
    ?.models.find((entry) => entry.slug === thread.modelSelection.model);
  const modelLabel = model ? getTriggerDisplayModelLabel(model) : thread.modelSelection.model;
  const effort = effortLevel(thread.modelSelection);
  const tint = props.context.projects.get(projectKey)?.tint ?? projectTint(thread.projectId);
  const open = () =>
    act({ type: "thread", environmentId: thread.environmentId, threadId: thread.id });

  return (
    <div
      role="button"
      tabIndex={0}
      className="t3-card t3d-in"
      data-st={card.st}
      onClick={open}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") open();
      }}
    >
      <div className="t3-l1">
        <span className="t3-fav" style={{ background: `var(--id-${tint})` }}>
          {projectMonogram(projectName ?? "")}
        </span>
        <span className="t3-pj">{projectName}</span>
        <StateBar st={card.st} />
        <Lamp st={card.lamp} />
      </div>
      <div className="d-l2 s-le-root">
        <span className="t3-ttl">{thread.title}</span>
        {thread.openLooseEndCount ? (
          <span className="s-le-cm">
            <MailIcon className="gi" />
            <b>{thread.openLooseEndCount}</b>
          </span>
        ) : null}
        {thread.tokensProcessed === undefined ? null : (
          <span className="d-sw">
            <span className="d-tok">{formatContextWindowTokens(thread.tokensProcessed)}</span>
          </span>
        )}
      </div>
      <div className="t3-l3">
        <span className="d-sw0">{card.words}</span>
        {thread.branch ? (
          <>
            <span>·</span>
            {thread.worktreePath ? (
              <FolderGit2Icon className="gi" />
            ) : (
              <GitBranchIcon className="gi" />
            )}
            <span className="t3-brn">{thread.branch}</span>
          </>
        ) : null}
        <span className="d-model">
          {modelLabel.replace(/^Claude /, "")}
          {effort === null ? null : <EffortMeter level={effort} />}
        </span>
      </div>
    </div>
  );
}
