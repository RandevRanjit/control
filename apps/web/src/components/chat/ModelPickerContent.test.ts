import { ProviderDriverKind, ProviderInstanceId, type ServerProvider } from "@control/contracts";
import { describe, expect, it } from "vite-plus/test";

import { deriveProviderInstanceEntries } from "../../providerInstances";
import {
  adjacentModelPickerProvider,
  modelPickerSectionModels,
  modelPickerShowsSource,
  shouldOfferModelPickerSetup,
} from "./ModelPickerContent";

const INTEGRATED_SETUP = { canAuthenticate: true, canInstall: true };

function entry(
  status: ServerProvider["status"],
  driver = "opencode",
  setup?: ServerProvider["setup"],
) {
  return deriveProviderInstanceEntries([
    {
      ...(setup ? { setup } : {}),
      instanceId: ProviderInstanceId.make(`${driver}_work`),
      driver: ProviderDriverKind.make(driver),
      enabled: true,
      installed: true,
      version: null,
      status,
      auth: { status: "authenticated" },
      checkedAt: "2026-08-28T00:00:00.000Z",
      models: [],
      slashCommands: [],
      skills: [],
    },
  ])[0]!;
}

describe("shouldOfferModelPickerSetup", () => {
  const availableModel = { slug: "gemini-3.1-pro", name: "Gemini 3.1 Pro" };

  it("offers setup before an account has models", () => {
    expect(shouldOfferModelPickerSetup(entry("error", "claudeAgent", INTEGRATED_SETUP), [])).toBe(
      true,
    );
  });

  it("offers setup after sign-out even if a model remains cached", () => {
    const providerEntry = entry("ready", "claudeAgent", INTEGRATED_SETUP);
    expect(
      shouldOfferModelPickerSetup(
        {
          ...providerEntry,
          snapshot: { ...providerEntry.snapshot, auth: { status: "unauthenticated" } },
        },
        [availableModel],
      ),
    ).toBe(true);
  });

  it("offers setup when the only model is an unavailable saved selection", () => {
    expect(
      shouldOfferModelPickerSetup(entry("ready", "claudeAgent", INTEGRATED_SETUP), [
        { ...availableModel, isUnavailable: true },
      ]),
    ).toBe(true);
  });

  it("does not offer setup for a ready account with available models", () => {
    expect(
      shouldOfferModelPickerSetup(entry("ready", "claudeAgent", INTEGRATED_SETUP), [
        availableModel,
      ]),
    ).toBe(false);
  });

  it("does not restore a disabled provider while its status snapshot is stale", () => {
    expect(
      shouldOfferModelPickerSetup(
        { ...entry("error", "claudeAgent", INTEGRATED_SETUP), enabled: false },
        [],
      ),
    ).toBe(false);
  });

  it("keeps providers without integrated setup on their existing path", () => {
    expect(shouldOfferModelPickerSetup(entry("error", "codex"), [])).toBe(false);
  });

  it("uses the environment's setup capability for other drivers", () => {
    const providerEntry = entry("error", "custom_driver");
    expect(
      shouldOfferModelPickerSetup(
        {
          ...providerEntry,
          snapshot: {
            ...providerEntry.snapshot,
            setup: { canAuthenticate: true, canInstall: false },
          },
        },
        [],
      ),
    ).toBe(true);
  });
});

describe("adjacentModelPickerProvider", () => {
  const codex = entry("ready", "codex");
  const claude = entry("ready", "claudeAgent");
  const unavailable = entry("error");
  const input = {
    entries: [codex, unavailable, claude],
    disabledInstanceIds: undefined,
    selectableUnavailableInstanceIds: undefined,
  };

  it("wraps through favorites and ready instances, skipping unavailable providers", () => {
    expect(
      adjacentModelPickerProvider({ ...input, selectedInstanceId: codex.instanceId, direction: 1 }),
    ).toBe(claude.instanceId);
    expect(
      adjacentModelPickerProvider({ ...input, selectedInstanceId: "favorites", direction: -1 }),
    ).toBe(claude.instanceId);
    expect(
      adjacentModelPickerProvider({
        ...input,
        selectedInstanceId: claude.instanceId,
        direction: 1,
      }),
    ).toBe("favorites");
  });

  it("keeps thread locks and the selected unavailable catalog", () => {
    expect(
      adjacentModelPickerProvider({
        ...input,
        disabledInstanceIds: new Set([claude.instanceId]),
        selectedInstanceId: codex.instanceId,
        direction: 1,
      }),
    ).toBe("favorites");
    expect(
      adjacentModelPickerProvider({
        ...input,
        selectableUnavailableInstanceIds: new Set([unavailable.instanceId]),
        selectedInstanceId: codex.instanceId,
        direction: 1,
      }),
    ).toBe(unavailable.instanceId);
  });

  it("handles an empty catalog and a removed selection in either direction", () => {
    expect(
      adjacentModelPickerProvider({
        ...input,
        entries: [],
        selectedInstanceId: codex.instanceId,
        direction: -1,
      }),
    ).toBe("favorites");
    expect(
      adjacentModelPickerProvider({
        ...input,
        selectedInstanceId: unavailable.instanceId,
        direction: 1,
      }),
    ).toBe("favorites");
    expect(
      adjacentModelPickerProvider({
        ...input,
        selectedInstanceId: unavailable.instanceId,
        direction: -1,
      }),
    ).toBe(claude.instanceId);
  });
});

describe("the Local section", () => {
  const claudeId = ProviderInstanceId.make("claudeAgent");
  const model = (slug: string, isLocal?: boolean) => ({
    slug,
    name: slug,
    instanceId: claudeId,
    driverKind: ProviderDriverKind.make("claudeAgent"),
    instanceDisplayName: "Claude",
    ...(isLocal ? { isLocal: true } : {}),
  });
  const opus = model("opus");
  const qwen = model("qwen-local", true);

  it("holds the local models, and Claude's section holds the rest", () => {
    expect(modelPickerSectionModels([opus, qwen], "local")).toEqual([qwen]);
    expect(modelPickerSectionModels([opus, qwen], claudeId)).toEqual([opus]);
  });

  it("names a row's source only when the list mixes Claude and local models", () => {
    expect(modelPickerShowsSource([opus, model("sonnet")])).toBe(false);
    expect(modelPickerShowsSource([qwen])).toBe(false);
    expect(modelPickerShowsSource([opus, qwen])).toBe(true);
  });

  it("joins the rail's keyboard cycle after the providers when local models exist", () => {
    const claude = entry("ready", "claudeAgent");
    const input = {
      entries: [claude],
      disabledInstanceIds: undefined,
      selectableUnavailableInstanceIds: undefined,
      includeLocal: true,
    };
    expect(
      adjacentModelPickerProvider({
        ...input,
        selectedInstanceId: claude.instanceId,
        direction: 1,
      }),
    ).toBe("local");
    expect(
      adjacentModelPickerProvider({ ...input, selectedInstanceId: "local", direction: 1 }),
    ).toBe("favorites");
  });
});
