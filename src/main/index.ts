import { app, BrowserWindow, clipboard, dialog, ipcMain, Notification, shell } from "electron";
import { randomUUID } from "node:crypto";
import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import { release as readPlatformRelease } from "node:os";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import appConfig from "../../app.config.mjs";
import {
  DesktopChannels,
  type AttentionNotification,
  type DesktopWindowState,
  type RestoredWorkspaceState,
  type RegisteredWorkspace,
  type WorkspaceFileEntry,
  type WorkspaceStateSnapshot,
} from "../shared/desktop.js";
import { AttentionSettingsManager } from "./attentionSettings.js";
import { JevCredentialStore, JevSettingsManager } from "./jevSettings.js";
import { JevEvaluationQueue } from "./jevEvaluationQueue.js";
import { registerTerminalIpc } from "./terminalManager.js";
import { restoreSavedProjects } from "./workspaceRestore.js";
import { parseWorkspaceState, WorkspaceStateManager } from "./workspaceState.js";
import { configureBrowserSession, configureWebviewSecurity } from "./webviewSecurity.js";

const currentDir = dirname(fileURLToPath(import.meta.url));
let _mainWindow: BrowserWindow | null = null;
const workspaces = new Map<string, RegisteredWorkspace>();
const homeWorkspaceId = "vintage:home";
const maxFileBytes = 1_000_000;
const ignoredWorkspaceEntries = new Set([".git", "node_modules", "dist", "build", "target"]);
const notificationHistory: number[] = [];
const lastNotificationByKey = new Map<string, number>();
const NOTIFICATION_DEDUPE_MS = 5_000;
const NOTIFICATION_LIMIT_PER_SECOND = 2;
const NOTIFICATION_LIMIT_PER_MINUTE = 30;

function registeredWorkspace(rawId: unknown): RegisteredWorkspace {
  if (typeof rawId !== "string") throw new TypeError("Workspace id must be a string");
  const workspace = workspaces.get(rawId);
  if (!workspace) throw new Error("Workspace is not registered in this application session");
  return workspace;
}

async function registerHomeWorkspace(): Promise<RegisteredWorkspace> {
  const path = await realpath(app.getPath("home"));
  const existing = workspaces.get(homeWorkspaceId);
  if (existing) return existing;
  const workspace: RegisteredWorkspace = {
    id: homeWorkspaceId,
    name: "Home",
    path,
    kind: "home",
  };
  workspaces.set(workspace.id, workspace);
  return workspace;
}

async function restoreWorkspaceState(
  workspaceState: WorkspaceStateManager,
): Promise<RestoredWorkspaceState> {
  const saved = workspaceState.getState();
  const home = await registerHomeWorkspace();
  const savedHome = saved.workspaces.find((workspace) => workspace.kind === "home");
  const restoredHome = {
    ...home,
    tabs: savedHome?.tabs ?? [],
    activeTabId: savedHome?.activeTabId ?? "",
    available: true,
  } satisfies RestoredWorkspaceState["workspaces"][number];
  const savedProjects = saved.workspaces.filter((workspace) => workspace.kind === "project");
  const projects = await restoreSavedProjects(savedProjects, home.path);
  for (const project of projects.registered) workspaces.set(project.id, project);
  const restored = [restoredHome, ...projects.projects];

  const activeWorkspaceId = restored.some((workspace) => workspace.id === saved.activeWorkspaceId)
    ? saved.activeWorkspaceId
    : home.id;
  return { version: 1, workspaces: restored, activeWorkspaceId };
}

async function listWorkspaceEntries(
  directory: string,
  relative = "",
): Promise<WorkspaceFileEntry[]> {
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
        };
      }),
  );
}

