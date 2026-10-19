import { sessionPathsEqual } from "../shared/sessionHistory.js";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { open, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve, win32 } from "node:path";
import type {
  HistoryAgent,
  HistoryMessage,
  HistorySession,
  SessionHistoryDetail,
  SessionHistoryList,
} from "../shared/sessionHistory.js";

type Row = Record<string, unknown>;
const row = (value: unknown): Row => (value && typeof value === "object" ? (value as Row) : {});
const clean = (value: unknown): string =>
  typeof value === "string"
    ? value.replace(/\p{Cc}/gu, (character) =>
        character === "\n" || character === "\t" ? character : "",
      )
    : "";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function content(value: unknown): string {
  if (typeof value === "string") return clean(value);
  if (!Array.isArray(value)) return "";
  return value
    .map((part) => {
      const item = row(part);
      return ["text", "input_text", "output_text"].includes(String(item.type))
        ? clean(item.text)
        : "";
    })
    .filter(Boolean)
    .join("\n");
}
export function parseHistoryLog(text: string, agent: HistoryAgent) {
  if (agent === "grok" || agent === "antigravity") return parseAdditionalHistory(text, agent);
  let sessionId = "",
    cwd = "",
    title = "";
  let isGuardianReview = false;
  const messages: HistoryMessage[] = [];
  const seen = new Set<string>();
  for (const line of text.split("\n")) {
    let entry: Row;
    try {
      entry = row(JSON.parse(line));
    } catch {
      continue;
    }
    const payload = row(entry.payload);
    if (agent === "codex" && entry.type === "session_meta") {
      sessionId = clean(payload.id);
      cwd = clean(payload.cwd);
      isGuardianReview ||=
        payload.thread_source === "guardian_review" ||
        row(row(payload.source).subagent).other === "guardian";
    }
    if (agent === "claude") {
      sessionId ||= clean(entry.sessionId);
      cwd ||= clean(entry.cwd);
      if (entry.type === "custom-title") title = clean(entry.customTitle);
      if (entry.isSidechain === true || entry.isMeta === true) continue;
    }
    const message = agent === "codex" ? payload : row(entry.message);
    if (agent === "codex" && (entry.type !== "response_item" || payload.type !== "message"))
      continue;
    if (agent === "claude" && !["user", "assistant"].includes(String(entry.type))) continue;
    const role = message.role;
    if (role !== "user" && role !== "assistant") continue;
    const body = content(message.content).trim();
    // Environment and skill injection records are context, rather than the user's request.
    if (
      !body ||
      (role === "user" &&
        /^(# AGENTS\.md instructions|<environment_context>|<INSTRUCTIONS>|<system-reminder>|<local-command|<command-name>)/.test(
          body,
        ))
    )
      continue;
    const identity = clean(entry.uuid) || clean(message.id);
    if (identity && seen.has(identity)) continue;
    if (identity) seen.add(identity);
    messages.push({ role, text: body.slice(0, 24000) });
  }
  const first = messages.find((message) => message.role === "user")?.text ?? "";
  return {
    sessionId,
    cwd,
    isGuardianReview,
    title: (title || first.split("\n").find((line) => line.trim()) || "Untitled session").slice(
      0,
      160,
    ),
    messages,
    preview: first.slice(0, 240),
  };
}

