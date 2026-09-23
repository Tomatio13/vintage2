import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  File,
  Folder,
  FolderOpen,
  Globe2,
  Plus,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { WorkspaceFileEntry } from "../../shared/desktop.js";
import { useUiStore } from "../store/uiStore.js";
import { BrowserPane } from "./BrowserPane.js";
import { Button } from "./Button.js";

interface BrowserTab {
  id: string;
  title: string;
  initialUrl: string | null;
  mounted: boolean;
}

const firstBrowserTab: BrowserTab = {
  id: "browser-1",
  title: "Browser",
  initialUrl: null,
  mounted: false,
};

export function SidePane({
  workspaceId,
  workspaceName,
  onOpenFile,
}: {
  workspaceId: string | null;
  workspaceName?: string | null;
  onOpenFile(path: string): void;
}) {
  const [activeTabId, setActiveTabId] = useState("files");
  const [browserTabs, setBrowserTabs] = useState<BrowserTab[]>([firstBrowserTab]);
  const [nextBrowserTabNumber, setNextBrowserTabNumber] = useState(2);
  const browserTabElements = useRef(new Map<string, HTMLDivElement>());
  const [files, setFiles] = useState<WorkspaceFileEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [revealHiddenFiles, setRevealHiddenFiles] = useState(false);
  const showHiddenFiles = workspaceName !== "Home" || revealHiddenFiles;
  const visibleFiles = showHiddenFiles
    ? files
    : files.filter((entry) => !entry.name.startsWith("."));
  useEffect(() => {
    setFiles([]);
    setError(null);
    if (!workspaceId || !window.desktop) return;
    let cancelled = false;
    setLoading(true);
    void window.desktop
      .listWorkspaceFiles(workspaceId)
      .then((entries) => {
        if (!cancelled) setFiles(entries);
      })
      .catch(() => {
        if (!cancelled) setError("Unable to read this location.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  useEffect(() => {
    if (activeTabId === "files") return;
    browserTabElements.current.get(activeTabId)?.scrollIntoView?.({
      block: "nearest",
      inline: "nearest",
    });
  }, [activeTabId]);

  const activateBrowserTab = (tabId: string) => {
    setActiveTabId(tabId);
    setBrowserTabs((currentTabs) =>
      currentTabs.map((browserTab) =>
        browserTab.id === tabId
          ? {
              ...browserTab,
              initialUrl: browserTab.initialUrl ?? useUiStore.getState().browserDefaultUrl,
              mounted: true,
            }
          : browserTab,
      ),
    );
  };

  const addBrowserTab = () => {
    const number = nextBrowserTabNumber;
    const newTab: BrowserTab = {
      id: `browser-${number}`,
      title: `Browser ${number}`,
      initialUrl: useUiStore.getState().browserDefaultUrl,
      mounted: true,
    };
    setNextBrowserTabNumber(number + 1);
    setBrowserTabs((currentTabs) => [...currentTabs, newTab]);
    setActiveTabId(newTab.id);
  };

  const closeBrowserTab = (tabId: string) => {
    const tabIndex = browserTabs.findIndex((browserTab) => browserTab.id === tabId);
    if (tabIndex < 0) return;

    const remainingTabs = browserTabs.filter((browserTab) => browserTab.id !== tabId);
    setBrowserTabs(remainingTabs);
    if (activeTabId === tabId) {
      const nextTab = remainingTabs[Math.max(0, tabIndex - 1)] ?? remainingTabs[0];
      setActiveTabId(nextTab?.id ?? "files");
    }
  };

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
          onClick={() => setActiveTabId("files")}
          type="button"
        >
          <FolderOpen aria-hidden="true" className="size-3.5" />
          <span>Files</span>
        </button>
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
          <div className="h-full overflow-y-auto p-2">
            {error ? (
              <p className="p-2 text-ui-sm text-destructive">{error}</p>
            ) : workspaceId ? (
              <>
                {workspaceName && (
                  <div className="px-2 pb-1 pt-1 text-ui-xs font-medium text-foreground-subtlest">
                    {workspaceName === "Home" ? "Home directory" : workspaceName}
                  </div>
                )}
                {loading ? (
                  <p className="p-2 text-ui-sm text-foreground-subtle">Loading files…</p>
                ) : visibleFiles.length > 0 ? (
                  visibleFiles.map((entry) => (
                    <FileTree
                      key={entry.path}
                      entry={entry}
                      workspaceId={workspaceId}
                      showHiddenFiles={showHiddenFiles}
                      onSelect={onOpenFile}
                    />
                  ))
                ) : (
                  <p className="p-2 text-ui-sm text-foreground-subtle">
                    {files.length > 0 ? "Hidden files are hidden." : "No files in this location."}
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
                <BrowserPane initialUrl={browserTab.initialUrl} />
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
function FileTree({
  entry,
  workspaceId,
  showHiddenFiles,
  onSelect,
}: {
  entry: WorkspaceFileEntry;
  workspaceId: string;
  showHiddenFiles: boolean;
  onSelect(path: string): void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<WorkspaceFileEntry[] | null>(entry.children ?? null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const visibleChildren = children?.filter(
    (child) => showHiddenFiles || !child.name.startsWith("."),
  );
  const loadChildren = () => {
    if (loading || children !== null) return;
    const listFiles = window.desktop?.listWorkspaceFiles;
    if (!listFiles) {
      setLoadError(true);
      return;
    }
    setLoadError(false);
    setLoading(true);
    void listFiles(workspaceId, entry.path)
      .then(setChildren)
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };
  if (entry.kind === "file")
    return (
      <button
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-ui-sm hover:bg-hover"
        onDoubleClick={() => onSelect(entry.path)}
      >
        <File className="size-4 shrink-0 text-foreground-subtlest" />
        <span className="truncate">{entry.name}</span>
      </button>
    );
  return (
    <div>
      <button
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
          {loading ? (
            <p className="px-2 py-1 text-ui-xs text-foreground-subtlest">Loading…</p>
          ) : loadError ? (
            <button
              className="px-2 py-1 text-ui-xs text-destructive hover:underline"
              onClick={loadChildren}
            >
              Unable to load folder · Retry
            </button>
          ) : visibleChildren?.length ? (
            visibleChildren.map((child) => (
              <FileTree
                key={child.path}
                entry={child}
                workspaceId={workspaceId}
                showHiddenFiles={showHiddenFiles}
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
