import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import type {
  CodexbarAccount,
  CodexbarProviderRow,
  CodexbarUsageResult,
  CodexbarWindow,
} from "../../shared/desktop.js";
import { formatRelative, formatResetCountdown, formatResetTime } from "../lib/timeAgo.js";
import { useUiStore } from "../store/uiStore.js";
import { Button } from "./Button.js";

const statusDotClass: Record<string, string> = {
  ok: "bg-success",
  warning: "bg-warning",
  critical: "bg-destructive",
  unknown: "bg-foreground-subtlest",
};

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

// Bars stay neutral until remaining quota is actually running low.
function barClass(remaining: number): string {
  if (remaining <= 10) return "bg-destructive";
  if (remaining <= 40) return "bg-warning";
  return "bg-foreground-subtlest";
}

function describeError(error: unknown): string | null {
  if (error == null) return null;
  if (typeof error === "string") return error;
  if (typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

function formatUsd(value: number): string {
  return usdFormatter.format(value);
}

function WindowRow({ window: rateWindow }: { window: CodexbarWindow }) {
  const remaining =
    typeof rateWindow.remainingPercent === "number"
      ? clampPercent(rateWindow.remainingPercent)
      : typeof rateWindow.usedPercent === "number"
        ? clampPercent(100 - rateWindow.usedPercent)
        : null;
  const countdown = formatResetCountdown(rateWindow.resetAt);
  const resetTime = formatResetTime(rateWindow.resetAt);
  const resetText = resetTime ? `Resets ${resetTime}` : countdown;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-ui-base text-foreground-subtle">
          {rateWindow.label ?? rateWindow.kind}
        </span>
        {resetText && (
          <span
            className="shrink-0 text-ui-sm text-foreground-subtlest"
            title={resetTime ? countdown : undefined}
          >
            {resetText}
          </span>
        )}
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-hover">
        {remaining !== null && (
          <div
            className={`h-full rounded-full ${barClass(remaining)}`}
            style={{ width: `${remaining}%` }}
          />
        )}
      </div>
      <p className="text-ui-sm text-foreground-subtlest">
        {remaining !== null ? `${Math.round(remaining)}% left` : "Usage unavailable"}
      </p>
    </div>
  );
}

function IdentityRow({ provider }: { provider: CodexbarProviderRow }) {
  const meta = [provider.source, provider.identity?.plan, provider.identity?.accountEmail].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  if (meta.length === 0) return null;
  return <p className="mt-1 truncate text-ui-xs text-foreground-subtlest">{meta.join(" · ")}</p>;
}

function AccountSection({ account }: { account: CodexbarAccount }) {
  const windows = (account.windows ?? []).filter((window) => !window.idle);
  const error = describeError(account.error);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="truncate text-ui-xs font-medium text-foreground-subtle">
          {account.label ?? account.id}
        </span>
        {account.active && (
          <span className="rounded-full bg-hover px-2 py-0.5 text-ui-xs text-foreground-subtle">
            active
          </span>
        )}
      </div>
      {error && <p className="text-ui-xs text-destructive">{error}</p>}
      {windows.map((window, index) => (
        <WindowRow key={`${account.id}:${window.kind}:${index}`} window={window} />
      ))}
    </div>
  );
}

function ProviderCard({ provider }: { provider: CodexbarProviderRow }) {
  const error = describeError(provider.error);
  const accounts = provider.accounts ?? [];
  const showAccounts = accounts.length > 0;
  const windows = showAccounts ? [] : (provider.windows ?? []).filter((window) => !window.idle);
  const credits =
    typeof provider.credits?.remaining === "number" ? provider.credits.remaining : null;
  const creditsUnit = provider.credits?.unit ?? "credits";
  const todayUsd = provider.cost?.todayUSD;
  const last30DaysUsd = provider.cost?.last30DaysUSD;
  const statusLevel = provider.status?.level;
  return (
    <section className="overflow-hidden rounded-xl border border-card-border bg-card">
      <div className="min-w-0 space-y-3 p-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="truncate text-ui-base font-semibold">{provider.name}</span>
            {statusLevel && (
              <span
                aria-label={provider.status?.label ?? `Status ${statusLevel}`}
                className={`ml-auto size-2 shrink-0 rounded-full ${statusDotClass[statusLevel] ?? "bg-foreground-subtlest"}`}
                title={provider.status?.label ?? undefined}
              />
            )}
          </div>
          <IdentityRow provider={provider} />
        </div>
        {error && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-ui-xs text-destructive">
            {error}
          </p>
        )}
        {!error && windows.length === 0 && !showAccounts && (
          <p className="text-ui-xs text-foreground-subtlest">No usage windows reported.</p>
        )}
        {windows.map((window, index) => (
          <WindowRow key={`${provider.id}:${window.kind}:${index}`} window={window} />
        ))}
        {showAccounts && (
          <div className="space-y-3 border-t border-border pt-2">
            {accounts.map((account) => (
              <AccountSection key={account.id} account={account} />
            ))}
          </div>
        )}
        {(credits !== null ||
          typeof todayUsd === "number" ||
          typeof last30DaysUsd === "number") && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-2 text-ui-xs text-foreground-subtlest">
            {credits !== null && (
              <span>
                Credits: {credits} {creditsUnit} left
              </span>
            )}
            {typeof todayUsd === "number" && <span>Today: {formatUsd(todayUsd)}</span>}
            {typeof last30DaysUsd === "number" && <span>30 days: {formatUsd(last30DaysUsd)}</span>}
          </div>
        )}
      </div>
    </section>
  );
}

