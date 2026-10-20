import type { TerminalAttentionState, TerminalAttentionStatus } from "../../shared/desktop.js";

// Detection is navigation-only metadata, separate from terminal attention events.
export interface AgentNavigationState extends TerminalAttentionState {
  agentDetected?: boolean;
}

export interface AgentStatusVisual {
  className: string;
  label: string;
}

const AGENT_STATUS_VISUALS: Record<TerminalAttentionStatus, AgentStatusVisual> = {
  thinking: { className: "text-agent-thinking", label: "Thinking" },
  running: { className: "text-agent-running", label: "Running" },
  waiting: { className: "text-agent-waiting", label: "Waiting" },
  waiting_input: { className: "text-agent-waiting", label: "Input needed" },
  completed: { className: "text-agent-completed", label: "Completed" },
  warning: { className: "text-agent-warning", label: "Warning" },
  failed: { className: "text-agent-failed", label: "Failed" },
  idle: { className: "text-foreground-subtle", label: "Idle" },
  unknown: { className: "text-foreground-subtle", label: "Status unknown" },
};

const AGENT_STATUS_PRIORITY: Record<TerminalAttentionStatus, number> = {
  waiting_input: 60,
  failed: 50,
  warning: 40,
  thinking: 30,
  waiting: 25,
  running: 20,
  completed: 0,
  idle: -1,
  unknown: -1,
};

export function agentStatusVisual(status: TerminalAttentionStatus): AgentStatusVisual {
  return AGENT_STATUS_VISUALS[status];
}

export function agentStatusScore(state: AgentNavigationState): number {
  if (state.status === "idle" || state.status === "unknown") {
    return state.agentDetected ? -0.5 : -1;
  }
  return (
    (AGENT_STATUS_PRIORITY[state.status] ?? -1) +
    state.attentionLevel * 2 +
    (state.userActionRequired ? 5 : 0)
  );
}

// Prefer actionable states, then detected agents, across the panes in a Space.
export function strongestAgentStatus(
  states: Array<AgentNavigationState | null | undefined>,
): AgentNavigationState | null {
  let best: AgentNavigationState | null = null;
  for (const state of states) {
    if (!state || agentStatusScore(state) <= -1) continue;
    if (!best || agentStatusScore(state) > agentStatusScore(best)) best = state;
  }
  return best;
}

// Session ownership is supplied by the collector; never infer it from cwd.
export function monitorStatusByPane(
  sessions: import("../../shared/monitor.js").MonitorSession[],
): Record<string, AgentNavigationState> {
  const result: Record<string, AgentNavigationState> = {};
  const statuses: Record<import("../../shared/monitor.js").MonitorStatus, TerminalAttentionStatus> =
    {
      Thinking: "thinking",
      Executing: "running",
      Waiting: "waiting_input",
      RateLimited: "warning",
      Done: "completed",
      Error: "failed",
      Unknown: "unknown",
    };
  for (const session of sessions) {
    if (!session.paneId) continue;
    const next: AgentNavigationState = {
      sessionId: session.paneId,
      status: session.loading ? "unknown" : statuses[session.status],
      agentDetected: true,
      attentionLevel: 0,
      userActionRequired: session.status === "Waiting",
      source: "session",
      lastActivityAt: session.lastActivityAt ?? 0,
    };
    const best = strongestAgentStatus([result[session.paneId], next]);
    if (best) result[session.paneId] = best;
  }
  return result;
}
