import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { Terminal } from "@xterm/xterm";
import {
  Bell,
  BellOff,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Search,
  Sparkles,
  TriangleAlert,
  TerminalSquare,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import {
  DEFAULT_TERMINAL_MONITOR_MODE,
  type AttentionLevel,
  type TerminalAttentionState,
  type TerminalMonitorMode,
} from "../../shared/desktop.js";
import { bindingMatchesEvent, shortcutBinding, shortcutLabel } from "../lib/shortcuts.js";
import { useUiStore } from "../store/uiStore.js";

function resolveTerminalTheme() {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  const brand = read("--color-brand", "#c6a66b");
  return {
    background: read("--color-terminal", "#191816"),
    foreground: read("--color-foreground", "#e6e1d8"),
    cursor: brand,
    selectionBackground: brand.length === 7 ? brand + "66" : brand,
  };
}

function attentionLabel(state: TerminalAttentionState | null): string | null {
  if (!state) return null;
  if (state.monitorMode === "agent_monitor" && state.attentionLevel === 0) {
    if (state.status === "running") return "◉ Running";
    if (
      state.status === "thinking" &&
      (state.source === "jev" || state.reason === "agent_activity")
    ) {
      return "◌ Thinking";
    }
    if (state.source === "jev" && state.status === "waiting") return "◷ Waiting";
    if (state.source === "jev" && state.status === "completed") return "✓ Completed";
  }
  if (state.attentionLevel === 0) return null;
  if (state.reason === "long_running_completed") return "✓ Long command completed";
  if (state.reason === "error_output") return "✕ Error output";
  if (state.reason === "warning_output") return "⚠ Warning";
  if (state.status === "completed") return "✓ Completed";
  if (state.status === "failed") return "✕ Failed";
  if (state.status === "waiting_input") return "◉ Input needed";
  if (state.status === "warning") return "⚠ Warning";
  return null;
}

function attentionNotificationBody(state: TerminalAttentionState): string {
  if (state.reason === "error_output") return "Error output detected";
  if (state.reason === "input_request") return "Terminal input is required";
  if (state.reason === "semantic_judgment") {
    if (state.status === "waiting_input") return "Jev detected that terminal input may be required";
    if (state.status === "failed") return "Jev detected a terminal failure";
    return "Jev found a result worth reviewing";
  }
  if (state.reason === "command_failed") {
    return state.lastExitCode === undefined
      ? "Command failed"
      : `Command failed with exit code ${state.lastExitCode}`;
  }
  if (state.reason === "session_ended") {
    return state.lastExitCode === undefined
      ? "Terminal session ended"
      : `Terminal session ended with exit code ${state.lastExitCode}`;
  }
  return "Terminal needs attention";
}

const monitorModeLabels: Record<TerminalMonitorMode, string> = {
  monitor: "Monitor",
  agent_monitor: "Agent Monitor",
  ignore: "Ignore",
  mute: "Mute",
  always_notify: "Always Notify",
  ignore_until_error: "Errors Only",
};

const monitorModeTriggerLabels: Record<TerminalMonitorMode, string> = {
  monitor: "Monitor",
  agent_monitor: "Agent Monitor",
  ignore: "Ignore",
  mute: "Mute",
  always_notify: "Always Notify",
  ignore_until_error: "Errors Only",
};

const monitorModeOptions = [
  {
    value: "monitor",
    label: "Monitor",
    description: "Show attention at your chosen threshold",
    Icon: Eye,
  },
  {
    value: "agent_monitor",
    label: "Agent Monitor",
    description: "Use configured Jev to check agent state periodically",
    Icon: Sparkles,
  },
  {
    value: "ignore",
    label: "Ignore",
    description: "Hide all terminal attention",
    Icon: EyeOff,
  },
  {
    value: "mute",
    label: "Mute",
    description: "Keep attention visible, but silence alerts",
    Icon: BellOff,
  },
  {
    value: "always_notify",
    label: "Always Notify",
    description: "Notify for every attention event",
    Icon: Bell,
  },
  {
    value: "ignore_until_error",
    label: "Errors Only",
    description: "Hide routine results; show errors",
    Icon: TriangleAlert,
  },
] as const satisfies readonly {
  value: TerminalMonitorMode;
  label: string;
  description: string;
  Icon: typeof Eye;
}[];

interface MonitorMenuPosition {
  top: number;
  left: number;
}

function TerminalMonitorPicker({
  title,
  mode,
  disabled,
  active,
  onChange,
}: {
  title: string;
  mode: TerminalMonitorMode;
  disabled: boolean;
  active: boolean;
  onChange: (mode: TerminalMonitorMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MonitorMenuPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = `terminal-monitor-menu-${useId()}`;

  useEffect(() => {
    if (!active) setOpen(false);
  }, [active]);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;

    const triggerRect = trigger.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const gutter = 8;
    const maxLeft = Math.max(gutter, window.innerWidth - menuRect.width - gutter);
    const left = Math.min(maxLeft, Math.max(gutter, triggerRect.right - menuRect.width));
    const spaceBelow = window.innerHeight - triggerRect.bottom - gutter;
    const spaceAbove = triggerRect.top - gutter;
    const placeBelow = spaceBelow >= menuRect.height || spaceBelow >= spaceAbove;
    const top = placeBelow
      ? Math.min(triggerRect.bottom + 6, window.innerHeight - menuRect.height - gutter)
      : Math.max(gutter, triggerRect.top - menuRect.height - 6);

    setPosition((current) =>
      current?.top === top && current.left === left ? current : { top, left },
    );
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }

    updatePosition();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updatePosition);
    if (observer && triggerRef.current) observer.observe(triggerRef.current);
    if (observer && menuRef.current) observer.observe(menuRef.current);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    const selectedItem = menuRef.current?.querySelector<HTMLButtonElement>(
      '[role="menuitemradio"][aria-checked="true"]',
    );
    selectedItem?.focus();

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;

    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", handleOutsidePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const closeAfterSelection = (nextMode: TerminalMonitorMode) => {
    onChange(nextMode);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = [
      ...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? []),
    ];
    if (items.length === 0) return;

    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    let nextIndex: number | null = null;
    if (event.key === "ArrowDown") nextIndex = (currentIndex + 1 + items.length) % items.length;
    if (event.key === "ArrowUp") nextIndex = (currentIndex - 1 + items.length) % items.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = items.length - 1;
    if (nextIndex !== null) {
      event.preventDefault();
      items[nextIndex]?.focus();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`${title} monitor mode`}
        className="flex h-7 w-32 shrink-0 items-center justify-between gap-1.5 rounded-md bg-transparent px-2 text-ui-xs font-medium text-foreground-subtle transition-colors hover:bg-hover hover:text-foreground aria-expanded:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50"
        data-monitor-mode={mode}
        disabled={disabled}
        title={monitorModeLabels[mode]}
        type="button"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          setOpen(true);
        }}
      >
        <span className="min-w-0 flex-1 truncate text-left">{monitorModeTriggerLabels[mode]}</span>
        <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 text-foreground-subtle" />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            aria-label={`${title} monitor mode options`}
            className="fixed z-[70] flex max-h-[calc(100vh-1rem)] w-60 max-w-[calc(100vw-1rem)] flex-col overflow-y-auto rounded-lg border border-border bg-header p-1.5 text-foreground shadow-none"
            data-testid="terminal-monitor-menu"
            role="menu"
            style={{
              left: position?.left ?? 0,
              top: position?.top ?? 0,
              visibility: position ? "visible" : "hidden",
            }}
            onKeyDown={handleMenuKeyDown}
          >
            <div className="flex items-center justify-between gap-2 px-2 py-1.5">
              <div className="min-w-0">
                <p className="text-ui-sm font-semibold text-foreground">Monitor mode</p>
                <p className="truncate text-ui-xs text-foreground-subtlest">{title}</p>
              </div>
              <span className="shrink-0 font-mono text-[9px] font-semibold tracking-[0.12em] text-foreground-subtlest">
                TERMINAL
              </span>
            </div>
            <div aria-hidden="true" className="mx-2 my-1 h-px bg-border" />
            <div className="flex flex-col gap-0.5">
              {monitorModeOptions.map(({ value, label, description, Icon }) => {
                const selected = value === mode;
                return (
                  <button
                    key={value}
                    aria-checked={selected}
                    aria-label={label}
                    className={`flex min-h-11 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-hover focus-visible:bg-hover focus-visible:outline-none ${selected ? "bg-selected/70" : ""}`}
                    data-monitor-mode-option={value}
                    role="menuitemradio"
                    tabIndex={-1}
                    type="button"
                    onClick={() => closeAfterSelection(value)}
                  >
                    <span
                      className={`grid size-7 shrink-0 place-items-center ${selected ? "text-foreground" : "text-foreground-subtlest"}`}
                    >
                      <Icon aria-hidden="true" className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-ui-sm font-medium text-foreground">
                        {label}
                      </span>
                      <span className="block text-ui-xs leading-4 text-foreground-subtlest">
                        {description}
                      </span>
                    </span>
                    {selected ? <Check aria-hidden="true" className="size-4 shrink-0" /> : null}
                  </button>
                );
              })}
            </div>
            <div aria-hidden="true" className="mx-2 my-1 h-px bg-border" />
            <p className="px-2 py-1 text-ui-xs text-foreground-subtlest">
              Applies to this terminal only
            </p>
          </div>,
          document.body,
        )}
    </>
  );
}

