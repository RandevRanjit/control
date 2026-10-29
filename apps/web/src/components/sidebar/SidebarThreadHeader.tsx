/**
 * The sidebar header: one row holding search, then new group and new thread as
 * icons at the end. Search owns the row's text and spans it.
 */
import { SearchIcon, SquarePenIcon, XIcon } from "lucide-react";
import {
  type ComponentProps,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from "react";

import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export interface SidebarThreadHeaderProps {
  /** Without projects there are no chats to group, so those controls stay out. */
  /** Receives the click so Shift+click can skip the project picker. */
  onNewThread: (event: ReactMouseEvent) => void;
  newThreadDisabled: boolean;
  newThreadShortcutLabel: string | null | undefined;
  newThreadInProjectShortcutLabel: string | null | undefined;
  /** Shift+click only matters once there is more than one project to pick. */
  showNewThreadInProjectHint: boolean;
  searchInputRef: RefObject<HTMLInputElement | null>;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onSearchKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  isSearching: boolean;
  searchResultCount: number;
  activeSearchResultIndex: number;
  onClearSearch: () => void;
}

export function SidebarThreadHeader({
  onNewThread,
  newThreadDisabled,
  newThreadShortcutLabel,
  newThreadInProjectShortcutLabel,
  showNewThreadInProjectHint,
  searchInputRef,
  searchQuery,
  onSearchQueryChange,
  onSearchKeyDown,
  isSearching,
  searchResultCount,
  activeSearchResultIndex,
  onClearSearch,
}: SidebarThreadHeaderProps) {
  const resultsVisible = isSearching && searchResultCount > 0;
  // Results shrink as the query narrows, so the active index can outrun the
  // list; pointing aria-activedescendant at a removed option strands the
  // screen reader on nothing.
  const activeResultExists = resultsVisible && activeSearchResultIndex < searchResultCount;
  const newThreadLabel = newThreadShortcutLabel
    ? `New thread (${newThreadShortcutLabel})`
    : "New thread";

  return (
    // Design v1's search row (§3.2): the field, then new group (in place of the old
    // project scope, owner 11 Oct) and new chat, whose picker adds folders (owner, 16 Oct).
    <div className="t3-srch">
      <div className="t3-sf">
        <SearchIcon className="t3g" />
        <input
          ref={searchInputRef}
          type="search"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.currentTarget.value)}
          onKeyDown={onSearchKeyDown}
          placeholder="Search"
          aria-label="Search threads"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={resultsVisible}
          aria-controls={resultsVisible ? "sidebar-thread-search-results" : undefined}
          aria-activedescendant={
            activeResultExists
              ? `sidebar-thread-search-result-${activeSearchResultIndex}`
              : undefined
          }
          // w-0: the input's built-in width must not push the icon buttons narrower.
          className="w-0 min-w-0 flex-1 appearance-none border-0 bg-transparent p-0 text-inherit outline-none placeholder:text-inherit [&::-webkit-search-cancel-button]:hidden"
          style={{ font: "inherit" }}
        />
        {isSearching ? (
          <Button
            type="button"
            size="icon-micro"
            variant="ghost-muted"
            className="shrink-0"
            aria-label="Clear thread search"
            onClick={() => {
              onClearSearch();
              searchInputRef.current?.focus();
            }}
          >
            <XIcon className="size-3" />
          </Button>
        ) : null}
      </div>
      <SidebarHeaderIconButton
        label="New thread"
        tooltip={
          showNewThreadInProjectHint ? (
            <span className="flex flex-col gap-0.5">
              <span>{newThreadLabel}</span>
              <span className="text-muted-foreground">
                New thread in current project: Shift+click
                {newThreadInProjectShortcutLabel ? ` (${newThreadInProjectShortcutLabel})` : ""}
              </span>
            </span>
          ) : (
            newThreadLabel
          )
        }
        disabled={newThreadDisabled}
        onClick={onNewThread}
      >
        <SquarePenIcon className="t3g" />
      </SidebarHeaderIconButton>
    </div>
  );
}

/** Design v1's icon button (`.t3-ib`) with a tooltip; other props reach the button. */
function SidebarHeaderIconButton({
  label,
  tooltip = label,
  className,
  children,
  ...rest
}: {
  /** Accessible name; also the tooltip unless `tooltip` says more. */
  label: string;
  tooltip?: ReactNode;
  className?: string | undefined;
  children?: ReactNode;
} & Omit<ComponentProps<"button">, "children" | "className" | "aria-label">) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            {...rest}
            className={className ? `t3-ib ${className}` : "t3-ib"}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipPopup side="top">{tooltip}</TooltipPopup>
    </Tooltip>
  );
}
