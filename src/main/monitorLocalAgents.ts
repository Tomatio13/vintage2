import { monitorPathsEqual } from "./monitorCodexDiscovery.js";
import { readGrok } from "./monitorGrok.js";
import { DatabaseSync } from "node:sqlite";
import { open, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { MonitorAgent, MonitorStatus, MonitorTool } from "../shared/monitor.js";
import { MonitorTranscript } from "./monitorTranscript.js";

type State = MonitorTranscript["state"];
type Row = Record<string, unknown>;
export type LocalAgent = Exclude<MonitorAgent, "claude" | "codex">;
export interface LocalAgentResult {
  state: State | null;
  diagnostic: string | null;
  verified: boolean;
}
const object = (value: unknown): Row =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Row) : {};
const clean = (value: unknown, max = 240): string | null =>
  typeof value === "string" && value.length ? value.slice(0, max).replace(/\p{Cc}/gu, " ") : null;
const number = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
const json = (value: unknown): unknown => {
  try {
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return null;
  }
};
const missing = (diagnostic: string): LocalAgentResult => ({
  state: null,
  diagnostic,
  verified: false,
});

// Only readonly databases and explicitly selected metadata are read. No provider
// credentials, message bodies, tool inputs/results or HTTP endpoints are accessed.
function database(path: string): DatabaseSync {
  const db = new DatabaseSync(path, { readOnly: true, allowExtension: false });
  db.exec("PRAGMA busy_timeout=100; PRAGMA query_only=ON;");
  return db;
}
export function localDatabaseState(
  agent: "opencode" | "zcode",
  row: Row,
  message: Row | undefined,
  tool: Row | undefined,
  usage: Row,
): State {
  const state = new MonitorTranscript(agent).state;
  state.sessionId = clean(row.id);
  state.cwd = clean(row.directory, 4096) ?? "";
  state.startedAt = number(row.time_created) || null;
  state.lastActivityAt = number(row.time_updated) || null;
  if (!message) return { ...state, status: "Waiting", tokenTotalsAvailable: false };
  state.model = clean(message.model);
  state.turnCount = number(usage.turns);
  const cache = number(usage.cache);
  state.cacheTokens = cache;
  state.inputTokens =
    agent === "zcode" ? Math.max(0, number(usage.input) - cache) : number(usage.input);
  state.outputTokens = number(usage.output);
  state.tokenTotalsAvailable =
    number(usage.input) > 0 || number(usage.output) > 0 || typeof message.input === "number";
  if (message.role === "assistant" && typeof message.input === "number") {
    const input = number(message.input);
    state.contextTokens = agent === "zcode" ? input : input + number(message.cache);
  }
  // Completion applies to the latest message only: stale running tools from an
  // earlier cancelled turn must never make an idle session look Executing.
  if (message.error) state.status = "Error";
  else if (message.completed && message.finish !== "tool-calls") state.status = "Waiting";
  else if (tool?.status === "pending" || tool?.status === "running") {
    const current: MonitorTool = {
      id: clean(tool.id) ?? "tool",
      name: clean(tool.name) ?? "Tool",
      path: null,
      startedAt: number(tool.time_created) || null,
      durationMs: null,
    };
    state.status = "Executing";
    state.currentTool = current;
  } else if (tool?.status === "error") state.status = "Error";
  else state.status = "Thinking";
  return state;
}

