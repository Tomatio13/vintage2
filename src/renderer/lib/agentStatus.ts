import type { TerminalAttentionState, TerminalAttentionStatus } from "../../shared/desktop.js";

export interface AgentStatusVisual {
  className: string;
  label: string;
  pulse: boolean;
}

// One hue per state family: blue = agent active, yellow = waiting, green = done,
// red-orange = problem. Hollow (border) variants are the quieter member of a family.
const AGENT_STATUS_VISUALS: Partial<Record<TerminalAttentionStatus, AgentStatusVisual>> = {
  thinking: { className: "bg-agent-thinking", label: "Thinking", pulse: true },
  running: { className: "bg-agent-running", label: "Running", pulse: true },
  waiting: { className: "border border-agent-waiting", label: "Waiting", pulse: false },
  waiting_input: { className: "bg-agent-waiting", label: "Input needed", pulse: true },
  completed: { className: "bg-agent-completed", label: "Completed", pulse: false },
  warning: { className: "border border-agent-warning", label: "Warning", pulse: false },
  failed: { className: "bg-agent-failed", label: "Failed", pulse: false },
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

export function agentStatusVisual(status: TerminalAttentionStatus): AgentStatusVisual | null {
  return AGENT_STATUS_VISUALS[status] ?? null;
}

export function agentStatusScore(state: TerminalAttentionState): number {
  return (
    (AGENT_STATUS_PRIORITY[state.status] ?? -1) +
    state.attentionLevel * 2 +
    (state.userActionRequired ? 5 : 0)
  );
}

// The dot shown for a Space / sidebar row: the most urgent non-idle state among its panes.
export function strongestAgentStatus(
  states: Array<TerminalAttentionState | null | undefined>,
): TerminalAttentionState | null {
  let best: TerminalAttentionState | null = null;
  for (const state of states) {
    if (!state || agentStatusScore(state) < 0) continue;
    if (!best || agentStatusScore(state) > agentStatusScore(best)) best = state;
  }
  return best;
}
