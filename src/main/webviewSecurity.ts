import { session, type BrowserWindow, type WebContents } from "electron";

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

  window.webContents.on("did-attach-webview", (_event, contents) => hardenGuest(contents));
}

export function isAllowedBrowserUrl(rawUrl: string): boolean {
  if (rawUrl === "about:blank") return true;
  try {
    return ["http:", "https:"].includes(new URL(rawUrl).protocol);
  } catch {
    return false;
  }
}

function hardenGuest(contents: WebContents): void {
  contents.on("will-navigate", (event, url) => {
    if (!isAllowedBrowserUrl(url)) event.preventDefault();
  });
  contents.setWindowOpenHandler(({ url }) => {
    if (isAllowedBrowserUrl(url)) void contents.loadURL(url);
    return { action: "deny" };
  });
}
