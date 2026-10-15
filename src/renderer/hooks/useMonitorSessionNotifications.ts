import { useEffect, useRef, useState } from "react";
import { DEFAULT_ATTENTION_SETTINGS, type TerminalAttentionState } from "../../shared/desktop.js";
import type { MonitorSession, MonitorSnapshot } from "../../shared/monitor.js";
import type { SidebarAttentionItem } from "../components/Sidebar.js";
import {
  claimWaitToast,
  MonitorSessionTransitions,
  monitorProjectName,
  monitorWaitSummary,
  sessionNotificationMode,
} from "../lib/monitorSessionAttention.js";

export interface MonitorSessionNotice {
  id: string;
  session: MonitorSession;
  item: SidebarAttentionItem;
}
export function useMonitorSessionNotifications(
  snapshot: MonitorSnapshot | null,
  states: Record<string, TerminalAttentionState>,
  desktopNotifications: boolean,
  enabled = true,
) {
  const tracker = useRef(new MonitorSessionTransitions());
  const [notices, setNotices] = useState<MonitorSessionNotice[]>([]);
  const current = useRef({ states, desktopNotifications, snapshot, enabled });
  current.current = { states, desktopNotifications, snapshot, enabled };
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const transitions = tracker.current.update(snapshot);
    if (!enabled) {
      setNotices([]);
      return;
    }
    for (const session of transitions) {
      void (async () => {
        const bridge = window.desktop;
        const settings = bridge?.getAttentionSettings
          ? await bridge.getAttentionSettings().catch(() => DEFAULT_ATTENTION_SETTINGS)
          : DEFAULT_ATTENTION_SETTINGS;
        if (!mounted.current || !current.current.enabled || current.current.snapshot !== snapshot)
          return;
        const mode = sessionNotificationMode(
          session,
          session.paneId ? current.current.states[session.paneId]?.monitorMode : undefined,
        );
        if (!mode) return;
        const project = monitorProjectName(session.cwd);
        const name =
          session.agent === "zcode"
            ? "ZCode"
            : session.agent === "opencode"
              ? "OpenCode"
              : session.agent === "claude"
                ? "Claude Code"
                : session.agent === "codex"
                  ? "Codex"
                  : session.agent === "grok"
                    ? "Grok"
                    : "Antigravity";
        const id = JSON.stringify(["monitor-wait", session.id, snapshot?.generatedAt]);
        if (
          (mode === "always_notify" || settings.attentionThreshold <= 3) &&
          (!session.paneId || claimWaitToast(session.paneId))
        ) {
          const item: SidebarAttentionItem = {
            paneId: session.paneId ?? "",
            sessionId: session.sessionId ?? session.id,
            paneTitle: name,
            tabId: "monitor",
            tabTitle: "Monitor",
            workspaceId: "",
            workspaceName: project,
            status: "waiting_input",
            source: "session",
            attentionLevel: 3,
            lastActivityAt: session.lastActivityAt ?? Date.now(),
          };
          setNotices((items) => [{ id, session, item }, ...items].slice(0, 4));
        }
        if (
          mode !== "mute" &&
          current.current.desktopNotifications &&
          (mode === "always_notify" || settings.notificationThreshold <= 3) &&
          (mode === "always_notify" || !document.hasFocus())
        ) {
          await bridge
            ?.showAttentionNotification?.({
              title: `VINTAGE · ${name} · ${project}`.slice(0, 120),
              body: monitorWaitSummary,
              dedupeKey: session.paneId ? `input-wait:${session.paneId}` : id.slice(0, 200),
              attentionLevel: 3,
              ...(session.paneId
                ? { targetPaneId: session.paneId }
                : { targetMonitorSessionId: session.id }),
              ...(mode === "always_notify" ? { force: true } : {}),
            })
            .catch(() => {});
        }
      })();
    }
  }, [snapshot, enabled]);
  return {
    notices,
    closeNotice: (id: string) => setNotices((items) => items.filter((item) => item.id !== id)),
  };
}
