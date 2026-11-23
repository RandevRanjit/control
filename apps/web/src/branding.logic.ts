export function formatAppDisplayName(input: {
  readonly baseName: string;
  readonly stageLabel: string;
}): string {
  // Control's production build is plain "Control"; other stages keep their label.
  const stage = input.stageLabel.trim().toLowerCase();
  if (stage === "latest" || stage === "alpha") {
    return input.baseName;
  }

  return `${input.baseName} (${input.stageLabel})`;
}
