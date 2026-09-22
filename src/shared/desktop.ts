export const DesktopChannels = {
  minimize: "desktop:minimize",
  toggleMaximize: "desktop:toggle-maximize",
  close: "desktop:close",
  getWindowState: "desktop:get-window-state",
  windowStateChanged: "desktop:window-state-changed",
  openExternal: "desktop:open-external",
  workspaceChoose: "workspace:choose",
  workspaceListFiles: "workspace:list-files",
  workspaceReadFile: "workspace:read-file",
  terminalCreate: "terminal:create",
  terminalReady: "terminal:ready",
  terminalWrite: "terminal:write",
  terminalResize: "terminal:resize",
  terminalClose: "terminal:close",
  terminalData: "terminal:data",
  terminalExit: "terminal:exit",
} as const;

export interface RegisteredWorkspace {
  id: string;
  name: string;
  path: string;
}

export interface WorkspaceFileEntry {
  path: string;
  name: string;
  kind: "file" | "directory";
  children?: WorkspaceFileEntry[];
}

export interface WorkspaceFileContent {
  path: string;
  content: string;
  truncated: boolean;
}

export interface DesktopWindowState {
  isMaximized: boolean;
  isFullScreen: boolean;
  macOSMajorVersion: number | null;
  supportsNativeRoundedCorners: boolean | null;
}

export interface TerminalSession {
  id: string;
  shell: string;
  cwd: string;
}

export interface TerminalDataEvent {
  sessionId: string;
  data: string;
}

export interface TerminalExitEvent {
  sessionId: string;
  exitCode: number;
  signal?: number;
}

export interface TerminalResize {
  cols: number;
  rows: number;
}

export type TerminalShell = "system" | "zsh" | "bash" | "fish";

export interface TerminalCreateOptions extends TerminalResize {
  workspaceId: string;
  shell?: TerminalShell;
}

export interface DesktopBridge {
  platform: NodeJS.Platform;
  minimize(): Promise<void>;
  toggleMaximize(): Promise<DesktopWindowState>;
  close(): Promise<void>;
  getWindowState(): Promise<DesktopWindowState>;
  onWindowStateChanged(listener: (state: DesktopWindowState) => void): () => void;
  openExternal(url: string): Promise<void>;
  chooseWorkspace(): Promise<RegisteredWorkspace | null>;
  listWorkspaceFiles(workspaceId: string): Promise<WorkspaceFileEntry[]>;
  readWorkspaceFile(workspaceId: string, path: string): Promise<WorkspaceFileContent>;
  createTerminal(options: TerminalCreateOptions): Promise<TerminalSession>;
  readyTerminal(sessionId: string): Promise<void>;
  writeTerminal(sessionId: string, data: string): Promise<void>;
  resizeTerminal(sessionId: string, size: TerminalResize): Promise<void>;
  closeTerminal(sessionId: string): Promise<void>;
  onTerminalData(listener: (event: TerminalDataEvent) => void): () => void;
  onTerminalExit(listener: (event: TerminalExitEvent) => void): () => void;
}
