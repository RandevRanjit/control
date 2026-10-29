import { Schema } from "effect";

import { EnvironmentId, ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";
import {
  PREVIEW_VIEWPORT_MAX_AREA,
  PreviewRenderedViewportSize,
  PreviewTabId,
  PreviewViewportPresetId,
  PreviewViewportSetting,
  PreviewViewportSize,
} from "./preview.ts";
import { ProviderInstanceId } from "./providerInstance.ts";

const BoundedUrl = Schema.String.check(Schema.isTrimmed())
  .check(Schema.isNonEmpty())
  .check(Schema.isMaxLength(2048));
const URL_GUIDANCE =
  "An http(s) URL, or a host such as example.com (https) or localhost:5173 (http).";
const OptionalTimeoutMs = Schema.optional(
  Schema.Int.check(Schema.isGreaterThan(0))
    .check(Schema.isLessThanOrEqualTo(60_000))
    .annotate({ description: "Max wait in ms. Default 15000, max 60000." }),
).annotate({ description: "Max wait in ms. Default 15000, max 60000." });

/** Operations understood by desktop hosts predating viewport resizing. */
export const PREVIEW_AUTOMATION_V1_OPERATIONS = [
  "status",
  "open",
  "navigate",
  "snapshot",
  "click",
  "type",
  "press",
  "scroll",
  "evaluate",
  "waitFor",
  "recordingStart",
  "recordingStop",
] as const;

/** Advertised by current desktop hosts for mixed-version routing. */
const PREVIEW_AUTOMATION_OPERATIONS = [
  ...PREVIEW_AUTOMATION_V1_OPERATIONS,
  "resize",
  "setColorScheme",
] as const;

export const PREVIEW_AUTOMATION_SERVER_OPERATIONS = [
  ...PREVIEW_AUTOMATION_OPERATIONS,
  "dialog",
  "close",
  "upload",
  "hover",
  "select",
  "drag",
] as const;
export const PreviewAutomationOperation = Schema.Literals(PREVIEW_AUTOMATION_SERVER_OPERATIONS);
export type PreviewAutomationOperation = typeof PreviewAutomationOperation.Type;

const PreviewAutomationTabTargetFields = {
  tabId: Schema.optional(
    PreviewTabId.annotate({
      description: "Tab to target. Omit for your current tab.",
    }),
  ).annotate({
    description: "Tab to target. Omit for your current tab.",
  }),
};

export const PreviewAutomationTabTargetInput = Schema.Struct(PreviewAutomationTabTargetFields);
export type PreviewAutomationTabTargetInput = typeof PreviewAutomationTabTargetInput.Type;

export const PreviewAutomationStatus = Schema.Struct({
  available: Schema.Boolean,
  visible: Schema.Boolean,
  tabId: Schema.NullOr(PreviewTabId),
  url: Schema.NullOr(Schema.String),
  title: Schema.NullOr(Schema.String),
  loading: Schema.Boolean,
  control: Schema.optional(
    Schema.Struct({
      owner: Schema.Literals(["agent", "human", "unclaimed"]),
      ownedByCaller: Schema.Boolean,
      generation: Schema.Number,
    }),
  ),
  dialog: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        type: Schema.String,
        message: Schema.String,
        defaultValue: Schema.String,
      }),
    ),
  ),
  /** Optional for compatibility with desktop hosts predating viewport sizing. */
  viewportSetting: Schema.optional(PreviewViewportSetting),
  /** Measured guest-page viewport in CSS pixels when a webview is ready. */
  viewport: Schema.optional(PreviewRenderedViewportSize),
  /** Server hosts: a file picker the page opened, answered with preview_act's upload. */
  fileChooser: Schema.optional(
    Schema.NullOr(Schema.Struct({ multiple: Schema.Boolean, accept: Schema.String })),
  ),
  /** Server hosts: files this tab downloaded, saved on the environment until the tab closes. */
  downloads: Schema.optional(
    Schema.Array(
      Schema.Struct({
        fileName: Schema.String,
        path: Schema.String,
        sizeBytes: Schema.Number,
        url: Schema.String,
        completedAt: Schema.String,
      }),
    ),
  ),
  /** Server hosts: every tab this agent session owns, including popups its pages opened. */
  tabs: Schema.optional(
    Schema.Array(
      Schema.Struct({
        tabId: PreviewTabId,
        url: Schema.NullOr(Schema.String),
        openerTabId: Schema.optional(PreviewTabId),
      }),
    ),
  ),
});
export type PreviewAutomationStatus = typeof PreviewAutomationStatus.Type;

export const PreviewAutomationDialogInput = Schema.Struct({
  ...PreviewAutomationTabTargetFields,
  accept: Schema.Boolean.annotate({
    description: "True accepts the dialog, false dismisses it.",
  }),
  promptText: Schema.optional(Schema.String).annotate({
    description: "Text for an accepted prompt.",
  }),
});
export type PreviewAutomationDialogInput = typeof PreviewAutomationDialogInput.Type;

export const PreviewAutomationOpenInput = Schema.Struct({
  ...PreviewAutomationTabTargetFields,
  url: Schema.optional(BoundedUrl).annotate({
    description: `First page. ${URL_GUIDANCE} Omit for a blank tab.`,
  }),
  open: Schema.optional(
    Schema.Boolean.annotate({
      description: "Show the tab to the user. Default true; false for background work.",
    }),
  ),
  show: Schema.optional(
    Schema.Boolean.annotate({
      description: "Deprecated: use open.",
    }),
  ),
  reuseExistingTab: Schema.optional(
    Schema.Boolean.annotate({
      description: "Reuse tabId, else your current tab. Default true; false makes a new tab.",
    }),
  ),
})
  .check(
    Schema.makeFilter(
      (input) =>
        !(input.tabId !== undefined && input.reuseExistingTab === false) ||
        "tabId cannot be combined with reuseExistingTab=false.",
    ),
  )
  .annotate({
    description: "Opens a preview tab for this thread.",
  });
