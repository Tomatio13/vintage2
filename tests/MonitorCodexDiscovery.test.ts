import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  discoverCodexLogs,
  matchCodexLog,
  monitorProcessStarts,
} from "../src/main/monitorCodexDiscovery.js";
const dirs: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
describe("Codex fallback ownership", () => {
  it("requires a single process per cwd and rejects multiple resumed candidates", () => {
    const logs = [
      { path: "new", cwd: "/repo", startedAt: 10_000, modifiedAt: 20_000 },
      { path: "old", cwd: "/repo", startedAt: 0, modifiedAt: 20_000 },
    ];
    expect(matchCodexLog("/repo", 10_000, 1, logs)).toBe("new");
    expect(matchCodexLog("/repo", 10_000, 2, logs)).toBeNull();
    expect(matchCodexLog("/repo", undefined, 1, logs)).toBeNull();
    expect(matchCodexLog("/repo", 30_000, 1, logs)).toBeNull();
    expect(
      matchCodexLog(
        "/repo",
        6000,
        1,
        logs.map((log) => ({ ...log, startedAt: 0 })),
      ),
    ).toBeNull();
    expect(matchCodexLog("/repo-other", 10_000, 1, logs)).toBeNull();
  });
  it("indexes bounded CLI metadata but excludes Desktop and subagent logs", async () => {
    const root = await mkdtemp(join(tmpdir(), "vintage-monitor-discovery-"));
    dirs.push(root);
    const dir = join(root, "sessions", "2026", "10", "11");
    await mkdir(dir, { recursive: true });
    const meta = (source: unknown, originator: string) =>
      JSON.stringify({
        type: "session_meta",
        timestamp: new Date().toISOString(),
        payload: { id: "fixture", cwd: "/repo", source, originator },
      }) + "\n";
    await writeFile(join(dir, "rollout-cli.jsonl"), meta("cli", "codex_cli_rs"));
    await writeFile(join(dir, "rollout-desktop.jsonl"), meta("cli", "Codex Desktop"));
    await writeFile(join(dir, "rollout-agent.jsonl"), meta({ subagent: {} }, "codex_cli_rs"));
    await writeFile(join(dir, "rollout-invalid.jsonl"), "not json\n");
    const logs = await discoverCodexLogs([root], Date.now() - 1000);
    expect(logs.map((log) => log.path)).toEqual([join(dir, "rollout-cli.jsonl")]);
    expect(logs[0]?.cwd).toBe("/repo");
  });
});

it("matches codex-tui vscode metadata only to a terminal process, preferring a single live thread over old threads", () => {
  const logs = [
    {
      path: "old-thread",
      cwd: "/repo",
      source: "vscode" as const,
      startedAt: 10_000,
      modifiedAt: 15_000,
    },
    {
      path: "live-thread",
      cwd: "/repo",
      source: "vscode" as const,
      startedAt: 20_000,
      modifiedAt: 39_000,
    },
  ];
  expect(matchCodexLog("/repo", 10_000, 1, logs, false, 40_000)).toBeNull();
  expect(matchCodexLog("/repo", 10_000, 1, logs, true, 40_000)).toBe("live-thread");
  expect(matchCodexLog("/repo", 10_000, 2, logs, true, 40_000)).toBeNull();
  expect(
    matchCodexLog(
      "/repo",
      10_000,
      1,
      logs.map((log) => ({ ...log, modifiedAt: 39_000 })),
      true,
      40_000,
    ),
  ).toBeNull();
});

it("indexes the terminal build's vscode metadata without including VS Code Desktop or subagent records", async () => {
  const root = await mkdtemp(join(tmpdir(), "vintage-monitor-vscode-"));
  dirs.push(root);
  const dir = join(root, "sessions", "2026", "10", "11");
  await mkdir(dir, { recursive: true });
  const record = (originator: string, source: unknown) =>
    JSON.stringify({
      type: "session_meta",
      timestamp: new Date().toISOString(),
      payload: { cwd: "/repo", originator, source },
    }) + "\n";
  await writeFile(join(dir, "rollout-terminal.jsonl"), record("codex-tui", "vscode"));
  await writeFile(join(dir, "rollout-extension.jsonl"), record("vscode", "vscode"));
  await writeFile(join(dir, "rollout-subagent.jsonl"), record("codex-tui", { subagent: {} }));
  const logs = await discoverCodexLogs([root], 0);
  expect(logs.map((log) => log.path)).toEqual([join(dir, "rollout-terminal.jsonl")]);
});

it("recovers an idle terminal after monitor restart using its unique start and latest activity", () => {
  const logs = [
    {
      path: "original",
      cwd: "/repo",
      source: "vscode" as const,
      startedAt: 10000,
      modifiedAt: 50000,
    },
    {
      path: "other-thread",
      cwd: "/repo",
      source: "vscode" as const,
      startedAt: 20000,
      modifiedAt: 30000,
    },
  ];
  expect(matchCodexLog("/repo", 10000, 1, logs, true, 100000)).toBe("original");
  expect(matchCodexLog("/repo", 10000, 1, logs, false, 100000)).toBeNull();
  expect(matchCodexLog("/repo", 10000, 2, logs, true, 100000)).toBeNull();
  expect(
    matchCodexLog(
      "/repo",
      10000,
      1,
      logs.map((log) => ({ ...log, modifiedAt: 50000 })),
      true,
      100000,
    ),
  ).toBeNull();
  expect(
    matchCodexLog(
      "/repo",
      10000,
      1,
      logs.map((log) => ({ ...log, modifiedAt: log.path === "original" ? 30000 : 50000 })),
      true,
      100000,
    ),
  ).toBeNull();
});

it.skipIf(process.platform === "win32")(
  "reads process start times under Japanese locale",
  async () => {
    vi.stubEnv("LANG", "ja_JP.UTF-8");
    vi.stubEnv("LC_ALL", "ja_JP.UTF-8");
    vi.stubEnv("LC_TIME", "ja_JP.UTF-8");
    const starts = await monitorProcessStarts();
    const started = starts.get(process.pid);
    expect(started).toBeDefined();
    expect(started).toBeLessThanOrEqual(Date.now());
    expect(Math.abs(Date.now() - process.uptime() * 1000 - started!)).toBeLessThan(5000);
  },
);
