import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AgentStatusIcon } from "../src/renderer/components/AgentStatusIcon.js";
import type { AgentNavigationState } from "../src/renderer/lib/agentStatus.js";
import { Sidebar, type SidebarWorkspace } from "../src/renderer/components/Sidebar.js";
import {
  monitorStatusByPane,
  agentStatusScore,
  agentStatusVisual,
  strongestAgentStatus,
} from "../src/renderer/lib/agentStatus.js";

function state(overrides: Partial<AgentNavigationState>): AgentNavigationState {
  return {
    sessionId: "session-1",
    status: "idle",
    attentionLevel: 0,
    userActionRequired: false,
    source: "pty",
    lastActivityAt: 1_000,
    ...overrides,
  };
}

const workspaceWith = (tabs: Array<{ id: string; title: string }>): SidebarWorkspace => ({
  id: "workspace-1",
  name: "Home",
  kind: "home",
  tabs: tabs.map((tab) => ({ ...tab, panes: [] })),
  activeTabId: tabs[0]?.id ?? "",
});

describe("agent status visuals", () => {
  it("maps statuses to theme foreground colors", () => {
    expect(agentStatusVisual("thinking")).toEqual({
      className: "text-agent-thinking",
      label: "Thinking",
    });
    expect(agentStatusVisual("waiting_input")).toMatchObject({ label: "Input needed" });
    expect(agentStatusVisual("waiting")).toMatchObject({ label: "Waiting" });
    expect(agentStatusVisual("completed")).toMatchObject({ label: "Completed" });
    expect(agentStatusVisual("failed")).toMatchObject({ label: "Failed" });
    expect(agentStatusVisual("idle")).toMatchObject({ label: "Idle" });
    expect(agentStatusVisual("unknown")).toMatchObject({ label: "Status unknown" });
  });

  it("ranks actionable states above informational ones", () => {
    const waitingInput = state({
      status: "waiting_input",
      attentionLevel: 3,
      userActionRequired: true,
    });
    const thinking = state({ status: "thinking" });
    const failed = state({ status: "failed", attentionLevel: 3, userActionRequired: true });
    const completed = state({ status: "completed", attentionLevel: 1 });
    const idle = state({ status: "idle" });

    expect(agentStatusScore(waitingInput)).toBeGreaterThan(agentStatusScore(failed));
    expect(agentStatusScore(failed)).toBeGreaterThan(agentStatusScore(thinking));
    expect(agentStatusScore(thinking)).toBeGreaterThan(agentStatusScore(completed));

    expect(strongestAgentStatus([thinking, waitingInput, completed])).toBe(waitingInput);
    expect(strongestAgentStatus([completed, thinking])).toBe(thinking);
    expect(strongestAgentStatus([idle, null, undefined])).toBeNull();
  });

  it("keeps the highest-attention problem when several panes are busy", () => {
    const running = state({ status: "running" });
    const warning = state({ status: "warning", attentionLevel: 2, userActionRequired: true });
    expect(strongestAgentStatus([running, warning])).toBe(warning);
  });
});

describe("agent status icons in the Sidebar", () => {
  it("shows agent status icons on workspace and Space rows", () => {
    const workspaces = [
      workspaceWith([
        { id: "tab-1", title: "Builds" },
        { id: "tab-2", title: "Docs" },
      ]),
    ];
    render(
      <Sidebar
        workspaces={workspaces}
        attentionItems={[]}
        attentionHistory={[]}
        agentStatusByTabId={{
          "tab-1": state({
            sessionId: "session-1",
            status: "thinking",
            agentDetected: true,
            lastActivityAt: 2_000,
          }),
        }}
        activeWorkspaceId="workspace-1"
        onOpenWorkspace={() => {}}
        onNewSpace={() => {}}
        onSelectWorkspace={() => {}}
        onSelectTab={() => {}}
        onSelectAttention={() => {}}
        onDismissAttention={() => {}}
        onOpenSettings={() => {}}
      />,
    );

    const dots = screen.getAllByLabelText("Agent status: Thinking");
    expect(dots).toHaveLength(2);
    for (const dot of dots) {
      expect(dot).toHaveAttribute("data-agent-status", "thinking");
    }

    const docsRow = screen.getByRole("button", { name: /Docs/ });
    expect(docsRow.querySelector('[data-session-kind="terminal"]')).not.toBeNull();
    expect(docsRow.querySelector(".lucide-terminal")).not.toBeNull();
  });

  it("shows a terminal icon when no agent is detected", () => {
    const workspaces = [workspaceWith([{ id: "tab-1", title: "Builds" }])];
    render(
      <Sidebar
        workspaces={workspaces}
        attentionItems={[]}
        attentionHistory={[]}
        activeWorkspaceId="workspace-1"
        onOpenWorkspace={() => {}}
        onNewSpace={() => {}}
        onSelectWorkspace={() => {}}
        onSelectTab={() => {}}
        onSelectAttention={() => {}}
        onDismissAttention={() => {}}
        onOpenSettings={() => {}}
      />,
    );

    expect(screen.queryByLabelText(/Agent status:/)).toBeNull();
    expect(screen.getByLabelText("Terminal — no agent detected")).toBeInTheDocument();
    expect(document.querySelector(".rounded-full.bg-foreground")).toBeNull();
  });
});

