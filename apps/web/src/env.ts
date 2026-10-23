/**
 * True when running inside the Electron preload bridge, false in a regular browser.
 * The preload script sets window.desktopBridge via contextBridge before any web-app
 * code executes, so this is reliable at module load time.
 */
export const isElectron = typeof window !== "undefined" && window.desktopBridge !== undefined;

/**
 * True in the desktop app's menu-bar panel (design/hybrid/HANDOFF.md §19.6), a second window on
 * the `/menubar` route. Electron routes on the hash, and the panel never leaves its route.
 */
export const isMenubarPanel = isElectron && window.location.hash.startsWith("#/menubar");
