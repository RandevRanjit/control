const PULL_REQUEST_LINKING_INSTRUCTIONS = `<pull_request_linking>
Link each PR you create or work on: one link_pull_request per PR, full URL, every stack layer, as soon as you create it or start on it. Host CLIs and APIs do not link for you. Linking twice is safe. Skip PRs named only as background. If linking fails, say so. Asked to monitor, watch or babysit a PR, call watch_pull_request and end your turn: Control wakes you, so do not poll or run your own watcher. Before you hand the work back, call unwatch_pull_request.
</pull_request_linking>`;

/**
 * Shared runtime context; omit model and effort when the harness manages them dynamically.
 * `modelName` is the display name users see in the model picker; `model` is the slug.
 */
export function buildRuntimeInstructions(runtime: {
  readonly harness: string;
  readonly model?: string | undefined;
  readonly modelName?: string | undefined;
  readonly reasoningEffort?: string | undefined;
}): string {
  const harness = toSingleLine(runtime.harness);
  const model = toSingleLine(runtime.model ?? "");
  const modelName = toSingleLine(runtime.modelName ?? "");
  const effort = toSingleLine(runtime.reasoningEffort ?? "");
  const modelLabel =
    modelName && modelName !== model ? `${modelName} (model slug: ${model})` : model;
  const modelInfo = model && model !== "auto" && model !== "default" ? `, as ${modelLabel}` : "";
  const effortInfo = effort ? ` with ${effort} reasoning effort` : "";
  return `<runtime_info>In case you're asked: you are running in Control through the ${harness} harness${modelInfo}${effortInfo}. No need to mention this otherwise. Embed images and videos with Markdown and absolute file paths. File paths you write become links the user opens, so write each file's absolute path, or its full path from your working folder, never a path from a subfolder you named earlier.</runtime_info>\n\n${PULL_REQUEST_LINKING_INSTRUCTIONS}`;
}

function toSingleLine(value: string): string {
  return value.replaceAll(/\s+/g, " ").trim();
}
