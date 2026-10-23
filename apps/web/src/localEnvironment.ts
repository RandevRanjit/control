/**
 * True when the desktop app runs without its local server. The renderer then
 * has no primary environment: it skips primary auth and discovery and only
 * connects to saved remote environments. Always false in browsers and on
 * desktop builds predating the setting.
 */
export function isLocalEnvironmentDisabled(): boolean {
  // No window (static render) has no desktop bridge either.
  return (
    typeof window !== "undefined" && window.desktopBridge?.getLocalEnvironmentEnabled?.() === false
  );
}
