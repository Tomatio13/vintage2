import type { MonitorSession, MonitorStatus } from "../src/shared/monitor.js";
import { AgentBadge } from "../src/renderer/components/AgentBadge.js";
import { render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import {
  agentStatesForPanes,
  agentsForPanes,
  monitorAgentsByPane,
} from "../src/renderer/lib/agentIdentity.js";
import { Sidebar } from "../src/renderer/components/Sidebar.js";

vi.mock("../src/renderer/components/SidebarGary.js", () => ({ SidebarGary: () => null }));

it("groups by collector ownership, deduplicates agents and clears departed sessions", () => {
  const sessions = [
    { paneId: "a", agent: "codex", status: "Waiting" },
    { paneId: "a", agent: "codex", status: "Executing" },
    { paneId: "b", agent: "opencode", status: "Thinking" },
    { paneId: "c", agent: "claude", status: "Executing" },
    { paneId: null, agent: "zcode", status: "Unknown" },
  ] as const;
  const byPane = monitorAgentsByPane([...sessions]);
  expect(agentsForPanes(["b", "a"], byPane)).toEqual(["codex", "opencode"]);
  expect(agentsForPanes(["a", "b"], byPane)).toEqual(["codex", "opencode"]);
  expect(agentsForPanes(["other"], byPane)).toEqual([]);
  expect(agentsForPanes(["a", "b"], monitorAgentsByPane([]))).toEqual([]);
});

it("shows agent identities beside the correct Space and updates when agents exit", () => {
  const noop = () => {};
  const props = {
    workspaces: [
      {
        id: "project",
        name: "Project",
        kind: "project" as const,
        tabs: [
          { id: "one", title: "Space 1", panes: [] },
          { id: "two", title: "Space 2", panes: [] },
        ],
        activeTabId: "one",
      },
    ],
    activeWorkspaceId: "project",
    attentionItems: [],
    attentionHistory: [],
    onOpenWorkspace: noop,
    onNewSpace: noop,
    onSelectWorkspace: noop,
    onSelectTab: noop,
    onSelectAttention: noop,
    onDismissAttention: noop,
    onOpenSettings: noop,
  };
  const { rerender } = render(
    <Sidebar {...props} agentsByTabId={{ one: ["codex", "opencode"] }} />,
  );
  const one = screen.getByRole("button", { name: "Space 1" });
  expect(within(one).getByLabelText("Codex · Status unknown")).toHaveTextContent("CD");
  expect(within(one).getByLabelText("OpenCode · Status unknown")).toHaveTextContent("OC");
  expect(within(screen.getByRole("button", { name: "Space 2" })).queryByText("CD")).toBeNull();
  rerender(<Sidebar {...props} agentsByTabId={{}} />);
  expect(within(one).queryByText("CD")).toBeNull();
});

const session = (
  status: MonitorStatus,
  overrides: Partial<MonitorSession> = {},
): MonitorSession => ({
  id: "zcode:123",
  agent: "zcode",
  pid: 123,
  sessionId: "session-1",
  cwd: "/repo/project",
  model: null,
  status,
  currentTool: null,
  tools: [],
  contextTokens: null,
  contextWindow: null,
  contextEstimated: false,
  inputTokens: 0,
  outputTokens: 0,
  cacheTokens: 0,
  tokensPerSecond: null,
  startedAt: 1,
  lastActivityAt: 100,
  loading: false,
  paneId: null,
  ...overrides,
});

it("keeps statuses independent by agent even inside the same pane", () => {
  const sessions = [
    session("Executing", { agent: "codex", paneId: "a" }),
    session("Waiting", { agent: "opencode", paneId: "a" }),
    session("Done", { agent: "codex", paneId: "b" }),
    session("Error", { agent: "codex", paneId: "elsewhere" }),
    session("Waiting", { agent: "claude", paneId: null }),
  ];
  const states = agentStatesForPanes(["a", "b"], sessions);
  expect(states.codex?.status).toBe("running");
  expect(states.opencode?.status).toBe("waiting_input");
  expect(states.claude).toBeUndefined();
  expect(agentStatesForPanes(["a", "b"], [...sessions].reverse())).toEqual(states);
  expect(agentStatesForPanes(["a"], [])).toEqual({});
  expect(agentStatesForPanes(["b"], sessions).codex?.status).toBe("completed");
});

it("prioritizes input waits within an agent and treats loading as unknown", () => {
  const sessions = [
    session("Executing", { agent: "codex", paneId: "a" }),
    session("Waiting", { agent: "codex", paneId: "b" }),
  ];
  expect(agentStatesForPanes(["a", "b"], sessions).codex?.status).toBe("waiting_input");
  expect(
    agentStatesForPanes(["a"], [session("Waiting", { agent: "codex", paneId: "a", loading: true })])
      .codex?.status,
  ).toBe("unknown");
});

it("changes the badge frame and tooltip without changing agent identity", () => {
  const state = (status: MonitorStatus) =>
    agentStatesForPanes(["a"], [session(status, { agent: "codex", paneId: "a" })]).codex;
  const { rerender } = render(<AgentBadge agent="codex" state={state("Executing")} />);
  expect(screen.getByLabelText("Codex · Running")).toHaveClass(
    "agent-badge-working",
    "text-cyan-500",
  );
  rerender(<AgentBadge agent="codex" state={state("Waiting")} />);
  expect(screen.getByLabelText("Codex · Input needed")).toHaveClass("ring-1", "ring-current/75");
  expect(screen.getByLabelText("Codex · Input needed")).not.toHaveClass("agent-badge-working");
  rerender(<AgentBadge agent="codex" state={state("Done")} />);
  expect(screen.getByLabelText("Codex · Completed")).toHaveClass("opacity-45");
  expect(screen.getByLabelText("Codex · Completed")).toHaveTextContent("CD");
});
