import { useAtomValue } from "@effect/atom-react";
import { useParams } from "@tanstack/react-router";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { create } from "zustand";

import { isCommandPaletteOpen } from "../../commandPaletteBus";
import { resolveShortcutCommand, shortcutLabelForCommand } from "../../keybindings";
import { isEditableFocused } from "../../lib/editableFocus";
import { isPreviewFocused } from "../../lib/previewFocus";
import { isTerminalFocused } from "../../lib/terminalFocus";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { useGroups } from "../../state/entities";
import { lockEnvironment, useFullLockUntil } from "../../state/lock";
import { projectEnvironment } from "../../state/projects";
import { primaryServerKeybindingsAtom } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { useOrchestrationCommand } from "../../state/use-orchestration-command";
import { resolveThreadRouteRef } from "../../threadRoutes";
import { GroupPearl } from "../GroupDialog";
import { Dialog, DialogPopup } from "../ui/dialog";
import {
  canLockUntil,
  clockLabel,
  defaultTickedGroups,
  fullLockSummary,
  groupKeyOf,
  groupLockSummary,
  groupRowCount,
  joinNames,
  LOCK_PRESETS,
  type LockPreset,
  parseClock,
} from "./lock.logic";
import { useLockChats } from "./useLock";

type SheetRequest = {
  readonly mode: "Full" | "Group";
  /** Group mode's ticks; the default is the groups with a working chat, less the open chat's. */
  readonly groupKeys?: ReadonlyArray<string>;
};
const useSheet = create<{ request: SheetRequest | null }>(() => ({ request: null }));

/** Opens the lock sheet (HANDOFF §16.2): from ⌘L, the offer's Lock, or Lock… in a group's menu. */
export const openLockSheet = (request: SheetRequest) => useSheet.setState({ request });
const closeSheet = () => useSheet.setState({ request: null });

/** Mounted with the app: the sheet when open, and ⌘L wherever the window is, the plate included. */
export function LockSheetHost() {
  const request = useSheet((state) => state.request);
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || isCommandPaletteOpen()) return;
      const command = resolveShortcutCommand(event, keybindings, {
        context: {
          previewFocus: isPreviewFocused(),
          terminalFocus: isTerminalFocused(),
          editableFocus: isEditableFocused(event.target),
        },
      });
      if (command !== "lock.open") return;
      event.preventDefault();
      openLockSheet({ mode: "Full" });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [keybindings]);
  return request === null ? null : <LockSheet request={request} />;
}

/** The sheet's two-way switch, the design's `.seg` with its sliding pill. */
function Seg<T extends string>(props: {
  readonly label: string;
  readonly options: ReadonlyArray<T>;
  readonly value: T | null;
  readonly onChange: (value: T) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<CSSProperties | null>(null);
  const index = props.value === null ? -1 : props.options.indexOf(props.value);
  useLayoutEffect(() => {
    const on = ref.current?.querySelectorAll("button")[index];
    setPill(
      on ? ({ "--x": `${on.offsetLeft}px`, "--w": `${on.offsetWidth}px` } as CSSProperties) : null,
    );
  }, [index]);
  return (
    <div ref={ref} className="seg sm" role="group" aria-label={props.label}>
      {props.options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={option === props.value}
          onClick={() => props.onChange(option)}
        >
          {option}
        </button>
      ))}
      {pill === null ? null : <i className="seg-pill" aria-hidden="true" style={pill} />}
    </div>
  );
}