export type PreviewAutomationOpenInput = typeof PreviewAutomationOpenInput.Type;

export const BrowserNavigationTarget = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("url").annotate({
      description: "A URL.",
    }),
    url: BoundedUrl.annotate({
      description: `${URL_GUIDANCE}`,
    }),
  }),
  Schema.Struct({
    kind: Schema.Literal("environment-port").annotate({
      description: "A dev-server port in this environment.",
    }),
    port: Schema.Int.check(Schema.isGreaterThan(0))
      .check(Schema.isLessThan(65_536))
      .annotate({ description: "TCP port." }),
    protocol: Schema.optional(
      Schema.Literals(["http", "https"]).annotate({
        description: "Default http.",
      }),
    ),
    path: Schema.optional(
      Schema.String.annotate({
        description: "Path, query and fragment, such as /settings?tab=account.",
      }),
    ),
  }),
]);
export type BrowserNavigationTarget = typeof BrowserNavigationTarget.Type;

export const PreviewAutomationNavigateInput = Schema.Struct({
  ...PreviewAutomationTabTargetFields,
  url: Schema.optional(BoundedUrl).annotate({
    description: `${URL_GUIDANCE}`,
  }),
  target: Schema.optional(
    BrowserNavigationTarget.annotate({
      description: "A dev server here: {kind:'environment-port',port:5173}.",
    }),
  ).annotate({
    description: "A dev server here: {kind:'environment-port',port:5173}.",
  }),
  readiness: Schema.optional(
    Schema.Literals(["load", "domContentLoaded", "none"]).annotate({
      description: "When to return: 'load' (default), 'domContentLoaded', or 'none'.",
    }),
  ).annotate({
    description: "When to return. 'none' only when a later wait checks the page.",
  }),
  timeoutMs: OptionalTimeoutMs,
})
  .check(
    Schema.makeFilter(
      (input) =>
        Number(input.url !== undefined) + Number(input.target !== undefined) === 1 ||
        "Provide exactly one of url or target.",
    ),
  )
  .annotate({
    description: "Exactly one of url and target.",
  });
export type PreviewAutomationNavigateInput = typeof PreviewAutomationNavigateInput.Type;

export const PreviewAutomationResizeInput = Schema.Struct({
  ...PreviewAutomationTabTargetFields,
  mode: Schema.Literals(["fill", "freeform", "preset"]).annotate({
    description: "fill: the panel. freeform: width and height. preset: a named device.",
  }),
  preset: Schema.optional(
    PreviewViewportPresetId.annotate({
      description: "A Chrome DevTools device.",
    }),
  ).annotate({
    description: "For mode preset.",
  }),
  width: Schema.optional(
    PreviewViewportSize.fields.width.annotate({
      description: "CSS pixels, for mode freeform.",
    }),
  ).annotate({
    description: "CSS pixels, for mode freeform.",
  }),
  height: Schema.optional(
    PreviewViewportSize.fields.height.annotate({
      description: "CSS pixels, for mode freeform.",
    }),
  ).annotate({
    description: "CSS pixels, for mode freeform.",
  }),
  orientation: Schema.optional(
    Schema.Literals(["portrait", "landscape"]).annotate({
      description: "For mode preset. Default: the device's own.",
    }),
  ).annotate({
    description: "For mode preset only.",
  }),
  timeoutMs: OptionalTimeoutMs,
})
  .check(
    Schema.makeFilter((input) => {
      const hasPreset = input.preset !== undefined;
      const hasWidth = input.width !== undefined;
      const hasHeight = input.height !== undefined;
      if (hasWidth !== hasHeight) return "Custom dimensions require both width and height.";
      if (input.mode === "fill") {
        return !hasPreset && !hasWidth && input.orientation === undefined
          ? true
          : "Fill mode does not accept a preset, dimensions, or orientation.";
      }
      if (input.mode === "freeform") {
        if (!hasWidth || !hasHeight || hasPreset || input.orientation !== undefined) {
          return "Freeform mode requires width and height and does not accept a preset or orientation.";
        }
      } else if (!hasPreset || hasWidth || hasHeight) {
        return "Preset mode requires a preset and does not accept custom dimensions.";
      }
      if (hasWidth && hasHeight && input.width! * input.height! > PREVIEW_VIEWPORT_MAX_AREA) {
        return `Custom viewport area must not exceed ${PREVIEW_VIEWPORT_MAX_AREA} pixels.`;
      }
      return true;
    }),
  )
  .annotate({
    description: "Sets the tab's size.",
  });
export type PreviewAutomationResizeInput = typeof PreviewAutomationResizeInput.Type;

export const PreviewAutomationResizeResult = Schema.Struct({
  tabId: PreviewTabId,
  setting: PreviewViewportSetting,
  viewport: PreviewRenderedViewportSize,
});
export type PreviewAutomationResizeResult = typeof PreviewAutomationResizeResult.Type;

/** Mirrors DesktopPreviewColorScheme; declared here to keep this module free of ipc.ts imports. */
export const PreviewAutomationColorScheme = Schema.Literals(["system", "light", "dark"]);
export type PreviewAutomationColorScheme = typeof PreviewAutomationColorScheme.Type;

export const PreviewAutomationSetColorSchemeInput = Schema.Struct({
  ...PreviewAutomationTabTargetFields,
  colorScheme: PreviewAutomationColorScheme.annotate({
    description: "light, dark, or system to follow the OS.",
  }),
}).annotate({
  description: "Sets the page's prefers-color-scheme.",
});
export type PreviewAutomationSetColorSchemeInput = typeof PreviewAutomationSetColorSchemeInput.Type;

