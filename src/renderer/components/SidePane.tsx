import { SessionsPanel } from "./SessionsPanel.js";
import type { HistorySession } from "../../shared/sessionHistory.js";
import { browserShortcut } from "../../shared/browserShortcuts.js";
import { runBrowserTabCommand } from "../lib/browserCommands.js";
import {
  Activity,
  Eye,
  EyeOff,
  Folder,
  FolderOpen,
  Globe2,
  GitBranch,
  History,
  Columns3,
  NotebookPen,
  Plus,
  X,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import type { MouseEvent as ReactMouseEvent } from "react";
import { WorkspaceFiles } from "./WorkspaceFiles.js";
import { FileActions } from "./FileActions.js";
import type { WorkspaceFileEntry } from "../../shared/desktop.js";
import { firstEnabledSidePaneTab, isSidePaneTabEnabled, useUiStore } from "../store/uiStore.js";
import { BrowserScopePicker } from "./BrowserScopePicker.js";
import { BrowserPane } from "./BrowserPane.js";
import { Button } from "./Button.js";
import { ReviewPane } from "./ReviewPane.js";
import { NotesPane } from "./NotesPane.js";
import { MonitorPanel } from "./MonitorPanel.js";

export function SidePane({
  workspaceId,
  workspaceName,
  onOpenTerminal,
  workspacePath,
  onResumeSession,
  visible = true,
  onOpenFile,
}: {
  visible?: boolean;
  workspacePath?: string | undefined;
  onResumeSession?: ((session: HistorySession) => void) | undefined;
  workspaceId: string | null;
  workspaceName?: string | null;
  onOpenTerminal?: ((paneId: string) => void) | undefined;
  onOpenFile(path: string, line?: number): void;
}) {
  const setBrowserWorkspace = useUiStore((state) => state.setBrowserWorkspace);
  const moveBrowserTab = useUiStore((state) => state.moveBrowserTab);
  useLayoutEffect(() => {
    if (workspaceId) setBrowserWorkspace(workspaceId);
  }, [workspaceId, setBrowserWorkspace]);
  const tabMenuRef = useRef<HTMLDivElement>(null);
  const sideTabHeaderRef = useRef<HTMLDivElement>(null);
  const [tabMenu, setTabMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  useEffect(() => {
    setTabMenu(null);
  }, [workspaceId]);
  useEffect(() => {
    if (!tabMenu) return;
    const close = () => setTabMenu(null);
    const key = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !tabMenuRef.current?.querySelector('[aria-haspopup="menu"][aria-expanded="true"]')
      )
        close();
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", key);
    };
  }, [tabMenu]);
  const activeTabId = useUiStore((state) => state.activeSidePaneTabId);
  const activateSidePaneTab = useUiStore((state) => state.activateSidePaneTab);
  const activateBrowserTab = useUiStore((state) => state.activateBrowserTab);
  const addBrowserTab = useUiStore((state) => state.addBrowserTab);
  const closeBrowserTab = useUiStore((state) => state.closeBrowserTab);
  const browserTabs = useUiStore((state) => state.browserTabs);
  const browserNavigateRequest = useUiStore((state) => state.browserNavigateRequest);
  const consumeBrowserNavigateRequest = useUiStore((state) => state.consumeBrowserNavigateRequest);
  const filesPanelEnabled = useUiStore((state) => state.filesPanelEnabled);
  const reviewPanelEnabled = useUiStore((state) => state.reviewPanelEnabled);
  const browserPanelEnabled = useUiStore((state) => state.browserPanelEnabled);
  const boardPanelEnabled = useUiStore((state) => state.boardPanelEnabled);
  const notesPanelEnabled = useUiStore((state) => state.notesPanelEnabled);
  const monitorPanelEnabled = useUiStore((state) => state.monitorPanelEnabled);
  const sessionsPanelEnabled = useUiStore((state) => state.sessionsPanelEnabled);
  const usagePanelEnabled = useUiStore((state) => state.usagePanelEnabled);
  const browserTabElements = useRef(new Map<string, HTMLDivElement>());
  const [menu, setMenu] = useState<{
    entry: WorkspaceFileEntry | null;
    x: number;
    y: number;
  } | null>(null);
  const [copied, setCopied] = useState<{ workspaceId: string; path: string } | null>(null);
  const openMenu = useCallback((event: ReactMouseEvent, entry: WorkspaceFileEntry | null) => {
    event.preventDefault();
    event.stopPropagation();
    setMenu({ entry, x: event.clientX, y: event.clientY });
  }, []);
  useEffect(() => setMenu(null), [workspaceId, activeTabId, visible]);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [reviewRefreshVersion, setReviewRefreshVersion] = useState(0);
  const [revealHiddenFiles, setRevealHiddenFiles] = useState(false);
  const showHiddenFiles = workspaceName !== "Home" || revealHiddenFiles;
  const openFileRef = useRef(onOpenFile);
  openFileRef.current = onOpenFile;
  const selectFile = useCallback((path: string) => openFileRef.current(path), []);
  const refreshFiles = useCallback(() => setRefreshVersion((version) => version + 1), []);

  useEffect(() => {
    const target =
      browserTabElements.current.get(activeTabId) ??
      sideTabHeaderRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
    target?.scrollIntoView?.({
      block: "nearest",
      inline: "nearest",
    });
  }, [activeTabId]);

  useEffect(() => {
    const state = useUiStore.getState();
    if (activeTabId === "usage" && state.monitorPanelEnabled) {
      activateSidePaneTab("monitor");
      return;
    }
    if (isSidePaneTabEnabled(state, activeTabId)) return;
    const next = firstEnabledSidePaneTab(state);
    if (next.startsWith("browser-")) state.activateBrowserTab(next);
    else if (next) activateSidePaneTab(next);
    else if (activeTabId) useUiStore.setState({ activeSidePaneTabId: "" });
  }, [
    filesPanelEnabled,
    reviewPanelEnabled,
    browserPanelEnabled,
    notesPanelEnabled,
    boardPanelEnabled,
    monitorPanelEnabled,
    sessionsPanelEnabled,
    usagePanelEnabled,
    activeTabId,
    activateSidePaneTab,
  ]);

  return (
    <aside
      tabIndex={-1}
      data-side-pane
      data-browser-shortcuts={activeTabId.startsWith("browser-") ? "" : undefined}
      className="icon-motion-surface flex h-full min-w-0 flex-col bg-panel"
      onKeyDownCapture={(event) => {
        const command = browserShortcut({
          key: event.key,
          control: event.ctrlKey,
          meta: event.metaKey,
          alt: event.altKey,
          shift: event.shiftKey,
        });
        if (
          command &&
          (activeTabId.startsWith("browser-") || command === "restore") &&
          runBrowserTabCommand(command)
        ) {
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.focus();
        }
      }}
    >
      <div
        ref={sideTabHeaderRef}
        className="flex h-11 shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-2 [scrollbar-width:thin]"
      >
        {filesPanelEnabled && (
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
        )}
        {reviewPanelEnabled && (
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
        )}
        {notesPanelEnabled && (
          <button
            type="button"
            className={`panel-motion-tab flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2 text-ui-sm font-medium transition-colors ${activeTabId === "notes" ? "bg-selected text-foreground" : "text-foreground-subtle hover:bg-hover"}`}
            aria-pressed={activeTabId === "notes"}
            onClick={() => activateSidePaneTab("notes")}
          >
            <NotebookPen
              key={String(activeTabId === "notes")}
              aria-hidden="true"
              className="panel-tab-icon size-3.5 shrink-0"
              data-motion="notes"
            />
            <span>Notes</span>
          </button>
        )}
        {boardPanelEnabled && (
          <button
            type="button"
            className={`panel-motion-tab flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2 text-ui-sm font-medium transition-colors ${activeTabId === "board" ? "bg-selected text-foreground" : "text-foreground-subtle hover:bg-hover"}`}
            aria-pressed={activeTabId === "board"}
            onClick={() => activateSidePaneTab("board")}
          >
            <Columns3
              key={String(activeTabId === "board")}
              aria-hidden="true"
              className="panel-tab-icon size-3.5 shrink-0"
              data-motion="board"
            />
            <span>Board</span>
          </button>
        )}
        {monitorPanelEnabled && (
          <button
            aria-pressed={activeTabId === "monitor"}
            className={`flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2 text-ui-sm font-medium ${activeTabId === "monitor" ? "bg-selected text-foreground" : "text-foreground-subtle hover:bg-hover"}`}
            type="button"
            onClick={() => activateSidePaneTab("monitor")}
          >
            <Activity aria-hidden="true" className="size-3.5" />
            <span>Monitor</span>
          </button>
        )}
        {sessionsPanelEnabled && (
          <button
            type="button"
            aria-pressed={activeTabId === "sessions"}
            className={`panel-motion-tab flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2 text-ui-sm font-medium transition-colors ${activeTabId === "sessions" ? "bg-selected text-foreground" : "text-foreground-subtle hover:bg-hover"}`}
            onClick={() => activateSidePaneTab("sessions")}
          >
            <History
              key={String(activeTabId === "sessions")}
              aria-hidden="true"
              className="panel-tab-icon size-3.5 shrink-0"
              data-motion="sessions"
            />
            <span>Sessions</span>
          </button>
        )}
        {browserPanelEnabled && (
          <>
            <div
              aria-label="Browser tabs"
              className="flex shrink-0 items-center gap-1"
              role="group"
            >
              {browserTabs
                .filter((tab) => !tab.workspaceId || tab.workspaceId === workspaceId)
                .map((browserTab) => {
                  const active = activeTabId === browserTab.id;
                  return (
                    <div
                      onMouseDown={(event) => {
                        if (event.button === 1) event.preventDefault();
                      }}
                      onAuxClick={(event) => {
                        if (event.button === 1) {
                          event.preventDefault();
                          if (active) event.currentTarget.closest<HTMLElement>("aside")?.focus();
                          closeBrowserTab(browserTab.id);
                        }
                      }}
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
                        title={`${browserTab.title} · ${browserTab.workspaceId ? (workspaceName ?? "This project") : "Common"}`}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          setTabMenu({
                            id: browserTab.id,
                            x: Math.min(event.clientX, window.innerWidth - 220),
                            y: Math.min(event.clientY, window.innerHeight - 100),
                          });
                        }}
                        type="button"
                      >
                        {browserTab.workspaceId ? (
                          <Folder aria-hidden="true" className="size-3.5 shrink-0" />
                        ) : (
                          <Globe2 aria-hidden="true" className="size-3.5 shrink-0" />
                        )}
                        <span className="truncate">{browserTab.title}</span>
                      </button>
                      <button
                        aria-label={`Close ${browserTab.title} tab`}
                        className={`mr-1 flex size-5 shrink-0 items-center justify-center rounded-md text-foreground-subtlest transition-colors hover:bg-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand ${
                          active
                            ? "opacity-100"
                            : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                        }`}
                        onClick={(event) => {
                          if (active) event.currentTarget.closest<HTMLElement>("aside")?.focus();
                          closeBrowserTab(browserTab.id);
                        }}
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
          </>
        )}
        {filesPanelEnabled && activeTabId === "files" && workspaceName === "Home" && (
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
        {!activeTabId && (
          <div className="p-5 text-ui-sm text-foreground-subtle">
            All panels are hidden. Enable a tab in Settings → Panels.
          </div>
        )}
        <div
          aria-hidden={!filesPanelEnabled || activeTabId !== "files"}
          className="absolute inset-0"
          hidden={!filesPanelEnabled || activeTabId !== "files"}
        >
          <WorkspaceFiles
            key={workspaceId}
            workspaceId={workspaceId}
            workspaceName={workspaceName}
            active={filesPanelEnabled && visible && activeTabId === "files"}
            refreshVersion={refreshVersion}
            showHiddenFiles={showHiddenFiles}
            onRefresh={refreshFiles}
            onSelect={selectFile}
            onContextMenu={openMenu}
          />
        </div>
        <div
          aria-hidden={!reviewPanelEnabled || activeTabId !== "review"}
          className="absolute inset-0"
          hidden={!reviewPanelEnabled || activeTabId !== "review"}
        >
          <ReviewPane
            active={reviewPanelEnabled && visible && activeTabId === "review"}
            refreshVersion={reviewRefreshVersion}
            workspaceId={workspaceId}
            onOpenFile={onOpenFile}
            onRefresh={() => setReviewRefreshVersion((version) => version + 1)}
          />
        </div>
        {monitorPanelEnabled && (
          <div
            aria-hidden={activeTabId !== "monitor"}
            className="absolute inset-0"
            hidden={activeTabId !== "monitor"}
          >
            <MonitorPanel
              active={visible && activeTabId === "monitor"}
              onOpenTerminal={onOpenTerminal}
            />
          </div>
        )}
        {sessionsPanelEnabled && (
          <div className="absolute inset-0" hidden={activeTabId !== "sessions"}>
            <SessionsPanel
              active={visible && activeTabId === "sessions"}
              workspacePath={workspacePath}
              onResume={onResumeSession}
              onOpenTerminal={onOpenTerminal}
            />
          </div>
        )}
        {(notesPanelEnabled || boardPanelEnabled) && workspaceId && (
          <div
            className="h-full min-h-0"
            hidden={activeTabId !== "notes" && activeTabId !== "board"}
          >
            <NotesPane
              key={workspaceId}
              workspaceName={workspaceName ?? "Workspace"}
              workspaceId={workspaceId}
              visible={visible && (activeTabId === "notes" || activeTabId === "board")}
              onOpenFile={onOpenFile}
            />
          </div>
        )}
        {browserTabs.map((browserTab) => {
          const active =
            browserPanelEnabled &&
            activeTabId === browserTab.id &&
            (!browserTab.workspaceId || browserTab.workspaceId === workspaceId);
          return (
            <div
              key={browserTab.id}
              aria-hidden={!active}
              className="absolute inset-0"
              hidden={!active}
            >
              {browserTab.mounted && browserTab.initialUrl && (
                <BrowserPane
                  workspaceName={workspaceName}
                  tabId={browserTab.id}
                  active={active && visible}
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
      {tabMenu && (
        <div
          role="dialog"
          ref={tabMenuRef}
          aria-label="Browser tab actions"
          className="fixed z-50 w-52 rounded-lg border border-border bg-popover p-1 shadow-lg"
          style={{ left: tabMenu.x, top: tabMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="px-2 py-1.5">
            <p className="mb-1 text-ui-xs text-foreground-subtlest">Tab belongs to</p>
            <BrowserScopePicker
              title="Tab scope"
              subtitle="Choose where this tab is available"
              value={browserTabs.find((tab) => tab.id === tabMenu.id)?.workspaceId ?? null}
              workspaceId={workspaceId}
              workspaceName={workspaceName}
              active={visible}
              onChange={(scope) => moveBrowserTab(tabMenu.id, scope)}
            />
          </div>
        </div>
      )}
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
