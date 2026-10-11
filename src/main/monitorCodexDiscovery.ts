import { execFile } from "node:child_process";
import { open, readdir, stat } from "node:fs/promises";
import { normalize } from "node:path/win32";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
export interface CodexLogCandidate {
  path: string;
  cwd: string;
  modifiedAt: number;
  startedAt: number | null;
  source?: "cli" | "exec" | "vscode";
}

export async function monitorProcessStarts(): Promise<Map<number, number>> {
  try {
    const { stdout } = await execFileAsync("ps", ["-eo", "pid=,lstart="], {
      timeout: 1000,
      maxBuffer: 2 * 1024 * 1024,
      // lstart is locale-dependent; Date.parse cannot read Japanese day/month names.
      env: { ...process.env, LC_ALL: "C" },
    });
    const result = new Map<number, number>();
    for (const line of stdout.split("\n")) {
      const match = line.trim().match(/^(\d+)\s+(.+)$/u);
      if (!match) continue;
      const at = Date.parse(match[2]!);
      if (Number.isFinite(at)) result.set(Number(match[1]), at);
    }
    return result;
  } catch {
    return new Map();
  }
}

// Bounded metadata discovery only. Full transcripts remain in the incremental reader.
export async function discoverCodexLogs(
  roots: string[],
  after: number,
): Promise<CodexLogCandidate[]> {
  const result: CodexLogCandidate[] = [];
  let inspected = 0;
  const names = async (path: string) => (await readdir(path).catch(() => [])).sort().reverse();
  for (const root of roots) {
    const sessions = join(root, "sessions");
    for (const year of (await names(sessions))
      .filter((name) => /^\d{4}$/u.test(name))
      .slice(0, 10)) {
      for (const month of (await names(join(sessions, year)))
        .filter((name) => /^\d{2}$/u.test(name))
        .slice(0, 12)) {
        for (const day of (await names(join(sessions, year, month)))
          .filter((name) => /^\d{2}$/u.test(name))
          .slice(0, 31)) {
          const dir = join(sessions, year, month, day);
          for (const name of (await names(dir)).filter((name) =>
            /^rollout-.*\.jsonl$/u.test(name),
          )) {
            if (++inspected > 4096) return result;
            const path = join(dir, name);
            const info = await stat(path).catch(() => null);
            if (!info?.isFile() || info.mtimeMs < after) continue;
            const file = await open(path, "r").catch(() => null);
            if (!file) continue;
            try {
              const bytes = Buffer.alloc(64 * 1024);
              const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
              const end = bytes.subarray(0, bytesRead).indexOf(10);
              if (end < 0) continue;
              const record = JSON.parse(bytes.subarray(0, end).toString("utf8"));
              const meta = record?.payload;
              if (record?.type !== "session_meta" || typeof meta?.cwd !== "string") continue;
              // Desktop/MCP/subagent rollouts must never be assigned to an unrelated CLI.
              if (meta.source !== undefined && !["cli", "exec", "vscode"].includes(meta.source))
                continue;
              // Some terminal builds emit vscode rollouts under the codex-tui originator.
              // Index these, but match them only to an actual TTY process below.
              if (meta.source === "vscode" && meta.originator !== "codex-tui") continue;
              if (
                meta.originator !== undefined &&
                !["codex_cli_rs", "codex_exec", "codex-tui"].includes(meta.originator)
              )
                continue;
              const startedAt = Date.parse(meta.timestamp ?? record.timestamp);
              result.push({
                path,
                cwd: meta.cwd,
                modifiedAt: info.mtimeMs,
                startedAt: Number.isFinite(startedAt) ? startedAt : null,
                ...(meta.source === undefined ? {} : { source: meta.source }),
              });
            } catch {
              /* Unrecognized metadata stays unmatched. */
            } finally {
              await file.close();
            }
          }
        }
      }
    }
  }
  return result;
}

export function matchCodexLog(
  cwd: string,
  startedAt: number | undefined,
  peers: number,
  candidates: CodexLogCandidate[],
  terminalProcess = false,
  now = Date.now(),
): string | null {
  if (!cwd || startedAt === undefined || peers !== 1) return null;
  const matches = candidates.filter(
    (log) =>
      monitorPathsEqual(log.cwd, cwd) &&
      log.modifiedAt >= startedAt - 1000 &&
      (log.source !== "vscode" || terminalProcess),
  );
  // A newly created session near process start is stronger than old resumed logs.
  const newlyStarted = matches.filter(
    (log) => log.startedAt !== null && Math.abs(log.startedAt - startedAt) < 5000,
  );
  if (matches.length === 1) return matches[0]!.path;
  // A terminal can switch between threads without restarting its process.
  // Prefer a single recently-writing log only when activity is separated from
  // all other candidates. This remains an explicitly labelled inferred match.
  if (terminalProcess) {
    const recent = matches.toSorted((a, b) => b.modifiedAt - a.modifiedAt);
    const latest = recent[0];
    const next = recent[1];
    if (
      latest &&
      next &&
      latest.modifiedAt - next.modifiedAt >= 5000 &&
      (latest.modifiedAt >= now - 30_000 ||
        // Recover an idle terminal after Monitor restarts: its original thread
        // still has both a unique process-start match and the latest activity.
        (newlyStarted.length === 1 && newlyStarted[0]!.path === latest.path))
    )
      return latest.path;
  }
  if (newlyStarted.length === 1 && !matches.some((log) => log.source === "vscode"))
    return newlyStarted[0]!.path;
  return null;
}

export function monitorPathsEqual(
  a: string,
  b: string,
  windows = process.platform === "win32",
): boolean {
  if (!windows) return a === b;
  return (
    normalize(a)
      .replace(/[\\/]+$/u, "")
      .toLowerCase() ===
    normalize(b)
      .replace(/[\\/]+$/u, "")
      .toLowerCase()
  );
}
