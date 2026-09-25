import type {
  AttentionSettings,
  TerminalAttentionReason,
  TerminalAttentionState,
  TerminalAttentionStatus,
  TerminalMonitorMode,
} from "../shared/desktop.js";
import { DEFAULT_ATTENTION_SETTINGS, DEFAULT_TERMINAL_MONITOR_MODE } from "../shared/desktop.js";
import {
  buildJevState,
  logJevDebug,
  semanticHashForState,
  type JevEvaluationContext,
  type JevEvaluator,
} from "./jevJudge.js";
import { priorityForEvaluation, type JevEvaluationQueue } from "./jevEvaluationQueue.js";
import { AGENT_PROCESS_NAMES } from "./processMonitor.js";

const OSC_133_PREFIX = "\u001b]133;";
const MAX_PROTOCOL_BUFFER = 512;
const MAX_OUTPUT_TAIL = 6000;
const CONTINUOUS_EVALUATION_MIN_INTERVAL_MS = 5_000;
const KEEP_MONITORING_RECHECK_MS = 15_000;
const LONG_RUNNING_THRESHOLD_MS = 30_000;
const MAX_EVALUATED_HASHES = 64;
const AGENT_MONITOR_MAX_BACKOFF_MULTIPLIER = 6;

const WAITING_INPUT_PATTERNS = [
  /(?:password|passphrase)(?:\s+for\s+[^:]+)?:\s*$/iu,
  /(?:press|hit)\s+(?:enter|return)(?:\s+to\s+continue)?\s*$/iu,
  /(?:are you sure|continue|proceed)\?\s*(?:\[[yn](?:\/[yn])?\])?\s*$/iu,
  /(?:enter|input|select|choose)\s+[^:\n]{0,80}:\s*$/iu,
  /do you want to perform these actions\?\s*$/iu,
];

const ERROR_OUTPUT_PATTERNS = [
  /\buncaught exception\b/iu,
  /\bunhandled (?:promise )?rejection\b/iu,
  /\bEADDRINUSE\b/u,
  /\bfatal(?: error)?:/iu,
  /segmentation fault/iu,
  /(?:^|\n)panic:/iu,
];

const WARNING_OUTPUT_PATTERNS = [/(?:^|\n)\s*warning(?:\[[^\]]+\])?:/iu];

type AttentionListener = (state: TerminalAttentionState) => void;

interface TransitionDetails {
  reason?: TerminalAttentionReason;
  lastExitCode?: number;
  durationMs?: number;
  semanticHash?: string;
  judgmentConfidence?: number;
  judgmentModel?: string;
  keepMonitoring?: boolean;
  lastEvaluationAt?: number;
}

export interface AttentionRouterOptions {
  cwd?: string;
  jev?: JevEvaluator;
  evaluationQueue?: JevEvaluationQueue;
  attentionSettings?: AttentionSettings;
  monitorMode?: TerminalMonitorMode;
}

interface DetectedIncident {
  attentionLevel: 2 | 3;
  reason: "error_output" | "warning_output";
}

export class AttentionRouter {
  private active = false;
  private commandRunning = false;
  private commandStartedAt: number | null = null;
  private currentCommand: string | null = null;
  private currentCwd: string | undefined;
  private foregroundProcess: string | undefined;
  private processTree: string[] = [];
  private agentCliDetected = false;
  private promptVisible = false;
  private evaluationRevision = 0;
  private detectedIncident: DetectedIncident | null = null;
  private disposed = false;
  private outputTail = "";
  private protocolBuffer = "";
  private heuristicTimer: ReturnType<typeof setTimeout> | null = null;
  private continuousEvaluationTimer: ReturnType<typeof setTimeout> | null = null;
  private agentMonitorTimer: ReturnType<typeof setTimeout> | null = null;
  private lastContinuousEvaluationAt = 0;
  private readonly evaluatedSemanticHashes = new Set<string>();
  private lastAgentMonitorOutput = "";
  private agentMonitorBackoffMultiplier = 1;
  private agentMonitorPollAnchorAt = 0;
  private agentMonitorPollDueAt = 0;
  private agentTurnConcluded = false;
  private attentionSettings: AttentionSettings;
  private monitorMode: TerminalMonitorMode;
  private state: TerminalAttentionState;

  constructor(
    private readonly sessionId: string,
    private readonly listener: AttentionListener,
    private readonly options: AttentionRouterOptions = {},
  ) {
    this.currentCwd = options.cwd;
    this.attentionSettings = options.attentionSettings ?? { ...DEFAULT_ATTENTION_SETTINGS };
    this.monitorMode = options.monitorMode ?? DEFAULT_TERMINAL_MONITOR_MODE;
    this.state = {
      sessionId,
      status: "idle",
      attentionLevel: 0,
      userActionRequired: false,
      source: "session",
      lastActivityAt: Date.now(),
    };
  }

