import { pullRequestHostOf, type SourceControlProviderKind } from "@control/contracts";
import type { EnvironmentThreadShell } from "@control/client-runtime/state/shell";
import { useProjects, useServerConfigs, useThreadShells } from "~/state/entities";
import {
  threadPullRequestKeysEqual,
  visibleThreadPullRequests,
} from "@control/shared/threadPullRequests";
import type {
  ContextMenuItem,
  EnvironmentId,
  PreviewSessionSnapshot,
  ProjectId,
  PullRequestState,
  ResolvedKeybindingsConfig,
} from "@control/contracts";
import { getTerminalLabel } from "@control/shared/terminalLabels";
import {
  FileDiff,
  FileOutput,
  Files,
  Globe,
  type LucideIcon,
  Plus,
  Smartphone,
  SquareTerminal,
} from "lucide-react";
import { Volume2, VolumeOff } from "lucide";
import {
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";

import { isElectron } from "~/env";
import type { DesktopPreviewOverlay } from "~/previewStateStore";
import {
  type PanelTab,
  panelTabOf,
  type RightPanelKind,
  type RightPanelSurface,
} from "~/rightPanelStore";
import { cn } from "~/lib/utils";
import { resolveShortcutCommand, type ShortcutMatchContext } from "~/keybindings";
import { readLocalApi } from "~/localApi";
import { MorphIcon } from "~/components/MorphIcon";
import { AndroidIcon, AppleIcon } from "~/components/Icons";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
  MenuTrigger,
} from "~/components/ui/menu";
import { useBrowserDefaults } from "~/browser/browserDefaults";
import { ScrollArea } from "~/components/ui/scroll-area";
import { PanelTabCloseButton } from "~/components/ui/panel-tab-close-button";
import { faviconUrlForOrigin } from "~/lib/favicon";
import { useTheme } from "~/hooks/useTheme";
import { useDeviceState } from "~/state/device";
import type { PreviewPanelInlineSize } from "~/hooks/usePreviewPanelInlineSize";
import {
  newestPullRequestSummary,
  pullRequestEnvironment,
  useSharedPullRequestSummary,
} from "~/state/pullRequests";
import { useEnvironmentQuery } from "~/state/query";
import { COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS } from "~/workspaceTitlebar";

import { PreviewPanelShell, type PreviewPanelMode } from "./preview/PreviewPanelShell";
import { FaviconImage } from "./preview/PreviewFaviconIcon";
import { previewBridge } from "./preview/previewBridge";
import { PierreEntryIcon } from "./chat/PierreEntryIcon";
import { Seg } from "./Seg";
import { resolvePullRequestState } from "./pullRequest/pullRequestPresentation";
import { PullRequestGlyph } from "~/components/pullRequest/pullRequestIcons";

interface RightPanelTabsProps {
  mode: PreviewPanelMode;
  maximized?: boolean;
  open?: boolean;
  keybindings: ResolvedKeybindingsConfig;
  getShortcutContext: () => ShortcutMatchContext;
  /** Forwarded to PreviewPanelShell so this surface persists its own width. */
  widthStorageKey?: string;
  /** Forwarded to PreviewPanelShell as the initial width before a user resize. */
  defaultWidth?: number;
  inlineSize?: PreviewPanelInlineSize;
  layoutControls?: ReactNode;
  surfaces: readonly RightPanelSurface[];
  /** Fallback environment for surfaces that do not carry their own. */
  environmentId: EnvironmentId | null;
  activeSurfaceId: string | null;
  pendingSurfaceIds: ReadonlySet<string>;
  previewSessions: Readonly<Record<string, PreviewSessionSnapshot>>;
  desktopByTabId: Readonly<Record<string, DesktopPreviewOverlay>>;
  /**
   * Maps a server session tab id to the desktop runtime tab id the Electron
   * preview manager is keyed by. Session ids are only unique within one server
   * process, so desktop operations must not be addressed with them.
   */
  previewRuntimeTabId?: ((tabId: string) => string) | undefined;
  terminalLabelsById: ReadonlyMap<string, string>;
  onActivate: (surface: RightPanelSurface) => void;
  onRenameDevice?: (surfaceId: string, title: string) => void;
  onCloseSurface: (surface: RightPanelSurface) => void;
  /** The bulk closes act within the surface's own tab. */
  onCloseOtherSurfaces: (surface: RightPanelSurface) => void;
  onCloseSurfacesToRight: (surface: RightPanelSurface) => void;
  /** Closes every surface under the given surface's tab. */
  onCloseAllSurfaces: (surface: RightPanelSurface) => void;
  onCopyFilePath: (relativePath: string) => void;
  onAddBrowser: () => void;
  /**
   * Separate from `onAddBrowser` on purpose: that one is passed directly as a
   * DOM click handler, and a `(profileId?: string)` signature would silently
   * accept the MouseEvent as a profile id.
   */
  onAddBrowserInProfile: (profileId: string) => void;
  onAddTerminal: () => void;
  /** Git's Diff, when it is not open yet. */
  onAddDiff: () => void;
  /** Git's Graph, when it is not open yet. */
  onAddGraph: () => void;
  /** Git's PR view: the thread's pull requests and every project's (design §22). */
  onAddPullRequests: () => void;
  onAddDevice: () => void;
  browserAvailable: boolean;
  terminalAvailable: boolean;
  pullRequestsAvailable: boolean;
  deviceAvailable: boolean;
  /**
   * The thread panel's five icon tabs (design §5.1). Left out, the panel shows its surfaces as
   * one row of chips, as the pull-request page does.
   */
  tabs?: PanelTabsConfig;
  pullRequestStatusSeeds?: Readonly<Record<string, PullRequestTabStatusSeed>>;
  children: ReactNode;
}

