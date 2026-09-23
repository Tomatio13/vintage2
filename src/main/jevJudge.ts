import { createHash } from "node:crypto";
import { basename } from "node:path";

import { choice, noul, score, TypeSafeClient } from "@typesafe-ai/sdk";

import type { TerminalAttentionStatus } from "../shared/desktop.js";

const MAX_OUTPUT_LINES = 40;
const MAX_OUTPUT_CHARS = 4_000;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_REQUESTS_PER_SECOND = 2;
const MAX_REQUESTS_PER_MINUTE = 30;
const MAX_CACHE_ENTRIES = 256;
const MIN_CONFIDENCE = 0.55;
const JEV_DEBUG = process.env.VINTAGE_JEV_DEBUG === "1";

const STATUS_QUESTION = choice(
  "Based only on command, exit_code, duration_ms, background, status_hints, and output_tail, what is the current terminal state? Choose the single best operational state. Do not infer facts absent from the state.",
  {
    completed: "The work ended successfully and does not need user review.",
    failed: "The work failed, aborted, or is blocked by an error.",
    waiting_input: "The process is paused and needs user input, approval, or a choice.",
    warning: "The work produced a meaningful warning or risky result the user should review.",
    running: "The process is still running normally and needs no user action.",
    unknown: "The supplied state is insufficient or genuinely ambiguous.",
  },
);

const ATTENTION_QUESTION = score(
  "How urgently should the user inspect this terminal? Use the background field as context, but judge urgency rather than technical complexity.",
  [
    "0 NONE: normal running or idle state; no reason to interrupt the user.",
    "1 LOW: ordinary successful completion; a passive badge is sufficient.",
    "2 MEDIUM: notable completion or warning worth reviewing later.",
    "3 HIGH: failure, blocked work, disconnection, or explicit input required.",
    "4 CRITICAL: immediate action is needed to prevent serious irreversible harm or security impact.",
  ],
);

const ACTION_REQUIRED_QUESTION = noul(
  "Does the terminal state clearly require the user to provide input, make a decision, fix a failure, or inspect a meaningful risk?",
  {
    true: "The workflow cannot safely continue, or an important result requires review.",
    false: "The workflow is proceeding normally or completed without meaningful risk.",
  },
);

const KEEP_MONITORING_QUESTION = noul(
  "Is the terminal process still running or otherwise worth monitoring for a later state change?",
);

const QUESTIONS = {
  status: STATUS_QUESTION,
  attention: ATTENTION_QUESTION,
  actionRequired: ACTION_REQUIRED_QUESTION,
  keepMonitoring: KEEP_MONITORING_QUESTION,
};

export interface JevEvaluationContext {
  command?: string;
  cwd?: string;
  exitCode?: number;
  durationMs?: number;
  foregroundProcess?: string;
  processTree?: string[];
  background: boolean;
  output: string;
  statusHints: string[];
}

export interface JevEvaluationState {
  [key: string]: string | number | boolean | null | string[];
  command: string;
  cwd_name: string;
  exit_code: number | null;
  duration_ms: number | null;
  foreground_process: string;
  process_tree: string[];
  background: boolean;
  status_hints: string[];
  output_tail: string[];
}

export interface JevDecision {
  status: TerminalAttentionStatus;
  attentionLevel: 0 | 1 | 2 | 3 | 4;
  userActionRequired: boolean;
  keepMonitoring: boolean;
  confidence: number;
  semanticHash: string;
  model: string;
}

export interface JevEvaluator {
  evaluate(context: JevEvaluationContext): Promise<JevDecision | null>;
  isConfigured?(): boolean;
  getConfigurationRevision?(): number;
  onConfigurationChange?(listener: () => void): () => void;
}

export function logJevDebug(event: string, details: Record<string, unknown> = {}): void {
  if (JEV_DEBUG) console.info("[VINTAGE Jev] " + event, details);
}

export class JevEvaluatorController implements JevEvaluator {
  private delegate: JevEvaluator | null = null;
  private configurationRevision = 0;
  private readonly configurationListeners = new Set<() => void>();

  configure(apiKey: string | null): void {
    this.delegate = apiKey
      ? createJevEvaluator({ ...process.env, TYPESAFE_API_KEY: apiKey })
      : null;
    this.configurationRevision += 1;
    for (const listener of this.configurationListeners) listener();
    if (!apiKey) logJevDebug("disabled", { reason: "not_configured" });
  }

  isConfigured(): boolean {
    return this.delegate !== null;
  }

  getConfigurationRevision(): number {
    return this.configurationRevision;
  }

  onConfigurationChange(listener: () => void): () => void {
    this.configurationListeners.add(listener);
    return () => this.configurationListeners.delete(listener);
  }

  evaluate(context: JevEvaluationContext): Promise<JevDecision | null> {
    return this.delegate?.evaluate(context) ?? Promise.resolve(null);
  }
}