async function resolveWorkspaceDirectory(workspaceId: unknown, rawPath: unknown): Promise<string> {
  if (rawPath !== undefined && (typeof rawPath !== "string" || rawPath.includes("\0"))) {
    throw new TypeError("Workspace directory path must be a string");
  }
  const root = await realpath(registeredWorkspace(workspaceId).path);
  const directory = await realpath(resolve(root, (rawPath as string | undefined) ?? ""));
  const pathFromRoot = relative(root, directory);
  if (isAbsolute(pathFromRoot) || /^\.\.(?:[\\/]|$)/u.test(pathFromRoot)) {
    throw new Error("Directory is outside the workspace");
  }
  if (!(await lstat(directory)).isDirectory()) throw new Error("Workspace path is not a directory");
  return directory;
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

function parseAttentionNotification(raw: unknown): AttentionNotification {
  if (!raw || typeof raw !== "object") throw new TypeError("Notification is required");
  const { title, body, dedupeKey, attentionLevel, targetPaneId, force } =
    raw as Partial<AttentionNotification>;
  if (typeof title !== "string" || !title.trim() || title.length > 120) {
    throw new TypeError("Notification title must be 1-120 characters");
  }
  if (typeof body !== "string" || !body.trim() || body.length > 500) {
    throw new TypeError("Notification body must be 1-500 characters");
  }
  if (typeof dedupeKey !== "string" || !dedupeKey || dedupeKey.length > 200) {
    throw new TypeError("Notification dedupe key must be 1-200 characters");
  }
  if (
    attentionLevel !== 1 &&
    attentionLevel !== 2 &&
    attentionLevel !== 3 &&
    attentionLevel !== 4
  ) {
    throw new TypeError("Notification attention level must be between 1 and 4");
  }
  if (typeof targetPaneId !== "string" || !targetPaneId || targetPaneId.length > 120) {
    throw new TypeError("Notification target pane is required");
  }
  if (force !== undefined && typeof force !== "boolean") {
    throw new TypeError("Notification force must be a boolean");
  }
  return {
    title: title.trim(),
    body: body.trim(),
    dedupeKey,
    attentionLevel,
    targetPaneId,
    ...(force ? { force: true } : {}),
  };
}

function reserveNotification(dedupeKey: string, now = Date.now()): boolean {
  const minuteAgo = now - 60_000;
  while (notificationHistory[0] !== undefined && notificationHistory[0] < minuteAgo) {
    notificationHistory.shift();
  }
  for (const [key, timestamp] of lastNotificationByKey) {
    if (timestamp < now - NOTIFICATION_DEDUPE_MS) lastNotificationByKey.delete(key);
  }
  const previous = lastNotificationByKey.get(dedupeKey);
  if (previous !== undefined && now - previous < NOTIFICATION_DEDUPE_MS) return false;
  const recentCount = notificationHistory.filter((timestamp) => timestamp >= now - 1_000).length;
  if (
    recentCount >= NOTIFICATION_LIMIT_PER_SECOND ||
    notificationHistory.length >= NOTIFICATION_LIMIT_PER_MINUTE
  ) {
    return false;
  }
  notificationHistory.push(now);
  lastNotificationByKey.set(dedupeKey, now);
  return true;
}

function registerDesktopIpc(
  jevSettings: JevSettingsManager,
  attentionSettings: AttentionSettingsManager,
  workspaceState: WorkspaceStateManager,
): void {
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
  ipcMain.handle(DesktopChannels.clipboardWriteText, (event, text: unknown) => {
    resolveSenderWindow(event);
    if (typeof text !== "string") throw new TypeError("Clipboard text must be a string");
    clipboard.writeText(text);
  });
  ipcMain.handle(DesktopChannels.showAttentionNotification, (event, raw: unknown) => {
    const window = resolveSenderWindow(event);
    const payload = parseAttentionNotification(raw);
    if ((!payload.force && window.isFocused()) || !Notification.isSupported()) return false;
    if (!reserveNotification(payload.dedupeKey)) return false;
    const notification = new Notification({
      title: payload.attentionLevel === 4 ? `CRITICAL · ${payload.title}` : payload.title,
      body: payload.body,
      icon: resolve(currentDir, "../../build/icon.png"),
      ...(payload.attentionLevel === 4 && process.platform === "linux"
        ? { urgency: "critical" as const }
        : {}),
      ...(payload.attentionLevel === 4 && ["linux", "win32"].includes(process.platform)
        ? { timeoutType: "never" as const }
        : {}),
    });
    notification.on("click", () => {
      if (window.isDestroyed()) return;
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
      window.webContents.send(DesktopChannels.attentionNotificationClicked, payload.targetPaneId);
    });
    notification.show();
    return true;
  });
  ipcMain.handle(DesktopChannels.jevSettingsGet, (event) => {
    resolveSenderWindow(event);
    return jevSettings.status();
  });
  ipcMain.handle(DesktopChannels.jevSettingsSet, (event, apiKey: unknown) => {
    resolveSenderWindow(event);
    return jevSettings.setApiKey(apiKey);
  });
  ipcMain.handle(DesktopChannels.jevSettingsClear, (event) => {
    resolveSenderWindow(event);
    return jevSettings.clearApiKey();
  });
  ipcMain.handle(DesktopChannels.attentionSettingsGet, (event) => {
    resolveSenderWindow(event);
    return attentionSettings.getSettings();
  });
  ipcMain.handle(DesktopChannels.attentionSettingsSet, (event, raw: unknown) => {
    resolveSenderWindow(event);
    return attentionSettings.setSettings(raw);
  });
  ipcMain.handle(DesktopChannels.workspaceHome, async (event) => {
    resolveSenderWindow(event);
    return registerHomeWorkspace();
  });
  ipcMain.handle(DesktopChannels.workspaceStateLoad, async (event) => {
    resolveSenderWindow(event);
    return restoreWorkspaceState(workspaceState);
  });
  ipcMain.handle(DesktopChannels.workspaceStateSave, async (event, rawState: unknown) => {
    resolveSenderWindow(event);
    const snapshot: WorkspaceStateSnapshot = parseWorkspaceState(rawState);
    const home = snapshot.workspaces.find((workspace) => workspace.kind === "home");
    if (
      !home ||
      home.id !== homeWorkspaceId ||
      home.path !== (await realpath(app.getPath("home")))
    ) {
      throw new Error("Workspace state must include the registered Home workspace");
    }
    const previous = workspaceState.getState();
    for (const project of snapshot.workspaces.filter((workspace) => workspace.kind === "project")) {
      const registered = workspaces.get(project.id);
      if (registered?.kind === "project" && registered.path === project.path) continue;
      const saved = previous.workspaces.find((workspace) => workspace.id === project.id);
      if (registered || saved?.kind !== "project" || saved.path !== project.path) {
        throw new Error("Workspace state contains an unregistered Project");
      }
    }
    workspaceState.saveState(snapshot);
  });
  ipcMain.handle(
    DesktopChannels.workspaceLocate,
    async (event, rawWorkspaceId: unknown): Promise<RegisteredWorkspace | null> => {
      const window = resolveSenderWindow(event);
      if (typeof rawWorkspaceId !== "string") throw new TypeError("Workspace id must be a string");
      const saved = workspaceState
        .getState()
        .workspaces.find(
          (workspace) => workspace.id === rawWorkspaceId && workspace.kind === "project",
        );
      if (!saved) throw new Error("Saved Project was not found");
      const result = await dialog.showOpenDialog(window, {
        title: `Locate ${saved.name}`,
        properties: ["openDirectory", "createDirectory"],
      });
      if (result.canceled || !result.filePaths[0]) return null;
      const path = await realpath(result.filePaths[0]);
      if (!(await lstat(path)).isDirectory())
        throw new Error("Selected Project path is not a directory");
      if (path === (await realpath(app.getPath("home")))) {
        throw new Error("Home cannot be used as a Project folder");
      }
      const alreadyRegistered = [...workspaces.values()].some(
        (workspace) => workspace.id !== rawWorkspaceId && workspace.path === path,
      );
      const alreadySaved = workspaceState
        .getState()
        .workspaces.some(
          (workspace) =>
            workspace.id !== rawWorkspaceId &&
            workspace.kind === "project" &&
            workspace.path === path,
        );
      if (alreadyRegistered || alreadySaved)
        throw new Error("That folder is already in the Project list");
      const workspace: RegisteredWorkspace = {
        id: saved.id,
        name: basename(path) || path,
        path,
        kind: "project",
      };
      workspaces.set(workspace.id, workspace);
      workspaceState.relocateProject(workspace.id, workspace.path, workspace.name);
      return workspace;
    },
  );
  ipcMain.handle(
    DesktopChannels.workspaceChoose,
    async (event): Promise<RegisteredWorkspace | null> => {
      const result = await dialog.showOpenDialog(resolveSenderWindow(event), {
        title: "Open VINTAGE workspace",
        properties: ["openDirectory", "createDirectory"],
      });
      if (result.canceled || !result.filePaths[0]) return null;
      const path = await realpath(result.filePaths[0]);
      if (path === (await realpath(app.getPath("home")))) return registerHomeWorkspace();
      const existing = [...workspaces.values()].find((workspace) => workspace.path === path);
      if (existing) return existing;
      const workspace: RegisteredWorkspace = {
        id: randomUUID(),
        name: basename(path),
        path,
        kind: "project",
      };
      workspaces.set(workspace.id, workspace);
      return workspace;
    },
  );
  ipcMain.handle(
    DesktopChannels.workspaceListFiles,
    async (_event, workspaceId: unknown, directoryPath: unknown) => {
      const directory = await resolveWorkspaceDirectory(workspaceId, directoryPath);
      return listWorkspaceEntries(directory, (directoryPath as string | undefined) ?? "");
    },
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
  const jevSettings = new JevSettingsManager(new JevCredentialStore(app.getPath("userData")));
  const attentionSettings = new AttentionSettingsManager(app.getPath("userData"));
  const workspaceState = new WorkspaceStateManager(app.getPath("userData"));
  const evaluationQueue = new JevEvaluationQueue(jevSettings.evaluator);
  jevSettings.initialize();
  attentionSettings.initialize();
  workspaceState.initialize();
  await restoreWorkspaceState(workspaceState);
  registerDesktopIpc(jevSettings, attentionSettings, workspaceState);
  registerTerminalIpc((id) => registeredWorkspace(id).path, evaluationQueue, attentionSettings);
  app.on("before-quit", () => workspaceState.flush());
  configureBrowserSession();
  _mainWindow = await createMainWindow();
  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) _mainWindow = await createMainWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