export const PreviewAutomationSetColorSchemeResult = Schema.Struct({
  tabId: PreviewTabId,
  colorScheme: PreviewAutomationColorScheme,
});
export type PreviewAutomationSetColorSchemeResult =
  typeof PreviewAutomationSetColorSchemeResult.Type;

const Locator = TrimmedNonEmptyString.annotate({
  description:
    "aria-ref=<ref> from the latest snapshot, or a unique Playwright role/text selector. Refs expire on navigation, a new snapshot or handoff.",
});

const LegacySelector = TrimmedNonEmptyString.annotate({
  description: "Legacy CSS selector. Prefer locator.",
});

const PointerTargetFields = {
  ...PreviewAutomationTabTargetFields,
  selector: Schema.optional(LegacySelector).annotate({
    description: "Legacy CSS selector. Prefer locator.",
  }),
  locator: Schema.optional(Locator).annotate({
    description:
      "aria-ref=<ref> from the latest snapshot, or a unique Playwright role/text selector. Refs expire on navigation, a new snapshot or handoff.",
  }),
  x: Schema.optional(
    Schema.Finite.annotate({
      description: "Viewport X in CSS pixels, with y.",
    }),
  ),
  y: Schema.optional(
    Schema.Finite.annotate({
      description: "Viewport Y in CSS pixels, with x.",
    }),
  ),
  timeoutMs: OptionalTimeoutMs,
};

const singlePointerTarget = Schema.makeFilter(
  (input: {
    readonly selector?: string | undefined;
    readonly locator?: string | undefined;
    readonly x?: number | undefined;
    readonly y?: number | undefined;
  }) => {
    const selectorModes =
      Number(input.selector !== undefined) + Number(input.locator !== undefined);
    const hasX = input.x !== undefined;
    const hasY = input.y !== undefined;
    if (hasX !== hasY) return "Coordinates require both x and y.";
    const coordinateModes = hasX && hasY ? 1 : 0;
    return selectorModes + coordinateModes === 1 || "Provide exactly one target.";
  },
);

export const PreviewAutomationClickInput = Schema.Struct({
  ...PointerTargetFields,
  button: Schema.optional(
    Schema.Literals(["left", "right", "middle"]).annotate({
      description: "Default left; right opens a context menu.",
    }),
  ),
  clickCount: Schema.optional(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 3 })).annotate({
      description: "1 to 3. Default 1.",
    }),
  ),
})
  .check(singlePointerTarget)
  .annotate({
    description: "Exactly one of locator, selector, or x and y.",
  });
export type PreviewAutomationClickInput = typeof PreviewAutomationClickInput.Type;

export const PreviewAutomationHoverInput = Schema.Struct(PointerTargetFields)
  .check(singlePointerTarget)
  .annotate({
    description: "Exactly one of locator, selector, or x and y.",
  });
export type PreviewAutomationHoverInput = typeof PreviewAutomationHoverInput.Type;

export const PreviewAutomationSelectInput = Schema.Struct({
  ...PreviewAutomationTabTargetFields,
  selector: Schema.optional(LegacySelector).annotate({
    description: "Legacy CSS selector. Prefer locator.",
  }),
  locator: Schema.optional(Locator).annotate({
    description: "The <select>, such as aria-ref=<ref>.",
  }),
  values: Schema.Array(Schema.String).check(Schema.isMaxLength(100)).annotate({
    description: "Values or labels. Several for a multiple select; [] clears it.",
  }),
  timeoutMs: OptionalTimeoutMs,
})
  .check(
    Schema.makeFilter(
      (input) =>
        Number(input.selector !== undefined) + Number(input.locator !== undefined) === 1 ||
        "Provide exactly one of selector or locator.",
    ),
  )
  .annotate({ description: "Exactly one of locator and selector." });
export type PreviewAutomationSelectInput = typeof PreviewAutomationSelectInput.Type;

export const PreviewAutomationSelectResult = Schema.Struct({
  selected: Schema.Array(Schema.String).annotate({
    description: "The values now selected.",
  }),
});
export type PreviewAutomationSelectResult = typeof PreviewAutomationSelectResult.Type;

/** A required locator field. Its JSON schema keeps only the description on its last check. */
const DescribedLocator = (description: string) =>
  Schema.String.check(Schema.isTrimmed())
    .check(Schema.isNonEmpty({ description }))
    .annotateKey({ description });

export const PreviewAutomationDragInput = Schema.Struct({
  ...PreviewAutomationTabTargetFields,
  source: DescribedLocator("The element to drag, such as aria-ref=<ref>."),
  target: DescribedLocator("The element to drop onto."),
  timeoutMs: OptionalTimeoutMs,
}).annotate({ description: "Drags source onto target." });
export type PreviewAutomationDragInput = typeof PreviewAutomationDragInput.Type;

export const PreviewAutomationUploadInput = Schema.Struct({
  ...PreviewAutomationTabTargetFields,
  paths: Schema.Array(TrimmedNonEmptyString).check(Schema.isMaxLength(20)).annotate({
    description: "Absolute file paths here. [] cancels the file picker.",
  }),
  selector: Schema.optional(LegacySelector).annotate({
    description: "Legacy CSS selector. Prefer locator.",
  }),
  locator: Schema.optional(Locator).annotate({
    description: "An <input type=file> to set directly, instead of the open picker.",
  }),
  timeoutMs: OptionalTimeoutMs,
})
  .check(
    Schema.makeFilter(
      (input) =>
        !(input.selector !== undefined && input.locator !== undefined) ||
        "Provide at most one of selector or locator.",
    ),
  )
  .annotate({
    description: "Answers the open file picker, or sets a file input.",
  });
