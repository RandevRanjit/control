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
  description: "The model's id or name, as local_model_list gives it.",
});

const LocalModelListTool = Tool.make("local_model_list", {
  ...shared,
  description:
    "List the local models on the owner's Mac and what each is doing: asleep, waking or ready. A model is a tool for private files that must not reach Claude, not a chat. needs is the memory a wake takes; a wake must leave 15 GB free with no swap in use, and one over 40 GB asks the owner first.",
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
    "Wake a local model and return once it's ready. local_model_run wakes an asleep model itself, so call this only to have it ready ahead of time. A wake that would leave under 15 GB free, or while the Mac uses swap, is refused with the numbers; over 40 GB, the owner is asked in this chat first.",
  parameters: Schema.Struct({ model: ModelParameter }),
  success: Schema.Struct({ model: Schema.String, state: LocalModelState }),
}).annotate(Tool.Destructive, false);

const LocalModelSleepTool = Tool.make("local_model_sleep", {
  ...shared,
  description:
    "Put a local model to sleep now, freeing its memory. Models also sleep by themselves after their idle minutes.",
  parameters: Schema.Struct({ model: ModelParameter }),
  success: Schema.Struct({ model: Schema.String, state: LocalModelState }),
}).annotate(Tool.Destructive, false);

const LocalModelRunTool = Tool.make("local_model_run", {
  ...shared,
  description:
    "Have a local model process files on the owner's Mac. CONTROL reads the files itself and sends them to the model with your instruction: their contents never enter your context, the transcript or any log, and only the model's answer comes back. Use it for private data, such as anonymising or summarising personal files before you work with them. Give files by absolute path; a folder means the files directly inside it, and images need a model that readsImages. An asleep model is woken first, under the same memory checks as local_model_wake. If the files don't fit the model's context, the call fails with the token counts.",
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
