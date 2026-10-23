/** `env` as the editor shows it: one KEY=value per line, in file order. */
export function formatEnvText(env: Readonly<Record<string, string>>): string {
  return Object.entries(env)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

/** Lines without a key before `=` are dropped; the value keeps any further `=`. */
export function parseEnvText(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const separator = line.indexOf("=");
    const key = separator < 0 ? "" : line.slice(0, separator).trim();
    if (key.length > 0) env[key] = line.slice(separator + 1).trim();
  }
  return env;
}

/** Hooks are shown, not edited: how many sit under each event. */
export function hookSummary(hookEvents: Readonly<Record<string, number>>): string {
  const events = Object.entries(hookEvents).filter(([, count]) => count > 0);
  if (events.length === 0) return "No hooks.";
  const total = events.reduce((sum, [, count]) => sum + count, 0);
  return `${total} across ${events.map(([event, count]) => `${event} (${count})`).join(", ")}. Edit them in settings.json.`;
}
