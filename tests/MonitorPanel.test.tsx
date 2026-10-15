import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useUiStore } from "../src/renderer/store/uiStore.js";
import { MonitorPanel } from "../src/renderer/components/MonitorPanel.js";
import type { DesktopBridge } from "../src/shared/desktop.js";
import type { MonitorSession, MonitorSnapshot } from "../src/shared/monitor.js";
const session = (id: string, cwd = "/repo"): MonitorSession => ({
  id,
  agent: "codex",
  pid: 123,
  sessionId: id,
  cwd,
  model: "gpt-5",
  status: "Thinking",
  currentTool: null,
  tools: [],
  contextTokens: 50,
  contextWindow: 100,
  contextEstimated: false,
  inputTokens: 100,
  outputTokens: 50,
  cacheTokens: 0,
  tokensPerSecond: null,
  startedAt: 0,
  lastActivityAt: 0,
  loading: false,
  paneId: "pane-1",
});
const snapshot = (sessions: MonitorSession[]): MonitorSnapshot => ({
  generatedAt: Date.now(),
  supported: true,
  warnings: [],
  sessions,
});
const bridge = (getMonitorSnapshot: ReturnType<typeof vi.fn>) => {
  window.desktop = { getMonitorSnapshot } as unknown as DesktopBridge;
};
afterEach(() => {
  delete window.desktop;
  vi.useRealTimers();
});
const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe("Monitor panel", () => {
  it("polls only while active and preserves selection across refreshed snapshots", async () => {
    vi.useFakeTimers();
    const get = vi
      .fn()
      .mockResolvedValue(snapshot([session("first"), session("second", "/second")]));
    bridge(get);
    const view = render(<MonitorPanel active={false} />);
    await flush();
    expect(get).not.toHaveBeenCalled();
    view.rerender(<MonitorPanel active />);
    await flush();
    fireEvent.click(within(screen.getByLabelText("Sessions")).getByText("second"));
    get.mockResolvedValue(snapshot([session("second", "/second"), session("first")]));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(
      within(screen.getByLabelText("Sessions")).getByText("second").closest("button"),
    ).toHaveAttribute("aria-pressed", "true");
    view.rerender(<MonitorPanel active={false} />);
    const calls = get.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(get).toHaveBeenCalledTimes(calls);
  });

  it("shows sessions across workspaces and navigates to an existing terminal", async () => {
    const get = vi
      .fn()
      .mockResolvedValue(snapshot([session("first"), session("other", "/repo-other")]));
    bridge(get);
    const open = vi.fn();
    render(<MonitorPanel active onOpenTerminal={open} />);
    await flush();
    expect(within(screen.getByLabelText("Sessions")).queryByText("repo-other")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open terminal" }));
    expect(open).toHaveBeenCalledWith("pane-1");
    expect(screen.queryByRole("button", { name: "All sessions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "This workspace" })).not.toBeInTheDocument();
  });

  it("discards a response arriving after the panel becomes inactive", async () => {
    let resolve!: (value: MonitorSnapshot) => void;
    bridge(
      vi.fn().mockReturnValue(
        new Promise<MonitorSnapshot>((done) => {
          resolve = done;
        }),
      ),
    );
    const view = render(<MonitorPanel active />);
    view.rerender(<MonitorPanel active={false} />);
    resolve(snapshot([session("late", "/late")]));
    await flush();
    expect(screen.queryByText("late")).not.toBeInTheDocument();
  });

  it("does not overlap collection and stops when the document is hidden", async () => {
    vi.useFakeTimers();
    let resolve!: (value: MonitorSnapshot) => void;
    const get = vi.fn().mockReturnValue(
      new Promise<MonitorSnapshot>((done) => {
        resolve = done;
      }),
    );
    bridge(get);
    render(<MonitorPanel active />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(get).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    resolve(snapshot([]));
    await flush();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(get).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(get).toHaveBeenCalledTimes(2);
  });
});

it("reports unavailable tokens as unknown rather than zero for a terminal process", async () => {
  const row = {
    ...session("terminal"),
    status: "Unknown" as const,
    launchSurface: "terminal" as const,
    logMatch: "unavailable" as const,
    diagnostic: "No uniquely matched session log.",
    inputTokens: 0,
    outputTokens: 0,
    cacheTokens: 0,
    contextTokens: null,
    contextWindow: null,
    model: null,
  };
  bridge(vi.fn().mockResolvedValue(snapshot([row])));
  render(<MonitorPanel active />);
  await flush();
  expect(screen.queryByText(/Codex · Background/u)).not.toBeInTheDocument();
  const detail = within(screen.getByLabelText("Session details"));
  expect(detail.getByText(row.diagnostic)).toBeInTheDocument();
  expect(detail.getByText("Input").nextElementSibling).toHaveTextContent("—");
  expect(detail.getAllByText("—").length).toBeGreaterThanOrEqual(4);
});

it("keeps the PC overview global and expands without replacing session selection", async () => {
  const next = snapshot([session("inside"), session("outside", "/outside")]);
  next.host = {
    name: "test-pc",
    cpuPercent: 25,
    cores: [25],
    memoryUsedBytes: 1024,
    memoryTotalBytes: 2048,
    loadAverage: 0.2,
  };
  next.history = [
    { at: Date.now(), cpuPercent: 25, memoryPercent: 50, activeSessions: 2, tokenRate: 10 },
  ];
  bridge(vi.fn().mockResolvedValue(next));
  render(<MonitorPanel active />);
  await flush();
  expect(within(screen.getByLabelText("Sessions")).getByText("outside")).toBeInTheDocument();
  expect(screen.queryByText("test-pc")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Expand monitor" }));
  expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
  expect(
    within(screen.getByLabelText("Sessions")).getByText("repo").closest("button"),
  ).toHaveAttribute("aria-pressed", "true");
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("shows known session context tokens without guessing the model capacity", async () => {
  const known = {
    ...session("custom", "/custom"),
    contextTokens: 42000,
    contextWindow: null,
    tokensPerSecond: 0,
  };
  const missing = {
    ...session("missing", "/missing"),
    logMatch: "unavailable" as const,
    contextTokens: null,
    contextWindow: null,
  };
  bridge(vi.fn().mockResolvedValue(snapshot([known, missing])));
  render(<MonitorPanel active />);
  await flush();
  const context = within(screen.getByLabelText("Session details"));
  expect(context.getByText(/42K \/ unknown capacity/u)).toBeInTheDocument();
  expect(context.getByRole("meter")).not.toHaveAttribute("aria-valuenow");
});

it("labels Antigravity, OpenCode and ZCode individually and does not show unavailable token totals as zero", async () => {
  const rows = ["antigravity", "opencode", "zcode"].map((agent, index) => ({
    ...session(agent, `/project-${index}`),
    agent: agent as MonitorSession["agent"],
    tokenTotalsAvailable: false,
  }));
  bridge(vi.fn().mockResolvedValue(snapshot(rows)));
  render(<MonitorPanel active />);
  await flush();
  const list = within(screen.getByLabelText("Sessions"));
  for (const name of ["Antigravity", "OpenCode", "ZCode"])
    expect(list.getByText(name)).toBeInTheDocument();
  const detail = within(screen.getByLabelText("Session details"));
  expect(detail.getByText("Input").nextElementSibling).toHaveTextContent("—");
});

it("keeps unmatched local background agents but hides remote Codex services", async () => {
  bridge(
    vi.fn().mockResolvedValue(
      snapshot([
        {
          ...session("background", "/background"),
          launchSurface: "background",
          logMatch: "unavailable",
        },
        { ...session("remote", "/remote"), launchSurface: "remote", logMatch: "unavailable" },
        session("terminal", "/terminal"),
      ]),
    ),
  );
  render(<MonitorPanel active />);
  await flush();
  const list = within(screen.getByLabelText("Sessions"));
  expect(list.getByText("background")).toBeInTheDocument();
  expect(list.queryByText("remote")).not.toBeInTheDocument();
  expect(list.getByText("terminal")).toBeInTheDocument();
  expect(screen.queryByText(/Background \/ remote/u)).not.toBeInTheDocument();
});

it("keeps ambiguous local background agents visible as Unknown", async () => {
  bridge(
    vi.fn().mockResolvedValue(
      snapshot(
        (["zcode", "opencode", "antigravity", "grok"] as const).map((agent) => ({
          ...session(agent, "/project"),
          agent,
          status: "Unknown" as const,
          logMatch: "unavailable" as const,
          launchSurface: "background" as const,
          diagnostic: "Multiple sessions share this directory.",
        })),
      ),
    ),
  );
  render(<MonitorPanel active />);
  await flush();
  const list = within(screen.getByLabelText("Sessions"));
  for (const name of ["ZCode", "OpenCode", "Antigravity", "Grok"])
    expect(list.getByText(name)).toBeInTheDocument();
});

it("selects the session targeted by a notification when Monitor opens", async () => {
  bridge(
    vi.fn().mockResolvedValue(snapshot([session("first"), session("target", "/target-project")])),
  );
  render(<MonitorPanel active />);
  await flush();
  act(() => useUiStore.getState().openMonitorSession("target"));
  expect(
    within(screen.getByLabelText("Sessions")).getByText("target-project").closest("button"),
  ).toHaveAttribute("aria-pressed", "true");
  act(() => useUiStore.setState({ monitorSessionRequest: null }));
});
