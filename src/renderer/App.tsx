import { Check, CircleAlert, FolderOpen, OctagonAlert, Plus, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { RegisteredWorkspace, TerminalAttentionState } from "../shared/desktop.js";
import { Button } from "./components/Button.js";
import { AttentionToast } from "./components/AttentionToast.js";
import { FileViewer } from "./components/FileViewer.js";
import { ResizeHandle } from "./components/ResizeHandle.js";
import { SettingsDialog } from "./components/SettingsDialog.js";
import { SidePane } from "./components/SidePane.js";
import {
  Sidebar,
  type SidebarAttentionHistoryItem,
  type SidebarAttentionItem,
} from "./components/Sidebar.js";
import { TerminalPanel } from "./components/TerminalPanel.js";
import { WindowFrame } from "./components/WindowFrame.js";
import { type ShortcutAction, useUiStore } from "./store/uiStore.js";

type TerminalPane = { id: string; title: string; kind: "terminal" };
type FilePane = { id: string; title: string; kind: "file"; path: string };
type Pane = TerminalPane | FilePane;
type PaneLayout =
  | { type: "pane"; paneId: string }
  | { type: "split"; axis: "horizontal" | "vertical"; first: PaneLayout; second: PaneLayout };
type Tab = {
  id: string;
  title: string;
  panes: Pane[];
  layout: PaneLayout;
  activePaneId: string;
};
type VintageWorkspace = RegisteredWorkspace & { tabs: Tab[]; activeTabId: string };
type ToastAttentionItem = { id: string; item: SidebarAttentionItem };

const MAX_PANES = 64;
const MAX_LAYOUT_DEPTH = 8;
const id = () => crypto.randomUUID();

function nextNumberedTitle(prefix: string, titles: string[]): string {
  const pattern = new RegExp(`^${prefix} (\\d+)$`);
  const highestNumber = titles.reduce((highest, title) => {
    const match = pattern.exec(title);
    return Math.max(highest, match ? Number(match[1]) : 0);
  }, 0);
  return `${prefix} ${highestNumber + 1}`;
}

function createSpace(title: string): Tab {
  const pane: TerminalPane = { id: id(), title: "Terminal 1", kind: "terminal" };
  return {
    id: id(),
    title,
    panes: [pane],
    layout: { type: "pane", paneId: pane.id },
    activePaneId: pane.id,
  };
}

function strongestAttention(
  tab: Tab,
  states: Record<string, TerminalAttentionState>,
): TerminalAttentionState | null {
  return (
    tab.panes
      .map((pane) => states[pane.id])
      .filter((state): state is TerminalAttentionState => Boolean(state))
      .sort((left, right) => right.attentionLevel - left.attentionLevel)[0] ?? null
  );
}

function collectAttentionItems(
  workspaces: VintageWorkspace[],
  states: Record<string, TerminalAttentionState>,
): SidebarAttentionItem[] {
  const items: SidebarAttentionItem[] = [];
  for (const workspace of workspaces) {
    for (const tab of workspace.tabs) {
      for (const pane of tab.panes) {
        const state = states[pane.id];
        if (!state || state.attentionLevel === 0) continue;
        items.push({
          paneId: pane.id,
          paneTitle: pane.title,
          tabId: tab.id,
          tabTitle: tab.title,
          workspaceId: workspace.id,
          workspaceName: workspace.name,
          status: state.status,
          ...(state.reason === undefined ? {} : { reason: state.reason }),
          ...(state.durationMs === undefined ? {} : { durationMs: state.durationMs }),
          ...(state.judgmentConfidence === undefined
            ? {}
            : { judgmentConfidence: state.judgmentConfidence }),
          ...(state.judgmentModel === undefined ? {} : { judgmentModel: state.judgmentModel }),
          attentionLevel: state.attentionLevel,
          source: state.source,
          sessionId: state.sessionId,
          lastActivityAt: state.lastActivityAt,
        });
      }
    }
  }
  return items.sort(
    (left, right) =>
      right.attentionLevel - left.attentionLevel ||
      right.lastActivityAt - left.lastActivityAt ||
      left.paneTitle.localeCompare(right.paneTitle),
  );
}

function sidebarItemForState(
  workspaces: VintageWorkspace[],
  paneId: string,
  state: TerminalAttentionState,
): SidebarAttentionItem | null {
  if (state.attentionLevel === 0) return null;
  for (const workspace of workspaces) {
    for (const tab of workspace.tabs) {
      const pane = tab.panes.find((item) => item.id === paneId);
      if (!pane) continue;
      return {
        paneId,
        sessionId: state.sessionId,
        paneTitle: pane.title,
        tabId: tab.id,
        tabTitle: tab.title,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        status: state.status,
        source: state.source,
        attentionLevel: state.attentionLevel,
        ...(state.reason === undefined ? {} : { reason: state.reason }),
        ...(state.durationMs === undefined ? {} : { durationMs: state.durationMs }),
        ...(state.judgmentConfidence === undefined
          ? {}
          : { judgmentConfidence: state.judgmentConfidence }),
        ...(state.judgmentModel === undefined ? {} : { judgmentModel: state.judgmentModel }),
        lastActivityAt: state.lastActivityAt,
      };
    }
  }
  return null;
}

function attentionEventId(state: TerminalAttentionState): string {
  return JSON.stringify([
    state.sessionId,
    state.status,
    state.reason ?? null,
    state.semanticHash ?? null,
    state.lastExitCode ?? null,
    state.lastActivityAt,
  ]);
}

function TabAttentionBadge({ state }: { state: TerminalAttentionState | null }) {
  if (!state || state.attentionLevel === 0) return null;
  const label = ["", "LOW", "MEDIUM", "HIGH", "CRITICAL"][state.attentionLevel]!;
  const Icon =
    state.attentionLevel === 1
      ? Check
      : state.attentionLevel === 2
        ? TriangleAlert
        : state.attentionLevel === 3
          ? CircleAlert
          : OctagonAlert;
  const color =
    state.attentionLevel === 1
      ? "text-brand"
      : state.attentionLevel === 2
        ? "text-warning"
        : "text-destructive";
  return (
    <span
      aria-label={`${label} attention: ${state.status}`}
      className={`${color} ${state.attentionLevel === 4 ? "rounded-full bg-destructive/15 p-0.5" : ""}`}
      data-attention-level={state.attentionLevel}
      title={state.status.replace("_", " ")}
    >
      <Icon aria-hidden="true" className="size-3.5" />
    </span>
  );
}

function paneIds(layout: PaneLayout): string[] {
  if (layout.type === "pane") return [layout.paneId];
  return [...paneIds(layout.first), ...paneIds(layout.second)];
}

function splitPaneLayout(
  layout: PaneLayout,
  targetPaneId: string,
  newPaneId: string,
  axis: "horizontal" | "vertical",
  depth = 0,
): PaneLayout | null {
  if (layout.type === "pane") {
    if (layout.paneId !== targetPaneId || depth >= MAX_LAYOUT_DEPTH) return null;
    return {
      type: "split",
      axis,
      first: layout,
      second: { type: "pane", paneId: newPaneId },
    };
  }
  const first = splitPaneLayout(layout.first, targetPaneId, newPaneId, axis, depth + 1);
  if (first) return { ...layout, first };
  const second = splitPaneLayout(layout.second, targetPaneId, newPaneId, axis, depth + 1);
  return second ? { ...layout, second } : null;
}

function removePaneFromLayout(layout: PaneLayout, paneId: string): PaneLayout | null {
  if (layout.type === "pane") return layout.paneId === paneId ? null : layout;
  const first = removePaneFromLayout(layout.first, paneId);
  const second = removePaneFromLayout(layout.second, paneId);
  if (!first) return second;
  if (!second) return first;
  return { ...layout, first, second };
}

type PaneBounds = {
  leftPercent: number;
  leftPixels: number;
  topPercent: number;
  topPixels: number;
  widthPercent: number;
  widthPixels: number;
  heightPercent: number;
  heightPixels: number;
};

type PositionedPane = { paneId: string; bounds: PaneBounds };

const PANE_GAP_PIXELS = 4;
const ROOT_PANE_BOUNDS: PaneBounds = {
  leftPercent: 0,
  leftPixels: 0,
  topPercent: 0,
  topPixels: 0,
  widthPercent: 100,
  widthPixels: 0,
  heightPercent: 100,
  heightPixels: 0,
};

function positionedPanes(layout: PaneLayout, bounds = ROOT_PANE_BOUNDS): PositionedPane[] {
  if (layout.type === "pane") return [{ paneId: layout.paneId, bounds }];
  if (layout.axis === "horizontal") {
    const widthPercent = bounds.widthPercent / 2;
    const widthPixels = (bounds.widthPixels - PANE_GAP_PIXELS) / 2;
    return [
      ...positionedPanes(layout.first, { ...bounds, widthPercent, widthPixels }),
      ...positionedPanes(layout.second, {
        ...bounds,
        leftPercent: bounds.leftPercent + widthPercent,
        leftPixels: bounds.leftPixels + widthPixels + PANE_GAP_PIXELS,
        widthPercent,
        widthPixels,
      }),
    ];
  }
  const heightPercent = bounds.heightPercent / 2;
  const heightPixels = (bounds.heightPixels - PANE_GAP_PIXELS) / 2;
  return [
    ...positionedPanes(layout.first, { ...bounds, heightPercent, heightPixels }),
    ...positionedPanes(layout.second, {
      ...bounds,
      topPercent: bounds.topPercent + heightPercent,
      topPixels: bounds.topPixels + heightPixels + PANE_GAP_PIXELS,
      heightPercent,
      heightPixels,
    }),
  ];
}

function cssLength(percent: number, pixels: number): string {
  if (pixels === 0) return `${percent}%`;
  const operator = pixels < 0 ? "-" : "+";
  return `calc(${percent}% ${operator} ${Math.abs(pixels)}px)`;
}

function PaneView({
  workspaceId,
  tab,
  pane,
  bounds,
  visible,
  onClosePane,
  onActivatePane,
  onRenamePane,
  onAttentionChange,
}: {
  workspaceId: string;
  tab: Tab;
  pane: Pane;
  bounds: PaneBounds;
  visible: boolean;
  onClosePane(paneId: string): void;
  onActivatePane(paneId: string): void;
  onRenamePane(paneId: string, title: string): void;
  onAttentionChange(paneId: string, state: TerminalAttentionState | null): void;
}) {
  const active = pane.id === tab.activePaneId;
  return (
    <div
      data-pane-kind={pane.kind}
      className={`absolute flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border bg-background ${active ? "border-pane-active-border" : "border-border"}`}
      onMouseDown={() => onActivatePane(pane.id)}
      style={{
        left: cssLength(bounds.leftPercent, bounds.leftPixels),
        top: cssLength(bounds.topPercent, bounds.topPixels),
        width: cssLength(bounds.widthPercent, bounds.widthPixels),
        height: cssLength(bounds.heightPercent, bounds.heightPixels),
      }}
    >
      {pane.kind === "terminal" ? (
        <TerminalPanel
          active={visible && active}
          paneId={pane.id}
          tabTitle={tab.title}
          workspaceId={workspaceId}
          title={pane.title}
          onAttentionChange={onAttentionChange}
          onRename={(title) => onRenamePane(pane.id, title)}
        />
      ) : (
        <FileViewer
          workspaceId={workspaceId}
          path={pane.path}
          onClose={() => onClosePane(pane.id)}
        />
      )}
      <button
        aria-label={`Close ${pane.title}`}
        className="absolute right-2 top-1 z-20 grid size-7 place-items-center rounded-md text-foreground transition-colors hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
        title={`Close ${pane.title}`}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onClosePane(pane.id);
        }}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

function TabSurface({
  workspaceId,
  tab,
  visible,
  onClosePane,
  onActivatePane,
  onRenamePane,
  onAttentionChange,
}: {
  workspaceId: string;
  tab: Tab;
  visible: boolean;
  onClosePane(paneId: string): void;
  onActivatePane(paneId: string): void;
  onRenamePane(paneId: string, title: string): void;
  onAttentionChange(paneId: string, state: TerminalAttentionState | null): void;
}) {
  const positions = new Map(positionedPanes(tab.layout).map((item) => [item.paneId, item.bounds]));
  return (
    <section
      aria-hidden={!visible}
      className={`absolute inset-0 p-1 ${visible ? "" : "invisible pointer-events-none"}`}
    >
      <div className="relative h-full min-h-0 min-w-0 overflow-hidden rounded-xl bg-panel-divider">
        {tab.panes.map((pane) => {
          const bounds = positions.get(pane.id);
          if (!bounds) return null;
          return (
            <PaneView
              key={pane.id}
              workspaceId={workspaceId}
              tab={tab}
              pane={pane}
              bounds={bounds}
              visible={visible}
              onClosePane={onClosePane}
              onActivatePane={onActivatePane}
              onRenamePane={onRenamePane}
              onAttentionChange={onAttentionChange}
            />
          );
        })}
      </div>
    </section>
  );
}

export function App() {
  const ui = useUiStore();
  const [workspaces, setWorkspaces] = useState<VintageWorkspace[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [homeLoadStatus, setHomeLoadStatus] = useState<"idle" | "loading" | "failed">(() =>
    window.desktop?.getHomeWorkspace ? "loading" : "idle",
  );
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [tabTitleDraft, setTabTitleDraft] = useState("");
  const [attentionByPane, setAttentionByPane] = useState<Record<string, TerminalAttentionState>>(
    {},
  );
  const [attentionHistory, setAttentionHistory] = useState<SidebarAttentionHistoryItem[]>([]);
  const [attentionToasts, setAttentionToasts] = useState<ToastAttentionItem[]>([]);
  const seenAttentionEventsRef = useRef(new Set<string>());
  const activeAttentionEventByPaneRef = useRef(new Map<string, string>());
  const pendingAttentionDismissalsRef = useRef(new Set<string>());
  const notificationNavigateRef = useRef<(paneId: string) => void>(() => {});
  const homeWorkspaceRequestRef = useRef<Promise<RegisteredWorkspace> | null>(null);
  const userSelectedWorkspaceRef = useRef(false);
  const active = workspaces.find((workspace) => workspace.id === activeId) ?? null;
  const attentionItems = collectAttentionItems(workspaces, attentionByPane);

  useEffect(() => {
    const getHomeWorkspace = window.desktop?.getHomeWorkspace;
    if (!getHomeWorkspace) return;
    let cancelled = false;
    homeWorkspaceRequestRef.current ??= getHomeWorkspace();
    void homeWorkspaceRequestRef.current
      .then((home) => {
        if (cancelled) return;
        const firstSpace = createSpace("Space 1");
        const workspace: VintageWorkspace = {
          ...home,
          tabs: [firstSpace],
          activeTabId: firstSpace.id,
        };
        setWorkspaces((items) =>
          items.some((item) => item.id === home.id) ? items : [workspace, ...items],
        );
        if (!userSelectedWorkspaceRef.current) setActiveId(home.id);
        setHomeLoadStatus("idle");
      })
      .catch(() => {
        if (cancelled) return;
        setHomeLoadStatus("failed");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const dark =
      ui.theme === "dark" ||
      ui.theme === "graphite" ||
      (ui.theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.classList.toggle("graphite", ui.theme === "graphite");
    document.documentElement.style.setProperty("--ui-font-size", `${ui.uiFontSize}px`);
  }, [ui.theme, ui.uiFontSize]);

  const update = (fn: (workspace: VintageWorkspace) => VintageWorkspace) => {
    if (active)
      setWorkspaces((items) => items.map((item) => (item.id === active.id ? fn(item) : item)));
  };
  const openWorkspace = async () => {
    const chosen = await window.desktop?.chooseWorkspace();
    if (!chosen) return;
    userSelectedWorkspaceRef.current = true;
    const existing = workspaces.find((item) => item.id === chosen.id);
    if (existing) return setActiveId(existing.id);
    const workspace: VintageWorkspace = {
      ...chosen,
      tabs: [createSpace("Space 1")],
      activeTabId: "",
    };
    workspace.activeTabId = workspace.tabs[0]!.id;
    setWorkspaces((items) => [...items, workspace]);
    setActiveId(workspace.id);
  };
  const addSpace = () =>
    update((workspace) => {
      const title = nextNumberedTitle(
        "Space",
        workspace.tabs.map((tab) => tab.title),
      );
      const next = createSpace(title);
      return { ...workspace, tabs: [...workspace.tabs, next], activeTabId: next.id };
    });
  const closeTab = (tabId: string) =>
    update((workspace) => {
      const tabs = workspace.tabs.filter((item) => item.id !== tabId);
      return {
        ...workspace,
        tabs,
        activeTabId:
          workspace.activeTabId === tabId ? (tabs.at(-1)?.id ?? "") : workspace.activeTabId,
      };
    });
  const split = (direction: "right" | "down") =>
    update((workspace) => {
      const tab = workspace.tabs.find((item) => item.id === workspace.activeTabId);
      if (!tab || tab.panes.length >= MAX_PANES) return workspace;
      const pane: TerminalPane = {
        id: id(),
        title: nextNumberedTitle(
          "Terminal",
          tab.panes.map((item) => item.title),
        ),
        kind: "terminal",
      };
      const layout = splitPaneLayout(
        tab.layout,
        tab.activePaneId,
        pane.id,
        direction === "right" ? "horizontal" : "vertical",
      );
      if (!layout) return workspace;
      return {
        ...workspace,
        tabs: workspace.tabs.map((item) =>
          item.id === tab.id
            ? { ...item, panes: [...item.panes, pane], layout, activePaneId: pane.id }
            : item,
        ),
      };
    });
  const activatePane = (workspaceId: string, tabId: string, paneId: string) =>
    setWorkspaces((items) =>
      items.map((workspace) =>
        workspace.id !== workspaceId
          ? workspace
          : {
              ...workspace,
              tabs: workspace.tabs.map((tab) =>
                tab.id === tabId ? { ...tab, activePaneId: paneId } : tab,
              ),
            },
      ),
    );
  const renamePane = (workspaceId: string, tabId: string, paneId: string, title: string) =>
    setWorkspaces((items) =>
      items.map((workspace) =>
        workspace.id !== workspaceId
          ? workspace
          : {
              ...workspace,
              tabs: workspace.tabs.map((tab) => {
                if (tab.id !== tabId) return tab;
                const pane = tab.panes.find((item) => item.id === paneId);
                if (!pane) return tab;
                return {
                  ...tab,
                  title: tab.title === pane.title ? title : tab.title,
                  panes: tab.panes.map((item) => (item.id === paneId ? { ...item, title } : item)),
                };
              }),
            },
      ),
    );
  const closePane = (workspaceId: string, tabId: string, paneId: string) =>
    setWorkspaces((items) =>
      items.map((workspace) => {
        if (workspace.id !== workspaceId) return workspace;
        const tabIndex = workspace.tabs.findIndex((tab) => tab.id === tabId);
        if (tabIndex < 0) return workspace;
        const tab = workspace.tabs[tabIndex]!;
        const layout = removePaneFromLayout(tab.layout, paneId);
        if (!layout) {
          const tabs = workspace.tabs.filter((item) => item.id !== tabId);
          return {
            ...workspace,
            tabs,
            activeTabId:
              workspace.activeTabId === tabId ? (tabs.at(-1)?.id ?? "") : workspace.activeTabId,
          };
        }
        const remaining = new Set(paneIds(layout));
        const activePaneId = remaining.has(tab.activePaneId)
          ? tab.activePaneId
          : paneIds(layout)[0]!;
        return {
          ...workspace,
          tabs: workspace.tabs.map((item) =>
            item.id === tabId
              ? {
                  ...item,
                  panes: item.panes.filter((pane) => remaining.has(pane.id)),
                  layout,
                  activePaneId,
                }
              : item,
          ),
        };
      }),
    );
  const openFile = (path: string) =>
    update((workspace) => {
      const tab = workspace.tabs.find((item) => item.id === workspace.activeTabId);
      if (!tab || tab.panes.length >= MAX_PANES) return workspace;
      const existing = tab.panes.find((pane) => pane.kind === "file" && pane.path === path);
      if (existing) {
        return {
          ...workspace,
          tabs: workspace.tabs.map((item) =>
            item.id === tab.id ? { ...item, activePaneId: existing.id } : item,
          ),
        };
      }
      const pane: FilePane = {
        id: id(),
        title: path.split("/").at(-1) ?? path,
        kind: "file",
        path,
      };
      const layout: PaneLayout = {
        type: "split",
        axis: "horizontal",
        first: tab.layout,
        second: { type: "pane", paneId: pane.id },
      };
      return {
        ...workspace,
        tabs: workspace.tabs.map((item) =>
          item.id === tab.id
            ? { ...item, panes: [...item.panes, pane], layout, activePaneId: pane.id }
            : item,
        ),
      };
    });
  const moveTab = (delta: number) =>
    update((workspace) => {
      const index = workspace.tabs.findIndex((tab) => tab.id === workspace.activeTabId);
      if (index < 0 || workspace.tabs.length < 2) return workspace;
      const next = (index + delta + workspace.tabs.length) % workspace.tabs.length;
      return { ...workspace, activeTabId: workspace.tabs[next]!.id };
    });
  const movePane = (delta: number) =>
    update((workspace) => ({
      ...workspace,
      tabs: workspace.tabs.map((tab) => {
        if (tab.id !== workspace.activeTabId || tab.panes.length < 2) return tab;
        const panes = paneIds(tab.layout);
        const index = panes.indexOf(tab.activePaneId);
        const next = (index + delta + panes.length) % panes.length;
        return { ...tab, activePaneId: panes[next]! };
      }),
    }));
  const moveWorkspace = (delta: number) => {
    if (!active || workspaces.length < 2) return;
    const index = workspaces.findIndex((workspace) => workspace.id === active.id);
    setActiveId(workspaces[(index + delta + workspaces.length) % workspaces.length]!.id);
  };
  const runShortcut = (action: ShortcutAction) => {
    switch (action) {
      case "previous-tab":
        return moveTab(-1);
      case "next-tab":
        return moveTab(1);
      case "previous-pane":
        return movePane(-1);
      case "next-pane":
        return movePane(1);
      case "previous-workspace":
        return moveWorkspace(-1);
      case "next-workspace":
        return moveWorkspace(1);
      case "new-terminal":
        return addSpace();
      case "split-right":
        return split("right");
      case "split-down":
        return split("down");
      case "toggle-sidebar":
        return ui.toggleSidebar();
      case "close-pane": {
        const tab = active?.tabs.find((item) => item.id === active.activeTabId);
        if (active && tab && tab.panes.length) closePane(active.id, tab.id, tab.activePaneId);
      }
    }
  };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (ui.settingsOpen || event.defaultPrevented || event.metaKey) return;
      const element = event.target instanceof Element ? event.target : null;
      if (
        element?.closest("input, select, textarea, [contenteditable=true]") &&
        !element.closest(".xterm")
      )
        return;
      const arrows: Record<string, string> = {
        ArrowLeft: "left",
        ArrowRight: "right",
        ArrowUp: "up",
        ArrowDown: "down",
      };
      const key = arrows[event.key] ?? event.key.toLowerCase();
      const binding = ui.shortcuts.find(
        (item) =>
          item.key === key &&
          item.ctrl === event.ctrlKey &&
          item.alt === event.altKey &&
          item.shift === event.shiftKey,
      );
      if (!binding) return;
      event.preventDefault();
      event.stopPropagation();
      runShortcut(binding.action);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [ui.settingsOpen, ui.shortcuts, active, workspaces]);

  const finishAttentionHistory = (id: string, outcome: SidebarAttentionHistoryItem["outcome"]) => {
    setAttentionHistory((items) =>
      items.map((item) =>
        item.id === id && item.outcome === "active"
          ? { ...item, outcome, completedAt: Date.now() }
          : item,
      ),
    );
    setAttentionToasts((items) => items.filter((item) => item.id !== id));
  };

  const updateAttention = (paneId: string, state: TerminalAttentionState | null) => {
    setAttentionByPane((current) => {
      if (state && state.attentionLevel > 0) return { ...current, [paneId]: state };
      if (!(paneId in current)) return current;
      const next = { ...current };
      delete next[paneId];
      return next;
    });

    const activeEventId = activeAttentionEventByPaneRef.current.get(paneId);
    if (!state || state.attentionLevel === 0) {
      if (!activeEventId) return;
      activeAttentionEventByPaneRef.current.delete(paneId);
      const dismissed = pendingAttentionDismissalsRef.current.delete(paneId);
      finishAttentionHistory(
        activeEventId,
        dismissed ? "dismissed" : state ? "resolved" : "closed",
      );
      return;
    }

    const nextEventId = attentionEventId(state);
    if (activeEventId && activeEventId !== nextEventId) {
      finishAttentionHistory(activeEventId, "resolved");
    }
    activeAttentionEventByPaneRef.current.set(paneId, nextEventId);
    if (seenAttentionEventsRef.current.has(nextEventId)) return;
    const item = sidebarItemForState(workspaces, paneId, state);
    if (!item) return;

    seenAttentionEventsRef.current.add(nextEventId);
    while (seenAttentionEventsRef.current.size > 500) {
      const oldest = seenAttentionEventsRef.current.values().next().value;
      if (oldest === undefined) break;
      seenAttentionEventsRef.current.delete(oldest);
    }
    setAttentionHistory((items) =>
      [{ ...item, id: nextEventId, outcome: "active" as const }, ...items].slice(0, 100),
    );
    if (state.attentionLevel >= 3) {
      setAttentionToasts((items) => {
        const next = [
          { id: nextEventId, item },
          ...items.filter((toast) => toast.id !== nextEventId),
        ];
        return next.length <= 4 ? next : next.slice(0, 4);
      });
    }
  };

  const commitTabTitle = (tabId: string) => {
    const title = tabTitleDraft.trim();
    setEditingTabId(null);
    if (!title) return;
    update((workspace) => ({
      ...workspace,
      tabs: workspace.tabs.map((tab) => (tab.id === tabId ? { ...tab, title } : tab)),
    }));
  };

  const topContent = (
    <div className="workspace-tab-strip window-no-drag flex min-w-0 items-end overflow-x-auto overflow-y-hidden px-2 pt-1">
      {active?.tabs.map((tab) => (
        <div
          className="workspace-tab flex shrink-0 items-center gap-1.5 px-3 text-ui-sm"
          data-active={tab.id === active.activeTabId}
          key={tab.id}
        >
          <TabAttentionBadge state={strongestAttention(tab, attentionByPane)} />
          {editingTabId === tab.id ? (
            <input
              autoFocus
              aria-label="Rename tab"
              className="h-6 w-32 rounded border border-input-border bg-input px-1 text-ui-sm text-foreground outline-none focus:border-input-border-focused"
              value={tabTitleDraft}
              onBlur={() => commitTabTitle(tab.id)}
              onChange={(event) => setTabTitleDraft(event.target.value)}
              onFocus={(event) => event.currentTarget.select()}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") setEditingTabId(null);
              }}
            />
          ) : (
            <button
              className="h-full min-w-20 max-w-40 truncate text-left"
              title="Double-click to rename tab"
              onClick={() => update((workspace) => ({ ...workspace, activeTabId: tab.id }))}
              onDoubleClick={() => {
                setTabTitleDraft(tab.title);
                setEditingTabId(tab.id);
              }}
            >
              {tab.title}
            </button>
          )}
          <button
            aria-label={`Close ${tab.title} tab`}
            className="workspace-tab-close rounded-full p-0.5 hover:bg-hover"
            onClick={() => closeTab(tab.id)}
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
      <Button
        aria-label="New space"
        className="mb-0.5 size-7"
        size="icon"
        variant="ghost"
        onClick={addSpace}
      >
        <Plus />
      </Button>
    </div>
  );

  const selectLocation = (workspaceId: string, tabId: string, paneId: string) => {
    const workspace = workspaces.find((item) => item.id === workspaceId);
    if (
      !workspace?.tabs.some(
        (tab) => tab.id === tabId && tab.panes.some((pane) => pane.id === paneId),
      )
    )
      return;
    setActiveId(workspaceId);
    setWorkspaces((items) =>
      items.map((workspace) =>
        workspace.id !== workspaceId
          ? workspace
          : {
              ...workspace,
              activeTabId: tabId,
              tabs: workspace.tabs.map((tab) =>
                tab.id === tabId ? { ...tab, activePaneId: paneId } : tab,
              ),
            },
      ),
    );
  };

  const selectAttention = (item: SidebarAttentionItem) =>
    selectLocation(item.workspaceId, item.tabId, item.paneId);

  const navigateToPane = (paneId: string) => {
    for (const workspace of workspaces) {
      for (const tab of workspace.tabs) {
        if (tab.panes.some((pane) => pane.id === paneId)) {
          selectLocation(workspace.id, tab.id, paneId);
          return;
        }
      }
    }
  };
  notificationNavigateRef.current = navigateToPane;

  useEffect(() => {
    const subscribe = window.desktop?.onAttentionNotificationClick;
    if (!subscribe) return;
    return subscribe((paneId) => notificationNavigateRef.current(paneId));
  }, []);

  const dismissAttention = (item: SidebarAttentionItem) => {
    const dismiss = window.desktop?.dismissTerminalAttention;
    if (!dismiss) return;
    pendingAttentionDismissalsRef.current.add(item.paneId);
    void dismiss(item.sessionId).catch(() => {
      pendingAttentionDismissalsRef.current.delete(item.paneId);
    });
  };

  const closeAttentionToast = (id: string) =>
    setAttentionToasts((items) => items.filter((item) => item.id !== id));

  const sidebarContent = ui.sidebarOpen ? (
    <Sidebar
      workspaces={workspaces}
      attentionItems={attentionItems}
      attentionHistory={attentionHistory.filter((item) => item.outcome !== "active")}
      activeWorkspaceId={activeId}
      onOpenWorkspace={() => void openWorkspace()}
      onNewSpace={addSpace}
      onSelectWorkspace={setActiveId}
      onSelectTab={(workspaceId, tabId) => {
        setActiveId(workspaceId);
        setWorkspaces((items) =>
          items.map((workspace) =>
            workspace.id === workspaceId ? { ...workspace, activeTabId: tabId } : workspace,
          ),
        );
      }}
      onSelectAttention={selectAttention}
      onDismissAttention={dismissAttention}
      onOpenSettings={() => ui.setSettingsOpen(true)}
    />
  ) : undefined;

  return (
    <>
      <WindowFrame
        sidebar={sidebarContent}
        topContent={topContent}
        onSplitRight={active ? () => split("right") : undefined}
        onSplitDown={active ? () => split("down") : undefined}
      >
        <div className="relative flex h-full min-h-0 bg-background">
          <main className="relative min-w-0 flex-1 overflow-hidden bg-background">
            {!active ? (
              <div className="grid h-full place-items-center p-8 text-center">
                <div>
                  <h1 className="text-ui-xl font-semibold">
                    {homeLoadStatus === "loading"
                      ? "Starting your local terminal…"
                      : "Your workspace, ready when you are"}
                  </h1>
                  <p className="mt-2 text-ui-base text-foreground-subtle">
                    {homeLoadStatus === "failed"
                      ? "Your Home space could not be opened. You can start by opening a folder instead."
                      : "VINTAGE can start in Home, or you can open a project folder."}
                  </p>
                  <Button className="mt-5" variant="primary" onClick={() => void openWorkspace()}>
                    <FolderOpen />
                    Open folder
                  </Button>
                </div>
              </div>
            ) : (
              workspaces.flatMap((workspace) =>
                workspace.tabs.map((tab) => (
                  <TabSurface
                    key={`${workspace.id}:${tab.id}`}
                    workspaceId={workspace.id}
                    tab={tab}
                    visible={workspace.id === activeId && tab.id === workspace.activeTabId}
                    onClosePane={(paneId) => closePane(workspace.id, tab.id, paneId)}
                    onActivatePane={(paneId) => activatePane(workspace.id, tab.id, paneId)}
                    onRenamePane={(paneId, title) =>
                      renamePane(workspace.id, tab.id, paneId, title)
                    }
                    onAttentionChange={updateAttention}
                  />
                )),
              )
            )}
          </main>
          <>
            {ui.sidePaneOpen && (
              <ResizeHandle
                axis="x"
                invert
                label="Resize browser pane"
                max={760}
                min={300}
                value={ui.sidePaneWidth}
                onChange={ui.setSidePaneWidth}
              />
            )}
            <div
              aria-hidden={!ui.sidePaneOpen}
              className={`workspace-side-panel my-1 mr-1 overflow-hidden rounded-xl border border-border ${
                ui.sidePaneOpen
                  ? ""
                  : "pointer-events-none invisible absolute bottom-0 right-0 top-0"
              }`}
              style={{ width: ui.sidePaneWidth }}
            >
              <SidePane
                workspaceId={active?.id ?? null}
                workspaceName={active?.name ?? null}
                onOpenFile={openFile}
              />
            </div>
          </>
        </div>
        <SettingsDialog />
      </WindowFrame>
      <div
        aria-label="Attention notifications"
        className="pointer-events-none fixed right-5 top-16 z-[80] flex w-[min(24rem,calc(100vw-2.5rem))] flex-col gap-2"
      >
        {attentionToasts.map(({ id, item }) => (
          <AttentionToast
            item={item}
            key={id}
            onOpen={() => {
              selectAttention(item);
              closeAttentionToast(id);
            }}
            onDismiss={() => {
              dismissAttention(item);
              closeAttentionToast(id);
            }}
            onClose={() => closeAttentionToast(id)}
          />
        ))}
      </div>
    </>
  );
}
