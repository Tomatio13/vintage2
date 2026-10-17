import { ChevronDown, ChevronRight, Folder, FolderOpen, RefreshCw } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import type { WorkspaceFileEntry } from "../../shared/desktop.js";
import { useUiStore } from "../store/uiStore.js";
import { Button } from "./Button.js";
import { LanguageIcon } from "./ReviewPane.js";

const emptyPaths: string[] = [];
const rowHeight = 32;
const overscan = 8;
interface Listing {
  entries: WorkspaceFileEntry[];
  error?: boolean;
}
interface Row {
  entry: WorkspaceFileEntry;
  depth: number;
}

/** One cache and bounded request queue per workspace; off-screen rows have no React subscriptions. */
export const WorkspaceFiles = memo(function WorkspaceFiles({
  workspaceId,
  workspaceName,
  active,
  refreshVersion,
  showHiddenFiles,
  onRefresh,
  onSelect,
  onContextMenu,
}: {
  workspaceId: string | null;
  workspaceName?: string | null | undefined;
  active: boolean;
  refreshVersion: number;
  showHiddenFiles: boolean;
  onRefresh(): void;
  onSelect(path: string): void;
  onContextMenu(event: MouseEvent, entry: WorkspaceFileEntry | null): void;
}) {
  const expandedPaths = useUiStore((state) =>
    workspaceId ? (state.expandedFileFolders[workspaceId] ?? emptyPaths) : emptyPaths,
  );
  const setExpanded = useUiStore((state) => state.setFileFolderExpanded);
  const expanded = useMemo(() => new Set(expandedPaths), [expandedPaths]);
  const [listings, setListings] = useState<Record<string, Listing>>({});
  const cache = useRef(listings);
  const [loading, setLoading] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ top: 0, height: 600 });
  const scheduler = useRef({
    running: 0,
    pending: new Map<string, Promise<void>>(),
    queue: [] as (() => void)[],
  });
  const alive = useRef(true);
  const activeRef = useRef(active);
  activeRef.current = active;
  const load = useRef<(path: string) => Promise<void>>(async () => {});
  load.current = (path) => {
    const state = scheduler.current;
    const existing = state.pending.get(path);
    if (existing) return existing;
    const promise = new Promise<void>((resolve) => {
      const job = () => {
        state.running++;
        void (async () => {
          try {
            if (!alive.current || !activeRef.current || !workspaceId || !window.desktop) return;
            const entries = await window.desktop.listWorkspaceFiles(
              workspaceId,
              ...(path ? [path] : []),
            );
            if (!alive.current) return;
            const previous = cache.current[path];
            if (
              previous &&
              !previous.error &&
              previous.entries.length === entries.length &&
              entries.every((entry, i) => {
                const old = previous.entries[i];
                return (
                  old?.path === entry.path && old.kind === entry.kind && old.name === entry.name
                );
              })
            )
              return;
            cache.current = { ...cache.current, [path]: { entries } };
            setListings(cache.current);
          } catch {
            if (alive.current) {
              cache.current = {
                ...cache.current,
                [path]: { entries: cache.current[path]?.entries ?? [], error: true },
              };
              setListings(cache.current);
            }
          } finally {
            state.pending.delete(path);
            state.running--;
            queueMicrotask(() => {
              if (state.running < 4) state.queue.shift()?.();
            });
            resolve();
          }
        })();
      };
      // Start on a microtask so the promise is registered before synchronous exits.
      state.queue.push(job);
      queueMicrotask(() => {
        if (state.running < 4) state.queue.shift()?.();
      });
    });
    state.pending.set(path, promise);
    return promise;
  };
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const { rows, directories } = useMemo(() => {
    const rows: Row[] = [];
    const directories = [""];
    const stack = [...(listings[""]?.entries ?? [])]
      .reverse()
      .map((entry) => ({ entry, depth: 0 }));
    while (stack.length) {
      const row = stack.pop()!;
      if (!showHiddenFiles && row.entry.name.startsWith(".")) continue;
      rows.push(row);
      if (row.entry.kind !== "directory" || !expanded.has(row.entry.path)) continue;
      directories.push(row.entry.path);
      const children = listings[row.entry.path]?.entries ?? [];
      for (let i = children.length - 1; i >= 0; i--)
        stack.push({ entry: children[i]!, depth: row.depth + 1 });
    }
    return { rows, directories };
  }, [listings, expanded, showHiddenFiles]);
  const directoriesRef = useRef(directories);
  directoriesRef.current = directories;
  useEffect(() => {
    if (!active || !workspaceId) return;
    for (const path of directories) if (!cache.current[path]) void load.current(path);
  }, [active, workspaceId, directories]);
  useEffect(() => {
    if (!active || !workspaceId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      setLoading(true);
      await Promise.all(directoriesRef.current.map((path) => load.current(path)));
      if (!cancelled) {
        setLoading(false);
        timer = setTimeout(() => void refresh(), 3000);
      }
    };
    void refresh();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active, workspaceId, refreshVersion]);
  useEffect(() => {
    const element = host.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() =>
      setViewport({ top: element.scrollTop, height: element.clientHeight }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const start = Math.max(
    0,
    Math.min(Math.floor(viewport.top / rowHeight) - overscan, rows.length - 1),
  );
  const end = Math.min(rows.length, start + Math.ceil(viewport.height / rowHeight) + overscan * 2);
  const root = listings[""];
  return (
    <div
      ref={host}
      data-files-scroll
      className="h-full overflow-y-auto p-2"
      onScroll={(event) =>
        setViewport({
          top: event.currentTarget.scrollTop,
          height: event.currentTarget.clientHeight || 600,
        })
      }
      onContextMenu={(event) => onContextMenu(event, null)}
    >
      {workspaceId ? (
        <>
          <div className="flex h-8 items-center justify-between gap-2 px-2">
            <span className="truncate text-ui-xs font-medium text-foreground-subtlest">
              {workspaceName === "Home" ? "Home directory" : workspaceName}
            </span>
            <Button
              aria-label="Refresh"
              title="Refresh"
              size="icon"
              variant="ghost"
              className="size-7 px-0"
              disabled={loading}
              onClick={onRefresh}
            >
              <RefreshCw className={`size-4${loading ? " animate-spin" : ""}`} />
            </Button>
          </div>
          {root?.error && (
            <p className="p-2 text-ui-sm text-destructive">Unable to read this location.</p>
          )}
          {!root ? (
            <p className="p-2 text-ui-sm text-foreground-subtle">Loading files…</p>
          ) : !rows.length ? (
            <p className="p-2 text-ui-sm text-foreground-subtle">
              {root.entries.length ? "Hidden files are hidden." : "No files in this location."}
            </p>
          ) : (
            <div data-files-rows>
              <div aria-hidden="true" style={{ height: start * rowHeight }} />
              {rows.slice(start, end).map(({ entry, depth }) => {
                const open = expanded.has(entry.path);
                const listing = listings[entry.path];
                return (
                  <div
                    key={entry.path}
                    className="flex h-8 items-center"
                    style={{ paddingLeft: depth * 12 }}
                  >
                    <button
                      type="button"
                      aria-label={entry.name}
                      className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-ui-sm hover:bg-hover"
                      aria-expanded={entry.kind === "directory" ? open : undefined}
                      onContextMenu={(event) => {
                        event.stopPropagation();
                        onContextMenu(event, entry);
                      }}
                      onDoubleClick={() => {
                        if (entry.kind === "file") onSelect(entry.path);
                      }}
                      onClick={() => {
                        if (entry.kind === "directory") setExpanded(workspaceId, entry.path, !open);
                      }}
                    >
                      {entry.kind === "file" ? (
                        <LanguageIcon path={entry.path} />
                      ) : (
                        <>
                          {open ? (
                            <ChevronDown className="size-4 shrink-0" />
                          ) : (
                            <ChevronRight className="size-4 shrink-0" />
                          )}
                          {open ? (
                            <FolderOpen className="size-4 shrink-0 text-foreground" />
                          ) : (
                            <Folder className="size-4 shrink-0 text-foreground" />
                          )}
                        </>
                      )}
                      <span className="truncate">{entry.name}</span>
                      {open && !listing && (
                        <span className="text-ui-xs text-foreground-subtlest">Loading…</span>
                      )}
                      {open &&
                        listing &&
                        !listing.error &&
                        !listing.entries.some(
                          (child) => showHiddenFiles || !child.name.startsWith("."),
                        ) && (
                          <span className="text-ui-xs text-foreground-subtlest">
                            {listing.entries.length ? "Hidden files are hidden." : "Empty folder"}
                          </span>
                        )}
                    </button>
                    {open && listing?.error && (
                      <button
                        type="button"
                        aria-label={`Retry ${entry.path}`}
                        className="shrink-0 px-2 text-ui-xs text-destructive"
                        onClick={() => void load.current(entry.path)}
                      >
                        Unable to load folder · Retry
                      </button>
                    )}
                  </div>
                );
              })}
              <div aria-hidden="true" style={{ height: (rows.length - end) * rowHeight }} />
            </div>
          )}
        </>
      ) : (
        <p className="p-2 text-ui-sm text-foreground-subtle">
          Open a workspace to browse its files.
        </p>
      )}
    </div>
  );
});