  observeOutput(data: string): void {
    if (this.disposed) return;
    this.state = { ...this.state, lastActivityAt: Date.now() };
    this.consumeCwdIntegration(data);
    this.consumeShellIntegration(data);
    if (this.monitorMode === "ignore") {
      this.outputTail = "";
      return;
    }
    const normalizedOutput = normalizeOutput(data);
    this.outputTail = `${this.outputTail}${normalizedOutput}`.slice(-MAX_OUTPUT_TAIL);
    const agentOutputActivity =
      this.monitorMode === "agent_monitor" &&
      !this.agentTurnConcluded &&
      normalizedOutput.trim() !== "";
    if (
      agentOutputActivity &&
      this.isAgentMonitorWorkActive() &&
      !(this.state.userActionRequired && this.state.attentionLevel >= 2)
    ) {
      this.transition("thinking", 0, false, "pty", { reason: "agent_activity" });
    }
    if (agentOutputActivity) this.pullAgentMonitorPollSooner();
    this.scheduleHeuristicEvaluation();
  }

  observeProcess(process: string | undefined, tree: string[] = [], agentCliDetected = false): void {
    if (this.disposed) return;
    const previousHadAgentProcess = this.hasKnownAgentProcess();
    const nextProcess = process?.trim() || undefined;
    const nextTree = tree.filter(Boolean).slice(0, 8);
    if (
      nextProcess === this.foregroundProcess &&
      nextTree.join("\u0000") === this.processTree.join("\u0000") &&
      agentCliDetected === this.agentCliDetected
    )
      return;
    this.foregroundProcess = nextProcess;
    this.processTree = nextTree;
    this.agentCliDetected = agentCliDetected;
    if (this.commandRunning) this.scheduleHeuristicEvaluation();
    if (this.monitorMode === "agent_monitor" && this.hasKnownAgentProcess()) {
      this.promptVisible = false;
      this.resetAgentMonitorBackoff();
      if (this.state.status === "idle") {
        this.transition("running", 0, false, "pty");
      }
      this.scheduleAgentMonitorEvaluation();
    } else if (
      this.monitorMode === "agent_monitor" &&
      previousHadAgentProcess &&
      !this.commandRunning
    ) {
      this.promptVisible = true;
      this.agentTurnConcluded = false;
      this.cancelPendingEvaluations();
      if (["running", "thinking", "waiting"].includes(this.state.status)) {
        this.transition("idle", 0, false, "pty");
      }
    }
  }

  observeInput(data?: string): void {
    if (this.disposed) return;
    if (data !== undefined && isSyntheticTerminalInput(data)) return;
    this.resetAgentMonitorBackoff();
    this.agentTurnConcluded = false;
    this.cancelPendingEvaluations();
    if (this.state.status === "waiting_input") {
      this.outputTail = "";
      this.detectedIncident = null;
      this.transition(
        this.promptVisible && !this.commandRunning ? "idle" : "running",
        0,
        false,
        "pty",
      );
      this.scheduleAgentMonitorEvaluation();
      return;
    }
    this.acknowledge();
    this.scheduleAgentMonitorEvaluation();
  }

  observeSessionExit(exitCode: number): void {
    if (this.disposed) return;
    this.cancelPendingEvaluations();
    this.commandRunning = false;
    this.commandStartedAt = null;
    this.transition(
      exitCode === 0 ? "completed" : "failed",
      exitCode === 0 ? 1 : 3,
      exitCode !== 0,
      "session",
      { reason: "session_ended", lastExitCode: exitCode },
    );
  }

  setActive(active: boolean): void {
    if (this.disposed || this.active === active) return;
    this.active = active;
  }

  snapshot(): TerminalAttentionState {
    return this.projectState(this.state);
  }

