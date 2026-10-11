import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { cpus, freemem, hostname, loadavg, totalmem, type CpuInfo } from "node:os";
import { basename } from "node:path";
import { promisify } from "node:util";
import type { MonitorHost, MonitorProcess, MonitorSession } from "../shared/monitor.js";
import type { listProcessRows } from "./processMonitor.js";

const execFileAsync = promisify(execFile);
type ProcessRow = NonNullable<Awaited<ReturnType<typeof listProcessRows>>>[number];
type CpuTimes = CpuInfo["times"];
interface ProcessStat {
  identity: string;
  ticks: number;
  memoryBytes: number;
}
interface ProcessMetrics extends MonitorProcess {
  identity: string;
}
const bounded = (percent: number) => Math.max(0, Math.min(100, percent));
const sumTimes = (times: CpuTimes) => Object.values(times).reduce((sum, time) => sum + time, 0);

export function monitorCpuDelta(
  previous: CpuTimes[] | null,
  current: CpuTimes[],
): { total: number | null; cores: (number | null)[] } {
  let totalDelta = 0;
  let idleDelta = 0;
  const cores = current.map((times, index) => {
    const prev = previous?.length === current.length ? previous[index] : undefined;
    if (!prev) return null;
    const total = sumTimes(times) - sumTimes(prev);
    const idle = times.idle - prev.idle;
    if (
      total <= 0 ||
      idle < 0 ||
      Object.keys(times).some((key) => times[key as keyof CpuTimes] < prev[key as keyof CpuTimes])
    )
      return null;
    totalDelta += total;
    idleDelta += idle;
    return bounded(((total - idle) / total) * 100);
  });
  return {
    total: totalDelta > 0 ? bounded(((totalDelta - idleDelta) / totalDelta) * 100) : null,
    cores,
  };
}

export function parseMonitorMeminfo(text: string): { total: number; available: number } | null {
  const total = Number(text.match(/^MemTotal:\s+(\d+) kB$/mu)?.[1]) * 1024;
  const available = Number(text.match(/^MemAvailable:\s+(\d+) kB$/mu)?.[1]) * 1024;
  return Number.isFinite(total) && total > 0 && Number.isFinite(available) && available >= 0
    ? { total, available: Math.min(total, available) }
    : null;
}

export function parseMonitorProcStat(text: string): ProcessStat | null {
  const fields = text
    .slice(text.lastIndexOf(")") + 2)
    .trim()
    .split(/\s+/u);
  const user = Number(fields[11]);
  const system = Number(fields[12]);
  const rss = Number(fields[21]);
  const start = fields[19];
  if (!start || ![user, system, rss].every(Number.isFinite)) return null;
  // memoryBytes is completed with the platform page size by the sampler.
  return { identity: start, ticks: user + system, memoryBytes: rss };
}

export function monitorProcessOwners(
  rows: ProcessRow[],
  agents: { pid: number; id: string }[],
): Map<number, string> {
  const parents = new Map(rows.map((row) => [row.pid, row.parentPid]));
  const roots = new Map(agents.map((agent) => [agent.pid, agent.id]));
  const result = new Map<number, string>();
  for (const row of rows) {
    let pid = row.pid;
    const visited = new Set<number>();
    while (pid > 0 && !visited.has(pid)) {
      const owner = roots.get(pid);
      if (owner) {
        result.set(row.pid, owner);
        break;
      }
      visited.add(pid);
      pid = parents.get(pid) ?? 0;
    }
  }
  return result;
}

export class MonitorSystem {
  private previousCpu: CpuTimes[] | null = null;
  private processSamples = new Map<number, { stat: ProcessStat; at: number }>();
  private linuxUnits: Promise<{ ticks: number; page: number }> | null = null;

  private units(): Promise<{ ticks: number; page: number }> {
    this.linuxUnits ??= Promise.all([
      execFileAsync("getconf", ["CLK_TCK"], { timeout: 1000 }),
      execFileAsync("getconf", ["PAGESIZE"], { timeout: 1000 }),
    ]).then(([ticks, page]) => {
      const hz = Number(ticks.stdout.trim());
      const size = Number(page.stdout.trim());
      if (!(hz > 0 && size > 0)) throw new Error("Invalid process units");
      return { ticks: hz, page: size };
    });
    return this.linuxUnits;
  }