function readSessionDatabase(
  path: string,
  agent: "opencode" | "zcode",
  cwd: string,
  peers: number,
): LocalAgentResult {
  if (!cwd || (peers !== 1 && agent !== "zcode"))
    return missing(
      "Session association is ambiguous: multiple agent processes share this working directory.",
    );
  let db: DatabaseSync | undefined;
  try {
    db = database(path);
    // Desktop ZCode can retain several workers in the same directory. Only
    // infer their session when exactly one session has activity within an hour.
    const sharedWorkers = agent === "zcode" && peers > 1;
    const rows = db
      .prepare(
        `SELECT id,directory,time_created,time_updated FROM session WHERE ${process.platform === "win32" ? "1=1" : "directory=?"} AND (parent_id IS NULL OR parent_id='') ${sharedWorkers ? "AND time_updated>?" : ""} ORDER BY time_updated DESC LIMIT ${process.platform === "win32" ? 4096 : 2}`,
      )
      .all(
        ...(process.platform === "win32" ? [] : [cwd]),
        ...(sharedWorkers ? [Date.now() - 60 * 60 * 1000] : []),
      ) as Row[];
    const matchingRows = rows
      .filter((row) => typeof row.directory === "string" && monitorPathsEqual(row.directory, cwd))
      .slice(0, 2);
    const row = matchingRows[0];
    if (!row) return missing("No local session matches this working directory.");
    if (
      matchingRows[1] &&
      (sharedWorkers || number(row.time_updated) - number(matchingRows[1].time_updated) < 5000)
    )
      return missing(
        "Multiple recently updated sessions share this working directory; ownership is uncertain.",
      );
    const message = db
      .prepare(`SELECT id, json_extract(data,'$.role') role,
      COALESCE(json_extract(data,'$.modelID'),json_extract(data,'$.modelId'),json_extract(data,'$.model.modelID')) model,
      json_extract(data,'$.time.completed') completed, json_extract(data,'$.finish') finish,
      CASE WHEN json_type(data,'$.error') IN ('object','text') THEN 1 ELSE 0 END error, json_extract(data,'$.tokens.input') input,
      COALESCE(json_extract(data,'$.tokens.cache.read'),0)+COALESCE(json_extract(data,'$.tokens.cache.write'),0) cache
      FROM message WHERE session_id=? ORDER BY time_created DESC,id DESC LIMIT 1`)
      .get(row.id as string) as Row | undefined;
    const tool = message
      ? (db
          .prepare(
            `SELECT id,time_created,json_extract(data,'$.tool') name,json_extract(data,'$.state.status') status FROM part WHERE message_id=? AND json_extract(data,'$.type')='tool' ORDER BY time_created DESC,id DESC LIMIT 1`,
          )
          .get(message.id as string) as Row | undefined)
      : undefined;
    const usage = db
      .prepare(`SELECT COALESCE(SUM(CASE WHEN json_extract(data,'$.role')='assistant' THEN COALESCE(json_extract(data,'$.tokens.input'),0) ELSE 0 END),0) input,
      COALESCE(SUM(CASE WHEN json_extract(data,'$.role')='assistant' THEN COALESCE(json_extract(data,'$.tokens.output'),0) ELSE 0 END),0) output,
      COALESCE(SUM(CASE WHEN json_extract(data,'$.role')='assistant' THEN COALESCE(json_extract(data,'$.tokens.cache.read'),0)+COALESCE(json_extract(data,'$.tokens.cache.write'),0) ELSE 0 END),0) cache,
      SUM(CASE WHEN json_extract(data,'$.role')='user' THEN 1 ELSE 0 END) turns FROM message WHERE session_id=?`)
      .get(row.id as string) as Row;
    const state = localDatabaseState(agent, row, message, tool, usage);
    const context = db
      .prepare(`SELECT json_extract(data,'$.tokens.input') input,
      COALESCE(json_extract(data,'$.tokens.cache.read'),0)+COALESCE(json_extract(data,'$.tokens.cache.write'),0) cache
      FROM message WHERE session_id=? AND json_extract(data,'$.role')='assistant'
      AND json_extract(data,'$.tokens.input')>0 ORDER BY time_created DESC,id DESC LIMIT 1`)
      .get(row.id as string) as Row | undefined;
    if (context)
      state.contextTokens =
        number(context.input) + (agent === "opencode" ? number(context.cache) : 0);
    if (agent === "zcode") {
      let tasks: DatabaseSync | undefined;
      try {
        tasks = database(join(dirname(dirname(dirname(path))), "v2", "tasks-index.sqlite"));
        const task = tasks
          .prepare(
            "SELECT task_status FROM tasks WHERE task_id=? AND workspace_path=? AND deleted=0 AND archived=0 LIMIT 1",
          )
          .get(row.id as string, cwd) as Row | undefined;
        if (
          task &&
          ["completed", "idle", "paused", "cancelled"].includes(
            String(task.task_status).toLowerCase(),
          )
        ) {
          state.status = "Waiting";
          state.currentTool = null;
        } else if (task && ["failed", "error"].includes(String(task.task_status).toLowerCase())) {
          state.status = "Error";
          state.currentTool = null;
        }
      } catch {
        /* CLI-only installations may not have the desktop task index. */
      } finally {
        tasks?.close();
      }
    }
    return {
      state,
      diagnostic: "Latest local session matched by working directory; association is inferred.",
      verified: false,
    };
  } catch {
    return missing("Local session database could not be read or its schema is unsupported.");
  } finally {
    db?.close();
  }
}

