import { expect, it } from "vite-plus/test";

import { dictationHints } from "./dictationHints";

const hints = (text: string, names: ReadonlyArray<string | null> = []) =>
  dictationHints({ names, messages: [{ text }] });

it("puts the branch first, and skips one that isn't set", () => {
  expect(hints("Fix ClaudeAdapterV2", ["main", null])).toEqual(["main", "ClaudeAdapterV2"]);
});

it("takes the words speech can't spell and leaves ordinary ones", () => {
  expect(
    hints("The server drops MCP calls when useAtomCommand runs in h264 mode on node_modules."),
  ).toEqual(["MCP", "useAtomCommand", "h264", "node_modules"]);
});

it("takes a product's name mid-sentence, but not a sentence's first word", () => {
  expect(hints("Please open Brightspace. Then sign in to Osiris, Quest and the rest.")).toEqual([
    "Brightspace",
    "Osiris",
    "Quest",
  ]);
});

it("leaves out what's too long to be a name", () => {
  expect(hints(`use ${"longName".repeat(6)} or shortName`)).toEqual(["shortName"]);
});

it("says a path's last part", () => {
  expect(hints("see apps/web/src/ChatView.tsx, and pnpm-lock.yaml.")).toEqual([
    "ChatView.tsx",
    "pnpm-lock.yaml",
  ]);
});

it("reads the newest messages first and names each thing once", () => {
  expect(
    dictationHints({
      names: [],
      messages: [{ text: "old oldName sharedName" }, { text: "new sharedname newName sharedName" }],
    }),
  ).toEqual(["newName", "sharedName", "oldName"]);
});

it("stops at the newest dozen messages and sixty names", () => {
  const many = Array.from({ length: 30 }, (_, index) => ({
    text: Array.from({ length: 10 }, (__, word) => `message${index}word${word}Name`).join(" "),
  }));
  const found = dictationHints({ names: [], messages: many });
  expect(found).toHaveLength(60);
  expect(found[0]).toBe("message29word0Name");
  const few = Array.from({ length: 20 }, (_, index) => ({ text: `only message${index}Name` }));
  expect(dictationHints({ names: [], messages: few }).at(-1)).toBe("message8Name");
});