export function UsagePanel({ active }: { active: boolean }) {
  const usagePanelEnabled = useUiStore((state) => state.usagePanelEnabled);
  const codexbarPath = useUiStore((state) => state.codexbarPath);
  const usageRefreshSeconds = useUiStore((state) => state.usageRefreshSeconds);
  const setSettingsOpen = useUiStore((state) => state.setSettingsOpen);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CodexbarUsageResult | null>(null);

  useEffect(() => {
    if (!active || !usagePanelEnabled) return;
    let cancelled = false;
    setLoading(true);
    const getCodexbarUsage = window.desktop?.getCodexbarUsage;
    const request = getCodexbarUsage
      ? getCodexbarUsage(codexbarPath)
      : Promise.resolve<CodexbarUsageResult>({
          ok: false,
          errorKind: "not-configured",
          message: "codexbar is unavailable in this environment.",
          resolvedPath: null,
        });
    void request
      .then((next) => {
        if (!cancelled) setResult(next);
      })
      .catch(() => {
        if (!cancelled) {
          setResult({
            ok: false,
            errorKind: "exec-failed",
            message: "Unable to run codexbar.",
            resolvedPath: null,
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active, usagePanelEnabled, codexbarPath, refreshVersion]);

  useEffect(() => {
    if (!active || !usagePanelEnabled || usageRefreshSeconds <= 0) return;
    const timer = window.setInterval(
      () => setRefreshVersion((version) => version + 1),
      usageRefreshSeconds * 1000,
    );
    return () => window.clearInterval(timer);
  }, [active, usagePanelEnabled, usageRefreshSeconds]);

  if (!result) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-ui-sm text-foreground-subtle">Loading usage…</p>
      </div>
    );
  }

  if (!result.ok) {
    const openSettings = result.errorKind === "not-configured";
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-ui-sm text-foreground-subtle">{result.message}</p>
        {result.resolvedPath && (
          <p className="truncate font-mono text-ui-xs text-foreground-subtlest">
            {result.resolvedPath}
          </p>
        )}
        {openSettings && (
          <Button size="compact" variant="primary" onClick={() => setSettingsOpen(true)}>
            Open Settings
          </Button>
        )}
        {!openSettings && (
          <Button
            size="compact"
            variant="ghost"
            disabled={loading}
            onClick={() => setRefreshVersion((version) => version + 1)}
          >
            Retry
          </Button>
        )}
      </div>
    );
  }

  const { snapshot } = result;
  const providers = [...snapshot.providers].sort(
    (first, second) =>
      (first.display?.sortKey ?? Number.MAX_SAFE_INTEGER) -
      (second.display?.sortKey ?? Number.MAX_SAFE_INTEGER),
  );
  const generated = formatRelative(snapshot.generatedAt);
  const version = snapshot.host?.codexBarVersion;
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <div className="min-w-0">
          <p className="text-ui-sm font-medium">AI Usage</p>
          <p className="truncate text-ui-xs text-foreground-subtlest">
            {version ? `codexbar ${version} · ` : ""}
            {generated ? `Updated ${generated}` : ""}
          </p>
        </div>
        <Button
          aria-label="Refresh usage"
          className="size-7 px-0"
          disabled={loading}
          size="icon"
          title="Refresh usage"
          type="button"
          variant="ghost"
          onClick={() => setRefreshVersion((version_) => version_ + 1)}
        >
          <RefreshCw aria-hidden="true" className={`size-4${loading ? " animate-spin" : ""}`} />
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
        {providers.length === 0 ? (
          <p className="p-2 text-ui-sm text-foreground-subtle">
            No providers are enabled in the codexbar config.
          </p>
        ) : (
          providers.map((provider) => <ProviderCard key={provider.id} provider={provider} />)
        )}
      </div>
    </div>
  );
}
