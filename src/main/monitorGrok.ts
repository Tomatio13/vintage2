import { open, readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { MonitorTranscript } from "./monitorTranscript.js";
import type { LocalAgentResult } from "./monitorLocalAgents.js";

type Json = Record<string, unknown>;
const object = (value: unknown): Json =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
const text = (value: unknown): string | null =>
  typeof value === "string" && value ? value.slice(0, 240).replace(/\p{Cc}/gu, " ") : null;
const time = (value: unknown): number | null => {
  const parsed = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};
async function readBounded(path: string, limit: number, tail = false): Promise<string> {
  const file = await open(path, "r");
  try {
    const info = await file.stat();
    if (!info.isFile()) throw new Error("Not a regular file");
    if (!tail && info.size > limit) throw new Error("Metadata too large");
    const offset = tail ? Math.max(0, info.size - limit) : 0;
    const buffer = Buffer.alloc(Math.min(info.size, limit));
    const { bytesRead } = await file.read(buffer, 0, buffer.length, offset);
    const value = buffer.subarray(0, bytesRead).toString("utf8");
    return offset ? value.slice(value.indexOf("\n") + 1) : value;
  } finally {
    await file.close();
  }
}

type State = MonitorTranscript["state"];

// Keep parsing state across refreshes. Fingerprints verify the existing prefix
// before accepting append-only growth; truncation and rewrites rebuild state.
export class GrokUpdateReader {
  private state = new MonitorTranscript("grok").state;
  private pending = new Map<string, NonNullable<State["currentTool"]>>();
  private uncertain = false;
  private reportedModel: string | null = null;
  private partial = Buffer.alloc(0);
  private skipping = false;
  private offset = 0;
  private identity = "";
  private modified = 0n;
  private fingerprint = "";
  private inFlight: Promise<State> | null = null;
  bytesProcessed = 0;

  read(path: string, seed: State): Promise<State> {
    if (this.inFlight) return this.inFlight.then((state) => structuredClone(state));
    this.inFlight = this.consume(path, seed).finally(() => {
      this.inFlight = null;
    });
    return this.inFlight.then((state) => structuredClone(state));
  }

  private async consume(path: string, seed: State): Promise<State> {
    const file = await open(path, "r");
    try {
      const info = await file.stat({ bigint: true });
      if (!info.isFile()) throw new Error("Not a regular file");
      const size = Number(info.size);
      const identity = `${info.dev}:${info.ino}:${seed.sessionId}`;
      const signature = async (end: number) => {
        const first = Buffer.alloc(Math.min(end, 256));
        const last = Buffer.alloc(Math.min(end, 256));
        await file.read(first, 0, first.length, 0);
        await file.read(last, 0, last.length, Math.max(0, end - last.length));
        return first.toString("base64") + ":" + last.toString("base64");
      };
      const changed =
        identity !== this.identity ||
        size < this.offset ||
        (size === this.offset && info.mtimeNs !== this.modified) ||
        (this.offset > 0 && (await signature(this.offset)) !== this.fingerprint);
      if (changed) {
        this.state = structuredClone(seed);
        this.pending.clear();
        this.reportedModel = null;
        this.uncertain = false;
        this.partial = Buffer.alloc(0);
        this.skipping = false;
        this.offset = 0;
        this.identity = identity;
      }
      this.state.cwd = seed.cwd;
      this.state.model = this.reportedModel ?? seed.model;
      this.state.lastActivityAt =
        Math.max(seed.lastActivityAt ?? 0, this.state.lastActivityAt ?? 0) || null;
      while (this.offset < size) {
        const bytes = Buffer.alloc(Math.min(256 * 1024, size - this.offset));
        const { bytesRead } = await file.read(bytes, 0, bytes.length, this.offset);
        if (!bytesRead) throw new Error("Transcript changed while reading");
        this.offset += bytesRead;
        this.bytesProcessed += bytesRead;
        this.feed(bytes.subarray(0, bytesRead));
      }
      this.modified = info.mtimeNs;
      this.fingerprint = await signature(this.offset);
      const result = structuredClone(this.state);
      if (this.uncertain) {
        result.status = "Unknown";
        result.currentTool = null;
      }
      return result;
    } finally {
      await file.close();
    }
  }

  private feed(chunk: Buffer): void {
    const bytes = Buffer.concat([this.partial, chunk]);
    let start = 0;
    const limit = 2 * 1024 * 1024;
    for (;;) {
      const end = bytes.indexOf(10, start);
      if (end < 0) break;
      if (this.skipping || end - start > limit) this.uncertain = true;
      else {
        try {
          this.accept(object(JSON.parse(bytes.subarray(start, end).toString("utf8"))));
        } catch {
          this.uncertain = true;
        }
      }
      this.skipping = false;
      start = end + 1;
    }
    this.partial = bytes.subarray(start);
    if (this.partial.length > limit || this.skipping) {
      this.partial = Buffer.alloc(0);
      this.skipping = true;
    }
  }

  private accept(record: Json): void {
    const params = object(record.params);
    if (params.sessionId && params.sessionId !== this.state.sessionId) return;
    const update = object(params.update);
    const kind = update.sessionUpdate;
    const timestamp =
      typeof object(params._meta).agentTimestampMs === "number"
        ? (object(params._meta).agentTimestampMs as number)
        : typeof record.timestamp === "number"
          ? record.timestamp * 1000
          : null;
    if (
      [
        "user_message_chunk",
        "agent_thought_chunk",
        "agent_message_chunk",
        "tool_call",
        "tool_call_update",
        "turn_completed",
      ].includes(String(kind)) &&
      timestamp
    )
      this.state.lastActivityAt = Math.max(this.state.lastActivityAt ?? 0, timestamp);
    if (kind === "user_message_chunk" && this.uncertain) {
      this.uncertain = false;
      this.pending.clear();
    }
    if (
      kind === "user_message_chunk" ||
      kind === "agent_thought_chunk" ||
      kind === "agent_message_chunk"
    ) {
      this.state.status = this.pending.size ? "Executing" : "Thinking";
      this.reportedModel = text(object(update._meta).modelId) ?? this.reportedModel;
      this.state.model = this.reportedModel ?? this.state.model;
    } else if (kind === "tool_call" || kind === "tool_call_update") {
      const id = text(update.toolCallId);
      if (!id) return;
      if (update.status === "completed" || update.status === "failed") {
        this.pending.delete(id);
        this.state.status =
          update.status === "failed" ? "Error" : this.pending.size ? "Executing" : "Thinking";
      } else {
        const metadata = object(object(update._meta)["x.ai/tool"]);
        const existing = this.pending.get(id);
        const name = text(metadata.name) ?? existing?.name;
        if (name)
          this.pending.set(id, {
            id,
            name,
            path: null,
            startedAt: existing?.startedAt ?? timestamp,
            durationMs: null,
          });
        if (this.pending.size) this.state.status = "Executing";
      }
    } else if (kind === "turn_completed") {
      this.uncertain = false;
      this.pending.clear();
      this.state.status = ["error", "failed"].includes(String(update.stop_reason))
        ? "Error"
        : "Waiting";
    }
    this.state.currentTool = [...this.pending.values()].at(-1) ?? null;
  }
}
const readers = new Map<string, GrokUpdateReader>();

export async function readGrok(
  cwd: string,
  peers: number,
  files: string[],
  home: string,
): Promise<LocalAgentResult> {
  const missing = (diagnostic: string): LocalAgentResult => ({
    state: null,
    verified: false,
    diagnostic,
  });
  const owned = [
    ...new Set(
      files
        .filter(
          (path) =>
            path.includes("/sessions/") &&
            ["summary.json", "updates.jsonl", "events.jsonl", "chat_history.jsonl"].includes(
              basename(path),
            ),
        )
        .map(dirname),
    ),
  ];
  if (owned.length > 1 || (!owned.length && (!cwd || peers !== 1)))
    return missing("Grok session ownership is ambiguous.");
  const root = join(home, ".grok", "sessions", encodeURIComponent(cwd));
  const dirs = owned.length
    ? owned
    : (await readdir(root).catch(() => [])).slice(0, 256).map((name) => join(root, name));
  const candidates = (
    await Promise.all(
      dirs.map(async (directory) => {
        try {
          const summary = object(
            JSON.parse(await readBounded(join(directory, "summary.json"), 256 * 1024)),
          );
          if (object(summary.info).cwd !== cwd) return null;
          return {
            directory,
            summary,
            at: time(summary.last_active_at) ?? time(summary.updated_at) ?? 0,
          };
        } catch {
          return null;
        }
      }),
    )
  )
    .filter((entry) => entry !== null)
    .sort((a, b) => b.at - a.at);
  const candidate = candidates[0];
  if (!candidate) return missing("No local Grok session matches this working directory.");
  if (!owned.length && candidates[1] && candidate.at - candidates[1].at < 5000)
    return missing("Multiple recent Grok sessions share this working directory.");
  const state = new MonitorTranscript("grok").state;
  state.cwd = cwd;
  state.sessionId = text(object(candidate.summary.info).id) ?? basename(candidate.directory);
  state.model = text(candidate.summary.current_model_id);
  state.startedAt = time(candidate.summary.created_at);
  state.lastActivityAt = candidate.at || null;
  state.status = "Waiting";
  // Turn usage is aggregated across model calls, not the current context size.
  state.tokenTotalsAvailable = false;
  try {
    const path = join(candidate.directory, "updates.jsonl");
    let reader = readers.get(path);
    if (!reader) reader = new GrokUpdateReader();
    readers.delete(path);
    readers.set(path, reader);
    while (readers.size > 32) readers.delete(readers.keys().next().value!);
    const parsed = await reader.read(path, state);
    return {
      state: parsed,
      verified: !!owned.length,
      diagnostic:
        parsed.status === "Unknown"
          ? "Some Grok events could not be decoded; current activity is uncertain."
          : owned.length
            ? null
            : "Latest Grok session matched by working directory; association is inferred.",
    };
  } catch {
    readers.delete(join(candidate.directory, "updates.jsonl"));
    state.status = "Unknown";
    return { state, verified: !!owned.length, diagnostic: "Grok update log could not be read." };
  }
}