export type PreviewAutomationUploadInput = typeof PreviewAutomationUploadInput.Type;

export const PreviewAutomationTypeInput = Schema.Struct({
  ...PreviewAutomationTabTargetFields,
  text: Schema.String.annotate({ description: "Literal text." }),
  selector: Schema.optional(LegacySelector).annotate({
    description: "Legacy CSS selector. Prefer locator.",
  }),
  locator: Schema.optional(Locator).annotate({
    description: "The input, such as role=textbox[name='Message'].",
  }),
  clear: Schema.optional(
    Schema.Boolean.annotate({
      description: "Replace the current text. Default false.",
    }),
  ),
  timeoutMs: OptionalTimeoutMs,
})
  .check(
    Schema.makeFilter(
      (input) =>
        !(input.selector !== undefined && input.locator !== undefined) ||
        "Provide at most one of selector or locator.",
    ),
  )
  .annotate({
    description: "No locator or selector: the focused element.",
  });
export type PreviewAutomationTypeInput = typeof PreviewAutomationTypeInput.Type;

export const PreviewAutomationPressInput = Schema.Struct({
  ...PreviewAutomationTabTargetFields,
  key: Schema.String.check(Schema.isTrimmed())
    .check(
      Schema.isNonEmpty({
        description: "Such as Enter, Escape, Tab, ArrowDown, or one character.",
      }),
    )
    .annotateKey({
      description: "Such as Enter, Escape, Tab, ArrowDown, or one character.",
    }),
  modifiers: Schema.optional(
    Schema.Array(Schema.Literals(["Alt", "Control", "Meta", "Shift"])).annotate({
      description: "Held while pressing key.",
    }),
  ),
}).annotate({ description: "Presses one key." });
export type PreviewAutomationPressInput = typeof PreviewAutomationPressInput.Type;

export const PreviewAutomationScrollInput = Schema.Struct({
  ...PreviewAutomationTabTargetFields,
  deltaX: Schema.optional(
    Schema.Finite.annotate({
      description: "CSS pixels; positive scrolls right. Default 0.",
    }),
  ),
  deltaY: Schema.optional(
    Schema.Finite.annotate({
      description: "CSS pixels; positive scrolls down. Default 0.",
    }),
  ),
  selector: Schema.optional(LegacySelector).annotate({
    description: "Legacy CSS selector for a container. Omit for the viewport.",
  }),
  locator: Schema.optional(Locator).annotate({
    description: "A scrollable container. Omit for the viewport.",
  }),
})
  .check(
    Schema.makeFilter((input) => {
      if (input.selector !== undefined && input.locator !== undefined) {
        return "Provide at most one of selector or locator.";
      }
      return (
        input.deltaX !== undefined || input.deltaY !== undefined || "Provide deltaX or deltaY."
      );
    }),
  )
  .annotate({
    description: "deltaX, deltaY, or both.",
  });
export type PreviewAutomationScrollInput = typeof PreviewAutomationScrollInput.Type;

/** Strict input for each `preview_act` action. */
export const PreviewAutomationActInputs = {
  click: PreviewAutomationClickInput,
  type: PreviewAutomationTypeInput,
  hover: PreviewAutomationHoverInput,
  select: PreviewAutomationSelectInput,
  drag: PreviewAutomationDragInput,
  upload: PreviewAutomationUploadInput,
  press: PreviewAutomationPressInput,
  scroll: PreviewAutomationScrollInput,
} as const;

/** One flat shape for every page action. The server decodes it with the action's strict input. */
export const PreviewAutomationActInput = Schema.Struct({
  action: Schema.Literals([
    "click",
    "type",
    "hover",
    "select",
    "drag",
    "upload",
    "press",
    "scroll",
  ]),
  ...PreviewAutomationTabTargetFields,
  locator: Schema.optional(Locator),
  selector: Schema.optional(LegacySelector),
  x: Schema.optional(Schema.Finite),
  y: Schema.optional(Schema.Finite),
  button: Schema.optional(Schema.Literals(["left", "right", "middle"])),
  clickCount: Schema.optional(Schema.Int),
  text: Schema.optional(Schema.String),
  clear: Schema.optional(Schema.Boolean),
  values: Schema.optional(Schema.Array(Schema.String)),
  source: Schema.optional(Locator),
  target: Schema.optional(Locator),
  paths: Schema.optional(Schema.Array(Schema.String)),
  key: Schema.optional(Schema.String),
  modifiers: PreviewAutomationPressInput.fields.modifiers,
  deltaX: Schema.optional(Schema.Finite),
  deltaY: Schema.optional(Schema.Finite),
  timeoutMs: Schema.optional(Schema.Int),
});
export type PreviewAutomationActInput = typeof PreviewAutomationActInput.Type;

export const PreviewAutomationEvaluateInput = Schema.Struct({
  ...PreviewAutomationTabTargetFields,
  expression: Schema.String.check(Schema.isTrimmed())
    .check(
      Schema.isNonEmpty({
        description: "A JavaScript expression for the main frame, such as document.title.",
      }),
    )
    .check(Schema.isMaxLength(64_000))
    .annotateKey({
      description: "A JavaScript expression for the main frame, such as document.title.",
    }),
  awaitPromise: Schema.optional(Schema.Boolean.annotate({ description: "Default true." })),
  returnByValue: Schema.optional(
    Schema.Boolean.annotate({
      description: "Return the value, not a reference. Default true.",
    }),
  ),
}).annotate({
  description: "Runs JavaScript in the page.",
});
export type PreviewAutomationEvaluateInput = typeof PreviewAutomationEvaluateInput.Type;