export function TerminalPanel({
  workspaceId,
  title,
  tabTitle = title,
  paneId = title,
  active,
  onRename,
  onAttentionChange,
}: {
  workspaceId: string;
  tabTitle?: string;
  paneId?: string;
  title: string;
  active: boolean;
  onRename?: (title: string) => void;
  onAttentionChange?: (paneId: string, state: TerminalAttentionState | null) => void;
}) {
  const {
    desktopNotifications,
    terminalFontFamily,
    terminalFontSize,
    scrollback,
    shell,
    shortcuts,
    theme,
  } = useUiStore();
  const hostRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const sessionIdRef = useRef<string | null>(null);
  const searchOpenRef = useRef(false);
  const selectionCopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressSearchSelectionCopyRef = useRef(false);
  const [windowFocused, setWindowFocused] = useState(() => document.hasFocus());
  const activeRef = useRef(active && windowFocused);
  const desktopNotificationsRef = useRef(desktopNotifications);
  const findBinding = shortcutBinding(shortcuts, "find-in-terminal");
  const findShortcutLabel = findBinding
    ? window.desktop?.platform === "darwin"
      ? shortcutLabel(findBinding).replace(/^Ctrl\+/, "⌘")
      : shortcutLabel(findBinding)
    : "";
  const titleRef = useRef(title);
  const tabTitleRef = useRef(tabTitle);
  const notifiedAttentionEventsRef = useRef(new Map<string, number>());
  const onAttentionChangeRef = useRef(onAttentionChange);
  const [status, setStatus] = useState("Starting terminal…");
  const [attention, setAttention] = useState<TerminalAttentionState | null>(null);
  const [monitorMode, setMonitorMode] = useState<TerminalMonitorMode>(
    DEFAULT_TERMINAL_MONITOR_MODE,
  );
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchNoResults, setSearchNoResults] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);
  const commitTitle = () => {
    const nextTitle = draftTitle.trim();
    setEditingTitle(false);
    if (!nextTitle) return setDraftTitle(title);
    if (nextTitle !== title) onRename?.(nextTitle);
  };

  activeRef.current = active && windowFocused;
  desktopNotificationsRef.current = desktopNotifications;
  titleRef.current = title;
  tabTitleRef.current = tabTitle;
  onAttentionChangeRef.current = onAttentionChange;

  const suppressSearchSelectionCopy = () => {
    if (selectionCopyTimerRef.current !== null) {
      clearTimeout(selectionCopyTimerRef.current);
      selectionCopyTimerRef.current = null;
    }
    suppressSearchSelectionCopyRef.current = true;
    queueMicrotask(() => {
      suppressSearchSelectionCopyRef.current = false;
    });
  };

  const searchTerminal = (
    query: string,
    direction: "next" | "previous" = "next",
    incremental = false,
  ) => {
    const addon = searchAddonRef.current;
    if (!query) {
      suppressSearchSelectionCopy();
      addon?.clearDecorations();
      setSearchNoResults(false);
      return;
    }
    if (!addon) return;

    suppressSearchSelectionCopy();
    const found =
      direction === "previous"
        ? addon.findPrevious(query)
        : addon.findNext(query, incremental ? { incremental: true } : undefined);
    setSearchNoResults(!found);
  };

  const closeTerminalSearch = () => {
    searchOpenRef.current = false;
    searchTerminal("");
    setSearchQuery("");
    setSearchOpen(false);
    if (activeRef.current) terminalRef.current?.focus();
  };

  useEffect(() => {
    const syncWindowFocus = () => setWindowFocused(document.hasFocus());
    window.addEventListener("focus", syncWindowFocus);
    window.addEventListener("blur", syncWindowFocus);
    return () => {
      window.removeEventListener("focus", syncWindowFocus);
      window.removeEventListener("blur", syncWindowFocus);
    };
  }, []);

  useEffect(() => {
    const bridge = window.desktop;
    const host = hostRef.current;
    if (!bridge || !host) {
      setStatus("Desktop terminal is unavailable");
      return;
    }
    let disposed = false;
    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: terminalFontFamily,
      fontSize: terminalFontSize,
      scrollback,
      theme: resolveTerminalTheme(),
    });
    terminalRef.current = terminal;
    const fit = new FitAddon();
    const searchAddon = new SearchAddon();
    terminal.loadAddon(fit);
    terminal.loadAddon(searchAddon);
    searchAddonRef.current = searchAddon;
    terminal.open(host);
    fit.fit();
    terminal.attachCustomKeyEventHandler((event) => {
      // Read the binding from the store so rebinding applies without recreating the terminal.
      const findBinding = shortcutBinding(useUiStore.getState().shortcuts, "find-in-terminal");
      if (
        event.type === "keydown" &&
        findBinding &&
        bindingMatchesEvent(findBinding, event, bridge.platform)
      ) {
        event.preventDefault();
        if (searchOpenRef.current) {
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
        } else {
          searchOpenRef.current = true;
          setSearchOpen(true);
        }
        return false;
      }

      const pasteModifier = bridge.platform === "darwin" ? event.metaKey : event.ctrlKey;
      if (
        event.type !== "keydown" ||
        event.key.toLowerCase() !== "v" ||
        !pasteModifier ||
        event.altKey
      ) {
        return true;
      }

      const sessionId = sessionIdRef.current;
      if (!sessionId) return true;

      event.preventDefault();
      void bridge
        .pasteTerminalClipboard(sessionId)
        .then((result) => {
          if (sessionIdRef.current !== sessionId || terminalRef.current !== terminal) return;
          if (result.kind === "text") {
            terminal.paste(result.text);
          } else if (result.kind === "image") {
            terminal.paste(`Please inspect this image: ${JSON.stringify(result.filePath)}`);
          }
        })
        .catch(() => {
          if (sessionIdRef.current === sessionId) setStatus("Clipboard paste failed");
        });
      return false;
    });
    const selectionCopy = terminal.onSelectionChange(() => {
      if (suppressSearchSelectionCopyRef.current) return;
      if (selectionCopyTimerRef.current !== null) clearTimeout(selectionCopyTimerRef.current);
      selectionCopyTimerRef.current = null;
      const selection = terminal.getSelection();
      if (!selection) return;
      selectionCopyTimerRef.current = setTimeout(() => {
        selectionCopyTimerRef.current = null;
        if (suppressSearchSelectionCopyRef.current) return;
        const currentSelection = terminal.getSelection();
        if (currentSelection) void bridge.writeClipboardText(currentSelection).catch(() => {});
      }, 80);
    });
    const offData = bridge.onTerminalData((event) => {
      if (event.sessionId === sessionIdRef.current) terminal.write(event.data);
    });
    const offExit = bridge.onTerminalExit((event) => {
      if (event.sessionId === sessionIdRef.current) {
        terminal.writeln(`\r\n[process exited: ${event.exitCode}]`);
        setStatus("Stopped");
        sessionIdRef.current = null;
      }
    });
    const offAttention = bridge.onTerminalAttention((state) => {
      if (state.sessionId !== sessionIdRef.current) return;
      setAttention(state);
      onAttentionChangeRef.current?.(paneId, state);
      const mode = state.monitorMode ?? DEFAULT_TERMINAL_MONITOR_MODE;
      const notificationThreshold =
        mode === "always_notify" ? 1 : (state.notificationThreshold ?? 3);
      const notificationKey =
        mode !== "mute" &&
        mode !== "ignore" &&
        state.attentionLevel >= notificationThreshold &&
        (state.userActionRequired || mode === "always_notify")
          ? `${state.sessionId}:${state.reason ?? "unknown"}`
          : null;
      const notificationEventKey = JSON.stringify([
        state.sessionId,
        state.status,
        state.reason ?? null,
        state.semanticHash ?? null,
        state.lastExitCode ?? null,
        state.lastActivityAt,
      ]);
      const alreadyNotified = notifiedAttentionEventsRef.current.has(notificationEventKey);
      if (
        notificationKey &&
        desktopNotificationsRef.current &&
        (mode === "always_notify" || !document.hasFocus()) &&
        !alreadyNotified
      ) {
        notifiedAttentionEventsRef.current.set(notificationEventKey, Date.now());
        while (notifiedAttentionEventsRef.current.size > 200) {
          const oldest = notifiedAttentionEventsRef.current.keys().next().value;
          if (oldest === undefined) break;
          notifiedAttentionEventsRef.current.delete(oldest);
        }
        void bridge
          .showAttentionNotification({
            title: `VINTAGE · ${tabTitleRef.current} · ${titleRef.current}`.slice(0, 120),
            body: attentionNotificationBody(state),
            dedupeKey: notificationEventKey,
            attentionLevel: state.attentionLevel as AttentionLevel,
            targetPaneId: paneId,
            ...(mode === "always_notify" ? { force: true } : {}),
          })
          .catch(() => {});
      }
    });
    const input = terminal.onData((data) => {
      const sessionId = sessionIdRef.current;
      if (sessionId) void bridge.writeTerminal(sessionId, data);
    });
    const observer = new ResizeObserver(() => {
      if (disposed) return;
      fit.fit();
      const sessionId = sessionIdRef.current;
      if (sessionId)
        void bridge.resizeTerminal(sessionId, {
          cols: Math.max(2, terminal.cols),
          rows: Math.max(1, terminal.rows),
        });
    });
    observer.observe(host);
    void bridge
      .createTerminal({
        workspaceId,
        tabTitle: tabTitleRef.current,
        paneTitle: titleRef.current,
        shell,
        cols: Math.max(2, terminal.cols),
        rows: Math.max(1, terminal.rows),
      })
      .then(async (session) => {
        if (disposed) {
          await bridge.closeTerminal(session.id);
          return;
        }
        sessionIdRef.current = session.id;
        setMonitorMode(session.monitorMode ?? DEFAULT_TERMINAL_MONITOR_MODE);
        setStatus(`${session.shell} · ${session.cwd}`);
        await bridge.setTerminalActive(session.id, activeRef.current);
        await bridge.readyTerminal(session.id);
        if (activeRef.current) terminal.focus();
      })
      .catch((error: unknown) => {
        setStatus("Terminal failed");
        terminal.writeln(`\r\n[${error instanceof Error ? error.message : String(error)}]`);
      });
    return () => {
      disposed = true;
      observer.disconnect();
      input.dispose();
      selectionCopy.dispose();
      offData();
      offExit();
      offAttention();
      if (selectionCopyTimerRef.current !== null) {
        clearTimeout(selectionCopyTimerRef.current);
        selectionCopyTimerRef.current = null;
      }
      searchOpenRef.current = false;
      if (searchAddonRef.current === searchAddon) searchAddonRef.current = null;
      terminalRef.current = null;
      terminal.dispose();
      onAttentionChangeRef.current?.(paneId, null);
      const sessionId = sessionIdRef.current;
      sessionIdRef.current = null;
      if (sessionId) void bridge.closeTerminal(sessionId).catch(() => {});
    };
  }, [workspaceId, paneId]);

  const changeMonitorMode = (mode: TerminalMonitorMode) => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;
    const previousMode = monitorMode;
    setMonitorMode(mode);
    void window.desktop
      ?.setTerminalMonitorMode(sessionId, mode)
      .catch(() => setMonitorMode(previousMode));
  };

  useEffect(() => {
    const sessionId = sessionIdRef.current;
    if (sessionId) void window.desktop?.setTerminalActive(sessionId, active && windowFocused);
    if (active && windowFocused) {
      if (searchOpenRef.current) searchInputRef.current?.focus();
      else terminalRef.current?.focus();
    }
  }, [active, windowFocused]);

  useEffect(() => {
    if (!editingTitle) setDraftTitle(title);
  }, [editingTitle, title]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (terminal) terminal.options.theme = resolveTerminalTheme();
  }, [theme]);

  const attentionText = attentionLabel(attention);
  const informationalAgentStatus = Boolean(attention && attention.attentionLevel === 0);

  return (
    <section className="flex h-full min-h-0 flex-col bg-terminal text-foreground">
      <div className="sticky top-0 z-10 flex h-8 shrink-0 items-center gap-2 border-b border-border bg-header px-3 pr-10 text-ui-xs text-foreground-subtle">
        <TerminalSquare className="size-3.5 shrink-0 text-foreground-subtle" />
        {editingTitle ? (
          <input
            autoFocus
            aria-label={`Rename ${title}`}
            className="h-5 min-w-0 flex-1 rounded border border-input-border bg-input px-1 text-ui-xs text-foreground outline-none focus:border-input-border-focused"
            value={draftTitle}
            onBlur={commitTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                setDraftTitle(title);
                setEditingTitle(false);
              }
            }}
          />
        ) : (
          <button
            className="min-w-0 flex-1 truncate text-left"
            title="Double-click to rename"
            onDoubleClick={() => onRename && setEditingTitle(true)}
          >
            Terminal · {title} · {status}
          </button>
        )}
        <div
          aria-label={`${title} attention controls`}
          className="ml-auto flex min-w-0 max-w-[88%] shrink-0 items-center gap-2"
          role="group"
        >
          {attentionText && (
            <span
              aria-label={
                informationalAgentStatus
                  ? attentionText
                  : `${attentionLevelLabel(attention?.attentionLevel ?? 1)} attention: ${attentionText}`
              }
              aria-live="polite"
              className={`min-w-0 max-w-[calc(100%-10.75rem)] flex-1 truncate rounded-full px-2 py-0.5 font-medium ${informationalAgentStatus ? "bg-foreground/5 text-foreground-subtle" : attentionLevelClass(attention?.attentionLevel ?? 1)}`}
              data-attention-level={attention?.attentionLevel}
              role="status"
              title={attentionText}
            >
              {informationalAgentStatus
                ? attentionText
                : `${attentionLevelLabel(attention?.attentionLevel ?? 1)} · ${attentionText}`}
            </span>
          )}
          <TerminalMonitorPicker
            active={active}
            disabled={!sessionIdRef.current}
            mode={monitorMode}
            title={title}
            onChange={changeMonitorMode}
          />
          <button
            aria-label="Find in terminal"
            className="grid size-7 shrink-0 place-items-center rounded-md text-foreground-subtle transition-colors hover:bg-hover hover:text-foreground"
            title={`Find in terminal (${findShortcutLabel})`}
            type="button"
            onClick={() => {
              searchOpenRef.current = true;
              setSearchOpen(true);
              searchInputRef.current?.focus();
            }}
          >
            <Search aria-hidden="true" className="size-4" />
          </button>
        </div>
      </div>
      {searchOpen && (
        <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-border bg-header px-2">
          <input
            ref={searchInputRef}
            aria-label="Find in terminal"
            autoFocus
            className="h-7 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-ui-xs text-foreground outline-none placeholder:text-foreground-subtlest focus:border-brand"
            placeholder="Find in terminal"
            type="search"
            value={searchQuery}
            onChange={(event) => {
              const query = event.currentTarget.value;
              setSearchQuery(query);
              searchTerminal(query, "next", true);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                closeTerminalSearch();
              } else if (event.key === "Enter") {
                event.preventDefault();
                searchTerminal(searchQuery, event.shiftKey ? "previous" : "next");
              }
            }}
          />
          <span
            aria-live="polite"
            className="min-w-0 shrink truncate text-ui-xs text-foreground-subtle"
          >
            {searchNoResults ? "No results" : ""}
          </span>
          <button
            aria-label="Previous match"
            className="grid size-7 shrink-0 place-items-center rounded-md text-foreground-subtle transition-colors hover:bg-hover hover:text-foreground disabled:cursor-default disabled:opacity-40"
            disabled={!searchQuery}
            title="Previous match (Shift+Enter)"
            type="button"
            onClick={() => searchTerminal(searchQuery, "previous")}
          >
            <ChevronUp aria-hidden="true" className="size-4" />
          </button>
          <button
            aria-label="Next match"
            className="grid size-7 shrink-0 place-items-center rounded-md text-foreground-subtle transition-colors hover:bg-hover hover:text-foreground disabled:cursor-default disabled:opacity-40"
            disabled={!searchQuery}
            title="Next match (Enter)"
            type="button"
            onClick={() => searchTerminal(searchQuery, "next")}
          >
            <ChevronDown aria-hidden="true" className="size-4" />
          </button>
          <button
            aria-label="Close search"
            className="grid size-7 shrink-0 place-items-center rounded-md text-foreground-subtle transition-colors hover:bg-hover hover:text-foreground"
            title="Close search (Escape)"
            type="button"
            onClick={closeTerminalSearch}
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
      )}
      <div
        ref={hostRef}
        aria-label={`${title} terminal`}
        className="min-h-0 flex-1 overflow-hidden px-2 py-1"
      />
    </section>
  );
}

function attentionLevelLabel(level: TerminalAttentionState["attentionLevel"]): string {
  if (level === 1) return "LOW";
  if (level === 2) return "MEDIUM";
  if (level === 3) return "HIGH";
  return "CRITICAL";
}

function attentionLevelClass(level: TerminalAttentionState["attentionLevel"]): string {
  if (level === 1) return "bg-brand/15 text-brand";
  if (level === 2) return "bg-warning/15 text-warning";
  if (level === 3) return "bg-destructive/15 text-destructive";
  return "bg-destructive/20 text-destructive ring-1 ring-destructive/50";
}
