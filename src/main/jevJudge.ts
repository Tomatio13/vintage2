import { createHash } from "node:crypto";
import { basename } from "node:path";

import { noul, score, TypeSafeClient } from "@typesafe-ai/sdk";

import type { TerminalAttentionStatus } from "../shared/desktop.js";

const MAX_OUTPUT_LINES = 40;
const MAX_OUTPUT_CHARS = 4_000;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_REQUESTS_PER_SECOND = 2;
const MAX_REQUESTS_PER_MINUTE = 30;
const MAX_CACHE_ENTRIES = 256;
const STATE_FACT_THRESHOLD = 0.5;
const MIN_CONFIDENCE = 0.5;
const JEV_DEBUG = process.env.VINTAGE_JEV_DEBUG === "1";

const FAILED_QUESTION = noul(
  "Has the current agent turn terminated in an unrecovered failure? Use explicit failure evidence or a non-zero exit code associated with this turn. A recoverable error that the agent is handling is not a failed turn.",
);

const NEEDS_USER_INPUT_QUESTION = noul(
  "Is this same agent turn blocked on a specific user answer, approval, choice, or missing information before it can finish? Do not count the normal CLI prompt for the next independent request.",
);

const TURN_FINISHED_QUESTION = noul(
  "Has the current agent turn finished? Answer yes if either the agent has clearly produced its final response with no further action pending, or the CLI has returned to its normal prompt ready for a new independent request. Do not require both conditions. The interactive CLI process may remain alive after the turn finishes. A normal prompt for the next independent request is completed, not waiting_input. This is a fact about the current turn, not process lifetime.",
);

const WARNING_QUESTION = noul(
  "Is there a concrete, current warning or non-fatal problem in the terminal workflow that needs the user to inspect or address it? Do not count ordinary informational output, a caveat or disclaimer in the agent's final answer, a recommendation to verify facts, or a quoted warning that does not describe a current actionable issue.",
);

const PROCESS_ACTIVE_QUESTION = noul(
  "Is a concrete command, tool, subprocess, or external program actively executing as part of the current turn? Do not count an interactive agent CLI that is merely sitting at its normal next-turn prompt.",
);

const AGENT_ACTIVE_QUESTION = noul(
  "Is the agent actively reasoning, planning, interpreting results, choosing a tool, or generating another action for the current turn? output_changed alone is not evidence; inspect what the changed output means.",
);

