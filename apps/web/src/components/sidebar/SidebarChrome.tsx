import { useAtomValue } from "@effect/atom-react";
import type { ServerProviderUsageWindow } from "@control/contracts";
import { formatDuration } from "@control/shared/usageLimits";
import type { CSSProperties, ReactNode } from "react";
import { Fragment, memo, useCallback } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { ChartNoAxesColumnIcon, ChevronLeftIcon, PanelLeftIcon, SettingsIcon } from "lucide-react";

import { cn } from "../../lib/utils";
import { primaryServerProvidersAtom } from "../../state/server";
import { StairLogo } from "../control/bloom";
import { useSidebar } from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { isSidebarUtilityPage, useNavigateToMainApp } from "./mainAppLocation";
import { SidebarThreadUndoNotice } from "./SidebarThreadUndoNotice";
import { SidebarProviderUpdatePill } from "./SidebarProviderUpdatePill";
import { SidebarUpdateArchitectureWarning, SidebarUpdatePill } from "./SidebarUpdatePill";

/**
 * Design v1's top row (§3.1): room for the window's traffic lights, the sidebar
 * toggle, settings, and the stair logo centred in what is left.
 */
export const SidebarChromeHeader = memo(function SidebarChromeHeader({
  isElectron,
}: {
  isElectron: boolean;
}) {
  const navigate = useNavigate();
  const navigateToMainApp = useNavigateToMainApp();
  const { isMobile, setOpenMobile, toggleSidebar } = useSidebar();
  // Settings takes the sidebar's place under the held gear (design §22.2); the gear leads back.
  const onSettings = useLocation({
    select: (location) =>
      location.pathname === "/settings" || location.pathname.startsWith("/settings/"),
  });
  const handleSettingsClick = useCallback(() => {
    if (isMobile) setOpenMobile(false);
    void (onSettings ? navigateToMainApp() : navigate({ to: "/settings" }));
  }, [isMobile, navigate, navigateToMainApp, onSettings, setOpenMobile]);

  return (
    <div className={cn("t3-top", isElectron && "drag-region")}>
      {/* Electron draws the real lights here (trafficLightPosition 16, 20). */}
      <span className="lights" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <SidebarChromeButton className="t3-tg" label="Toggle main sidebar" onClick={toggleSidebar}>
        <PanelLeftIcon className="t3g" />
      </SidebarChromeButton>
      <SidebarChromeButton
        className="t3-ib d-set"
        label={onSettings ? "Close settings" : "Settings"}
        pressed={onSettings}
        onClick={handleSettingsClick}
      >
        <SettingsIcon className="t3g" />
      </SidebarChromeButton>
      <Link aria-label="Go to threads" className="t3-wm d-wm [-webkit-app-region:no-drag]" to="/">
        <StairLogo />
      </Link>
    </div>
  );
});

function SidebarChromeButton(props: {
  readonly className: string;
  readonly label: string;
  readonly pressed?: boolean;
  readonly onClick: () => void;
  readonly children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={props.label}
            aria-pressed={props.pressed}
            data-on={props.pressed ? "" : undefined}
            className={`${props.className} [-webkit-app-region:no-drag]`}
            onClick={props.onClick}
          />
        }
      >
        {props.children}
      </TooltipTrigger>
      <TooltipPopup side="bottom">{props.label}</TooltipPopup>
    </Tooltip>
  );
}

/** Design v1's foot (§3.6): statistics, or the way back from a utility page. */
export const SidebarFoot = memo(function SidebarFoot() {
  const navigate = useNavigate();
  const navigateToMainApp = useNavigateToMainApp();
  const { isMobile, setOpenMobile } = useSidebar();
  const isOnUtilityPage = useLocation({
    select: (location) => isSidebarUtilityPage(location.pathname),
  });
  const closeMobileSidebar = useCallback(() => {
    if (isMobile) setOpenMobile(false);
  }, [isMobile, setOpenMobile]);

  return (
    <div className="t3-foot">
      <div className="t3-util">
        {isOnUtilityPage ? (
          <SidebarChromeButton
            className="t3-ib"
            label="Back"
            onClick={() => {
              closeMobileSidebar();
              void navigateToMainApp();
            }}
          >
            <ChevronLeftIcon className="gi" />
          </SidebarChromeButton>
        ) : (
          <SidebarChromeButton
            className="t3-ib"
            label="Usage"
            onClick={() => {
              closeMobileSidebar();
              void navigate({ to: "/usage" });
            }}
          >
            <ChartNoAxesColumnIcon className="t3g" />
          </SidebarChromeButton>
        )}
        <SidebarUpdatePill />
      </div>
    </div>
  );
});

export const SidebarChromeFooter = memo(function SidebarChromeFooter() {
  return (
    <>
      <SidebarThreadUndoNotice />
      <SidebarProviderUpdatePill />
      <SidebarUpdateArchitectureWarning />
      <SidebarUsageStrip />
      <SidebarFoot />
    </>
  );
});

// Design v1's usage lines (§3.6): the first provider reporting a session and a
// weekly window, as 5H and 7D with the used share and when each resets.
export function SidebarUsageStrip() {
  const providers = useAtomValue(primaryServerProvidersAtom);
  const windows = providers.flatMap((provider) => provider.usageLimits?.windows ?? []);
  const session = windows.find((window) => window.kind === "session");
  const weekly = windows.find((window) => window.kind === "weekly");
  if (!session && !weekly) return null;
  const now = Date.now();
  const rows = [
    ["5H", "u5h", "5 hour", session],
    ["7D", "u7d", "7 day", weekly],
  ] as const;
  return (
    <div className="hy-use">
      {rows.map(([key, line, spoken, window]) =>
        window ? (
          <Fragment key={key}>
            <span className="hy-uk">{key}</span>
            <span className="hy-up">{Math.round(window.usedPercent)}%</span>
            <span />
            <span className="hy-ur">{usageResetLabel(window, now)}</span>
            <span
              className={`use-line ${line}`}
              style={{ "--v": window.usedPercent / 100, "--use-w": "100%" } as CSSProperties}
              role="img"
              aria-label={`${spoken} usage ${Math.round(window.usedPercent)} %`}
            >
              <i />
            </span>
          </Fragment>
        ) : null,
      )}
    </div>
  );
}

// A session window shows the time left as hh:mm; a weekly one, the reset day.
function usageResetLabel(window: ServerProviderUsageWindow, now: number): string {
  if (window.resetsAt === undefined) return "";
  const at = Date.parse(window.resetsAt);
  if (window.kind === "weekly") {
    return new Date(at).toLocaleDateString("en-GB", { weekday: "short" });
  }
  // Written as Usage writes it, `3h 5m` (owner, 29 Oct).
  return formatDuration(at - now);
}
