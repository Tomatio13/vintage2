import { browserShortcut } from "../shared/browserShortcuts.js";
import { Menu, session, type BrowserWindow, type WebContents } from "electron";

import { canNavigateBrowserGuest, isAllowedBrowserUrl } from "../shared/browserUrl.js";

import { DesktopChannels } from "../shared/desktop.js";

import { browserContextMenuItems } from "./browserContextMenu.js";

export const BROWSER_PARTITION = "persist:starter-browser";

export function configureBrowserSession(): void {
  const browserSession = session.fromPartition(BROWSER_PARTITION);
  browserSession.setPermissionCheckHandler(() => false);
  browserSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
}

export function configureWebviewSecurity(window: BrowserWindow): void {
  window.on("app-command", (_event, command) => {
    if (
      !window.webContents.isDestroyed() &&
      (command === "browser-backward" || command === "browser-forward")
    )
      window.webContents.send(
        DesktopChannels.browserCommandRequested,
        -1,
        command === "browser-backward" ? "back" : "forward",
      );
  });
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
    const openTab = (url: string, background = false) => {
      if (!window.webContents.isDestroyed())
        window.webContents.send(
          DesktopChannels.browserOpenTabRequested,
          contents.id,
          url,
          background,
        );
    };
    hardenGuest(contents, openTab);
    contents.on("zoom-changed", (_event, direction) => {
      if (!window.webContents.isDestroyed())
        window.webContents.send(DesktopChannels.browserZoomRequested, contents.id, direction);
    });
    contents.on("context-menu", (event, params) => {
      event.preventDefault();
      if (contents.isDestroyed() || window.isDestroyed()) return;
      Menu.buildFromTemplate(browserContextMenuItems(contents, params, openTab)).popup({ window });
    });
    contents.on("before-input-event", (event, input) => {
      const command = input.type === "keyDown" ? browserShortcut(input) : null;
      if (command) {
        event.preventDefault();
        if (!window.webContents.isDestroyed())
          window.webContents.send(DesktopChannels.browserCommandRequested, contents.id, command);
        return;
      }
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

function hardenGuest(
  contents: WebContents,
  openTab: (url: string, background?: boolean) => void,
): void {
  contents.on("will-navigate", (event, url) => {
    if (!canNavigateBrowserGuest(contents.getURL(), url)) event.preventDefault();
  });
  contents.on("will-redirect", (event, url) => {
    if (!isAllowedBrowserUrl(url) || new URL(url).protocol === "file:") event.preventDefault();
  });
  contents.setWindowOpenHandler(({ url, disposition }) => {
    if (canNavigateBrowserGuest(contents.getURL(), url))
      openTab(url, disposition === "background-tab");
    return { action: "deny" };
  });
}
