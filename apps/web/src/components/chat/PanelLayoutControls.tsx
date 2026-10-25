import { Maximize2, Minimize2 } from "lucide";
import { CommandIcon, PanelRightIcon, SquareMenuIcon } from "lucide-react";
import { MorphIcon } from "~/components/MorphIcon";
import { memo, type ReactElement, type ReactNode } from "react";

import type { ThreadPanelPresentation } from "../../rightPanelLayout";
import { PopoverCreateHandle, PopoverTrigger } from "../ui/popover";
import { Toggle } from "../ui/toggle";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export interface PanelLayoutControlsProps {
  showThreadPanelControl?: boolean;
  showRightPanelControl?: boolean;
  /** The chat's Loose ends icon (HANDOFF §17.2), last in the row; absent elsewhere. */
  looseEnds?: ReactNode;
  threadPanelOpen: boolean;
  threadPanelPresentation: ThreadPanelPresentation;
  threadPanelPopoverHandle?: ReturnType<typeof PopoverCreateHandle>;
  threadPanelShortcutLabel: string | null;
  rightPanelAvailable: boolean;
  rightPanelOpen: boolean;
  rightPanelShortcutLabel: string | null;
  rightPanelUnavailableLabel?: string;
  /** The chat head's ⌘K button (owner, 16 Oct), left of the toggles; absent elsewhere. */
  onOpenCommandPalette?: () => void;
  commandPaletteShortcutLabel?: string | null;
  onToggleThreadPanel: () => void;
  onToggleRightPanel: () => void;
}

export const PanelLayoutControls = memo(function PanelLayoutControls({
  showThreadPanelControl = true,
  showRightPanelControl = true,
  looseEnds,
  threadPanelOpen,
  threadPanelPresentation,
  threadPanelPopoverHandle,
  threadPanelShortcutLabel,
  rightPanelAvailable,
  rightPanelOpen,
  rightPanelShortcutLabel,
  rightPanelUnavailableLabel = "Right panel is unavailable",
  onOpenCommandPalette,
  commandPaletteShortcutLabel,
  onToggleThreadPanel,
  onToggleRightPanel,
}: PanelLayoutControlsProps) {
  // Design v1's head toggles (§4.1): 32 px icon buttons, filled while their panel is open.
  const threadPanelToggle = (
    <button
      type="button"
      className="t3-ib relative [-webkit-app-region:no-drag]"
      aria-pressed={threadPanelOpen}
      data-on={threadPanelOpen ? "" : undefined}
      aria-label="Toggle thread details panel"
    >
      <SquareMenuIcon className="t3g" />
    </button>
  );
  const threadPanelTooltip = (trigger: ReactElement) => (
    <Tooltip>
      <TooltipTrigger
        render={trigger}
        {...(threadPanelPresentation === "popover" ? {} : { onClick: onToggleThreadPanel })}
      />
      <TooltipPopup side="bottom">
        Toggle thread details
        {threadPanelShortcutLabel ? ` (${threadPanelShortcutLabel})` : ""}
      </TooltipPopup>
    </Tooltip>
  );

  return (
    <div className="t3-tools [-webkit-app-region:no-drag]" data-panel-layout-controls>
      {onOpenCommandPalette ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                className="t3-ib d-cmdk [-webkit-app-region:no-drag]"
                onClick={onOpenCommandPalette}
                aria-label="Command palette"
              />
            }
          >
            <CommandIcon className="t3g" />
          </TooltipTrigger>
          <TooltipPopup side="bottom">
            Command palette{commandPaletteShortcutLabel ? ` (${commandPaletteShortcutLabel})` : ""}
          </TooltipPopup>
        </Tooltip>
      ) : null}
      {showThreadPanelControl
        ? threadPanelPresentation === "popover"
          ? threadPanelTooltip(
              <PopoverTrigger handle={threadPanelPopoverHandle} render={threadPanelToggle} />,
            )
          : threadPanelTooltip(threadPanelToggle)
        : null}
      {showRightPanelControl ? (
        <Tooltip>
          <TooltipTrigger render={<span className="flex shrink-0" />}>
            <button
              type="button"
              className="t3-ib [-webkit-app-region:no-drag]"
              aria-pressed={rightPanelOpen}
              data-on={rightPanelOpen ? "" : undefined}
              onClick={onToggleRightPanel}
              aria-label="Toggle right panel"
              disabled={!rightPanelAvailable}
            >
              <PanelRightIcon className="t3g" />
            </button>
          </TooltipTrigger>
          <TooltipPopup side="bottom">
            {rightPanelAvailable
              ? `Toggle right panel${rightPanelShortcutLabel ? ` (${rightPanelShortcutLabel})` : ""}`
              : rightPanelUnavailableLabel}
          </TooltipPopup>
        </Tooltip>
      ) : null}
      {looseEnds}
    </div>
  );
});

export const RightPanelMaximizeControl = memo(function RightPanelMaximizeControl({
  maximized,
  onToggle,
}: {
  maximized: boolean;
  onToggle: () => void;
}) {
  const label = maximized ? "Restore panel size" : "Maximize panel";
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Toggle
            className="shrink-0 [-webkit-app-region:no-drag]"
            pressed={maximized}
            onPressedChange={onToggle}
            aria-label={label}
            variant="ghost"
            size="sm"
          >
            <MorphIcon className="size-4" icon={maximized ? Minimize2 : Maximize2} />
          </Toggle>
        }
      />
      <TooltipPopup side="bottom">{label}</TooltipPopup>
    </Tooltip>
  );
});
