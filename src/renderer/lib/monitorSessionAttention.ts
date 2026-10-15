import { DEFAULT_TERMINAL_MONITOR_MODE, type TerminalMonitorMode } from "../../shared/desktop.js";
import type { MonitorSession, MonitorSnapshot } from "../../shared/monitor.js";

const working = (session: MonitorSession) =>
  session.status === "Thinking" || session.status === "Executing";
const identity = (session: MonitorSession) =>
  JSON.stringify([
    session.agent,
    session.cwd,
    session.sessionId ?? [session.id, session.pid, session.startedAt],
  ]);

// Waiting also covers a finished response, so never describe it as a confirmed prompt.
export const monitorWaitSummary = "The agent finished responding or is waiting for your input.";
export const monitorProjectName = (cwd: string) =>
  cwd.replaceAll("\\", "/").split("/").filter(Boolean).at(-1) ?? "Unknown project";

export class MonitorSessionTransitions {
  private previous = new Map<string, MonitorSession>();
  private generatedAt = -Infinity;

  update(snapshot: MonitorSnapshot | null): MonitorSession[] {
    if (!snapshot || !snapshot.supported) {
      this.previous.clear();
      this.generatedAt = -Infinity;
      return [];
    }
    if (snapshot.generatedAt <= this.generatedAt) return [];
    this.generatedAt = snapshot.generatedAt;
    const next = new Map<string, MonitorSession>();
    const transitions: MonitorSession[] = [];
    for (const session of snapshot.sessions) {
      if (session.loading || session.status === "Unknown") continue;
      const key = identity(session);
      if (next.has(key)) continue;
      const previous = this.previous.get(key);
      // Regressing log metadata must not turn old Waiting into a new notification.
      if (
        previous?.lastActivityAt != null &&
        session.lastActivityAt != null &&
        session.lastActivityAt < previous.lastActivityAt
      )
        continue;
      next.set(key, session);
      if (previous && working(previous) && session.status === "Waiting") transitions.push(session);
    }
    this.previous = next;
    return transitions;
  }
}

export function sessionNotificationMode(
  session: MonitorSession,
  mode?: TerminalMonitorMode,
): TerminalMonitorMode | null {
  const effective = session.paneId ? (mode ?? DEFAULT_TERMINAL_MONITOR_MODE) : "monitor";
  return effective === "monitor" ||
    effective === "agent_monitor" ||
    effective === "always_notify" ||
    effective === "mute"
    ? effective
    : null;
}

// The terminal heuristics and session log can report the same wait in either order.
const recentWaitToasts = new Map<string, number>();
export function claimWaitToast(paneId: string, now = Date.now()): boolean {
  for (const [key, at] of recentWaitToasts) if (now - at >= 5000) recentWaitToasts.delete(key);
  if (recentWaitToasts.has(paneId)) return false;
  recentWaitToasts.set(paneId, now);
  return true;
}
