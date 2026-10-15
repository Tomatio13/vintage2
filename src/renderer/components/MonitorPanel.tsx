import {
  Activity,
  Cpu,
  ExternalLink,
  Maximize2,
  MemoryStick,
  Minimize2,
  RefreshCw,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useMonitorSnapshot, refreshMonitorSnapshot } from "../hooks/useMonitorSnapshot.js";
import { UsagePanel } from "./UsagePanel.js";
import { useUiStore } from "../store/uiStore.js";
import { createPortal } from "react-dom";
import type { MonitorSession, MonitorStatus } from "../../shared/monitor.js";
import {
  MonitorBlock,
  MonitorMeter,
  MonitorTrend,
  monitorBytes,
  monitorColors,
  monitorCompact,
  monitorPercent,
} from "./MonitorVisuals.js";

const agentStyle = {
  claude: { name: "Claude Code", badge: "CC", color: "bg-amber-500/10 text-amber-500" },
  codex: { name: "Codex", badge: "CD", color: "bg-cyan-500/10 text-cyan-500" },
  antigravity: { name: "Antigravity", badge: "AG", color: "bg-violet-500/10 text-violet-500" },
  opencode: { name: "OpenCode", badge: "OC", color: "bg-emerald-500/10 text-emerald-500" },
  grok: { name: "Grok", badge: "GK", color: "bg-teal-500/10 text-teal-500" },
  zcode: { name: "ZCode", badge: "ZC", color: "bg-rose-500/10 text-rose-500" },
};
const statusColor: Record<MonitorStatus, string> = {
  Thinking: "text-cyan-500",
  Executing: "text-emerald-500",
  Waiting: "text-foreground-subtle",
  RateLimited: "text-amber-500",
  Done: "text-foreground-subtlest",
  Error: "text-rose-500",
  Unknown: "text-foreground-subtlest",
};
const statusOrder: Record<MonitorStatus, number> = {
  Executing: 0,
  Thinking: 1,
  Error: 2,
  RateLimited: 3,
  Waiting: 4,
  Unknown: 5,
  Done: 6,
};
const activeSession = (session: MonitorSession) =>
  session.status === "Thinking" || session.status === "Executing";
const projectName = (cwd: string) =>
  cwd.replaceAll("\\", "/").split("/").filter(Boolean).at(-1) ?? "Unknown project";
const contextPercent = (session: MonitorSession): number | null =>
  session.contextTokens !== null && session.contextWindow !== null && session.contextWindow > 0
    ? (session.contextTokens / session.contextWindow) * 100
    : null;
const elapsed = (start: number | null, now: number) =>
  start === null ? "—" : `${Math.floor(Math.max(0, now - start) / 60_000)}m`;

