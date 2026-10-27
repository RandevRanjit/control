import { RefreshIcon } from "~/components/ui/refresh-icon";
import { Spinner } from "~/components/ui/spinner";
import { useShortcutModifierState } from "~/shortcutModifierState";
import type { PullRequestSpeedActionResult } from "~/components/pullRequest/PullRequestSpeedActions";
import { usePullRequestCloseBatch } from "~/components/pullRequest/usePullRequestActions";
import { SidebarPointerSensor } from "~/components/Sidebar.pointer";
import { resolveSidebarSweepKeys } from "~/components/Sidebar.logic";
import { pullRequestHostOf, resolveEnvironmentMachineKind } from "@control/contracts";
import type {
  EnvironmentId,
  ProjectId,
  PullRequestAction,
  PullRequestInvolvement,
  PullRequestListCursors,
  PullRequestListFilters,
  PullRequestListInput,
  PullRequestListResult,
  PullRequestListState,
  SourceControlProviderKind,
} from "@control/contracts";
import {
  ArrowDownUpIcon,
  CalendarArrowDownIcon,
  CalendarArrowUpIcon,
  ChevronDownIcon,
  ClockIcon,
  EyeIcon,
  LayersIcon,
  ListChecksIcon,
  PenLineIcon,
  Plug2Icon,
  Maximize2Icon,
  Minimize2Icon,
  UserLockIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

import {
  filterPullRequestsByInvolvement,
  findScopedProject,
  collectPullRequestListFacets,
  groupPullRequestsByInvolvement,
  matchesPullRequestFilters,
  matchesPullRequestQuery,
  parsePullRequestQuery,
  narrowPullRequestsToFilters,
  mergePullRequestDiffStats,
  partitionPullRequestsWithPriority,
  pullRequestDiffStatKey,
  pullRequestEntryKey,
  pullRequestEntryViewer,
  rankPullRequestMatches,
  sortPullRequestGroups,
  pullRequestEnvironmentSetKey,
  readPullRequestListSnapshot,
  resolveProjectScope,
  resolveQueryEnvironmentIds,
  resolveSelectedEnvironmentId,
  withDiffStat,
  writePullRequestListSnapshot,
  scorePullRequestMatch,
  pullRequestStatsRefreshBatches,
  pullRequestStatsRequestBatches,
  retainVisiblePullRequestStatsBatches,
  type EnvironmentPullRequestEntry,
  type MergedPullRequestList,
  type PullRequestDiffStats,
  type PullRequestStatsBatch,
  type PullRequestStatsPolicy,
  type PullRequestStatsScope,
  type PullRequestPartitionsSnapshot,
  applyPullRequestOverrides,
  type PullRequestListOverride,
  pullRequestOverrideAfterAction,
  reusePullRequestEntries,
  settlePullRequestOverrides,
} from "./pullRequestList.logic";
import {
  pullRequestListPreferences,
  type PullRequestListPreferencePatch,
  type PullRequestListPreferences,
  type PullRequestListSort,
  readPullRequestListPreferences,
  writePullRequestListPreferences,
} from "./pullRequestListPreferences";
import { assignProjectsToEnvironments } from "./pullRequestProjectAssignment.logic";
import { pullRequestFilterProjects } from "./pullRequestProjectFilter.logic";
import { environmentMachineIcon } from "../EnvironmentMachineIcon";
import { Seg } from "../Seg";
import {
  PullRequestFiltersMenu,
  PullRequestSearchInput,
  pullRequestHostLabel,
  pullRequestProjectKey,
  type PullRequestExpectedHost,
  type PullRequestFilterOption,
} from "./PullRequestListFilters";
import { PullRequestListEmptyState } from "./PullRequestListEmptyState";
import { PullRequestListGhost } from "./PullRequestGhosts";
import { PullRequestRow, type PullRequestRowTarget } from "./PullRequestRow";
import { PullRequestsUnavailableState } from "./PullRequestsUnavailableState";
import { Button } from "../ui/button";
import { Menu, MenuPopup, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "../ui/menu";
import { useElementWidth } from "~/hooks/useElementWidth";
import { useLiveRefresh } from "~/hooks/useLiveRefresh";
import { useDebouncedValue } from "~/state/queries";
import { useAllEnvironmentShellsBootstrapped, useProjects } from "~/state/entities";
import { useEnvironments } from "~/state/environments";
import {
  pullRequestEnvironment,
  usePullRequestList,
  usePullRequestListStats,
  usePullRequestTurnRefreshes,
  type EnvironmentQueryTarget,
} from "~/state/pullRequests";
import { useAtomCommand } from "~/state/use-atom-command";
import { cn } from "~/lib/utils";
import { getSourceControlPresentationForKind } from "~/sourceControlPresentation";
import { PullRequestGlyph } from "./pullRequestIcons";

/** The list's own controls, held by the view and remembered between visits (see pullRequestListPreferences). */
type PullRequestsSearch = PullRequestListPreferences;

/** A group's head, as the drawing has it: its name in caption ink and a pearl with the count. */
function PullRequestGroupHeader({
  group,
}: {
  group: { key: string; label: string; entries: ReadonlyArray<unknown> };
}) {
  return (
    <div className="s-sc-ig">
      <h2>{group.label}</h2>
      <span className="pearl count">{group.entries.length}</span>
    </div>
  );
}

/** From this width the filters come out as pickers along the top (design SC1d). */
const WIDE_PANEL_PX = 600;
const SCOPES = ["This repo", "All"] as const;

// The state filters wear the same glyphs the rows do, so the two read as one vocabulary.
const INVOLVEMENT_TABS = [
  { value: "all", label: "All", Icon: LayersIcon },
  { value: "reviewing", label: "Reviewing", Icon: EyeIcon },
  { value: "authored", label: "Authored", Icon: PenLineIcon },
] as const satisfies ReadonlyArray<PullRequestFilterOption<PullRequestInvolvement>>;

const STATE_TABS = [
  { value: "all", label: "All", Icon: LayersIcon },
  { value: "open", label: "Open", Icon: PullRequestGlyph.pullRequest },
  { value: "closed", label: "Closed", Icon: PullRequestGlyph.closed },
  { value: "merged", label: "Merged", Icon: PullRequestGlyph.merged },
] as const satisfies ReadonlyArray<PullRequestFilterOption<PullRequestListState>>;

const SORT_OPTIONS = [
  { value: "ready", label: "Merge readiness", Icon: ListChecksIcon },
  { value: "blocked", label: "Blocked on me", Icon: UserLockIcon },
  { value: "updated", label: "Recently updated", Icon: ClockIcon },
  { value: "newest", label: "Newest shown", Icon: CalendarArrowDownIcon },
  { value: "oldest", label: "Oldest shown", Icon: CalendarArrowUpIcon },
  { value: "largest", label: "Largest shown", Icon: Maximize2Icon },
  { value: "smallest", label: "Smallest shown", Icon: Minimize2Icon },
] as const satisfies ReadonlyArray<PullRequestFilterOption<PullRequestListSort>>;

/** Long enough that a keystroke does not become a request, short enough to feel answered. */
const SEARCH_DEBOUNCE_MS = 250;
/** What `scorePullRequestMatch` gives a row none of whose own fields carry the search text. */
const MATCHED_ELSEWHERE_SCORE = 10;
/**
 * One whole page from the host and no more: every provider asks for one row beyond the page as
 * its "is there more" probe, and GitHub serves a hundred per request — so asking for ninety-nine
 * costs one round trip where a hundred costs two.
 */
const PAGE_SIZE = 99;
/** The largest page the listing accepts; past it the request is refused outright. */
const MAX_PAGE_SIZE = 500;
/** Stable empty map so the memos below do not see a new object on every render. */
const EMPTY_VIEWERS: PullRequestListResult["viewers"] = {};
/** Stable so a read that is not wanted right now does not re-key on every render. */
const NO_LIST_TARGETS: ReadonlyArray<EnvironmentQueryTarget<PullRequestListInput>> = [];

/**
 * Every project's pull requests, in Git's PR view under the thread's own (design §22, SC1c and
 * SC1d). It was the Pull Requests page; the panel's width now decides how much it shows.
 */
export function PullRequestInbox({
  threadProject,
  onOpen,
  children,
}: {
  /** The thread's project, which "This repo" narrows to. */
  threadProject: { readonly id: ProjectId; readonly environmentId: EnvironmentId } | null;
  onOpen: (entry: PullRequestRowTarget) => void;
  /** Above the list's controls, scrolling with it: the thread's own pull requests. */
  children?: ReactNode;
}) {
  const [setRootElement, width] = useElementWidth<HTMLDivElement>();
  const wide = (width ?? 0) >= WIDE_PANEL_PX;
  const modifiers = useShortcutModifierState(true);
  const speedMode =
    modifiers.shiftKey && !modifiers.metaKey && !modifiers.ctrlKey && !modifiers.altKey;
  // The scope to one project stays with this visit; the rest is remembered for the next.
  const [search, setSearch] = useState<PullRequestsSearch>(() => {
    const {
      projectId: _projectId,
      environmentId: _environmentId,
      ...rest
    } = readPullRequestListPreferences();
    return rest;
  });
  const sort = search.sort ?? "ready";
  const statsPolicy: PullRequestStatsPolicy =
    sort === "ready" || sort === "largest" || sort === "smallest" ? "eager" : "visible";
  const { environments } = useEnvironments();
  // Every connected environment that has said it can list pull requests. Sorted, so the query
  // keys, the scope key and the stored snapshot all read the same whichever order the
  // connections happened to come up in.
  const capableEnvironments = useMemo(
    () =>
      environments
        .filter(
          (environment) => environment.serverConfig?.environment.capabilities.pullRequests === true,
        )
        .toSorted((left, right) => left.environmentId.localeCompare(right.environmentId)),
    [environments],
  );
  // The server the URL asks for, kept only while it is one the page could read: a link naming a
  // server this workspace no longer has falls back to all of them rather than to nothing.
  const scopedEnvironmentId =
    capableEnvironments.find((environment) => environment.environmentId === search.environmentId)
      ?.environmentId ?? null;
  // Every server this workspace has ever heard of, connecting or not — wider than
  // `capableEnvironments`, which only holds the ones ready to answer.
  const knownEnvironmentIds = useMemo(
    () => new Set(environments.map((environment) => environment.environmentId)),
    [environments],
  );
  const environmentIds = useMemo(
    () =>
      capableEnvironments
        .filter(
          (environment) =>
            scopedEnvironmentId === null || environment.environmentId === scopedEnvironmentId,
        )
        .map((environment) => environment.environmentId),
    [capableEnvironments, scopedEnvironmentId],
  );
  const environmentKey = useMemo(
    () => pullRequestEnvironmentSetKey(environmentIds),
    [environmentIds],
  );
  // An environment may still be connecting, or may predate this feature. Until at least one has
  // reported, an empty set means "not known yet" rather than "no environment can", and the page
  // waits rather than telling a reader to upgrade a server that has not spoken.
  const capabilityKnown = environments.some((environment) => environment.serverConfig !== null);
  const pullRequestsSupported = environmentIds.length > 0;
  const allProjects = useProjects();
  // Whether the workspace has said what it holds yet. Until it has, an empty project list is
  // "not loaded" rather than "none", and telling a reader to add a project they already have is
  // the one wrong answer the empty state can give.
  const projectsKnown = useAllEnvironmentShellsBootstrapped();
  // Only the projects the page can actually read: one on an environment that cannot list pull
  // requests could neither be listed nor acted on.
  const projects = useMemo(
    () => allProjects.filter((project) => environmentIds.includes(project.environmentId)),
    [allProjects, environmentIds],
  );
  const environmentLabels = useMemo(
    () =>
      new Map(
        environments.map((environment) => [environment.environmentId, environment.label] as const),
      ),
    [environments],
  );
  // The scope the URL asks for, once the environments have had their say about whether it exists.
  const scopedProjectId = useMemo(
    () => resolveProjectScope(search.projectId, projects, projectsKnown),
    [projects, projectsKnown, search.projectId],
  );
  const scopedProject = useMemo(
    () => findScopedProject(projects, scopedEnvironmentId, scopedProjectId),
    [projects, scopedEnvironmentId, scopedProjectId],
  );
  const scopedProjects = useMemo(
    () => pullRequestFilterProjects(projects, environmentLabels, scopedProject),
    [environmentLabels, projects, scopedProject],
  );

  const updateSearch = useCallback(
    (patch: PullRequestListPreferencePatch) =>
      setSearch((previous) => {
        const next = { ...previous, ...patch };
        return pullRequestListPreferences({
          ...next,
          involvement: next.involvement ?? previous.involvement,
          state: next.state ?? previous.state,
        });
      }),
    [],
  );

  // List controls change the rows behind the detail, not the independent selected surface. The
  // reader can keep working in that panel while narrowing, sorting, or switching projects.
  const updateListScope = (patch: PullRequestListPreferencePatch) => {
    const {
      projectId: _projectId,
      environmentId: _environmentId,
      ...currentPreferences
    } = pullRequestListPreferences({
      ...search,
      ...patch,
      involvement: patch.involvement ?? search.involvement,
      state: patch.state ?? search.state,
    });
    // Opening a selected-only link does not save its default all/open list. Once a list control
    // changes, the entire visible scope is intentional and becomes the next sidebar destination.
    writePullRequestListPreferences(currentPreferences);
    updateSearch(patch);
  };

  // Searching asks the hosts, which takes a round trip, so the text is held for a moment before
  // it is sent. Until it lands, the rows already on screen are narrowed locally: the answer is
  // late but the page is not.
  const typedQuery = (search.q ?? "").trim();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const sentQuery = useDebouncedValue(typedQuery, SEARCH_DEBOUNCE_MS);
  const querySettled = typedQuery === sentQuery;
  // What was typed, split into the qualifiers the hosts can act on and the words that are left.
  // The URL keeps the line as it was written; only the request sees the two halves.
  const typedParsed = useMemo(() => parsePullRequestQuery(typedQuery), [typedQuery]);
  const sentParsed = useMemo(() => parsePullRequestQuery(sentQuery), [sentQuery]);

  // One record for the hosts, rebuilt only when the URL's own fields change so the listing
  // inputs stay identical between renders.
  const menuFilters = useMemo(
    (): PullRequestListFilters => ({
      ...(search.draft ? { draft: search.draft } : {}),
      ...(search.review ? { review: search.review } : {}),
      ...(search.checks ? { checks: search.checks } : {}),
      ...(search.author ? { author: search.author } : {}),
      ...(search.labels ? { labels: search.labels.map((label) => [label]) } : {}),
    }),
    [search.author, search.checks, search.draft, search.labels, search.review],
  );
  const menuFiltered = Object.keys(menuFilters).length > 0;
  // A typed qualifier wins over the menu's own answer for the same thing, since it is the more
  // recent word on it, including a typed author or label over its menu counterpart.
  const filters = useMemo(
    (): PullRequestListFilters => ({ ...menuFilters, ...sentParsed.filters }),
    [menuFilters, sentParsed.filters],
  );
  const hasFilters = Object.keys(filters).length > 0;
  /** The same narrowings the moment they are typed, for the rows already on screen. */
  const localFilters = useMemo(
    (): PullRequestListFilters => ({ ...menuFilters, ...typedParsed.filters }),
    [menuFilters, typedParsed.filters],
  );
  const hasLocalFilters = Object.keys(localFilters).length > 0;
  // Scoping to a project scopes to the server that owns it, saving every other server a read
  // that could only answer with nothing. Where an id is ambiguous — two servers holding the
  // same project id, with no server named — only the servers that actually hold that id are
  // asked: a server without it may still hold an unrelated project of its own under the same
  // string, and asking it would return that project's rows rather than an honest empty answer.
  const queryEnvironmentIds = useMemo(
    () =>
      resolveQueryEnvironmentIds(
        environmentIds,
        projects,
        scopedProject,
        scopedProjectId,
        projectsKnown,
      ),
    [environmentIds, projects, projectsKnown, scopedProject, scopedProjectId],
  );
  /**
   * Which projects each server is asked about. Two servers holding the same repository would both
   * list the same pull requests, so each repository is listed by one of them — the first, which is
   * where the page's actions land — and the others are asked only for what is theirs alone. A
   * server left with nothing of its own is not read at all.
   *
   * Left alone while the projects are still arriving, and while the scope is a single project:
   * that path deliberately asks both servers holding an ambiguous id.
   */
  const environmentQueries = useMemo((): ReadonlyArray<{
    readonly environmentId: EnvironmentId;
    readonly projectIds?: ReadonlyArray<ProjectId>;
  }> => {
    const plain = queryEnvironmentIds.map((environmentId) => ({ environmentId }));
    if (!projectsKnown || scopedProjectId !== undefined) return plain;
    const assignment = assignProjectsToEnvironments(
      projects,
      queryEnvironmentIds,
      queryEnvironmentIds[0],
    );
    const totals = new Map<EnvironmentId, number>();
    for (const project of projects) {
      totals.set(project.environmentId, (totals.get(project.environmentId) ?? 0) + 1);
    }
    return queryEnvironmentIds.flatMap((environmentId) => {
      const projectIds = assignment.get(environmentId);
      if (projectIds === undefined) return [];
      // It lists everything it holds anyway, so the filter is left off and a one-server workspace
      // asks exactly the question it asked before.
      if (projectIds.length === (totals.get(environmentId) ?? 0)) return [{ environmentId }];
      return [{ environmentId, projectIds }];
    });
  }, [projects, projectsKnown, queryEnvironmentIds, scopedProjectId]);
  // Part of the scope, since a different split is a different question and its answers must not
  // be filed under the same page state.
  const assignmentKey = useMemo(
    () =>
      environmentQueries
        .map(({ environmentId, projectIds }) => `${environmentId}#${projectIds?.join("+") ?? "*"}`)
        .join("|"),
    [environmentQueries],
  );
  const turnRefreshes = usePullRequestTurnRefreshes(
    environmentQueries.map(({ environmentId }) => environmentId),
  );
  const turnRefreshToken = turnRefreshes
    .map(([environmentId, revision]) => `${environmentId}:${revision}`)
    .join("|");
  // Page size is view state, not a URL concern: a shared link should open the first page.
  const scopeKey = `${environmentKey}:${assignmentKey}:${search.state}:${search.involvement}:${scopedProjectId ?? ""}:${search.host ?? ""}:${search.draft ?? ""}:${search.review ?? ""}:${search.checks ?? ""}:${search.author ?? ""}:${search.labels?.join("\u0000") ?? ""}`;
  const filterKey = `${scopeKey}:${sentQuery}`;
  const statsScopeRef = useRef<PullRequestStatsScope>({ key: filterKey, policy: statsPolicy });
  statsScopeRef.current = { key: filterKey, policy: statsPolicy };
  // Where the next slice carries on from, per repository within each environment, as that
  // environment handed it back. Sending it is what makes a second page cost a second page rather
  // than the whole list again — and a repository it does not name has run out and is not read a
  // second time. An environment absent from it has nothing more to give at all.
  const [page, setPage] = useState<{
    key: string;
    size: number;
    cursors: Readonly<Record<string, PullRequestListCursors>> | null;
    /**
     * The environments read again from the top at the larger page rather than continued. An
     * environment can say it has more without saying where to carry on from — its provider has
     * no cursor to give — and a continuation naming only the others would strand its rows on
     * the host forever.
     */
    regrown: ReadonlyArray<string>;
  }>({ key: filterKey, size: PAGE_SIZE, cursors: null, regrown: [] });
  const pageSize = page.key === filterKey ? page.size : PAGE_SIZE;
  const sentCursors = page.key === filterKey ? page.cursors : null;
  const sentRegrown = page.key === filterKey ? page.regrown : [];

  // Typing a search, or clearing one, starts the list again at its first page. Without this the
  // paging state from before the search is still filed under these filters and comes back with
  // it, so clearing would return to the slice that had been scrolled to rather than to the list.
  useEffect(() => {
    setPage({ key: filterKey, size: PAGE_SIZE, cursors: null, regrown: [] });
  }, [filterKey]);

  /** The listing input each environment is asked for, which differs only in its continuation. */
  const listTargets = useMemo(
    () =>
      environmentQueries.flatMap(({ environmentId, projectIds }) => {
        const cursors = sentCursors?.[environmentId];
        // A continuation asks the environments that said where to carry on from, plus the ones
        // that have more to give but no cursor to give it from — those are read again at the
        // larger page. The rest have run out, and re-reading them would answer with the page
        // that is already on screen.
        if (sentCursors !== null && cursors === undefined && !sentRegrown.includes(environmentId)) {
          return [];
        }
        return [
          {
            environmentId,
            input: {
              state: search.state,
              // The hosts narrow by involvement themselves — GitHub by author and review
              // request, and so on — so asking them is the difference between a page of results
              // and a page of everything with the answer somewhere further down it.
              involvement: search.involvement,
              limit: pageSize,
              ...(scopedProjectId ? { projectId: scopedProjectId } : {}),
              ...(projectIds ? { projectIds } : {}),
              ...(search.host ? { host: search.host } : {}),
              ...(hasFilters ? { filters } : {}),
              ...(sentParsed.text ? { query: sentParsed.text } : {}),
              ...(cursors === undefined ? {} : { cursors }),
            } satisfies PullRequestListInput,
          },
        ];
      }),
    [
      filters,
      hasFilters,
      pageSize,
      environmentQueries,
      scopedProjectId,
      search.host,
      search.involvement,
      search.state,
      sentCursors,
      sentRegrown,
      sentParsed.text,
    ],
  );
  const listQuery = usePullRequestList(listTargets);

  /**
   * The same filters with nothing typed, read whether or not anything is. It is the same atom the
   * list itself uses while no search is on, so it costs nothing then; while one is, it is what the
   * page knows about the workspace — who is signed in, which hosts there are, which repositories
   * could not be read — and what it shows the moment the search is cleared.
   *
   * Kept as its own read rather than remembered from an earlier answer because an answer cannot
   * say which question it belongs to: mid-switch the text has already changed and the data has
   * not, and a search's answer would file itself under the workspace.
   */
  const baselineTargets = useMemo(
    () =>
      environmentQueries.map(({ environmentId, projectIds }) => ({
        environmentId,
        input: {
          state: search.state,
          involvement: search.involvement,
          limit: PAGE_SIZE,
          ...(scopedProjectId ? { projectId: scopedProjectId } : {}),
          ...(projectIds ? { projectIds } : {}),
          ...(search.host ? { host: search.host } : {}),
          ...(menuFiltered ? { filters: menuFilters } : {}),
        } satisfies PullRequestListInput,
      })),
    [
      menuFiltered,
      menuFilters,
      environmentQueries,
      scopedProjectId,
      search.host,
      search.involvement,
      search.state,
    ],
  );
  const baselineQuery = usePullRequestList(baselineTargets);
  const baselineEmpty =
    baselineQuery.data?.entries.length === 0 &&
    baselineQuery.data.errors.length === 0 &&
    !baselineQuery.isPending &&
    baselineQuery.error === null;
  const facetTargets = useMemo(() => {
    if (!filtersOpen) return NO_LIST_TARGETS;
    return environmentQueries.map(({ environmentId, projectIds }) => ({
      environmentId,
      input: {
        state: "all",
        involvement: search.involvement,
        limit: PAGE_SIZE,
        ...(scopedProjectId ? { projectId: scopedProjectId } : {}),
        ...(projectIds ? { projectIds } : {}),
        ...(search.host ? { host: search.host } : {}),
      } satisfies PullRequestListInput,
    }));
  }, [environmentQueries, filtersOpen, scopedProjectId, search.host, search.involvement]);
  const facetQuery = usePullRequestList(facetTargets);
  // The priority groups' own reads. The feed below is paginated by recency, so an older authored
  // or review-requested row can be missing from its first page; partitioned from these
  // server-filtered reads instead, the priority view is complete up front and a continuation can
  // only ever append below what is already on screen. A search re-ranks the whole list by match,
  // so no partitions are read for one. These are the same atoms the Authored and Reviewing tabs
  // ask for, so switching to either is answered from cache.
  const partitionsWanted = search.involvement === "all" && typedQuery.length === 0;
  // Built together so the two reads share one memo, and in the same field order the feed's own
  // input uses: the atoms are keyed by their input, so the Authored tab then reads this answer.
  const partitionTargets = useMemo(() => {
    // The main list goes first. Besides putting the visible rows on screen sooner, it proves
    // which repositories the host search indexes, so an empty partition does not trigger the
    // expensive per-repository fallback. With no rows at all both partitions are already empty.
    if (
      !partitionsWanted ||
      baselineQuery.data === null ||
      baselineQuery.data.entries.length === 0
    ) {
      return { authored: NO_LIST_TARGETS, reviewing: NO_LIST_TARGETS };
    }
    const targetsFor = (involvement: PullRequestInvolvement) =>
      environmentQueries.map(({ environmentId, projectIds }) => ({
        environmentId,
        input: {
          state: search.state,
          involvement,
          limit: PAGE_SIZE,
          ...(scopedProjectId ? { projectId: scopedProjectId } : {}),
          ...(projectIds ? { projectIds } : {}),
          ...(search.host ? { host: search.host } : {}),
          ...(menuFiltered ? { filters: menuFilters } : {}),
        } satisfies PullRequestListInput,
      }));
    return { authored: targetsFor("authored"), reviewing: targetsFor("reviewing") };
  }, [
    menuFiltered,
    menuFilters,
    partitionsWanted,
    baselineQuery.data,
    environmentQueries,
    scopedProjectId,
    search.host,
    search.state,
  ]);
  const authoredQuery = usePullRequestList(partitionTargets.authored);
  const reviewingQuery = usePullRequestList(partitionTargets.reviewing);
  // The header's refresh punches through the server's cache before re-reading; the error and
  // empty states retry plainly, because a failure is never cached.
  const invalidate = useAtomCommand(pullRequestEnvironment.invalidate, { reportFailure: false });
  // The queries only go pending once the invalidation has come back, so refreshing is tracked
  // from the first moment rather than the second: a button that stays live through the slow half
  // of its own work is a button that gets pressed again, and buys the whole cascade twice.
  const [invalidating, setInvalidating] = useState(false);
  const refreshListAndStats = (
    requestedStatsScope = statsScopeRef.current,
    actedEnvironmentId?: EnvironmentId,
  ) => {
    refreshList(true, actedEnvironmentId);
    const visible = visibleStatsKeys.current;
    const batches = pullRequestStatsRefreshBatches({
      requestedScope: requestedStatsScope,
      currentScope: statsScopeRef.current,
      entriesByKey: entriesByStatsKey.current,
      candidateKeys: visible.key === requestedStatsScope.key ? visible.values : new Set(),
      statsByRow: statsByRowRef.current,
    });
    if (batches !== null) {
      setStatsTargetState({ key: requestedStatsScope.key, batches });
      statsQuery.refresh(
        batches
          .filter(({ environmentId }) =>
            actedEnvironmentId === undefined ? true : environmentId === actedEnvironmentId,
          )
          .map(({ environmentId, input }) => ({ environmentId, input })),
      );
    }
  };
  const refreshFromHost = async () => {
    const requestedStatsScope = statsScopeRef.current;
    setInvalidating(true);
    try {
      // Every environment the page is reading, since what the reader pressed refresh for is the
      // list in front of them rather than whichever machine happens to be first.
      await Promise.all(
        queryEnvironmentIds.map((environmentId) => invalidate({ environmentId, input: {} })),
      );
    } finally {
      setInvalidating(false);
    }
    refreshListAndStats(requestedStatsScope);
  };
  const refreshing = invalidating || listQuery.isPending;

  // Every page size and every search is its own query, and a new one starts empty. The last
  // answer for these filters is held so the page grows and narrows in place rather than blanking
  // out: a longer page reads as growth, and a search shows the rows it already has, narrowed
  // here, until the hosts answer for themselves.
  const [loaded, setLoaded] = useState<{
    environmentKey: string;
    scope: string;
    query: string;
    data: MergedPullRequestList;
    /** The priority groups' own answers, carried so a cold start has whole groups too. */
    partitions?: PullRequestPartitionsSnapshot;
  } | null>(null);
  // A longer page is the same list with more on the end, so the rows already read stay where
  // they were read: each answer is merged onto the last rather than replacing it, and anything
  // new lands at the bottom. Only a different question — other filters, another search — starts
  // the order again. Declared here, ahead of the snapshot write below, so that write can read
  // this round's accumulation rather than only its own slice.
  const [ordered, setOrdered] = useState<{
    key: string;
    entries: ReadonlyArray<EnvironmentPullRequestEntry>;
  } | null>(null);
  // What the reader just did to a row, shown before any host confirms it. A closed pull request
  // leaves an "open" list on the click; the reads that follow are slow, and until one lands the
  // row says what was asked of it. Cleared when a whole-page answer arrives after the action.
  const [overrides, setOverrides] = useState<ReadonlyMap<string, PullRequestListOverride>>(
    () => new Map(),
  );
  const overrideToken = useRef(0);
  /** Writes the action's outcome onto the row; the token names this write for a later rollback. */
  const overrideEntry = (
    entry: EnvironmentPullRequestEntry,
    action: PullRequestAction,
  ): number | null => {
    const token = ++overrideToken.current;
    const override = pullRequestOverrideAfterAction(entry, action, new Date(), token);
    if (override === null) return null;
    setOverrides((current) => new Map(current).set(pullRequestEntryKey(entry), override));
    return token;
  };
  /** A rollback for one write only: a later action's note over the same row is left alone. */
  const revertOverride = (key: string, token: number | null) => {
    if (token === null) return;
    setOverrides((current) => {
      if (current.get(key)?.token !== token) return current;
      const next = new Map(current);
      next.delete(key);
      return next;
    });
  };
  const speedActionRef = useRef<(result: PullRequestSpeedActionResult) => void>(() => {});
  speedActionRef.current = ({ entry, action }) => {
    // Some hosts accept a merge before it completes. Let the next host read declare it merged.
    if (action !== "merge") overrideEntry(entry, action);
  };
  const onSpeedAction = useCallback((result: PullRequestSpeedActionResult) => {
    speedActionRef.current(result);
  }, []);
  const onBatchClosed = useCallback((entry: EnvironmentPullRequestEntry) => {
    speedActionRef.current({ entry, action: "close" });
  }, []);
  const { close: closeBatch, closingKeys } = usePullRequestCloseBatch(onBatchClosed);
  // A reload recreates the registry the queries live in, so with nothing held the page would
  // cold-start into skeletons even though almost every row is unchanged. The last answer for
  // this set of environments is kept across reloads and hydrated here as the carried rows: they
  // render at once — narrowed to the current filters like any carried answer — and the live read
  // reconciles them in place by key rather than replacing them with ghosts.
  useEffect(() => {
    if (environmentKey.length === 0) return;
    setLoaded((current) => {
      // Rows read from a different set of environments cannot even be narrowed — one of them may
      // no longer be connected at all — so that set's own snapshot beats holding them.
      if (current !== null && current.environmentKey === environmentKey) return current;
      const snapshot = readPullRequestListSnapshot(
        typeof window === "undefined" ? undefined : window.localStorage,
        environmentKey,
      );
      if (snapshot === null) return null;
      return {
        environmentKey,
        scope: snapshot.scope,
        query: "",
        data: snapshot.data,
        ...(snapshot.partitions === undefined ? {} : { partitions: snapshot.partitions }),
      };
    });
  }, [environmentKey]);
  useEffect(() => {
    // Only once this query has settled. While a search is being swapped in or out the text has
    // already changed and the data has not, so recording them together would file the previous
    // answer under the new question — which is how a search's answer came to speak for the
    // workspace after the search was cleared.
    if (!listQuery.data || listQuery.isPending) return;
    const data = listQuery.data;
    setLoaded((current) => {
      // The partitions arrive on their own clock, so this records whichever have landed by
      // now and runs again when the rest do. Until then the ones already held for this scope
      // stay — hydrated or previously answered — rather than being dropped for a feed that
      // merely settled first.
      const partitions =
        partitionsWanted && baselineEmpty
          ? { authored: [], reviewing: [] }
          : partitionsWanted && authoredQuery.data !== null && reviewingQuery.data !== null
            ? { authored: authoredQuery.data.entries, reviewing: reviewingQuery.data.entries }
            : current !== null &&
                current.environmentKey === environmentKey &&
                current.scope === scopeKey
              ? current.partitions
              : undefined;
      // A search's answer is the search's, not the workspace's, so only unsearched lists
      // persist. Written here where the held partitions are in reach, so a feed settling
      // ahead of them cannot overwrite a stored snapshot that already had both groups.
      //
      // What is written is what the reader is actually looking at, not this round's own
      // answer: a continuation only asks the environments still paging, so its answer alone is
      // missing both the rows read on earlier pages and the hosts of whichever environment had
      // already run out of cursors. `ordered` carries the accumulated rows, and the baseline
      // read — which never drops an environment for lack of a cursor — carries the full hosts.
      if (environmentKey.length > 0 && sentQuery.length === 0) {
        const accumulatedEntries = ordered?.key === filterKey ? ordered.entries : data.entries;
        writePullRequestListSnapshot(
          typeof window === "undefined" ? undefined : window.localStorage,
          environmentKey,
          {
            scope: scopeKey,
            data: {
              ...data,
              entries: accumulatedEntries,
              viewers: baselineQuery.data?.viewers ?? data.viewers,
              providers: baselineQuery.data?.providers ?? data.providers,
            },
            ...(partitions === undefined ? {} : { partitions }),
          },
        );
      }
      return {
        environmentKey,
        scope: scopeKey,
        query: sentQuery,
        data: { ...data, entries: ordered?.key === filterKey ? ordered.entries : data.entries },
        ...(partitions === undefined ? {} : { partitions }),
      };
    });
  }, [
    environmentKey,
    scopeKey,
    sentQuery,
    listQuery.data,
    listQuery.isPending,
    baselineEmpty,
    partitionsWanted,
    authoredQuery.data,
    reviewingQuery.data,
    ordered,
    filterKey,
    baselineQuery.data,
  ]);
  // Changing a filter asks a question nothing has answered yet, and the page is already holding
  // perfectly good rows for the last one. Rather than blank out for the round trip, those rows
  // are narrowed to the new filters and stay until the answer lands — a subset of it, never a
  // row it excludes. Narrowed to nothing there is nothing to carry, and the skeletons below are
  // right after all. Rows read from a different set of environments are dropped rather than
  // narrowed: one of those environments may no longer be connected.
  const narrowed = useMemo(() => {
    if (loaded === null || loaded.environmentKey !== environmentKey || loaded.scope === scopeKey) {
      return null;
    }
    const entries = narrowPullRequestsToFilters(loaded.data.entries, {
      state: search.state,
      projectId: scopedProjectId,
      host: search.host,
    });
    return entries.length === 0 ? null : { ...loaded.data, entries };
  }, [environmentKey, loaded, scopeKey, scopedProjectId, search.host, search.state]);
  // With nothing typed and nothing to carry on from, the answer is taken from the read that is
  // keyed to exactly that question. Otherwise a search's answer lingers for a render after the
  // text has gone — the data cannot say which question it belongs to, but the read it came from
  // can, and that is what stops a cleared search from keeping its own rows.
  // A grown page is read by the list and nothing else: the baseline always asks for one page, so
  // a host with no cursor to continue from — where "more" means asking for a longer page — would
  // have its extra rows thrown away for the ninety-nine the baseline keeps answering with.
  const answered =
    (sentQuery.length === 0 && sentCursors === null && pageSize === PAGE_SIZE
      ? baselineQuery.data
      : listQuery.data) ??
    (loaded?.scope === scopeKey && loaded.query === sentQuery ? loaded.data : null);
  // Clearing a search returns to a list that has already been read, so it comes back at once
  // rather than after another round trip: the search was the temporary state, not the list.
  const carried =
    (sentQuery.length === 0 ? baselineQuery.data : undefined) ??
    (loaded?.scope === scopeKey ? loaded.data : null) ??
    narrowed;
  const listData = answered ?? carried;
  /** The rows on screen answer the previous question, held while this one is on its way. */
  const showingCarried = answered === null && carried !== null;
  const loadingMore = listQuery.isPending && listData !== null;
  /** Nothing read and nothing to carry, which is the one thing skeletons are for. */
  const firstLoad = listQuery.isPending && listData === null;

  // `ordered` is declared above, ahead of the snapshot write, but grown here from this round's
  // own answer.
  useEffect(() => {
    if (!answered || listQuery.isPending || (listQuery.error && listQuery.data === null)) return;
    setOrdered((previous) => {
      if (previous === null || previous.key !== filterKey) {
        return {
          key: filterKey,
          entries: rankPullRequestMatches(answered.entries, sentParsed.text),
        };
      }
      if (sentCursors !== null) {
        // A continuation is a slice, not the list: it carries only what comes after the rows
        // already held, and says nothing about a repository that has run out. Everything on
        // screen therefore stays, and the slice — ordered among itself, since one repository's
        // next rows can be newer than another's last — lands under it.
        const held = new Set(previous.entries.map(pullRequestEntryKey));
        const arrived = answered.entries.filter((entry) => !held.has(pullRequestEntryKey(entry)));
        const appended = rankPullRequestMatches(
          arrived.toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
          sentParsed.text,
        );
        return { key: filterKey, entries: [...previous.entries, ...appended] };
      }
      // A whole-page answer replaces the order outright. Positions used to be inherited so the
      // list would not shift under a reader, but inheriting them filed a pull request opened
      // since the last read at the bottom of the page — below rows a week older — where "the
      // latest" is exactly what a refresh was for. The host answers in the order the page
      // reads, so its order stands; a row that moved was updated, and moving is the news.
      return {
        key: filterKey,
        entries: reusePullRequestEntries(
          previous.entries,
          rankPullRequestMatches(answered.entries, sentParsed.text),
          pullRequestEntryKey,
        ),
      };
    });
    // The host's word outranks the reader's, once it has actually said it: an override is
    // cleared by an answer that agrees with it, not by any answer that happens to land.
    setOverrides((current) =>
      settlePullRequestOverrides(current, answered.entries, pullRequestEntryKey, Date.now()),
    );
  }, [
    answered,
    filterKey,
    sentCursors,
    sentParsed.text,
    listQuery.isPending,
    listQuery.error,
    listQuery.data,
  ]);

  // Carrying on where the last answer stopped, and only raising the page size for the hosts that
  // could not say where that was.
  // From this question's own answer, never from the rows being held while it travels: a
  // continuation is a boundary in one listing, and carrying one across a search would ask the
  // new question to start where the old one stopped — skipping its newest matches entirely.
  const nextCursors = answered?.nextCursors ?? {};
  // The environments with more rows and no cursor to reach them by. They come along with any
  // continuation, read again at a page one step larger, which is the only way they grow.
  const regrown = (answered?.truncatedEnvironments ?? []).filter(
    (environmentId) => nextCursors[environmentId] === undefined,
  );
  const canContinue = !showingCarried && Object.keys(nextCursors).length > 0;
  const loadMore = () => {
    if (canContinue) {
      setPage({
        key: filterKey,
        size: regrown.length === 0 ? pageSize : Math.min(pageSize + PAGE_SIZE, MAX_PAGE_SIZE),
        cursors: nextCursors,
        regrown,
      });
      return;
    }
    setPage({
      key: filterKey,
      size: Math.min(pageSize + PAGE_SIZE, MAX_PAGE_SIZE),
      cursors: null,
      regrown: [],
    });
  };

  // A refresh means the whole visible list again, and a cursored query cannot answer that: it
  // re-reads only its own slice, so the rows loaded before it would never see a merge, a close,
  // or a retitle. Going back to a single page long enough to cover everything on screen lets the
  // merge above bring every row up to date in place.
  const refreshList = (includeRelated = false, actedEnvironmentId?: EnvironmentId) => {
    const related = (
      includeRelated
        ? [
            ...baselineTargets,
            ...facetTargets,
            ...partitionTargets.authored,
            ...partitionTargets.reviewing,
          ]
        : []
    ).filter(
      ({ environmentId }) =>
        actedEnvironmentId === undefined || environmentId === actedEnvironmentId,
    );
    if (sentCursors === null) {
      listQuery.refresh([
        ...listTargets.filter(
          ({ environmentId }) =>
            actedEnvironmentId === undefined || environmentId === actedEnvironmentId,
        ),
        ...related,
      ]);
      return;
    }
    if (related.length > 0) listQuery.refresh(related);
    const loadedCount = ordered?.key === filterKey ? ordered.entries.length : pageSize;
    setPage({
      key: filterKey,
      regrown: [],
      size: Math.min(
        Math.max(pageSize, Math.ceil(loadedCount / PAGE_SIZE) * PAGE_SIZE),
        MAX_PAGE_SIZE,
      ),
      cursors: null,
    });
  };

  const appliedTurnRefreshToken = useRef("");
  const refreshAfterTurn = useEffectEvent(() => {
    if (sentCursors !== null) refreshList();
  });
  useEffect(() => {
    if (turnRefreshToken.length === 0 || appliedTurnRefreshToken.current === turnRefreshToken) {
      return;
    }
    appliedTurnRefreshToken.current = turnRefreshToken;
    refreshAfterTurn();
  }, [turnRefreshToken]);

  // The list goes stale the same way the detail does: somebody opens a pull request, a check
  // finishes, a branch is merged. So it reads again on the way back to the window, and once a
  // minute while somebody is reading it. Those reads go through the server's cache and stop
  // when the reader stops, which is what keeps a page left open from spending a night of the
  // host's rate limit.
  useLiveRefresh(
    () => {
      refreshList(true);
    },
    { enabled: pullRequestsSupported },
  );

  const viewers = baselineQuery.data?.viewers ?? listData?.viewers ?? EMPTY_VIEWERS;
  const listErrors = baselineQuery.data?.errors ?? listData?.errors ?? [];
  const facets = useMemo(
    () =>
      collectPullRequestListFacets(
        [
          ...(facetQuery.data?.entries ?? []),
          ...(baselineQuery.data?.entries ?? listData?.entries ?? []),
        ],
        search.state,
      ),
    [baselineQuery.data?.entries, facetQuery.data?.entries, listData?.entries, search.state],
  );

  /** The hosts that narrowed the listing themselves, so their answer is not narrowed again. */
  const searchingHosts = useMemo(
    () =>
      new Set(
        (baselineQuery.data?.providers ?? listData?.providers ?? []).flatMap((provider) =>
          provider.searchesOnHost ? [provider.host] : [],
        ),
      ),
    [baselineQuery.data?.providers, listData?.providers],
  );

  const entries = useMemo(() => {
    const known = ordered?.key === filterKey ? ordered.entries : (listData?.entries ?? []);
    const involvementEntries = filterPullRequestsByInvolvement(known, viewers, search.involvement);
    // The hosts search more than the row shows — a body, a review, a commit message — so once
    // their answer is in, narrowing it again here would throw away matches the reader asked for.
    // The local pass stands in for the answer that has not arrived yet, and for the hosts that
    // answered without searching at all: Azure DevOps has no text filter, so its rows arrive
    // whole and would otherwise sit under a search that never touched them.
    // The rows the hosts could not narrow themselves, for the fields a row actually carries:
    // a host with no filter of its own answers unnarrowed, and so does one whose answer for the
    // new filters has not arrived yet. Checks are absent here, because no row carries them.
    const narrowedEntries = hasLocalFilters
      ? involvementEntries.filter((entry) =>
          matchesPullRequestFilters(entry, localFilters, pullRequestEntryViewer(entry, viewers)),
        )
      : involvementEntries;
    // Newest update first once nothing is typed, so a list merged from several hosts reads in
    // one order rather than in each host's. With a search on, the relevance ranking above is
    // the order, and re-sorting by date here would undo it.
    if (typedParsed.text.length === 0) {
      return narrowedEntries.toSorted((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt),
      );
    }
    const answeredLocally = querySettled && !showingCarried;
    return narrowedEntries.filter(
      (entry) =>
        (answeredLocally && searchingHosts.has(entry.host)) ||
        matchesPullRequestQuery(entry, typedParsed.text),
    );
  }, [
    filterKey,
    hasLocalFilters,
    localFilters,
    listData,
    ordered,
    querySettled,
    search.involvement,
    searchingHosts,
    showingCarried,
    typedParsed.text,
    viewers,
  ]);

  const scrollRef = useRef<HTMLDivElement>(null);

  /**
   * The line counts, asked for once the rows are on screen. On GitHub they are forty per cent of
   * the read that answers the whole page, for two small numbers at the end of a row — so the
   * listing leaves them out and they arrive a moment later, into rows that already draw without
   * them. Keyed by the rows being shown, so scrolling further asks only about what is new.
   */
  const groups = useMemo(() => {
    if (search.involvement !== "all") return [{ key: "others" as const, label: "", entries }];
    // An empty whole-list answer also empties the priority groups. Their old snapshot must
    // not restore the last merged rows after the partition reads are no longer mounted.
    if (baselineEmpty) {
      return groupPullRequestsByInvolvement(entries, viewers);
    }
    // Until both partitions have answered, the snapshot's stand in — they are yesterday's
    // groups, but whole ones, where grouping the feed's first page locally loses every
    // authored row older than it. Once the live reads land they take over; with neither,
    // the local grouping is still better than nothing.
    const held =
      loaded !== null && loaded.environmentKey === environmentKey && loaded.scope === scopeKey
        ? loaded.partitions
        : undefined;
    // The priority reads answer the same question the feed does, so they take the same local
    // narrowing: a host that cannot filter for itself would otherwise put rows into Authored
    // that the filters above just took out of the feed.
    const narrow = (rows: ReadonlyArray<EnvironmentPullRequestEntry> | undefined) =>
      rows === undefined || !hasLocalFilters
        ? rows
        : rows.filter((entry) =>
            matchesPullRequestFilters(entry, localFilters, pullRequestEntryViewer(entry, viewers)),
          );
    const authored = narrow(
      partitionsWanted ? (authoredQuery.data?.entries ?? held?.authored) : undefined,
    );
    const reviewing = narrow(
      partitionsWanted ? (reviewingQuery.data?.entries ?? held?.reviewing) : undefined,
    );
    if (authored === undefined || reviewing === undefined) {
      return groupPullRequestsByInvolvement(entries, viewers);
    }
    return partitionPullRequestsWithPriority(entries, authored, reviewing);
  }, [
    hasLocalFilters,
    baselineEmpty,
    localFilters,
    authoredQuery.data?.entries,
    entries,
    environmentKey,
    loaded,
    partitionsWanted,
    reviewingQuery.data?.entries,
    scopeKey,
    search.involvement,
    viewers,
  ]);

  // Date sorts keep optional line-count reads near the viewport. Size and readiness sorts need
  // every loaded count before their order is final. Counts stay cached across both policies.
  const entriesByStatsKey = useRef<ReadonlyMap<string, EnvironmentPullRequestEntry>>(new Map());
  entriesByStatsKey.current = new Map(
    groups.flatMap((group) =>
      group.entries.map((entry) => [pullRequestEntryKey(entry), entry] as const),
    ),
  );
  const visibleStatsKeys = useRef({ key: filterKey, values: new Set<string>() });
  const [statsByRow, setStatsByRow] = useState<PullRequestDiffStats>(() => new Map());
  const statsByRowRef = useRef(statsByRow);
  statsByRowRef.current = statsByRow;
  const [statsTargetState, setStatsTargetState] = useState<{
    readonly key: string;
    readonly batches: ReadonlyArray<PullRequestStatsBatch>;
  }>({ key: filterKey, batches: [] });
  const statsBatches = statsTargetState.key === filterKey ? statsTargetState.batches : [];
  const statsTargets = useMemo(
    () =>
      statsBatches.map(({ environmentId, input }) => ({
        environmentId,
        input,
      })),
    [statsBatches],
  );
  const statsObserver = useRef<IntersectionObserver | null>(null);
  const statsRows = useRef(new Set<HTMLDivElement>());
  const statsPending = useRef(true);
  const statsPolicyRef = useRef(statsPolicy);
  statsPolicyRef.current = statsPolicy;
  const registerStatsRow = useCallback((node: HTMLDivElement | null) => {
    if (node === null || typeof IntersectionObserver === "undefined") return;
    statsRows.current.add(node);
    statsObserver.current?.observe(node);
    return () => {
      statsRows.current.delete(node);
      statsObserver.current?.unobserve(node);
      const key = node.dataset.pullRequestStatsKey;
      const visible = visibleStatsKeys.current;
      if (
        statsPolicyRef.current !== "visible" ||
        key === undefined ||
        !visible.values.delete(key) ||
        statsPending.current
      ) {
        return;
      }
      setStatsTargetState((current) => {
        if (current.key !== visible.key) return current;
        const batches = retainVisiblePullRequestStatsBatches(current.batches, visible.values);
        return batches.length === current.batches.length ? current : { key: current.key, batches };
      });
    };
  }, []);
  useEffect(() => {
    if (statsPolicy !== "eager") return;
    setStatsTargetState((current) => {
      const batches = current.key === filterKey ? current.batches : [];
      const added = pullRequestStatsRequestBatches({
        entriesByKey: entriesByStatsKey.current,
        candidateKeys: visibleStatsKeys.current.values,
        policy: statsPolicy,
        activeBatches: batches,
        statsByRow: statsByRowRef.current,
      });
      if (added.length === 0 && current.key === filterKey) return current;
      return { key: filterKey, batches: [...batches, ...added] };
    });
  }, [filterKey, groups, statsPolicy]);
  useEffect(() => {
    if (statsPolicy !== "visible" || typeof IntersectionObserver === "undefined") return;
    visibleStatsKeys.current = { key: filterKey, values: new Set() };
    const observer = new IntersectionObserver(
      (observed) => {
        const visible = visibleStatsKeys.current;
        if (visible.key !== filterKey) return;
        let changed = false;
        const entered = new Set<string>();
        for (const item of observed) {
          const key = (item.target as HTMLElement).dataset.pullRequestStatsKey;
          if (key === undefined) continue;
          const wasVisible = visible.values.has(key);
          if (item.isIntersecting && entriesByStatsKey.current.has(key)) {
            visible.values.add(key);
            if (!wasVisible) entered.add(key);
          } else {
            visible.values.delete(key);
          }
          changed ||= wasVisible !== visible.values.has(key);
        }
        if (!changed) return;
        setStatsTargetState((current) => {
          const batches = current.key === filterKey ? current.batches : [];
          const retained = statsPending.current
            ? batches
            : retainVisiblePullRequestStatsBatches(batches, visible.values);
          const added = pullRequestStatsRequestBatches({
            entriesByKey: entriesByStatsKey.current,
            candidateKeys: entered,
            policy: statsPolicy,
            activeBatches: batches,
            statsByRow: statsByRowRef.current,
          });
          if (added.length === 0 && retained.length === batches.length) return current;
          return { key: filterKey, batches: [...retained, ...added] };
        });
      },
      { root: scrollRef.current, rootMargin: "480px" },
    );
    statsObserver.current = observer;
    for (const row of statsRows.current) observer.observe(row);
    return () => {
      observer.disconnect();
      if (statsObserver.current === observer) statsObserver.current = null;
    };
  }, [filterKey, statsPolicy]);
  const statsQuery = usePullRequestListStats(statsTargets);
  statsPending.current = statsQuery.isPending;
  useEffect(() => {
    if (statsPolicy !== "visible" || statsQuery.isPending) return;
    const visible = visibleStatsKeys.current;
    setStatsTargetState((current) => {
      if (current.key !== filterKey || visible.key !== filterKey) return current;
      const batches = retainVisiblePullRequestStatsBatches(current.batches, visible.values);
      return batches.length === current.batches.length ? current : { key: current.key, batches };
    });
  }, [filterKey, statsPolicy, statsQuery.isPending]);
  // Adding or removing one row keys a fresh stats query with nothing in it yet, so the counts
  // are merged into what is already held rather than rebuilt: every count on screen stays until
  // its replacement arrives.
  useEffect(() => {
    const stats = statsQuery.stats;
    if (stats === null) return;
    setStatsByRow((previous) => mergePullRequestDiffStats(previous, stats));
  }, [statsQuery.stats]);
  const displayGroups = useMemo(() => {
    // The reader's pending answers go on here, after grouping: the authored and reviewing
    // groups are read separately from the feed, and a row closed a moment ago has to leave
    // whichever group it was in.
    const enriched = groups.map((group) => {
      const answered = applyPullRequestOverrides(
        group.entries.map((entry) => withDiffStat(entry, statsByRow)),
        overrides,
        pullRequestEntryKey,
        search.state,
      );
      // A row whose draft flag just changed has to pass the local filters again: a draft
      // filter that let it in may not let the new one in.
      return {
        ...group,
        entries:
          hasLocalFilters && overrides.size > 0
            ? answered.filter(
                (entry) =>
                  !overrides.has(pullRequestEntryKey(entry)) ||
                  matchesPullRequestFilters(
                    entry,
                    localFilters,
                    pullRequestEntryViewer(entry, viewers),
                  ),
              )
            : answered,
      };
    });
    // Searching keeps its relevance order and priority groups unless the reader explicitly asks
    // for another sort. The readiness queue is the default browse order, not a way to bury a
    // closer text match.
    return sortPullRequestGroups(
      enriched,
      sort,
      typedParsed.text,
      (entry) =>
        entry.additions + entry.deletions > 0 || statsByRow.has(pullRequestDiffStatKey(entry)),
      search.involvement,
    );
  }, [
    groups,
    hasLocalFilters,
    localFilters,
    overrides,
    search.involvement,
    search.state,
    sort,
    statsByRow,
    typedParsed.text,
    viewers,
  ]);
  /** What is actually on screen once the reader's pending answers are on the rows. */
  const shownCount = displayGroups.reduce((count, group) => count + group.entries.length, 0);
  const [closeSweepKeys, setCloseSweepKeys] = useState<ReadonlySet<string>>(() => new Set());
  const closeSensorRef = useRef<SidebarPointerSensor | null>(null);
  const closeSweepRows = useMemo(
    () =>
      new Map(
        displayGroups.flatMap((group) =>
          group.entries.map(
            (entry) => [pullRequestEntryKey(entry), { entry, groupKey: group.key }] as const,
          ),
        ),
      ),
    [displayGroups],
  );
  const closeSweepRef = useRef({ displayGroups, closeSweepRows, closingKeys, closeBatch });
  closeSweepRef.current = { displayGroups, closeSweepRows, closingKeys, closeBatch };
  useEffect(() => () => closeSensorRef.current?.cancel(), [filterKey, search.q, sort]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || closeSensorRef.current === null) return;
      event.preventDefault();
      closeSensorRef.current.cancel();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, []);
  const startCloseSweep = useCallback((entry: EnvironmentPullRequestEntry, event: PointerEvent) => {
    closeSensorRef.current?.cancel();
    const originKey = pullRequestEntryKey(entry);
    const group = closeSweepRef.current.displayGroups.find((candidate) =>
      candidate.entries.some((row) => pullRequestEntryKey(row) === originKey),
    );
    if (!group || closeSweepRef.current.closingKeys.has(originKey)) return;
    const orderedKeys = closeSweepRef.current.displayGroups.flatMap((candidate) =>
      candidate.entries.map(pullRequestEntryKey),
    );
    const canClose = (key: string) => {
      const row = closeSweepRef.current.closeSweepRows.get(key);
      return (
        row?.groupKey === group.key &&
        row.entry.state === "open" &&
        row.entry.provider === "github" &&
        !closeSweepRef.current.closingKeys.has(key) &&
        !scrollRef.current?.querySelector(
          `[data-pull-request-key="${CSS.escape(key)}"] [data-pull-request-action-pending="true"]`,
        )
      );
    };
    let sweptKeys: string[] = [];
    let targetKey: string | null = null;
    const sweepTo = (key: string) => {
      if (key === targetKey) return;
      targetKey = key;
      sweptKeys = resolveSidebarSweepKeys(orderedKeys, originKey, key, canClose);
      setCloseSweepKeys(new Set(sweptKeys));
    };
    closeSensorRef.current = new SidebarPointerSensor({
      active: originKey,
      event,
      options: {
        distance: 6,
        onAttach: () => {},
        onFinish: () => {
          closeSensorRef.current = null;
          setCloseSweepKeys(new Set());
        },
      },
      onPending: () => {},
      onStart: () => sweepTo(originKey),
      onMove: ({ y }) => {
        const viewport = scrollRef.current;
        if (!viewport) return;
        const bounds = viewport.getBoundingClientRect();
        const visibleY = Math.min(Math.max(y, bounds.top), bounds.bottom - 1);
        let key: string | null = null;
        for (const row of viewport.querySelectorAll<HTMLElement>("[data-pull-request-key]")) {
          if (key !== null && row.getBoundingClientRect().top > visibleY) break;
          key = row.dataset.pullRequestKey ?? null;
        }
        if (key !== null) sweepTo(key);
      },
      onEnd: () => {
        const batch = sweptKeys.filter(canClose).flatMap((key) => {
          const row = closeSweepRef.current.closeSweepRows.get(key);
          return row ? [row.entry] : [];
        });
        void closeSweepRef.current.closeBatch(batch);
      },
      onCancel: () => {},
      onAbort: () => {},
    });
  }, []);
  // The provider list is the workspace's hosts, not the filtered ones, so switching to a host
  // cannot make the switcher that got you there disappear.
  const [hosts, setHosts] = useState<PullRequestListResult["providers"]>([]);
  useEffect(() => {
    // Only from an answer to these filters. Rows carried over from the previous ones bring the
    // host summaries of the question they answered, and coming back from one host to all of them
    // would take the switcher's other hosts out of it on the strength of the narrowed answer.
    if (answered === null) return;
    // An unfiltered response is the full set of hosts. A filtered one only seeds the switcher
    // when there is nothing to seed it with, which is a link that arrived already scoped.
    setHosts((previous) =>
      search.host === undefined || previous.length === 0 ? answered.providers : previous,
    );
  }, [answered, search.host]);
  const showProvider = hosts.length > 1;
  // The workspace's own projects already name their hosts, so the row's shape is known before
  // the list is. Only its shape: which hosts can actually be read still comes from the server.
  const expectedHosts = useMemo(() => {
    const byHost = new Map<string, PullRequestExpectedHost>();
    for (const project of projects) {
      const kind = project.repositoryIdentity?.provider as SourceControlProviderKind | undefined;
      if (kind === undefined) continue;
      const host = pullRequestHostOf(project.repositoryIdentity, kind);
      if (!byHost.has(host)) byHost.set(host, { host, kind });
    }
    return [...byHost.values()];
  }, [projects]);

  /** Reported per project rather than as a count, so the reader can see which one it was. */
  const unavailableProjects = useMemo(
    () =>
      new Map(
        listErrors.map(
          (error) =>
            [
              pullRequestProjectKey({ id: error.projectId, environmentId: error.environmentId }),
              error.message,
            ] as const,
        ),
      ),
    [listErrors],
  );

  const searchInput = (
    <PullRequestSearchInput
      value={search.q ?? ""}
      busy={typedQuery.length > 0 && (!querySettled || showingCarried)}
      onChange={(query) => updateListScope({ q: query || undefined })}
    />
  );
  // The rows carried over from the last filters can also narrow to nothing one step further on,
  // where involvement is applied against the viewers of the answer they came from. "Nothing under
  // these filters" is a claim, and it is the wrong one to make about a question still in flight,
  // so that case waits with the skeletons rather than answering for the hosts. A search says so
  // in its own words and is left to.
  const carriedToNothing =
    showingCarried && listQuery.isPending && shownCount === 0 && typedQuery.length === 0;
  const listBody = (
    <>
      {!capabilityKnown ? (
        <PullRequestListGhost rows={7} />
      ) : !pullRequestsSupported ? (
        <PullRequestsUnavailableState
          title="Pull requests unavailable"
          error="Update your Control servers to browse pull requests."
        />
      ) : firstLoad ? (
        <PullRequestListGhost rows={7} />
      ) : listQuery.error && shownCount === 0 ? (
        <PullRequestsUnavailableState
          error={listQuery.error}
          refreshing={listQuery.isPending}
          onRetry={() => listQuery.refresh()}
        />
      ) : carriedToNothing ? (
        <PullRequestListGhost rows={7} />
      ) : shownCount === 0 ? (
        <PullRequestListEmptyState
          hasProjects={!projectsKnown || projects.length > 0}
          refreshing={refreshing}
          onRefresh={() => void refreshFromHost()}
          query={typedQuery}
          filtered={
            menuFiltered ||
            search.state !== "open" ||
            search.involvement !== "all" ||
            scopedProjectId !== undefined ||
            search.host !== undefined
          }
          searching={typedQuery.length > 0 && (!querySettled || showingCarried)}
          canLoadMore={listData?.truncated === true && (canContinue || pageSize < MAX_PAGE_SIZE)}
          loadingMore={loadingMore}
          onClearQuery={() => updateListScope({ q: undefined })}
          onLoadMore={loadMore}
        />
      ) : (
        <div className={cn("space-y-3", closeSweepKeys.size > 0 && "**:pointer-events-none")}>
          {displayGroups.map((group) => (
            <div key={group.key} className="space-y-0.5">
              {group.label ? <PullRequestGroupHeader group={group} /> : null}
              {group.entries.map((entry) => {
                const entryKey = pullRequestEntryKey(entry);
                return (
                  <PullRequestRow
                    key={entryKey}
                    statsKey={entryKey}
                    statsRef={registerStatsRow}
                    entry={entry}
                    showProjectTitle
                    showProvider={showProvider}
                    {...(capableEnvironments.length > 1 &&
                    environmentLabels.get(entry.environmentId) !== undefined
                      ? { environmentLabel: environmentLabels.get(entry.environmentId)! }
                      : {})}
                    // Ten is the floor the ranking gives a row whose own fields say nothing
                    // about the search: the host matched something this row cannot show.
                    matchedElsewhere={
                      typedParsed.text.length > 0 &&
                      scorePullRequestMatch(entry, typedParsed.text) <= MATCHED_ELSEWHERE_SCORE
                    }
                    selected={false}
                    onSelect={onOpen}
                    speedMode={speedMode}
                    onActed={onSpeedAction}
                    closing={closingKeys.has(entryKey)}
                    sweeping={closeSweepKeys.has(entryKey)}
                    onCloseSweepStart={startCloseSweep}
                  />
                );
              })}
            </div>
          ))}
        </div>
      )}

      {listQuery.error && shownCount > 0 ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning-surface px-3 py-2 text-xs">
          <span>{listQuery.error} Showing the last pull requests loaded.</span>
          <Button size="xs" variant="outline" onClick={() => listQuery.refresh()}>
            Retry
          </Button>
        </div>
      ) : null}
      {listData?.truncated && entries.length > 0 ? (
        <div className="flex justify-center py-3 text-xs text-muted-foreground">
          {loadingMore ? (
            <span className="flex items-center gap-2">
              <Spinner aria-hidden size="sm" />
              {sentCursors === null ? "Updating pull requests" : "Loading more"}
            </span>
          ) : canContinue || pageSize < MAX_PAGE_SIZE ? (
            <Button
              size="sm"
              variant="outline"
              onClick={loadMore}
              disabled={listQuery.isPending || showingCarried}
            >
              Load more pull requests
            </Button>
          ) : (
            <span>Narrow your search to find more pull requests.</span>
          )}
        </div>
      ) : null}
    </>
  );
  // The same names and glyphs the host pills wear, so the compact menu and the pills read as
  // one control: "GitHub" with its mark, never the bare hostname — unless two installs of one
  // kind force the hostname to tell them apart.
  const hostEntries = hosts.length > 0 ? hosts : expectedHosts;
  const hostMenuOptions: ReadonlyArray<PullRequestFilterOption<string>> = [
    { value: "", label: "All", Icon: Plug2Icon },
    ...hostEntries.map((entry) => {
      // `expectedHosts` stands in before the server has answered, and nothing is known to be
      // unreadable yet; once the summaries arrive they carry whether each one could be read.
      const summary = hosts.find((host) => host.host === entry.host);
      return {
        value: entry.host,
        label: pullRequestHostLabel(hostEntries, entry),
        Icon: getSourceControlPresentationForKind(entry.kind).Icon,
        ...(summary === undefined || summary.configured
          ? {}
          : { unavailable: summary.detail ?? "This host could not be read." }),
      };
    }),
  ];
  // The same shape the host pills take, so the two groups read as one control. Each server
  // wears the machine it runs on.
  const serverMenuOptions: ReadonlyArray<PullRequestFilterOption<string>> = [
    { value: "", label: "All servers", Icon: LayersIcon },
    ...capableEnvironments.map((environment) => ({
      value: environment.environmentId,
      label: environment.label,
      Icon: environmentMachineIcon(resolveEnvironmentMachineKind(environment.serverConfig)),
    })),
  ];
  const sortOption = SORT_OPTIONS.find((option) => option.value === sort) ?? SORT_OPTIONS[0];
  const sortMenu = (
    <Menu>
      <MenuTrigger
        render={
          wide ? (
            <button type="button" className="s-sc-pk" />
          ) : (
            <button type="button" className="s-sc-ib" aria-label={`Sort: ${sortOption.label}`} />
          )
        }
      >
        <ArrowDownUpIcon aria-hidden />
        {wide ? (
          <>
            <span>{sortOption.label}</span>
            <ChevronDownIcon aria-hidden />
          </>
        ) : null}
      </MenuTrigger>
      <MenuPopup align="end" side="bottom">
        <MenuRadioGroup
          value={sort}
          onValueChange={(next) => updateListScope({ sort: next as PullRequestListSort })}
        >
          {SORT_OPTIONS.map((option) => (
            <MenuRadioItem key={option.value} value={option.value}>
              <span className="flex min-w-0 items-center gap-2">
                <option.Icon aria-hidden className="size-3.5" />
                {option.label}
              </span>
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuPopup>
    </Menu>
  );
  const filtersMenu = (layout: "icon" | "pickers") => (
    <PullRequestFiltersMenu
      layout={layout}
      onOpenChange={setFiltersOpen}
      state={search.state}
      stateOptions={STATE_TABS}
      onState={(state) => updateListScope({ state })}
      involvement={search.involvement}
      involvementOptions={INVOLVEMENT_TABS}
      onInvolvement={(involvement) => updateListScope({ involvement })}
      filters={menuFilters}
      onFilters={(next) =>
        updateListScope({
          draft: next.draft,
          review: next.review,
          checks: next.checks,
          author: next.author,
          labels: next.labels?.flatMap((group) => group),
        })
      }
      authorOptions={facets.authors}
      labelOptions={facets.labels}
      host={search.host}
      hostOptions={hostMenuOptions}
      onHost={(host) => updateListScope({ host })}
      server={scopedEnvironmentId ?? undefined}
      serverOptions={serverMenuOptions}
      // Narrowing to one server drops a project scope belonging to another, which would
      // otherwise narrow the list to nothing with no visible filter to explain it.
      onServer={(server) => updateListScope({ environmentId: server, projectId: undefined })}
      projects={scopedProjects}
      projectId={scopedProjectId}
      projectEnvironmentId={scopedProject?.environmentId}
      unavailable={unavailableProjects}
      // The environment comes along with the project it belongs to, so a duplicate id on
      // another server never gets narrowed to by mistake; picking "All projects" leaves the
      // server scope as it was rather than clearing it.
      onProject={(projectId, environmentId) =>
        updateListScope(environmentId === undefined ? { projectId } : { projectId, environmentId })
      }
    />
  );
  const repoScoped =
    threadProject !== null &&
    scopedProject?.id === threadProject.id &&
    scopedProject.environmentId === threadProject.environmentId;

  return (
    <div ref={setRootElement} className="s-sc-root flex min-h-0 min-w-0 flex-1 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {children}
        <div className="s-sc-ic">
          {threadProject === null ? null : (
            <Seg
              label="Pull requests from"
              options={SCOPES}
              value={repoScoped ? "This repo" : scopedProjectId === undefined ? "All" : null}
              onChange={(scope) =>
                updateListScope(
                  scope === "This repo"
                    ? { projectId: threadProject.id, environmentId: threadProject.environmentId }
                    : { projectId: undefined, environmentId: undefined },
                )
              }
            />
          )}
          {searchInput}
          {wide ? null : filtersMenu("icon")}
          {sortMenu}
          <PullRequestRefreshControl
            refreshing={refreshing}
            onRefresh={() => void refreshFromHost()}
          />
        </div>
        {wide ? <div className="s-sc-ifb">{filtersMenu("pickers")}</div> : null}
        <div className="flex flex-col gap-3 px-1.5 pt-1 pb-3">{listBody}</div>
      </div>
    </div>
  );
}

function PullRequestRefreshControl({
  refreshing,
  onRefresh,
}: {
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <button
      type="button"
      className="s-sc-ib"
      aria-label="Refresh pull requests"
      onClick={onRefresh}
      disabled={refreshing}
    >
      <RefreshIcon size="md" refreshing={refreshing} />
    </button>
  );
}
