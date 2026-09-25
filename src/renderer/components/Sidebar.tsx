import {
  Check,
  CircleAlert,
  FolderOpen,
  Home,
  OctagonAlert,
  Plus,
  RefreshCw,
  Settings,
  TriangleAlert,
  X,
} from "lucide-react";
import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import type {
  DesktopUpdateStatus,
  TerminalAttentionReason,
  TerminalAttentionState,
  TerminalAttentionStatus,
} from "../../shared/desktop.js";
import { Button } from "./Button.js";

export interface SidebarWorkspace {
  id: string;
  name: string;
  kind?: "home" | "project";
  available?: boolean;
  tabs: Array<{ id: string; title: string; panes: Array<unknown> }>;
  activeTabId: string;
}

export interface SidebarAttentionItem {
  paneId: string;
  sessionId: string;
  paneTitle: string;
  tabId: string;
  tabTitle: string;
  workspaceId: string;
  workspaceName: string;
  status: TerminalAttentionStatus;
  source: TerminalAttentionState["source"];
  attentionLevel: 1 | 2 | 3 | 4;
  reason?: TerminalAttentionReason;
  durationMs?: number;
  judgmentConfidence?: number;
  judgmentModel?: string;
  lastActivityAt: number;
}

export interface SidebarAttentionHistoryItem extends SidebarAttentionItem {
  id: string;
  outcome: "active" | "resolved" | "dismissed" | "closed";
  completedAt?: number;
}

function attentionLabel(item: SidebarAttentionItem): string {
  if (item.reason === "long_running_completed") {
    return "Long command completed";
  }
  if (item.reason === "error_output") {
    return "Error output detected";
  }
  if (item.reason === "warning_output") {
    return "Warning detected";
  }
  if (item.status === "completed") return "Completed";
  if (item.status === "thinking") return "Thinking";
  if (item.status === "waiting") return "Waiting";
  if (item.status === "waiting_input") return "Input needed";
  if (item.status === "warning") return "Warning";
  return "Failed";
}

function attentionLevelLabel(level: SidebarAttentionItem["attentionLevel"]): string {
  return ["", "LOW", "MEDIUM", "HIGH", "CRITICAL"][level]!;
}

function attentionLevelClass(level: SidebarAttentionItem["attentionLevel"]): string {
  if (level === 1 || level === 2) return "bg-foreground/10 text-foreground";
  if (level === 3) return "bg-destructive/15 text-destructive";
  return "bg-destructive/20 text-destructive ring-1 ring-destructive/50";
}

function AttentionLevelIcon({ level }: { level: SidebarAttentionItem["attentionLevel"] }) {
  if (level === 1) return <Check aria-hidden="true" className="size-4" />;
  if (level === 2) return <TriangleAlert aria-hidden="true" className="size-4" />;
  if (level === 3) return <CircleAlert aria-hidden="true" className="size-4" />;
  return <OctagonAlert aria-hidden="true" className="size-4" />;
}

function focusAttentionByKey(event: ReactKeyboardEvent<HTMLButtonElement>): void {
  let offset = 0;
  if (event.key === "ArrowDown") offset = 1;
  else if (event.key === "ArrowUp") offset = -1;
  else if (event.key !== "Home" && event.key !== "End") return;
  event.preventDefault();
  const list = event.currentTarget.closest<HTMLElement>("[data-attention-list]");
  const items = [...(list?.querySelectorAll<HTMLButtonElement>("[data-attention-item]") ?? [])];
  if (items.length < 2) return;
  const index = items.indexOf(event.currentTarget);
  const target = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : index + offset;
  items[(target + items.length) % items.length]?.focus();
}

