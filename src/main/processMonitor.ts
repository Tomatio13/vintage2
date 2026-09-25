import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface ForegroundProcessSnapshot {
  process: string;
  tree: string[];
  agentCli: boolean;
}

export const AGENT_PROCESS_NAMES = new Set(["claude", "claude-code", "codex", "opencode"]);
const AGENT_RUNTIME_NAMES = new Set(["bun", "node"]);
const AGENT_LAUNCH_PATH =
  /(?:^|[/\\\s])(?:claude(?:-code)?|codex|opencode)(?:\.js)?(?=$|[/\\\s])/iu;

interface ProcessRow {
  pid: number;
  parentPid: number;
  command: string;
  args?: string;
}

type SnapshotListener = (snapshot: ForegroundProcessSnapshot | null) => void;

const PROCESS_MONITOR_INTERVAL_MS = 1_000;

export interface SharedProcessMonitor {
  add(terminalId: string, terminalPid: number, onSnapshot: SnapshotListener): void;
  remove(terminalId: string): void;
}

export function createSharedProcessMonitor(): SharedProcessMonitor {
  const watchers = new Map<string, { pid: number; onSnapshot: SnapshotListener }>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let tickInFlight = false;

  const stop = (): void => {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
  };

  const tick = (): void => {
    if (tickInFlight || watchers.size === 0) return;
    tickInFlight = true;
    void listProcessRows().then((rows) => {
      tickInFlight = false;
      for (const watcher of watchers.values()) {
        watcher.onSnapshot(rows ? foregroundSnapshotFor(watcher.pid, rows) : null);
      }
    });
  };

  return {
    add(terminalId, terminalPid, onSnapshot) {
      watchers.set(terminalId, { pid: terminalPid, onSnapshot });
      if (timer !== null) return;
      timer = setInterval(tick, PROCESS_MONITOR_INTERVAL_MS);
      timer.unref();
    },
    remove(terminalId) {
      watchers.delete(terminalId);
      if (watchers.size === 0) stop();
    },
  };
}

export async function listProcessRows(): Promise<ProcessRow[] | null> {
  if (process.platform === "win32") return null;
  try {
    const { stdout } = await execFileAsync("ps", ["-eo", "pid=,ppid=,comm=,args="], {
      timeout: 1_000,
      windowsHide: true,
    });
    return parseProcessRows(stdout);
  } catch {
    return null;
  }
}

export async function inspectForegroundProcess(
  terminalPid: number,
): Promise<ForegroundProcessSnapshot | null> {
  if (!Number.isInteger(terminalPid) || terminalPid <= 0) return null;
  const rows = await listProcessRows();
  return rows ? foregroundSnapshotFor(terminalPid, rows) : null;
}

export function foregroundSnapshotFor(
  terminalPid: number,
  rows: ProcessRow[],
): ForegroundProcessSnapshot | null {
  if (!Number.isInteger(terminalPid) || terminalPid <= 0) return null;
  const descendants = descendantsOf(terminalPid, rows);
  const leaf = descendants.at(-1);
  if (!leaf) return null;
  return {
    process: leaf.command,
    tree: descendants.map((row) => row.command).slice(-8),
    agentCli: descendants.some(
      (row) =>
        AGENT_PROCESS_NAMES.has(row.command.toLowerCase()) ||
        (AGENT_RUNTIME_NAMES.has(row.command.toLowerCase()) &&
          AGENT_LAUNCH_PATH.test(row.args ?? "")),
    ),
  };
}

export function parseProcessRows(output: string): ProcessRow[] {
  return output
    .split("\n")
    .map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)(?:\s+(.*))?$/u))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map((match) => ({
      pid: Number(match[1]),
      parentPid: Number(match[2]),
      command: match[3]!.trim(),
      ...(match[4] === undefined ? {} : { args: match[4].trim() }),
    }))
    .filter(
      (row) => Number.isInteger(row.pid) && Number.isInteger(row.parentPid) && Boolean(row.command),
    );
}

function descendantsOf(rootPid: number, rows: ProcessRow[]): ProcessRow[] {
  const byParent = new Map<number, ProcessRow[]>();
  for (const row of rows) {
    const children = byParent.get(row.parentPid) ?? [];
    children.push(row);
    byParent.set(row.parentPid, children);
  }
  const result: ProcessRow[] = [];
  let parents = [rootPid];
  while (parents.length > 0) {
    const children = parents
      .flatMap((pid) => byParent.get(pid) ?? [])
      .sort((a, b) => a.pid - b.pid);
    if (children.length === 0) break;
    result.push(...children);
    parents = children.map((child) => child.pid);
  }
  return result;
}