export function antigravityStatus(value: unknown, busy: unknown): MonitorStatus {
  const status = clean(value) ?? "";
  if (/ERROR|FAILED/u.test(status)) return "Error";
  if (/WAIT|BLOCKED/u.test(status)) return "Waiting";
  if (/RUNNING/u.test(status) || busy === 1 || busy === true) return "Thinking";
  if (/IDLE|STOPPED|COMPLETED|CANCELLED/u.test(status)) return "Waiting";
  return "Unknown";
}

// Antigravity rewrites its transcript as steps complete. Re-read a bounded tail
// instead of assuming an append-only file or that size changes imply updates.
async function transcriptTail(path: string): Promise<{ rows: Row[]; complete: boolean }> {
  const file = await open(path, "r");
  try {
    const size = (await file.stat()).size;
    const start = Math.max(0, size - 1024 * 1024);
    const buffer = Buffer.alloc(Math.min(size, 1024 * 1024));
    const { bytesRead } = await file.read(buffer, 0, buffer.length, start);
    let lines = buffer.subarray(0, bytesRead).toString("utf8").split("\n");
    if (start) lines = lines.slice(1);
    return {
      complete: start === 0,
      rows: lines.filter(Boolean).flatMap((line) => {
        const row = object(json(line));
        return Object.keys(row).length ? [row] : [];
      }),
    };
  } finally {
    await file.close();
  }
}
export function antigravityTranscriptState(rows: Row[], state: State): State {
  let lastTool: MonitorTool | null = null;
  state.turnCount = rows.filter((row) => row.type === "USER_INPUT").length;
  for (const row of rows) {
    const at = typeof row.created_at === "string" ? Date.parse(row.created_at) : NaN;
    if (Number.isFinite(at)) {
      state.startedAt ??= at;
      state.lastActivityAt = at;
    }
    if (row.type === "PLANNER_RESPONSE") {
      const cache = number(row.cache_read_tokens);
      state.inputTokens += number(row.input_tokens);
      state.outputTokens += number(row.output_tokens);
      state.cacheTokens += cache;
      if (typeof row.input_tokens === "number")
        state.contextTokens = number(row.input_tokens) + cache;
    }
    const calls = Array.isArray(row.tool_calls) ? row.tool_calls : [];
    if (row.status === "RUNNING") {
      const call = object(calls.at(-1));
      const args = object(call.args);
      const name = clean(call.name) ?? (row.type !== "PLANNER_RESPONSE" ? clean(row.type) : null);
      lastTool = name
        ? {
            id: String(row.step_index ?? "step"),
            name,
            path: clean(args.AbsolutePath ?? args.TargetFile ?? args.file_path),
            startedAt: Number.isFinite(at) ? at : null,
            durationMs: null,
          }
        : null;
    } else lastTool = null;
  }
  if (state.status === "Thinking" && lastTool) {
    state.currentTool = lastTool;
    state.status = "Executing";
  }
  return state;
}