export const PreviewAutomationWaitForInput = Schema.Struct({
  ...PreviewAutomationTabTargetFields,
  selector: Schema.optional(LegacySelector).annotate({
    description: "Legacy CSS selector. Prefer locator.",
  }),
  locator: Schema.optional(Locator).annotate({
    description: "Must match an element, such as role=button[name='Send'].",
  }),
  text: Schema.optional(
    TrimmedNonEmptyString.annotate({
      description: "Case-sensitive visible text.",
    }),
  ).annotate({
    description: "Case-sensitive visible text.",
  }),
  urlIncludes: Schema.optional(
    TrimmedNonEmptyString.annotate({
      description: "Part of the current URL.",
    }),
  ).annotate({ description: "Part of the current URL." }),
  timeoutMs: OptionalTimeoutMs,
})
  .check(
    Schema.makeFilter((input) => {
      if (input.selector !== undefined && input.locator !== undefined) {
        return "Provide at most one of selector or locator.";
      }
      return (
        input.selector !== undefined ||
        input.locator !== undefined ||
        input.text !== undefined ||
        input.urlIncludes !== undefined ||
        "Provide at least one wait condition."
      );
    }),
  )
  .annotate({
    description: "All given conditions must match.",
  });
export type PreviewAutomationWaitForInput = typeof PreviewAutomationWaitForInput.Type;

export const PreviewAutomationElement = Schema.Struct({
  tag: Schema.String,
  role: Schema.NullOr(Schema.String),
  name: Schema.String,
  selector: Schema.String,
  x: Schema.Number,
  y: Schema.Number,
  width: Schema.Number,
  height: Schema.Number,
});
export type PreviewAutomationElement = typeof PreviewAutomationElement.Type;

export const PreviewAutomationConsoleEntry = Schema.Struct({
  level: Schema.String,
  text: Schema.String,
  timestamp: Schema.String,
  source: Schema.optional(Schema.String),
});
export type PreviewAutomationConsoleEntry = typeof PreviewAutomationConsoleEntry.Type;

export const PreviewAutomationNetworkEntry = Schema.Struct({
  url: Schema.String,
  method: Schema.String,
  status: Schema.NullOr(Schema.Number),
  failed: Schema.Boolean,
  errorText: Schema.optional(Schema.String),
  timestamp: Schema.String,
});
export type PreviewAutomationNetworkEntry = typeof PreviewAutomationNetworkEntry.Type;

export const PreviewAutomationActionEvent = Schema.Struct({
  id: Schema.String,
  action: Schema.String,
  status: Schema.Literals(["running", "succeeded", "failed", "interrupted"]),
  startedAt: Schema.String,
  completedAt: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String),
});
export type PreviewAutomationActionEvent = typeof PreviewAutomationActionEvent.Type;

export const PreviewAutomationSnapshot = Schema.Struct({
  url: Schema.String,
  title: Schema.String,
  loading: Schema.Boolean,
  visibleText: Schema.String,
  interactiveElements: Schema.Array(PreviewAutomationElement),
  accessibilityTree: Schema.Unknown,
  consoleEntries: Schema.Array(PreviewAutomationConsoleEntry),
  networkEntries: Schema.Array(PreviewAutomationNetworkEntry),
  actionTimeline: Schema.Array(PreviewAutomationActionEvent),
  screenshot: Schema.Struct({
    mimeType: Schema.Literal("image/png"),
    data: Schema.String,
    width: Schema.Int,
    height: Schema.Int,
  }),
});
export type PreviewAutomationSnapshot = typeof PreviewAutomationSnapshot.Type;

export const PreviewAutomationRecordingStatus = Schema.Struct({
  tabId: PreviewTabId,
  recording: Schema.Boolean,
  startedAt: Schema.NullOr(Schema.String),
});
export type PreviewAutomationRecordingStatus = typeof PreviewAutomationRecordingStatus.Type;

export const PREVIEW_RECORDING_STOP_TIMEOUT_MS = 120_000;

export const PreviewAutomationRecordingArtifact = Schema.Struct({
  id: Schema.String,
  tabId: PreviewTabId,
  path: Schema.String,
  mimeType: Schema.String,
  sizeBytes: Schema.Int,
  createdAt: Schema.String,
});
export type PreviewAutomationRecordingArtifact = typeof PreviewAutomationRecordingArtifact.Type;

export const PreviewAutomationClientId = TrimmedNonEmptyString.check(Schema.isMaxLength(128));
export type PreviewAutomationClientId = typeof PreviewAutomationClientId.Type;
export const PreviewAutomationConnectionId = TrimmedNonEmptyString.check(Schema.isMaxLength(64));
export type PreviewAutomationConnectionId = typeof PreviewAutomationConnectionId.Type;

export const PreviewAutomationHostIdentity = Schema.Struct({
  clientId: PreviewAutomationClientId,
  environmentId: EnvironmentId,
});
export type PreviewAutomationHostIdentity = typeof PreviewAutomationHostIdentity.Type;

export const PreviewAutomationHost = Schema.Struct({
  ...PreviewAutomationHostIdentity.fields,
  /**
   * Missing means the pre-capability-negotiation V1 operation set. This lets
   * a newer server safely coexist with an older desktop during rollout.
   */
  supportedOperations: Schema.optional(Schema.Array(PreviewAutomationOperation)),
});
export type PreviewAutomationHost = typeof PreviewAutomationHost.Type;

export const PreviewAutomationHostFocus = Schema.Struct({
  ...PreviewAutomationHostIdentity.fields,
  connectionId: PreviewAutomationConnectionId,
  focused: Schema.Boolean,
  liveTabs: Schema.optional(
    Schema.Array(
      Schema.Struct({
        threadId: ThreadId,
        tabId: PreviewTabId,
        visible: Schema.optional(Schema.Boolean),
      }),
    ),
  ),
});
export type PreviewAutomationHostFocus = typeof PreviewAutomationHostFocus.Type;

