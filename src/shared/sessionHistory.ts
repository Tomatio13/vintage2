export type HistoryAgent = "codex" | "claude" | "grok" | "antigravity" | "opencode";
export interface HistorySession {
  key: string;
  agent: HistoryAgent;
  sessionId: string;
  cwd: string;
  title: string;
  preview: string;
  updatedAt: number;
  canResume: boolean;
  analysis?: import("./sessionAnalysis.js").SessionAnalysis | undefined;
}
export interface HistoryMessage {
  role: "user" | "assistant";
  text: string;
}
export interface SessionHistoryList {
  sessions: HistorySession[];
  warnings: string[];
}
export interface SessionHistoryDetail {
  session: HistorySession;
  messages: HistoryMessage[];
  truncated: boolean;
}

export const historyAgentStyle = {
  codex: { name: "Codex", badge: "CD", color: "bg-cyan-500/10 text-cyan-500" },
  claude: { name: "Claude Code", badge: "CC", color: "bg-amber-500/10 text-amber-500" },
  opencode: { name: "OpenCode", badge: "OC", color: "bg-emerald-500/10 text-emerald-500" },
  grok: { name: "Grok", badge: "GK", color: "bg-teal-500/10 text-teal-500" },
  antigravity: { name: "Antigravity", badge: "AG", color: "bg-violet-500/10 text-violet-500" },
} satisfies Record<HistoryAgent, { name: string; badge: string; color: string }>;

/** Windows paths are case insensitive and accept either directory separator. */
export function sessionPathsEqual(a: string, b: string, windows = false): boolean {
  const normalize = (value: string) => {
    const path = (windows ? value.replaceAll("\\", "/") : value).replace(/\/+$/, "") || "/";
    return windows ? path.toLowerCase() : path;
  };
  return normalize(a) === normalize(b);
}
