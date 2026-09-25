import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { TerminalAttentionState } from "../src/shared/desktop.js";
import { Sidebar, type SidebarWorkspace } from "../src/renderer/components/Sidebar.js";
import {
  agentStatusScore,
  agentStatusVisual,
  strongestAgentStatus,
} from "../src/renderer/lib/agentStatus.js";

function state(overrides: Partial<TerminalAttentionState>): TerminalAttentionState {
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
  it("maps statuses to theme colors with pulses for active work", () => {
    expect(agentStatusVisual("thinking")).toEqual({
      className: "bg-agent-thinking",
      label: "Thinking",
      pulse: true,
    });
    expect(agentStatusVisual("waiting_input")).toMatchObject({ label: "Input needed" });
    expect(agentStatusVisual("waiting")).toMatchObject({ label: "Waiting" });
    expect(agentStatusVisual("completed")).toMatchObject({ label: "Completed" });
    expect(agentStatusVisual("failed")).toMatchObject({ label: "Failed" });
    expect(agentStatusVisual("idle")).toBeNull();
    expect(agentStatusVisual("unknown")).toBeNull();
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

describe("agent status dots in the Sidebar", () => {
  it("shows colored dots on Space rows and replaces the static tab dot", () => {
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
    expect(docsRow.querySelector("[data-agent-status]")).toBeNull();
  });

  it("falls back to the static dot when no agent state exists", () => {
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
    expect(document.querySelector(".rounded-full.bg-foreground")).not.toBeNull();
  });
});