export const PreviewAutomationRequest = Schema.Struct({
  requestId: TrimmedNonEmptyString,
  threadId: ThreadId,
  tabId: Schema.optional(PreviewTabId),
  tabIdExplicit: Schema.optional(Schema.Boolean),
  /** Supplied by the broker from authenticated scope, never from tool input. */
  agentSessionId: Schema.optional(Schema.String),
  operation: PreviewAutomationOperation,
  input: Schema.Unknown,
  timeoutMs: Schema.Int.check(Schema.isGreaterThan(0)),
});
export type PreviewAutomationRequest = typeof PreviewAutomationRequest.Type;

export const PreviewAutomationStreamEvent = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("connected"),
    connectionId: PreviewAutomationConnectionId,
  }),
  Schema.Struct({
    type: Schema.Literal("request"),
    connectionId: PreviewAutomationConnectionId,
    request: PreviewAutomationRequest,
  }),
]);
export type PreviewAutomationStreamEvent = typeof PreviewAutomationStreamEvent.Type;

export const PreviewAutomationResponse = Schema.Struct({
  clientId: PreviewAutomationClientId,
  connectionId: PreviewAutomationConnectionId,
  requestId: TrimmedNonEmptyString,
  ok: Schema.Boolean,
  result: Schema.optional(Schema.Unknown),
  error: Schema.optional(
    Schema.Struct({
      _tag: TrimmedNonEmptyString,
      message: Schema.String,
      detail: Schema.optional(Schema.Unknown),
    }),
  ),
});
export type PreviewAutomationResponse = typeof PreviewAutomationResponse.Type;

// Thread fields are absent when the caller signed in from outside a Control thread.
const McpCapabilityErrorFields = {
  environmentId: EnvironmentId,
  threadId: Schema.optional(ThreadId),
  providerSessionId: Schema.optional(TrimmedNonEmptyString),
  providerInstanceId: Schema.optional(ProviderInstanceId),
};

/** Agents read this message, so it names the next step and not only the failure. */
export class PreviewAutomationUnavailableError extends Schema.TaggedError<PreviewAutomationUnavailableError>()(
  "PreviewAutomationUnavailableError",
  {
    capability: Schema.Literal("preview"),
    ...McpCapabilityErrorFields,
  },
) {
  override get message(): string {
    return `MCP credential does not grant the ${this.capability} capability: browser preview tools are off for this thread. Do not retry them. To check a page, use a headless browser from the shell, such as Playwright, or curl. The user can turn on "Agent browser access" in Settings; it applies when the agent session next starts.`;
  }
}

/** A `control` MCP tool was called with a credential that does not carry its capability. */
export class McpCapabilityUnavailableError extends Schema.TaggedError<McpCapabilityUnavailableError>()(
  "McpCapabilityUnavailableError",
  {
    capability: TrimmedNonEmptyString,
    ...McpCapabilityErrorFields,
  },
) {
  override get message(): string {
    return `MCP credential does not grant the ${this.capability} capability.`;
  }
}

const PreviewAutomationScopeErrorFields = {
  operation: PreviewAutomationOperation,
  environmentId: EnvironmentId,
  threadId: ThreadId,
  providerSessionId: TrimmedNonEmptyString,
  providerInstanceId: ProviderInstanceId,
};

/** The automation host id of an environment's own server browser. */
export const SERVER_BROWSER_AUTOMATION_CLIENT_ID = "server-browser";

const PreviewAutomationRequestErrorFields = {
  ...PreviewAutomationScopeErrorFields,
  clientId: TrimmedNonEmptyString,
  connectionId: PreviewAutomationConnectionId,
  requestId: TrimmedNonEmptyString,
  tabId: Schema.optional(PreviewTabId),
  timeoutMs: Schema.Int.check(Schema.isGreaterThan(0)),
};

const PreviewAutomationRemoteDiagnosticFields = {
  remoteTag: TrimmedNonEmptyString,
  remoteMessageLength: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  remoteDetailKind: Schema.optional(
    Schema.Literals(["null", "array", "object", "string", "number", "boolean"]),
  ),
  cause: Schema.Defect(),
};

const PreviewAutomationOptionalRemoteDiagnosticFields = {
  remoteTag: Schema.optional(TrimmedNonEmptyString),
  remoteMessageLength: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  remoteDetailKind: Schema.optional(
    Schema.Literals(["null", "array", "object", "string", "number", "boolean"]),
  ),
  cause: Schema.optional(Schema.Defect()),
};

export class PreviewAutomationNoAvailableHostError extends Schema.TaggedError<PreviewAutomationNoAvailableHostError>()(
  "PreviewAutomationNoAvailableHostError",
  {
    ...PreviewAutomationScopeErrorFields,
    clientId: Schema.optional(TrimmedNonEmptyString),
    connectionId: Schema.optional(PreviewAutomationConnectionId),
    requestId: Schema.optional(TrimmedNonEmptyString),
    tabId: Schema.optional(PreviewTabId),
    timeoutMs: Schema.optional(Schema.Int.check(Schema.isGreaterThan(0))),
    ...PreviewAutomationOptionalRemoteDiagnosticFields,
  },
) {
  override get message(): string {
    return `No preview automation host is available for ${this.operation} in environment ${this.environmentId}. Preview tools run in a Control desktop app that is open and connected to this environment; a headless server has no browser of its own. Do not retry. To check a page, use a headless browser from the shell, such as Playwright, or curl, or ask the user to open this thread in the Control desktop app.`;
  }
}

export class PreviewAutomationUnsupportedClientError extends Schema.TaggedError<PreviewAutomationUnsupportedClientError>()(
  "PreviewAutomationUnsupportedClientError",
  {
    ...PreviewAutomationRequestErrorFields,
    ...PreviewAutomationRemoteDiagnosticFields,
  },
) {
  override get message(): string {
    return `Preview automation client ${this.clientId} does not support ${this.operation}.`;
  }
}

