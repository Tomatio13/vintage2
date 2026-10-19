export type AnalysisCli = "codex" | "claude";
export type AnalysisStatus = "working" | "needs_user" | "waiting_external" | "complete" | "unknown";
export interface SessionAnalysisSettings {
  cli: AnalysisCli;
  executable: string;
  model: string;
}
export const defaultAnalysisSettings: SessionAnalysisSettings = {
  cli: "codex",
  executable: "",
  model: "",
};
export const analysisStatusLabels: Record<AnalysisStatus, string> = {
  working: "Working",
  needs_user: "Needs you",
  waiting_external: "Waiting externally",
  complete: "Complete",
  unknown: "Unknown",
};
export interface SessionAnalysis {
  status: AnalysisStatus;
  summary: string;
  nextAction: string;
  analyzedAt: number;
  successfulRuns: number;
  usage?: { inputTokens: number; outputTokens: number } | undefined;
  sourceUpdatedAt: number;
  fingerprint: string;
  cli: AnalysisCli;
  model: string;
  settingsKey: string;
  stale: boolean;
}
export interface AnalysisProbe {
  version: string;
  authentication: string;
}
