import { describe, expect, it } from "vitest";
import {
  monitorCpuDelta,
  monitorProcessOwners,
  parseMonitorMeminfo,
  parseMonitorProcStat,
} from "../src/main/monitorSystem.js";
const times = (user: number, idle: number) => ({ user, idle, nice: 0, sys: 0, irq: 0 });
describe("native monitor system sampling", () => {
  it("measures interval CPU and leaves first samples or resets unknown", () => {
    expect(monitorCpuDelta(null, [times(10, 90)]).total).toBeNull();
    expect(monitorCpuDelta([times(10, 90)], [times(40, 160)]).total).toBe(30);
    expect(monitorCpuDelta([times(40, 160)], [times(10, 90)]).total).toBeNull();
    expect(monitorCpuDelta([times(10, 90)], [times(40, 160), times(40, 160)]).cores).toEqual([
      null,
      null,
    ]);
  });
  it("uses available memory rather than counting reclaimable cache as used", () => {
    expect(parseMonitorMeminfo("MemTotal: 1000 kB\nMemFree: 50 kB\nMemAvailable: 600 kB")).toEqual({
      total: 1024000,
      available: 614400,
    });
    expect(parseMonitorMeminfo("MemTotal: 1000 kB")).toBeNull();
  });
  it("parses process ticks and RSS despite spaces and parentheses in process names", () => {
    const fields = Array(22).fill("0");
    fields[0] = "S";
    fields[11] = "100";
    fields[12] = "20";
    fields[19] = "5000";
    fields[21] = "300";
    expect(parseMonitorProcStat(`123 (worker (task)) ${fields.join(" ")}`)).toEqual({
      identity: "5000",
      ticks: 120,
      memoryBytes: 300,
    });
    expect(parseMonitorProcStat("")).toBeNull();
  });
  it("attributes children to their nearest agent without double counting or looping", () => {
    const rows = [
      { pid: 1, parentPid: 0 },
      { pid: 2, parentPid: 1 },
      { pid: 3, parentPid: 2 },
      { pid: 4, parentPid: 5 },
      { pid: 5, parentPid: 4 },
    ].map((r) => ({ ...r, command: "node", args: "" }));
    const owners = monitorProcessOwners(rows, [
      { pid: 1, id: "outer" },
      { pid: 2, id: "inner" },
    ]);
    expect([...owners]).toEqual([
      [1, "outer"],
      [2, "inner"],
      [3, "inner"],
    ]);
  });
});
