import { LocalModelState, OrchestratorMcpFailure, PositiveInt } from "@control/contracts";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/ai";
import * as LocalModels from "../../../localModels/LocalModels.ts";
import * as ProjectionStore from "../../../orchestration-v2/ProjectionStore.ts";
import * as ProviderSessionManager from "../../../orchestration-v2/ProviderSessionManager.ts";
import * as ThreadManagementService from "../../../orchestration-v2/ThreadManagementService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";

// Local models (design/hybrid/HANDOFF.md §18): models on the owner's Mac, for private files
// that must not reach Claude. Files go in by path; only the model's answer comes back.
const shared = {
  failure: OrchestratorMcpFailure,
  failureMode: "return" as const,
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagementService.ThreadManagementService,
    LocalModels.LocalModels,
    ProjectionStore.ProjectionStoreV2,
    ProviderSessionManager.ProviderSessionManagerV2,
  ],
};
const ModelParameter = Schema.String.annotate({
  description: "Id or name from local_model_list.",
});

const LocalModelListTool = Tool.make("local_model_list", {
  ...shared,
  description:
    "List the local models on the owner's Mac and their state: asleep, waking or ready. A model is a tool for private files that must not reach Claude, not a chat. `needs` is the memory a wake takes; a wake must leave 15 GB free with no swap in use, and one over 40 GB asks the owner first.",
  success: Schema.Struct({
    models: Schema.Array(
      Schema.Struct({
        id: Schema.String,
        name: Schema.String,
        state: LocalModelState,
        needs: Schema.optional(Schema.String),
        readsImages: Schema.Boolean,
        calls: Schema.Number,
      }),
    ),
    memory: Schema.Struct({
      available: Schema.String,
      keptBack: Schema.String,
      swap: Schema.String,
    }),
  }),
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false);

const LocalModelWakeTool = Tool.make("local_model_wake", {
  ...shared,
  description:
    "Wake a local model ahead of time; local_model_run wakes it itself. Refused, with the numbers, under 15 GB free or while the Mac swaps; over 40 GB, the owner is asked in this thread first.",
  parameters: Schema.Struct({ model: ModelParameter }),
  success: Schema.Struct({ model: Schema.String, state: LocalModelState }),
}).annotate(Tool.Destructive, false);

const LocalModelSleepTool = Tool.make("local_model_sleep", {
  ...shared,
  description:
    "Put a local model to sleep now, freeing its memory. Models also sleep after their idle minutes.",
  parameters: Schema.Struct({ model: ModelParameter }),
  success: Schema.Struct({ model: Schema.String, state: LocalModelState }),
}).annotate(Tool.Destructive, false);

const LocalModelRunTool = Tool.make("local_model_run", {
  ...shared,
  description:
    "Have a local model process files on the owner's Mac. Control reads the files itself: their contents never enter your context, the transcript or any log, and only the model's answer comes back. Use it for private data, such as anonymising personal files. Pass absolute paths; a folder means the files directly inside it; images need a model that `readsImages`. An asleep model is woken first, under local_model_wake's memory checks. Files that do not fit its context fail with the token counts.",
  parameters: Schema.Struct({
    model: ModelParameter,
    instruction: Schema.String.annotate({
      description: "What the model should do with the files.",
    }),
    files: Schema.Array(Schema.String).annotate({
      description: "Absolute paths of files or folders.",
    }),
    maxTokens: Schema.optional(PositiveInt).annotate({
      description: "The longest answer, in tokens.",
    }),
  }),
  success: Schema.Struct({
    model: Schema.String,
    answer: Schema.String,
    files: Schema.Number,
    seconds: Schema.Number,
    tokensOut: Schema.optional(Schema.Number),
  }),
}).annotate(Tool.Destructive, false);

export const LocalModelsToolkit = Toolkit.make(
  LocalModelListTool,
  LocalModelWakeTool,
  LocalModelSleepTool,
  LocalModelRunTool,
);