  async host(): Promise<MonitorHost> {
    const current = cpus().map((cpu) => ({ ...cpu.times }));
    const cpu = monitorCpuDelta(this.previousCpu, current);
    this.previousCpu = current;
    const memory =
      process.platform === "linux"
        ? parseMonitorMeminfo(await readFile("/proc/meminfo", "utf8").catch(() => ""))
        : null;
    const total = memory?.total ?? totalmem();
    const available = memory?.available ?? freemem();
    return {
      name: hostname(),
      cpuPercent: cpu.total,
      cores: cpu.cores,
      memoryUsedBytes: Math.max(0, total - available),
      memoryTotalBytes: total,
      loadAverage: process.platform === "win32" ? null : (loadavg()[0] ?? null),
    };
  }

  private async processMetrics(
    rows: ProcessRow[],
    pids: number[],
  ): Promise<Map<number, ProcessMetrics>> {
    const metrics = new Map<number, ProcessMetrics>();
    const now = Date.now();
    if (process.platform === "linux") {
      const units = await this.units().catch(() => null);
      if (!units) return metrics;
      for (let offset = 0; offset < pids.length; offset += 32) {
        const group = await Promise.all(
          pids.slice(offset, offset + 32).map(async (pid) => ({
            pid,
            stat: parseMonitorProcStat(await readFile(`/proc/${pid}/stat`, "utf8").catch(() => "")),
          })),
        );
        for (const { pid, stat } of group) {
          if (!stat) continue;
          stat.memoryBytes = Math.max(0, stat.memoryBytes * units.page);
          const previous = this.processSamples.get(pid);
          const rate =
            previous?.stat.identity === stat.identity &&
            now > previous.at &&
            stat.ticks >= previous.stat.ticks
              ? ((stat.ticks - previous.stat.ticks) / units.ticks / ((now - previous.at) / 1000)) *
                100
              : null;
          this.processSamples.set(pid, { stat, at: now });
          metrics.set(pid, {
            pid,
            name: basename(rows.find((row) => row.pid === pid)?.command ?? "Process"),
            cpuPercent: rate,
            memoryBytes: stat.memoryBytes,
            identity: stat.identity,
          });
        }
      }
    } else if (process.platform === "darwin" && pids.length) {
      try {
        const { stdout } = await execFileAsync(
          "ps",
          ["-p", pids.join(","), "-o", "pid=,%cpu=,rss=,comm="],
          { timeout: 2000, maxBuffer: 2 * 1024 * 1024 },
        );
        for (const line of stdout.split("\n")) {
          const match = line.trim().match(/^(\d+)\s+([\d.]+)\s+(\d+)\s+(.+)$/u);
          if (!match) continue;
          const pid = Number(match[1]);
          metrics.set(pid, {
            pid,
            name: basename(match[4]!),
            cpuPercent: Number(match[2]),
            memoryBytes: Number(match[3]) * 1024,
            identity: "",
          });
        }
      } catch {
        /* Process races or unavailable ps yield unknown values. */
      }
    }
    for (const pid of this.processSamples.keys())
      if (!pids.includes(pid)) this.processSamples.delete(pid);
    return metrics;
  }

  async sample(
    rows: ProcessRow[],
    sessions: MonitorSession[],
  ): Promise<{
    host: MonitorHost;
    sessions: MonitorSession[];
  }> {
    const live = sessions.filter((session) => session.status !== "Done");
    const owners = monitorProcessOwners(rows, live);
    const pids = [...owners.keys()].slice(0, 2048);
    const [host, metrics] = await Promise.all([this.host(), this.processMetrics(rows, pids)]);
    return {
      host,
      sessions: sessions.map((session) => {
        if (session.status === "Done")
          return { ...session, cpuPercent: null, memoryBytes: null, children: [] };
        const owned = [...owners]
          .filter(([, id]) => id === session.id)
          .flatMap(([pid]) => (metrics.get(pid) ? [metrics.get(pid)!] : []));
        const cpuKnown = owned.some((metric) => metric.cpuPercent !== null);
        return {
          ...session,
          cpuPercent: cpuKnown
            ? owned.reduce((sum, metric) => sum + (metric.cpuPercent ?? 0), 0)
            : null,
          memoryBytes: owned.length
            ? owned.reduce((sum, metric) => sum + (metric.memoryBytes ?? 0), 0)
            : null,
          children: owned
            .filter((metric) => metric.pid !== session.pid)
            .sort((a, b) => (b.cpuPercent ?? 0) - (a.cpuPercent ?? 0))
            .slice(0, 24)
            .map(({ identity: _identity, ...metric }) => metric),
        };
      }),
    };
  }
}