describe("Monitor session navigation status", () => {
  const session = (
    status: import("../src/shared/monitor.js").MonitorStatus,
    paneId: string | null = "pane-1",
  ) =>
    ({
      status,
      paneId,
      lastActivityAt: 100,
      loading: false,
    }) as import("../src/shared/monitor.js").MonitorSession;
  it("maps session activity, waits, completion and failures", () => {
    for (const [input, output] of [
      ["Thinking", "thinking"],
      ["Executing", "running"],
      ["Waiting", "waiting_input"],
      ["RateLimited", "warning"],
      ["Done", "completed"],
      ["Error", "failed"],
    ] as const) {
      expect(monitorStatusByPane([session(input)])["pane-1"]?.status).toBe(output);
    }
  });
  it("ignores unowned sessions and clears removed sessions", () => {
    expect(monitorStatusByPane([session("Thinking", null)])).toEqual({});
    expect(monitorStatusByPane([])).toEqual({});
  });
  it("retains active work when another agent in the same pane is done", () => {
    expect(monitorStatusByPane([session("Executing"), session("Done")])["pane-1"]?.status).toBe(
      "running",
    );
  });
});

describe("navigation detection and state icons", () => {
  it("keeps detected agents visible while their status is unknown or loading", () => {
    for (const loading of [false, true]) {
      const result = monitorStatusByPane([
        {
          paneId: "pane-1",
          status: loading ? "Thinking" : "Unknown",
          loading,
          lastActivityAt: 100,
        } as import("../src/shared/monitor.js").MonitorSession,
      ]);
      expect(result["pane-1"]).toMatchObject({ status: "unknown", agentDetected: true });
      expect(strongestAgentStatus([result["pane-1"], state({})])).toBe(result["pane-1"]);
    }
  });

  it("does not let unknown agents hide actionable states in another pane", () => {
    const unknown = state({ status: "unknown", agentDetected: true });
    const waiting = state({ status: "waiting_input", agentDetected: true });
    expect(strongestAgentStatus([unknown, waiting])).toBe(waiting);
    expect(strongestAgentStatus([waiting, unknown])).toBe(waiting);
  });

  it.each([
    ["thinking", "Thinking", "lucide-loader-circle", true],
    ["running", "Running", "lucide-loader-circle", true],
    ["waiting", "Waiting", "lucide-clock-3", false],
    ["waiting_input", "Input needed", "lucide-message-circle-question", false],
    ["completed", "Completed", "lucide-circle-check", false],
    ["warning", "Warning", "lucide-triangle-alert", false],
    ["failed", "Failed", "lucide-circle-x", false],
    ["idle", "Idle", "lucide-bot", false],
    ["unknown", "Status unknown", "lucide-bot", false],
  ] as const)("renders %s with its own icon", (status, label, iconClass, spinning) => {
    const { unmount } = render(<AgentStatusIcon state={state({ status, agentDetected: true })} />);
    const icon = screen.getByRole("img", { name: `Agent status: ${label}` });
    expect(icon.querySelector(`.${iconClass}`)).not.toBeNull();
    expect(Boolean(icon.querySelector(".agent-status-spinner"))).toBe(spinning);
    unmount();
  });

  it("does not present ordinary command execution as an agent", () => {
    render(<AgentStatusIcon state={state({ status: "running", source: "shell" })} />);
    const icon = screen.getByRole("img", { name: "Terminal status: Running" });
    expect(icon).toHaveAttribute("data-session-kind", "terminal");
    expect(icon.querySelector(".lucide-terminal")).not.toBeNull();
    expect(icon.querySelector(".agent-status-spinner")).toBeNull();
  });
});
