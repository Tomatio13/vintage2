import { contextBridge, ipcRenderer } from "electron";

import {
  DesktopChannels,
  type AttentionSettings,
  type DesktopBridge,
  type DesktopWindowState,
  type AttentionNotification,
  type TerminalDataEvent,
  type TerminalExitEvent,
  type TerminalAttentionState,
  type TerminalMonitorMode,
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
  showAttentionNotification: (notification: AttentionNotification) =>
    ipcRenderer.invoke(DesktopChannels.showAttentionNotification, notification),
  onAttentionNotificationClick(listener) {
    const wrapped = (_event: Electron.IpcRendererEvent, paneId: string) => listener(paneId);
    ipcRenderer.on(DesktopChannels.attentionNotificationClicked, wrapped);
    return () => ipcRenderer.removeListener(DesktopChannels.attentionNotificationClicked, wrapped);
  },
  writeClipboardText: (text) => ipcRenderer.invoke(DesktopChannels.clipboardWriteText, text),
  getJevSettings: () => ipcRenderer.invoke(DesktopChannels.jevSettingsGet),
  setJevApiKey: (apiKey) => ipcRenderer.invoke(DesktopChannels.jevSettingsSet, apiKey),
  clearJevApiKey: () => ipcRenderer.invoke(DesktopChannels.jevSettingsClear),
  getAttentionSettings: () => ipcRenderer.invoke(DesktopChannels.attentionSettingsGet),
  setAttentionSettings: (settings: AttentionSettings) =>
    ipcRenderer.invoke(DesktopChannels.attentionSettingsSet, settings),
  getHomeWorkspace: () => ipcRenderer.invoke(DesktopChannels.workspaceHome),
  chooseWorkspace: () => ipcRenderer.invoke(DesktopChannels.workspaceChoose),
  loadWorkspaceState: () => ipcRenderer.invoke(DesktopChannels.workspaceStateLoad),
  saveWorkspaceState: (state) => ipcRenderer.invoke(DesktopChannels.workspaceStateSave, state),
  locateWorkspace: (workspaceId) =>
    ipcRenderer.invoke(DesktopChannels.workspaceLocate, workspaceId),
  listWorkspaceFiles: (workspaceId, directoryPath) =>
    ipcRenderer.invoke(DesktopChannels.workspaceListFiles, workspaceId, directoryPath),
  readWorkspaceFile: (workspaceId, path) =>
    ipcRenderer.invoke(DesktopChannels.workspaceReadFile, workspaceId, path),
  readWorkspaceImage: (workspaceId, path) =>
    ipcRenderer.invoke(DesktopChannels.workspaceReadImage, workspaceId, path),
  createTerminal: (options) => ipcRenderer.invoke(DesktopChannels.terminalCreate, options),
  readyTerminal: (sessionId) => ipcRenderer.invoke(DesktopChannels.terminalReady, sessionId),
  writeTerminal: (sessionId, data) =>
    ipcRenderer.invoke(DesktopChannels.terminalWrite, sessionId, data),
  resizeTerminal: (sessionId, size) =>
    ipcRenderer.invoke(DesktopChannels.terminalResize, sessionId, size),
  setTerminalActive: (sessionId, active) =>
    ipcRenderer.invoke(DesktopChannels.terminalSetActive, sessionId, active),
  setTerminalMonitorMode: (sessionId, mode: TerminalMonitorMode) =>
    ipcRenderer.invoke(DesktopChannels.terminalSetMonitorMode, sessionId, mode),
  dismissTerminalAttention: (sessionId) =>
    ipcRenderer.invoke(DesktopChannels.terminalDismissAttention, sessionId),
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
  onTerminalAttention(listener) {
    const wrapped = (_event: Electron.IpcRendererEvent, state: TerminalAttentionState) =>
      listener(state);
    ipcRenderer.on(DesktopChannels.terminalAttention, wrapped);
    return () => ipcRenderer.removeListener(DesktopChannels.terminalAttention, wrapped);
  },
};

contextBridge.exposeInMainWorld("desktop", bridge);