export class PreviewAutomationTabNotFoundError extends Schema.TaggedError<PreviewAutomationTabNotFoundError>()(
  "PreviewAutomationTabNotFoundError",
  {
    ...PreviewAutomationRequestErrorFields,
    ...PreviewAutomationRemoteDiagnosticFields,
  },
) {
  override get message(): string {
    return this.tabId
      ? `Preview tab ${this.tabId} was not found for ${this.operation}. Omit tabId to use the current tab, or call preview_open.`
      : `No active preview tab was found for ${this.operation}. Call preview_open first.`;
  }
}

export class PreviewAutomationTimeoutError extends Schema.TaggedError<PreviewAutomationTimeoutError>()(
  "PreviewAutomationTimeoutError",
  {
    ...PreviewAutomationRequestErrorFields,
    ...PreviewAutomationOptionalRemoteDiagnosticFields,
  },
) {
  override get message(): string {
    const summary = `Preview automation ${this.operation} timed out after ${this.timeoutMs}ms.`;
    return summary;
  }
}

export const PreviewAutomationControlReason = Schema.Literals([
  "agentMismatch",
  "humanControl",
  "tabRequired",
  "closed",
  "interrupted",
  "dialogPending",
  "tabLimit",
]);
export type PreviewAutomationControlReason = typeof PreviewAutomationControlReason.Type;

export class PreviewAutomationControlInterruptedError extends Schema.TaggedError<PreviewAutomationControlInterruptedError>()(
  "PreviewAutomationControlInterruptedError",
  {
    ...PreviewAutomationRequestErrorFields,
    ...PreviewAutomationRemoteDiagnosticFields,
    reason: Schema.optional(PreviewAutomationControlReason),
  },
) {
  override get message(): string {
    if (this.reason === "agentMismatch")
      return "This browser tab belongs to another agent session or a human. Open your own tab.";
    if (this.reason === "humanControl")
      return "A human controls this browser tab. Wait until they release control.";
    if (this.reason === "tabRequired")
      return "Multiple browser tabs belong to this session. Pass a tabId from preview_open or from the tabs listed by preview_status.";
    if (this.reason === "dialogPending")
      return "A browser dialog is pending. Read preview_status and resolve it with preview_dialog.";
    if (this.reason === "tabLimit")
      return "Too many server browser tabs are open. Close one with preview_close, or reuse a tabId from preview_status tabs.";
    if (this.reason === "closed") return "This browser tab is closed. Call preview_open.";
    if (this.reason === "interrupted")
      return "Browser control changed. Take a fresh snapshot before trying again.";
    return `Preview automation ${this.operation} was interrupted on client ${this.clientId}.`;
  }
}

export class PreviewAutomationExecutionError extends Schema.TaggedError<PreviewAutomationExecutionError>()(
  "PreviewAutomationExecutionError",
  {
    ...PreviewAutomationRequestErrorFields,
    ...PreviewAutomationRemoteDiagnosticFields,
    /**
     * What went wrong, as the server's own browser reported it, such as a
     * page that refused the connection. Absent for other hosts.
     */
    reason: Schema.optional(Schema.String),
  },
) {
  override get message(): string {
    return this.reason === undefined
      ? `Preview automation ${this.operation} failed on client ${this.clientId}.`
      : `Preview automation ${this.operation} failed: ${this.reason}`;
  }
}

export class PreviewAutomationInvalidSelectorError extends Schema.TaggedError<PreviewAutomationInvalidSelectorError>()(
  "PreviewAutomationInvalidSelectorError",
  {
    ...PreviewAutomationRequestErrorFields,
    ...PreviewAutomationRemoteDiagnosticFields,
    selectorKind: Schema.optional(Schema.Literals(["locator", "selector"])),
    selectorLength: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
    /** The selector was an `aria-ref` from an older snapshot. */
    staleRef: Schema.optional(Schema.Boolean),
  },
) {
  override get message(): string {
    if (this.staleRef)
      return "This element ref is stale. Navigation, dialogs, and new snapshots replace refs; take a fresh snapshot and use its refs.";
    if (this.selectorKind !== undefined && this.selectorLength !== undefined) {
      return `Preview automation ${this.operation} received an invalid ${this.selectorKind} (${this.selectorLength} characters).`;
    }
    return `Preview automation ${this.operation} received an invalid selector.`;
  }
}

/** Playwright's strict locators refuse to act when a locator matches more than one element. */
export class PreviewAutomationAmbiguousLocatorError extends Schema.TaggedError<PreviewAutomationAmbiguousLocatorError>()(
  "PreviewAutomationAmbiguousLocatorError",
  {
    ...PreviewAutomationRequestErrorFields,
    ...PreviewAutomationRemoteDiagnosticFields,
    matchCount: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
    /** The first few matches by role and name, such as `link "config.json"`. */
    matches: Schema.optional(Schema.Array(Schema.String)),
  },
) {
  override get message(): string {
    const count = this.matchCount === undefined ? "several" : String(this.matchCount);
    const named = this.matches?.length ? `: ${this.matches.join(", ")}` : "";
    return `Preview automation ${this.operation} matched ${count} elements${named}. Narrow the locator with a role, \`>> visible=true\` or \`>> nth=0\`.`;
  }
}

