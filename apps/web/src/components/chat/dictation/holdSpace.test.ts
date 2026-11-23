// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { HOLD_SPACE_MS, spanOfTypedSpace, watchHeldSpace } from "./holdSpace";

const target = {
  isEditor: (element: EventTarget | null) => element === editor,
  canListen: vi.fn(() => true),
  readPrompt: vi.fn(() => "draft"),
  listen: vi.fn((_before: string) => true),
  finish: vi.fn(),
};
let editor: HTMLTextAreaElement;
let stopWatching: () => void;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  editor = document.body.appendChild(document.createElement("textarea"));
  stopWatching = watchHeldSpace(window, target);
});

afterEach(() => {
  stopWatching();
  editor.remove();
  vi.useRealTimers();
});

/** Presses a key in the editor; true when the press would type. */
const press = (code: string, init: KeyboardEventInit = {}, element: Element = editor) =>
  element.dispatchEvent(
    new KeyboardEvent("keydown", { code, bubbles: true, cancelable: true, ...init }),
  );
const release = (code: string) =>
  editor.dispatchEvent(new KeyboardEvent("keyup", { code, bubbles: true }));
const hold = () => vi.advanceTimersByTime(HOLD_SPACE_MS);

it("listens once Space is held, and writes it down when it's let go", () => {
  expect(press("Space")).toBe(true);
  expect(target.listen).not.toHaveBeenCalled();
  hold();
  expect(target.listen).toHaveBeenCalledExactlyOnceWith("draft");
  expect(target.finish).not.toHaveBeenCalled();
  release("Space");
  expect(target.finish).toHaveBeenCalledOnce();
});

it("types one space however long it's held", () => {
  expect(press("Space")).toBe(true);
  expect(press("Space", { repeat: true })).toBe(false);
  hold();
  expect(press("Space", { repeat: true })).toBe(false);
});

it("leaves a tap alone", () => {
  press("Space");
  vi.advanceTimersByTime(HOLD_SPACE_MS - 1);
  release("Space");
  hold();
  expect(target.listen).not.toHaveBeenCalled();
  expect(target.finish).not.toHaveBeenCalled();
  expect(press("Space")).toBe(true);
});

it("is a tap when the next letter comes before Space is up, as in fast typing", () => {
  press("Space");
  expect(press("KeyA")).toBe(true);
  hold();
  expect(target.listen).not.toHaveBeenCalled();
});

it("is a tap when a click moves the caret meanwhile", () => {
  press("Space");
  editor.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  hold();
  expect(target.listen).not.toHaveBeenCalled();
});

it("stops when the window loses focus, which loses the key-up too", () => {
  press("Space");
  hold();
  window.dispatchEvent(new Event("blur"));
  expect(target.finish).toHaveBeenCalledOnce();
  release("Space");
  expect(target.finish).toHaveBeenCalledOnce();
});

it("keeps swallowing the repeats of a hold that ended early, until Space is up", () => {
  press("Space");
  hold();
  expect(press("Escape")).toBe(true);
  expect(press("Space", { repeat: true })).toBe(false);
  release("Space");
  expect(press("Space")).toBe(true);
});

it.each([
  ["at the end", "ab", "ab ", 3, { start: 2, end: 2 }],
  ["in the middle", "ab cd", "ab  cd", 3, { start: 2, end: 2 }],
  ["after a space", "ab cd", "ab  cd", 4, { start: 3, end: 3 }],
  ["over a selection", "ab OLD cd", "ab   cd", 4, { start: 3, end: 6 }],
  ["over everything", "ab", " ", 1, { start: 0, end: 2 }],
  ["into an empty prompt", "", " ", 1, { start: 0, end: 0 }],
])("finds a space typed %s", (_where, before, after, caret, span) => {
  expect(spanOfTypedSpace(before, after, caret)).toEqual(span);
});

it.each([
  ["no space was typed", "ab", "ab", 2],
  ["another character was", "ab", "abc", 3],
  ["two were", "ab", "ab  ", 4],
  ["something changed before it", "ab", "xb ", 3],
  ["something changed after it", "ab cd", "ab  cx", 3],
  ["the caret moved off it", "ab cd", "ab  cd", 6],
])("finds nothing when %s", (_why, before, after, caret) => {
  expect(spanOfTypedSpace(before, after, caret)).toBeNull();
});

it("gives up when the prompt moved on", () => {
  target.listen.mockReturnValueOnce(false);
  press("Space");
  hold();
  release("Space");
  expect(target.finish).not.toHaveBeenCalled();
});

it.each([
  ["a shortcut", { metaKey: true }],
  ["a composed character", { isComposing: true }],
  ["a repeat whose press was elsewhere", { repeat: true }],
])("ignores %s", (_name, init) => {
  expect(press("Space", init)).toBe(true);
  hold();
  expect(target.listen).not.toHaveBeenCalled();
});

it("ignores Space outside the editor, and where it can't listen", () => {
  press("Space", {}, document.body);
  hold();
  target.canListen.mockReturnValueOnce(false);
  press("Space");
  hold();
  expect(target.listen).not.toHaveBeenCalled();
});

it("stops listening when it stops watching", () => {
  press("Space");
  hold();
  stopWatching();
  expect(target.finish).toHaveBeenCalledOnce();
  press("Space");
  hold();
  expect(target.listen).toHaveBeenCalledOnce();
});
