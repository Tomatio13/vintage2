import { open } from "node:fs/promises";
import type { MonitorAgent, MonitorSession, MonitorTool } from "../shared/monitor.js";

type Json = Record<string, unknown>;
const object = (value: unknown): Json =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
const text = (value: unknown, max = 240): string | null =>
  typeof value === "string" && value.length > 0
    ? value.slice(0, max).replace(/\p{Cc}/gu, " ")
    : null;
const count = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
const time = (value: unknown): number | null =>
  typeof value === "string" && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
const MAX_LINE = 2 * 1024 * 1024;
const MAX_READ = 8 * 1024 * 1024;

export class MonitorTranscript {
  readonly state: Omit<
    MonitorSession,
    | "id"
    | "pid"
    | "tokensPerSecond"
    | "paneId"
    | "logMatch"
    | "diagnostic"
    | "launchSurface"
    | "cpuPercent"
    | "memoryBytes"
    | "children"
  >;
  private pending = new Map<string, MonitorTool>();
  private usage = new Map<string, [number, number, number]>();
  private offset = 0;
  private identity = "";
  private partial = Buffer.alloc(0);
  private skippingLine = false;
  private sequence = 0;

  constructor(readonly agent: MonitorAgent) {
    this.state = {
      agent,
      sessionId: null,
      cwd: "",
      model: null,
      status: "Unknown",
      currentTool: null,
      tools: [],
      contextTokens: null,
      contextWindow: null,
      contextEstimated: false,
      inputTokens: 0,
      outputTokens: 0,
      cacheTokens: 0,
      startedAt: null,
      lastActivityAt: null,
      loading: false,
      turnCount: 0,
    };
  }

  async read(path: string): Promise<void> {
    const file = await open(path, "r");
    try {
      const stat = await file.stat();
      if (!stat.isFile()) throw new Error("Not a transcript file");
      const identity = `${stat.dev}:${stat.ino}`;
      if (identity !== this.identity || stat.size < this.offset) {
        Object.assign(this.state, new MonitorTranscript(this.agent).state);
        this.pending.clear();
        this.usage.clear();
        this.partial = Buffer.alloc(0);
        this.offset = 0;
        this.sequence = 0;
        this.skippingLine = false;
        this.identity = identity;
      }
      const end = Math.min(stat.size, this.offset + MAX_READ);
      while (this.offset < end) {
        const buffer = Buffer.alloc(Math.min(256 * 1024, end - this.offset));
        const { bytesRead } = await file.read(buffer, 0, buffer.length, this.offset);
        if (!bytesRead) break;
        this.offset += bytesRead;
        this.feed(buffer.subarray(0, bytesRead));
      }
      this.state.loading = this.offset < stat.size;
    } finally {
      await file.close();
    }
  }

  // Buffers bytes (not decoded text) so a split UTF-8 character remains intact.
  feed(bytes: Buffer): void {
    const buffer = Buffer.concat([this.partial, bytes]);
    let start = 0;
    for (;;) {
      const end = buffer.indexOf(10, start);
      if (end < 0) break;
      if (!this.skippingLine && end - start <= MAX_LINE) {
        try {
          this.accept(JSON.parse(buffer.subarray(start, end).toString("utf8")));
        } catch {
          /* Incomplete/unknown records do not stop collection. */
        }
      }
      this.skippingLine = false;
      start = end + 1;
    }
    this.partial = buffer.subarray(start);
    if (this.partial.length > MAX_LINE || this.skippingLine) {
      this.partial = Buffer.alloc(0);
      this.skippingLine = true;
    }
  }

  accept(value: unknown): void {
    const record = object(value);
    const at = time(record.timestamp);
    if (at !== null) this.state.lastActivityAt = at;
    if (this.agent === "codex") this.codex(record, at);
    else this.claude(record, at);
  }

