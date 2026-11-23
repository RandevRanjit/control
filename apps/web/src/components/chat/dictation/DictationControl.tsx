import { VOICE_RECORDING_LIMIT_SECONDS } from "@control/client-runtime/voice-input";
import { MicIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Popover, PopoverPopup, PopoverTrigger } from "../../ui/popover";
import { Spinner } from "../../ui/spinner";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../../ui/tooltip";
import { composerFloatingLayerProps } from "../composerEventScope";
import { DictationModel } from "./DictationModel";
import type { Microphone } from "./Microphone";
import type { useComposerDictation } from "./useComposerDictation";

const iconButtonClassName =
  "t3-ib cursor-pointer outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-64";

/** The prompt keeps its focus and caret while a button here is pressed. */
const keepFocus = (event: React.PointerEvent) => event.preventDefault();

/** The composer's microphone: talk, and the words land in the prompt. */
export function DictationControl(props: {
  readonly dictation: ReturnType<typeof useComposerDictation>;
  /** Whether the prompt takes text now. */
  readonly enabled: boolean;
}) {
  const { dictation, enabled } = props;
  const { environmentId, model, state } = dictation;
  if (model === null || environmentId === null) return null;

  if (state.phase === "recording") {
    return (
      <>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                className={iconButtonClassName}
                onPointerDown={keepFocus}
                onClick={dictation.cancel}
                aria-label="Discard dictation"
              />
            }
          >
            <XIcon className="t3g" />
          </TooltipTrigger>
          <TooltipPopup>Discard (Esc)</TooltipPopup>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                className="flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded-full bg-accent px-3 text-xs tabular-nums text-foreground outline-none hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring"
                onPointerDown={keepFocus}
                onClick={dictation.stop}
                aria-label="Stop dictating"
              />
            }
          >
            <LevelMeter microphone={dictation.microphone} />
            <Elapsed />
            <i aria-hidden="true" className="size-2.5 rounded-xs bg-current" />
          </TooltipTrigger>
          <TooltipPopup>Stop and write it down</TooltipPopup>
        </Tooltip>
      </>
    );
  }

  if (state.phase === "preparing" || state.phase === "transcribing") {
    const label = state.phase === "preparing" ? "Opening the microphone" : "Writing it down";
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              className={iconButtonClassName}
              onPointerDown={keepFocus}
              onClick={dictation.cancel}
              aria-label={`${label}. Press to cancel.`}
            />
          }
        >
          <Spinner size="sm" aria-hidden="true" />
        </TooltipTrigger>
        <TooltipPopup>{label}</TooltipPopup>
      </Tooltip>
    );
  }

  if (model.status === "ready") {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              className={iconButtonClassName}
              disabled={!enabled}
              onPointerDown={keepFocus}
              onClick={dictation.start}
              aria-label="Dictate"
            />
          }
        >
          <MicIcon className="t3g" />
        </TooltipTrigger>
        <TooltipPopup>Dictate, or hold Space</TooltipPopup>
      </Tooltip>
    );
  }

  return (
    <Popover>
      <PopoverTrigger
        render={<button type="button" className={iconButtonClassName} aria-label="Dictate" />}
      >
        {model.status === "downloading" ? (
          <Spinner size="sm" aria-hidden="true" />
        ) : (
          <MicIcon className="t3g" />
        )}
      </PopoverTrigger>
      <PopoverPopup side="top" align="end" width="md" {...composerFloatingLayerProps}>
        <div className="flex flex-col gap-2">
          <p className="font-medium text-sm">Dictate your messages</p>
          <p className="text-muted-foreground text-sm">
            Whisper turns your voice into text on your Mac, and nothing you say leaves it. Press the
            microphone or hold Space, then check the words before you send them.
          </p>
          <DictationModel environmentId={environmentId} model={model} />
        </div>
      </PopoverPopup>
    </Popover>
  );
}

/** How loud it is now, so it's plain the microphone hears something. Drawn without React. */
function LevelMeter({ microphone }: { readonly microphone: Microphone }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(
    () =>
      microphone.watchLevel((level) => ref.current?.style.setProperty("--level", level.toFixed(2))),
    [microphone],
  );
  return (
    <span ref={ref} aria-hidden="true" className="flex h-4 items-center gap-0.5 [--level:0]">
      {[0.6, 1, 0.75, 0.45].map((share) => (
        <span
          key={share}
          className="w-0.5 rounded-full bg-(--tv-run)"
          style={{ height: `calc(3px + ${share * 13}px * var(--level))` }}
        />
      ))}
    </span>
  );
}

/** Time spoken, against the limit once it's near. */
function Elapsed() {
  const [startedAt] = useState(Date.now);
  const [now, setNow] = useState(startedAt);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.floor((now - startedAt) / 1000);
  const left = VOICE_RECORDING_LIMIT_SECONDS - seconds;
  const clock = (value: number) =>
    `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
  return <span>{left <= 30 ? `${clock(Math.max(0, left))} left` : clock(seconds)}</span>;
}
