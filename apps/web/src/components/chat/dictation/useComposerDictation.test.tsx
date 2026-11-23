// @vitest-environment jsdom

import { EnvironmentId } from "@control/contracts";
import { act, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { HOLD_SPACE_MS } from "./holdSpace";
import { IDLE_DICTATION, useComposerDictation } from "./useComposerDictation";

const mocks = vi.hoisted(() => ({
  modelStatus: "ready",
  transcribe: vi.fn(),
  toast: vi.fn(),
  openMicrophone: vi.fn(),
  releaseMicrophone: vi.fn(),
}));
vi.mock("../../../state/voice", () => ({
  voiceEnvironment: { transcribe: {} },
  useVoiceModel: () => ({
    environmentId: EnvironmentId.make("mac"),
    model: { status: mocks.modelStatus, sizeBytes: 1 },
  }),
}));
vi.mock("../../../state/use-atom-command", () => ({ useAtomCommand: () => mocks.transcribe }));
vi.mock("../../ui/toast", () => ({ toastManager: { add: mocks.toast } }));
vi.mock("./dictationAudio", () => ({ recordingToBase64: (uri: string) => Promise.resolve(uri) }));
vi.mock("./Microphone", () => ({
  hasMicrophone: () => true,
  Microphone: class {
    uri = "blob:recording";
    open = mocks.openMicrophone;
    release = mocks.releaseMicrophone;
    prepareToRecordAsync = () => Promise.resolve();
    record = () => {};
    stop = () => Promise.resolve();
  },
}));

const heard = (text: string) => ({ _tag: "Success", value: { text } });
let root: Root;
let dictation: ReturnType<typeof useComposerDictation>;
let setOwner: (owner: string) => void;
let prompt = "";

/** The composer's parts dictation touches, around a textarea that stands in for the editor. */
function Composer() {
  const [state, onStateChange] = useState(IDLE_DICTATION);
  const [ownerKey, setOwnerKey] = useState("chat");
  setOwner = setOwnerKey;
  const promptRef = useRef(prompt);
  const formRef = useRef<HTMLFormElement>(null);
  const editorRef = useRef({
    readSelectionRange: () => ({ start: editor().selectionStart, end: editor().selectionEnd }),
  });
  dictation = useComposerDictation({
    ownerKey,
    state,
    onStateChange,
    enabled: true,
    promptRef,
    editorRef: editorRef as never,
    formRef,
    replacePrompt: (start, end, replacement, { expectedText, expandedCursorAfterReplace }) => {
      if (promptRef.current.slice(start, end) !== expectedText) return false;
      write(promptRef.current.slice(0, start) + replacement + promptRef.current.slice(end));
      editor().setSelectionRange(expandedCursorAfterReplace, expandedCursorAfterReplace);
      return true;
    },
    readHints: () => ["main"],
  });
  const write = (text: string) => {
    prompt = text;
    promptRef.current = text;
    editor().value = text;
  };
  return (
    <form ref={formRef}>
      <textarea
        data-testid="composer-editor"
        onInput={(event) => write(event.currentTarget.value)}
      />
      <input />
    </form>
  );
}
const editor = () => document.querySelector("textarea")!;
const outside = () => document.querySelector("input")!;

const draft = async (text: string, start = text.length, end = start) => {
  await act(async () => {
    editor().value = text;
    editor().dispatchEvent(new Event("input", { bubbles: true }));
  });
  editor().setSelectionRange(start, end);
};
const key = (type: "keydown" | "keyup", code: string, element: Element = editor()) =>
  element.dispatchEvent(
    new KeyboardEvent(type, { code, key: code, bubbles: true, cancelable: true }),
  );
/** Presses Space as a keyboard does: it types one unless the press is taken. */
const pressSpace = async () => {
  if (!key("keydown", "Space")) return;
  const { selectionStart, selectionEnd, value } = editor();
  await draft(`${value.slice(0, selectionStart)} ${value.slice(selectionEnd)}`, selectionStart + 1);
};
const wait = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const holdSpace = async () => {
  await pressSpace();
  await wait(HOLD_SPACE_MS);
};
const releaseSpace = () => act(async () => void key("keyup", "Space"));

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.clearAllMocks();
  URL.revokeObjectURL = vi.fn();
  mocks.modelStatus = "ready";
  mocks.openMicrophone.mockResolvedValue(true);
  mocks.transcribe.mockResolvedValue(heard("fix the lock"));
  const container = document.body.appendChild(document.createElement("div"));
  await act(async () => {
    root = createRoot(container);
    root.render(<Composer />);
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
  prompt = "";
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("writes what was said where Space was held, and takes the typed space back", async () => {
  await draft("Please now", 7);
  await holdSpace();
  expect(prompt).toBe("Please now");
  expect(dictation.state.phase).toBe("recording");
  await releaseSpace();
  expect(mocks.transcribe).toHaveBeenCalledExactlyOnceWith({
    environmentId: "mac",
    input: { audio: "blob:recording", hints: ["main"] },
  });
  expect(prompt).toBe("Please fix the lock now");
  expect(editor().selectionStart).toBe("Please fix the lock ".length);
  expect(dictation.state.phase).toBe("idle");
  expect(mocks.toast).not.toHaveBeenCalled();
});

it("replaces the selection, from a hold and from the button", async () => {
  await draft("Do OLD soon", 3, 6);
  await holdSpace();
  expect(prompt).toBe("Do OLD soon");
  await releaseSpace();
  expect(prompt).toBe("Do fix the lock soon");

  await draft("Do OLD soon", 3, 6);
  await act(async () => dictation.start());
  await act(async () => dictation.stop());
  expect(prompt).toBe("Do fix the lock soon");
});

it("lets nothing edit the prompt while it listens, and leaves the rest of the page alone", async () => {
  await draft("Do it");
  await act(async () => dictation.start());
  const edit = (type: string, element: Element) =>
    element.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
  for (const type of ["beforeinput", "paste", "cut", "drop"]) {
    expect([type, edit(type, editor()), edit(type, outside())]).toEqual([type, false, true]);
  }
  expect(key("keydown", "Enter")).toBe(false);
  expect(key("keydown", "KeyA", outside())).toBe(true);
  await act(async () => dictation.stop());
  expect(edit("beforeinput", editor())).toBe(true);
});

it("drops the words on Escape, wherever the focus is", async () => {
  await draft("Do it");
  await act(async () => dictation.start());
  await act(async () => void key("keydown", "Escape", outside()));
  expect(dictation.state.phase).toBe("idle");
  expect(mocks.releaseMicrophone).toHaveBeenCalled();
  expect(prompt).toBe("Do it");
  expect(mocks.transcribe).not.toHaveBeenCalled();
});

it("drops words still being written down when the chat changes", async () => {
  let finish!: (result: unknown) => void;
  mocks.transcribe.mockReturnValue(new Promise((resolve) => (finish = resolve)));
  await draft("Do it");
  await act(async () => dictation.start());
  await act(async () => dictation.stop());
  expect(dictation.state.phase).toBe("transcribing");
  await act(async () => setOwner("another chat"));
  expect(dictation.state.phase).toBe("idle");
  await act(async () => finish(heard("too late")));
  expect(prompt).toBe("Do it");
});

it("closes a microphone that opens after Space was let go", async () => {
  let open!: (granted: boolean) => void;
  mocks.openMicrophone.mockReturnValue(new Promise((resolve) => (open = resolve)));
  await draft("Do it");
  await holdSpace();
  expect(dictation.state.phase).toBe("preparing");
  await releaseSpace();
  expect(dictation.state.phase).toBe("idle");
  expect(mocks.releaseMicrophone).toHaveBeenCalled();
  await act(async () => open(true));
  expect(dictation.state.phase).toBe("idle");
  expect(prompt).toBe("Do it");
});

it("closes the microphone when the chat goes away", async () => {
  await act(async () => dictation.start());
  mocks.releaseMicrophone.mockClear();
  await act(async () => root.unmount());
  expect(mocks.releaseMicrophone).toHaveBeenCalled();
});

it("says so when the microphone is refused, and keeps the prompt", async () => {
  mocks.openMicrophone.mockResolvedValue(false);
  await draft("Do it");
  await holdSpace();
  await releaseSpace();
  expect(prompt).toBe("Do it");
  expect(mocks.toast).toHaveBeenCalledExactlyOnceWith({
    type: "error",
    title: "Microphone access is required for voice input.",
    description: "Allow the microphone for this page in your browser.",
  });
});

it("says so when the recording can't be written down", async () => {
  mocks.transcribe.mockRejectedValue(new Error("gone"));
  await act(async () => dictation.start());
  await act(async () => dictation.stop());
  expect(mocks.toast).toHaveBeenCalledExactlyOnceWith({
    type: "error",
    title: "Could not transcribe this recording.",
  });
});

it("leaves Space alone until the model is there", async () => {
  mocks.modelStatus = "missing";
  await act(async () => root.render(<Composer />));
  await draft("Do it");
  await holdSpace();
  await releaseSpace();
  expect(prompt).toBe("Do it ");
  expect(mocks.openMicrophone).not.toHaveBeenCalled();
});