  private startTool(id: string, name: unknown, args: unknown, at: number | null): void {
    if (this.pending.has(id)) return;
    const input = object(args);
    // Keep file paths only. Commands, prompts, tool results and source text never cross IPC.
    const tool: MonitorTool = {
      id,
      name: text(name) ?? "Tool",
      path: text(input.file_path ?? input.path),
      startedAt: at,
      durationMs: null,
    };
    this.pending.set(id, tool);
    while (this.pending.size > 128) this.pending.delete(this.pending.keys().next().value!);
    this.state.tools = [...this.state.tools, tool].slice(-24);
    this.updateToolStatus();
  }

  private finishTool(id: string, at: number | null): void {
    const tool = this.pending.get(id);
    if (tool) {
      tool.durationMs =
        at !== null && tool.startedAt !== null ? Math.max(0, at - tool.startedAt) : null;
      this.pending.delete(id);
    }
    this.updateToolStatus();
  }

  private updateToolStatus(): void {
    this.state.currentTool = [...this.pending.values()].at(-1) ?? null;
    this.state.status = this.pending.size
      ? [...this.pending.values()].some((t) =>
          /(?:request_user_input(?:_async)?|AskUserQuestion)$/u.test(t.name),
        )
        ? "Waiting"
        : "Executing"
      : "Thinking";
  }

  private claude(record: Json, at: number | null): void {
    const message = object(record.message);
    this.state.sessionId = text(record.sessionId) ?? this.state.sessionId;
    this.state.cwd = text(record.cwd, 4096) ?? this.state.cwd;
    this.state.startedAt ??= at;
    if (record.type === "user") {
      const blocks = Array.isArray(message.content) ? message.content.map(object) : [];
      const results = blocks.filter((b) => b.type === "tool_result");
      if (results.length) {
        for (const result of results) this.finishTool(String(result.tool_use_id), at);
        if (results.some((b) => b.is_error === true)) this.state.status = "Error";
      } else if (typeof message.content === "string" || blocks.some((b) => b.type === "text")) {
        this.state.turnCount = (this.state.turnCount ?? 0) + 1;
        this.pending.clear();
        this.state.currentTool = null;
        this.state.status = "Thinking";
      }
    }
    if (record.type !== "assistant") return;
    this.state.model = text(message.model) ?? this.state.model;
    const usage = object(message.usage);
    if (Object.keys(usage).length) {
      const tokens: [number, number, number] = [
        count(usage.input_tokens),
        count(usage.output_tokens),
        count(usage.cache_read_input_tokens) + count(usage.cache_creation_input_tokens),
      ];
      const id = text(message.id) ?? `record-${++this.sequence}`;
      const previous = this.usage.get(id) ?? [0, 0, 0];
      this.state.inputTokens += tokens[0] - previous[0]!;
      this.state.outputTokens += tokens[1] - previous[1]!;
      this.state.cacheTokens += tokens[2] - previous[2]!;
      this.usage.set(id, tokens);
      while (this.usage.size > 4096) this.usage.delete(this.usage.keys().next().value!);
      this.state.contextTokens = tokens[0] + count(usage.cache_read_input_tokens);
      // Claude logs do not reliably carry the capacity; clearly mark known-model defaults as estimates.
      this.state.contextWindow = /claude-(?:opus|sonnet|haiku)/u.test(this.state.model ?? "")
        ? /\[1m\]/u.test(this.state.model ?? "")
          ? 1_000_000
          : 200_000
        : null;
      this.state.contextEstimated = this.state.contextWindow !== null;
    }
    for (const block of Array.isArray(message.content) ? message.content.map(object) : []) {
      if (block.type === "tool_use") this.startTool(String(block.id), block.name, block.input, at);
    }
    if (message.stop_reason === "end_turn") {
      this.pending.clear();
      this.state.currentTool = null;
      this.state.status = "Waiting";
    } else if (this.pending.size === 0) this.state.status = "Waiting";
    if (record.isApiErrorMessage === true || record.error !== undefined)
      this.state.status =
        record.error === "rate_limit" || object(record.error).type === "rate_limit_error"
          ? "RateLimited"
          : "Error";
  }