export class PreviewAutomationTargetNotEditableError extends Schema.TaggedError<PreviewAutomationTargetNotEditableError>()(
  "PreviewAutomationTargetNotEditableError",
  {
    ...PreviewAutomationRequestErrorFields,
    ...PreviewAutomationRemoteDiagnosticFields,
    selectorKind: Schema.optional(Schema.Literals(["focused-element", "locator", "selector"])),
    selectorLength: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  },
) {
  override get message(): string {
    if (this.selectorKind === "focused-element") {
      return `Preview automation ${this.operation} requires an editable focused element.`;
    }
    if (this.selectorKind !== undefined && this.selectorLength !== undefined) {
      return `Preview automation ${this.operation} requires an editable ${this.selectorKind} (${this.selectorLength} characters).`;
    }
    return `Preview automation ${this.operation} requires an editable target.`;
  }
}

export class PreviewAutomationResultTooLargeError extends Schema.TaggedError<PreviewAutomationResultTooLargeError>()(
  "PreviewAutomationResultTooLargeError",
  {
    ...PreviewAutomationRequestErrorFields,
    ...PreviewAutomationRemoteDiagnosticFields,
    maximumBytes: Schema.optional(Schema.Int.check(Schema.isGreaterThan(0))),
  },
) {
  override get message(): string {
    const summary =
      this.maximumBytes === undefined
        ? `Preview automation ${this.operation} produced a result that is too large.`
        : `Preview automation ${this.operation} produced a result larger than ${this.maximumBytes} bytes.`;
    return summary;
  }
}

export class PreviewAutomationClientDisconnectedError extends Schema.TaggedError<PreviewAutomationClientDisconnectedError>()(
  "PreviewAutomationClientDisconnectedError",
  PreviewAutomationRequestErrorFields,
) {
  override get message(): string {
    return `Preview automation client ${this.clientId} disconnected during ${this.operation}.`;
  }
}

export class PreviewAutomationRequestQueueClosedError extends Schema.TaggedError<PreviewAutomationRequestQueueClosedError>()(
  "PreviewAutomationRequestQueueClosedError",
  PreviewAutomationRequestErrorFields,
) {
  override get message(): string {
    return `Preview automation client ${this.clientId} stopped accepting ${this.operation} requests.`;
  }
}

export class PreviewAutomationRemoteUnavailableError extends Schema.TaggedError<PreviewAutomationRemoteUnavailableError>()(
  "PreviewAutomationRemoteUnavailableError",
  {
    ...PreviewAutomationRequestErrorFields,
    ...PreviewAutomationRemoteDiagnosticFields,
  },
) {
  override get message(): string {
    return `Preview automation ${this.operation} is unavailable on client ${this.clientId}.`;
  }
}

export class PreviewAutomationMalformedResponseError extends Schema.TaggedError<PreviewAutomationMalformedResponseError>()(
  "PreviewAutomationMalformedResponseError",
  PreviewAutomationRequestErrorFields,
) {
  override get message(): string {
    return `Preview automation client ${this.clientId} returned a malformed response for ${this.operation}.`;
  }
}

export class PreviewAutomationRecordingTransferError extends Schema.TaggedError<PreviewAutomationRecordingTransferError>()(
  "PreviewAutomationRecordingTransferError",
  {
    threadId: ThreadId,
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message(): string {
    return "Preview recording could not be saved to the agent environment. The saved copy remains on the desktop.";
  }
}

export class PreviewAutomationRecordingDesktopUpdateRequiredError extends Schema.TaggedError<PreviewAutomationRecordingDesktopUpdateRequiredError>()(
  "PreviewAutomationRecordingDesktopUpdateRequiredError",
  { threadId: ThreadId, cause: Schema.optional(Schema.Defect()) },
) {
  override get message(): string {
    return "Update the desktop app to transfer recordings. The recording remains on the desktop.";
  }
}

export class PreviewAutomationRecordingTooLargeError extends Schema.TaggedError<PreviewAutomationRecordingTooLargeError>()(
  "PreviewAutomationRecordingTooLargeError",
  { threadId: ThreadId, cause: Schema.optional(Schema.Defect()) },
) {
  override get message(): string {
    return "The recording exceeds 50 MiB. The saved copy remains on the desktop.";
  }
}

export class PreviewAutomationRecordingDeadlineExpiredError extends Schema.TaggedError<PreviewAutomationRecordingDeadlineExpiredError>()(
  "PreviewAutomationRecordingDeadlineExpiredError",
  { threadId: ThreadId, cause: Schema.optional(Schema.Defect()) },
) {
  override get message(): string {
    return "The recording transfer deadline expired. The saved copy remains on the desktop.";
  }
}

export const PreviewAutomationError = Schema.Union([
  PreviewAutomationRecordingTransferError,
  PreviewAutomationRecordingDesktopUpdateRequiredError,
  PreviewAutomationRecordingTooLargeError,
  PreviewAutomationRecordingDeadlineExpiredError,
  PreviewAutomationUnavailableError,
  PreviewAutomationNoAvailableHostError,
  PreviewAutomationUnsupportedClientError,
  PreviewAutomationTabNotFoundError,
  PreviewAutomationTimeoutError,
  PreviewAutomationControlInterruptedError,
  PreviewAutomationExecutionError,
  PreviewAutomationInvalidSelectorError,
  PreviewAutomationAmbiguousLocatorError,
  PreviewAutomationTargetNotEditableError,
  PreviewAutomationResultTooLargeError,
  PreviewAutomationClientDisconnectedError,
  PreviewAutomationRequestQueueClosedError,
  PreviewAutomationRemoteUnavailableError,
  PreviewAutomationMalformedResponseError,
]);
export type PreviewAutomationError = typeof PreviewAutomationError.Type;

export const PreviewUrlResolution = Schema.Struct({
  requestedUrl: Schema.String,
  resolvedUrl: Schema.String,
  resolutionKind: Schema.Literals(["direct", "direct-private-network"]),
  environmentId: EnvironmentId,
});
export type PreviewUrlResolution = typeof PreviewUrlResolution.Type;
