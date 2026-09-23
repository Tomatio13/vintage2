import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AttentionToast } from "../src/renderer/components/AttentionToast.js";
import {
  Sidebar,
  type SidebarAttentionHistoryItem,
  type SidebarAttentionItem,
} from "../src/renderer/components/Sidebar.js";

const attentionItem = (
  paneId: string,
  attentionLevel: SidebarAttentionItem["attentionLevel"],
): SidebarAttentionItem => ({
  paneId,
  sessionId: `session-${paneId}`,
  paneTitle: `Terminal ${paneId}`,
  tabId: "tab-1",
  tabTitle: "Builds",
  workspaceId: "workspace-1",
  workspaceName: "workspace",
  status: "failed",
  source: "jev",
  attentionLevel,
  reason: "semantic_judgment",
  judgmentConfidence: 0.92,
  judgmentModel: "system-one",
  lastActivityAt: Date.now(),
});

function renderSidebar(attentionItems: SidebarAttentionItem[]) {
  const onSelectAttention = vi.fn();
  const onDismissAttention = vi.fn();
  const history: SidebarAttentionHistoryItem[] = [
    { ...attentionItem("history", 4), id: "history-1", outcome: "resolved" },
  ];
  render(
    <Sidebar
      workspaces={[]}
      attentionItems={attentionItems}
      attentionHistory={history}
      activeWorkspaceId={null}
      onOpenWorkspace={() => {}}
      onNewSpace={() => {}}
      onSelectWorkspace={() => {}}
      onSelectTab={() => {}}
      onSelectAttention={onSelectAttention}
      onDismissAttention={onDismissAttention}
      onOpenSettings={() => {}}
    />,
  );
  return { onSelectAttention, onDismissAttention, history };
}