const TICK = (
  <svg viewBox="0 0 12 12" aria-hidden="true">
    <path
      d="M2.6 6.3l2.2 2.2 4.6-4.9"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

type Preset = (typeof LOCK_PRESETS)[number];

/** When a lock pressed at `atMs` ends: the preset's span from then, or the typed time. */
const lockEnd = (preset: Preset | null, typed: string | null, atMs: number) =>
  preset !== null ? atMs + preset.minutes * 60_000 : parseClock(typed ?? "", atMs);

/** The end, fixed the moment Lock is pressed (HANDOFF §16.2); null when a lock may not end then. */
function endOnPress(preset: Preset | null, typed: string | null, floorMs: number | null) {
  const atMs = Date.now();
  const untilMs = lockEnd(preset, typed, atMs);
  return untilMs !== null && canLockUntil(untilMs, atMs, floorMs) ? untilMs : null;
}

function Row(props: { readonly label: string; readonly children: ReactNode }) {
  return (
    <>
      <span className="s-lk-lb">{props.label}</span>
      {props.children}
    </>
  );
}

function LockSheet(props: { readonly request: SheetRequest }) {
  const environmentId = usePrimaryEnvironmentId();
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const runningUntil = useFullLockUntil();
  const chats = useLockChats();
  const groups = useGroups();
  const routeThread = useParams({
    strict: false,
    select: (params) => resolveThreadRouteRef(params),
  });
  const lockButton = useRef<HTMLButtonElement>(null);
  const shortcut = shortcutLabelForCommand(keybindings, "lock.open");
  const setLock = useAtomCommand(lockEnvironment.set);
  const mutateGroup = useOrchestrationCommand(projectEnvironment.mutateGroup);

  const [mode, setMode] = useState(props.request.mode);
  const [ticked, setTicked] = useState<ReadonlyArray<string>>(() => {
    if (props.request.groupKeys !== undefined) return props.request.groupKeys;
    const open = chats.find(
      (chat) =>
        chat.thread.id === routeThread?.threadId &&
        chat.thread.environmentId === routeThread.environmentId,
    );
    return defaultTickedGroups(groups, chats, open?.groupKey ?? null);
  });
  const [nowMs, setNowMs] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 10_000);
    return () => clearInterval(timer);
  }, []);

  // During a full lock the sheet only extends it: presets that end sooner go.
  const runningMs = runningUntil === null ? null : Date.parse(runningUntil);
  const extending = mode === "Full" && runningMs !== null;
  const floorMs = extending ? runningMs : null;
  const presets = LOCK_PRESETS.filter((preset) =>
    canLockUntil(nowMs + preset.minutes * 60_000, nowMs, floorMs),
  );
  const [preset, setPreset] = useState<LockPreset | null>("2 h");
  const [typed, setTyped] = useState<string | null>(null);
  const chosen = presets.find((candidate) => candidate.label === preset) ?? null;
  const endMs = lockEnd(chosen, typed, nowMs);
  const end = endMs === null ? "" : clockLabel(endMs);
  const endText = end === "" ? "…" : end;

  const tickedGroups = groups.filter((group) => ticked.includes(groupKeyOf(group)));
  const valid =
    endMs !== null &&
    canLockUntil(endMs, nowMs, floorMs) &&
    (mode === "Full" || tickedGroups.length > 0);

  const lock = async () => {
    const untilMs = endOnPress(chosen, typed, floorMs);
    if (environmentId === null || untilMs === null) return;
    const until = new Date(untilMs).toISOString();
    if (mode === "Full") {
      const result = await setLock({ environmentId, input: { until } });
      if (result._tag === "Success") closeSheet();
      return;
    }
    // A group already locked past this time stays as it is; the server never shortens a lock.
    for (const group of tickedGroups) {
      if (group.lockedUntil !== null && Date.parse(group.lockedUntil) >= untilMs) continue;
      const result = await mutateGroup({
        environmentId: group.environmentId,
        input: { type: "group.lock", groupId: group.id, until },
      });
      if (result._tag !== "Success") return;
    }
    closeSheet();
  };

  const names = tickedGroups.map((group) => group.name.toUpperCase());
  const openNames = [
    ...groups
      .filter((group) => !ticked.includes(groupKeyOf(group)))
      .map((group) => group.name.toUpperCase()),
    ...(chats.some((chat) => chat.live && chat.groupKey === null) ? ["Loose"] : []),
  ];
  const promise = `No early unlock. Nothing lifts it before ${endText}: not quitting CONTROL, not restarting, not rebooting. A chat that needs you comes through until you've answered it.`;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) closeSheet();
      }}
    >
      <DialogPopup
        variant="bare"
        showCloseButton={false}
        bottomStickOnMobile={false}
        aria-label="Lock"
        initialFocus={lockButton}
      >
        <form
          className="s-lk-root"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid) void lock();
          }}
        >
          <div className="panel float s-lk-sheet">
            <div className="s-lk-shh">
              Lock
              <span className="sp" />
              {shortcut === null ? null : <span className="kbd">{shortcut}</span>}
            </div>
            <p className="s-lk-q">
              Lock {mode === "Full" ? "everything" : joinNames(names) || "a group"} until{" "}
              <span className="t-num">{endText}</span>?
            </p>
            <p className="s-lk-qs">
              {mode === "Full"
                ? fullLockSummary(chats)
                : groupLockSummary(
                    chats.filter(
                      (chat) => chat.groupKey !== null && ticked.includes(chat.groupKey),
                    ),
                    openNames,
                  )}
            </p>
            <div className="s-lk-form">
              <Row label="Mode">
                <div>
                  <Seg
                    label="Lock mode"
                    options={["Group", "Full"] as const}
                    value={mode}
                    onChange={setMode}
                  />
                </div>
              </Row>
              {mode === "Full" ? (
                <Row label="Covers">
                  <div className="s-lk-cov">
                    <span>
                      <b>The window</b>shows the lock plate
                    </span>
                    <span>
                      <b>Every chat</b>refuses your sends, from every device
                    </span>
                    <span>
                      <code>claude</code>refuses new prompts in any terminal
                    </span>
                  </div>
                </Row>
              ) : (
                <Row label="Groups">
                  <div className="s-lk-gl">
                    {groups.map((group) => {
                      const key = groupKeyOf(group);
                      const on = ticked.includes(key);
                      return (
                        <button
                          key={key}
                          type="button"
                          className="s-lk-gr"
                          aria-pressed={on}
                          onClick={() =>
                            setTicked(
                              on ? ticked.filter((other) => other !== key) : [...ticked, key],
                            )
                          }
                        >
                          <span className="s-lk-box" data-on={on ? "" : undefined}>
                            {on ? TICK : null}
                          </span>
                          <GroupPearl tint={group.tint} />
                          <span className="s-lk-gn">{group.name.toUpperCase()}</span>
                          <span className="s-lk-gm">
                            {groupRowCount(chats.filter((chat) => chat.groupKey === key))}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </Row>
              )}
              <Row label="For">
                <div className="s-lk-rw">
                  {presets.length > 0 ? (
                    <Seg
                      label="Lock for"
                      options={presets.map((candidate) => candidate.label)}
                      value={chosen?.label ?? null}
                      onChange={(label) => {
                        setPreset(label);
                        setTyped(null);
                      }}
                    />
                  ) : null}
                  <label className="input s-lk-until">
                    Until
                    <input
                      aria-label="Until"
                      inputMode="numeric"
                      placeholder="18:00"
                      value={typed ?? end}
                      onChange={(event) => {
                        setTyped(event.target.value);
                        setPreset(null);
                      }}
                    />
                  </label>
                </div>
              </Row>
            </div>
            <p className="s-lk-promise">{promise}</p>
            <div className="s-lk-shf">
              <span className="sp" />
              <button type="button" className="pill ghost" onClick={closeSheet}>
                Cancel
              </button>
              <button ref={lockButton} type="submit" className="pill primary" disabled={!valid}>
                {extending ? "Extend" : "Lock"} <span className="kbd">↩</span>
              </button>
            </div>
          </div>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
