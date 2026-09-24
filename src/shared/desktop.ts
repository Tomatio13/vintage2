export const DesktopChannels = {
  minimize: "desktop:minimize",
  toggleMaximize: "desktop:toggle-maximize",
  close: "desktop:close",
  getWindowState: "desktop:get-window-state",
  windowStateChanged: "desktop:window-state-changed",
  openExternal: "desktop:open-external",
  showAttentionNotification: "attention:show-notification",
  attentionNotificationClicked: "attention:notification-clicked",
  clipboardWriteText: "clipboard:write-text",
  jevSettingsGet: "jev:settings-get",
  jevSettingsSet: "jev:settings-set",
  jevSettingsClear: "jev:settings-clear",
  attentionSettingsGet: "attention:settings-get",
  attentionSettingsSet: "attention:settings-set",
  workspaceChoose: "workspace:choose",
  workspaceHome: "workspace:home",
  workspaceStateLoad: "workspace:state-load",
  workspaceStateSave: "workspace:state-save",
  workspaceLocate: "workspace:locate",
  workspaceListFiles: "workspace:list-files",
  workspaceReadFile: "workspace:read-file",
  workspaceReadImage: "workspace:read-image",
  workspaceGitReview: "workspace:git-review",
  workspaceGitReviewDiff: "workspace:git-review-diff",
  terminalCreate: "terminal:create",
  terminalReady: "terminal:ready",
  terminalWrite: "terminal:write",
  terminalResize: "terminal:resize",
  terminalSetActive: "terminal:set-active",
  terminalSetMonitorMode: "terminal:set-monitor-mode",
  terminalDismissAttention: "terminal:dismiss-attention",
  terminalClose: "terminal:close",
  terminalData: "terminal:data",
  terminalExit: "terminal:exit",
  terminalAttention: "terminal:attention",
} as const;

export interface RegisteredWorkspace {
  id: string;
  name: string;
  path: string;
  kind: "home" | "project";
}

export type WorkspacePaneSnapshot =
  | { id: string; title: string; kind: "terminal" }
  | { id: string; title: string; kind: "file"; path: string };

export type WorkspacePaneLayoutSnapshot =
  | { type: "pane"; paneId: string }
  | {
      type: "split";
      splitId: string;
      axis: "horizontal" | "vertical";
      ratio: number;
      first: WorkspacePaneLayoutSnapshot;
      second: WorkspacePaneLayoutSnapshot;
    };

export interface WorkspaceSpaceSnapshot {
  id: string;
  title: string;
  panes: WorkspacePaneSnapshot[];
  layout: WorkspacePaneLayoutSnapshot;
  activePaneId: string;
}

export interface PersistedWorkspace extends RegisteredWorkspace {
  tabs: WorkspaceSpaceSnapshot[];
  activeTabId: string;
}

export interface WorkspaceStateSnapshot {
  version: 1;
  workspaces: PersistedWorkspace[];
  activeWorkspaceId: string | null;
}

export interface RestoredWorkspace extends PersistedWorkspace {
  available: boolean;
}