export interface PullRequestTabStatus {
  projectId: string;
  repository: string;
  number: number;
  state: PullRequestState;
  isDraft: boolean;
}

export interface PanelTabsConfig {
  /** The tab on show; with no surface open, the default view's tab. */
  selected: PanelTab;
  /** The view on show, which may be the default one rather than an open surface. */
  shownKind: RightPanelKind;
  /** Why a tab can't open here; a tab missing from this map can. */
  unavailable: Partial<Record<PanelTab, string>>;
  onSelect: (tab: PanelTab) => void;
}

/** §5.1's tabs, in order, with §20.2's icons. */
const PANEL_TAB_LOOKS: ReadonlyArray<{ tab: PanelTab; label: string; Icon: LucideIcon }> = [
  { tab: "outputs", label: "Outputs", Icon: FileOutput },
  { tab: "folder", label: "Folder", Icon: Files },
  { tab: "browser", label: "Browser", Icon: Globe },
  { tab: "git", label: "Git", Icon: FileDiff },
  { tab: "terminal", label: "Terminal", Icon: SquareTerminal },
];

export type PullRequestTabStatusSeed = Pick<PullRequestTabStatus, "state" | "isDraft">;

export function shouldOpenDefaultBrowserProfileFromMenuClick(
  pointerType: string | undefined,
): boolean {
  return pointerType !== "touch";
}

type GitView = "Graph" | "Diff" | "PR";

const SURFACE_DISABLED_REASONS = {
  browser: "Browser previews are only available in the Control desktop app.",
  device: "Devices are only available from a thread.",
} as const;

/** Overlays that keep the new-tab shortcut for themselves. */
const POPUP_LAYERS = [
  '[data-slot="dialog-popup"]',
  '[data-slot="alert-dialog-popup"]',
  '[data-slot="command-dialog-popup"]',
  '[data-slot="menu-popup"]',
  '[data-slot="select-popup"]',
  '[data-slot="popover-popup"]',
  '[data-slot="combobox-popup"]',
  '[data-slot="autocomplete-popup"]',
].join(",");

type TabContextMenuAction =
  | "rename"
  | "copy-path"
  | "toggle-mute"
  | "close"
  | "close-others"
  | "close-to-right"
  | "close-all";

function tabScrollViewport(root: HTMLDivElement | null): HTMLDivElement | null {
  return root?.querySelector<HTMLDivElement>('[data-slot="scroll-area-viewport"]') ?? null;
}

/**
 * Desktop preview tab backing a surface, or null for non-preview surfaces, the
 * "new browser tab" placeholder, and the web build where no desktop tab exists.
 */
function previewTabIdOf(
  surface: RightPanelSurface,
  sessions: Readonly<Record<string, PreviewSessionSnapshot>>,
): string | null {
  if (surface.kind !== "preview" || !surface.resourceId) return null;
  return sessions[surface.resourceId]?.tabId ?? null;
}

/**
 * Label and enabled state for a preview tab's mute menu entry.
 * Stays disabled until desktop overlay state arrives: a server session id can
 * resolve while the preview manager's createTab is still in flight, and muting
 * then fails with a PreviewTabNotFoundError nothing surfaces to the user.
 */
export function tabMuteMenuItem(input: {
  overlay: DesktopPreviewOverlay | null;
  canResolveRuntimeTabId: boolean;
}): { label: string; disabled: boolean } {
  const muted = input.overlay?.audioMuted ?? false;
  return {
    label: muted ? "Unmute tab" : "Mute tab",
    disabled: input.overlay === null || !input.canResolveRuntimeTabId,
  };
}

type TabAudioState = "none" | "audible" | "muted";

/**
 * A muted tab that is not making sound shows nothing: mute is armed silently,
 * and the indicator only appears once there is audio to speak of.
 */
