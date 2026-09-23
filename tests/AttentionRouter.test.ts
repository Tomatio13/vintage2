import { afterEach, describe, expect, it, vi } from "vitest";

import { AttentionRouter } from "../src/main/attentionRouter.js";
import type { JevEvaluator } from "../src/main/jevJudge.js";
import type {
  AttentionSettings,
  TerminalAttentionState,
  TerminalMonitorMode,
} from "../src/shared/desktop.js";

const OSC = "\u001b]133;";

function recorder(
  jev?: JevEvaluator,
  options: { attentionSettings?: AttentionSettings; monitorMode?: TerminalMonitorMode } = {},
) {
  const states: TerminalAttentionState[] = [];
  const router = new AttentionRouter("terminal-1", (state) => states.push(state), {
    cwd: "/workspace/project-a",
    monitorMode: "monitor",
    ...(jev ? { jev } : {}),
    ...options,
  });
  return { router, states };
}

describe("AttentionRouter", () => {
  afterEach(() => vi.useRealTimers());

  it("defaults to Errors Only and suppresses routine command completion", () => {
    const states: TerminalAttentionState[] = [];
    const router = new AttentionRouter("terminal-default", (state) => states.push(state), {
      cwd: "/workspace/project-a",
    });

    router.observeOutput(`${OSC}C\u0007`);
    router.observeOutput(`${OSC}D;0\u0007`);

    expect(router.snapshot()).toMatchObject({
      status: "idle",
      attentionLevel: 0,
      monitorMode: "ignore_until_error",
    });
    expect(states.map((state) => state.status)).not.toContain("completed");
  });

  it("applies the app attention threshold without changing terminal state detection", () => {
    const { router, states } = recorder(undefined, {
      attentionSettings: {
        debounceMs: 800,
        agentMonitorIntervalSeconds: 10,
        attentionThreshold: 2,
        notificationThreshold: 4,
      },
    });

    router.observeOutput(`${OSC}C\u0007`);
    router.observeOutput(`${OSC}D;0\u0007`);

    expect(router.snapshot()).toMatchObject({
      status: "completed",
      attentionLevel: 0,
      userActionRequired: false,
      notificationThreshold: 4,
    });
    expect(states.at(-1)?.reason).toBe("command_completed");
  });

  it("keeps mute mode visible while retaining the detected attention", () => {
    const { router } = recorder(undefined, { monitorMode: "mute" });

    router.observeOutput(`${OSC}C\u0007`);
    router.observeOutput(`${OSC}D;3\u0007`);

    expect(router.snapshot()).toMatchObject({
      status: "failed",
      attentionLevel: 3,
      userActionRequired: true,
      monitorMode: "mute",
    });
  });

  it("dismisses attention without stopping a running command", () => {
    vi.useFakeTimers();
    const { router } = recorder();
    router.observeOutput(`${OSC}C\u0007`);
    router.observeOutput("Error: listen EADDRINUSE: address already in use\n");
    vi.advanceTimersByTime(800);
    router.dismiss();

    expect(router.snapshot()).toMatchObject({
      status: "running",
      attentionLevel: 0,
      userActionRequired: false,
    });
  });

  it("always notify bypasses both attention and notification thresholds", () => {
    const { router } = recorder(undefined, {
      monitorMode: "always_notify",
      attentionSettings: {
        debounceMs: 800,
        agentMonitorIntervalSeconds: 10,
        attentionThreshold: 4,
        notificationThreshold: 4,
      },
    });

    router.observeOutput(`${OSC}C\u0007`);
    router.observeOutput(`${OSC}D;0\u0007`);

    expect(router.snapshot()).toMatchObject({
      status: "completed",
      attentionLevel: 1,
      userActionRequired: true,
      monitorMode: "always_notify",
      notificationThreshold: 4,
    });
  });

  it("ignore mode clears attention and suppresses later results without stopping shell tracking", () => {
    const { router } = recorder();
    router.observeOutput(`${OSC}C\u0007`);
    router.setMonitorMode("ignore");
    router.observeOutput(`${OSC}D;2\u0007`);

    expect(router.snapshot()).toMatchObject({
      status: "idle",
      attentionLevel: 0,
      userActionRequired: false,
      monitorMode: "ignore",
    });
  });

  it("ignore until error hides routine completion but exposes errors", () => {
    vi.useFakeTimers();
    const { router } = recorder(undefined, { monitorMode: "ignore_until_error" });

    router.observeOutput(`${OSC}C\u0007`);
    router.observeOutput(`${OSC}D;0\u0007`);
    expect(router.snapshot()).toMatchObject({ status: "idle", attentionLevel: 0 });

    router.observeOutput(`${OSC}C\u0007`);
    router.observeOutput("Error: listen EADDRINUSE: address already in use\n");
    vi.advanceTimersByTime(800);
    expect(router.snapshot()).toMatchObject({
      status: "warning",
      attentionLevel: 3,
      reason: "error_output",
      monitorMode: "ignore_until_error",
    });
  });

  it("stops Agent Monitor Jev checks after switching to Errors Only", async () => {
    vi.useFakeTimers();
    const evaluate: JevEvaluator["evaluate"] = vi.fn().mockResolvedValue(null);
    const { router } = recorder({ evaluate }, { monitorMode: "agent_monitor" });

    router.observeOutput(`${OSC}C\u0007`);
    router.observeOutput("agent work is running\n");
    await vi.advanceTimersByTimeAsync(800);
    router.setMonitorMode("ignore_until_error");
    router.observeOutput("ordinary output after the mode change\n");
    await vi.advanceTimersByTimeAsync(30_000);

    expect(evaluate).not.toHaveBeenCalled();
    expect(router.snapshot()).toMatchObject({ monitorMode: "ignore_until_error" });

    router.observeOutput("fatal: simulated issue\n");
    await vi.advanceTimersByTimeAsync(800);
    expect(router.snapshot()).toMatchObject({
      status: "warning",
      reason: "error_output",
      monitorMode: "ignore_until_error",
    });
    expect(evaluate).not.toHaveBeenCalled();
    router.dispose();
  });

  it("does not send successful command completion to Jev in Errors Only", async () => {
    vi.useFakeTimers();
    const evaluate: JevEvaluator["evaluate"] = vi.fn().mockResolvedValue(null);
    const { router } = recorder({ evaluate }, { monitorMode: "ignore_until_error" });

    router.observeOutput(`${OSC}C\u0007`);
    router.observeOutput("routine command output\n");
    router.observeOutput(`${OSC}D;0\u0007`);
    await vi.advanceTimersByTimeAsync(30_000);

    expect(evaluate).not.toHaveBeenCalled();
    expect(router.snapshot()).toMatchObject({
      status: "idle",
      monitorMode: "ignore_until_error",
    });
    router.dispose();
  });

  it("immediately reapplies a changed debounce to the running output", () => {
    vi.useFakeTimers();
    const { router } = recorder(undefined, {
      attentionSettings: {
        debounceMs: 2_000,
        agentMonitorIntervalSeconds: 10,
        attentionThreshold: 1,
        notificationThreshold: 3,
      },
    });

    router.observeOutput(`${OSC}C\u0007`);
    router.observeOutput("Error: listen EADDRINUSE: address already in use\n");
    vi.advanceTimersByTime(1_000);
    router.updateAttentionSettings({
      debounceMs: 300,
      agentMonitorIntervalSeconds: 10,
      attentionThreshold: 1,
      notificationThreshold: 3,
    });
    vi.advanceTimersByTime(299);
    expect(router.snapshot().status).toBe("running");
    vi.advanceTimersByTime(1);
    expect(router.snapshot()).toMatchObject({ status: "warning", reason: "error_output" });
  });

  it("tracks a successful background command across split OSC chunks", () => {
    const { router, states } = recorder();

    router.observeOutput(`${OSC.slice(0, 4)}`);
    router.observeOutput(`${OSC.slice(4)}C\u0007`);
    expect(router.snapshot().status).toBe("running");

    router.observeOutput(`${OSC}D;0\u0007`);

    expect(states.at(-1)).toMatchObject({
      sessionId: "terminal-1",
      status: "completed",
      attentionLevel: 1,
      userActionRequired: true,
      source: "shell",
      lastExitCode: 0,
    });
  });

  it("raises high attention for a failed background command", () => {
    const { router, states } = recorder();

    router.observeOutput(`${OSC}C\u0007test output\r\n`);
    router.observeOutput(`${OSC}D;2\u0007`);

    expect(states.at(-1)).toMatchObject({
      status: "failed",
      attentionLevel: 3,
      userActionRequired: true,
      lastExitCode: 2,
    });
  });

  it("monitors completion in the active terminal", () => {
    const { router, states } = recorder();
    router.setActive(true);

    router.observeOutput(`${OSC}C\u0007`);
    router.observeOutput(`${OSC}D;1\u0007`);

    expect(states.at(-1)).toMatchObject({
      status: "failed",
      attentionLevel: 3,
      userActionRequired: true,
      lastExitCode: 1,
    });
  });

  it("detects an explicit password prompt in a background terminal", () => {
    vi.useFakeTimers();
    const { router, states } = recorder();

    router.observeOutput(`${OSC}C\u0007`);
    router.observeOutput("Password: ");
    vi.advanceTimersByTime(800);

    expect(states.at(-1)).toMatchObject({
      status: "waiting_input",
      attentionLevel: 3,
      userActionRequired: true,
      source: "pty",
    });
  });

  it("does not acknowledge pending attention from focus alone", () => {
    const { router, states } = recorder();

    router.observeOutput(`${OSC}C\u0007`);
    router.observeOutput(`${OSC}D;1\u0007`);
    router.setActive(true);

    expect(states.at(-1)).toMatchObject({
      status: "failed",
      attentionLevel: 3,
      userActionRequired: true,
    });
  });

  it("acknowledges pending attention when the user types", () => {
    const { router, states } = recorder();

    router.observeOutput(OSC + "C\u0007");
    router.observeOutput(OSC + "D;1\u0007");
    router.setActive(true);
    router.observeInput();

    expect(states.at(-1)).toMatchObject({
      status: "idle",
      attentionLevel: 0,
      userActionRequired: false,
    });
  });

  it("keeps an OSC marker at the start of a large PTY chunk", () => {
    const { router } = recorder();

    router.observeOutput(`${OSC}C\u0007${"x".repeat(2048)}`);

    expect(router.snapshot().status).toBe("running");
  });

  it("raises medium attention when a long-running command completes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
    const { router, states } = recorder();

    router.observeOutput(`${OSC}C\u0007`);
    vi.advanceTimersByTime(30_000);
    router.observeOutput(`${OSC}D;0\u0007`);

    expect(states.at(-1)).toMatchObject({
      status: "completed",
      attentionLevel: 2,
      reason: "long_running_completed",
      durationMs: 30_000,
    });
  });

  it("leaves SSH-specific semantics to Jev instead of a tool analyzer", () => {
    vi.useFakeTimers();
    const { router } = recorder();

    router.observeOutput(OSC + "C\u0007");
    router.observeOutput("Connection to demo closed by remote host.\r\n");
    vi.advanceTimersByTime(800);

    expect(router.snapshot().status).toBe("running");

    router.observeOutput(OSC + "D;0\u0007");
    expect(router.snapshot()).toMatchObject({
      status: "completed",
      source: "shell",
      reason: "command_completed",
    });
  });

  it("detects strong error output before the process exits", () => {
    vi.useFakeTimers();
    const { router, states } = recorder();

    router.observeOutput(`${OSC}C\u0007`);
    router.observeOutput("Error: listen EADDRINUSE: address already in use\r\n");
    vi.advanceTimersByTime(800);

    expect(states.at(-1)).toMatchObject({
      status: "warning",
      attentionLevel: 3,
      reason: "error_output",
    });

    router.observeOutput(`${OSC}D;0\u0007`);
    expect(states.at(-1)).toMatchObject({
      status: "warning",
      attentionLevel: 3,
      reason: "error_output",
      lastExitCode: 0,
    });
  });

  it("preserves a detected warning after a successful exit", () => {
    vi.useFakeTimers();
    const { router, states } = recorder();

    router.observeOutput(`${OSC}C\u0007`);
    router.observeOutput("warning: deprecated option\r\n");
    vi.advanceTimersByTime(800);
    router.observeOutput(`${OSC}D;0\u0007`);

    expect(states.at(-1)).toMatchObject({
      status: "warning",
      attentionLevel: 2,
      reason: "warning_output",
      lastExitCode: 0,
    });
  });

  it("detects an incident when the command exits before the debounce", () => {
    vi.useFakeTimers();
    const { router } = recorder();

    router.observeOutput(`${OSC}C\u0007`);
    router.observeOutput("warning: late heuristic\r\n");
    router.observeOutput(`${OSC}D;0\u0007`);
    vi.advanceTimersByTime(800);

    expect(router.snapshot()).toMatchObject({
      status: "warning",
      attentionLevel: 2,
      reason: "warning_output",
      lastExitCode: 0,
    });
  });

  it("applies a Jev decision to ambiguous successful output", async () => {
    const evaluate: JevEvaluator["evaluate"] = vi.fn().mockResolvedValue({
      status: "waiting_input",
      attentionLevel: 3,
      userActionRequired: true,
      keepMonitoring: false,
      confidence: 0.84,
      semanticHash: "semantic-hash",
      model: "jev-test",
    });
    const { router } = recorder({ evaluate });

    router.observeOutput(OSC + "C\u0007" + OSC + "E;npm run deploy\u0007");
    router.observeOutput("Deployment paused at a review gate\r\n");
    router.observeOutput(OSC + "D;0\u0007");

    await vi.waitFor(() => expect(router.snapshot().source).toBe("jev"));
    expect(evaluate).toHaveBeenCalledWith({
      command: "npm run deploy",
      cwd: "/workspace/project-a",
      exitCode: 0,
      background: true,
      output: "Deployment paused at a review gate\n",
      statusHints: ["command_end", "completed_locally"],
      durationMs: expect.any(Number),
    });
    expect(router.snapshot()).toMatchObject({
      status: "waiting_input",
      attentionLevel: 3,
      userActionRequired: true,
      source: "jev",
      reason: "semantic_judgment",
      semanticHash: "semantic-hash",
      judgmentConfidence: 0.84,
      judgmentModel: "jev-test",
      keepMonitoring: false,
    });
  });

  it("keeps command-end judgment active when the shell returns to its prompt", async () => {
    let release!: (value: Awaited<ReturnType<JevEvaluator["evaluate"]>>) => void;
    const evaluate: JevEvaluator["evaluate"] = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<JevEvaluator["evaluate"]>>>((resolve) => {
          release = resolve;
        }),
    );
    const { router } = recorder({ evaluate });

    router.observeOutput(OSC + "C\u0007");
    router.observeOutput(OSC + "D;0\u0007" + OSC + "A\u0007");
    await vi.waitFor(() => expect(evaluate).toHaveBeenCalledTimes(1));
    release({
      status: "warning",
      attentionLevel: 2,
      userActionRequired: true,
      keepMonitoring: false,
      confidence: 0.9,
      semanticHash: "completed-output-hash",
      model: "jev-test",
    });

    await vi.waitFor(() => expect(router.snapshot().source).toBe("jev"));
    expect(router.snapshot()).toMatchObject({
      status: "warning",
      reason: "semantic_judgment",
      semanticHash: "completed-output-hash",
    });
  });

  it("applies an in-flight Jev decision after the terminal becomes active", async () => {
    let release!: (value: Awaited<ReturnType<JevEvaluator["evaluate"]>>) => void;
    const evaluate: JevEvaluator["evaluate"] = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<JevEvaluator["evaluate"]>>>((resolve) => {
          release = resolve;
        }),
    );
    const { router } = recorder({ evaluate });

    router.observeOutput(OSC + "C\u0007" + OSC + "E;custom-tool\u0007ambiguous\r\n");
    router.observeOutput(OSC + "D;0\u0007");
    router.setActive(true);
    release({
      status: "warning",
      attentionLevel: 3,
      userActionRequired: true,
      keepMonitoring: false,
      confidence: 0.9,
      semanticHash: "stale-hash",
      model: "jev-test",
    });
    await Promise.resolve();

    expect(router.snapshot()).toMatchObject({
      status: "warning",
      attentionLevel: 3,
      userActionRequired: true,
      source: "jev",
    });
  });

  it("passes foreground context to Jev for an active terminal", async () => {
    const evaluate: JevEvaluator["evaluate"] = vi.fn().mockResolvedValue(null);
    const { router } = recorder({ evaluate });
    router.setActive(true);

    router.observeOutput(OSC + "C\u0007active output\r\n");
    router.observeOutput(OSC + "D;0\u0007");

    await vi.waitFor(() => expect(evaluate).toHaveBeenCalled());
    expect(evaluate).toHaveBeenCalledWith(expect.objectContaining({ background: false }));
  });

  it("debounces ambiguous running output and includes foreground context", () => {
    vi.useFakeTimers();
    const evaluate: JevEvaluator["evaluate"] = vi.fn().mockResolvedValue(null);
    const { router } = recorder({ evaluate });
    router.setActive(true);

    router.observeOutput(OSC + "C\u0007working through an ambiguous approval gate\r\n");
    vi.advanceTimersByTime(801);

    expect(evaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        background: false,
        output: "working through an ambiguous approval gate\n",
        statusHints: ["command_running", "output_changed"],
      }),
    );
  });

  it("does not send locally recognized input prompts to Jev while running", () => {
    vi.useFakeTimers();
    const evaluate: JevEvaluator["evaluate"] = vi.fn().mockResolvedValue(null);
    const { router } = recorder({ evaluate });

    router.observeOutput(OSC + "C\u0007Password: ");
    vi.advanceTimersByTime(801);

    expect(evaluate).not.toHaveBeenCalled();
    expect(router.snapshot().status).toBe("waiting_input");
  });

  it("limits continuous output evaluations per terminal", () => {
    vi.useFakeTimers();
    const evaluate: JevEvaluator["evaluate"] = vi.fn().mockResolvedValue(null);
    const { router } = recorder({ evaluate });

    router.observeOutput(OSC + "C\u0007first ambiguous update\n");
    vi.advanceTimersByTime(801);
    router.observeOutput("second ambiguous update\n");
    vi.advanceTimersByTime(801);
    expect(evaluate).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(4_200);
    expect(evaluate).toHaveBeenCalledTimes(2);
  });

  it("periodically classifies quiet agent work and keeps thinking informational", async () => {
    vi.useFakeTimers();
    const evaluate: JevEvaluator["evaluate"] = vi.fn().mockResolvedValue({
      status: "thinking",
      attentionLevel: 0,
      userActionRequired: false,
      keepMonitoring: false,
      confidence: 0.92,
      semanticHash: "quiet-agent-state",
      model: "jev-test",
    });
    const { router } = recorder(
      { evaluate },
      {
        monitorMode: "agent_monitor",
        attentionSettings: {
          debounceMs: 800,
          agentMonitorIntervalSeconds: 10,
          attentionThreshold: 1,
          notificationThreshold: 3,
        },
      },
    );

    router.observeProcess("claude", ["zsh", "claude"]);
    router.observeOutput(`${OSC}C\u0007`);
    await vi.advanceTimersByTimeAsync(800);
    expect(evaluate).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(9_200);
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(evaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        foregroundProcess: "claude",
        processTree: ["zsh", "claude"],
        output: "",
        statusHints: expect.arrayContaining(["agent_monitor", "no_new_output"]),
      }),
    );
    expect(router.snapshot()).toMatchObject({
      status: "thinking",
      attentionLevel: 0,
      userActionRequired: false,
      source: "jev",
      monitorMode: "agent_monitor",
    });

    await vi.advanceTimersByTimeAsync(10_000);
    expect(evaluate).toHaveBeenCalledTimes(2);
    router.dispose();
  });

  it("shows Thinking as soon as Agent Monitor output starts flowing", async () => {
    vi.useFakeTimers();
    const evaluate: JevEvaluator["evaluate"] = vi.fn().mockResolvedValue(null);
    const { router } = recorder({ evaluate }, { monitorMode: "agent_monitor" });

    router.observeOutput(`${OSC}C\u0007`);
    router.observeOutput("working on another step\n");

    expect(router.snapshot()).toMatchObject({
      status: "thinking",
      attentionLevel: 0,
      userActionRequired: false,
      source: "pty",
      reason: "agent_activity",
      monitorMode: "agent_monitor",
    });
    await vi.advanceTimersByTimeAsync(800);
    expect(evaluate).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(9_200);
    expect(evaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        statusHints: expect.arrayContaining(["agent_monitor", "output_changed"]),
      }),
    );
    router.dispose();
  });

  it.each([
    { status: "waiting_input" as const, attentionLevel: 3 as const },
    { status: "failed" as const, attentionLevel: 3 as const },
  ])("routes periodic $status decisions into Attention", async ({ status, attentionLevel }) => {
    vi.useFakeTimers();
    const evaluate: JevEvaluator["evaluate"] = vi.fn().mockResolvedValue({
      status,
      attentionLevel,
      userActionRequired: true,
      keepMonitoring: false,
      confidence: 0.91,
      semanticHash: `agent-${status}`,
      model: "jev-test",
    });
    const { router } = recorder({ evaluate }, { monitorMode: "agent_monitor" });

    router.observeOutput(`${OSC}C\u0007`);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(router.snapshot()).toMatchObject({
      status,
      attentionLevel,
      userActionRequired: true,
      source: "jev",
      reason: "semantic_judgment",
    });
    router.dispose();
  });

  it("starts periodic evaluation when Agent Monitor is enabled on a running command", async () => {
    vi.useFakeTimers();
    const evaluate: JevEvaluator["evaluate"] = vi.fn().mockResolvedValue(null);
    const { router } = recorder({ evaluate }, { monitorMode: "monitor" });

    router.observeOutput(`${OSC}C\u0007`);
    router.setMonitorMode("agent_monitor");
    await vi.advanceTimersByTimeAsync(10_000);

    expect(evaluate).toHaveBeenCalledTimes(1);
    router.dispose();
  });

  it("does not let a routine Jev state clear an active local error", async () => {
    vi.useFakeTimers();
    const evaluate: JevEvaluator["evaluate"] = vi.fn().mockResolvedValue({
      status: "thinking",
      attentionLevel: 0,
      userActionRequired: false,
      keepMonitoring: false,
      confidence: 0.91,
      semanticHash: "routine-after-error",
      model: "jev-test",
    });
    const { router } = recorder({ evaluate }, { monitorMode: "agent_monitor" });

    router.observeOutput(`${OSC}C\u0007fatal: simulated issue\n`);
    await vi.advanceTimersByTimeAsync(800);
    expect(router.snapshot()).toMatchObject({ status: "warning", attentionLevel: 3 });

    await vi.advanceTimersByTimeAsync(9_200);
    expect(router.snapshot()).toMatchObject({
      status: "warning",
      attentionLevel: 3,
      userActionRequired: true,
      source: "pty",
    });
    router.dispose();
  });

  it("does not periodically ask Jev outside Agent Monitor mode", async () => {
    vi.useFakeTimers();
    const evaluate: JevEvaluator["evaluate"] = vi.fn().mockResolvedValue(null);
    const { router } = recorder({ evaluate }, { monitorMode: "monitor" });

    router.observeProcess("claude", ["zsh", "claude"]);
    router.observeOutput(`${OSC}C\u0007`);
    await vi.advanceTimersByTimeAsync(30_000);

    expect(evaluate).not.toHaveBeenCalled();
    router.dispose();
  });

  it("restarts the active Agent Monitor timer when its interval changes", async () => {
    vi.useFakeTimers();
    const evaluate: JevEvaluator["evaluate"] = vi.fn().mockResolvedValue(null);
    const { router } = recorder({ evaluate }, { monitorMode: "agent_monitor" });

    router.observeOutput(`${OSC}C\u0007`);
    await vi.advanceTimersByTimeAsync(5_000);
    router.updateAttentionSettings({
      debounceMs: 800,
      agentMonitorIntervalSeconds: 5,
      attentionThreshold: 1,
      notificationThreshold: 3,
    });
    await vi.advanceTimersByTimeAsync(4_999);
    expect(evaluate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(evaluate).toHaveBeenCalledTimes(1);
    router.dispose();
  });

  it("rejects a delayed running decision after new output arrives", async () => {
    vi.useFakeTimers();
    let release!: (value: Awaited<ReturnType<JevEvaluator["evaluate"]>>) => void;
    const evaluate: JevEvaluator["evaluate"] = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<JevEvaluator["evaluate"]>>>((resolve) => {
          release = resolve;
        }),
    );
    const { router } = recorder({ evaluate });

    router.observeOutput(OSC + "C\u0007first ambiguous update\n");
    vi.advanceTimersByTime(801);
    router.observeOutput("new output supersedes the first judgment\n");
    release({
      status: "waiting_input",
      attentionLevel: 3,
      userActionRequired: true,
      keepMonitoring: true,
      confidence: 0.9,
      semanticHash: "old",
      model: "jev-test",
    });
    await Promise.resolve();

    expect(router.snapshot().source).toBe("shell");
    expect(router.snapshot().status).toBe("running");
  });

  it("uses OSC 7 cwd and shared process context for Jev", async () => {
    const evaluate: JevEvaluator["evaluate"] = vi.fn().mockResolvedValue(null);
    const { router } = recorder({ evaluate });

    router.observeOutput("\u001b]7;file://localhost/tmp/next-project\u0007");
    router.observeProcess("node", ["zsh", "node"]);
    router.observeOutput(OSC + "C\u0007ambiguous output\n" + OSC + "D;0\u0007");

    await vi.waitFor(() => expect(evaluate).toHaveBeenCalled());
    expect(evaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: "/tmp/next-project",
        foregroundProcess: "node",
        processTree: ["zsh", "node"],
      }),
    );
  });

  it("uses prompt start to distinguish prompt return from a running command", () => {
    const { router } = recorder();

    router.observeOutput(OSC + "C\u0007");
    router.observeOutput(OSC + "A\u0007" + OSC + "B\u0007");

    expect(router.snapshot()).toMatchObject({ status: "idle", attentionLevel: 0, source: "shell" });
  });
});
