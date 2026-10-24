import type { MonitorAgent } from "../../shared/monitor.js";
import { agentStyle } from "../lib/agentIdentity.js";
import { agentStatusVisual, type AgentNavigationState } from "../lib/agentStatus.js";

export function AgentBadge({
  agent,
  state,
}: {
  agent: MonitorAgent;
  state: AgentNavigationState | undefined;
}) {
  const status = state?.status ?? "unknown";
  const label = `${agentStyle[agent].name} · ${agentStatusVisual(status).label}`;
  const appearance =
    status === "thinking" || status === "running"
      ? "agent-badge-working ring-1 ring-current/50"
      : status === "waiting_input" ||
          status === "waiting" ||
          status === "failed" ||
          status === "warning"
        ? "ring-1 ring-current/75"
        : status === "completed"
          ? "opacity-45"
          : "";
  return (
    <span
      title={label}
      aria-label={label}
      data-agent-status={status}
      className={`relative rounded px-1 py-0.5 font-mono text-[10px] font-semibold ${agentStyle[agent].color} ${appearance}`}
    >
      {agentStyle[agent].badge}
    </span>
  );
}