export function MonitorPanel({
  active,
  onOpenTerminal,
}: {
  active: boolean;
  onOpenTerminal?: ((paneId: string) => void) | undefined;
}) {
  const sessionRequest = useUiStore((state) => state.monitorSessionRequest);
  const usageEnabled = useUiStore((state) => state.usagePanelEnabled);
  const { snapshot, error, refreshing } = useMonitorSnapshot(active);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const dialog = useRef<HTMLElement>(null);

  useEffect(() => {
    if (sessionRequest) setSelectedId(sessionRequest.id);
  }, [sessionRequest]);

  useEffect(() => {
    if (!active) setExpanded(false);
  }, [active]);
  useEffect(() => {
    if (!expanded) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.focus();
    const key = (event: KeyboardEvent) => {
      event.stopPropagation();
      if (event.key === "Escape") {
        event.preventDefault();
        setExpanded(false);
      }
      if (event.key === "Tab") {
        const targets = [
          ...(dialog.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), [href], select, [tabindex="0"]',
          ) ?? []),
        ].filter((element) => element.getClientRects().length > 0);
        const index = targets.indexOf(document.activeElement as HTMLElement);
        if (!targets.length) {
          event.preventDefault();
          dialog.current?.focus();
        } else if (event.shiftKey && index <= 0) {
          event.preventDefault();
          targets.at(-1)?.focus();
        } else if (!event.shiftKey && (index === targets.length - 1 || index === -1)) {
          event.preventDefault();
          targets[0]?.focus();
        }
      }
    };
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("keydown", key, true);
      if (previous?.isConnected) previous.focus();
    };
  }, [expanded]);

  const all = (snapshot?.sessions ?? []).filter(
    (session) =>
      !(
        session.agent === "codex" &&
        session.logMatch === "unavailable" &&
        session.launchSurface === "remote"
      ),
  );
  const sessions = all.toSorted((a, b) => statusOrder[a.status] - statusOrder[b.status]);
  const selected = sessions.find((session) => session.id === selectedId) ?? sessions[0];
  const now = snapshot?.generatedAt ?? Date.now();
  const live = all.filter((session) => session.status !== "Done");
  const working = live.filter(activeSession).length;
  const waiting = live.filter((session) => session.status === "Waiting").length;
  const unknown = live.filter((session) => session.status === "Unknown").length;
  const memoryPercent =
    snapshot?.host && snapshot.host.memoryTotalBytes > 0
      ? (snapshot.host.memoryUsedBytes / snapshot.host.memoryTotalBytes) * 100
      : null;
  const history = snapshot?.history ?? [];
  const openTerminal = (paneId: string) => {
    setExpanded(false);
    onOpenTerminal?.(paneId);
  };
  const row = (session: MonitorSession) => (
    <SessionRow
      key={session.id}
      session={session}
      selected={selected?.id === session.id}
      now={now}
      onSelect={() => setSelectedId(session.id)}
    />
  );

  const content = (
    <section
      ref={dialog}
      role={expanded ? "dialog" : undefined}
      aria-modal={expanded ? true : undefined}
      tabIndex={expanded ? -1 : undefined}
      aria-label="Agent monitor"
      className={`@container flex min-h-0 flex-col bg-panel outline-none ${expanded ? "fixed inset-4 z-[71] rounded-2xl border border-border shadow-2xl" : "h-full"}`}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Activity className="size-4 shrink-0 text-emerald-500" aria-hidden="true" />
          <h2 className="text-ui-sm font-semibold">Monitor</h2>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label="Refresh monitor"
            title="Refresh monitor"
            disabled={refreshing || !active}
            className="rounded-lg p-1.5 text-foreground-subtle hover:bg-hover disabled:opacity-40"
            onClick={() => void refreshMonitorSnapshot()}
          >
            <RefreshCw className={`size-3.5${refreshing ? " animate-spin" : ""}`} />
          </button>
          <button
            type="button"
            aria-label={expanded ? "Collapse monitor" : "Expand monitor"}
            className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-ui-xs text-foreground-subtle hover:bg-hover"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
            <span>{expanded ? "Collapse" : "Expand"}</span>
          </button>
          {expanded && (
            <button
              type="button"
              aria-label="Close expanded monitor"
              className="rounded-lg p-1.5 text-foreground-subtle hover:bg-hover"
              onClick={() => setExpanded(false)}
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3 @3xl:p-5">
        {error && (
          <p role="alert" className="text-ui-xs text-rose-500">
            {error}
          </p>
        )}
        {!window.desktop?.getMonitorSnapshot && (
          <p className="text-ui-sm text-foreground-subtle">
            Monitor is available in the desktop app.
          </p>
        )}
        {!snapshot && window.desktop?.getMonitorSnapshot && !error && (
          <p className="text-ui-sm text-foreground-subtle">Loading agent sessions…</p>
        )}
        {snapshot && !snapshot.supported && (
          <p className="text-ui-sm text-foreground-subtle">
            Monitor supports Linux, macOS and Windows (pre-release).
          </p>
        )}
        <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-border bg-background/50 px-4 py-3">
          <div>
            <p className="flex items-center gap-1.5 text-ui-xs font-medium uppercase tracking-widest text-foreground-subtle">
              <span
                className={`size-1.5 rounded-full ${active && !error ? "animate-pulse bg-foreground-subtle" : "bg-foreground-subtlest"}`}
              />
              {error ? "Last snapshot" : active ? "Live now" : "Paused"}
            </p>
            <p className="mt-1 flex items-baseline gap-2">
              <span className="font-mono text-3xl font-semibold tabular-nums text-emerald-500">
                {working}
              </span>
              <span className="text-ui-sm text-foreground-subtle">active agents</span>
            </p>
          </div>
          <div className="flex gap-5 font-mono text-ui-sm tabular-nums">
            <div>
              <span className="font-semibold text-foreground">{waiting}</span>
              <p className="text-ui-xs text-foreground-subtlest">waiting</p>
            </div>
            <div>
              <span className="font-semibold text-foreground">{live.length}</span>
              <p className="text-ui-xs text-foreground-subtlest">processes</p>
            </div>
            <div>
              <span className={unknown ? "font-semibold text-amber-500" : "text-foreground"}>
                {unknown}
              </span>
              <p className="text-ui-xs text-foreground-subtlest">unknown</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <MonitorBlock
            title="CPU"
            icon={<Cpu className="size-3.5" />}
            extra={
              <span className="font-mono text-ui-xs text-foreground-subtlest">
                {snapshot?.host?.cores.length ?? "—"} cores
              </span>
            }
          >
            <p
              className="mb-2 font-mono text-2xl font-semibold tabular-nums"
              style={{ color: monitorColors.cyan }}
            >
              {monitorPercent(snapshot?.host?.cpuPercent)}
            </p>
            <MonitorMeter
              value={snapshot?.host?.cpuPercent ?? null}
              label="PC CPU usage"
              color={monitorColors.cyan}
            />
            <div className="mt-2">
              <MonitorTrend
                values={history.map((point) => point.cpuPercent)}
                compact
                label="CPU usage history"
                color={monitorColors.cyan}
                max={100}
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-1" aria-label="CPU cores">
              {snapshot?.host?.cores.map((core, index) => (
                <span
                  key={index}
                  title={`Core ${index + 1}: ${monitorPercent(core)}`}
                  className="h-2 w-2 rounded-sm"
                  style={{
                    backgroundColor:
                      core === null
                        ? "var(--color-border)"
                        : core >= 85
                          ? monitorColors.rose
                          : core >= 60
                            ? monitorColors.amber
                            : monitorColors.cyan,
                    opacity: core === null ? 0.4 : 0.2 + (core / 100) * 0.8,
                  }}
                />
              ))}
            </div>
          </MonitorBlock>
          <MonitorBlock title="Memory" icon={<MemoryStick className="size-3.5" />}>
            <p
              className="mb-2 font-mono text-2xl font-semibold tabular-nums"
              style={{ color: monitorColors.violet }}
            >
              {monitorPercent(memoryPercent)}
            </p>
            <MonitorMeter
              value={memoryPercent}
              label="PC memory usage"
              color={monitorColors.violet}
            />
            <div className="mt-2">
              <MonitorTrend
                values={history.map((point) => point.memoryPercent)}
                compact
                label="Memory usage history"
                color={monitorColors.violet}
                max={100}
              />
            </div>
            <p className="mt-2 font-mono text-ui-xs text-foreground-subtle">
              {monitorBytes(snapshot?.host?.memoryUsedBytes)} /{" "}
              {monitorBytes(snapshot?.host?.memoryTotalBytes)}
            </p>
          </MonitorBlock>
        </div>
        {usageEnabled && (
          <section
            aria-label="Usage"
            className="overflow-hidden rounded-xl border border-border bg-background/50"
          >
            <UsagePanel active={active} embedded />
          </section>
        )}
        <div className="grid items-start gap-3 @3xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div className="min-w-0 rounded-xl border border-border bg-background/50">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
              <h3 className="text-ui-xs font-semibold uppercase tracking-wider text-foreground-subtle">
                Sessions{" "}
                <span className="ml-1 font-mono text-foreground-subtlest">{sessions.length}</span>
              </h3>
            </div>
            {snapshot?.supported && sessions.length === 0 && (
              <p className="px-3 py-4 text-ui-xs text-foreground-subtle">
                No supported agent sessions found.
              </p>
            )}
            <div aria-label="Sessions" className="divide-y divide-border/60">
              {sessions.map(row)}
            </div>
          </div>
          {selected && (
            <SessionDetail
              session={selected}
              onOpenTerminal={onOpenTerminal ? openTerminal : undefined}
            />
          )}
        </div>
        {snapshot?.warnings.map((warning) => (
          <p className="text-ui-xs text-foreground-subtlest" key={warning}>
            {warning}
          </p>
        ))}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border px-3 py-2 font-mono text-ui-xs text-foreground-subtlest">
        <span>
          {snapshot ? new Date(snapshot.generatedAt).toLocaleTimeString() : "—"}{" "}
          <span className="font-sans">· 2s activity</span>
        </span>
      </div>
    </section>
  );
  return expanded
    ? createPortal(
        <>
          <div
            className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm"
            aria-hidden="true"
            onClick={() => setExpanded(false)}
          />
          {content}
        </>,
        document.body,
      )
    : content;
}

function SessionRow({
  session,
  selected,
  now,
  onSelect,
}: {
  session: MonitorSession;
  selected: boolean;
  now: number;
  onSelect(): void;
}) {
  const percent = contextPercent(session);
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`block w-full px-3 py-2.5 text-left transition-colors ${selected ? "bg-selected" : "hover:bg-hover"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`shrink-0 rounded px-1 py-0.5 font-mono text-[10px] font-semibold ${agentStyle[session.agent].color}`}
          >
            {agentStyle[session.agent].badge}
          </span>
          <span className="truncate text-ui-sm font-semibold" title={session.cwd}>
            {projectName(session.cwd)}
          </span>
        </div>
        <span
          className={`flex shrink-0 items-center gap-1.5 text-ui-xs ${statusColor[session.status]}`}
        >
          <span
            className={`size-1.5 rounded-full bg-current ${activeSession(session) ? "animate-pulse" : "opacity-50"}`}
          />
          {session.loading ? "Loading" : session.status}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-2 font-mono text-ui-xs text-foreground-subtlest">
        <span className="font-sans">
          {agentStyle[session.agent].name}
          {session.agent === "codex" && session.launchSurface === "background"
            ? " · Background"
            : session.launchSurface === "remote"
              ? " · Remote"
              : ""}
        </span>
        <span>PID {session.pid}</span>
        <span>{elapsed(session.startedAt, now)}</span>
        <span className="truncate">{session.model}</span>
      </div>
      <p className="mt-1 truncate font-mono text-ui-xs text-foreground-subtle">
        {session.currentTool
          ? `${session.currentTool.name}${session.currentTool.path ? ` · ${session.currentTool.path}` : ""}`
          : session.logMatch === "unavailable"
            ? (session.diagnostic ?? "Session log unavailable")
            : session.status === "Waiting"
              ? "Waiting for input"
              : (session.model ?? "No current tool reported")}
      </p>
      <div className="mt-2 flex items-center gap-3 font-mono text-[10px] text-foreground-subtle">
        <span>{monitorPercent(session.cpuPercent)} CPU</span>
        <span>{monitorBytes(session.memoryBytes)}</span>
        <span className="ml-auto w-16">
          <MonitorMeter
            value={percent}
            label={`Session context PID ${session.pid}`}
            context
            small
          />
        </span>
        <span className="w-8 text-right">{monitorPercent(percent)}</span>
      </div>
    </button>
  );
}

function SessionDetail({
  session,
  onOpenTerminal,
}: {
  session: MonitorSession;
  onOpenTerminal?: ((paneId: string) => void) | undefined;
}) {
  const percent = contextPercent(session);
  const hasData = session.logMatch !== "unavailable" && session.tokenTotalsAvailable !== false;
  const total = session.inputTokens + session.outputTokens + session.cacheTokens;
  return (
    <div
      className="min-w-0 rounded-xl border border-border bg-background/50"
      aria-label="Session details"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <h3 className="text-ui-xs font-semibold uppercase tracking-wider text-foreground-subtle">
          Session details
        </h3>
        {session.paneId && onOpenTerminal && (
          <button
            type="button"
            className="flex items-center gap-1 rounded-md px-2 py-1 text-ui-xs hover:bg-hover"
            onClick={() => onOpenTerminal(session.paneId!)}
          >
            <ExternalLink className="size-3" />
            Open terminal
          </button>
        )}
      </div>
      <div className="space-y-3 p-3">
        <div>
          <p className="break-all font-mono text-ui-xs text-foreground-subtle">
            {session.cwd || "Working directory unavailable"}
          </p>
          <p className="mt-1 font-mono text-ui-xs text-foreground-subtlest">
            {session.model ?? "Model unknown"}
            {session.turnCount !== undefined ? ` · ${session.turnCount} turns` : ""}
          </p>
        </div>
        <div>
          <div className="mb-1 flex justify-between gap-2 text-ui-xs">
            <span className="font-medium">
              Context{session.contextEstimated ? " (estimated capacity)" : ""}
            </span>
            <span className="font-mono">{monitorPercent(percent)}</span>
          </div>
          <MonitorMeter value={percent} label="Context usage" context />
          <p className="mt-1 font-mono text-ui-xs text-foreground-subtlest">
            {session.contextTokens === null ? "Unknown" : monitorCompact(session.contextTokens)} /{" "}
            {session.contextWindow === null
              ? "unknown capacity"
              : monitorCompact(session.contextWindow)}
          </p>
        </div>
        <dl className="space-y-2 text-ui-xs">
          {[
            { name: "Input", value: session.inputTokens, color: monitorColors.teal },
            { name: "Output", value: session.outputTokens, color: monitorColors.amber },
            { name: "Cache", value: session.cacheTokens, color: monitorColors.cyan },
          ].map((item) => (
            <div key={item.name}>
              <div className="flex justify-between">
                <dt className="text-foreground-subtle">{item.name}</dt>
                <dd className="font-mono tabular-nums" style={{ color: item.color }}>
                  {hasData ? monitorCompact(item.value) : "—"}
                </dd>
              </div>
              <div className="mt-1 h-1 rounded bg-hover">
                <div
                  className="h-full rounded"
                  style={{
                    width: `${hasData && total > 0 ? (item.value / total) * 100 : 0}%`,
                    backgroundColor: item.color,
                  }}
                />
              </div>
            </div>
          ))}
          <div className="flex justify-between">
            <dt className="text-foreground-subtle">Input + output / s</dt>
            <dd className="font-mono">
              {session.tokensPerSecond === null ? "—" : monitorCompact(session.tokensPerSecond)}
            </dd>
          </div>
        </dl>
        <div>
          <h4 className="mb-2 text-ui-xs font-semibold uppercase tracking-wider text-foreground-subtle">
            Related processes <span className="font-mono">{session.children?.length ?? 0}</span>
          </h4>
          <div className="max-h-32 space-y-1.5 overflow-auto font-mono text-ui-xs">
            {session.children?.map((child) => (
              <div className="flex items-center gap-2" key={child.pid}>
                <span className="text-foreground-subtlest">{child.pid}</span>
                <span className="min-w-0 flex-1 truncate text-foreground-subtle">{child.name}</span>
                <span className="shrink-0 text-cyan-500">{monitorPercent(child.cpuPercent)}</span>
                <span className="shrink-0 text-foreground-subtlest">
                  {monitorBytes(child.memoryBytes)}
                </span>
              </div>
            ))}
            {!session.children?.length && (
              <p className="font-sans text-foreground-subtlest">No child processes detected.</p>
            )}
          </div>
        </div>
        {(session.processPids?.length ?? 0) > 1 && (
          <p className="text-ui-xs text-foreground-subtlest">
            CPU and memory include {session.processPids!.length} shared workers and their child
            processes.
          </p>
        )}
        {session.diagnostic && (
          <p className="text-ui-xs text-foreground-subtlest">{session.diagnostic}</p>
        )}
        {session.logMatch === "inferred" && (
          <p className="text-ui-xs text-foreground-subtlest">Session association is inferred.</p>
        )}
      </div>
    </div>
  );
}
