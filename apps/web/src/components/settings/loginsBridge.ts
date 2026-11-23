/** The desktop app's saved logins; null in a plain browser, and on apps predating them. */
export const loginsBridge =
  typeof window === "undefined" ? null : (window.desktopBridge?.logins ?? null);
