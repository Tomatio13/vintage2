import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { open, readdir, readFile, readlink } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import type { MonitorAgent, MonitorSession, MonitorSnapshot } from "../shared/monitor.js";
import { listProcessRows } from "./processMonitor.js";
import {
  discoverCodexLogs,
  matchCodexLog,
  monitorProcessStarts,
  type CodexLogCandidate,
} from "./monitorCodexDiscovery.js";
import { readLocalAgent } from "./monitorLocalAgents.js";
import { MonitorSystem } from "./monitorSystem.js";
import { MonitorTranscript } from "./monitorTranscript.js";

const execFileAsync = promisify(execFile);
type ProcessRow = NonNullable<Awaited<ReturnType<typeof listProcessRows>>>[number];
interface OpenFiles {
  paths: string[];
  cwd: string;
  terminal?: boolean;
}
interface Tracked {
  session: MonitorSession;
  identity: string;
  sampledAt: number;
  total: number;
}

function codexService(args: string): boolean {
  const tokens = args.match(/(?:[^\s"']+|"[^"']*"|'[^']*')+/gu) ?? [];
  const valueOptions = new Set([
    "-c",
    "--config",
    "-C",
    "--cd",
    "-m",
    "--model",
    "-p",
    "--profile",
    "-s",
    "--sandbox",
    "-a",
    "--ask-for-approval",
    "--remote",
    "--environment-id",
  ]);
  for (let index = 1; index < tokens.length; index++) {
    const token = tokens[index]!;
    if (valueOptions.has(token)) {
      index++;
      continue;
    }
    if (token.startsWith("-")) continue;
    return token === "app-server" || token === "mcp-server";
  }
  return false;
}

export function monitorAgent(row: ProcessRow): MonitorAgent | null {
  const command = basename(row.command).toLowerCase();
  if (command === "opencode" || command === "opencode-cli") return "opencode";
  if (/^grok(?:-\d+(?:\.\d+)*)?$/u.test(command)) return "grok";
  if (command === "zcode-cli" || command === "zc") return "zcode";
  if (["agy", "antigravity-cli", "antigravity_cli"].includes(command)) return "antigravity";
  if (
    /^language[_-]server/u.test(command) &&
    /(?:\/antigravity(?:[-_/]|\.)|--app_data_dir[= ]+antigravity)/iu.test(row.args ?? "")
  )
    return "antigravity";
  if (command === "claude" || command === "claude-code") return "claude";
  if (command === "codex") return codexService(row.args ?? "") ? null : "codex";
  if (command === "node" || command === "bun") {
    const entry = (row.args ?? "").match(/^\S+\s+(\S+)/u)?.[1] ?? "";
    if (/(?:^|\/)(?:opencode|opencode-ai)(?:\/|\.(?:c?js|mjs)$|$)/u.test(entry)) return "opencode";
    if (/(?:^|\/)(?:zcode|zc)(?:\/|\.(?:c?js|mjs)$|$)/u.test(entry)) return "zcode";
    if (/(?:^|[\s/])(?:claude-code|claude)(?:\.js)?(?:[\s/]|$)/u.test(row.args ?? ""))
      return "claude";
    if (/(?:^|[\s/])codex(?:\.js)?(?:[\s/]|$)/u.test(row.args ?? ""))
      return codexService(row.args ?? "") ? null : "codex";
  }
  return null;
}

async function smallJson(path: string): Promise<Record<string, unknown> | null> {
  try {
    const file = await open(path, "r");
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > 64 * 1024) return null;
      const value: unknown = JSON.parse(await file.readFile("utf8"));
      return value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
    } finally {
      await file.close();
    }
  } catch {
    return null;
  }
}

async function linuxFiles(pid: number): Promise<OpenFiles> {
  const cwd = await readlink(`/proc/${pid}/cwd`).catch(() => "");
  const stdin = await readlink(`/proc/${pid}/fd/0`).catch(() => "");
  const terminal = /^\/dev\/(?:pts\/|tty)/u.test(stdin);
  const names = await readdir(`/proc/${pid}/fd`).catch(() => []);
  const paths: string[] = [];
  for (let start = 0; start < Math.min(names.length, 1024); start += 64) {
    const links = await Promise.all(
      names
        .slice(start, start + 64)
        .map((name) => readlink(`/proc/${pid}/fd/${name}`).catch(() => "")),
    );
    paths.push(
      ...links.filter(
        (path) =>
          isAbsolute(path) &&
          (path.includes("/projects/") ||
            path.includes("/sessions/") ||
            path.endsWith("opencode.db") ||
            path.endsWith("conversation_summaries.db") ||
            path.endsWith("/cli/db/db.sqlite") ||
            path.includes("/conversations/") ||
            path.includes("/brain/")),
      ),
    );
  }
  return { cwd, paths: [...new Set(paths)], terminal };
}

export function parseMonitorLsof(output: string): Map<number, OpenFiles> {
  const files = new Map<number, OpenFiles>();
  let current: OpenFiles | undefined;
  let descriptor = "";
  for (const line of output.split("\n")) {
    if (line.startsWith("p")) {
      current = { cwd: "", paths: [] };
      descriptor = "";
      files.set(Number(line.slice(1)), current);
    } else if (line.startsWith("f")) descriptor = line.slice(1);
    else if (line.startsWith("n") && current) {
      const path = line.slice(1);
      if (descriptor === "cwd") current.cwd = path;
      if (descriptor === "0" && /^\/dev\/(?:pts\/|tty)/u.test(path)) current.terminal = true;
      if (
        isAbsolute(path) &&
        (path.includes("/projects/") ||
          path.includes("/sessions/") ||
          path.endsWith("opencode.db") ||
          path.endsWith("conversation_summaries.db") ||
          path.endsWith("/cli/db/db.sqlite") ||
          path.includes("/conversations/") ||
          path.includes("/brain/"))
      )
        current.paths.push(path);
    }
  }
  return files;
}

async function openFiles(rows: ProcessRow[]): Promise<Map<number, OpenFiles>> {
  if (process.platform === "linux") {
    const map = new Map<number, OpenFiles>();
    for (const row of rows) map.set(row.pid, await linuxFiles(row.pid));
    return map;
  }
  if (!rows.length) return new Map();
  try {
    const { stdout } = await execFileAsync(
      "lsof",
      ["-n", "-P", "-F", "pfn", "-p", rows.map((row) => row.pid).join(",")],
      { timeout: 2000, maxBuffer: 4 * 1024 * 1024 },
    );
    return parseMonitorLsof(stdout);
  } catch (error) {
    // lsof may exit 1 for vanished/inaccessible PIDs while returning useful records.
    const stdout = (error as { stdout?: unknown }).stdout;
    if (typeof stdout === "string" && stdout) return parseMonitorLsof(stdout);
    return new Map();
  }
}

async function processIdentity(row: ProcessRow): Promise<string> {
  const commandHash = createHash("sha256")
    .update(row.args ?? row.command)
    .digest("hex")
    .slice(0, 16);
  if (process.platform === "linux") {
    const stat = await readFile(`/proc/${row.pid}/stat`, "utf8").catch(() => "");
    const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    return `${row.pid}:${fields[19] || commandHash}`;
  }
  try {
    const { stdout } = await execFileAsync("ps", ["-p", String(row.pid), "-o", "lstart="], {
      timeout: 1000,
    });
    return `${row.pid}:${stdout.trim() || commandHash}`;
  } catch {
    return `${row.pid}:${commandHash}`;
  }
}

async function claudeRoots(
  files: Map<number, OpenFiles>,
  rows: ProcessRow[],
  homeDirectory: string,
): Promise<string[]> {
  const roots = new Set([join(homeDirectory, ".claude")]);
  if (process.env.CLAUDE_CONFIG_DIR) roots.add(process.env.CLAUDE_CONFIG_DIR);
  for (const name of await readdir(homeDirectory).catch(() => [])) {
    if (name.startsWith(".claude-")) roots.add(join(homeDirectory, name));
  }
  for (const file of files.values())
    for (const path of file.paths) {
      const index = path.indexOf("/projects/");
      if (index > 0) roots.add(path.slice(0, index));
    }
  if (process.platform === "linux")
    for (const row of rows) {
      // Read only the config-root value; never expose process environments or credentials.
      const env = await readFile(`/proc/${row.pid}/environ`).catch(() => Buffer.alloc(0));
      const entry = env
        .toString("utf8")
        .split("\0")
        .find((value) => value.startsWith("CLAUDE_CONFIG_DIR="));
      if (entry) roots.add(entry.slice("CLAUDE_CONFIG_DIR=".length));
    }
  return [...roots].filter(isAbsolute).slice(0, 32);
}

async function claudeSessions(
  roots: string[],
): Promise<
  Map<number, { path: string; cwd: string; sessionId: string; startedAt: number | null }[]>
> {
  const sessions = new Map<
    number,
    { path: string; cwd: string; sessionId: string; startedAt: number | null }[]
  >();
  for (const root of roots) {
    const dir = join(root, "sessions");
    const names = await readdir(dir).catch(() => []);
    for (const name of names.filter((name) => name.endsWith(".json")).slice(0, 256)) {
      const meta = await smallJson(join(dir, name));
      if (
        !meta ||
        !Number.isSafeInteger(meta.pid) ||
        typeof meta.cwd !== "string" ||
        !isAbsolute(meta.cwd) ||
        typeof meta.sessionId !== "string" ||
        !/^[\w-]+$/u.test(meta.sessionId)
      )
        continue;
      const path = join(
        root,
        "projects",
        meta.cwd.replace(/[^a-zA-Z0-9]/gu, "-"),
        `${meta.sessionId}.jsonl`,
      );
      const items = sessions.get(Number(meta.pid)) ?? [];
      if (!items.some((item) => item.path === path))
        items.push({
          path,
          cwd: meta.cwd,
          sessionId: meta.sessionId,
          startedAt: typeof meta.startedAt === "number" ? meta.startedAt : null,
        });
      sessions.set(Number(meta.pid), items);
    }
  }
  return sessions;
}

export class MonitorCollector {
  constructor(private readonly homeDirectory = homedir()) {}
  private discovered: {
    at: number;
    roots: string;
    processes: string;
    logs: CodexLogCandidate[];
  } | null = null;
  private pathsByIdentity = new Map<string, string>();
  private system = new MonitorSystem();
  private history: NonNullable<MonitorSnapshot["history"]> = [];
  private readers = new Map<string, MonitorTranscript>();
  private tracked = new Map<string, Tracked>();
  private inFlight: Promise<MonitorSnapshot> | null = null;
  private last: MonitorSnapshot | null = null;

  collect(): Promise<MonitorSnapshot> {
    if (this.inFlight) return this.inFlight;
    if (this.last && Date.now() - this.last.generatedAt < 1000) return Promise.resolve(this.last);
    this.inFlight = this.sample()
      .then((snapshot) => {
        this.last = snapshot;
        return snapshot;
      })
      .finally(() => {
        this.inFlight = null;
      });
    return this.inFlight;
  }

  private async sample(): Promise<MonitorSnapshot> {
    const generatedAt = Date.now();
    if (process.platform !== "linux" && process.platform !== "darwin")
      return {
        generatedAt,
        supported: false,
        sessions: [],
        warnings: ["Monitor currently supports macOS and Linux."],
      };
    const rows = await listProcessRows();
    if (!rows) throw new Error("Unable to inspect local processes.");
    const candidates = rows.filter((row) => monitorAgent(row));
    // A node launcher and its native child represent the same agent, not two sessions.
    const parents = new Map(rows.map((row) => [row.pid, row]));
    const agents = candidates
      .filter((row) => {
        if (monitorAgent(row) === "antigravity") {
          let pid = row.parentPid;
          const visited = new Set<number>();
          while (pid > 0 && !visited.has(pid)) {
            visited.add(pid);
            const parent = parents.get(pid);
            if (!parent) break;
            if (monitorAgent(parent) === "antigravity") return false;
            pid = parent.parentPid;
          }
        }
        return !(
          ["node", "bun"].includes(basename(row.command)) &&
          candidates.some(
            (child) => child.parentPid === row.pid && monitorAgent(child) === monitorAgent(row),
          )
        );
      })
      .slice(0, 128);
    const files = await openFiles(agents);
    const antigravityRoots = agents.filter((row) => monitorAgent(row) === "antigravity");
    if (antigravityRoots.length) {
      const terminals = antigravityRoots.map((row) => ({ pid: row.pid, paneId: String(row.pid) }));
      const children = candidates.filter(
        (row) =>
          !antigravityRoots.some((root) => root.pid === row.pid) &&
          monitorAgent(row) === "antigravity",
      );
      const childFiles = await openFiles(children);
      for (const child of children) {
        const root = Number(paneForMonitorPid(child.pid, rows, terminals));
        const rootFiles = files.get(root);
        if (rootFiles)
          rootFiles.paths = [
            ...new Set([...rootFiles.paths, ...(childFiles.get(child.pid)?.paths ?? [])]),
          ];
      }
    }
    const metadata = agents.some((row) => monitorAgent(row) === "claude")
      ? await claudeSessions(await claudeRoots(files, agents, this.homeDirectory))
      : new Map();
    const codexRows = agents.filter((row) => monitorAgent(row) === "codex");
    const needsFallback = codexRows.some(
      (row) => !files.get(row.pid)?.paths.some((path) => /\/rollout-[^/]+\.jsonl$/u.test(path)),
    );
    const starts = needsFallback ? await monitorProcessStarts() : new Map<number, number>();
    let fallbackLogs: CodexLogCandidate[] = [];
    if (needsFallback && starts.size) {
      const roots = new Set([process.env.CODEX_HOME || join(this.homeDirectory, ".codex")]);
      if (process.platform === "linux")
        for (const row of codexRows) {
          const env = await readFile(`/proc/${row.pid}/environ`).catch(() => Buffer.alloc(0));
          const entry = env
            .toString("utf8")
            .split("\0")
            .find((value) => value.startsWith("CODEX_HOME="));
          if (entry && isAbsolute(entry.slice(11))) roots.add(entry.slice(11));
        }
      const rootKey = JSON.stringify([...roots]);
      const processKey = JSON.stringify(codexRows.map((row) => [row.pid, starts.get(row.pid)]));
      const retryNewLogs = codexRows.some(
        (row) =>
          files.get(row.pid)?.terminal === true &&
          Date.now() - (starts.get(row.pid) ?? 0) < 30_000 &&
          ![...this.tracked.values()].some(
            (tracked) =>
              tracked.session.pid === row.pid && tracked.session.logMatch !== "unavailable",
          ),
      );
      if (
        !this.discovered ||
        Date.now() - this.discovered.at >= 10_000 ||
        rootKey !== this.discovered.roots ||
        processKey !== this.discovered.processes ||
        retryNewLogs
      ) {
        const after = Math.min(...codexRows.map((row) => starts.get(row.pid) ?? Date.now())) - 1000;
        this.discovered = {
          at: Date.now(),
          roots: rootKey,
          processes: processKey,
          logs: await discoverCodexLogs([...roots], after),
        };
      }
      fallbackLogs = this.discovered.logs;
    }
    const seen = new Set<string>();
    const usedReaders = new Set<string>();
    const warnings = new Set<string>();
    const zcodeSessions = new Set<string>();
    if (candidates.length > 128) warnings.add("Only the first 128 agent processes are shown.");
    for (const row of agents) {
      const agent = monitorAgent(row)!;
      const identity = await processIdentity(row);
      const id = `${agent}:${identity}`;
      seen.add(id);
      const ownFiles = files.get(row.pid);
      const matches = agent === "claude" ? (metadata.get(row.pid) ?? []) : [];
      const paths =
        agent === "codex"
          ? [
              ...new Set(
                ownFiles?.paths.filter((path) => /\/rollout-[^/]+\.jsonl$/u.test(path)) ?? [],
              ),
            ]
          : matches.map((item: { path: string }) => item.path);
      const meta = agent === "claude" && matches.length === 1 ? matches[0] : null;
      let path = paths.length === 1 ? paths[0] : null;
      let inferred = false;
      if (agent === "codex" && paths.length === 0) {
        inferred = true;
        // Background services cannot own a TTY's vscode rollout and must not
        // make that terminal appear ambiguous just because they share its cwd.
        const peers = codexRows.filter(
          (peer) =>
            files.get(peer.pid)?.cwd === ownFiles?.cwd &&
            (files.get(peer.pid)?.terminal === true) === (ownFiles?.terminal === true),
        ).length;
        path =
          matchCodexLog(
            ownFiles?.cwd ?? "",
            starts.get(row.pid),
            peers,
            fallbackLogs,
            ownFiles?.terminal === true,
          ) ??
          this.pathsByIdentity.get(identity) ??
          null;
      }
      if (path) this.pathsByIdentity.set(identity, path);
      const previous = this.tracked.get(id);
      let reader: MonitorTranscript | undefined;
      let readable = false;
      if (path) {
        const key = `${identity}:${path}`;
        usedReaders.add(key);
        reader = this.readers.get(key) ?? new MonitorTranscript(agent);
        this.readers.set(key, reader);
        try {
          await reader.read(path);
          readable = true;
        } catch {
          warnings.add("Some session logs could not be read.");
        }
      } else if (agent === "claude" || agent === "codex")
        warnings.add("Some agents could not be uniquely matched to a session log.");
      let dataHome = process.env.XDG_DATA_HOME;
      if (agent === "opencode" && process.platform === "linux") {
        const env = await readFile(`/proc/${row.pid}/environ`).catch(() => Buffer.alloc(0));
        const entry = env
          .toString("utf8")
          .split("\0")
          .find((value) => value.startsWith("XDG_DATA_HOME="));
        if (entry && isAbsolute(entry.slice(14))) dataHome = entry.slice(14);
      }
      const local =
        agent !== "claude" && agent !== "codex"
          ? await readLocalAgent(
              agent,
              ownFiles?.cwd ?? "",
              agents.filter(
                (peer) =>
                  monitorAgent(peer) === agent && files.get(peer.pid)?.cwd === ownFiles?.cwd,
              ).length,
              ownFiles?.paths ?? [],
              this.homeDirectory,
              dataHome,
            )
          : null;
      // ZCode workers may remain alive long after their task has stopped updating.
      if (
        agent === "zcode" &&
        local?.state?.lastActivityAt != null &&
        Date.now() - local.state.lastActivityAt >= 60 * 60 * 1000
      ) {
        seen.delete(id);
        continue;
      }
      if (agent === "zcode" && local?.state?.sessionId) {
        const key = JSON.stringify([local.state.cwd, local.state.sessionId]);
        if (zcodeSessions.has(key)) {
          seen.delete(id);
          continue;
        }
        zcodeSessions.add(key);
      }
      if (local) readable = local.state !== null;
      const state = structuredClone(
        local?.state ?? reader?.state ?? new MonitorTranscript(agent).state,
      );
      state.cwd = meta?.cwd ?? (state.cwd || ownFiles?.cwd || "");
      state.sessionId = meta?.sessionId ?? state.sessionId;
      state.startedAt = meta?.startedAt ?? state.startedAt;
      if (!readable || state.loading) {
        state.status = "Unknown";
        state.currentTool = null;
      }
      const total = state.inputTokens + state.outputTokens;
      const sampledAt = Date.now();
      const remote = agent === "codex" && /(?:^|\s)--remote(?:=|\s|$)/u.test(row.args ?? "");
      const launchSurface = remote ? "remote" : ownFiles?.terminal ? "terminal" : "background";
      const unavailableReason = remote
        ? "Remote Codex process; no local session log matched."
        : agent === "codex" && !ownFiles?.terminal
          ? "Background Codex process; no local session log matched."
          : "No uniquely matched session log.";
      const session: MonitorSession = {
        ...state,
        id,
        pid: row.pid,
        paneId: null,
        launchSurface,
        logMatch: !readable
          ? "unavailable"
          : local
            ? local.verified
              ? "verified"
              : "inferred"
            : inferred
              ? "inferred"
              : "verified",
        diagnostic: local
          ? local.diagnostic
          : !path
            ? unavailableReason
            : !readable
              ? "Session log could not be read."
              : state.loading
                ? "Loading session history."
                : inferred
                  ? "Log matched by process start, working directory and activity."
                  : null,
        tokensPerSecond:
          readable &&
          state.tokenTotalsAvailable !== false &&
          !state.loading &&
          previous &&
          !previous.session.loading &&
          previous.session.tokenTotalsAvailable !== false &&
          previous.session.sessionId === state.sessionId &&
          sampledAt > previous.sampledAt &&
          total >= previous.total
            ? (total - previous.total) / ((sampledAt - previous.sampledAt) / 1000)
            : null,
      };
      this.tracked.set(id, { session, identity, sampledAt, total });
    }
    for (const id of this.tracked.keys()) {
      if (!seen.has(id)) this.tracked.delete(id);
    }
    const activeIdentities = new Set([...seen].map((id) => id.slice(id.indexOf(":") + 1)));
    for (const identity of this.pathsByIdentity.keys())
      if (!activeIdentities.has(identity)) this.pathsByIdentity.delete(identity);
    for (const key of this.readers.keys()) if (!usedReaders.has(key)) this.readers.delete(key);
    const sessions = [...this.tracked.values()]
      .map((t) => t.session)
      .sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
    const system = await this.system.sample(rows, sessions);
    const rates = sessions
      .filter((session) => session.status !== "Done" && session.tokensPerSecond !== null)
      .map((session) => session.tokensPerSecond!);
    this.history.push({
      at: Date.now(),
      tokenRate: rates.length ? rates.reduce((sum, rate) => sum + rate, 0) : null,
      activeSessions: sessions.filter(
        (session) => session.status === "Thinking" || session.status === "Executing",
      ).length,
      cpuPercent: system.host.cpuPercent,
      memoryPercent:
        system.host.memoryTotalBytes > 0
          ? (system.host.memoryUsedBytes / system.host.memoryTotalBytes) * 100
          : null,
    });
    this.history = this.history.slice(-90);
    return {
      generatedAt: Date.now(),
      supported: true,
      ...system,
      history: [...this.history],
      warnings: [...warnings],
    };
  }
}

export function paneForMonitorPid(
  pid: number,
  rows: ProcessRow[],
  terminals: { pid: number; paneId: string }[],
): string | null {
  const parents = new Map(rows.map((row) => [row.pid, row.parentPid]));
  const panes = new Map(terminals.map((terminal) => [terminal.pid, terminal.paneId]));
  const visited = new Set<number>();
  let current = pid;
  while (current > 0 && !visited.has(current)) {
    if (panes.has(current)) return panes.get(current)!;
    visited.add(current);
    current = parents.get(current) ?? 0;
  }
  return null;
}
