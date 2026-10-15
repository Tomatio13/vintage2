import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_ATTENTION_SETTINGS,
  type DesktopBridge,
  type TerminalAttentionState,
  type TerminalMonitorMode,
} from "../src/shared/desktop.js";
import type { MonitorSession, MonitorSnapshot, MonitorStatus } from "../src/shared/monitor.js";
import {
  claimWaitToast,
  MonitorSessionTransitions,
  sessionNotificationMode,
} from "../src/renderer/lib/monitorSessionAttention.js";
import { useMonitorSessionNotifications } from "../src/renderer/hooks/useMonitorSessionNotifications.js";

const session = (
  status: MonitorStatus,
  overrides: Partial<MonitorSession> = {},
): MonitorSession => ({
  id: "zcode:123",
  agent: "zcode",
  pid: 123,
  sessionId: "session-1",
  cwd: "/repo/project",
  model: null,
  status,
  currentTool: null,
  tools: [],
  contextTokens: null,
  contextWindow: null,
  contextEstimated: false,
  inputTokens: 0,
  outputTokens: 0,
  cacheTokens: 0,
  tokensPerSecond: null,
  startedAt: 1,
  lastActivityAt: 100,
  loading: false,
  paneId: null,
  ...overrides,
});
const snapshot = (at: number, sessions: MonitorSession[]): MonitorSnapshot => ({
  generatedAt: at,
  supported: true,
  warnings: [],
  sessions,
});
afterEach(() => {
  delete window.desktop;
  vi.restoreAllMocks();
});

describe("session transitions", () => {
  it("notifies once on active -> Waiting and rearms after active work", () => {
    const tracker = new MonitorSessionTransitions();
    expect(tracker.update(snapshot(1, [session("Waiting")]))).toEqual([]);
    expect(tracker.update(snapshot(2, [session("Thinking")]))).toEqual([]);
    expect(tracker.update(snapshot(3, [session("Waiting")]))).toHaveLength(1);
    expect(tracker.update(snapshot(4, [session("Waiting")]))).toEqual([]);
    tracker.update(snapshot(5, [session("Executing")]));
    expect(tracker.update(snapshot(6, [session("Waiting")]))).toHaveLength(1);
  });
  it.each(["failure", "missing", "unknown", "loading", "unsupported"])(
    "rebaselines after %s",
    (gap) => {
      const tracker = new MonitorSessionTransitions();
      tracker.update(snapshot(1, [session("Thinking")]));
      tracker.update(
        gap === "failure"
          ? null
          : gap === "unsupported"
            ? { ...snapshot(2, []), supported: false }
            : snapshot(
                2,
                gap === "missing"
                  ? []
                  : [
                      session(gap === "unknown" ? "Unknown" : "Waiting", {
                        loading: gap === "loading",
                      }),
                    ],
              ),
      );
      expect(tracker.update(snapshot(3, [session("Waiting")]))).toEqual([]);
    },
  );
  it("ignores old snapshots, regressing metadata and replacement sessions", () => {
    const tracker = new MonitorSessionTransitions();
    tracker.update(snapshot(10, [session("Thinking")]));
    expect(tracker.update(snapshot(9, [session("Waiting")]))).toEqual([]);
    expect(tracker.update(snapshot(11, [session("Waiting", { lastActivityAt: 99 })]))).toEqual([]);
    tracker.update(snapshot(12, [session("Thinking")]));
    expect(
      tracker.update(snapshot(13, [session("Waiting", { sessionId: "replacement" })])),
    ).toEqual([]);
  });
  it("deduplicates workers sharing one session but handles simultaneous sessions", () => {
    const tracker = new MonitorSessionTransitions();
    tracker.update(
      snapshot(1, [session("Executing"), session("Thinking", { sessionId: "second" })]),
    );
    expect(
      tracker.update(
        snapshot(2, [
          session("Waiting"),
          session("Waiting", { id: "worker-2", pid: 456 }),
          session("Waiting", { sessionId: "second" }),
        ]),
      ),
    ).toHaveLength(2);
  });
  it("respects terminal modes and allows unbound sessions", () => {
    expect(sessionNotificationMode(session("Waiting"))).toBe("monitor");
    expect(sessionNotificationMode(session("Waiting", { paneId: "pane" }))).toBeNull();
    for (const mode of ["ignore", "ignore_until_error"] as TerminalMonitorMode[])
      expect(sessionNotificationMode(session("Waiting", { paneId: "pane" }), mode)).toBeNull();
    for (const mode of [
      "monitor",
      "agent_monitor",
      "always_notify",
      "mute",
    ] as TerminalMonitorMode[])
      expect(sessionNotificationMode(session("Waiting", { paneId: "pane" }), mode)).toBe(mode);
  });
});