describe("Attention UI", () => {
  it("keeps every workspace's Spaces visible when switching locations", () => {
    const home = {
      id: "home",
      name: "Home",
      kind: "home" as const,
      tabs: [{ id: "home-space-1", title: "Space 1", panes: [{}] }],
      activeTabId: "home-space-1",
    };
    const project = {
      id: "project",
      name: "new_vintage",
      kind: "project" as const,
      tabs: [
        { id: "project-space-1", title: "Space 1", panes: [{}] },
        { id: "project-space-2", title: "Space 2", panes: [{}] },
      ],
      activeTabId: "project-space-2",
    };
    const onSelectWorkspace = vi.fn();
    const props = {
      workspaces: [home, project],
      attentionItems: [],
      attentionHistory: [],
      onOpenWorkspace: () => {},
      onNewSpace: () => {},
      onSelectWorkspace,
      onSelectTab: () => {},
      onSelectAttention: () => {},
      onDismissAttention: () => {},
      onOpenSettings: () => {},
    };
    const { rerender } = render(<Sidebar {...props} activeWorkspaceId="home" />);

    expect(screen.getAllByText("Space 1", { exact: true })).toHaveLength(2);
    expect(screen.getByText("Space 2", { exact: true })).toBeInTheDocument();
    const initialSpaceButtons = screen.getAllByText("Space 1", { exact: true });
    expect(initialSpaceButtons[0]?.closest("button")).toHaveAttribute("aria-pressed", "true");
    const projectButton = screen.getByText("new_vintage", { exact: true }).closest("button")!;
    fireEvent.click(projectButton);
    expect(onSelectWorkspace).toHaveBeenCalledWith("project");

    rerender(<Sidebar {...props} activeWorkspaceId="project" />);

    expect(screen.getAllByText("Space 1", { exact: true })).toHaveLength(2);
    expect(screen.getByText("Space 2", { exact: true })).toBeInTheDocument();
    const spaceButtons = screen.getAllByText("Space 1", { exact: true });
    expect(spaceButtons[0]?.closest("button")).toHaveAttribute("aria-pressed", "false");
    expect(spaceButtons[1]?.closest("button")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Space 2", { exact: true }).closest("button")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("uses theme-aware foreground colors for Sidebar navigation icons", () => {
    const workspace = {
      id: "workspace-1",
      name: "workspace",
      tabs: [{ id: "tab-1", title: "Space 1", panes: [{}] }],
      activeTabId: "tab-1",
    };
    render(
      <Sidebar
        workspaces={[workspace]}
        attentionItems={[]}
        attentionHistory={[]}
        activeWorkspaceId={workspace.id}
        onOpenWorkspace={() => {}}
        onNewSpace={() => {}}
        onSelectWorkspace={() => {}}
        onSelectTab={() => {}}
        onSelectAttention={() => {}}
        onDismissAttention={() => {}}
        onOpenSettings={() => {}}
      />,
    );

    const sidebar = screen.getByText("Workspace").closest("aside");
    expect(sidebar).not.toBeNull();
    for (const icon of sidebar!.querySelectorAll("button svg")) {
      expect(icon).toHaveClass("text-foreground");
    }
    expect(sidebar!.querySelectorAll(".text-brand, .bg-brand")).toHaveLength(0);
    expect(sidebar!.querySelector("span.bg-foreground")).toBeInTheDocument();
  });

  it("distinguishes all severity levels and exposes source confidence", () => {
    renderSidebar([
      attentionItem("1", 1),
      attentionItem("2", 2),
      attentionItem("3", 3),
      attentionItem("4", 4),
    ]);

    for (const level of ["LOW", "MEDIUM", "HIGH", "CRITICAL"]) {
      expect(screen.getAllByText(level, { selector: "span" })).toHaveLength(
        level === "CRITICAL" ? 2 : 1,
      );
    }
    expect(screen.getAllByText("Source: JEV · 92% confidence · system-one")).toHaveLength(4);
    expect(screen.getByText(/Attention history · 1/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "CRITICAL Terminal history: Failed (resolved)" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "LOW Terminal 1: Failed" }).children[0]).toHaveClass(
      "text-foreground",
    );
    expect(
      screen.getByRole("button", { name: "MEDIUM Terminal 2: Failed" }).children[0],
    ).toHaveClass("text-foreground");
  });

  it("supports arrow-key attention navigation, selection, and dismissal", () => {
    const items = [attentionItem("first", 3), attentionItem("second", 4)];
    const { onSelectAttention, onDismissAttention } = renderSidebar(items);
    const first = screen.getByRole("button", { name: "HIGH Terminal first: Failed" });
    const second = screen.getByRole("button", { name: "CRITICAL Terminal second: Failed" });

    first.focus();
    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(second).toHaveFocus();
    fireEvent.click(second);
    expect(onSelectAttention).toHaveBeenCalledWith(items[1]);

    fireEvent.click(screen.getByRole("button", { name: "Dismiss Terminal second attention" }));
    expect(onDismissAttention).toHaveBeenCalledWith(items[1]);
  });

  it("keeps critical attention persistent, prominent, and actionable", () => {
    const item = attentionItem("critical", 4);
    const onOpen = vi.fn();
    const onDismiss = vi.fn();
    const onClose = vi.fn();
    render(<AttentionToast item={item} onOpen={onOpen} onDismiss={onDismiss} onClose={onClose} />);

    const toast = screen.getByRole("alert", { name: "CRITICAL attention from Terminal critical" });
    expect(toast).toHaveAttribute("data-attention-level", "4");
    expect(screen.getByText("CRITICAL ATTENTION")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open terminal" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open terminal" }));
    expect(onOpen).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("auto-closes high attention after eight seconds despite callback updates", () => {
    vi.useFakeTimers();
    try {
      const item = attentionItem("high", 3);
      const firstClose = vi.fn();
      const latestClose = vi.fn();
      const { rerender } = render(
        <AttentionToast item={item} onOpen={() => {}} onDismiss={() => {}} onClose={firstClose} />,
      );
      act(() => vi.advanceTimersByTime(5_000));
      rerender(
        <AttentionToast item={item} onOpen={() => {}} onDismiss={() => {}} onClose={latestClose} />,
      );
      act(() => vi.advanceTimersByTime(3_000));

      expect(firstClose).not.toHaveBeenCalled();
      expect(latestClose).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
