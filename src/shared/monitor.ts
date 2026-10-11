export type MonitorAgent = "claude" | "codex" | "antigravity" | "opencode" | "zcode" | "grok";
export type MonitorStatus =
  | "Thinking"
  | "Executing"
  | "Waiting"
  | "RateLimited"
  | "Done"
  | "Error"
  | "Unknown";

export interface MonitorTool {
  id: string;
  name: string;
  path: string | null;
  startedAt: number | null;
  durationMs: number | null;
}

export interface MonitorSession {
  id: string;
  agent: MonitorAgent;
  pid: number;
  processPids?: number[];
  sessionId: string | null;
  cwd: string;
  model: string | null;
  status: MonitorStatus;
  currentTool: MonitorTool | null;
  tools: MonitorTool[];
  contextTokens: number | null;
  contextWindow: number | null;
  contextEstimated: boolean;
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  tokensPerSecond: number | null;
  tokenTotalsAvailable?: boolean;
  startedAt: number | null;
  lastActivityAt: number | null;
  loading: boolean;
  paneId: string | null;
  cpuPercent?: number | null;
  memoryBytes?: number | null;
  children?: MonitorProcess[];
  turnCount?: number;
  launchSurface?: "terminal" | "background" | "remote";
  logMatch?: "verified" | "inferred" | "unavailable";
  diagnostic?: string | null;
}

export interface MonitorSnapshot {
  generatedAt: number;
  sessions: MonitorSession[];
  warnings: string[];
  supported: boolean;
  host?: MonitorHost | null;
  history?: MonitorActivitySample[];
}

export interface MonitorHost {
  name: string;
  cpuPercent: number | null;
  cores: (number | null)[];
  memoryUsedBytes: number;
  memoryTotalBytes: number;
  loadAverage: number | null;
}
export interface MonitorProcess {
  pid: number;
  name: string;
  cpuPercent: number | null;
  memoryBytes: number | null;
}
export interface MonitorActivitySample {
  at: number;
  tokenRate: number | null;
  activeSessions: number;
  cpuPercent: number | null;
  memoryPercent: number | null;
}