export class JevEvaluationService implements JevEvaluator {
  private readonly cache = new Map<string, JevDecision>();
  private readonly requestHistory: number[] = [];

  constructor(private readonly client: TypeSafeClient) {}

  async evaluate(context: JevEvaluationContext): Promise<JevDecision | null> {
    const state = buildJevState(context);
    if (state.output_tail.length === 0) {
      logJevDebug("skipped", { reason: "empty_output" });
      return null;
    }
    const semanticHash = semanticHashForState(state);
    const diagnosticHash = semanticHash.slice(0, 12);
    const cached = this.cache.get(semanticHash);
    if (cached) {
      logJevDebug("cache_hit", { hash: diagnosticHash });
      return { ...cached };
    }
    if (!this.reserveRequest()) {
      logJevDebug("skipped", { reason: "rate_limited", hash: diagnosticHash });
      return null;
    }

    const startedAt = Date.now();
    logJevDebug("request", {
      hash: diagnosticHash,
      outputLines: state.output_tail.length,
      timeoutMs: REQUEST_TIMEOUT_MS,
    });
    try {
      const response = await this.client.systemOne(
        { state, questions: QUESTIONS },
        { timeout: REQUEST_TIMEOUT_MS, retry: { maxRetries: 0 } },
      );
      const statusAnswer = response.answers.status;
      const attentionAnswer = response.answers.attention;
      const actionProbability = response.answers.actionRequired.noul;
      const scoredLevel = clampAttentionLevel(Math.round(attentionAnswer.score));
      const statusReliable = statusAnswer.confidence >= MIN_CONFIDENCE;
      const attentionRequired =
        attentionAnswer.confidence >= MIN_CONFIDENCE &&
        scoredLevel >= 2 &&
        actionProbability >= 0.65;
      logJevDebug("response", {
        hash: diagnosticHash,
        elapsedMs: Date.now() - startedAt,
        model: response.model,
        status: statusAnswer.choice,
        statusConfidence: statusAnswer.confidence,
        attention: attentionAnswer.score,
        attentionConfidence: attentionAnswer.confidence,
        actionRequired: actionProbability,
      });
      if (statusAnswer.choice === "unknown" || (!statusReliable && !attentionRequired)) {
        logJevDebug("skipped", {
          reason: statusAnswer.choice === "unknown" ? "unknown_status" : "low_confidence",
          hash: diagnosticHash,
          statusConfidence: statusAnswer.confidence,
          attentionConfidence: attentionAnswer.confidence,
          actionRequired: actionProbability,
        });
        return null;
      }

      const status = statusReliable ? statusAnswer.choice : "warning";
      const confidence = statusReliable
        ? Math.min(statusAnswer.confidence, attentionAnswer.confidence)
        : Math.min(attentionAnswer.confidence, actionProbability);
      if (!statusReliable) {
        logJevDebug("fallback_warning", {
          hash: diagnosticHash,
          originalStatus: statusAnswer.choice,
          statusConfidence: statusAnswer.confidence,
          confidence,
        });
      }
      const attentionLevel = minimumLevelForStatus(status, scoredLevel);
      const userActionRequired =
        actionProbability >= 0.65 || status === "failed" || status === "waiting_input";
      const decision: JevDecision = {
        status,
        attentionLevel,
        userActionRequired,
        keepMonitoring: response.answers.keepMonitoring.noul >= 0.5,
        confidence,
        semanticHash,
        model: response.model,
      };
      this.cache.set(semanticHash, decision);
      while (this.cache.size > MAX_CACHE_ENTRIES) {
        const oldest = this.cache.keys().next().value as string | undefined;
        if (oldest === undefined) break;
        this.cache.delete(oldest);
      }
      return { ...decision };
    } catch (error) {
      logJevDebug("error", {
        hash: diagnosticHash,
        elapsedMs: Date.now() - startedAt,
        name: error instanceof Error ? error.name : "UnknownError",
      });
      return null;
    }
  }

  private reserveRequest(now = Date.now()): boolean {
    while (this.requestHistory[0] !== undefined && this.requestHistory[0] < now - 60_000) {
      this.requestHistory.shift();
    }
    const requestsLastSecond = this.requestHistory.filter(
      (timestamp) => timestamp >= now - 1_000,
    ).length;
    if (
      requestsLastSecond >= MAX_REQUESTS_PER_SECOND ||
      this.requestHistory.length >= MAX_REQUESTS_PER_MINUTE
    ) {
      return false;
    }
    this.requestHistory.push(now);
    return true;
  }
}

