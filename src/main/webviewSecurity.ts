import { session, type BrowserWindow, type WebContents } from "electron";

import { canNavigateBrowserGuest, isAllowedBrowserUrl } from "../shared/browserUrl.js";

import { DesktopChannels } from "../shared/desktop.js";

export const BROWSER_PARTITION = "persist:starter-browser";

export function configureBrowserSession(): void {
  const browserSession = session.fromPartition(BROWSER_PARTITION);
  browserSession.setPermissionCheckHandler(() => false);
  browserSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
}

export function configureWebviewSecurity(window: BrowserWindow): void {
  window.webContents.on("will-attach-webview", (event, webPreferences, params) => {
    if (typeof params.src !== "string" || !isAllowedBrowserUrl(params.src)) {
      event.preventDefault();
      return;
    }
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.webSecurity = true;
    webPreferences.allowRunningInsecureContent = false;
    webPreferences.partition = BROWSER_PARTITION;
  });

  window.webContents.on("did-attach-webview", (_event, contents) => {
    hardenGuest(contents, (url) => {
      if (!window.webContents.isDestroyed())
        window.webContents.send(DesktopChannels.browserOpenTabRequested, contents.id, url);
    });
    contents.on("before-input-event", (event, input) => {
      if (
        input.type === "keyDown" &&
        (input.control || input.meta) &&
        !input.alt &&
        !input.shift &&
        input.key.toLowerCase() === "f"
      ) {
        event.preventDefault();
        if (!window.webContents.isDestroyed())
          window.webContents.send(DesktopChannels.browserFindRequested, contents.id);
      }
    });
  });
}

function hardenGuest(contents: WebContents, openTab: (url: string) => void): void {
  contents.on("will-navigate", (event, url) => {
    if (!canNavigateBrowserGuest(contents.getURL(), url)) event.preventDefault();
  });
  contents.on("will-redirect", (event, url) => {
    if (!isAllowedBrowserUrl(url) || new URL(url).protocol === "file:") event.preventDefault();
  });
  contents.setWindowOpenHandler(({ url }) => {
    if (canNavigateBrowserGuest(contents.getURL(), url)) openTab(url);
    return { action: "deny" };
  });
}