  setMonitorMode(mode: TerminalMonitorMode): void {
    if (this.disposed || this.monitorMode === mode) return;
    const previousMode = this.monitorMode;
    this.monitorMode = mode;
    this.agentTurnConcluded = false;
    this.cancelPendingEvaluations();
    if (mode === "agent_monitor" && this.hasKnownAgentProcess()) {
      this.promptVisible = false;
      this.resetAgentMonitorBackoff();
    }
    if (mode === "ignore") {
      this.outputTail = "";
      this.detectedIncident = null;
      this.resetAttention();
      return;
    }
    if (
      previousMode === "agent_monitor" &&
      this.state.source === "jev" &&
      !this.state.userActionRequired &&
      this.state.attentionLevel < 2
    ) {
      this.transition(this.commandRunning ? "running" : "idle", 0, false, "shell");
    }
    if (
      mode === "agent_monitor" &&
      this.isAgentMonitorWorkActive() &&
      this.state.status === "idle"
    ) {
      this.transition("running", 0, false, "pty");
    }
    if (mode === "ignore_until_error" && !isErrorState(this.state)) {
      this.outputTail = "";
      this.detectedIncident = null;
      this.resetAttention();
      if (this.commandRunning) this.scheduleHeuristicEvaluation();
      return;
    }
    this.publishCurrentState();
    if (this.isAgentMonitorWorkActive()) {
      if (mode === "agent_monitor") this.scheduleAgentMonitorEvaluation();
      this.scheduleHeuristicEvaluation();
    }
  }

  updateAttentionSettings(settings: AttentionSettings): void {
    if (this.disposed) return;
    const debounceChanged = this.attentionSettings.debounceMs !== settings.debounceMs;
    const agentMonitorIntervalChanged =
      this.attentionSettings.agentMonitorIntervalSeconds !== settings.agentMonitorIntervalSeconds;
    this.attentionSettings = { ...settings };
    this.publishCurrentState();
    if (
      agentMonitorIntervalChanged &&
      this.isAgentMonitorWorkActive() &&
      this.monitorMode === "agent_monitor"
    ) {
      this.resetAgentMonitorBackoff();
      this.scheduleAgentMonitorEvaluation();
    }
    if (debounceChanged && this.commandRunning) {
      this.cancelHeuristicEvaluation();
      this.scheduleHeuristicEvaluation();
    }
  }

  dismiss(): void {
    if (this.disposed || (this.state.attentionLevel === 0 && !this.state.userActionRequired))
      return;
    this.cancelPendingEvaluations();
    this.detectedIncident = null;
    this.outputTail = "";
    this.transition(this.commandRunning ? "running" : "idle", 0, false, "session");
  }

  dispose(): void {
    this.disposed = true;
    this.cancelPendingEvaluations();
  }