export interface RestoredWorkspaceState {
  version: 1;
  workspaces: RestoredWorkspace[];
  activeWorkspaceId: string | null;
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

export type WorkspaceGitReviewSource = "unstaged" | "staged";

export type WorkspaceGitReviewChangeKind =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "untracked"
  | "conflicted";

export interface WorkspaceGitReviewChange {
  path: string;
  originalPath?: string;
  kind: WorkspaceGitReviewChangeKind;
  added: number | null;
  removed: number | null;
}

export interface WorkspaceGitReviewSnapshot {
  status: "ready" | "not-repository" | "git-unavailable";
  changes: WorkspaceGitReviewChange[];
}

export interface WorkspaceGitReviewDiffRequest {
  source: WorkspaceGitReviewSource;
  path: string;
  originalPath?: string;
  kind: WorkspaceGitReviewChangeKind;
  contextLines?: number;
}

export interface WorkspaceGitReviewDiff {
  availability: "patch" | "binary" | "unavailable";
  patch: string | null;
  summary: string | null;
}

export type JevApiKeySource = "saved" | "environment" | "none";

export interface JevSettingsStatus {
  configured: boolean;
  source: JevApiKeySource;
  secureStorageAvailable: boolean;
  storageBackend: string | null;
}

export interface AttentionNotification {
  title: string;
  body: string;
  dedupeKey: string;
  attentionLevel: AttentionLevel;
  targetPaneId: string;
  force?: boolean;
}

export type AttentionLevel = 1 | 2 | 3 | 4;

export type TerminalMonitorMode =
  | "monitor"
  | "agent_monitor"
  | "ignore"
  | "mute"
  | "always_notify"
  | "ignore_until_error";

export const DEFAULT_TERMINAL_MONITOR_MODE: TerminalMonitorMode = "ignore_until_error";

export const DEFAULT_ATTENTION_SETTINGS = {
  debounceMs: 800,
  agentMonitorIntervalSeconds: 10,
  attentionThreshold: 1,
  notificationThreshold: 3,
} as const satisfies AttentionSettings;

export interface AttentionSettings {
  debounceMs: number;
  agentMonitorIntervalSeconds: number;
  attentionThreshold: AttentionLevel;
  notificationThreshold: AttentionLevel;
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
  monitorMode: TerminalMonitorMode;
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

export type TerminalAttentionStatus =
  | "idle"
  | "running"
  | "completed"
  | "thinking"
  | "waiting"
  | "failed"
  | "waiting_input"
  | "warning"
  | "unknown";

export type TerminalAttentionReason =
  | "command_completed"
  | "command_failed"
  | "long_running_completed"
  | "input_request"
  | "agent_activity"
  | "error_output"
  | "warning_output"
  | "session_ended"
  | "semantic_judgment";

export interface TerminalAttentionState {
  sessionId: string;
  status: TerminalAttentionStatus;
  attentionLevel: 0 | 1 | 2 | 3 | 4;
  userActionRequired: boolean;
  source: "shell" | "pty" | "session" | "jev";
  reason?: TerminalAttentionReason;
  durationMs?: number;
  semanticHash?: string;
  judgmentConfidence?: number;
  judgmentModel?: string;
  keepMonitoring?: boolean;
  lastEvaluationAt?: number;
  lastExitCode?: number;
  lastActivityAt: number;
  monitorMode?: TerminalMonitorMode;
  notificationThreshold?: AttentionLevel;
}

export interface TerminalResize {
  cols: number;
  rows: number;
}

export type TerminalShell = "system" | "zsh" | "bash" | "fish";

export interface TerminalCreateOptions extends TerminalResize {
  workspaceId: string;
  shell?: TerminalShell;
  tabTitle?: string;
  paneTitle?: string;
}

export interface DesktopBridge {
  platform: NodeJS.Platform;
  minimize(): Promise<void>;
  toggleMaximize(): Promise<DesktopWindowState>;
  close(): Promise<void>;
  getWindowState(): Promise<DesktopWindowState>;
  onWindowStateChanged(listener: (state: DesktopWindowState) => void): () => void;
  openExternal(url: string): Promise<void>;
  showAttentionNotification(notification: AttentionNotification): Promise<boolean>;
  onAttentionNotificationClick(listener: (paneId: string) => void): () => void;
  writeClipboardText(text: string): Promise<void>;
  getJevSettings(): Promise<JevSettingsStatus>;
  setJevApiKey(apiKey: string): Promise<JevSettingsStatus>;
  clearJevApiKey(): Promise<JevSettingsStatus>;
  getAttentionSettings(): Promise<AttentionSettings>;
  setAttentionSettings(settings: AttentionSettings): Promise<AttentionSettings>;
  getHomeWorkspace(): Promise<RegisteredWorkspace>;
  chooseWorkspace(): Promise<RegisteredWorkspace | null>;
  loadWorkspaceState(): Promise<RestoredWorkspaceState>;
  saveWorkspaceState(state: WorkspaceStateSnapshot): Promise<void>;
  locateWorkspace(workspaceId: string): Promise<RegisteredWorkspace | null>;
  listWorkspaceFiles(workspaceId: string, directoryPath?: string): Promise<WorkspaceFileEntry[]>;
  readWorkspaceFile(workspaceId: string, path: string): Promise<WorkspaceFileContent>;
  readWorkspaceImage(workspaceId: string, path: string): Promise<string>;
  getWorkspaceGitReview(
    workspaceId: string,
    source: WorkspaceGitReviewSource,
  ): Promise<WorkspaceGitReviewSnapshot>;
  getWorkspaceGitReviewDiff(
    workspaceId: string,
    request: WorkspaceGitReviewDiffRequest,
  ): Promise<WorkspaceGitReviewDiff>;
  createTerminal(options: TerminalCreateOptions): Promise<TerminalSession>;
  readyTerminal(sessionId: string): Promise<void>;
  writeTerminal(sessionId: string, data: string): Promise<void>;
  resizeTerminal(sessionId: string, size: TerminalResize): Promise<void>;
  setTerminalActive(sessionId: string, active: boolean): Promise<void>;
  setTerminalMonitorMode(sessionId: string, mode: TerminalMonitorMode): Promise<void>;
  dismissTerminalAttention(sessionId: string): Promise<void>;
  closeTerminal(sessionId: string): Promise<void>;
  onTerminalData(listener: (event: TerminalDataEvent) => void): () => void;
  onTerminalExit(listener: (event: TerminalExitEvent) => void): () => void;
  onTerminalAttention(listener: (state: TerminalAttentionState) => void): () => void;
}