function parseAdditionalHistory(text: string, agent: "grok" | "antigravity") {
  const messages: HistoryMessage[] = [];
  let previousKind = "";
  const steps = new Map<number, number>();
  for (const line of text.split("\n")) {
    let entry: Row;
    try {
      entry = row(JSON.parse(line));
    } catch {
      previousKind = "";
      continue;
    }
    const update = row(row(entry.params).update);
    const kind = agent === "grok" ? clean(update.sessionUpdate) : clean(entry.type);
    const role =
      agent === "grok"
        ? kind === "user_message_chunk"
          ? "user"
          : kind === "agent_message_chunk"
            ? "assistant"
            : null
        : kind === "USER_INPUT"
          ? "user"
          : kind === "PLANNER_RESPONSE"
            ? "assistant"
            : null;
    if (!role) {
      previousKind = "";
      continue;
    }
    const raw = agent === "grok" ? update.content : entry.content;
    const body =
      typeof raw === "string" ? clean(raw) : Array.isArray(raw) ? content(raw) : content([raw]);
    if (!body) continue;
    if (agent === "grok" && previousKind === kind && messages.at(-1)?.role === role) {
      messages.at(-1)!.text = (messages.at(-1)!.text + body).slice(0, 24000);
    } else if (
      agent === "antigravity" &&
      typeof entry.step_index === "number" &&
      steps.has(entry.step_index)
    ) {
      messages[steps.get(entry.step_index)!] = { role, text: body.slice(0, 24000) };
    } else {
      if (agent === "antigravity" && typeof entry.step_index === "number")
        steps.set(entry.step_index, messages.length);
      messages.push({ role, text: body.slice(0, 24000) });
    }
    previousKind = kind;
  }
  const first = messages.find((message) => message.role === "user")?.text ?? "";
  return {
    sessionId: "",
    cwd: "",
    title: (first.split("\n")[0] || "Untitled session").slice(0, 160),
    preview: first.slice(0, 240),
    messages,
  };
}
interface HistoryRoot {
  agent: HistoryAgent;
  path: string;
  configDirExplicit?: boolean;
  resumeSupported?: boolean;
}
interface Candidate {
  agent: HistoryAgent;
  path: string;
  root: string;
  updatedAt: number;
  metadata?: {
    sessionId: string;
    cwd: string;
    title: string;
    preview: string;
    canResume?: boolean;
  };
}

