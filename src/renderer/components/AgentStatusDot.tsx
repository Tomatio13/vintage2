import type { TerminalAttentionState } from "../../shared/desktop.js";
import { agentStatusVisual } from "../lib/agentStatus.js";

export function AgentStatusDot({
  state,
  className = "",
}: {
  state: TerminalAttentionState | null;
  className?: string;
}) {
  if (!state) return null;
  const visual = agentStatusVisual(state.status);
  if (!visual) return null;
  return (
    <span
      aria-label={`Agent status: ${visual.label}`}
      className={`inline-block size-2 shrink-0 rounded-full ${visual.className}${visual.pulse ? " agent-status-pulse" : ""}${className ? ` ${className}` : ""}`}
      data-agent-status={state.status}
      role="img"
      title={visual.label}
    />
  );
}