async function readAntigravity(
  root: string,
  cwd: string,
  peers: number,
  files: string[],
): Promise<LocalAgentResult> {
  let db: DatabaseSync | undefined;
  try {
    db = database(join(root, "conversation_summaries.db"));
    const rows = db
      .prepare(
        "SELECT conversation_id,workspace_uris,status,not_fully_idle,last_modified_time FROM conversation_summaries WHERE parent_conversation_id='' AND killed=0 ORDER BY last_modified_time DESC LIMIT 256",
      )
      .all() as Row[];
    const owned = rows.filter((row) =>
      files.some(
        (path) =>
          path.endsWith(`/conversations/${row.conversation_id}.db`) ||
          path.includes(`/brain/${row.conversation_id}/`),
      ),
    );
    const matches = owned.length
      ? owned
      : rows.filter((row) => {
          const uris = json(row.workspace_uris);
          return (
            Array.isArray(uris) &&
            uris.some((uri) => {
              try {
                return typeof uri === "string" && fileURLToPath(uri) === cwd;
              } catch {
                return false;
              }
            })
          );
        });
    if (matches.length === 0 || (owned.length === 0 && peers !== 1) || owned.length > 1)
      return missing("No uniquely matched Antigravity conversation.");
    const row = matches[0]!;
    const id = clean(row.conversation_id);
    if (!id || !/^[a-zA-Z0-9_-]+$/u.test(id))
      return missing("Invalid local conversation metadata.");
    if (
      !owned.length &&
      matches[1] &&
      Math.abs(
        Date.parse(String(row.last_modified_time)) -
          Date.parse(String(matches[1].last_modified_time)),
      ) < 5000
    )
      return missing(
        "Multiple recently updated Antigravity conversations; ownership is uncertain.",
      );
    const state = new MonitorTranscript("antigravity").state;
    const workspaces = json(row.workspace_uris);
    const workspace = Array.isArray(workspaces) && workspaces.length === 1 ? workspaces[0] : null;
    try {
      state.cwd = typeof workspace === "string" ? fileURLToPath(workspace) : cwd;
    } catch {
      state.cwd = cwd;
    }
    state.sessionId = id;
    state.status = antigravityStatus(row.status, row.not_fully_idle);
    const transcript = await transcriptTail(
      join(root, "brain", id, ".system_generated", "logs", "transcript.jsonl"),
    ).catch(() => ({ rows: [], complete: false }));
    antigravityTranscriptState(transcript.rows, state);
    state.tokenTotalsAvailable =
      transcript.complete && transcript.rows.some((row) => typeof row.input_tokens === "number");
    if (!transcript.complete) {
      delete state.turnCount;
      state.startedAt = null;
    }
    if (!state.tokenTotalsAvailable) {
      state.inputTokens = 0;
      state.outputTokens = 0;
      state.cacheTokens = 0;
    }
    return {
      state,
      diagnostic: owned.length
        ? null
        : "Latest local conversation matched by working directory; association is inferred.",
      verified: owned.length === 1,
    };
  } catch {
    return missing(
      "Antigravity conversation database is unavailable or has an unsupported schema.",
    );
  } finally {
    db?.close();
  }
}

export async function readLocalAgent(
  agent: LocalAgent,
  cwd: string,
  peers: number,
  files: string[],
  home: string,
  dataHome?: string,
): Promise<LocalAgentResult> {
  if (agent === "grok") return readGrok(cwd, peers, files, home);
  if (agent === "antigravity") {
    const roots = [
      ...new Set([
        ...files.flatMap((path) => {
          if (basename(path) === "conversation_summaries.db") return [dirname(path)];
          const index = path.indexOf("/conversations/");
          return index >= 0 ? [path.slice(0, index)] : [];
        }),
        ...["antigravity-cli", "antigravity", "antigravity-ide"].map((kind) =>
          join(home, ".gemini", kind),
        ),
      ]),
    ];
    // Prefer the owning process's open files over other Antigravity installations.
    roots.sort(
      (a, b) =>
        Number(files.some((path) => path.startsWith(b + "/"))) -
        Number(files.some((path) => path.startsWith(a + "/"))),
    );
    let result = missing("No Antigravity conversation database found.");
    for (const root of roots)
      if (await stat(join(root, "conversation_summaries.db")).catch(() => null)) {
        result = await readAntigravity(root, cwd, peers, files);
        if (result.state) return result;
      }
    return result;
  }
  let path =
    files.find((path) =>
      agent === "opencode" ? basename(path) === "opencode.db" : path.endsWith("/cli/db/db.sqlite"),
    ) ??
    (agent === "opencode"
      ? join(dataHome || join(home, ".local", "share"), "opencode", "opencode.db")
      : join(home, ".zcode", "cli", "db", "db.sqlite"));
  if (
    agent === "opencode" &&
    process.platform === "win32" &&
    !(await stat(path).catch(() => null))
  ) {
    for (const root of [process.env.LOCALAPPDATA, process.env.APPDATA]) {
      if (!root) continue;
      const candidate = join(root, "opencode", "opencode.db");
      if (await stat(candidate).catch(() => null)) {
        path = candidate;
        break;
      }
    }
  }
  return readSessionDatabase(path, agent, cwd, peers);
}
