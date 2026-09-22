import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { randomUUID } from "node:crypto";
import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import { release as readPlatformRelease } from "node:os";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import appConfig from "../../app.config.mjs";
import {
  DesktopChannels,
  type DesktopWindowState,
  type RegisteredWorkspace,
  type WorkspaceFileEntry,
} from "../shared/desktop.js";
import { registerTerminalIpc } from "./terminalManager.js";
import { configureBrowserSession, configureWebviewSecurity } from "./webviewSecurity.js";

const currentDir = dirname(fileURLToPath(import.meta.url));
let _mainWindow: BrowserWindow | null = null;
const workspaces = new Map<string, RegisteredWorkspace>();
const maxFileBytes = 1_000_000;
const ignoredWorkspaceEntries = new Set([".git", "node_modules", "dist", "build", "target"]);

function registeredWorkspace(rawId: unknown): RegisteredWorkspace {
  if (typeof rawId !== "string") throw new TypeError("Workspace id must be a string");
  const workspace = workspaces.get(rawId);
  if (!workspace) throw new Error("Workspace is not registered in this application session");
  return workspace;
}

async function listWorkspaceEntries(
  directory: string,
  relative = "",
  depth = 0,
): Promise<WorkspaceFileEntry[]> {
  if (depth > 8) return [];
  const entries = await readdir(directory, { withFileTypes: true });
  return Promise.all(
    entries
      .filter((entry) => !ignoredWorkspaceEntries.has(entry.name))
      .sort((left, right) =>
        left.isDirectory() === right.isDirectory()
          ? left.name.localeCompare(right.name)
          : left.isDirectory()
            ? -1
            : 1,
      )
      .map(async (entry) => {
        const path = relative ? `${relative}/${entry.name}` : entry.name;
        if (!entry.isDirectory() || entry.isSymbolicLink())
          return { path, name: entry.name, kind: "file" };
        return {
          path,
          name: entry.name,
          kind: "directory",
          children: await listWorkspaceEntries(resolve(directory, entry.name), path, depth + 1),
        };
      }),
  );
}

async function resolveWorkspaceFile(workspaceId: unknown, rawPath: unknown): Promise<string> {
  if (typeof rawPath !== "string" || !rawPath || rawPath.includes("\0")) {
    throw new TypeError("Workspace file path must be a non-empty string");
  }
  const root = await realpath(registeredWorkspace(workspaceId).path);
  const file = await realpath(resolve(root, rawPath));
  const pathFromRoot = relative(root, file);
  if (file === root || isAbsolute(pathFromRoot) || /^\.\.(?:[\\/]|$)/u.test(pathFromRoot)) {
    throw new Error("File is outside the workspace");
  }
  if (!(await lstat(file)).isFile()) throw new Error("Workspace path is not a regular file");
  return file;
}

const WINDOWS_11_FIRST_BUILD = 22000;

function resolveMacOSMajorVersion(platformRelease = readPlatformRelease()): number | null {
  if (process.platform !== "darwin") return null;
  const darwinMajor = Number.parseInt(platformRelease.split(".")[0] ?? "", 10);
  if (!Number.isFinite(darwinMajor)) return null;
  return darwinMajor >= 25 ? darwinMajor + 1 : darwinMajor - 9;
}

function supportsNativeWindowsRoundedCorners(platformRelease = readPlatformRelease()): boolean {
  if (process.platform !== "win32") return false;
  const build = Number.parseInt(platformRelease.split(".")[2] ?? "", 10);
  return Number.isFinite(build) && build >= WINDOWS_11_FIRST_BUILD;
}

function readWindowState(window: BrowserWindow): DesktopWindowState {
  return {
    isMaximized: window.isMaximized(),
    isFullScreen: window.isFullScreen(),
    macOSMajorVersion: resolveMacOSMajorVersion(),
    supportsNativeRoundedCorners: supportsNativeWindowsRoundedCorners(),
  };
}

function publishWindowState(window: BrowserWindow): void {
  window.webContents.send(DesktopChannels.windowStateChanged, readWindowState(window));
}

function resolveSenderWindow(event: Electron.IpcMainInvokeEvent): BrowserWindow {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) throw new Error("The IPC sender is not attached to an application window");
  return window;
}

