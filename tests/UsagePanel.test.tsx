import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UsagePanel } from "../src/renderer/components/UsagePanel.js";
import { useUiStore } from "../src/renderer/store/uiStore.js";
import type { CodexbarSnapshot, DesktopBridge } from "../src/shared/desktop.js";

// A 30s buffer keeps the "5h" bucket stable against the few ms a test run takes.
const futureReset = new Date(Date.now() + 5 * 60 * 60 * 1000 + 30 * 1000).toISOString();

const snapshot: CodexbarSnapshot = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  host: { codexBarVersion: "0.157.0" },
  providers: [
    {
      id: "codex",
      name: "Codex",
      enabled: true,
      source: "oauth",
      status: { level: "ok", label: "Operational" },
      identity: { accountEmail: "user@example.com", plan: "Plus" },
      windows: [
        {
          kind: "session",
          label: "Session",
          usedPercent: 28,
          remainingPercent: 72,
          resetAt: futureReset,
        },
        { kind: "weekly", label: "Weekly", usedPercent: 59, remainingPercent: 41 },
        { kind: "idle-model", label: "Idle model", remainingPercent: 100, idle: true },
      ],
      credits: { remaining: 112.4, unit: "credits" },
      cost: { todayUSD: 1.04, last30DaysUSD: 18.22 },
      display: { accentColor: "#49A3B0", sortKey: 0 },
      error: null,
    },
    {
      id: "grok",
      name: "Grok",
      enabled: true,
      source: "cli",
      error: { message: "Token expired" },
      display: { sortKey: 1 },
      windows: [],
    },
  ],
};

function enableUsagePanel(): void {
  useUiStore.setState({
    usagePanelEnabled: true,
    usageRefreshSeconds: 0,
    codexbarPath: "/usr/local/bin/codexbar",
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  delete window.desktop;
  useUiStore.setState({
    usagePanelEnabled: false,
    usageRefreshSeconds: 120,
    codexbarPath: "",
    settingsOpen: false,
  });
});

describe("UsagePanel", () => {
  it("renders one card per provider with windows, credits, and cost", async () => {
    enableUsagePanel();
    // Fixed clock so the reset label is deterministic: 5h later on the same local day.
    const fixedNow = new Date(2026, 8, 26, 9, 0, 0).getTime();
    vi.spyOn(Date, "now").mockReturnValue(fixedNow);
    const timedSnapshot: CodexbarSnapshot = {
      ...snapshot,
      generatedAt: new Date(fixedNow).toISOString(),
      providers: [
        {
          ...snapshot.providers[0]!,
          windows: [
            {
              kind: "session",
              label: "Session",
              usedPercent: 28,
              remainingPercent: 72,
              resetAt: new Date(fixedNow + 5 * 60 * 60 * 1000).toISOString(),
            },
            { kind: "weekly", label: "Weekly", usedPercent: 59, remainingPercent: 41 },
          ],
        },
        snapshot.providers[1]!,
      ],
    };
    const getCodexbarUsage = vi.fn().mockResolvedValue({ ok: true, snapshot: timedSnapshot });
    window.desktop = { getCodexbarUsage } as unknown as DesktopBridge;
    render(<UsagePanel active />);

    expect(await screen.findByText("Codex")).toBeInTheDocument();
    expect(getCodexbarUsage).toHaveBeenCalledWith("/usr/local/bin/codexbar");
    expect(screen.getByText("72% left")).toBeInTheDocument();
    expect(screen.getByText("41% left")).toBeInTheDocument();
    expect(screen.getByText("Credits: 112.4 credits left")).toBeInTheDocument();
    expect(screen.getByText("Today: $1.04")).toBeInTheDocument();
    expect(screen.getByText("30 days: $18.22")).toBeInTheDocument();
    expect(screen.getByText("oauth · Plus · user@example.com")).toBeInTheDocument();
    expect(screen.getByText(/codexbar 0\.157\.0/u)).toBeInTheDocument();
    expect(screen.getByText("Resets 2026/09/26 14:00")).toBeInTheDocument();
    expect(screen.getByTitle("Resets in 5h")).toBeInTheDocument();
  });

  it("skips idle windows and shows provider errors", async () => {
    enableUsagePanel();
    window.desktop = {
      getCodexbarUsage: vi.fn().mockResolvedValue({ ok: true, snapshot }),
    } as unknown as DesktopBridge;
    render(<UsagePanel active />);

    expect(await screen.findByText("Codex")).toBeInTheDocument();
    expect(screen.queryByText("Idle model")).not.toBeInTheDocument();
    expect(screen.getByText("Token expired")).toBeInTheDocument();
  });

  it("shows a window without quota data as unavailable", async () => {
    enableUsagePanel();
    const unknownWindowSnapshot: CodexbarSnapshot = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      providers: [
        {
          id: "kilo",
          name: "Kilo",
          enabled: true,
          windows: [{ kind: "credits", label: "Credits" }],
        },
      ],
    };
    window.desktop = {
      getCodexbarUsage: vi.fn().mockResolvedValue({ ok: true, snapshot: unknownWindowSnapshot }),
    } as unknown as DesktopBridge;
    render(<UsagePanel active />);

    expect(await screen.findByText("Usage unavailable")).toBeInTheDocument();
  });

  it("offers settings from the not-configured empty state", async () => {
    enableUsagePanel();
    window.desktop = {
      getCodexbarUsage: vi.fn().mockResolvedValue({
        ok: false,
        errorKind: "not-configured",
        message: "codexbar was not found.",
        resolvedPath: null,
      }),
    } as unknown as DesktopBridge;
    render(<UsagePanel active />);

    expect(await screen.findByText("codexbar was not found.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Settings" }));
    expect(useUiStore.getState().settingsOpen).toBe(true);
  });

  it("offers a retry for transient failures and shows the resolved path", async () => {
    enableUsagePanel();
    const getCodexbarUsage = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        errorKind: "timeout",
        message: "codexbar did not finish in time.",
        resolvedPath: "/usr/local/bin/codexbar",
      })
      .mockResolvedValueOnce({ ok: true, snapshot });
    window.desktop = { getCodexbarUsage } as unknown as DesktopBridge;
    render(<UsagePanel active />);

    expect(await screen.findByText("codexbar did not finish in time.")).toBeInTheDocument();
    expect(screen.getByText("/usr/local/bin/codexbar")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Codex")).toBeInTheDocument();
    expect(getCodexbarUsage).toHaveBeenCalledTimes(2);
  });

  it("does not fetch when the tab is inactive", () => {
    enableUsagePanel();
    const getCodexbarUsage = vi.fn();
    window.desktop = { getCodexbarUsage } as unknown as DesktopBridge;
    render(<UsagePanel active={false} />);

    expect(screen.getByText("Loading usage…")).toBeInTheDocument();
    expect(getCodexbarUsage).not.toHaveBeenCalled();
  });
});
