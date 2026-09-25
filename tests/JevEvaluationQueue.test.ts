import { afterEach, describe, expect, it, vi } from "vitest";

import type { JevDecision, JevEvaluationContext, JevEvaluator } from "../src/main/jevJudge.js";
import {
  JevEvaluationPriorities,
  JevEvaluationQueue,
  priorityForEvaluation,
} from "../src/main/jevEvaluationQueue.js";

const context = (output: string, statusHints: string[] = []): JevEvaluationContext => ({
  background: true,
  output,
  statusHints,
});

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}

function deferredEvaluator() {
  const requests: Array<{
    context: JevEvaluationContext;
    resolve: (decision: JevDecision | null) => void;
  }> = [];
  const evaluator: JevEvaluator = {
    evaluate: vi.fn(
      (evaluationContext: JevEvaluationContext) =>
        new Promise<JevDecision | null>((resolve) => {
          requests.push({ context: evaluationContext, resolve });
        }),
    ),
  };
  return { evaluator, requests };
}

describe("JevEvaluationQueue", () => {
  afterEach(() => vi.useRealTimers());

  it("maps request hints to the documented priority levels", () => {
    expect(priorityForEvaluation(context("prompt", ["input_candidate"]))).toBe(0);
    expect(priorityForEvaluation(context("failure", ["command_failed"]))).toBe(1);
    expect(priorityForEvaluation(context("done", ["command_end"]))).toBe(2);
    expect(priorityForEvaluation(context("warning", ["warning_candidate"]))).toBe(3);
    expect(priorityForEvaluation(context("log", ["output_changed"]))).toBe(4);
    expect(JevEvaluationPriorities).toEqual({
      waitingInput: 0,
      commandFailed: 1,
      commandEnd: 2,
      warningCandidate: 3,
      continuousOutput: 4,
    });
  });

  it("dispatches important requests before queued completion and output checks", async () => {
    const { evaluator, requests } = deferredEvaluator();
    const queue = new JevEvaluationQueue(evaluator, {
      maxConcurrent: 1,
      terminalCooldownMs: 0,
      minRequestIntervalMs: 0,
      maxRequestsPerSecond: 100,
      maxRequestsPerMinute: 100,
    });

    const active = queue.evaluateForTerminal("active", 4, context("active"));
    await flushMicrotasks();
    queue.evaluateForTerminal("complete", 2, context("complete"));
    queue.evaluateForTerminal("log", 4, context("log"));
    queue.evaluateForTerminal("input", 0, context("input", ["input_candidate"]));

    requests[0]!.resolve(null);
    await flushMicrotasks();
    expect(requests.map((request) => request.context.output)).toEqual(["active", "input"]);
    requests[1]!.resolve(null);
    await flushMicrotasks();
    expect(requests.map((request) => request.context.output)).toEqual([
      "active",
      "input",
      "complete",
    ]);
    requests[2]!.resolve(null);
    await flushMicrotasks();
    expect(requests.map((request) => request.context.output)).toEqual([
      "active",
      "input",
      "complete",
      "log",
    ]);
    requests[3]!.resolve(null);
    await active;
    queue.dispose();
  });

  it("coalesces queued requests for a terminal and evaluates the latest context once", async () => {
    const decision = {
      status: "warning",
      attentionLevel: 2,
      userActionRequired: true,
      keepMonitoring: false,
      confidence: 0.8,
      semanticHash: "hash",
      model: "test",
    } satisfies JevDecision;
    const evaluator: JevEvaluator = { evaluate: vi.fn().mockResolvedValue(decision) };
    const queue = new JevEvaluationQueue(evaluator, {
      terminalCooldownMs: 0,
      minRequestIntervalMs: 0,
      maxRequestsPerSecond: 100,
      maxRequestsPerMinute: 100,
    });

    const first = queue.evaluateForTerminal("terminal", 2, context("old"));
    const second = queue.evaluateForTerminal("terminal", 0, context("latest", ["input_candidate"]));
    await expect(first).resolves.toEqual(decision);
    await expect(second).resolves.toEqual(decision);

    expect(evaluator.evaluate).toHaveBeenCalledTimes(1);
    expect(evaluator.evaluate).toHaveBeenCalledWith(
      context("latest", ["input_candidate"]),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    queue.dispose();
  });

  it("applies per-terminal cooldown before dispatching another request", async () => {
    vi.useFakeTimers();
    const { evaluator, requests } = deferredEvaluator();
    const queue = new JevEvaluationQueue(evaluator, {
      terminalCooldownMs: 1_000,
      minRequestIntervalMs: 0,
      maxRequestsPerSecond: 100,
      maxRequestsPerMinute: 100,
    });

    queue.evaluateForTerminal("terminal", 4, context("first"));
    await flushMicrotasks();
    const second = queue.evaluateForTerminal("terminal", 4, context("second"));
    requests[0]!.resolve(null);
    await flushMicrotasks();

    await vi.advanceTimersByTimeAsync(999);
    expect(requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await flushMicrotasks();
    expect(requests.map((request) => request.context.output)).toEqual(["first", "second"]);
    requests[1]!.resolve(null);
    await second;
    queue.dispose();
  });

  it("cancels queued work when its terminal starts a new operation", async () => {
    const { evaluator, requests } = deferredEvaluator();
    const queue = new JevEvaluationQueue(evaluator, {
      maxConcurrent: 1,
      terminalCooldownMs: 0,
      minRequestIntervalMs: 0,
      maxRequestsPerSecond: 100,
      maxRequestsPerMinute: 100,
    });

    queue.evaluateForTerminal("active", 4, context("active"));
    await flushMicrotasks();
    const queued = queue.evaluateForTerminal("terminal", 2, context("stale command"));
    queue.cancelTerminal("terminal");
    await expect(queued).resolves.toBeNull();

    requests[0]!.resolve(null);
    await flushMicrotasks();
    expect(evaluator.evaluate).toHaveBeenCalledTimes(1);
    queue.dispose();
  });

  it("evicts queued low-priority work when a more important request arrives", async () => {
    const { evaluator, requests } = deferredEvaluator();
    const queue = new JevEvaluationQueue(evaluator, {
      maxPending: 1,
      maxConcurrent: 1,
      terminalCooldownMs: 0,
      minRequestIntervalMs: 0,
      maxRequestsPerSecond: 100,
      maxRequestsPerMinute: 100,
    });

    queue.evaluateForTerminal("active", 4, context("active"));
    await flushMicrotasks();
    const dropped = queue.evaluateForTerminal("discard", 4, context("low"));
    const urgent = queue.evaluateForTerminal("urgent", 0, context("urgent"));
    await expect(dropped).resolves.toBeNull();

    requests[0]!.resolve(null);
    await flushMicrotasks();
    expect(requests.map((request) => request.context.output)).toEqual(["active", "urgent"]);
    requests[1]!.resolve(null);
    await urgent;
    queue.dispose();
  });

  it("invalidates queued and in-flight work when evaluator configuration changes", async () => {
    const { requests } = deferredEvaluator();
    const listeners = new Set<() => void>();
    let revision = 0;
    const evaluator: JevEvaluator = {
      evaluate: (evaluationContext) =>
        new Promise((resolve) => requests.push({ context: evaluationContext, resolve })),
      getConfigurationRevision: () => revision,
      onConfigurationChange: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    const queue = new JevEvaluationQueue(evaluator, {
      maxConcurrent: 1,
      terminalCooldownMs: 0,
      minRequestIntervalMs: 0,
      maxRequestsPerSecond: 100,
      maxRequestsPerMinute: 100,
    });

    const active = queue.evaluateForTerminal("active", 2, context("old active"));
    await flushMicrotasks();
    const queued = queue.evaluateForTerminal("queued", 2, context("old queued"));
    revision += 1;
    for (const listener of listeners) listener();

    await expect(active).resolves.toBeNull();
    await expect(queued).resolves.toBeNull();
    requests[0]!.resolve({
      status: "failed",
      attentionLevel: 3,
      userActionRequired: true,
      keepMonitoring: false,
      confidence: 1,
      semanticHash: "stale",
      model: "old-key",
    });
    await flushMicrotasks();
    expect(requests).toHaveLength(1);
    queue.dispose();
  });

  it("enforces application-wide per-second and per-minute limits across terminals", async () => {
    vi.useFakeTimers();
    const evaluator: JevEvaluator = { evaluate: vi.fn().mockResolvedValue(null) };
    const queue = new JevEvaluationQueue(evaluator, {
      maxPending: 64,
      maxConcurrent: 40,
      terminalCooldownMs: 0,
      minRequestIntervalMs: 0,
    });
    const requests = Array.from({ length: 31 }, (_, index) =>
      queue.evaluateForTerminal(`terminal-${index}`, 4, context(`log ${index}`)),
    );
    await flushMicrotasks();
    expect(evaluator.evaluate).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(evaluator.evaluate).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await flushMicrotasks();
    expect(evaluator.evaluate).toHaveBeenCalledTimes(4);

    await vi.advanceTimersByTimeAsync(58_999);
    await flushMicrotasks();
    expect(evaluator.evaluate).toHaveBeenCalledTimes(30);
    await vi.advanceTimersByTimeAsync(1);
    await flushMicrotasks();
    expect(evaluator.evaluate).toHaveBeenCalledTimes(31);
    await Promise.all(requests);
    queue.dispose();
  });

  it("aborts an in-flight request when its terminal cancels", async () => {
    const signals: AbortSignal[] = [];
    const evaluator: JevEvaluator = {
      evaluate: vi.fn(
        (_evaluationContext: JevEvaluationContext, options?: { signal?: AbortSignal }) => {
          if (options?.signal) signals.push(options.signal);
          return new Promise<JevDecision | null>(() => {});
        },
      ),
    };
    const queue = new JevEvaluationQueue(evaluator, {
      terminalCooldownMs: 0,
      minRequestIntervalMs: 0,
    });

    const pending = queue.evaluateForTerminal("terminal-1", 4, context("log"));
    await flushMicrotasks();
    expect(signals).toHaveLength(1);
    expect(signals[0]!.aborted).toBe(false);

    queue.cancelTerminal("terminal-1");
    await expect(pending).resolves.toBeNull();
    expect(signals[0]!.aborted).toBe(true);
    queue.dispose();
  });
});
