import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface ForegroundProcessSnapshot {
  process: string;
  tree: string[];
}

interface ProcessRow {
  pid: number;
  parentPid: number;
  command: string;
}

export async function inspectForegroundProcess(
  terminalPid: number,
): Promise<ForegroundProcessSnapshot | null> {
  if (!Number.isInteger(terminalPid) || terminalPid <= 0 || process.platform === "win32")
    return null;
  try {
    const { stdout } = await execFileAsync("ps", ["-eo", "pid=,ppid=,comm="], {
      timeout: 1_000,
      windowsHide: true,
    });
    const rows = parseProcessRows(stdout);
    const descendants = descendantsOf(terminalPid, rows);
    const leaf = descendants.at(-1);
    if (!leaf) return null;
    return {
      process: leaf.command,
      tree: descendants.map((row) => row.command).slice(-8),
    };
  } catch {
    return null;
  }
}

export function parseProcessRows(output: string): ProcessRow[] {
  return output
    .split("\n")
    .map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/u))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map((match) => ({
      pid: Number(match[1]),
      parentPid: Number(match[2]),
      command: match[3]!.trim(),
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
