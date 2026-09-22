import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { TerminalSquare } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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

export function TerminalPanel({
  workspaceId,
  title,
  active,
  onRename,
}: {
  workspaceId: string;
  title: string;
  active: boolean;
  onRename?: (title: string) => void;
}) {
  const { terminalFontFamily, terminalFontSize, scrollback, shell, theme } = useUiStore();
  const hostRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const [status, setStatus] = useState("Starting terminal…");
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);
  const commitTitle = () => {
    const nextTitle = draftTitle.trim();
    setEditingTitle(false);
    if (!nextTitle) return setDraftTitle(title);
    if (nextTitle !== title) onRename?.(nextTitle);
  };
  useEffect(() => {
    const bridge = window.desktop;
    const host = hostRef.current;
    if (!bridge || !host) {
      setStatus("Desktop terminal is unavailable");
      return;
    }
    let disposed = false;
    let sessionId: string | null = null;
    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: terminalFontFamily,
      fontSize: terminalFontSize,
      scrollback,
      theme: resolveTerminalTheme(),
    });
    terminalRef.current = terminal;
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(host);
    fit.fit();
    const offData = bridge.onTerminalData((event) => {
      if (event.sessionId === sessionId) terminal.write(event.data);
    });
    const offExit = bridge.onTerminalExit((event) => {
      if (event.sessionId === sessionId) {
        terminal.writeln(`\r\n[process exited: ${event.exitCode}]`);
        setStatus("Stopped");
        sessionId = null;
      }
    });
    const input = terminal.onData((data) => {
      if (sessionId) void bridge.writeTerminal(sessionId, data);
    });
    const observer = new ResizeObserver(() => {
      if (disposed) return;
      fit.fit();
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
        shell,
        cols: Math.max(2, terminal.cols),
        rows: Math.max(1, terminal.rows),
      })
      .then(async (session) => {
        if (disposed) {
          await bridge.closeTerminal(session.id);
          return;
        }
        sessionId = session.id;
        setStatus(`${session.shell} · ${session.cwd}`);
        await bridge.readyTerminal(session.id);
        terminal.focus();
      })
      .catch((error: unknown) => {
        setStatus("Terminal failed");
        terminal.writeln(`\r\n[${error instanceof Error ? error.message : String(error)}]`);
      });
    return () => {
      disposed = true;
      observer.disconnect();
      input.dispose();
      offData();
      offExit();
      terminalRef.current = null;
      terminal.dispose();
      if (sessionId) void bridge.closeTerminal(sessionId).catch(() => {});
    };
  }, [workspaceId]);
  useEffect(() => {
    if (!editingTitle) setDraftTitle(title);
  }, [editingTitle, title]);
  useEffect(() => {
    const terminal = terminalRef.current;
    if (terminal) terminal.options.theme = resolveTerminalTheme();
  }, [theme]);
  useEffect(() => {
    if (active) terminalRef.current?.focus();
  }, [active]);
  return (
    <section className="flex h-full min-h-0 flex-col bg-terminal text-foreground">
      <div className="flex h-7 shrink-0 items-center gap-2 border-b border-border px-3 pr-10 text-ui-xs text-foreground-subtle">
        <TerminalSquare className="size-3.5 shrink-0 text-brand" />
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
            className="min-w-0 truncate text-left"
            title="Double-click to rename"
            onDoubleClick={() => onRename && setEditingTitle(true)}
          >
            Terminal · {title} · {status}
          </button>
        )}
      </div>
      <div
        ref={hostRef}
        aria-label={`${title} terminal`}
        className="min-h-0 flex-1 overflow-hidden px-2 py-1"
      />
    </section>
  );
}
