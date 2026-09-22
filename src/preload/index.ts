import { contextBridge, ipcRenderer } from "electron";

import {
  DesktopChannels,
  type DesktopBridge,
  type DesktopWindowState,
  type TerminalDataEvent,
  type TerminalExitEvent,
} from "../shared/desktop.js";

const bridge: DesktopBridge = {
  platform: process.platform,
  minimize: () => ipcRenderer.invoke(DesktopChannels.minimize),
  toggleMaximize: () => ipcRenderer.invoke(DesktopChannels.toggleMaximize),
  close: () => ipcRenderer.invoke(DesktopChannels.close),
  getWindowState: () => ipcRenderer.invoke(DesktopChannels.getWindowState),
  onWindowStateChanged(listener) {
    const wrapped = (_event: Electron.IpcRendererEvent, state: DesktopWindowState) =>
      listener(state);
    ipcRenderer.on(DesktopChannels.windowStateChanged, wrapped);
    return () => ipcRenderer.removeListener(DesktopChannels.windowStateChanged, wrapped);
  },
  openExternal: (url) => ipcRenderer.invoke(DesktopChannels.openExternal, url),
  chooseWorkspace: () => ipcRenderer.invoke(DesktopChannels.workspaceChoose),
  listWorkspaceFiles: (workspaceId) =>
    ipcRenderer.invoke(DesktopChannels.workspaceListFiles, workspaceId),
  readWorkspaceFile: (workspaceId, path) =>
    ipcRenderer.invoke(DesktopChannels.workspaceReadFile, workspaceId, path),
  createTerminal: (options) => ipcRenderer.invoke(DesktopChannels.terminalCreate, options),
  readyTerminal: (sessionId) => ipcRenderer.invoke(DesktopChannels.terminalReady, sessionId),
  writeTerminal: (sessionId, data) =>
    ipcRenderer.invoke(DesktopChannels.terminalWrite, sessionId, data),
  resizeTerminal: (sessionId, size) =>
    ipcRenderer.invoke(DesktopChannels.terminalResize, sessionId, size),
  closeTerminal: (sessionId) => ipcRenderer.invoke(DesktopChannels.terminalClose, sessionId),
  onTerminalData(listener) {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: TerminalDataEvent) =>
      listener(payload);
    ipcRenderer.on(DesktopChannels.terminalData, wrapped);
    return () => ipcRenderer.removeListener(DesktopChannels.terminalData, wrapped);
  },
  onTerminalExit(listener) {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: TerminalExitEvent) =>
      listener(payload);
    ipcRenderer.on(DesktopChannels.terminalExit, wrapped);
    return () => ipcRenderer.removeListener(DesktopChannels.terminalExit, wrapped);
  },
};

contextBridge.exposeInMainWorld("desktop", bridge);
