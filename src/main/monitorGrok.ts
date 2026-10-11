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
  const pending = new Map<string, NonNullable<typeof state.currentTool>>();
  try {
    const lines = await readBounded(join(candidate.directory, "updates.jsonl"), 1024 * 1024, true);
    for (const line of lines.split("\n")) {
      let record: Json;
      try {
        record = object(JSON.parse(line));
      } catch {
        continue;
      }
      const params = object(record.params);
      if (params.sessionId && params.sessionId !== state.sessionId) continue;
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
        state.lastActivityAt = Math.max(state.lastActivityAt ?? 0, timestamp);
      if (
        kind === "user_message_chunk" ||
        kind === "agent_thought_chunk" ||
        kind === "agent_message_chunk"
      ) {
        state.status = pending.size ? "Executing" : "Thinking";
        state.model = text(object(update._meta).modelId) ?? state.model;
      } else if (kind === "tool_call" || kind === "tool_call_update") {
        const id = text(update.toolCallId);
        if (!id) continue;
        if (update.status === "completed" || update.status === "failed") {
          pending.delete(id);
          state.status =
            update.status === "failed" ? "Error" : pending.size ? "Executing" : "Thinking";
        } else {
          const metadata = object(object(update._meta)["x.ai/tool"]);
          const existing = pending.get(id);
          const name = text(metadata.name) ?? existing?.name;
          if (name)
            pending.set(id, {
              id,
              name,
              path: null,
              startedAt: existing?.startedAt ?? timestamp,
              durationMs: null,
            });
          if (pending.size) state.status = "Executing";
        }
      } else if (kind === "turn_completed") {
        pending.clear();
        state.status = ["error", "failed"].includes(String(update.stop_reason))
          ? "Error"
          : "Waiting";
      }
      state.currentTool = [...pending.values()].at(-1) ?? null;
    }
  } catch {
    state.status = "Unknown";
    return { state, verified: !!owned.length, diagnostic: "Grok update log could not be read." };
  }
  return {
    state,
    verified: !!owned.length,
    diagnostic: owned.length
      ? null
      : "Latest Grok session matched by working directory; association is inferred.",
  };
}
