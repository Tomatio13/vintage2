import {
  Bot,
  CircleCheck,
  CircleX,
  Clock3,
  LoaderCircle,
  MessageCircleQuestion,
  Terminal,
  TriangleAlert,
} from "lucide-react";
import { agentStatusVisual, type AgentNavigationState } from "../lib/agentStatus.js";

const statusIcons = {
  thinking: LoaderCircle,
  running: LoaderCircle,
  waiting: Clock3,
  waiting_input: MessageCircleQuestion,
  completed: CircleCheck,
  warning: TriangleAlert,
  failed: CircleX,
  idle: Bot,
  unknown: Bot,
};

export function AgentStatusIcon({
  state,
  id,
  showTerminal = false,
  className = "",
}: {
  state: AgentNavigationState | null;
  id?: string;
  showTerminal?: boolean;
  className?: string;
}) {
  if (!state && !showTerminal) return null;
  const isAgent = state?.agentDetected === true;
  const visual = state ? agentStatusVisual(state.status) : null;
  const Icon = isAgent && state ? statusIcons[state.status] : Terminal;
  const spinning = isAgent && (state?.status === "thinking" || state?.status === "running");
  const label = visual
    ? `${isAgent ? "Agent" : "Terminal"} status: ${visual.label}`
    : "Terminal — no agent detected";
  return (
    <span
      id={id}
      aria-label={label}
      className={`inline-flex size-3.5 shrink-0 items-center justify-center ${visual?.className ?? "text-foreground-subtle"}${className ? ` ${className}` : ""}`}
      data-agent-status={state?.status}
      data-session-kind={isAgent ? "agent" : "terminal"}
      role="img"
      title={label}
    >
      <Icon aria-hidden="true" className={`size-3.5${spinning ? " agent-status-spinner" : ""}`} />
    </span>
  );
}