function relativeTime(timestamp: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 5) return "now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export function Sidebar({
  workspaces,
  attentionItems,
  attentionHistory,
  activeWorkspaceId,
  onOpenWorkspace,
  onNewSpace,
  canCreateSpace = true,
  onLocateWorkspace = () => {},
  onRemoveWorkspace = () => {},
  onSelectWorkspace,
  onSelectTab,
  onSelectAttention,
  onDismissAttention,
  onOpenSettings,
}: {
  workspaces: SidebarWorkspace[];
  attentionItems: SidebarAttentionItem[];
  attentionHistory: SidebarAttentionHistoryItem[];
  activeWorkspaceId: string | null;
  onOpenWorkspace(): void;
  onNewSpace(): void;
  canCreateSpace?: boolean;
  onLocateWorkspace?(workspaceId: string): void;
  onRemoveWorkspace?(workspaceId: string): void;
  onSelectWorkspace(workspaceId: string): void;
  onSelectTab(workspaceId: string, tabId: string): void;
  onSelectAttention(item: SidebarAttentionItem): void;
  onDismissAttention(item: SidebarAttentionItem): void;
  onOpenSettings(): void;
}) {
  const [updateStatus, setUpdateStatus] = useState<DesktopUpdateStatus | null>(null);
  const [updateCheckBusy, setUpdateCheckBusy] = useState(false);
  const [updateNotice, setUpdateNotice] = useState<string | null>(null);
  const desktop = window.desktop;

  useEffect(() => {
    const bridge = window.desktop;
    if (!bridge) return;
    let cancelled = false;
    const unsubscribe = bridge.onUpdateStatusChanged(setUpdateStatus);
    void bridge
      .getUpdateStatus()
      .then((status) => {
        if (!cancelled) setUpdateStatus(status);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let message: string | null = null;
    if (updateStatus?.status === "up-to-date") {
      message = `VINTAGE ${updateStatus.currentVersion} is up to date.`;
    } else if (updateStatus?.status === "available") {
      message = `Version ${updateStatus.availableVersion} is available. Open Settings > Updates.`;
    } else if (updateStatus?.status === "downloaded") {
      message =
        updateStatus.installMethod === "system-installer"
          ? `Version ${updateStatus.availableVersion} is ready. Open Settings > Updates to install it.`
          : `Version ${updateStatus.availableVersion} is ready. Open Settings > Updates to restart.`;
    } else if (updateStatus?.status === "error") {
      message = `Update failed: ${updateStatus.message}`;
    }

    setUpdateNotice(message);
    if (!message) return;
    const timer = setTimeout(() => setUpdateNotice(null), 6_000);
    return () => clearTimeout(timer);
  }, [updateStatus]);

  const checkForUpdates = async () => {
    if (!desktop || updateCheckBusy || updateStatus?.status === "unsupported") return;
    setUpdateCheckBusy(true);
    try {
      setUpdateStatus(await desktop.checkForUpdates());
    } catch (error) {
      setUpdateStatus({
        status: "error",
        currentVersion: updateStatus?.currentVersion ?? "unknown",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setUpdateCheckBusy(false);
    }
  };

  const updateButtonTitle = (() => {
    if (!desktop) return "Update checks are available in the Electron edition.";
    if (updateCheckBusy || updateStatus?.status === "checking") return "Checking for updates…";
    if (!updateStatus) return "Check for updates";
    switch (updateStatus.status) {
      case "idle":
        return "Check for updates";
      case "unsupported":
        return updateStatus.message;
      case "up-to-date":
        return "VINTAGE is up to date.";
      case "available":
        return `Version ${updateStatus.availableVersion} is available. Open Settings > Updates to install.`;
      case "downloading":
        return `Downloading version ${updateStatus.availableVersion}… ${updateStatus.percent.toFixed(0)}%.`;
      case "downloaded":
        return updateStatus.installMethod === "system-installer"
          ? `Version ${updateStatus.availableVersion} is ready. Open Settings > Updates to install it.`
          : `Version ${updateStatus.availableVersion} is ready. Open Settings > Updates to restart.`;
      case "error":
        return `Update failed: ${updateStatus.message}`;
    }
  })();

  const attentionCountByWorkspace = new Map<string, number>();
  for (const item of attentionItems) {
    attentionCountByWorkspace.set(
      item.workspaceId,
      (attentionCountByWorkspace.get(item.workspaceId) ?? 0) + 1,
    );
  }

  const renderWorkspace = (workspace: SidebarWorkspace) => {
    const active = workspace.id === activeWorkspaceId;
    const attentionCount = attentionCountByWorkspace.get(workspace.id) ?? 0;
    return (
      <section className="mb-2" key={workspace.id}>
        <div className="flex items-center gap-1">
          <button
            aria-pressed={active}
            className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left text-ui-sm ${active ? "bg-selected text-foreground" : "text-foreground-subtle hover:bg-hover"}`}
            onClick={() => onSelectWorkspace(workspace.id)}
          >
            {workspace.kind === "home" ? (
              <Home className="size-4 shrink-0 text-foreground" />
            ) : (
              <FolderOpen className="size-4 shrink-0 text-foreground" />
            )}
            <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
            {workspace.available === false && (
              <span className="shrink-0 text-ui-xs text-warning">Missing</span>
            )}
            {attentionCount > 0 && (
              <span
                aria-label={`${attentionCount} items need attention`}
                className="rounded-full bg-destructive/15 px-1.5 font-mono text-ui-xs text-destructive"
              >
                {attentionCount}
              </span>
            )}
          </button>
          {workspace.kind === "project" && (
            <div className="flex shrink-0 items-center">
              {workspace.available === false && (
                <button
                  aria-label={`Locate ${workspace.name}`}
                  className="grid size-7 place-items-center rounded-md text-foreground-subtle hover:bg-hover hover:text-foreground"
                  title={`Locate ${workspace.name}`}
                  onClick={() => onLocateWorkspace(workspace.id)}
                >
                  <FolderOpen aria-hidden="true" className="size-3.5" />
                </button>
              )}
              <button
                aria-label={`Remove ${workspace.name} from list`}
                className="grid size-7 place-items-center rounded-md text-foreground-subtle hover:bg-hover hover:text-foreground"
                title={`Remove ${workspace.name} from list`}
                onClick={() => onRemoveWorkspace(workspace.id)}
              >
                <X aria-hidden="true" className="size-3.5" />
              </button>
            </div>
          )}
        </div>
        <div className="ml-3 mt-1 border-l border-border pl-2">
          {workspace.tabs.map((tab) => {
            const selected = active && tab.id === workspace.activeTabId;
            return (
              <button
                aria-pressed={selected}
                className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-ui-sm ${selected ? "bg-hover text-foreground" : "text-foreground-subtle hover:bg-hover"}`}
                key={tab.id}
                onClick={() => onSelectTab(workspace.id, tab.id)}
              >
                <span className="size-1.5 rounded-full bg-foreground" />
                <span className="min-w-0 flex-1 truncate">{tab.title}</span>
                <span className="font-mono text-ui-xs text-foreground-subtlest">
                  {tab.panes.length}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    );
  };
  const localWorkspaces = workspaces.filter((workspace) => workspace.kind === "home");
  const projectWorkspaces = workspaces.filter((workspace) => workspace.kind !== "home");

  return (
    <aside className="relative flex h-full min-w-0 flex-col bg-sidebar">
      <header className="window-drag flex h-12 shrink-0 items-center justify-between px-3">
        <span className="text-ui-sm font-semibold text-foreground-subtle">Workspace</span>
        <Button
          aria-label="Open workspace"
          className="size-7 rounded-lg px-0"
          size="icon"
          variant="ghost"
          onClick={onOpenWorkspace}
        >
          <Plus aria-hidden="true" className="size-4 text-foreground" />
        </Button>
      </header>
      <div className="space-y-1 px-2 py-3">
        <Button
          className="w-full justify-start"
          variant="ghost"
          disabled={!canCreateSpace}
          onClick={onNewSpace}
        >
          <Plus aria-hidden="true" className="size-4 text-foreground" />
          New space
        </Button>
        <Button className="w-full justify-start" variant="ghost" onClick={onOpenWorkspace}>
          <FolderOpen aria-hidden="true" className="size-4 text-foreground" />
          Open folder
        </Button>
      </div>

      {attentionItems.length > 0 && (
        <section className="shrink-0 border-b border-border px-2 pb-2 pt-3">
          <div className="flex items-center justify-between px-1 pb-1.5">
            <span className="text-ui-sm font-medium text-foreground-subtle">Attention</span>
            <span className="rounded-full bg-destructive/15 px-1.5 font-mono text-ui-xs text-destructive">
              {attentionItems.length}
            </span>
          </div>
          <div className="max-h-52 space-y-1 overflow-y-auto" data-attention-list>
            {attentionItems.map((item) => {
              const label = attentionLabel(item);
              const level = attentionLevelLabel(item.attentionLevel);
              const confidence =
                item.source === "jev" && item.judgmentConfidence !== undefined
                  ? ` · ${Math.round(item.judgmentConfidence * 100)}% confidence`
                  : "";
              return (
                <div className="group flex items-stretch gap-1" key={item.paneId}>
                  <button
                    aria-label={`${level} ${item.paneTitle}: ${label}`}
                    className="flex min-w-0 flex-1 items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
                    data-attention-item
                    onClick={() => onSelectAttention(item)}
                    onKeyDown={focusAttentionByKey}
                  >
                    <span
                      className={`mt-0.5 flex shrink-0 items-center gap-1 rounded px-1 py-0.5 text-ui-xs font-semibold ${attentionLevelClass(item.attentionLevel)}`}
                    >
                      <AttentionLevelIcon level={item.attentionLevel} />
                      {level}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-ui-sm font-medium text-foreground">
                          {item.paneTitle}
                        </span>
                        <time
                          className="shrink-0 font-mono text-ui-xs text-foreground-subtlest"
                          dateTime={new Date(item.lastActivityAt).toISOString()}
                        >
                          {relativeTime(item.lastActivityAt)}
                        </time>
                      </span>
                      <span className="block text-ui-xs text-foreground-subtle">{label}</span>
                      <span className="block truncate text-ui-xs text-foreground-subtlest">
                        {item.workspaceName} · {item.tabTitle}
                      </span>
                      <span className="block truncate text-ui-xs text-foreground-subtlest">
                        Source: {item.source.toUpperCase()}
                        {confidence}
                        {item.judgmentModel ? ` · ${item.judgmentModel}` : ""}
                      </span>
                    </span>
                  </button>
                  <button
                    aria-label={`Dismiss ${item.paneTitle} attention`}
                    className="grid w-8 shrink-0 place-items-center rounded-md text-foreground opacity-60 hover:bg-hover hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
                    title="Dismiss attention"
                    onClick={() => onDismissAttention(item)}
                  >
                    <X aria-hidden="true" className="size-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {attentionHistory.length > 0 && (
        <details className="shrink-0 border-b border-border px-3 py-2">
          <summary className="cursor-pointer list-none text-ui-sm font-medium text-foreground-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">
            Attention history · {attentionHistory.length}
          </summary>
          <div className="mt-2 max-h-44 space-y-1 overflow-y-auto" data-attention-list>
            {attentionHistory.map((item) => (
              <button
                aria-label={`${attentionLevelLabel(item.attentionLevel)} ${item.paneTitle}: ${attentionLabel(item)} (${item.outcome})`}
                className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
                data-attention-item
                key={item.id}
                onClick={() => onSelectAttention(item)}
                onKeyDown={focusAttentionByKey}
              >
                <span
                  className={`mt-0.5 flex shrink-0 items-center gap-1 rounded px-1 py-0.5 text-ui-xs font-semibold ${attentionLevelClass(item.attentionLevel)}`}
                >
                  <AttentionLevelIcon level={item.attentionLevel} />
                  {attentionLevelLabel(item.attentionLevel)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-ui-sm font-medium text-foreground">
                    {item.paneTitle} · {attentionLabel(item)}
                  </span>
                  <span className="block text-ui-xs text-foreground-subtlest">
                    {item.outcome} · {item.source.toUpperCase()}
                    {item.judgmentConfidence === undefined
                      ? ""
                      : ` · ${Math.round(item.judgmentConfidence * 100)}% confidence`}
                  </span>
                  <time
                    className="block text-ui-xs text-foreground-subtlest"
                    dateTime={new Date(item.completedAt ?? item.lastActivityAt).toISOString()}
                  >
                    {relativeTime(item.completedAt ?? item.lastActivityAt)}
                  </time>
                </span>
              </button>
            ))}
          </div>
        </details>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {localWorkspaces.length > 0 && (
          <>
            <div className="px-1 pb-1 pt-4 text-ui-base font-semibold text-foreground">Local</div>
            {localWorkspaces.map(renderWorkspace)}
          </>
        )}
        <div className="px-1 pb-1 pt-4 text-ui-base font-semibold text-foreground">Projects</div>
        {projectWorkspaces.length === 0 ? (
          <p className="px-1 py-2 text-ui-base text-foreground-subtle">No open projects.</p>
        ) : (
          projectWorkspaces.map(renderWorkspace)
        )}
      </div>
      {updateNotice && (
        <div
          aria-live="polite"
          className="pointer-events-none absolute bottom-[4.5rem] left-2 right-2 z-20 rounded-lg border border-border bg-panel px-3 py-2 text-ui-sm text-foreground shadow-lg"
          role="status"
        >
          {updateNotice}
        </div>
      )}
      <footer className="flex h-16 shrink-0 items-center justify-between border-t border-border px-3 text-ui-sm text-foreground-subtle">
        <span className="flex items-center gap-2">
          <img alt="" aria-hidden="true" className="size-[18px]" src="./favicon.svg" />
          VINTAGE
        </span>
        <div className="flex items-center gap-1">
          <Button
            aria-label="Check for updates"
            className="relative size-7 rounded-lg px-0"
            disabled={
              !desktop ||
              updateCheckBusy ||
              updateStatus?.status === "unsupported" ||
              updateStatus?.status === "checking"
            }
            size="icon"
            title={updateButtonTitle}
            variant="ghost"
            onClick={() => void checkForUpdates()}
          >
            <RefreshCw
              aria-hidden="true"
              className={`size-4 text-foreground ${updateCheckBusy || updateStatus?.status === "checking" ? "animate-spin" : ""}`}
            />
            {(updateStatus?.status === "available" || updateStatus?.status === "downloaded") && (
              <span
                aria-hidden="true"
                className="absolute right-1 top-1 size-1.5 rounded-full bg-brand"
              />
            )}
          </Button>
          <Button
            aria-label="Open settings"
            className="size-7 rounded-lg px-0"
            size="icon"
            variant="ghost"
            onClick={onOpenSettings}
          >
            <Settings aria-hidden="true" className="size-4 text-foreground" />
          </Button>
        </div>
      </footer>
    </aside>
  );
}
