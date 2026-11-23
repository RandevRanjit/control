import * as Electron from "electron";

/**
 * Lets Control's own page use the microphone, for dictation, once the owner allowed it in macOS's
 * prompt. Frames inside the page never can, such as an agent's MCP app in a chat: macOS knows only
 * Control, so its permission would be theirs too. Everything else keeps Electron's default.
 */
export const limitMicrophone = (
  session: Pick<Electron.Session, "setPermissionRequestHandler" | "setPermissionCheckHandler">,
  askOwner: () => Promise<boolean>,
): void => {
  session.setPermissionRequestHandler((_contents, permission, callback, details) => {
    if (permission !== "media") callback(true);
    else if (!details.isMainFrame) callback(false);
    else void askOwner().then(callback, () => callback(false));
  });
  session.setPermissionCheckHandler(
    (_contents, permission, _origin, details) => permission !== "media" || details.isMainFrame,
  );
};

/** Asks macOS for the microphone, which prompts only the first time. */
export const askForMicrophone = (platform: NodeJS.Platform): Promise<boolean> =>
  platform === "darwin"
    ? Electron.systemPreferences.askForMediaAccess("microphone")
    : Promise.resolve(true);
