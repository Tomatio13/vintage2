import {
  monitorStatusByPane,
  strongestAgentStatus,
  type AgentNavigationState,
} from "./agentStatus.js";
import type { MonitorAgent, MonitorSession } from "../../shared/monitor.js";

export const agentStyle = {
  claude: { name: "Claude Code", badge: "CC", color: "bg-amber-500/10 text-amber-500" },
  codex: { name: "Codex", badge: "CD", color: "bg-cyan-500/10 text-cyan-500" },
  antigravity: { name: "Antigravity", badge: "AG", color: "bg-violet-500/10 text-violet-500" },
  opencode: { name: "OpenCode", badge: "OC", color: "bg-emerald-500/10 text-emerald-500" },
  grok: { name: "Grok", badge: "GK", color: "bg-teal-500/10 text-teal-500" },
  zcode: { name: "ZCode", badge: "ZC", color: "bg-rose-500/10 text-rose-500" },
} satisfies Record<MonitorAgent, { name: string; badge: string; color: string }>;

// Use collector-assigned pane ownership; matching folders alone is ambiguous.
export function monitorAgentsByPane(
  sessions: Pick<MonitorSession, "paneId" | "agent">[],
): Record<string, MonitorAgent[]> {
  const result: Record<string, MonitorAgent[]> = {};
  for (const session of sessions) {
    if (!session.paneId) continue;
    const agents = (result[session.paneId] ??= []);
    if (!agents.includes(session.agent)) agents.push(session.agent);
  }
  return result;
}

export function agentsForPanes(
  paneIds: string[],
  agentsByPane: Record<string, MonitorAgent[]>,
): MonitorAgent[] {
  const detected = new Set(paneIds.flatMap((id) => agentsByPane[id] ?? []));
  return (Object.keys(agentStyle) as MonitorAgent[]).filter((agent) => detected.has(agent));
}

// Aggregate each agent independently so another agent's wait cannot change its badge.
export function agentStatesForPanes(
  paneIds: string[],
  sessions: MonitorSession[],
): Partial<Record<MonitorAgent, AgentNavigationState>> {
  const owners = new Set(paneIds);
  const result: Partial<Record<MonitorAgent, AgentNavigationState>> = {};
  for (const session of sessions) {
    if (!session.paneId || !owners.has(session.paneId)) continue;
    const state = strongestAgentStatus([
      result[session.agent],
      monitorStatusByPane([session])[session.paneId],
    ]);
    if (state) result[session.agent] = state;
  }
  return result;
}