function registerDesktopIpc(): void {
  ipcMain.handle(DesktopChannels.minimize, (event) => resolveSenderWindow(event).minimize());
  ipcMain.handle(DesktopChannels.toggleMaximize, (event) => {
    const window = resolveSenderWindow(event);
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
    return readWindowState(window);
  });
  ipcMain.handle(DesktopChannels.close, (event) => resolveSenderWindow(event).close());
  ipcMain.handle(DesktopChannels.getWindowState, (event) =>
    readWindowState(resolveSenderWindow(event)),
  );
  ipcMain.handle(DesktopChannels.openExternal, async (_event, rawUrl: unknown) => {
    if (typeof rawUrl !== "string") throw new TypeError("URL must be a string");
    const url = new URL(rawUrl);
    if (!new Set(["https:", "http:", "mailto:"]).has(url.protocol))
      throw new Error(`Unsupported external URL protocol: ${url.protocol}`);
    await shell.openExternal(url.toString());
  });
  ipcMain.handle(
    DesktopChannels.workspaceChoose,
    async (event): Promise<RegisteredWorkspace | null> => {
      const result = await dialog.showOpenDialog(resolveSenderWindow(event), {
        title: "Open VINTAGE workspace",
        properties: ["openDirectory", "createDirectory"],
      });
      if (result.canceled || !result.filePaths[0]) return null;
      const path = await realpath(result.filePaths[0]);
      const existing = [...workspaces.values()].find((workspace) => workspace.path === path);
      if (existing) return existing;
      const workspace = { id: randomUUID(), name: basename(path), path };
      workspaces.set(workspace.id, workspace);
      return workspace;
    },
  );
  ipcMain.handle(DesktopChannels.workspaceListFiles, (_event, workspaceId: unknown) =>
    listWorkspaceEntries(registeredWorkspace(workspaceId).path),
  );
  ipcMain.handle(
    DesktopChannels.workspaceReadFile,
    async (_event, workspaceId: unknown, rawPath: unknown) => {
      const file = await resolveWorkspaceFile(workspaceId, rawPath);
      const content = await readFile(file, "utf8");
      return {
        path: rawPath as string,
        content: content.slice(0, maxFileBytes),
        truncated: Buffer.byteLength(content, "utf8") > maxFileBytes,
      };
    },
  );
}

async function createMainWindow(): Promise<BrowserWindow> {
  const isMac = process.platform === "darwin";
  const isWindows = process.platform === "win32";
  const isLinux = process.platform === "linux";
  const appIconPath = resolve(currentDir, "../../build/icon.png");
  const window = new BrowserWindow({
    ...appConfig.window,
    show: false,
    backgroundColor: "#00000000",
    ...(!isMac ? { icon: appIconPath } : {}),
    ...(isMac
      ? {
          titleBarStyle: "hidden" as const,
          trafficLightPosition: { x: 22, y: 23 },
          vibrancy: "under-window" as const,
          visualEffectState: "active" as const,
        }
      : {}),
    ...(isWindows
      ? {
          frame: false,
          backgroundMaterial: "acrylic" as const,
        }
      : {}),
    ...(isLinux
      ? {
          transparent: true,
          frame: false,
          hasShadow: false,
          autoHideMenuBar: true,
        }
      : {}),
    webPreferences: {
      preload: resolve(currentDir, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
    },
  });
  configureWebviewSecurity(window);
  window.on("maximize", () => publishWindowState(window));
  window.on("unmaximize", () => publishWindowState(window));
  window.on("enter-full-screen", () => publishWindowState(window));
  window.on("leave-full-screen", () => publishWindowState(window));
  window.once("ready-to-show", () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) await window.loadURL(devServerUrl);
  else await window.loadFile(resolve(currentDir, "../renderer/index.html"));
  return window;
}

app.setName(appConfig.productName);
app.whenReady().then(async () => {
  registerDesktopIpc();
  registerTerminalIpc((id) => registeredWorkspace(id).path);
  configureBrowserSession();
  _mainWindow = await createMainWindow();
  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) _mainWindow = await createMainWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