describe("session notifications", () => {
  function setup(
    options: {
      mode?: TerminalMonitorMode;
      desktop?: boolean;
      enabled?: boolean;
      threshold?: 3 | 4;
    } = {},
  ) {
    const show = vi.fn().mockResolvedValue(true);
    window.desktop = {
      showAttentionNotification: show,
      getAttentionSettings: vi.fn().mockResolvedValue({
        ...DEFAULT_ATTENTION_SETTINGS,
        notificationThreshold: options.threshold ?? 3,
      }),
    } as unknown as DesktopBridge;
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    const paneId = options.mode ? `pane-${options.mode}` : null;
    const states = paneId
      ? { [paneId]: { monitorMode: options.mode } as TerminalAttentionState }
      : {};
    const hook = renderHook(
      ({ data }) =>
        useMonitorSessionNotifications(
          data,
          states,
          options.desktop ?? true,
          options.enabled ?? true,
        ),
      { initialProps: { data: snapshot(1, [session("Executing", { paneId })]) } },
    );
    hook.rerender({ data: snapshot(2, [session("Waiting", { paneId })]) });
    return { ...hook, show, paneId };
  }
  it("shows unbound ZCode via existing toast data and OS notification with Monitor target", async () => {
    const hook = setup();
    await waitFor(() => expect(hook.result.current.notices).toHaveLength(1));
    expect(hook.result.current.notices[0]?.item).toMatchObject({
      paneTitle: "ZCode",
      workspaceName: "project",
      source: "session",
    });
    expect(hook.show).toHaveBeenCalledWith(
      expect.objectContaining({ targetMonitorSessionId: "zcode:123", attentionLevel: 3 }),
    );
    hook.rerender({ data: snapshot(3, [session("Waiting")]) });
    expect(hook.show).toHaveBeenCalledTimes(1);
    act(() => hook.result.current.closeNotice(hook.result.current.notices[0]!.id));
    expect(hook.result.current.notices).toEqual([]);
  });
  it("targets the owning Space terminal for bound session notifications", async () => {
    const hook = setup({ mode: "agent_monitor" });
    await waitFor(() => expect(hook.show).toHaveBeenCalledTimes(1));
    expect(hook.show.mock.calls[0]?.[0]).toMatchObject({ targetPaneId: hook.paneId });
    expect(hook.show.mock.calls[0]?.[0]).not.toHaveProperty("targetMonitorSessionId");
  });
  it("keeps app notifications when desktop notifications are disabled", async () => {
    const hook = setup({ desktop: false });
    await waitFor(() => expect(hook.result.current.notices).toHaveLength(1));
    expect(hook.show).not.toHaveBeenCalled();
  });
  it("Mute suppresses native notifications only", async () => {
    const hook = setup({ mode: "mute" });
    await waitFor(() => expect(hook.result.current.notices).toHaveLength(1));
    expect(hook.show).not.toHaveBeenCalled();
  });
  it("respects desktop priority threshold", async () => {
    const hook = setup({ threshold: 4 });
    await waitFor(() => expect(hook.result.current.notices).toHaveLength(1));
    expect(hook.show).not.toHaveBeenCalled();
  });
  it("Always Notify forces native delivery", async () => {
    const hook = setup({ mode: "always_notify", threshold: 4 });
    await waitFor(() =>
      expect(hook.show).toHaveBeenCalledWith(expect.objectContaining({ force: true })),
    );
  });
  it.each([
    { mode: "ignore" as const },
    { mode: "ignore_until_error" as const },
    { enabled: false },
  ])("suppresses disabled session notifications: %j", async (options) => {
    const hook = setup(options);
    await act(async () => {
      await Promise.resolve();
    });
    expect(hook.show).not.toHaveBeenCalled();
    expect(hook.result.current.notices).toEqual([]);
  });
});

it("coalesces terminal and session wait toasts within the notification cooldown", () => {
  expect(claimWaitToast("coalesce-pane", 10000)).toBe(true);
  expect(claimWaitToast("coalesce-pane", 12000)).toBe(false);
  expect(claimWaitToast("coalesce-pane", 15000)).toBe(true);
});