  private consumeCwdIntegration(data: string): void {
    // oxlint-disable-next-line no-control-regex -- OSC 7 uses control terminators.
    const matcher = /\u001b\]7;([^\u0007\u001b]*)(?:\u0007|\u001b\\)/gu;
    for (const match of data.matchAll(matcher)) {
      try {
        const parsed = new URL(match[1]!);
        if (parsed.protocol === "file:" && parsed.pathname)
          this.currentCwd = decodeURIComponent(parsed.pathname);
      } catch {
        // Ignore malformed OSC 7 sequences; terminal output remains unaffected.
      }
    }
  }

  private consumeShellIntegration(data: string): void {
    this.protocolBuffer += data;
    while (true) {
      const start = this.protocolBuffer.indexOf(OSC_133_PREFIX);
      if (start < 0) {
        this.protocolBuffer = this.protocolBuffer.slice(-(OSC_133_PREFIX.length - 1));
        return;
      }
      const payloadStart = start + OSC_133_PREFIX.length;
      const bel = this.protocolBuffer.indexOf("\u0007", payloadStart);
      const stringTerminator = this.protocolBuffer.indexOf("\u001b\\", payloadStart);
      const candidates = [bel, stringTerminator].filter((index) => index >= 0);
      if (!candidates.length) {
        this.protocolBuffer =
          this.protocolBuffer.length > MAX_PROTOCOL_BUFFER
            ? this.protocolBuffer.slice(-(OSC_133_PREFIX.length - 1))
            : this.protocolBuffer.slice(start);
        return;
      }
      const end = Math.min(...candidates);
      const terminatorLength = end === stringTerminator ? 2 : 1;
      this.handleShellEvent(this.protocolBuffer.slice(payloadStart, end));
      this.protocolBuffer = this.protocolBuffer.slice(end + terminatorLength);
    }
  }

  private handleShellEvent(payload: string): void {
    const separator = payload.indexOf(";");
    const event = separator < 0 ? payload : payload.slice(0, separator);
    const detail = separator < 0 ? "" : payload.slice(separator + 1);
    if (event === "E") {
      this.currentCommand = normalizeCommand(detail);
      return;
    }
    if (event === "A") {
      this.promptVisible = true;
      if (this.commandRunning) {
        this.commandRunning = false;
        this.cancelPendingEvaluations();
        if (
          this.state.status === "running" ||
          (this.state.reason === "agent_activity" && this.state.status === "thinking") ||
          (this.state.source === "jev" &&
            !this.state.userActionRequired &&
            this.state.attentionLevel < 2)
        ) {
          this.transition("idle", 0, false, "shell");
        }
        return;
      }
      // A prompt with no command in flight means any running/thinking status is stale
      // (e.g. left over after acknowledging a misjudged waiting_input at the prompt).
      if (this.state.status === "running" || this.state.status === "thinking") {
        this.transition("idle", 0, false, "shell");
      }
      return;
    }
    if (event === "B") {
      this.promptVisible = true;
      return;
    }
    if (event === "C") {
      this.cancelPendingEvaluations();
      this.commandRunning = true;
      this.promptVisible = false;
      this.currentCommand = null;
      this.commandStartedAt = Date.now();
      this.detectedIncident = null;
      this.outputTail = "";
      this.lastAgentMonitorOutput = "";
      this.agentTurnConcluded = false;
      this.resetAgentMonitorBackoff();
      this.evaluatedSemanticHashes.clear();
      this.transition("running", 0, false, "shell");
      this.scheduleAgentMonitorEvaluation();
      return;
    }
    if (event !== "D" || !this.commandRunning) return;

    const exitCode = Number.parseInt(detail, 10);
    if (!Number.isInteger(exitCode)) return;
    this.cancelPendingEvaluations();
    this.commandRunning = false;
    const durationMs =
      this.commandStartedAt === null ? undefined : Math.max(0, Date.now() - this.commandStartedAt);
    const durationDetails = durationMs === undefined ? {} : { durationMs };
    const incident = this.detectedIncident ?? this.detectIncidentFromOutput();
    this.detectedIncident = null;
    this.commandStartedAt = null;

    if (incident) {
      this.transition(
        exitCode === 0 ? "warning" : "failed",
        exitCode === 0 ? incident.attentionLevel : 3,
        incident.attentionLevel >= 3 || exitCode !== 0,
        "pty",
        {
          reason: incident.reason,
          lastExitCode: exitCode,
          ...durationDetails,
        },
      );
      return;
    }
    if (exitCode !== 0) {
      this.transition("failed", 3, true, "shell", {
        reason: "command_failed",
        lastExitCode: exitCode,
        ...durationDetails,
      });
      return;
    }
    const longRunning = durationMs !== undefined && durationMs >= LONG_RUNNING_THRESHOLD_MS;
    this.transition("completed", longRunning ? 2 : 1, true, "shell", {
      reason: longRunning ? "long_running_completed" : "command_completed",
      lastExitCode: exitCode,
      ...durationDetails,
    });
    this.scheduleJevEvaluation({
      ...(this.currentCommand === null ? {} : { command: this.currentCommand }),
      ...(this.currentCwd === undefined ? {} : { cwd: this.currentCwd }),
      ...(this.foregroundProcess === undefined
        ? {}
        : { foregroundProcess: this.foregroundProcess }),
      ...(this.processTree.length === 0 ? {} : { processTree: this.processTree }),
      exitCode,
      ...(durationMs === undefined ? {} : { durationMs }),
      background: !this.active,
      output: this.outputTail,
      statusHints: ["command_end", longRunning ? "long_running" : "completed_locally"],
    });
  }

  private scheduleJevEvaluation(context: JevEvaluationContext, running = false): void {
    const jev = this.options.jev;
    const evaluationQueue = this.options.evaluationQueue;
    if (this.monitorMode === "ignore" || this.monitorMode === "ignore_until_error") {
      logJevDebug("router_skipped", {
        sessionId: this.sessionId,
        reason: "monitor_mode",
        monitorMode: this.monitorMode,
      });
      return;
    }
    if (!jev && !evaluationQueue) {
      logJevDebug("router_skipped", {
        sessionId: this.sessionId,
        reason: "evaluator_disabled",
      });
      return;
    }
    const revision = this.evaluationRevision;
    logJevDebug("router_evaluate", { sessionId: this.sessionId, revision });
    const evaluation = evaluationQueue
      ? evaluationQueue.evaluateForTerminal(this.sessionId, priorityForEvaluation(context), context)
      : jev!.evaluate(context);
    void evaluation
      .then((decision) => {
        if (!decision) {
          logJevDebug("router_skipped", {
            sessionId: this.sessionId,
            reason: "no_decision",
          });
          if (
            running &&
            this.monitorMode === "agent_monitor" &&
            context.statusHints.includes("no_new_output") &&
            this.state.status === "thinking" &&
            this.state.source === "pty" &&
            this.state.reason === "agent_activity"
          ) {
            this.transition("running", 0, false, "pty");
          }
          return;
        }
        if (this.disposed || revision !== this.evaluationRevision) {
          logJevDebug("router_skipped", {
            sessionId: this.sessionId,
            reason: this.disposed ? "disposed" : "stale_revision",
          });
          return;
        }
        const shouldPublishAgentStatus =
          running &&
          this.monitorMode === "agent_monitor" &&
          (decision.status === "thinking" ||
            decision.status === "running" ||
            decision.status === "waiting" ||
            decision.status === "completed");
        if (
          shouldPublishAgentStatus &&
          this.state.userActionRequired &&
          this.state.attentionLevel >= 2
        ) {
          logJevDebug("router_skipped", {
            sessionId: this.sessionId,
            reason: "preserving_existing_attention",
            status: this.state.status,
          });
          return;
        }
        if (
          !decision.userActionRequired &&
          decision.attentionLevel < 2 &&
          !shouldPublishAgentStatus
        ) {
          logJevDebug("router_skipped", {
            sessionId: this.sessionId,
            reason: "low_attention",
            status: decision.status,
            attention: decision.attentionLevel,
          });
          return;
        }
        this.transition(
          decision.status,
          decision.attentionLevel,
          decision.userActionRequired,
          "jev",
          {
            reason: "semantic_judgment",
            ...(context.exitCode === undefined ? {} : { lastExitCode: context.exitCode }),
            ...(context.durationMs === undefined ? {} : { durationMs: context.durationMs }),
            semanticHash: decision.semanticHash,
            judgmentConfidence: decision.confidence,
            judgmentModel: decision.model,
            keepMonitoring: decision.keepMonitoring,
            lastEvaluationAt: Date.now(),
          },
        );
        logJevDebug("router_applied", {
          sessionId: this.sessionId,
          status: decision.status,
          attention: decision.attentionLevel,
          actionRequired: decision.userActionRequired,
        });
        // Once Jev concludes the agent turn, later terminal output (TUI redraws etc.)
        // must not flip the badge back to thinking; user input or a new Jev decision re-opens it.
        this.agentTurnConcluded =
          this.monitorMode === "agent_monitor" && decision.status === "completed";
        if (
          running &&
          decision.keepMonitoring &&
          this.commandRunning &&
          this.monitorMode !== "agent_monitor"
        ) {
          this.scheduleContinuousJevEvaluation(KEEP_MONITORING_RECHECK_MS);
        }
      })
      .catch((error: unknown) => {
        logJevDebug("router_error", {
          sessionId: this.sessionId,
          name: error instanceof Error ? error.name : "UnknownError",
        });
      });
  }

  private scheduleHeuristicEvaluation(): void {
    if (!this.commandRunning || this.monitorMode === "ignore") return;
    this.evaluationRevision += 1;
    if (this.heuristicTimer) clearTimeout(this.heuristicTimer);
    this.heuristicTimer = setTimeout(() => {
      this.heuristicTimer = null;
      if (!this.commandRunning || this.monitorMode === "ignore") return;
      const tail = this.outputTail.trimEnd();
      if (
        this.monitorMode !== "ignore_until_error" &&
        WAITING_INPUT_PATTERNS.some((pattern) => pattern.test(tail))
      ) {
        this.transition("waiting_input", 3, true, "pty", { reason: "input_request" });
        return;
      }
      const incident = this.detectIncidentFromOutput();
      if (incident) {
        this.raiseIncident(incident.attentionLevel, incident.reason);
        return;
      }
      if (this.monitorMode === "agent_monitor" || this.monitorMode === "ignore_until_error") return;
      this.scheduleContinuousJevEvaluation();
    }, this.attentionSettings.debounceMs);
  }

  private scheduleContinuousJevEvaluation(delayMs = 0): void {
    if (
      !this.commandRunning ||
      this.monitorMode === "ignore" ||
      this.monitorMode === "ignore_until_error" ||
      (!this.options.jev && !this.options.evaluationQueue) ||
      !this.outputTail.trim()
    )
      return;
    if (this.continuousEvaluationTimer) clearTimeout(this.continuousEvaluationTimer);
    const remainingCooldown = Math.max(
      0,
      this.lastContinuousEvaluationAt === 0
        ? 0
        : this.lastContinuousEvaluationAt + CONTINUOUS_EVALUATION_MIN_INTERVAL_MS - Date.now(),
    );
    this.continuousEvaluationTimer = setTimeout(
      () => {
        this.continuousEvaluationTimer = null;
        if (!this.commandRunning || this.disposed) return;
        const context: JevEvaluationContext = {
          ...(this.currentCommand === null ? {} : { command: this.currentCommand }),
          ...(this.currentCwd === undefined ? {} : { cwd: this.currentCwd }),
          ...(this.foregroundProcess === undefined
            ? {}
            : { foregroundProcess: this.foregroundProcess }),
          ...(this.processTree.length === 0 ? {} : { processTree: this.processTree }),
          background: !this.active,
          output: this.outputTail,
          statusHints: runningStatusHints(this.outputTail),
        };
        const semanticHash = semanticHashForState(buildJevState(context));
        if (this.evaluatedSemanticHashes.has(semanticHash)) return;
        this.rememberEvaluatedHash(semanticHash);
        this.lastContinuousEvaluationAt = Date.now();
        this.scheduleJevEvaluation(context, true);
      },
      Math.max(delayMs, remainingCooldown),
    );
  }

  private scheduleAgentMonitorEvaluation(): void {
    if (
      !this.isAgentMonitorWorkActive() ||
      this.monitorMode !== "agent_monitor" ||
      (!this.options.jev && !this.options.evaluationQueue)
    ) {
      return;
    }
    if (this.agentMonitorTimer) clearTimeout(this.agentMonitorTimer);
    const intervalMs =
      this.attentionSettings.agentMonitorIntervalSeconds *
      1_000 *
      this.agentMonitorBackoffMultiplier;
    this.agentMonitorPollAnchorAt = Date.now();
    this.agentMonitorPollDueAt = this.agentMonitorPollAnchorAt + intervalMs;
    this.agentMonitorTimer = setTimeout(() => this.fireAgentMonitorPoll(), intervalMs);
  }

  // Resumed output after a backed-off silence must not wait out the long interval:
  // pull the pending poll forward to the base cadence (anchored to the last schedule),
  // but never push it later, so active output keeps the normal 10s-style rhythm.
  private pullAgentMonitorPollSooner(): void {
    if (!this.agentMonitorTimer) return;
    const baseIntervalMs = this.attentionSettings.agentMonitorIntervalSeconds * 1_000;
    const earliestDueAt = this.agentMonitorPollAnchorAt + baseIntervalMs;
    if (this.agentMonitorPollDueAt <= earliestDueAt) return;
    clearTimeout(this.agentMonitorTimer);
    this.agentMonitorPollDueAt = Math.max(earliestDueAt, Date.now());
    this.agentMonitorTimer = setTimeout(
      () => this.fireAgentMonitorPoll(),
      Math.max(0, this.agentMonitorPollDueAt - Date.now()),
    );
  }

  private fireAgentMonitorPoll(): void {
    this.agentMonitorTimer = null;
    if (this.disposed || !this.isAgentMonitorWorkActive() || this.monitorMode !== "agent_monitor") {
      return;
    }
    const durationMs =
      this.commandStartedAt === null ? undefined : Math.max(0, Date.now() - this.commandStartedAt);
    const outputChanged = this.outputTail !== this.lastAgentMonitorOutput;
    const statusHints = runningStatusHints(this.outputTail).filter(
      (hint) => hint !== "output_changed",
    );
    statusHints.push("agent_monitor", outputChanged ? "output_changed" : "no_new_output");
    const context: JevEvaluationContext = {
      ...(this.currentCommand === null ? {} : { command: this.currentCommand }),
      ...(this.currentCwd === undefined ? {} : { cwd: this.currentCwd }),
      ...(this.foregroundProcess === undefined
        ? {}
        : { foregroundProcess: this.foregroundProcess }),
      ...(this.processTree.length === 0 ? {} : { processTree: this.processTree }),
      ...(durationMs === undefined ? {} : { durationMs }),
      background: !this.active,
      output: this.outputTail,
      statusHints,
    };
    this.lastAgentMonitorOutput = this.outputTail;
    this.agentMonitorBackoffMultiplier = outputChanged
      ? 1
      : Math.min(this.agentMonitorBackoffMultiplier * 2, AGENT_MONITOR_MAX_BACKOFF_MULTIPLIER);
    this.scheduleJevEvaluation(context, true);
    this.scheduleAgentMonitorEvaluation();
  }

  private detectIncidentFromOutput(): DetectedIncident | null {
    const tail = this.outputTail.trimEnd();
    if (ERROR_OUTPUT_PATTERNS.some((pattern) => pattern.test(tail))) {
      return { attentionLevel: 3, reason: "error_output" };
    }
    if (WARNING_OUTPUT_PATTERNS.some((pattern) => pattern.test(tail))) {
      return { attentionLevel: 2, reason: "warning_output" };
    }
    return null;
  }

  private isAgentMonitorWorkActive(): boolean {
    return this.commandRunning || (!this.promptVisible && this.hasKnownAgentProcess());
  }

  private resetAgentMonitorBackoff(): void {
    this.agentMonitorBackoffMultiplier = 1;
  }

  private rememberEvaluatedHash(semanticHash: string): void {
    this.evaluatedSemanticHashes.add(semanticHash);
    if (this.evaluatedSemanticHashes.size <= MAX_EVALUATED_HASHES) return;
    const oldest = this.evaluatedSemanticHashes.keys().next().value;
    if (oldest !== undefined) this.evaluatedSemanticHashes.delete(oldest);
  }

  private hasKnownAgentProcess(): boolean {
    if (this.agentCliDetected) return true;
    return [this.foregroundProcess, ...this.processTree].some((processName) => {
      if (!processName) return false;
      const leafName = processName.trim().split(/[\\/]/u).at(-1)?.toLowerCase();
      return leafName !== undefined && AGENT_PROCESS_NAMES.has(leafName);
    });
  }

  private raiseIncident(
    attentionLevel: DetectedIncident["attentionLevel"],
    reason: DetectedIncident["reason"],
  ): void {
    if (!this.detectedIncident || attentionLevel >= this.detectedIncident.attentionLevel) {
      this.detectedIncident = { attentionLevel, reason };
    }
    this.transition(
      "warning",
      this.detectedIncident.attentionLevel,
      this.detectedIncident.reason === "error_output",
      "pty",
      { reason: this.detectedIncident.reason },
    );
  }

  private cancelHeuristicEvaluation(): void {
    if (this.heuristicTimer) clearTimeout(this.heuristicTimer);
    this.heuristicTimer = null;
  }

  private cancelPendingEvaluations(): void {
    this.cancelHeuristicEvaluation();
    if (this.continuousEvaluationTimer) clearTimeout(this.continuousEvaluationTimer);
    this.continuousEvaluationTimer = null;
    if (this.agentMonitorTimer) clearTimeout(this.agentMonitorTimer);
    this.agentMonitorTimer = null;
    this.evaluationRevision += 1;
    this.options.evaluationQueue?.cancelTerminal(this.sessionId);
  }

  private acknowledge(): void {
    this.evaluationRevision += 1;
    if (
      !["completed", "failed", "waiting", "waiting_input", "warning"].includes(this.state.status)
    ) {
      return;
    }
    this.detectedIncident = null;
    this.outputTail = "";
    this.transition("idle", 0, false, this.state.source);
  }

  private transition(
    status: TerminalAttentionStatus,
    attentionLevel: 0 | 1 | 2 | 3 | 4,
    userActionRequired: boolean,
    source: TerminalAttentionState["source"],
    details: TransitionDetails = {},
  ): void {
    const next: TerminalAttentionState = {
      sessionId: this.sessionId,
      status,
      attentionLevel,
      userActionRequired,
      source,
      lastActivityAt: Date.now(),
      ...(details.reason === undefined ? {} : { reason: details.reason }),
      ...(details.lastExitCode === undefined ? {} : { lastExitCode: details.lastExitCode }),
      ...(details.durationMs === undefined ? {} : { durationMs: details.durationMs }),
      ...(details.semanticHash === undefined ? {} : { semanticHash: details.semanticHash }),
      ...(details.judgmentConfidence === undefined
        ? {}
        : { judgmentConfidence: details.judgmentConfidence }),
      ...(details.judgmentModel === undefined ? {} : { judgmentModel: details.judgmentModel }),
      ...(details.keepMonitoring === undefined ? {} : { keepMonitoring: details.keepMonitoring }),
      ...(details.lastEvaluationAt === undefined
        ? {}
        : { lastEvaluationAt: details.lastEvaluationAt }),
    };
    if (
      next.status === this.state.status &&
      next.attentionLevel === this.state.attentionLevel &&
      next.userActionRequired === this.state.userActionRequired &&
      next.source === this.state.source &&
      next.reason === this.state.reason &&
      next.lastExitCode === this.state.lastExitCode &&
      next.durationMs === this.state.durationMs &&
      next.semanticHash === this.state.semanticHash &&
      next.judgmentConfidence === this.state.judgmentConfidence &&
      next.judgmentModel === this.state.judgmentModel &&
      next.keepMonitoring === this.state.keepMonitoring &&
      next.lastEvaluationAt === this.state.lastEvaluationAt
    )
      return;
    this.state = next;
    this.publishCurrentState();
  }

  private projectState(state: TerminalAttentionState): TerminalAttentionState {
    const projected: TerminalAttentionState = {
      ...state,
      monitorMode: this.monitorMode,
      notificationThreshold: this.attentionSettings.notificationThreshold,
    };
    const isError = isErrorState(state);
    if (this.monitorMode === "ignore" || (this.monitorMode === "ignore_until_error" && !isError)) {
      return {
        sessionId: state.sessionId,
        status: this.commandRunning ? "running" : "idle",
        attentionLevel: 0,
        userActionRequired: false,
        source: state.source,
        lastActivityAt: state.lastActivityAt,
        monitorMode: this.monitorMode,
        notificationThreshold: this.attentionSettings.notificationThreshold,
      };
    }
    const threshold =
      this.monitorMode === "always_notify" || (this.monitorMode === "ignore_until_error" && isError)
        ? 1
        : this.attentionSettings.attentionThreshold;
    if (projected.attentionLevel < threshold) {
      projected.attentionLevel = 0;
      projected.userActionRequired = false;
    }
    return projected;
  }

  private resetAttention(): void {
    this.state = {
      sessionId: this.sessionId,
      status: this.commandRunning ? "running" : "idle",
      attentionLevel: 0,
      userActionRequired: false,
      source: "session",
      lastActivityAt: Date.now(),
    };
    this.publishCurrentState();
  }

  private publishCurrentState(): void {
    this.listener(this.projectState(this.state));
  }
}