const WAITING_EXTERNAL_QUESTION = noul(
  "Is the current turn unfinished and waiting for an external operation or dependency, with no user input required? Silence alone is not sufficient evidence.",
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
  failed: FAILED_QUESTION,
  needsUserInput: NEEDS_USER_INPUT_QUESTION,
  turnFinished: TURN_FINISHED_QUESTION,
  warning: WARNING_QUESTION,
  processActive: PROCESS_ACTIVE_QUESTION,
  agentActive: AGENT_ACTIVE_QUESTION,
  waitingExternal: WAITING_EXTERNAL_QUESTION,
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

interface StateFacts {
  failed: number;
  needsUserInput: number;
  turnFinished: number;
  warning: number;
  processActive: number;
  agentActive: number;
  waitingExternal: number;
}

const STATE_FACT_PRIORITY = [
  ["failed", "failed"],
  ["needsUserInput", "waiting_input"],
  ["turnFinished", "completed"],
  ["warning", "warning"],
  ["processActive", "running"],
  ["agentActive", "thinking"],
  ["waitingExternal", "waiting"],
] as const satisfies ReadonlyArray<readonly [keyof StateFacts, TerminalAttentionStatus]>;

function resolveStatusFacts(facts: StateFacts): {
  status: TerminalAttentionStatus;
  confidence: number;
} {
  for (const [fact, status] of STATE_FACT_PRIORITY) {
    if (facts[fact] >= STATE_FACT_THRESHOLD) {
      return { status, confidence: facts[fact] };
    }
  }
  return { status: "unknown", confidence: 0 };
}

export interface JevEvaluationOptions {
  signal?: AbortSignal;
}

export interface JevEvaluator {
  evaluate(
    context: JevEvaluationContext,
    options?: JevEvaluationOptions,
  ): Promise<JevDecision | null>;
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

  evaluate(
    context: JevEvaluationContext,
    options?: JevEvaluationOptions,
  ): Promise<JevDecision | null> {
    return this.delegate?.evaluate(context, options) ?? Promise.resolve(null);
  }
}

export class JevEvaluationService implements JevEvaluator {
  private readonly cache = new Map<string, JevDecision>();
  private readonly requestHistory: number[] = [];

  constructor(private readonly client: TypeSafeClient) {}

  async evaluate(
    context: JevEvaluationContext,
    options?: JevEvaluationOptions,
  ): Promise<JevDecision | null> {
    const state = buildJevState(context);
    if (state.output_tail.length === 0 && !state.status_hints.includes("agent_monitor")) {
      logJevDebug("skipped", { reason: "empty_output" });
      return null;
    }
    const semanticHash = semanticHashForState(state);
    const dedupeKey = semanticDedupeKeyForState(state);
    const diagnosticHash = semanticHash.slice(0, 12);
    const cached = this.cache.get(dedupeKey);
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
        {
          ...(options?.signal === undefined ? {} : { signal: options.signal }),
          timeout: REQUEST_TIMEOUT_MS,
          retry: { maxRetries: 0 },
        },
      );
      const attentionAnswer = response.answers.attention;
      const actionProbability = response.answers.actionRequired.noul;
      const scoredLevel = clampAttentionLevel(Math.round(attentionAnswer.score));
      const rawFacts: StateFacts = {
        failed: response.answers.failed.noul,
        needsUserInput: response.answers.needsUserInput.noul,
        turnFinished: response.answers.turnFinished.noul,
        warning: response.answers.warning.noul,
        processActive: response.answers.processActive.noul,
        agentActive: response.answers.agentActive.noul,
        waitingExternal: response.answers.waitingExternal.noul,
      };
      const facts: StateFacts = {
        ...rawFacts,
        warning: actionProbability >= STATE_FACT_THRESHOLD ? rawFacts.warning : 0,
      };
      const resolved = resolveStatusFacts(facts);
      const status = resolved.status;
      logJevDebug("response", {
        hash: diagnosticHash,
        elapsedMs: Date.now() - startedAt,
        model: response.model,
        status,
        statusFacts: rawFacts,
        statusFactsUsed: facts,
        statusFactProbability: resolved.confidence,
        attention: attentionAnswer.score,
        attentionConfidence: attentionAnswer.confidence,
        actionRequired: actionProbability,
      });
      if (status === "unknown") {
        logJevDebug("skipped", {
          reason: "unknown_state_facts",
          hash: diagnosticHash,
          statusFacts: rawFacts,
          statusFactsUsed: facts,
          attentionConfidence: attentionAnswer.confidence,
          actionRequired: actionProbability,
        });
        return null;
      }

      const informationalStatus =
        status === "thinking" ||
        status === "running" ||
        status === "waiting" ||
        (status === "completed" && scoredLevel < 2 && actionProbability < 0.65);
      // Status facts already carry the 0.5 threshold, so an unconfident attention score
      // only clamps the level to the status floor instead of discarding the classification.
      const attentionConfident = attentionAnswer.confidence >= MIN_CONFIDENCE;
      const confidence = Math.min(resolved.confidence, attentionAnswer.confidence);
      const attentionLevel = informationalStatus
        ? 0
        : minimumLevelForStatus(status, attentionConfident ? scoredLevel : 0);
      if (!attentionConfident) {
        logJevDebug("attention_clamped", {
          hash: diagnosticHash,
          status,
          attentionConfidence: attentionAnswer.confidence,
        });
      }
      const userActionRequired = informationalStatus
        ? false
        : actionProbability >= 0.65 || status === "failed" || status === "waiting_input";
      const decision: JevDecision = {
        status,
        attentionLevel,
        userActionRequired,
        keepMonitoring: response.answers.keepMonitoring.noul >= 0.5,
        confidence,
        semanticHash,
        model: response.model,
      };
      this.cache.set(dedupeKey, decision);
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
  const normalized = redactBearerTokens(
    output
      // oxlint-disable-next-line no-control-regex -- terminal output contains ANSI sequences.
      .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/gu, "")
      // oxlint-disable-next-line no-control-regex -- terminal output contains ANSI CSI sequences.
      .replace(/\u001b\[[0-?]*[ -/]*[@-~]/gu, "")
      .replace(
        /-----BEGIN [^-]+ PRIVATE KEY-----[\s\S]*?-----END [^-]+ PRIVATE KEY-----/giu,
        "<PRIVATE_KEY_REDACTED>",
      ),
  )
    .replace(
      /\b([A-Za-z0-9_-]*(?:secret|token|password|passwd|api[_-]?key|access[_-]?key)[a-z0-9_-]*)\s*[:=]\s*(?:"[^"]*"|'[^']*'|\S+)/giu,
      "$1=<REDACTED>",
    )
    .replace(/\r/gu, "");

  const redacted = redactTokenFormats(normalized)
    .replace(/\b\d{4}-\d{2}-\d{2}[T ][0-9:.+-]+Z?\b/gu, "<TIMESTAMP>")
    .replace(/\[(?:\d{2}:){2}\d{2}\]/gu, "[<TIME>]")
    .replace(/\bPID\s*[:=]?\s*\d+\b/giu, "PID=<PID>")
    .replace(/\b\d+(?:\.\d+)?%/gu, "<PERCENT>")
    .replace(/\b\d+(?:\.\d+)?\s*(?:KiB|MiB|GiB|KB|MB|GB)\/s\b/giu, "<TRANSFER_RATE>");

  const lines = redacted
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

// duration_ms advances on every periodic Agent Monitor poll; freezing it lets the
// decision cache absorb repeated polls of an unchanged terminal state.
export function semanticDedupeKeyForState(state: JevEvaluationState): string {
  return createHash("sha256")
    .update(JSON.stringify({ ...state, duration_ms: null }))
    .digest("hex");
}

function sanitizeProcessName(name: string): string {
  return basename(name)
    .replace(/[^A-Za-z0-9._+-]/gu, "")
    .slice(0, 120);
}

function redactBearerTokens(value: string): string {
  return value.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/giu, "Bearer <REDACTED>");
}

function redactTokenFormats(value: string): string {
  return value
    .replace(/\bAKIA[0-9A-Z]{16}\b/gu, "<AWS_KEY_REDACTED>")
    .replace(/\b(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{20,}\b/gu, "<GITHUB_TOKEN_REDACTED>")
    .replace(/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/gu, "<SLACK_TOKEN_REDACTED>")
    .replace(/\bsk-[A-Za-z0-9_-]{20,}\b/gu, "<API_TOKEN_REDACTED>")
    .replace(/\bAIza[0-9A-Za-z_-]{35}\b/gu, "<GOOGLE_API_KEY_REDACTED>")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu, "<JWT_REDACTED>");
}

function sanitizeCommand(command: string): string {
  return redactTokenFormats(
    redactBearerTokens(command)
      .replace(
        /(--)?\b([A-Za-z0-9_-]*(?:secret|token|password|passwd|api[_-]?key|access[_-]?key)[a-z0-9_-]*)\s*(?:[:=]|\s)\s*(?:"[^"]*"|'[^']*'|\S+)/giu,
        "$1$2=<REDACTED>",
      )
      .replace(/(https?:\/\/)[^/\s:@]+:[^/\s@]+@/giu, "$1<REDACTED>@"),
  ).slice(0, 1_000);
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
