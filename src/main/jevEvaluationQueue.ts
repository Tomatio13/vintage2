import type { JevDecision, JevEvaluationContext, JevEvaluator } from "./jevJudge.js";
import { logJevDebug } from "./jevJudge.js";

export type JevEvaluationPriority = 0 | 1 | 2 | 3 | 4;

export const JevEvaluationPriorities = {
  waitingInput: 0,
  commandFailed: 1,
  commandEnd: 2,
  warningCandidate: 3,
  continuousOutput: 4,
} as const satisfies Record<string, JevEvaluationPriority>;

export interface JevEvaluationQueueOptions {
  maxPending?: number;
  maxConcurrent?: number;
  terminalCooldownMs?: number;
  minRequestIntervalMs?: number;
  maxRequestsPerSecond?: number;
  maxRequestsPerMinute?: number;
}

interface QueuedEvaluation {
  terminalId: string;
  priority: JevEvaluationPriority;
  context: JevEvaluationContext;
  sequence: number;
  waiters: Array<(decision: JevDecision | null) => void>;
  settled: boolean;
}

const DEFAULT_MAX_PENDING = 64;
const DEFAULT_MAX_CONCURRENT = 2;
const DEFAULT_TERMINAL_COOLDOWN_MS = 1_000;
const DEFAULT_MIN_REQUEST_INTERVAL_MS = 501;
const DEFAULT_MAX_REQUESTS_PER_SECOND = 2;
const DEFAULT_MAX_REQUESTS_PER_MINUTE = 30;

export class JevEvaluationQueue {
  private readonly pending = new Map<string, QueuedEvaluation>();
  private readonly active = new Map<string, QueuedEvaluation>();
  private readonly lastRequestAtByTerminal = new Map<string, number>();
  private requestHistory: number[] = [];
  private lastRequestAt = Number.NEGATIVE_INFINITY;
  private nextSequence = 0;
  private generation = 0;
  private drainTimer: ReturnType<typeof setTimeout> | null = null;
  private drainScheduled = false;
  private disposed = false;
  private readonly unsubscribeConfiguration: (() => void) | undefined;

  constructor(
    private readonly evaluator: JevEvaluator,
    private readonly options: JevEvaluationQueueOptions = {},
  ) {
    this.unsubscribeConfiguration = evaluator.onConfigurationChange?.(() => {
      this.invalidatePending("evaluator_reconfigured");
    });
  }

  get isConfigured(): boolean {
    return this.evaluator.isConfigured?.() ?? true;
  }

  evaluateForTerminal(
    terminalId: string,
    priority: JevEvaluationPriority,
    context: JevEvaluationContext,
  ): Promise<JevDecision | null> {
    if (this.disposed || !this.isConfigured) return Promise.resolve(null);

    return new Promise((resolve) => {
      const existing = this.pending.get(terminalId);
      if (existing) {
        existing.context = context;
        existing.priority = Math.min(existing.priority, priority) as JevEvaluationPriority;
        existing.sequence = this.nextSequence++;
        existing.waiters.push(resolve);
        logJevDebug("queue_coalesced", {
          terminalId,
          priority: existing.priority,
          pending: this.pending.size,
        });
        this.scheduleDrain();
        return;
      }

      const task: QueuedEvaluation = {
        terminalId,
        priority,
        context,
        sequence: this.nextSequence++,
        waiters: [resolve],
        settled: false,
      };
      const maxPending = this.options.maxPending ?? DEFAULT_MAX_PENDING;
      if (this.pending.size >= maxPending && !this.makeRoomFor(task)) {
        logJevDebug("queue_dropped", {
          terminalId,
          priority,
          reason: "queue_full",
        });
        resolve(null);
        return;
      }
      this.pending.set(terminalId, task);
      logJevDebug("queue_enqueued", {
        terminalId,
        priority,
        pending: this.pending.size,
      });
      this.scheduleDrain();
    });
  }

