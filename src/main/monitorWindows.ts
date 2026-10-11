import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { join, resolve } from "node:path";

export interface WindowsProcessRow {
  pid: number;
  parentPid: number;
  command: string;
  args: string;
  argv: string[];
  cwd: string;
  startedAt: number;
  memoryBytes: number;
  cpuPercent: number | null;
}

export function parseWindowsProcesses(text: string): WindowsProcessRow[] {
  const data = JSON.parse(text);
  if (data?.version !== 1 || !Array.isArray(data.rows) || data.rows.length > 65536)
    throw new Error("Invalid Windows Monitor snapshot");
  return data.rows
    .filter(
      (row: WindowsProcessRow) =>
        row !== null &&
        typeof row === "object" &&
        Number.isSafeInteger(row.pid) &&
        row.pid > 0 &&
        Number.isSafeInteger(row.parentPid) &&
        row.parentPid >= 0 &&
        typeof row.command === "string" &&
        row.command.length > 0 &&
        Array.isArray(row.argv) &&
        row.argv.every((arg) => typeof arg === "string") &&
        (row.cwd === null || typeof row.cwd === "string") &&
        Number.isFinite(row.startedAt) &&
        row.startedAt > 0 &&
        Number.isFinite(row.memoryBytes) &&
        row.memoryBytes >= 0 &&
        (row.cpuPercent === null || (Number.isFinite(row.cpuPercent) && row.cpuPercent >= 0)),
    )
    .map((row: WindowsProcessRow) => ({
      ...row,
      cwd: row.cwd ?? "",
      args: row.argv.map((arg) => JSON.stringify(arg)).join(" "),
    }));
}

let child: ChildProcessWithoutNullStreams | null = null;
let pending: Promise<WindowsProcessRow[]> | null = null;
let cached: WindowsProcessRow[] | null = null;
let sampledAt = 0;
let idle: ReturnType<typeof setTimeout> | null = null;

function stop(): void {
  child?.kill();
  child = null;
  cached = null;
  if (idle) clearTimeout(idle);
  idle = null;
}
process.once("exit", stop);

export function windowsProcessSnapshot(): Promise<WindowsProcessRow[]> {
  if (pending) return pending;
  if (cached && Date.now() - sampledAt < 750) return Promise.resolve(cached);
  pending = new Promise<WindowsProcessRow[]>((accept, reject) => {
    if (idle) clearTimeout(idle);
    // Resolve only our bundled helper; never execute a helper from PATH.
    const helper =
      process.resourcesPath && !process.defaultApp
        ? join(process.resourcesPath, "monitor", "vintage-monitor.exe")
        : resolve("build", "monitor", "vintage-monitor.exe");
    if (!child) {
      child = spawn(helper, [], { windowsHide: true, stdio: "pipe" });
      const created = child;
      created.stdout.setEncoding("utf8");
      created.on("error", () => {
        if (child === created) stop();
      });
      created.stdin.on("error", () => {
        if (child === created) stop();
      });
      created.once("exit", () => {
        if (child === created) stop();
      });
    }
    const running = child;
    let settled = false;
    let buffer = "";
    const timeout = setTimeout(() => finish(new Error("Windows Monitor helper timed out")), 5000);
    const cleanup = () => {
      clearTimeout(timeout);
      running.stdout.off("data", onData);
      running.off("error", onError);
      running.stdin.off("error", onError);
      running.off("exit", onExit);
    };
    const finish = (error?: Error, rows?: WindowsProcessRow[]) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) {
        stop();
        reject(error);
      } else {
        cached = rows!;
        sampledAt = Date.now();
        accept(rows!);
        idle = setTimeout(stop, 15000);
        idle.unref();
      }
    };
    const onError = (error: Error) => finish(error);
    const onExit = () => finish(new Error("Windows Monitor helper exited"));
    const onData = (chunk: string) => {
      buffer += chunk;
      if (buffer.length > 16 * 1024 * 1024)
        return finish(new Error("Windows Monitor snapshot too large"));
      const end = buffer.indexOf("\n");
      if (end < 0) return;
      try {
        finish(undefined, parseWindowsProcesses(buffer.slice(0, end)));
      } catch {
        finish(new Error("Invalid Windows Monitor snapshot"));
      }
    };
    running.stdout.on("data", onData);
    running.on("error", onError);
    running.stdin.on("error", onError);
    running.once("exit", onExit);
    running.stderr.resume();
    running.stdin.write("sample\n", (error) => {
      if (error) finish(error);
    });
  }).finally(() => {
    pending = null;
  });
  return pending;
}
