import { FolderOpen, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";

import type { RegisteredWorkspace } from "../shared/desktop.js";
import { Button } from "./components/Button.js";
import { FileViewer } from "./components/FileViewer.js";
import { ResizeHandle } from "./components/ResizeHandle.js";
import { SettingsDialog } from "./components/SettingsDialog.js";
import { SidePane } from "./components/SidePane.js";
import { Sidebar } from "./components/Sidebar.js";
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

const MAX_PANES = 64;
const MAX_LAYOUT_DEPTH = 8;
const id = () => crypto.randomUUID();

function terminal(title: string): Tab {
  const pane: TerminalPane = { id: id(), title, kind: "terminal" };
  return {
    id: id(),
    title,
    panes: [pane],
    layout: { type: "pane", paneId: pane.id },
    activePaneId: pane.id,
  };
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
}: {
  workspaceId: string;
  tab: Tab;
  pane: Pane;
  bounds: PaneBounds;
  visible: boolean;
  onClosePane(paneId: string): void;
  onActivatePane(paneId: string): void;
  onRenamePane(paneId: string, title: string): void;
}) {
  const active = pane.id === tab.activePaneId;
  return (
    <div
      data-pane-kind={pane.kind}
      className={`absolute flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border bg-background ${active ? "border-pane-active-border" : "border-border"}`}
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
          workspaceId={workspaceId}
          title={pane.title}
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
        className="absolute right-2 top-1 rounded border border-border bg-background/80 p-1 text-foreground-subtle hover:bg-foreground/10"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onClosePane(pane.id);
        }}
      >
        <X className="size-3" />
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
}: {
  workspaceId: string;
  tab: Tab;
  visible: boolean;
  onClosePane(paneId: string): void;
  onActivatePane(paneId: string): void;
  onRenamePane(paneId: string, title: string): void;
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
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [tabTitleDraft, setTabTitleDraft] = useState("");
  const active = workspaces.find((workspace) => workspace.id === activeId) ?? null;

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
    const existing = workspaces.find((item) => item.id === chosen.id);
    if (existing) return setActiveId(existing.id);
    const workspace: VintageWorkspace = {
      ...chosen,
      tabs: [terminal("Terminal 1")],
      activeTabId: "",
    };
    workspace.activeTabId = workspace.tabs[0]!.id;
    setWorkspaces((items) => [...items, workspace]);
    setActiveId(workspace.id);
  };
  const addTab = () =>
    update((workspace) => {
      const next = terminal(`Terminal ${workspace.tabs.length + 1}`);
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
        title: `Terminal ${tab.panes.length + 1}`,
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
        return addTab();
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
        aria-label="New terminal tab"
        className="mb-0.5 size-7"
        size="icon"
        variant="ghost"
        onClick={addTab}
      >
        <Plus />
      </Button>
    </div>
  );

  const sidebarContent = ui.sidebarOpen ? (
    <Sidebar
      workspaces={workspaces}
      activeWorkspaceId={activeId}
      onOpenWorkspace={() => void openWorkspace()}
      onNewTerminal={addTab}
      onSelectWorkspace={setActiveId}
      onSelectTab={(workspaceId, tabId) => {
        setActiveId(workspaceId);
        setWorkspaces((items) =>
          items.map((workspace) =>
            workspace.id === workspaceId ? { ...workspace, activeTabId: tabId } : workspace,
          ),
        );
      }}
      onOpenSettings={() => ui.setSettingsOpen(true)}
    />
  ) : undefined;

  return (
    <WindowFrame
      sidebar={sidebarContent}
      topContent={topContent}
      onSplitRight={active ? () => split("right") : undefined}
      onSplitDown={active ? () => split("down") : undefined}
    >
      <div className="flex h-full min-h-0 bg-background">
        <main className="relative min-w-0 flex-1 overflow-hidden bg-background">
          {!active ? (
            <div className="grid h-full place-items-center p-8 text-center">
              <div>
                <h1 className="text-ui-xl font-semibold">Your workspace, ready when you are</h1>
                <p className="mt-2 text-ui-base text-foreground-subtle">
                  Open a folder, then add a terminal tab.
                </p>
                <Button className="mt-5" variant="primary" onClick={() => void openWorkspace()}>
                  <FolderOpen />
                  Open workspace
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
                  onRenamePane={(paneId, title) => renamePane(workspace.id, tab.id, paneId, title)}
                />
              )),
            )
          )}
        </main>
        {ui.sidePaneOpen && (
          <>
            <ResizeHandle
              axis="x"
              invert
              label="Resize browser pane"
              max={760}
              min={300}
              value={ui.sidePaneWidth}
              onChange={ui.setSidePaneWidth}
            />
            <div
              className="workspace-side-panel my-1 mr-1 overflow-hidden rounded-xl border border-border"
              style={{ width: ui.sidePaneWidth }}
            >
              <SidePane workspaceId={active?.id ?? null} onOpenFile={openFile} />
            </div>
          </>
        )}
      </div>
      <SettingsDialog />
    </WindowFrame>
  );
}
