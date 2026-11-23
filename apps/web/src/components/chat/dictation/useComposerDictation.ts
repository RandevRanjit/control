import {
  VoiceInputController,
  type VoiceInputState,
  voiceInputBlocksSubmission,
  voiceInputFreezesEditor,
} from "@control/client-runtime/voice-input";
import { squashAtomCommandFailure } from "@control/client-runtime/state/runtime";
import { type RefObject, useEffect, useRef, useState } from "react";

import { isElectron } from "../../../env";
import { useAtomCommand } from "../../../state/use-atom-command";
import { useVoiceModel, voiceEnvironment } from "../../../state/voice";
import type { ComposerPromptEditorHandle } from "../../ComposerPromptEditor";
import { toastManager } from "../../ui/toast";
import { recordingToBase64 } from "./dictationAudio";
import { spanOfTypedSpace, watchHeldSpace } from "./holdSpace";
import { hasMicrophone, Microphone } from "./Microphone";

export const IDLE_DICTATION: VoiceInputState = { phase: "idle", error: null, errorAction: null };

interface ComposerDictationInput {
  /** The draft the words go into; leaving it drops a running dictation. */
  readonly ownerKey: string;
  /** Held by the composer, which refuses to send while somebody is talking. */
  readonly state: VoiceInputState;
  readonly onStateChange: (state: VoiceInputState) => void;
  /** Whether the prompt takes text now. */
  readonly enabled: boolean;
  readonly promptRef: RefObject<string>;
  readonly editorRef: RefObject<ComposerPromptEditorHandle | null>;
  readonly formRef: RefObject<HTMLFormElement | null>;
  readonly replacePrompt: (
    start: number,
    end: number,
    replacement: string,
    options: { readonly expectedText: string; readonly expandedCursorAfterReplace: number },
  ) => boolean;
  readonly readHints: () => ReadonlyArray<string>;
}

/**
 * Dictation in the composer, from its button or a held Space. The words replace the selection and
 * are never sent. The prompt can't be edited meanwhile, so they always land where it was.
 */
export function useComposerDictation(input: ComposerDictationInput) {
  const { environmentId, model } = useVoiceModel();
  const transcribe = useAtomCommand(voiceEnvironment.transcribe, "Dictation");
  const isReady = hasMicrophone() && model?.status === "ready";
  const latest = useRef({ ...input, environmentId, transcribe, isReady });
  latest.current = { ...input, environmentId, transcribe, isReady };
  /** Where the words go when Space is held: the editor has yet to catch up with the taken space. */
  const heldSelection = useRef<{ readonly start: number; readonly end: number } | null>(null);

  const [{ controller, microphone }] = useState(() => {
    const microphone = new Microphone((status) => void controller.handleRecorderStatus(status));
    const controller: VoiceInputController = new VoiceInputController({
      recorder: microphone,
      getTranscriber: () =>
        latest.current.isReady
          ? {
              prepare: () =>
                Promise.resolve({
                  locale: "en",
                  transcribe: async (uri) => {
                    const { environmentId, transcribe, readHints } = latest.current;
                    if (environmentId === null) throw new Error("Control isn't connected.");
                    const audio = await recordingToBase64(uri);
                    const result = await transcribe({
                      environmentId,
                      input: { audio, hints: readHints() },
                    });
                    if (result._tag === "Failure") throw squashAtomCommandFailure(result);
                    return result.value.text;
                  },
                }),
            }
          : null,
      requestPermission: async () => ({ granted: await microphone.open(), canAskAgain: false }),
      configureRecording: () => Promise.resolve(),
      releaseRecording: () => Promise.resolve(microphone.release()),
      deleteRecording: (uri) => URL.revokeObjectURL(uri),
      readDraft: () => {
        const { ownerKey, promptRef, editorRef } = latest.current;
        const text = promptRef.current;
        const selection = heldSelection.current ??
          editorRef.current?.readSelectionRange() ?? { start: text.length, end: text.length };
        return { ownerKey, text, selection, revision: 0 };
      },
      commitDraft: (text, selection) => {
        const { promptRef, replacePrompt } = latest.current;
        const current = promptRef.current;
        replacePrompt(0, current.length, text, {
          expectedText: current,
          expandedCursorAfterReplace: selection.end,
        });
      },
      onStateChange: (state) => {
        if (!voiceInputBlocksSubmission(state)) {
          // The controller closes a microphone it records from, but not one still being opened.
          microphone.release();
          heldSelection.current = null;
        }
        if (state.error !== null) {
          toastManager.add({
            type: "error",
            title: state.error,
            ...(state.errorAction === "settings"
              ? {
                  description: isElectron
                    ? "Turn Control on in System Settings › Privacy & Security › Microphone."
                    : "Allow the microphone for this page in your browser.",
                }
              : {}),
          });
        }
        latest.current.onStateChange(state);
      },
    });
    return { controller, microphone };
  });

  // Also when the composer itself goes away.
  const { ownerKey } = input;
  useEffect(() => () => controller.ownerChanged(), [controller, ownerKey]);

  useEffect(() => {
    if (!isReady) return;
    return watchHeldSpace(window, {
      isEditor: (element) => isComposerEditor(latest.current.formRef.current, element),
      canListen: () =>
        latest.current.enabled && !voiceInputBlocksSubmission(controller.currentState),
      readPrompt: () => latest.current.promptRef.current,
      listen: (before) => {
        const { promptRef, editorRef, replacePrompt } = latest.current;
        const caret = editorRef.current?.readSelectionRange().start ?? 0;
        const span = spanOfTypedSpace(before, promptRef.current, caret);
        if (span === null) return false;
        const restored = replacePrompt(span.start, caret, before.slice(span.start, span.end), {
          expectedText: " ",
          expandedCursorAfterReplace: span.end,
        });
        if (!restored) return false;
        heldSelection.current = span;
        void controller.start();
        return true;
      },
      finish: () => {
        if (controller.currentState.phase === "preparing") controller.cancel();
        else void controller.stop();
      },
    });
  }, [controller, isReady]);

  const isFrozen = voiceInputFreezesEditor(input.state);
  useEffect(() => {
    if (!isFrozen) return;
    const block = (event: Event) => {
      if (!isComposerEditor(latest.current.formRef.current, event.target)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return block(event);
      event.preventDefault();
      event.stopPropagation();
      controller.cancel();
    };
    const edits = ["beforeinput", "paste", "cut", "drop"] as const;
    window.addEventListener("keydown", onKeyDown, true);
    for (const edit of edits) window.addEventListener(edit, block, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      for (const edit of edits) window.removeEventListener(edit, block, true);
    };
  }, [controller, isFrozen]);

  return {
    environmentId,
    /** Null where there's nothing to offer: no microphone, or a machine that can't run the model. */
    model: hasMicrophone() && model?.status !== "unsupported" ? model : null,
    state: input.state,
    microphone,
    start: () => void controller.start(),
    stop: () => void controller.stop(),
    cancel: () => controller.cancel(),
  };
}

function isComposerEditor(form: HTMLFormElement | null, element: EventTarget | null): boolean {
  return (
    element instanceof Element &&
    form?.contains(element) === true &&
    element.closest('[data-testid="composer-editor"]') !== null
  );
}