interface Entry {
  path: string;
  root: string;
  session: HistorySession;
  configDirExplicit: boolean;
}
export class SessionHistory {
  private entries = new Map<string, Entry>();
  private cached: SessionHistoryList | null = null;
  private checkedAt = 0;
  private pending: Promise<SessionHistoryList> | null = null;
  constructor(
    private roots: HistoryRoot[] = [
      { agent: "codex", path: process.env.CODEX_HOME || join(homedir(), ".codex") },
      {
        agent: "claude",
        path: process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"),
        configDirExplicit: Boolean(process.env.CLAUDE_CONFIG_DIR),
      },
      { agent: "grok", path: join(homedir(), ".grok") },
      ...["antigravity-cli", "antigravity", "antigravity-ide"].map(
        (kind): HistoryRoot => ({
          agent: "antigravity",
          path: join(homedir(), ".gemini", kind),
          resumeSupported: kind === "antigravity-cli",
        }),
      ),
    ],
    private platform: NodeJS.Platform = process.platform,
  ) {}
  list(force = false): Promise<SessionHistoryList> {
    if (this.pending) return this.pending;
    if (!force && this.cached && Date.now() - this.checkedAt < 15000)
      return Promise.resolve(this.cached);
    this.pending = this.scan().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }
  async refresh(): Promise<SessionHistoryList> {
    // A manual refresh must observe activity after the request, even when an older scan is pending.
    if (this.pending) await this.pending;
    return this.list(true);
  }
  private async scan(): Promise<SessionHistoryList> {
    const candidates: Candidate[] = [];
    const warnings = new Set<string>();
    const titles = new Map<string, string>();
    let inspected = 0;
    const walk = async (
      directory: string,
      agent: HistoryAgent,
      root: string,
      depth: number,
    ): Promise<void> => {
      if (depth > 4 || inspected >= 20000) return;
      const children = await readdir(directory, { withFileTypes: true }).catch(
        (error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") warnings.add(`Some ${agent} history could not be read.`);
          return [];
        },
      );
      children.sort((a, b) => b.name.localeCompare(a.name));
      for (const child of children) {
        if (++inspected > 20000) {
          warnings.add("History scan limit reached. Some older sessions may be missing.");
          break;
        }
        const path = join(directory, child.name);
        if (child.isDirectory() && child.name !== "subagents")
          await walk(path, agent, root, depth + 1);
        else if (agent === "grok" && child.isFile() && child.name === "summary.json") {
          try {
            const summaryLog = await this.read(path, 256 * 1024);
            if (summaryLog.truncated) throw new Error("Summary too large");
            const summary = row(JSON.parse(summaryLog.text));
            const info = row(summary.info);
            const logPath = join(directory, "updates.jsonl");
            const logInfo = await stat(logPath).catch(() => null);
            const summaryInfo = await stat(path);
            candidates.push({
              agent,
              root,
              path: logPath,
              updatedAt: Math.max(logInfo?.mtimeMs ?? 0, summaryInfo.mtimeMs),
              metadata: {
                sessionId: clean(info.id),
                cwd: clean(info.cwd),
                title: clean(summary.generated_title) || clean(summary.session_summary),
                preview: "",
              },
            });
          } catch {
            warnings.add("Some Grok session summaries could not be read.");
          }
        } else if (agent !== "grok" && child.isFile() && child.name.endsWith(".jsonl")) {
          const info = await stat(path).catch(() => null);
          if (info) candidates.push({ agent, path, root, updatedAt: info.mtimeMs });
        }
      }
    };
    for (const root of this.roots) {
      const { agent, path } = root;
      if (agent === "antigravity") {
        const dbPath = join(path, "conversation_summaries.db");
        if (!(await stat(dbPath).catch(() => null))) continue;
        let db: DatabaseSync | undefined;
        try {
          db = new DatabaseSync(dbPath, { readOnly: true });
          const records = db
            .prepare(
              "SELECT conversation_id,title,preview,workspace_uris,last_modified_time FROM conversation_summaries WHERE (parent_conversation_id='' OR parent_conversation_id IS NULL) ORDER BY last_modified_time DESC LIMIT 501",
            )
            .all() as Row[];
          if (records.length > 500)
            warnings.add("Showing up to 500 Antigravity conversations per installation.");
          for (const record of records.slice(0, 500)) {
            const sessionId = clean(record.conversation_id);
            if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) continue;
            let uris: unknown;
            try {
              uris = JSON.parse(clean(record.workspace_uris));
            } catch {
              continue;
            }
            const cwd = Array.isArray(uris)
              ? uris.flatMap((uri: unknown) => {
                  try {
                    return typeof uri === "string"
                      ? [fileURLToPath(uri, { windows: this.platform === "win32" })]
                      : [];
                  } catch {
                    return [];
                  }
                })[0]
              : undefined;
            if (!cwd) continue;
            const logPath = join(
              path,
              "brain",
              sessionId,
              ".system_generated",
              "logs",
              "transcript.jsonl",
            );
            const info = await stat(logPath).catch(() => null);
            const modified = Date.parse(clean(record.last_modified_time));
            candidates.push({
              agent,
              root: path,
              path: logPath,
              updatedAt: Math.max(info?.mtimeMs ?? 0, Number.isFinite(modified) ? modified : 0),
              metadata: {
                sessionId,
                cwd,
                title: clean(record.title),
                preview: clean(record.preview),
                canResume: root.resumeSupported === true,
              },
            });
          }
        } catch {
          warnings.add("Some Antigravity history could not be read or its schema is unsupported.");
        } finally {
          db?.close();
        }
        continue;
      }
      if (agent === "codex") {
        const index = await this.read(join(path, "session_index.jsonl"), 512 * 1024).catch(
          () => null,
        );
        for (const line of index?.text.split("\n") ?? []) {
          try {
            const item = row(JSON.parse(line));
            const title = clean(item.thread_name);
            if (title) titles.set(`${path}:${clean(item.id)}`, title.slice(0, 160));
          } catch {
            /* Skip partial index records. */
          }
        }
      }
      await walk(join(path, agent === "claude" ? "projects" : "sessions"), agent, path, 0);
    }
    candidates.sort((a, b) => b.updatedAt - a.updatedAt);
    if (candidates.length > 500) warnings.add("Showing the 500 most recently updated log files.");
    const entries = new Map<string, Entry>();
    for (const candidate of candidates.slice(0, 500)) {
      try {
        const log = await this.read(candidate.path, 128 * 1024).catch(
          (error: NodeJS.ErrnoException) => {
            if (candidate.metadata && error.code === "ENOENT")
              return { text: "", truncated: false };
            throw error;
          },
        );
        const parsed = parseHistoryLog(log.text, candidate.agent);
        if (candidate.agent === "codex" && "isGuardianReview" in parsed && parsed.isGuardianReview)
          continue;
        if (candidate.metadata) {
          parsed.sessionId = candidate.metadata.sessionId;
          parsed.cwd = candidate.metadata.cwd;
          parsed.title = candidate.metadata.title.slice(0, 160) || parsed.title;
          parsed.preview = parsed.preview || candidate.metadata.preview.slice(0, 240);
        }
        if (
          !parsed.sessionId ||
          !(this.platform === "win32" ? win32.isAbsolute(parsed.cwd) : isAbsolute(parsed.cwd))
        )
          continue;
        const key = createHash("sha256").update(candidate.path).digest("hex");
        const session: HistorySession = {
          key,
          agent: candidate.agent,
          sessionId: parsed.sessionId,
          cwd: parsed.cwd,
          title: titles.get(`${candidate.root}:${parsed.sessionId}`) || parsed.title,
          preview: parsed.preview,
          updatedAt: candidate.updatedAt,
          canResume:
            uuid.test(parsed.sessionId) &&
            (candidate.agent !== "antigravity" || candidate.metadata?.canResume === true),
        };
        entries.set(key, {
          path: candidate.path,
          root: candidate.root,
          session,
          configDirExplicit:
            this.roots.find(
              (root) => root.agent === candidate.agent && root.path === candidate.root,
            )?.configDirExplicit ?? true,
        });
      } catch {
        warnings.add("Some session logs could not be read.");
      }
    }
    this.entries = entries;
    this.cached = {
      sessions: [...entries.values()].map((entry) => entry.session),
      warnings: [...warnings],
    };
    this.checkedAt = Date.now();
    return this.cached;
  }
  private async read(path: string, limit: number) {
    const file = await open(path, "r");
    try {
      const info = await file.stat();
      if (!info.isFile()) throw new Error("Not a session log");
      const length = Math.min(info.size, limit);
      const head = Buffer.alloc(length);
      const first = await file.read(head, 0, length, 0);
      if (info.size <= limit)
        return { text: head.subarray(0, first.bytesRead).toString("utf8"), truncated: false };
      const offset = Math.max(length, info.size - length);
      const tail = Buffer.alloc(info.size - offset);
      const last = await file.read(tail, 0, tail.length, offset);
      const prefix = head.subarray(0, first.bytesRead).toString("utf8");
      const suffix = tail.subarray(0, last.bytesRead).toString("utf8");
      return {
        text:
          prefix.slice(0, prefix.lastIndexOf("\n")) +
          '\n{"type":"history_gap"}\n' +
          suffix.slice(suffix.indexOf("\n") + 1),
        truncated: true,
      };
    } finally {
      await file.close();
    }
  }
  async detail(key: unknown): Promise<SessionHistoryDetail> {
    if (typeof key !== "string") throw new TypeError("A session key is required");
    await this.list();
    const entry = this.entries.get(key);
    if (!entry) throw new Error("Session no longer available. Refresh the list.");
    const log = await this.read(entry.path, 1024 * 1024).catch((error: NodeJS.ErrnoException) => {
      if (["grok", "antigravity"].includes(entry.session.agent) && error.code === "ENOENT")
        return { text: "", truncated: false };
      throw error;
    });
    const parsed = parseHistoryLog(log.text, entry.session.agent);
    return {
      session: entry.session,
      messages: parsed.messages.slice(0, 1).concat(parsed.messages.slice(1).slice(-99)),
      truncated:
        log.truncated ||
        parsed.messages.length > 100 ||
        parsed.messages.some((message) => message.text.length >= 24000),
    };
  }
  async analysisSource(key: string) {
    await this.refresh();
    const entry = this.entries.get(key);
    if (!entry) throw new Error("Session no longer available. Refresh the list.");
    const before = await stat(entry.path).catch(() => null);
    const detail = await this.detail(key);
    const log = await this.read(entry.path, 256 * 1024).catch(() => ({
      text: "",
      truncated: true,
    }));
    const toolEvidence: string[] = [];
    for (const line of log.text.split("\n")) {
      try {
        const record = row(JSON.parse(line));
        if (record.isSidechain === true || record.isMeta === true) continue;
        const payload = row(record.payload);
        if (
          [
            "function_call",
            "function_call_output",
            "custom_tool_call",
            "custom_tool_call_output",
          ].includes(String(payload.type))
        ) {
          toolEvidence.push(
            JSON.stringify({
              timestamp: record.timestamp,
              type: payload.type,
              name: payload.name,
              callId: payload.call_id,
              arguments: clean(payload.arguments ?? payload.input).slice(0, 500),
              output: clean(payload.output).slice(-1500),
            }),
          );
        }
        const parts = row(record.message).content;
        if (Array.isArray(parts))
          for (const part of parts) {
            const item = row(part);
            if (["tool_use", "tool_result"].includes(String(item.type)))
              toolEvidence.push(
                JSON.stringify({
                  timestamp: record.timestamp,
                  type: item.type,
                  name: item.name,
                  callId: item.id ?? item.tool_use_id,
                  input: JSON.stringify(item.input ?? "").slice(0, 500),
                  output: content(item.content).slice(-1500),
                  isError: item.is_error,
                }),
              );
          }
      } catch {
        /* Ignore partial records. */
      }
    }
    const after = await stat(entry.path).catch(() => null);
    if (before?.mtimeMs !== after?.mtimeMs || before?.size !== after?.size)
      throw new Error(
        "Session changed while reading. Try analysis again when the response finishes.",
      );
    return {
      detail: {
        ...detail,
        truncated: detail.truncated || log.truncated,
        toolEvidence: toolEvidence.slice(-8),
      },
      version: `${after?.mtimeMs ?? entry.session.updatedAt}:${after?.size ?? 0}:${entry.session.title}`,
      updatedAt: Math.max(after?.mtimeMs ?? 0, entry.session.updatedAt),
    };
  }
  resume(key: string, cwd: string) {
    const entry = this.entries.get(key);
    const path = this.platform === "win32" ? win32 : { resolve };
    if (
      !entry ||
      !entry.session.canResume ||
      !sessionPathsEqual(
        path.resolve(entry.session.cwd),
        path.resolve(cwd),
        this.platform === "win32",
      )
    )
      throw new Error("Open this session's project before resuming it.");
    const { agent, sessionId } = entry.session;
    if (agent === "grok") return { file: "grok", args: ["--resume", sessionId], env: {} };
    if (agent === "antigravity")
      return { file: "agy", args: ["--conversation", sessionId], env: {} };
    return {
      file: agent === "codex" ? "codex" : "claude",
      args: agent === "codex" ? ["resume", sessionId] : ["--resume", sessionId],
      // Setting CLAUDE_CONFIG_DIR even to ~/.claude changes the location of
      // .claude.json. Preserve unset versus explicitly configured roots.
      env:
        agent === "claude" && !entry.configDirExplicit
          ? {}
          : { [agent === "codex" ? "CODEX_HOME" : "CLAUDE_CONFIG_DIR"]: entry.root },
    };
  }
}
export const sessionHistory = new SessionHistory();