  cancelTerminal(terminalId: string): void {
    const queued = this.pending.get(terminalId);
    if (queued) {
      this.pending.delete(terminalId);
      this.resolveTask(queued, null);
    }
    const active = this.active.get(terminalId);
    if (active) this.resolveTask(active, null);
    if (queued || active) {
      logJevDebug("queue_terminal_cancelled", {
        terminalId,
        hadQueuedWork: Boolean(queued),
        hadActiveWork: Boolean(active),
      });
      this.scheduleDrain();
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeConfiguration?.();
    this.invalidatePending("queue_disposed");
    if (this.drainTimer) clearTimeout(this.drainTimer);
    this.drainTimer = null;
  }

  private makeRoomFor(incoming: QueuedEvaluation): boolean {
    let lowestPriorityTask: QueuedEvaluation | null = null;
    for (const task of this.pending.values()) {
      if (
        lowestPriorityTask === null ||
        task.priority > lowestPriorityTask.priority ||
        (task.priority === lowestPriorityTask.priority &&
          task.sequence < lowestPriorityTask.sequence)
      ) {
        lowestPriorityTask = task;
      }
    }
    if (!lowestPriorityTask || incoming.priority >= lowestPriorityTask.priority) return false;
    this.pending.delete(lowestPriorityTask.terminalId);
    this.resolveTask(lowestPriorityTask, null);
    logJevDebug("queue_dropped", {
      terminalId: lowestPriorityTask.terminalId,
      priority: lowestPriorityTask.priority,
      reason: "evicted_for_higher_priority",
    });
    return true;
  }

  private invalidatePending(reason: string): void {
    this.generation += 1;
    for (const task of this.pending.values()) this.resolveTask(task, null);
    this.pending.clear();
    for (const task of this.active.values()) this.resolveTask(task, null);
    logJevDebug("queue_invalidated", { reason, generation: this.generation });
    this.scheduleDrain();
  }

  private scheduleDrain(): void {
    if (this.disposed) return;
    if (this.drainTimer) {
      clearTimeout(this.drainTimer);
      this.drainTimer = null;
    }
    if (this.drainScheduled) return;
    this.drainScheduled = true;
    queueMicrotask(() => {
      this.drainScheduled = false;
      this.drain();
    });
  }

  private drain(): void {
    if (this.disposed) return;
    const maxConcurrent = this.options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
    let nextEligibleAt = Number.POSITIVE_INFINITY;

    while (this.active.size < maxConcurrent && this.pending.size > 0) {
      const now = Date.now();
      const globalEligibleAt = this.globalEligibleAt(now);
      const candidates = [...this.pending.values()]
        .filter((task) => !this.active.has(task.terminalId))
        .sort((left, right) => left.priority - right.priority || left.sequence - right.sequence);
      const eligible = candidates.find((task) => {
        const terminalEligibleAt =
          (this.lastRequestAtByTerminal.get(task.terminalId) ?? Number.NEGATIVE_INFINITY) +
          (this.options.terminalCooldownMs ?? DEFAULT_TERMINAL_COOLDOWN_MS);
        const taskEligibleAt = Math.max(globalEligibleAt, terminalEligibleAt);
        if (taskEligibleAt <= now) return true;
        nextEligibleAt = Math.min(nextEligibleAt, taskEligibleAt);
        return false;
      });

      if (!eligible) break;
      this.pending.delete(eligible.terminalId);
      this.start(eligible, now);
    }

    if (this.pending.size === 0 || !Number.isFinite(nextEligibleAt)) return;
    if (this.active.size >= maxConcurrent) return;
    this.drainTimer = setTimeout(
      () => {
        this.drainTimer = null;
        this.drain();
      },
      Math.max(1, nextEligibleAt - Date.now()),
    );
  }

  private globalEligibleAt(now: number): number {
    this.requestHistory = this.requestHistory.filter((timestamp) => timestamp >= now - 60_000);
    let eligibleAt = Math.max(
      this.lastRequestAt + (this.options.minRequestIntervalMs ?? DEFAULT_MIN_REQUEST_INTERVAL_MS),
      now,
    );
    const requestsPerSecond = this.options.maxRequestsPerSecond ?? DEFAULT_MAX_REQUESTS_PER_SECOND;
    const requestsLastSecond = this.requestHistory.filter((timestamp) => timestamp >= now - 1_000);
    if (requestsLastSecond.length >= requestsPerSecond) {
      eligibleAt = Math.max(
        eligibleAt,
        requestsLastSecond[requestsLastSecond.length - requestsPerSecond]! + 1_001,
      );
    }

    const requestsPerMinute = this.options.maxRequestsPerMinute ?? DEFAULT_MAX_REQUESTS_PER_MINUTE;
    if (this.requestHistory.length >= requestsPerMinute) {
      eligibleAt = Math.max(eligibleAt, this.requestHistory[0]! + 60_001);
    }
    return eligibleAt;
  }

  private start(task: QueuedEvaluation, startedAt: number): void {
    this.active.set(task.terminalId, task);
    this.lastRequestAt = startedAt;
    this.lastRequestAtByTerminal.set(task.terminalId, startedAt);
    this.requestHistory.push(startedAt);
    const generation = this.generation;
    const evaluatorRevision = this.evaluator.getConfigurationRevision?.();
    logJevDebug("queue_dispatch", {
      terminalId: task.terminalId,
      priority: task.priority,
      active: this.active.size,
      pending: this.pending.size,
    });

    void this.evaluator
      .evaluate(task.context)
      .then((decision) => {
        const currentRevision = this.evaluator.getConfigurationRevision?.();
        if (
          this.disposed ||
          generation !== this.generation ||
          (evaluatorRevision !== undefined && currentRevision !== evaluatorRevision)
        ) {
          this.resolveTask(task, null);
          return;
        }
        this.resolveTask(task, decision);
      })
      .catch((error: unknown) => {
        logJevDebug("queue_error", {
          terminalId: task.terminalId,
          name: error instanceof Error ? error.name : "UnknownError",
        });
        this.resolveTask(task, null);
      })
      .finally(() => {
        this.active.delete(task.terminalId);
        this.scheduleDrain();
      });
  }

  private resolveTask(task: QueuedEvaluation, decision: JevDecision | null): void {
    if (task.settled) return;
    task.settled = true;
    for (const resolve of task.waiters) resolve(decision);
    task.waiters = [];
  }
}

export function priorityForEvaluation(context: JevEvaluationContext): JevEvaluationPriority {
  const hints = new Set(context.statusHints);
  if (hints.has("waiting_input") || hints.has("input_request") || hints.has("input_candidate")) {
    return JevEvaluationPriorities.waitingInput;
  }
  if (hints.has("command_failed") || hints.has("failed")) {
    return JevEvaluationPriorities.commandFailed;
  }
  if (hints.has("command_end") || hints.has("completed_locally")) {
    return JevEvaluationPriorities.commandEnd;
  }
  if (hints.has("warning_candidate")) return JevEvaluationPriorities.warningCandidate;
  return JevEvaluationPriorities.continuousOutput;
}
