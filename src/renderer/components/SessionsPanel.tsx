import { sessionPathsEqual, historyAgentStyle } from "../../shared/sessionHistory.js";
import { SessionConversation } from "./SessionConversation.js";
import { Button } from "./Button.js";
import { SettingsSelect } from "./SettingsSelect.js";
import { useMonitorSnapshot } from "../hooks/useMonitorSnapshot.js";
import { useUiStore } from "../store/uiStore.js";
import {
  ArrowLeft,
  Clock3,
  FolderOpen,
  History,
  Maximize2,
  Minimize2,
  Pin,
  Play,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type {
  HistorySession,
  SessionHistoryDetail,
  SessionHistoryList,
} from "../../shared/sessionHistory.js";

function dayLabel(timestamp: number) {
  const day = new Date(timestamp).toDateString();
  if (day === new Date().toDateString()) return "Today";
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return day === yesterday.toDateString()
    ? "Yesterday"
    : new Date(timestamp).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}
function loadPins(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem("vintage-session-pins") ?? "[]");
    return Array.isArray(value)
      ? value
          .filter((key): key is string => typeof key === "string" && /^[a-f0-9]{64}$/.test(key))
          .slice(0, 100)
      : [];
  } catch {
    return [];
  }
}
export function SessionsPanel({
  active,
  workspacePath,
  onResume,
  onOpenTerminal,
}: {
  active: boolean;
  workspacePath?: string | undefined;
  onResume?: ((session: HistorySession) => void) | undefined;
  onOpenTerminal?: ((paneId: string) => void) | undefined;
}) {
  const { snapshot } = useMonitorSnapshot(active);
  const historyRequest = useUiStore((state) => state.sessionHistoryRequest);
  const [list, setList] = useState<SessionHistoryList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [allProjects, setAllProjects] = useState(false);
  const [agent, setAgent] = useState("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<SessionHistoryDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [pins, setPins] = useState(loadPins);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!active) return;
    let stale = false;
    setRefreshing(true);
    setError(null);
    const bridge = window.desktop;
    if (!bridge?.listSessionHistory) {
      setError("Session history is available in the desktop app.");
      setRefreshing(false);
      return;
    }
    void bridge
      .listSessionHistory(refreshVersion > 0)
      .then((result) => {
        if (!stale) setList(result);
      })
      .catch((reason: unknown) => {
        if (!stale)
          setError(reason instanceof Error ? reason.message : "Unable to load session history.");
      })
      .finally(() => {
        if (!stale) setRefreshing(false);
      });
    return () => {
      stale = true;
    };
  }, [active, refreshVersion]);
  useEffect(() => {
    setSelectedKey(null);
    setDetail(null);
  }, [workspacePath]);
  useEffect(() => {
    if (!active || !list || !historyRequest) return;
    const session = list.sessions.find(
      (item) => item.agent === historyRequest.agent && item.sessionId === historyRequest.sessionId,
    );
    setAllProjects(true);
    setAgent("all");
    setQuery("");
    setSelectedKey(session?.key ?? null);
    if (!session)
      setError("This session is not available in the saved history yet. Try Refresh sessions.");
    useUiStore.setState({ sessionHistoryRequest: null });
  }, [active, list, historyRequest]);
  useEffect(() => {
    if (!active || !selectedKey) return;
    let stale = false;
    setDetail(null);
    setDetailError(null);
    void window.desktop
      ?.getSessionHistoryDetail(selectedKey)
      .then((result) => {
        if (!stale) setDetail(result);
      })
      .catch((reason: unknown) => {
        if (!stale)
          setDetailError(reason instanceof Error ? reason.message : "Unable to read session.");
      });
    return () => {
      stale = true;
    };
  }, [selectedKey, active, refreshVersion]);
  useEffect(() => {
    if (!active) setExpanded(false);
  }, [active]);
  useEffect(() => {
    if (expanded) dialog.current?.showModal();
  }, [expanded]);
  const sessions = useMemo(
    () =>
      (list?.sessions ?? []).filter(
        (session) =>
          (allProjects ||
            (workspacePath !== undefined &&
              sessionPathsEqual(
                session.cwd,
                workspacePath,
                window.desktop?.platform === "win32",
              ))) &&
          (agent === "all" || agent === session.agent) &&
          `${session.title}\n${session.preview}\n${session.cwd}`
            .toLocaleLowerCase()
            .includes(query.trim().toLocaleLowerCase()),
      ),
    [list, allProjects, workspacePath, agent, query],
  );
  const groups = new Map<string, HistorySession[]>();
  for (const session of sessions) {
    const label = pins.includes(session.key) ? "Pinned" : dayLabel(session.updatedAt);
    groups.set(label, [...(groups.get(label) ?? []), session]);
  }
  const orderedGroups = [...groups].sort(([a], [b]) =>
    a === "Pinned" ? -1 : b === "Pinned" ? 1 : 0,
  );
  const selected = sessions.find((session) => session.key === selectedKey);
  const liveSession =
    selected &&
    snapshot?.sessions.find(
      (session) => session.agent === selected.agent && session.sessionId === selected.sessionId,
    );
  const togglePin = (key: string) => {
    const next = pins.includes(key)
      ? pins.filter((item) => item !== key)
      : [...pins, key].slice(-100);
    setPins(next);
    try {
      localStorage.setItem("vintage-session-pins", JSON.stringify(next));
    } catch {
      /* Pinning still works for this window. */
    }
  };
  const content = (
    <section
      className="@container flex h-full min-h-0 flex-col bg-panel text-foreground"
      aria-label="Session history"
    >
      <header className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2.5">
        <h2 className="flex items-center gap-2 text-ui-sm font-semibold">
          <History className="size-4 text-foreground-subtle" />
          Sessions{" "}
          <span className="font-normal text-foreground-subtlest">
            {list ? sessions.length : ""}
          </span>
        </h2>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            aria-label="Refresh sessions"
            disabled={refreshing}
            onClick={() => setRefreshVersion((value) => value + 1)}
            variant="ghost"
            size="icon"
          >
            <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
          <Button
            type="button"
            aria-label={expanded ? "Collapse sessions" : "Expand sessions"}
            onClick={() => setExpanded((value) => !value)}
            variant="ghost"
            size="icon"
          >
            {expanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </Button>
          {expanded && (
            <Button
              type="button"
              aria-label="Close expanded sessions"
              onClick={() => setExpanded(false)}
              variant="ghost"
              size="icon"
            >
              <X className="size-4" />
            </Button>
          )}
        </div>
      </header>
      <div className="space-y-2 border-b border-border p-3">
        <label className="flex h-9 items-center gap-2 rounded-lg border border-border bg-panel px-3 focus-within:border-brand">
          <Search className="size-3.5 shrink-0 text-foreground-subtlest" />
          <input
            aria-label="Search sessions"
            placeholder="Search titles and requests…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedKey(null);
            }}
            className="min-w-0 flex-1 bg-transparent text-ui-sm outline-none"
          />
        </label>
        <div className="flex gap-2 text-ui-xs">
          <SettingsSelect
            label="Session project"
            value={allProjects ? "all" : "current"}
            onChange={(value) => {
              setAllProjects(value === "all");
              setSelectedKey(null);
            }}
            className="min-w-0 flex-1"
            triggerClassName="w-full"
            options={[
              { id: "current", label: "Current project" },
              { id: "all", label: "All projects" },
            ]}
          />
          <SettingsSelect
            label="Session agent"
            value={agent}
            onChange={(value) => {
              setAgent(value);
              setSelectedKey(null);
            }}
            className="min-w-0 flex-1"
            triggerClassName="w-full"
            options={[
              { id: "all", label: "All agents" },
              { id: "codex", label: "Codex" },
              { id: "claude", label: "Claude Code" },
              { id: "grok", label: "Grok" },
              { id: "antigravity", label: "Antigravity" },
            ]}
          />
        </div>
      </div>
      {error && (
        <p role="alert" className="p-3 text-ui-xs text-rose-500">
          {error}
        </p>
      )}
      {list?.warnings.map((warning) => (
        <p key={warning} className="px-3 pt-2 text-ui-xs text-foreground-subtle">
          {warning}
        </p>
      ))}
      <div className="flex min-h-0 flex-1">
        <div
          className={`${selected ? "hidden @3xl:block" : "block"} min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden @3xl:max-w-sm @3xl:border-r @3xl:border-border`}
          tabIndex={0}
          aria-label="Saved sessions"
        >
          {!list && refreshing && (
            <p role="status" className="p-5 text-ui-sm text-foreground-subtle">
              Loading saved sessions…
            </p>
          )}
          {list && !sessions.length && (
            <div className="p-6 text-ui-sm text-foreground-subtle">
              <p>No saved sessions found.</p>
              <p className="mt-2 text-ui-xs">
                {query
                  ? "Try a different search or filter."
                  : "Codex, Claude Code, Grok and Antigravity history appears here. Try All projects to browse other folders."}
              </p>
            </div>
          )}
          {orderedGroups.map(([label, items]) => (
            <div key={label} className="pb-3">
              <h3 className="px-4 pb-1 pt-4 text-ui-xs font-medium text-foreground-subtlest">
                {label}
              </h3>
              {items.map((session) => (
                <button
                  type="button"
                  key={session.key}
                  onClick={() => setSelectedKey(session.key)}
                  aria-pressed={selectedKey === session.key}
                  className={`flex w-full gap-3 px-4 py-3 text-left ${selectedKey === session.key ? "bg-selected" : "hover:bg-hover"}`}
                >
                  <span
                    className={`mt-0.5 self-start rounded-md px-1.5 py-1 text-[10px] font-medium ${historyAgentStyle[session.agent].color}`}
                  >
                    {historyAgentStyle[session.agent].badge}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ui-sm font-medium">{session.title}</span>
                    <span className="mt-1 block truncate text-ui-xs text-foreground-subtlest">
                      {allProjects
                        ? `${session.cwd.replaceAll("\\", "/").split("/").filter(Boolean).at(-1)} · `
                        : ""}
                      {new Date(session.updatedAt).toLocaleTimeString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      · {historyAgentStyle[session.agent].name}
                    </span>
                    <span className="mt-1 block truncate text-ui-xs text-foreground-subtle">
                      {session.preview}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
        <div
          className={`${selected ? "flex" : "hidden @3xl:flex"} min-h-0 min-w-0 flex-1 flex-col`}
        >
          {!selected ? (
            <div className="m-auto p-8 text-center text-ui-sm text-foreground-subtlest">
              Select a session to revisit the conversation.
            </div>
          ) : (
            <>
              <div className="shrink-0 border-b border-border p-3 @3xl:p-4">
                <Button
                  type="button"
                  onClick={() => setSelectedKey(null)}
                  variant="ghost"
                  size="compact"
                  className="mb-2 @3xl:hidden"
                >
                  <ArrowLeft className="size-3.5" />
                  Back
                </Button>
                <section
                  aria-label="Session summary"
                  className="overflow-hidden rounded-xl border border-border bg-background/60"
                >
                  <div className="space-y-3 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="inline-flex min-w-0 items-center gap-2 text-ui-xs font-medium text-foreground-subtle">
                        <span
                          aria-hidden="true"
                          className={`flex size-6 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold ${historyAgentStyle[selected.agent].color}`}
                        >
                          {historyAgentStyle[selected.agent].badge}
                        </span>
                        {historyAgentStyle[selected.agent].name}
                      </span>
                      <Button
                        type="button"
                        aria-label={pins.includes(selected.key) ? "Unpin session" : "Pin session"}
                        aria-pressed={pins.includes(selected.key)}
                        onClick={() => togglePin(selected.key)}
                        variant="ghost"
                        size="icon"
                        className="size-7"
                      >
                        <Pin
                          className={`size-3.5 ${pins.includes(selected.key) ? "text-brand" : "text-foreground-subtlest"}`}
                        />
                      </Button>
                    </div>
                    <h3 className="break-words text-ui-base font-semibold leading-relaxed text-foreground">
                      {selected.title}
                    </h3>
                    <p
                      className="flex min-w-0 items-center gap-2 text-ui-xs text-foreground-subtle"
                      title={selected.cwd}
                    >
                      <FolderOpen
                        aria-hidden="true"
                        className="size-3.5 shrink-0 text-foreground-subtlest"
                      />
                      <span className="truncate">{selected.cwd}</span>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 border-t border-border bg-panel/40 px-4 py-3">
                    <span
                      className="flex items-center gap-2 text-ui-xs text-foreground-subtlest"
                      title="Last updated"
                    >
                      <Clock3 aria-hidden="true" className="size-3.5 shrink-0" />
                      <time dateTime={new Date(selected.updatedAt).toISOString()}>
                        {new Date(selected.updatedAt).toLocaleString()}
                      </time>
                    </span>
                    <Button
                      type="button"
                      disabled={
                        liveSession
                          ? !liveSession.paneId || !onOpenTerminal
                          : !selected.canResume || !onResume
                      }
                      onClick={() => {
                        try {
                          if (liveSession?.paneId) onOpenTerminal?.(liveSession.paneId);
                          else onResume?.(selected);
                          setExpanded(false);
                        } catch (reason) {
                          setDetailError(
                            reason instanceof Error ? reason.message : "Unable to resume session.",
                          );
                        }
                      }}
                      variant="ghost"
                      size="compact"
                      className="ml-auto"
                    >
                      <Play className="size-3.5" />
                      {liveSession ? "Open terminal" : "Resume in new Space"}
                    </Button>
                  </div>
                </section>
                <div className="mt-2 space-y-1 px-1">
                  {liveSession && !liveSession.paneId && (
                    <p className="text-ui-xs text-foreground-subtlest">
                      This session is already open outside VINTAGE.
                    </p>
                  )}
                  {!selected.canResume && (
                    <p className="text-ui-xs text-foreground-subtlest">
                      Resume is unavailable for this session or platform.
                    </p>
                  )}
                </div>
              </div>
              <div
                tabIndex={0}
                aria-label="Conversation scroll area"
                className="min-h-0 flex-1 space-y-5 overflow-y-auto overflow-x-hidden p-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden @3xl:px-8 @3xl:py-6"
              >
                {detailError && (
                  <p role="alert" className="text-ui-xs text-rose-500">
                    {detailError}
                  </p>
                )}
                {!detail && !detailError && (
                  <p role="status" className="text-ui-sm text-foreground-subtle">
                    Loading conversation…
                  </p>
                )}
                {detail?.truncated && (
                  <p className="text-ui-xs text-foreground-subtlest">
                    Showing excerpts from a large session. Some messages or text are omitted.
                  </p>
                )}
                {detail && !detail.messages.length && (
                  <p className="text-ui-sm text-foreground-subtle">
                    No conversation text is available.
                  </p>
                )}
                {detail && (
                  <SessionConversation
                    key={selected.key}
                    messages={detail.messages}
                    agent={selected.agent}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
  return expanded
    ? createPortal(
        <dialog
          ref={dialog}
          aria-label="Expanded sessions"
          onCancel={(event) => {
            event.preventDefault();
            setExpanded(false);
          }}
          className="fixed inset-4 m-0 h-[calc(100%-2rem)] max-h-none w-[calc(100%-2rem)] max-w-none overflow-hidden rounded-2xl border border-border bg-panel p-0 shadow-2xl backdrop:bg-black/40"
        >
          {content}
        </dialog>,
        document.body,
      )
    : content;
}
