import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Folder,
  FolderOpen,
  Gauge,
  Globe2,
  GitBranch,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { MouseEvent as ReactMouseEvent } from "react";
import { FileActions } from "./FileActions.js";
import type { WorkspaceFileEntry } from "../../shared/desktop.js";
import { useUiStore } from "../store/uiStore.js";
import { BrowserPane } from "./BrowserPane.js";
import { Button } from "./Button.js";
import { LanguageIcon, ReviewPane } from "./ReviewPane.js";
import { NotesPane } from "./NotesPane.js";
import { UsagePanel } from "./UsagePanel.js";

export function SidePane({
  workspaceId,
  workspaceName,
  visible = true,
  onOpenFile,
}: {
  visible?: boolean;
  workspaceId: string | null;
  workspaceName?: string | null;
  onOpenFile(path: string, line?: number): void;
}) {
  const activeTabId = useUiStore((state) => state.activeSidePaneTabId);
  const activateSidePaneTab = useUiStore((state) => state.activateSidePaneTab);
  const activateBrowserTab = useUiStore((state) => state.activateBrowserTab);
  const addBrowserTab = useUiStore((state) => state.addBrowserTab);
  const closeBrowserTab = useUiStore((state) => state.closeBrowserTab);
  const browserTabs = useUiStore((state) => state.browserTabs);
  const browserNavigateRequest = useUiStore((state) => state.browserNavigateRequest);
  const consumeBrowserNavigateRequest = useUiStore((state) => state.consumeBrowserNavigateRequest);
  const boardPanelEnabled = useUiStore((state) => state.boardPanelEnabled);
  const notesPanelEnabled = useUiStore((state) => state.notesPanelEnabled);
  const usagePanelEnabled = useUiStore((state) => state.usagePanelEnabled);
  const browserTabElements = useRef(new Map<string, HTMLDivElement>());
  const [menu, setMenu] = useState<{
    entry: WorkspaceFileEntry | null;
    x: number;
    y: number;
  } | null>(null);
  const [copied, setCopied] = useState<{ workspaceId: string; path: string } | null>(null);
  const openMenu = (event: ReactMouseEvent, entry: WorkspaceFileEntry | null) => {
    event.preventDefault();
    event.stopPropagation();
    setMenu({ entry, x: event.clientX, y: event.clientY });
  };
  useEffect(() => setMenu(null), [workspaceId, activeTabId, visible]);
  const [files, setFiles] = useState<WorkspaceFileEntry[]>([]);
  const [filesWorkspaceId, setFilesWorkspaceId] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [reviewRefreshVersion, setReviewRefreshVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [revealHiddenFiles, setRevealHiddenFiles] = useState(false);
  const currentFiles = filesWorkspaceId === workspaceId ? files : [];
  const showHiddenFiles = workspaceName !== "Home" || revealHiddenFiles;
  const visibleFiles = showHiddenFiles
    ? currentFiles
    : currentFiles.filter((entry) => !entry.name.startsWith("."));
  useEffect(() => {
    setError(null);
    if (!workspaceId || !window.desktop) {
      setFiles([]);
      setFilesWorkspaceId(null);
      setLoading(false);
      return;
    }
    if (!visible || activeTabId !== "files") {
      setLoading(false);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setLoading(true);
    void window.desktop
      .listWorkspaceFiles(workspaceId)
      .then((entries) => {
        if (!cancelled) {
          setFiles(entries);
          setFilesWorkspaceId(workspaceId);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Unable to read this location.");
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          if (visible && activeTabId === "files") {
            timer = setTimeout(() => setRefreshVersion((version) => version + 1), 3000);
          }
        }
      });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [workspaceId, refreshVersion, visible, activeTabId]);

  useEffect(() => {
    if (activeTabId === "files") return;
    browserTabElements.current.get(activeTabId)?.scrollIntoView?.({
      block: "nearest",
      inline: "nearest",
    });
  }, [activeTabId]);

  useEffect(() => {
    if (!usagePanelEnabled && activeTabId === "usage") {
      activateSidePaneTab("files");
    }
  }, [activeTabId, activateSidePaneTab, usagePanelEnabled]);

  useEffect(() => {
    if (
      (!notesPanelEnabled && activeTabId === "notes") ||
      (!boardPanelEnabled && activeTabId === "board")
    )
      activateSidePaneTab("files");
  }, [notesPanelEnabled, boardPanelEnabled, activeTabId, activateSidePaneTab]);

  const refreshFilesButton = (
    <Button
      aria-label="Refresh"
      className="size-7 px-0"
      disabled={loading}
      size="icon"
      title="Refresh"
      type="button"
      variant="ghost"
      onClick={() => setRefreshVersion((version) => version + 1)}
    >
      <RefreshCw aria-hidden="true" className={`size-4${loading ? " animate-spin" : ""}`} />
    </Button>
  );

  return (
    <aside className="flex h-full min-w-0 flex-col bg-panel">
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border px-2">
        <button
          aria-pressed={activeTabId === "files"}
          className={`flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2 text-ui-sm font-medium transition-colors ${
            activeTabId === "files"
              ? "bg-selected text-foreground"
              : "text-foreground-subtle hover:bg-hover hover:text-foreground"
          }`}
          onClick={() => activateSidePaneTab("files")}
          type="button"
        >
          <FolderOpen aria-hidden="true" className="size-3.5" />
          <span>Files</span>
        </button>
        <button
          aria-pressed={activeTabId === "review"}
          className={`flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2 text-ui-sm font-medium transition-colors ${
            activeTabId === "review"
              ? "bg-selected text-foreground"
              : "text-foreground-subtle hover:bg-hover hover:text-foreground"
          }`}
          onClick={() => activateSidePaneTab("review")}
          type="button"
        >
          <GitBranch aria-hidden="true" className="size-3.5" />
          <span>Review</span>
        </button>
        {notesPanelEnabled && (
          <button
            type="button"
            className={`h-7 rounded-lg px-2 text-ui-sm ${activeTabId === "notes" ? "bg-selected text-foreground" : "text-foreground-subtle hover:bg-hover"}`}
            aria-pressed={activeTabId === "notes"}
            onClick={() => activateSidePaneTab("notes")}
          >
            Notes
          </button>
        )}
        {boardPanelEnabled && (
          <button
            type="button"
            className={`h-7 rounded-lg px-2 text-ui-sm ${activeTabId === "board" ? "bg-selected text-foreground" : "text-foreground-subtle hover:bg-hover"}`}
            aria-pressed={activeTabId === "board"}
            onClick={() => activateSidePaneTab("board")}
          >
            Board
          </button>
        )}
        {usagePanelEnabled && (
          <button
            aria-pressed={activeTabId === "usage"}
            className={`flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2 text-ui-sm font-medium transition-colors ${
              activeTabId === "usage"
                ? "bg-selected text-foreground"
                : "text-foreground-subtle hover:bg-hover hover:text-foreground"
            }`}
            onClick={() => activateSidePaneTab("usage")}
            type="button"
          >
            <Gauge aria-hidden="true" className="size-3.5" />
            <span>Usage</span>
          </button>
        )}
        <div
          aria-label="Browser tabs"
          className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none]"
          role="group"
        >
          {browserTabs.map((browserTab) => {
            const active = activeTabId === browserTab.id;
            return (
              <div
                key={browserTab.id}
                ref={(element) => {
                  if (element) browserTabElements.current.set(browserTab.id, element);
                  else browserTabElements.current.delete(browserTab.id);
                }}
                className={`group flex h-7 min-w-0 max-w-36 shrink-0 items-center rounded-lg transition-colors ${
                  active
                    ? "bg-selected text-foreground"
                    : "text-foreground-subtle hover:bg-hover hover:text-foreground"
                }`}
              >
                <button
                  aria-pressed={active}
                  className="flex h-full min-w-0 items-center gap-1.5 overflow-hidden pl-2 text-left text-ui-sm font-medium"
                  onClick={() => activateBrowserTab(browserTab.id)}
                  title={browserTab.title}
                  type="button"
                >
                  <Globe2 aria-hidden="true" className="size-3.5 shrink-0" />
                  <span className="truncate">{browserTab.title}</span>
                </button>
                <button
                  aria-label={`Close ${browserTab.title} tab`}
                  className={`mr-1 flex size-5 shrink-0 items-center justify-center rounded-md text-foreground-subtlest transition-colors hover:bg-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand ${
                    active
                      ? "opacity-100"
                      : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                  }`}
                  onClick={() => closeBrowserTab(browserTab.id)}
                  type="button"
                >
                  <X aria-hidden="true" className="size-3.5" />
                </button>
              </div>
            );
          })}
        </div>
        <Button
          aria-label="New browser tab"
          className="size-7 px-0"
          size="icon"
          title="New browser tab"
          variant="ghost"
          onClick={addBrowserTab}
        >
          <Plus aria-hidden="true" className="size-4" />
        </Button>
        {workspaceName === "Home" && (
          <Button
            aria-label={revealHiddenFiles ? "Hide hidden files" : "Show hidden files"}
            aria-pressed={revealHiddenFiles}
            className="ml-auto size-7 px-0"
            size="icon"
            title={revealHiddenFiles ? "Hide hidden files" : "Show hidden files"}
            variant="ghost"
            onClick={() => setRevealHiddenFiles((shown) => !shown)}
          >
            {revealHiddenFiles ? (
              <EyeOff aria-hidden="true" className="size-4" />
            ) : (
              <Eye aria-hidden="true" className="size-4" />
            )}
          </Button>
        )}
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div
          aria-hidden={activeTabId !== "files"}
          className="absolute inset-0"
          hidden={activeTabId !== "files"}
        >
          <div
            className="h-full overflow-y-auto p-2"
            onContextMenu={(event) => openMenu(event, null)}
          >
            {error ? (
              <div className="flex items-center justify-between gap-2 p-2">
                <p className="text-ui-sm text-destructive">{error}</p>
                {workspaceId && refreshFilesButton}
              </div>
            ) : workspaceId ? (
              <>
                <div className="flex items-center justify-between gap-2 px-2 pb-1 pt-1">
                  {workspaceName ? (
                    <span className="min-w-0 truncate text-ui-xs font-medium text-foreground-subtlest">
                      {workspaceName === "Home" ? "Home directory" : workspaceName}
                    </span>
                  ) : (
                    <span />
                  )}
                  {refreshFilesButton}
                </div>
                {loading && visibleFiles.length === 0 ? (
                  <p className="p-2 text-ui-sm text-foreground-subtle">
                    {currentFiles.length > 0 ? "Refreshing files…" : "Loading files…"}
                  </p>
                ) : visibleFiles.length > 0 ? (
                  visibleFiles.map((entry) => (
                    <FileTree
                      key={`${workspaceId}:${entry.kind}:${entry.path}`}
                      entry={entry}
                      workspaceId={workspaceId}
                      refreshVersion={refreshVersion}
                      showHiddenFiles={showHiddenFiles}
                      onContextMenu={openMenu}
                      onSelect={onOpenFile}
                    />
                  ))
                ) : (
                  <p className="p-2 text-ui-sm text-foreground-subtle">
                    {currentFiles.length > 0
                      ? "Hidden files are hidden."
                      : "No files in this location."}
                  </p>
                )}
              </>
            ) : (
              <p className="p-2 text-ui-sm text-foreground-subtle">
                Open a workspace to browse its files.
              </p>
            )}
          </div>
        </div>
        <div
          aria-hidden={activeTabId !== "review"}
          className="absolute inset-0"
          hidden={activeTabId !== "review"}
        >
          <ReviewPane
            active={visible && activeTabId === "review"}
            refreshVersion={reviewRefreshVersion}
            workspaceId={workspaceId}
            onOpenFile={onOpenFile}
            onRefresh={() => setReviewRefreshVersion((version) => version + 1)}
          />
        </div>
        {usagePanelEnabled && (
          <div
            aria-hidden={activeTabId !== "usage"}
            className="absolute inset-0"
            hidden={activeTabId !== "usage"}
          >
            <UsagePanel active={activeTabId === "usage"} />
          </div>
        )}
        {(notesPanelEnabled || boardPanelEnabled) && workspaceId && (
          <div
            className="h-full min-h-0"
            hidden={activeTabId !== "notes" && activeTabId !== "board"}
          >
            <NotesPane
              key={workspaceId}
              workspaceId={workspaceId}
              visible={visible && (activeTabId === "notes" || activeTabId === "board")}
              onOpenFile={onOpenFile}
            />
          </div>
        )}
        {browserTabs.map((browserTab) => {
          const active = activeTabId === browserTab.id;
          return (
            <div
              key={browserTab.id}
              aria-hidden={!active}
              className="absolute inset-0"
              hidden={!active}
            >
              {browserTab.mounted && browserTab.initialUrl && (
                <BrowserPane
                  initialUrl={browserTab.initialUrl}
                  navigateRequest={
                    browserNavigateRequest?.tabId === browserTab.id
                      ? browserNavigateRequest
                      : undefined
                  }
                  onNavigateRequestHandled={consumeBrowserNavigateRequest}
                />
              )}
            </div>
          );
        })}
      </div>
      {menu && workspaceId && (
        <FileActions
          key={workspaceId}
          workspaceId={workspaceId}
          entry={menu.entry}
          x={menu.x}
          y={menu.y}
          copied={copied}
          onCopy={setCopied}
          onClose={() => setMenu(null)}
          onChanged={() => setRefreshVersion((version) => version + 1)}
        />
      )}
    </aside>
  );
}
function FileTree({
  entry,
  workspaceId,
  refreshVersion,
  showHiddenFiles,
  onSelect,
  onContextMenu,
}: {
  entry: WorkspaceFileEntry;
  workspaceId: string;
  refreshVersion: number;
  showHiddenFiles: boolean;
  onContextMenu(event: ReactMouseEvent, entry: WorkspaceFileEntry): void;
  onSelect(path: string): void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<WorkspaceFileEntry[] | null>(entry.children ?? null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const expandedRef = useRef(expanded);
  const refreshVersionRef = useRef(refreshVersion);
  const requestVersionRef = useRef(0);
  const loadChildrenRef = useRef<(force?: boolean) => void>(() => {});
  expandedRef.current = expanded;
  const visibleChildren = children?.filter(
    (child) => showHiddenFiles || !child.name.startsWith("."),
  );
  const loadChildren = (force = false) => {
    if ((loading && !force) || (!force && children !== null)) return;
    const listFiles = window.desktop?.listWorkspaceFiles;
    if (!listFiles) {
      setLoadError(true);
      return;
    }
    const requestVersion = ++requestVersionRef.current;
    setLoadError(false);
    setLoading(true);
    void listFiles(workspaceId, entry.path)
      .then((entries) => {
        if (requestVersion === requestVersionRef.current) setChildren(entries);
      })
      .catch(() => {
        if (requestVersion === requestVersionRef.current) setLoadError(true);
      })
      .finally(() => {
        if (requestVersion === requestVersionRef.current) setLoading(false);
      });
  };
  loadChildrenRef.current = loadChildren;
  useEffect(() => {
    if (refreshVersionRef.current === refreshVersion) return;
    refreshVersionRef.current = refreshVersion;
    if (expandedRef.current) loadChildrenRef.current(true);
    else setChildren(null);
  }, [refreshVersion]);
  if (entry.kind === "file")
    return (
      <button
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-ui-sm hover:bg-hover"
        onContextMenu={(event) => onContextMenu(event, entry)}
        onDoubleClick={() => onSelect(entry.path)}
      >
        <LanguageIcon path={entry.path} />
        <span className="truncate">{entry.name}</span>
      </button>
    );
  return (
    <div>
      <button
        onContextMenu={(event) => onContextMenu(event, entry)}
        aria-expanded={expanded}
        aria-busy={loading}
        className="flex w-full items-center gap-1 rounded-md px-1 py-1.5 text-left text-ui-sm hover:bg-hover"
        onClick={() => {
          const nextExpanded = !expanded;
          setExpanded(nextExpanded);
          if (nextExpanded) loadChildren();
        }}
      >
        {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        {expanded ? (
          <FolderOpen className="size-4 text-foreground" />
        ) : (
          <Folder className="size-4 text-foreground" />
        )}
        <span className="truncate">{entry.name}</span>
      </button>
      {expanded && (
        <div className="ml-3 border-l border-border pl-1">
          {loading && !visibleChildren?.length ? (
            <p className="px-2 py-1 text-ui-xs text-foreground-subtlest">Loading…</p>
          ) : loadError ? (
            <button
              className="px-2 py-1 text-ui-xs text-destructive hover:underline"
              onClick={() => loadChildren(true)}
            >
              Unable to load folder · Retry
            </button>
          ) : visibleChildren?.length ? (
            visibleChildren.map((child) => (
              <FileTree
                key={child.path}
                entry={child}
                workspaceId={workspaceId}
                refreshVersion={refreshVersion}
                showHiddenFiles={showHiddenFiles}
                onContextMenu={onContextMenu}
                onSelect={onSelect}
              />
            ))
          ) : (
            <p className="px-2 py-1 text-ui-xs text-foreground-subtlest">
              {children?.length ? "Hidden files are hidden." : "Empty folder"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