function tabAudioState(overlay: DesktopPreviewOverlay | null): TabAudioState {
  if (!overlay?.audible) return "none";
  return overlay.audioMuted ? "muted" : "audible";
}

function DisabledReasonTooltip(props: { reason: string; trigger: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={props.trigger} />
      <TooltipPopup side="top">{props.reason}</TooltipPopup>
    </Tooltip>
  );
}

function SurfaceMenuItem(props: {
  available: boolean;
  disabledReason?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  const item = (
    <MenuItem
      className={!props.available ? "data-disabled:pointer-events-auto" : undefined}
      onClick={props.onClick}
      disabled={!props.available}
    >
      {props.children}
    </MenuItem>
  );
  if (props.available || !props.disabledReason) return item;
  return <DisabledReasonTooltip reason={props.disabledReason} trigger={item} />;
}

function surfaceTitle(
  surface: RightPanelSurface,
  sessions: Readonly<Record<string, PreviewSessionSnapshot>>,
  terminalLabelsById: ReadonlyMap<string, string>,
): string {
  switch (surface.kind) {
    case "outputs":
      return "Outputs";
    case "graph":
      return "Graph";
    case "diff":
      return "Diff";
    case "files":
      return "Files";
    case "file":
      return surface.relativePath.slice(
        Math.max(surface.relativePath.lastIndexOf("/"), surface.relativePath.lastIndexOf("\\")) + 1,
      );
    case "terminal":
      return (
        terminalLabelsById.get(surface.activeTerminalId) ??
        getTerminalLabel(surface.activeTerminalId)
      );
    case "pull-request":
      return `#${surface.number}`;
    case "pull-requests":
      return "Pull requests";
    case "device":
      return surface.title ?? surface.target?.name ?? "Device";
    case "preview": {
      const snapshot = surface.resourceId ? sessions[surface.resourceId] : null;
      if (!snapshot || snapshot.navStatus._tag === "Idle") return "Browser";
      if (snapshot.navStatus.title.trim().length > 0) return snapshot.navStatus.title;
      try {
        return new URL(snapshot.navStatus.url).host || "Browser";
      } catch {
        return "Browser";
      }
    }
  }
}

function PreviewFavicon({ capturedUrl, url }: { capturedUrl: string | null; url: string | null }) {
  const publicProviderUrl = faviconUrlForOrigin(url, 32);
  return (
    <FaviconImage
      sources={[capturedUrl, publicProviderUrl]}
      fallback={<Globe className="size-3 shrink-0" />}
      className="size-3 shrink-0 rounded-sm object-contain"
    />
  );
}

function sameOrigin(left: string, right: string): boolean {
  try {
    return new URL(left).origin === new URL(right).origin;
  } catch {
    return false;
  }
}

function SurfaceIcon({
  surface,
  sessions,
  desktopByTabId,
  theme,
  environmentId,
  pullRequestStatusSeeds,
}: {
  surface: RightPanelSurface;
  sessions: Readonly<Record<string, PreviewSessionSnapshot>>;
  desktopByTabId: Readonly<Record<string, DesktopPreviewOverlay>>;
  theme: "light" | "dark";
  environmentId: EnvironmentId | null;
  pullRequestStatusSeeds: Readonly<Record<string, PullRequestTabStatusSeed>> | undefined;
}) {
  switch (surface.kind) {
    case "preview": {
      const snapshot = surface.resourceId ? sessions[surface.resourceId] : null;
      const url = !snapshot || snapshot.navStatus._tag === "Idle" ? null : snapshot.navStatus.url;
      const favicon = snapshot ? (desktopByTabId[snapshot.tabId]?.favicon ?? null) : null;
      const capturedUrl =
        favicon && url && sameOrigin(favicon.pageUrl, url) ? favicon.dataUrl : null;
      return <PreviewFavicon capturedUrl={capturedUrl} url={url} />;
    }
    case "outputs":
      return <FileOutput className="size-3 shrink-0" />;
    case "graph":
    case "diff":
      return <FileDiff className="size-3 shrink-0" />;
    case "files":
      return <Files className="size-3 shrink-0" />;
    case "file":
      return (
        <PierreEntryIcon
          pathValue={surface.relativePath}
          kind="file"
          theme={theme}
          className="size-3"
        />
      );
    case "terminal":
      return <SquareTerminal className="size-3 shrink-0" />;
    case "pull-request":
      return (
        <PullRequestSurfaceIcon
          surface={surface}
          environmentId={environmentId}
          seed={pullRequestStatusSeeds?.[surface.id]}
        />
      );
    case "pull-requests":
      return <PullRequestGlyph.link className="size-3 shrink-0" />;
    case "device":
      return surface.target?.platform === "ios" ? (
        <AppleIcon className="size-3 shrink-0" />
      ) : surface.target?.platform === "android" ? (
        <AndroidIcon className="size-3 shrink-0" />
      ) : (
        <Smartphone className="size-3 shrink-0" />
      );
  }
}

export function resolvePullRequestTabLink(
  threads: readonly Pick<EnvironmentThreadShell, "environmentId" | "pullRequests">[],
  environmentId: EnvironmentId | null,
  host: string | null,
  reference: { repository: string; number: number },
) {
  if (environmentId === null || host === null) return undefined;
  let newest: EnvironmentThreadShell["pullRequests"][number] | undefined;
  for (const thread of threads) {
    if (thread.environmentId !== environmentId) continue;
    for (const link of visibleThreadPullRequests(thread.pullRequests)) {
      if (
        !threadPullRequestKeysEqual(link, {
          host,
          repository: reference.repository,
          number: reference.number,
        })
      )
        continue;
      if (
        newest === undefined ||
        (link.snapshot?.syncedAt ?? "") > (newest.snapshot?.syncedAt ?? "")
      )
        newest = link;
    }
  }
  return newest;
}

function PullRequestSurfaceIcon({
  surface,
  environmentId,
  seed,
}: {
  surface: Extract<RightPanelSurface, { kind: "pull-request" }>;
  environmentId: EnvironmentId | null;
  seed: PullRequestTabStatusSeed | undefined;
}) {
  const resolvedEnvironmentId =
    (surface.environmentId as EnvironmentId | undefined) ?? environmentId;
  const projects = useProjects();
  const threads = useThreadShells();
  const project = projects.find(
    (entry) => entry.environmentId === resolvedEnvironmentId && entry.id === surface.projectId,
  );
  const identity = project?.repositoryIdentity;
  const host =
    surface.host ??
    (identity?.provider
      ? pullRequestHostOf(identity, identity.provider as SourceControlProviderKind)
      : null);
  const configs = useServerConfigs();
  const capabilities =
    resolvedEnvironmentId === null
      ? undefined
      : configs.get(resolvedEnvironmentId)?.environment.capabilities;
  const linkedSnapshot =
    capabilities?.threadPullRequests === true
      ? (resolvePullRequestTabLink(threads, resolvedEnvironmentId, host, surface)?.snapshot ?? null)
      : null;
  const detail = useEnvironmentQuery(
    resolvedEnvironmentId === null || capabilities?.pullRequests !== true || linkedSnapshot !== null
      ? null
      : pullRequestEnvironment.detail({
          environmentId: resolvedEnvironmentId,
          input: {
            projectId: surface.projectId as ProjectId,
            ...(capabilities?.threadPullRequests === true && surface.host !== undefined
              ? { host: surface.host }
              : {}),
            repository: surface.repository,
            number: surface.number,
          },
        }),
  ).data;
  const reference = useMemo(
    () => ({
      projectId: surface.projectId as ProjectId,
      repository: surface.repository,
      number: surface.number,
    }),
    [surface.projectId, surface.repository, surface.number],
  );
  const sharedSummary = useSharedPullRequestSummary(resolvedEnvironmentId, reference, null);
  // The compact tab intentionally shows lifecycle and draft state only. Conflict warnings have
  // their own presentation on surfaces that have mergeability, while this tab stays stable as
  // detail data arrives.
  const status = linkedSnapshot ?? newestPullRequestSummary(detail, sharedSummary) ?? seed ?? null;
  if (status === null) {
    return <PullRequestGlyph.pullRequest className="size-3 shrink-0 text-muted-foreground" />;
  }
  const presentation = resolvePullRequestState({
    state: status.state,
    isDraft: status.isDraft ?? detail?.isDraft ?? seed?.isDraft ?? false,
  });
  return <presentation.Icon className={cn("size-3 shrink-0", presentation.toneClassName)} />;
}

export function RightPanelTabs(props: RightPanelTabsProps) {
  const ownsDesktopTitleBar = isElectron && props.mode === "inline";
  const browserProfiles = useBrowserDefaults().profiles;
  const { resolvedTheme } = useTheme();
  const chipListRef = useRef<HTMLDivElement>(null);
  const [renamingDevice, setRenamingDevice] = useState<string | null>(null);

  const tab = props.tabs?.selected ?? null;
  const tabSurfaces =
    tab === null
      ? props.surfaces
      : props.surfaces.filter((surface) => panelTabOf(surface.kind) === tab);
  // What a tab's + opens. Folder, Git's diff and Outputs are one view each, opened by the tab
  // itself; the terminal's own toolbar adds shells.
  const addActions =
    tab === "browser"
      ? [
          {
            label: "Page",
            icon: Globe,
            available: props.browserAvailable,
            disabledReason: SURFACE_DISABLED_REASONS.browser,
            onClick: props.onAddBrowser,
          },
          {
            label: "Device",
            icon: Smartphone,
            available: props.deviceAvailable,
            disabledReason: SURFACE_DISABLED_REASONS.device,
            onClick: props.onAddDevice,
          },
        ]
      : [];
  const canAdd = addActions.some((action) => action.available);
  // Git switches its views with Graph | Diff | PR (design §5.2, §22); PR where pull requests can
  // be read.
  const gitPullRequest = tabSurfaces.find(
    (surface) => surface.kind === "pull-request" || surface.kind === "pull-requests",
  );
  const showGitSwitch = tab === "git";
  const gitViews: readonly GitView[] =
    props.pullRequestsAvailable || gitPullRequest !== undefined
      ? ["Graph", "Diff", "PR"]
      : ["Graph", "Diff"];
  // A tab shows its own row of chips once it holds more than one surface, or has something to add.
  // Folder keeps its row with Files alone, so the first opened file doesn't push the tree down;
  // Terminal with one shell, so the row always says which shell is on show (design §5.6).
  const showChips =
    tab !== "git" &&
    (tab === null || tab === "folder" || tab === "terminal" || tabSurfaces.length > 1 || canAdd);

  // The new-tab shortcut opens what the tab on show opens: a shell in Terminal, a page elsewhere.
  const onNewTabKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing) return;
    if (
      resolveShortcutCommand(event, props.keybindings, {
        context: { ...props.getShortcutContext(), rightPanelOpen: true },
      }) !== "rightPanel.new"
    )
      return;
    if (document.querySelector(POPUP_LAYERS)) return;
    const add =
      tab === "terminal" && props.terminalAvailable
        ? props.onAddTerminal
        : props.browserAvailable
          ? props.onAddBrowser
          : null;
    if (add === null) return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) add();
  });
  const hasTabs = props.tabs !== undefined;
  useEffect(() => {
    if (props.open === false || !hasTabs) return;
    document.addEventListener("keydown", onNewTabKeyDown, true);
    return () => document.removeEventListener("keydown", onNewTabKeyDown, true);
  }, [props.open, hasTabs]);

  const handleTabContextMenu = useCallback(
    async (event: ReactMouseEvent, surface: RightPanelSurface) => {
      event.preventDefault();
      event.stopPropagation();

      const api = readLocalApi();
      if (!api) return;

      const surfaceIndex = tabSurfaces.findIndex((entry) => entry.id === surface.id);
      if (surfaceIndex < 0) return;

      const items: ContextMenuItem<TabContextMenuAction>[] = [];
      if (surface.kind === "device" && props.onRenameDevice)
        items.push({ id: "rename", label: "Rename" });
      if (surface.kind === "file" && surface.attachment === undefined) {
        items.push({ id: "copy-path", label: "Copy path" });
      }
      const menuPreviewTabId = previewTabIdOf(surface, props.previewSessions);
      // Desktop overlay state only arrives once the preview manager has created
      // the tab. A server session id alone can still be ahead of that, and
      // muting then fails with PreviewTabNotFoundError that nobody surfaces.
      const menuOverlay = menuPreviewTabId
        ? (props.desktopByTabId[menuPreviewTabId] ?? null)
        : null;
      const menuMuted = menuOverlay?.audioMuted ?? false;
      if (surface.kind === "preview") {
        // Not gated on audibility: silencing a quiet tab ahead of time is the
        // point, so the item is offered whenever the tab is mutable at all.
        items.push({
          id: "toggle-mute",
          ...tabMuteMenuItem({
            overlay: menuOverlay,
            canResolveRuntimeTabId: props.previewRuntimeTabId !== undefined,
          }),
        });
      }
      items.push(
        { id: "close", label: "Close" },
        {
          id: "close-others",
          label: "Close others",
          disabled: tabSurfaces.length <= 1,
        },
        {
          id: "close-to-right",
          label: "Close to the right",
          disabled: surfaceIndex >= tabSurfaces.length - 1,
        },
        { id: "close-all", label: "Close all" },
      );

      const action = await api.contextMenu.show(items, { x: event.clientX, y: event.clientY });
      switch (action) {
        case "rename":
          setRenamingDevice(surface.id);
          break;
        case "copy-path":
          if (surface.kind === "file" && surface.attachment === undefined) {
            props.onCopyFilePath(surface.relativePath);
          }
          break;
        case "toggle-mute": {
          // menuOverlay repeats the disabled gate above: the desktop tab must
          // exist before it can be addressed, however the menu was dismissed.
          const runtimeTabId =
            menuPreviewTabId && menuOverlay
              ? (props.previewRuntimeTabId?.(menuPreviewTabId) ?? null)
              : null;
          if (runtimeTabId) {
            void previewBridge?.setAudioMuted(runtimeTabId, !menuMuted).catch(() => undefined);
          }
          break;
        }
        case "close":
          props.onCloseSurface(surface);
          break;
        case "close-others":
          props.onCloseOtherSurfaces(surface);
          break;
        case "close-to-right":
          props.onCloseSurfacesToRight(surface);
          break;
        case "close-all":
          props.onCloseAllSurfaces(surface);
          break;
        case null:
          break;
      }
    },
    [props, tabSurfaces],
  );
  const handleTabMouseDown = useCallback((event: ReactMouseEvent) => {
    if (event.button !== 1) return;
    event.preventDefault();
  }, []);
  const handleTabAuxClick = useCallback(
    (event: ReactMouseEvent, surface: RightPanelSurface) => {
      if (event.button !== 1) return;
      event.preventDefault();
      event.stopPropagation();
      props.onCloseSurface(surface);
    },
    [props],
  );

  useEffect(() => {
    if (!props.activeSurfaceId) return;
    const activeChip = chipListRef.current?.querySelector<HTMLElement>("[data-active-tab='true']");
    activeChip?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [props.activeSurfaceId]);

  useEffect(() => {
    const viewport = tabScrollViewport(chipListRef.current);
    if (!viewport) return;

    // A mouse wheel scrolls the chips sideways.
    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return;
      let delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) delta *= 16;
      if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) delta *= viewport.clientWidth;
      if (delta === 0) return;

      const previousScrollLeft = viewport.scrollLeft;
      viewport.scrollLeft += delta;
      if (viewport.scrollLeft === previousScrollLeft) return;
      event.preventDefault();
    };

    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleWheel);
  }, [showChips]);

  const terminalNumber = (surface: RightPanelSurface) =>
    tabSurfaces
      .filter((entry) => entry.kind === "terminal")
      .findIndex((entry) => entry.id === surface.id) + 1;

  const chips = (
    <ScrollArea
      radius="none"
      ref={chipListRef}
      hideScrollbars
      scrollFade
      className="min-w-0 flex-1"
      data-right-panel-tab-list
    >
      <div className="hy-tmux h-full w-max min-w-full" role="tablist" aria-label="Open views">
        {tabSurfaces.map((surface) => {
          const active = surface.id === props.activeSurfaceId;
          const pending = props.pendingSurfaceIds.has(surface.id);
          const title = surfaceTitle(surface, props.previewSessions, props.terminalLabelsById);
          const previewTabId = previewTabIdOf(surface, props.previewSessions);
          // Desktop state is keyed by the session id, but desktop actions
          // must be addressed with the runtime id.
          const audio = tabAudioState(
            previewTabId ? (props.desktopByTabId[previewTabId] ?? null) : null,
          );
          const audioRuntimeTabId = previewTabId
            ? (props.previewRuntimeTabId?.(previewTabId) ?? null)
            : null;
          return (
            <div
              key={surface.id}
              data-active-tab={active}
              // Design §5.6's shell tab, used for every view a tab holds more than one of.
              role="tab"
              aria-selected={active}
              data-on={active ? "" : undefined}
              onMouseDown={handleTabMouseDown}
              onAuxClick={(event) => handleTabAuxClick(event, surface)}
              onContextMenu={(event) => void handleTabContextMenu(event, surface)}
              className={cn(
                "hy-tx group/tab max-w-40 shrink-0 cursor-pointer",
                ownsDesktopTitleBar && "[-webkit-app-region:no-drag]",
                !active && "hover:text-foreground",
              )}
            >
              {surface.kind === "files" ? (
                // Folder's tree is pinned first (rightPanelStore.withFolderTree): it has no close.
                <span className="flex size-4 shrink-0 items-center justify-center">
                  <Files className="size-3 shrink-0" />
                </span>
              ) : (
                <PanelTabCloseButton
                  label={`Close ${title}`}
                  onClick={() => props.onCloseSurface(surface)}
                >
                  {surface.kind === "terminal" ? (
                    <i>{terminalNumber(surface)}</i>
                  ) : (
                    <SurfaceIcon
                      surface={surface}
                      sessions={props.previewSessions}
                      desktopByTabId={props.desktopByTabId}
                      theme={resolvedTheme}
                      environmentId={props.environmentId}
                      pullRequestStatusSeeds={props.pullRequestStatusSeeds}
                    />
                  )}
                  {pending ? (
                    <span
                      className="absolute -right-0.5 -bottom-0.5 size-1.5 rounded-full bg-current"
                      aria-hidden
                    />
                  ) : null}
                </PanelTabCloseButton>
              )}
              {audio === "none" || !audioRuntimeTabId ? null : (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        className="cursor-pointer flex size-4 shrink-0 items-center justify-center rounded-sm hover:bg-muted"
                        aria-label={audio === "muted" ? `Unmute ${title}` : `Mute ${title}`}
                        onClick={(event) => {
                          // Sibling of the close button, inside a tab that
                          // activates on click: keep this to the toggle.
                          event.stopPropagation();
                          void previewBridge
                            ?.setAudioMuted(audioRuntimeTabId, audio !== "muted")
                            .catch(() => undefined);
                        }}
                      >
                        <MorphIcon
                          className="size-3"
                          icon={audio === "muted" ? VolumeOff : Volume2}
                        />
                      </button>
                    }
                  />
                  <TooltipPopup>{audio === "muted" ? "Unmute tab" : "Mute tab"}</TooltipPopup>
                </Tooltip>
              )}
              {renamingDevice === surface.id ? (
                <input
                  aria-label="Device tab name"
                  className="w-24 min-w-0 rounded-sm bg-background px-1 outline-none ring-1 ring-ring"
                  defaultValue={title}
                  ref={(element) => {
                    element?.focus();
                    element?.select();
                  }}
                  onBlur={(event) => {
                    props.onRenameDevice?.(surface.id, event.currentTarget.value);
                    setRenamingDevice(null);
                  }}
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === "Enter") event.currentTarget.blur();
                    if (event.key === "Escape") {
                      event.currentTarget.value = title;
                      event.currentTarget.blur();
                    }
                  }}
                />
              ) : (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        onDoubleClick={() => {
                          if (surface.kind === "device" && props.onRenameDevice)
                            setRenamingDevice(surface.id);
                        }}
                        className="cursor-pointer flex min-w-0 items-center"
                        onClick={() => props.onActivate(surface)}
                      >
                        <span className="truncate">
                          {/* The chip's number already says which shell: `1 Terminal`, or the
                              command it runs (`2 bun dev`), as design §5.6 draws. */}
                          {surface.kind === "terminal" &&
                          title === getTerminalLabel(surface.activeTerminalId)
                            ? "Terminal"
                            : title}
                        </span>
                      </button>
                    }
                  />
                  <TooltipPopup>
                    {surface.kind === "device" ? (
                      <DeviceTabTooltip
                        surface={surface}
                        environmentId={props.environmentId}
                        title={title}
                      />
                    ) : (
                      title
                    )}
                  </TooltipPopup>
                </Tooltip>
              )}
            </div>
          );
        })}
        {canAdd ? (
          <Menu>
            <MenuTrigger
              render={
                <button
                  type="button"
                  className="hy-ib cursor-pointer"
                  aria-label={`Add to ${PANEL_TAB_LOOKS.find((look) => look.tab === tab)?.label}`}
                />
              }
            >
              <Plus className="gi" />
            </MenuTrigger>
            <MenuPopup align="start" side="bottom" sideOffset={6}>
              {addActions.map((action) => {
                const Icon = action.icon;
                // A page opens in the default profile on click; hover or arrow reveals the
                // others. The choice lives at open time because a tab's profile is fixed then:
                // Electron only honours a partition before attach.
                if (action.label === "Page" && action.available && browserProfiles.length > 1) {
                  return (
                    <MenuSub key={action.label}>
                      <MenuSubTrigger
                        className="[&>svg:last-child]:ms-0"
                        onClick={(event) => {
                          const pointerType =
                            "pointerType" in event.nativeEvent &&
                            typeof event.nativeEvent.pointerType === "string"
                              ? event.nativeEvent.pointerType
                              : undefined;
                          // Touch has no hover path to the profile choices: its first tap
                          // opens the submenu, then a profile is selected there.
                          if (!shouldOpenDefaultBrowserProfileFromMenuClick(pointerType)) return;
                          action.onClick();
                        }}
                      >
                        <Icon />
                        {action.label}
                      </MenuSubTrigger>
                      {/*
                        Capped and truncated: profile names are user-supplied
                        and run to 48 characters.
                      */}
                      <MenuSubPopup className="max-w-56">
                        {browserProfiles.map((profile) => (
                          <MenuItem
                            key={profile.id}
                            onClick={() => props.onAddBrowserInProfile(profile.id)}
                          >
                            <span className="min-w-0 truncate">{profile.name}</span>
                          </MenuItem>
                        ))}
                      </MenuSubPopup>
                    </MenuSub>
                  );
                }
                return (
                  <SurfaceMenuItem
                    key={action.label}
                    available={action.available}
                    disabledReason={action.disabledReason}
                    onClick={action.onClick}
                  >
                    <Icon />
                    {action.label}
                  </SurfaceMenuItem>
                );
              })}
            </MenuPopup>
          </Menu>
        ) : null}
      </div>
    </ScrollArea>
  );

  return (
    <PreviewPanelShell
      mode={props.mode}
      {...(props.maximized !== undefined ? { maximized: props.maximized } : {})}
      {...(props.open !== undefined ? { open: props.open } : {})}
      {...(props.widthStorageKey !== undefined ? { widthStorageKey: props.widthStorageKey } : {})}
      {...(props.defaultWidth !== undefined ? { defaultWidth: props.defaultWidth } : {})}
      {...(props.inlineSize ? { inlineSize: props.inlineSize } : {})}
    >
      <div
        className={cn(
          "flex h-[var(--workspace-topbar-height)] min-h-[var(--workspace-topbar-height)] shrink-0 items-center gap-1 pl-2",
          // The sheet overlays from the viewport top, so its tab bar keeps
          // the titlebar's height: a compact row re-centers the layout
          // controls a few pixels higher and the cluster jumps on open.
          // Inline, the fixed cluster over this row's end holds only the maximize toggle (28 at
          // 12 + 1 from the edge; the panel toggles live in the chat head), so the row stops 4 short.
          props.mode === "inline" && !props.layoutControls ? "pr-11.25" : "pr-3",
          ownsDesktopTitleBar && "drag-region",
          ownsDesktopTitleBar && "wco:pr-(--workspace-native-controls-inset)",
          props.mode === "inline" && props.maximized && COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS,
        )}
        data-right-panel-tabbar
      >
        {props.tabs ? (
          <div className="hy-tabs h-full min-w-0 flex-1" role="tablist" aria-label="Panel">
            {PANEL_TAB_LOOKS.map(({ tab: look, label, Icon }) => {
              const reason = props.tabs!.unavailable[look];
              return (
                <Tooltip key={look}>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        role="tab"
                        className={cn(
                          "hy-tab hy-ico",
                          reason === undefined ? "cursor-pointer" : "opacity-40",
                          ownsDesktopTitleBar && "[-webkit-app-region:no-drag]",
                        )}
                        aria-label={label}
                        aria-selected={look === tab}
                        aria-disabled={reason === undefined ? undefined : true}
                        onClick={() => {
                          if (reason === undefined) props.tabs!.onSelect(look);
                        }}
                      >
                        <Icon className="gi" />
                      </button>
                    }
                  />
                  <TooltipPopup side="bottom">
                    {reason === undefined ? label : `${label}: ${reason}`}
                  </TooltipPopup>
                </Tooltip>
              );
            })}
          </div>
        ) : (
          chips
        )}
        {props.layoutControls}
        {ownsDesktopTitleBar && !props.layoutControls ? (
          // Keeps the tabs clear of the window controls when the layout toggles live elsewhere.
          <span aria-hidden className="hidden w-24 shrink-0 wco:block" />
        ) : null}
        {ownsDesktopTitleBar ? (
          <span
            aria-hidden
            className="pointer-events-none fixed top-[var(--workspace-controls-top)] right-[var(--workspace-controls-right)] h-[var(--workspace-topbar-height)] w-28 [-webkit-app-region:no-drag]"
          />
        ) : null}
      </div>
      {props.tabs && showChips ? (
        <div className="hy-vh flex shrink-0 px-2" data-right-panel-subtabs>
          {chips}
        </div>
      ) : null}
      {showGitSwitch ? (
        <div className="hy-vh flex shrink-0 px-2">
          <Seg
            label="Git view"
            options={gitViews}
            value={
              props.tabs?.shownKind === "graph"
                ? "Graph"
                : props.tabs?.shownKind === "diff"
                  ? "Diff"
                  : "PR"
            }
            onChange={(view) => {
              const shown = tabSurfaces.find((surface) =>
                view === "Graph"
                  ? surface.kind === "graph"
                  : view === "Diff"
                    ? surface.kind === "diff"
                    : surface === gitPullRequest,
              );
              if (shown) props.onActivate(shown);
              else if (view === "Graph") props.onAddGraph();
              else if (view === "Diff") props.onAddDiff();
              else props.onAddPullRequests();
            }}
          />
        </div>
      ) : null}
      {/* isolate: a surface's own layers (the browser's control bar is z-20) stay under the
          tab row's popover. */}
      <div className="isolate flex min-h-0 flex-1 flex-col" data-right-panel-surface-content>
        {props.children}
      </div>
    </PreviewPanelShell>
  );
}

function DeviceTabTooltip(props: {
  surface: Extract<RightPanelSurface, { kind: "device" }>;
  environmentId: EnvironmentId | null;
  title: string;
}) {
  const target = props.surface.target;
  const { state } = useDeviceState(target ? props.environmentId : null);
  const device = target
    ? state.devices.find((entry) => entry.hostId === target.hostId && entry.id === target.deviceId)
    : undefined;
  const host = target ? state.hosts.find((entry) => entry.id === target.hostId) : undefined;
  return (
    <div className="flex flex-col gap-0.5">
      <span>{props.title}</span>
      {target ? (
        <span className="text-muted-foreground">
          {host?.label ?? "Device host"} ·{" "}
          {device?.version ?? (target.platform === "ios" ? "iOS" : "Android")}
        </span>
      ) : null}
    </div>
  );
}
