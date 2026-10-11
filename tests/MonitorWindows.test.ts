import { describe, expect, it, vi } from "vitest";
import { parseWindowsProcesses } from "../src/main/monitorWindows.js";
import { monitorAgent } from "../src/main/monitorCollector.js";
import { matchCodexLog, monitorPathsEqual } from "../src/main/monitorCodexDiscovery.js";
import { foregroundSnapshotFor } from "../src/main/processMonitor.js";
import { MonitorSystem } from "../src/main/monitorSystem.js";

const row = {
  pid: 42,
  parentPid: 10,
  command: "codex.exe",
  argv: ["C:\\Program Files\\Codex\\codex.exe"],
  cwd: "C:\\Work\\App",
  startedAt: 10000,
  memoryBytes: 4096,
  cpuPercent: null,
};

describe("Windows Monitor pre-release", () => {
  it("validates the protocol and preserves unknown first-sample CPU", () => {
    const rows = parseWindowsProcesses(
      JSON.stringify({ version: 1, rows: [row, null, { ...row, pid: -1 }] }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ cpuPercent: null, cwd: row.cwd, argv: row.argv });
    expect(() => parseWindowsProcesses('{"version":2,"rows":[]}')).toThrow();
    expect(
      parseWindowsProcesses(JSON.stringify({ version: 1, rows: [{ ...row, cwd: null }] }))[0]?.cwd,
    ).toBe("");
  });

  it("recognizes quoted Windows launchers and excludes Codex services", () => {
    expect(monitorAgent(row)).toBe("codex");
    expect(monitorAgent({ ...row, argv: [...row.argv, "app-server"] })).toBeNull();
    const wrapper = {
      ...row,
      command: "node.exe",
      argv: [
        "C:\\Program Files\\nodejs\\node.exe",
        "C:\\Users\\Test User\\node_modules\\@openai\\codex\\bin\\codex.js",
      ],
    };
    expect(monitorAgent(wrapper)).toBe("codex");
    expect(
      monitorAgent({ ...wrapper, argv: [...wrapper.argv, "--model", "gpt", "mcp-server"] }),
    ).toBeNull();
    expect(
      monitorAgent({ ...wrapper, argv: [wrapper.argv[0]!, "C:\\Work\\server.js", "codex"] }),
    ).toBeNull();
    expect(
      monitorAgent({
        ...wrapper,
        argv: [
          wrapper.argv[0]!,
          "C:\\Users\\Test User\\node_modules\\@anthropic-ai\\claude-code\\cli.js",
        ],
      }),
    ).toBe("claude");
    expect(foregroundSnapshotFor(10, [wrapper])?.agentCli).toBe(true);
  });

  it("normalizes Windows paths without weakening Unix comparisons", () => {
    expect(monitorPathsEqual("C:\\Work\\App\\", "c:/work/app", true)).toBe(true);
    expect(monitorPathsEqual("/Work/App", "/work/app", false)).toBe(false);
  });

  it("keeps competing Codex sessions unmatched and excludes terminal-only logs", () => {
    const candidate = {
      path: "rollout.jsonl",
      cwd: row.cwd,
      modifiedAt: 11000,
      startedAt: row.startedAt,
    };
    expect(matchCodexLog(row.cwd, row.startedAt, 2, [candidate])).toBeNull();
    expect(
      matchCodexLog(row.cwd, row.startedAt, 1, [{ ...candidate, source: "vscode" }]),
    ).toBeNull();
    expect(matchCodexLog(row.cwd, row.startedAt, 1, [candidate])).toBe(candidate.path);
  });

  it("aggregates Windows process metrics from the shared snapshot", async () => {
    const platform = vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    try {
      const system = new MonitorSystem();
      const result = await system.sample(
        [
          { ...row, cpuPercent: 25 },
          { ...row, pid: 43, parentPid: 42, cpuPercent: 50 },
        ],
        [{ id: "agent", pid: 42, status: "Thinking" } as never],
      );
      expect(result.sessions[0]).toMatchObject({ cpuPercent: 75, memoryBytes: 8192 });
      expect(result.sessions[0]?.children).toHaveLength(1);
      expect(result.host.loadAverage).toBeNull();
    } finally {
      platform.mockRestore();
    }
  });
});

it("includes sibling workers and their descendants in a shared session's resources", async () => {
  const platform = vi.spyOn(process, "platform", "get").mockReturnValue("win32");
  try {
    const result = await new MonitorSystem().sample(
      [
        { ...row, cpuPercent: 10 },
        { ...row, pid: 50, parentPid: 10, cpuPercent: 20 },
        { ...row, pid: 51, parentPid: 50, cpuPercent: 30 },
      ],
      [{ id: "shared", pid: 42, processPids: [42, 50], status: "Thinking" } as never],
    );
    expect(result.sessions[0]).toMatchObject({ cpuPercent: 60, memoryBytes: 12288 });
    expect(result.sessions[0]?.children?.map((child) => child.pid).sort()).toEqual([50, 51]);
  } finally {
    platform.mockRestore();
  }
});