function isErrorState(state: TerminalAttentionState): boolean {
  return state.status === "failed" || state.reason === "error_output";
}

// TUI apps (Claude Code 等) enable mouse (DECSET 1003/1006) and focus (1004) tracking,
// so hovering or switching panes makes the terminal send protocol reports as input.
// Those are not user keystrokes and must not acknowledge attention or re-open the turn.
const SYNTHETIC_INPUT_PATTERNS = [
  // oxlint-disable-next-line no-control-regex -- terminal reports use ESC sequences.
  /^\x1b\[<[0-9;]+[Mm]$/u, // SGR mouse report (motion, drag, click)
  // oxlint-disable-next-line no-control-regex -- terminal reports use ESC sequences.
  /^\x1b\[[IO]$/u, // focus in / focus out report
  // oxlint-disable-next-line no-control-regex -- terminal reports use ESC sequences.
  /^\x1b\[\?[0-9;]*c$/u, // primary device attributes response
  // oxlint-disable-next-line no-control-regex -- terminal reports use ESC sequences.
  /^\x1b\[>[0-9;]*c$/u, // secondary device attributes response
  // oxlint-disable-next-line no-control-regex -- terminal reports use ESC sequences.
  /^\x1b\[\?[0-9;]*u$/u, // kitty keyboard protocol query response
  // oxlint-disable-next-line no-control-regex -- terminal reports use ESC sequences.
  /^\x1b\[\?[0-9;]+\$y$/u, // DECRQM mode report
  // oxlint-disable-next-line no-control-regex -- terminal reports use ESC sequences.
  /^\x1b\[[0-9;]*R$/u, // cursor position report
  // oxlint-disable-next-line no-control-regex -- terminal reports use ESC sequences.
  /^\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)$/u, // OSC query response (e.g. background color)
  // oxlint-disable-next-line no-control-regex -- terminal reports use ESC sequences.
  /^\x1bP[^\x1b]*\x1b\\$/u, // DCS response (e.g. XTVERSION)
];

function isSyntheticTerminalInput(data: string): boolean {
  return SYNTHETIC_INPUT_PATTERNS.some((pattern) => pattern.test(data));
}

function normalizeOutput(value: string): string {
  return (
    value
      // oxlint-disable-next-line no-control-regex -- ANSI OSC uses control terminators.
      .replace(/\u001b\]133;.*?(?:\u0007|\u001b\\)/gu, "")
      // oxlint-disable-next-line no-control-regex -- ANSI OSC uses control terminators.
      .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/gu, "")
      // oxlint-disable-next-line no-control-regex -- ANSI CSI starts with ESC.
      .replace(/\u001b\[[0-?]*[ -/]*[@-~]/gu, "")
      .replace(/\r/gu, "")
  );
}

function runningStatusHints(output: string): string[] {
  const hints = ["command_running", "output_changed"];
  const tail = output.trimEnd();
  if (
    /(?:\?\s*(?:\[[^\]]{1,12}\]|\([^)]+\))?|\b(?:approve|confirm)\b[^.!?\n]*:)\s*$/iu.test(tail)
  ) {
    hints.push("input_candidate");
  }
  if (/\b(?:warning|warn|error|failed)\b/iu.test(tail)) hints.push("warning_candidate");
  return hints;
}

function normalizeCommand(command: string): string | null {
  const normalized = command.trim().replace(/\s+/gu, " ").slice(0, 1_000);
  return normalized || null;
}