  private codex(record: Json, at: number | null): void {
    const payload = object(record.payload);
    if (record.type === "session_meta") {
      this.state.sessionId = text(payload.id);
      this.state.cwd = text(payload.cwd, 4096) ?? this.state.cwd;
      this.state.startedAt = time(payload.timestamp) ?? at;
    }
    if (record.type === "turn_context") {
      this.state.model = text(payload.model) ?? this.state.model;
      this.state.cwd = text(payload.cwd, 4096) ?? this.state.cwd;
    }
    if (record.type === "event_msg") {
      switch (payload.type) {
        case "task_started":
        case "user_message":
          if (payload.type === "user_message")
            this.state.turnCount = (this.state.turnCount ?? 0) + 1;
          this.pending.clear();
          this.state.currentTool = null;
          this.state.status = "Thinking";
          if (count(payload.model_context_window))
            this.state.contextWindow = count(payload.model_context_window);
          break;
        case "task_complete":
        case "turn_aborted":
          this.pending.clear();
          this.state.currentTool = null;
          this.state.status = "Waiting";
          break;
        case "token_count": {
          const info = object(payload.info);
          const total = object(info.total_token_usage);
          if (Object.keys(total).length) {
            this.state.cacheTokens = count(
              total.cached_input_tokens ?? total.cache_read_input_tokens,
            );
            this.state.inputTokens = Math.max(
              0,
              count(total.input_tokens) - this.state.cacheTokens,
            );
            this.state.outputTokens = count(total.output_tokens);
          }
          const last = object(info.last_token_usage);
          if (Object.keys(last).length) this.state.contextTokens = count(last.input_tokens);
          if (count(info.model_context_window))
            this.state.contextWindow = count(info.model_context_window);
          break;
        }
        case "item_completed": {
          const item = object(payload.item);
          if (item.type === "UserMessage") {
            this.state.turnCount = (this.state.turnCount ?? 0) + 1;
            this.pending.clear();
            this.state.currentTool = null;
            this.state.status = "Thinking";
          } else if (item.type === "AgentMessage" && item.phase === "final_answer") {
            this.pending.clear();
            this.state.currentTool = null;
            this.state.status = "Waiting";
          } else if (
            item.type === "CommandExecution" ||
            item.type === "Extension" ||
            item.type === "FileChange"
          ) {
            const id = text(item.id) ?? `item-${++this.sequence}`;
            const start = count(item.started_at_ms ?? payload.started_at_ms) || at;
            this.startTool(id, item.type === "Extension" ? item.name : item.type, {}, start);
            this.finishTool(id, count(item.completed_at_ms ?? payload.completed_at_ms) || at);
            if (typeof item.exit_code === "number" && item.exit_code !== 0)
              this.state.status = "Error";
          }
          break;
        }
        case "error":
          this.state.status = payload.code === "rate_limit_exceeded" ? "RateLimited" : "Error";
          break;
      }
    }
    if (record.type !== "response_item") return;
    if (payload.type === "function_call" || payload.type === "custom_tool_call") {
      let args: unknown = payload.arguments;
      if (typeof args === "string") {
        try {
          args = JSON.parse(args);
        } catch {
          args = {};
        }
      }
      this.startTool(String(payload.call_id), payload.name, args, at);
    } else if (
      payload.type === "function_call_output" ||
      payload.type === "custom_tool_call_output"
    ) {
      this.finishTool(String(payload.call_id), at);
    } else if (
      payload.type === "message" &&
      payload.role === "assistant" &&
      payload.phase === "final_answer"
    ) {
      this.pending.clear();
      this.state.currentTool = null;
      this.state.status = "Waiting";
    }
  }
}
