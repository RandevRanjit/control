import { describe, expect, it } from "vite-plus/test";
import { ProviderInstanceId, type ProviderOptionDescriptor } from "@control/contracts";
import { buildTraitsTriggerDisplay } from "./TraitsPicker";

function selectDescriptor(
  id: string,
  options: ReadonlyArray<{ id: string; label: string; isDefault?: boolean }>,
  currentValue: string,
): Extract<ProviderOptionDescriptor, { type: "select" }> {
  return { id, label: id, type: "select", options: [...options], currentValue };
}

function fastModeDescriptor(
  currentValue: boolean,
): Extract<ProviderOptionDescriptor, { type: "boolean" }> {
  return { id: "fastMode", label: "Fast Mode", type: "boolean", currentValue };
}

const EFFORT = selectDescriptor(
  "reasoningEffort",
  [
    { id: "high", label: "High" },
    { id: "max", label: "Max" },
  ],
  "high",
);
const CONTEXT_WINDOW = selectDescriptor(
  "contextWindow",
  [
    { id: "200k", label: "200k" },
    { id: "1m", label: "1M" },
  ],
  "1m",
);

function display(descriptors: ReadonlyArray<ProviderOptionDescriptor>) {
  return buildTraitsTriggerDisplay({
    descriptors,
    primarySelectDescriptorId: "reasoningEffort",
    ultrathinkPromptControlled: false,
  });
}

describe("buildTraitsTriggerDisplay", () => {
  it("omits fast mode from the label entirely when it is off", () => {
    expect(display([EFFORT, fastModeDescriptor(false), CONTEXT_WINDOW])).toEqual({
      label: "High · 1M",
    });
  });

  it("pairs fast mode with reasoning before the context window", () => {
    expect(display([EFFORT, fastModeDescriptor(true), CONTEXT_WINDOW])).toEqual({
      label: "High Fast · 1M",
    });
    expect(display([EFFORT, CONTEXT_WINDOW, fastModeDescriptor(true)])).toEqual({
      label: "High Fast · 1M",
    });
  });

  it.each(["reasoningEffort", "reasoning", "effort", "variant", "thinking"])(
    "pairs Fast with %s even when context is the primary select",
    (id) => {
      expect(
        buildTraitsTriggerDisplay({
          descriptors: [
            selectDescriptor("profile", [{ id: "balanced", label: "Balanced" }], "balanced"),
            CONTEXT_WINDOW,
            { ...EFFORT, id },
            fastModeDescriptor(true),
          ],
          primarySelectDescriptorId: "profile",
          ultrathinkPromptControlled: false,
        }),
      ).toEqual({ label: "Balanced · 1M · High Fast" });
    },
  );

  it("pairs Cursor Fast with reasoning rather than the thinking toggle", () => {
    expect(
      buildTraitsTriggerDisplay({
        descriptors: [
          { ...EFFORT, id: "reasoning" },
          fastModeDescriptor(true),
          { id: "thinking", label: "Thinking", type: "boolean", currentValue: true },
        ],
        primarySelectDescriptorId: "reasoning",
        ultrathinkPromptControlled: false,
      }),
    ).toEqual({ label: "High Fast · Thinking On" });
  });

  it.each([true, false])("keeps boolean thinking %s independent of Fast", (currentValue) => {
    const thinking = {
      id: "thinking",
      label: "Thinking",
      type: "boolean" as const,
      currentValue,
    };
    const label = `Thinking ${currentValue ? "On" : "Off"}`;
    expect(display([thinking, fastModeDescriptor(true)])).toEqual({ label: `${label} · Fast` });
    expect(display([thinking, { ...EFFORT, id: "reasoning" }, fastModeDescriptor(true)])).toEqual({
      label: `${label} · High Fast`,
    });
    expect(display([thinking, fastModeDescriptor(false)])).toEqual({ label });
  });

  it("keeps speed separate when there is no reasoning descriptor", () => {
    expect(display([CONTEXT_WINDOW, fastModeDescriptor(true)])).toEqual({ label: "1M · Fast" });
  });

  it.each(["Low", "Medium", "High", "Extra High", "Max", "Ultra"])(
    "preserves %s reasoning with Fast",
    (label) => {
      expect(
        buildTraitsTriggerDisplay({
          descriptors: [
            { ...EFFORT, options: [{ id: "effort", label }], currentValue: "effort" },
            fastModeDescriptor(true),
          ],
          primarySelectDescriptorId: EFFORT.id,
          ultrathinkPromptControlled: false,
        }),
      ).toEqual({ label: `${label} Fast` });
    },
  );

  it("keeps non-fastMode booleans as text labels", () => {
    const thinking: Extract<ProviderOptionDescriptor, { type: "boolean" }> = {
      id: "thinking",
      label: "Thinking",
      type: "boolean",
      currentValue: true,
    };
    expect(display([EFFORT, thinking])).toEqual({ label: "High · Thinking On" });
  });

  it("falls back to a text label when fast mode is the only trait", () => {
    expect(display([fastModeDescriptor(true)])).toEqual({ label: "Fast" });
    expect(display([fastModeDescriptor(false)])).toEqual({ label: "Normal" });
  });

  it("does not add Fast to a model without a speed option", () => {
    expect(display([EFFORT, CONTEXT_WINDOW])).toEqual({ label: "High · 1M" });
  });

  it("stays blank when descriptors resolve to no label and there is no fast mode", () => {
    // A select with neither a currentValue nor an isDefault option yields no
    // label. Without a fastMode descriptor present that must stay blank rather
    // than falling through to a bogus "Normal".
    const unresolved: Extract<ProviderOptionDescriptor, { type: "select" }> = {
      id: "effort",
      label: "effort",
      type: "select",
      options: [
        { id: "low", label: "Low" },
        { id: "high", label: "High" },
      ],
    };
    expect(display([unresolved])).toEqual({ label: "" });
  });

  it("still renders prompt-controlled ultrathink with Fast", () => {
    expect(
      buildTraitsTriggerDisplay({
        descriptors: [EFFORT, fastModeDescriptor(true)],
        primarySelectDescriptorId: "reasoningEffort",
        ultrathinkPromptControlled: true,
      }),
    ).toEqual({ label: "Ultrathink Fast" });
  });
});

it("shows Unknown until a matching provider report provides Default", () => {
  const selection = {
    instanceId: ProviderInstanceId.make("opencode"),
    model: "ling",
    options: [],
  };
  const input = {
    descriptors: [
      selectDescriptor(
        "variant",
        [
          { id: "none", label: "None" },
          { id: "thinking", label: "Thinking" },
        ],
        "",
      ),
    ],
    primarySelectDescriptorId: "variant",
    ultrathinkPromptControlled: false,
    modelSelection: selection,
  };
  expect(buildTraitsTriggerDisplay(input).label).toBe("Unknown");
  expect(
    buildTraitsTriggerDisplay({
      ...input,
      reportedModelSelection: { ...selection, options: [{ id: "variant", value: "default" }] },
    }).label,
  ).toBe("Default");
});
