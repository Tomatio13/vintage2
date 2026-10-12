import { RefreshCw } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";

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

const providerAccents: Record<string, string> = {
  codex: "#49a3b0",
  claude: "#ce896b",
  gemini: "#7b91df",
  grok: "#a18bce",
  zcode: "#cf7d9b",
  opencode: "#69a998",
};

function providerAccent(provider: CodexbarProviderRow): string {
  const color = provider.display?.accentColor;
  return typeof color === "string" && /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/iu.test(color)
    ? color
    : (providerAccents[provider.id.toLowerCase()] ?? "#7b91b7");
}

// Low-quota warnings take precedence over the provider's accent.
function barClass(remaining: number): string {
  if (remaining <= 10) return "bg-destructive";
  if (remaining <= 40) return "bg-warning";
  return "bg-[var(--usage-accent)]";
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

function WindowRow({
  window: rateWindow,
  compact = false,
}: {
  window: CodexbarWindow;
  compact?: boolean;
}) {
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
        <span
          className={`truncate ${compact ? "text-ui-xs" : "text-ui-base"} text-foreground-subtle`}
        >
          {rateWindow.label ?? rateWindow.kind}
        </span>
        {compact && (
          <span className="shrink-0 font-mono text-ui-xs text-foreground-subtle">
            {remaining !== null ? `${Math.round(remaining)}% left` : "—"}
          </span>
        )}
        {!compact && resetText && (
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
      <p
        className={`${compact ? "text-ui-xs" : "text-ui-sm"} text-foreground-subtlest`}
        title={compact && resetTime ? countdown : undefined}
      >
        {compact
          ? (resetText ?? (remaining === null ? "Usage unavailable" : null))
          : remaining !== null
            ? `${Math.round(remaining)}% left`
            : "Usage unavailable"}
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

function AccountSection({
  account,
  compact = false,
}: {
  account: CodexbarAccount;
  compact?: boolean;
}) {
  const windows = (account.windows ?? []).filter((window) => !window.idle);
  const error = describeError(account.error);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="truncate text-ui-xs font-medium text-foreground-subtle">
          {account.label ?? account.id}
        </span>
        {account.active && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-ui-xs text-primary">
            active
          </span>
        )}
      </div>
      {error && <p className="text-ui-xs text-destructive">{error}</p>}
      {windows.map((window, index) => (
        <WindowRow
          key={`${account.id}:${window.kind}:${index}`}
          window={window}
          compact={compact}
        />
      ))}
    </div>
  );
}

function ProviderCard({
  provider,
  compact = false,
}: {
  provider: CodexbarProviderRow;
  compact?: boolean;
}) {
  const error = describeError(provider.error);
  const accounts = provider.accounts ?? [];
  const showAccounts = accounts.length > 0;
  const windows = showAccounts ? [] : (provider.windows ?? []).filter((window) => !window.idle);
  const hasLimitResetCredits = provider.limitResetCredits != null;
  const creditValue = hasLimitResetCredits
    ? provider.limitResetCredits?.available
    : provider.credits?.remaining;
  const credits = typeof creditValue === "number" ? creditValue : null;
  const creditsUnit = hasLimitResetCredits ? "credits" : (provider.credits?.unit ?? "credits");
  const creditsLabel = hasLimitResetCredits ? "Limit reset credits" : "Credits";
  const creditsExpiry = hasLimitResetCredits
    ? formatResetTime(provider.limitResetCredits?.nextExpiresAt)
    : null;
  const todayUsd = hasLimitResetCredits ? null : provider.cost?.todayUSD;
  const last30DaysUsd = hasLimitResetCredits ? null : provider.cost?.last30DaysUSD;
  const statusLevel = provider.status?.level;
  return (
    <section
      className="overflow-hidden rounded-xl border border-card-border bg-card"
      style={{ "--usage-accent": providerAccent(provider) } as CSSProperties}
    >
      <div className={compact ? "min-w-0 space-y-2 p-2" : "min-w-0 space-y-3 p-3"}>
        <div>
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full bg-[var(--usage-accent)]"
            />
            <span className={`truncate ${compact ? "text-ui-sm" : "text-ui-base"} font-semibold`}>
              {provider.name}
            </span>
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
          <WindowRow
            key={`${provider.id}:${window.kind}:${index}`}
            window={window}
            compact={compact}
          />
        ))}
        {showAccounts && (
          <div className="space-y-3 border-t border-border pt-2">
            {accounts.map((account) => (
              <AccountSection key={account.id} account={account} compact={compact} />
            ))}
          </div>
        )}
        {(credits !== null ||
          typeof todayUsd === "number" ||
          typeof last30DaysUsd === "number") && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-2 text-ui-xs text-foreground-subtlest">
            {credits !== null && (
              <span>
                {creditsLabel}: {credits} {creditsUnit} left
                {creditsExpiry && ` · Expires ${creditsExpiry}`}
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

export function UsagePanel({ active, embedded = false }: { active: boolean; embedded?: boolean }) {
  const usagePanelEnabled = useUiStore((state) => state.usagePanelEnabled);
  const codexbarPath = useUiStore((state) => state.codexbarPath);
  const usageRefreshSeconds = useUiStore((state) => state.usageRefreshSeconds);
  const setSettingsOpen = useUiStore((state) => state.setSettingsOpen);
  const [documentVisible, setDocumentVisible] = useState(document.visibilityState !== "hidden");
  useEffect(() => {
    const update = () => setDocumentVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  const visible = active && documentVisible;
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CodexbarUsageResult | null>(null);

  useEffect(() => {
    if (!visible || !usagePanelEnabled) return;
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
  }, [visible, usagePanelEnabled, codexbarPath, refreshVersion]);

  useEffect(() => {
    if (!visible || !usagePanelEnabled || loading || usageRefreshSeconds <= 0) return;
    const timer = window.setTimeout(
      () => setRefreshVersion((version) => version + 1),
      usageRefreshSeconds * 1000,
    );
    return () => window.clearTimeout(timer);
  }, [visible, usagePanelEnabled, usageRefreshSeconds, loading, refreshVersion]);

  if (!result) {
    return (
      <div className={`flex ${embedded ? "" : "h-full"} items-center justify-center p-4`}>
        <p className="text-ui-sm text-foreground-subtle">Loading usage…</p>
      </div>
    );
  }

  if (!result.ok) {
    const openSettings = result.errorKind === "not-configured";
    return (
      <div
        className={`flex ${embedded ? "" : "h-full"} flex-col items-center justify-center gap-3 p-6 text-center`}
      >
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
    <div className={`flex ${embedded ? "" : "h-full"} flex-col`}>
      <div
        className={`flex ${embedded ? "h-8 px-2" : "h-11 px-3"} shrink-0 items-center justify-between gap-2 border-b border-border`}
      >
        <div className={`min-w-0 ${embedded ? "flex items-baseline gap-2" : ""}`}>
          <p
            className={`shrink-0 ${embedded ? "text-ui-xs uppercase tracking-wider" : "text-ui-sm"} font-medium`}
          >
            Usage
          </p>
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
      <div
        className={
          embedded
            ? "grid grid-cols-2 auto-rows-fr items-stretch gap-2 p-2"
            : "min-h-0 flex-1 space-y-2 overflow-y-auto p-2"
        }
      >
        {providers.length === 0 ? (
          <p className="p-2 text-ui-sm text-foreground-subtle">
            No providers are enabled in the codexbar config.
          </p>
        ) : (
          providers.map((provider) => (
            <ProviderCard key={provider.id} provider={provider} compact={embedded} />
          ))
        )}
      </div>
    </div>
  );
}