export function createJevEvaluator(
  environment: NodeJS.ProcessEnv = process.env,
): JevEvaluator | null {
  if (!environment.TYPESAFE_API_KEY?.trim()) {
    logJevDebug("disabled", { reason: "missing_api_key" });
    return null;
  }
  logJevDebug("enabled", {
    timeoutMs: REQUEST_TIMEOUT_MS,
    model: environment.TYPESAFE_DEFAULT_MODEL?.trim() || "jev-latest",
    customBaseUrl: Boolean(environment.TYPESAFE_BASE_URL?.trim()),
  });
  return new JevEvaluationService(
    new TypeSafeClient({
      apiKey: environment.TYPESAFE_API_KEY,
      ...(environment.TYPESAFE_BASE_URL?.trim() ? { baseURL: environment.TYPESAFE_BASE_URL } : {}),
      ...(environment.TYPESAFE_DEFAULT_MODEL?.trim()
        ? { defaultModel: environment.TYPESAFE_DEFAULT_MODEL }
        : {}),
      timeout: REQUEST_TIMEOUT_MS,
      retry: { maxRetries: 0 },
      logLevel: "off",
    }),
  );
}

export function buildJevState(context: JevEvaluationContext): JevEvaluationState {
  return {
    command: sanitizeCommand(context.command ?? ""),
    cwd_name: context.cwd ? basename(context.cwd) : "",
    exit_code: context.exitCode ?? null,
    duration_ms: context.durationMs ?? null,
    foreground_process: sanitizeProcessName(context.foregroundProcess ?? ""),
    process_tree: (context.processTree ?? []).slice(0, 8).map(sanitizeProcessName),
    background: context.background,
    status_hints: context.statusHints.slice(0, 8),
    output_tail: normalizeOutputForJev(context.output),
  };
}

export function normalizeOutputForJev(output: string): string[] {
  const normalized = output
    // oxlint-disable-next-line no-control-regex -- terminal output contains ANSI sequences.
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/gu, "")
    // oxlint-disable-next-line no-control-regex -- terminal output contains ANSI CSI sequences.
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/gu, "")
    .replace(
      /-----BEGIN [^-]+ PRIVATE KEY-----[\s\S]*?-----END [^-]+ PRIVATE KEY-----/giu,
      "<PRIVATE_KEY_REDACTED>",
    )
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/giu, "Bearer <REDACTED>")
    .replace(
      /\b(api[_-]?key|access[_-]?token|auth[_-]?token|password|passwd|secret)\s*[:=]\s*[^\s]+/giu,
      "$1=<REDACTED>",
    )
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu, "<JWT_REDACTED>")
    .replace(/\b\d{4}-\d{2}-\d{2}[T ][0-9:.+-]+Z?\b/gu, "<TIMESTAMP>")
    .replace(/\[(?:\d{2}:){2}\d{2}\]/gu, "[<TIME>]")
    .replace(/\bPID\s*[:=]?\s*\d+\b/giu, "PID=<PID>")
    .replace(/\b\d+(?:\.\d+)?%/gu, "<PERCENT>")
    .replace(/\b\d+(?:\.\d+)?\s*(?:KiB|MiB|GiB|KB|MB|GB)\/s\b/giu, "<TRANSFER_RATE>")
    .replace(/\r/gu, "");

  const lines = normalized
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .slice(-MAX_OUTPUT_LINES);
  while (lines.join("\n").length > MAX_OUTPUT_CHARS && lines.length > 1) lines.shift();
  if (lines.length === 1 && lines[0]!.length > MAX_OUTPUT_CHARS) {
    lines[0] = lines[0]!.slice(-MAX_OUTPUT_CHARS);
  }
  return lines;
}

export function semanticHashForState(state: JevEvaluationState): string {
  return createHash("sha256").update(JSON.stringify(state)).digest("hex");
}

function sanitizeProcessName(name: string): string {
  return basename(name)
    .replace(/[^A-Za-z0-9._+-]/gu, "")
    .slice(0, 120);
}

function sanitizeCommand(command: string): string {
  return command
    .replace(
      /(--)?\b(api[_-]?key|access[_-]?token|auth[_-]?token|password|passwd|secret)\b\s*(?:[:=]|\s)\s*(?:"[^"]*"|'[^']*'|\S+)/giu,
      "$1$2=<REDACTED>",
    )
    .replace(/(https?:\/\/)[^/\s:@]+:[^/\s@]+@/giu, "$1<REDACTED>@")
    .slice(0, 1_000);
}

function clampAttentionLevel(value: number): 0 | 1 | 2 | 3 | 4 {
  return Math.min(4, Math.max(0, value)) as 0 | 1 | 2 | 3 | 4;
}

function minimumLevelForStatus(
  status: TerminalAttentionStatus,
  level: 0 | 1 | 2 | 3 | 4,
): 0 | 1 | 2 | 3 | 4 {
  if (status === "failed" || status === "waiting_input") return Math.max(3, level) as 3 | 4;
  if (status === "warning") return Math.max(2, level) as 2 | 3 | 4;
  return level;
}
