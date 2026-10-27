import { sessionAnalysisProcesses } from "../src/main/sessionAnalysisProcesses.js";
import { mkdtemp, mkdir, open, writeFile, appendFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as localAgents from "../src/main/monitorLocalAgents.js";
import { MonitorTranscript } from "../src/main/monitorTranscript.js";
import { listProcessRows } from "../src/main/processMonitor.js";
const home = { value: "/tmp" };
vi.mock("../src/main/processMonitor.js", () => ({ listProcessRows: vi.fn() }));
const fixtures: string[] = [];
afterEach(async () => {
  sessionAnalysisProcesses.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  await Promise.all(fixtures.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});
import {
  MonitorCollector,
  monitorAgent,
  paneForMonitorPid,
  parseMonitorLsof,
} from "../src/main/monitorCollector.js";

describe("Monitor process ownership", () => {
  it("excludes CodexBar probes through intermediate parents while retaining terminal agents", async () => {
    vi.mocked(listProcessRows).mockResolvedValue([
      { pid: 900001, parentPid: 1, command: "codexbar-linux" },
      { pid: 900002, parentPid: 900001, command: "sh" },
      { pid: 900003, parentPid: 900002, command: "node", args: "node /tools/bin/codex" },
      { pid: 900004, parentPid: 900003, command: "codex", args: "codex" },
      { pid: 900005, parentPid: 900001, command: "claude", args: "claude" },
      { pid: 900006, parentPid: 1, command: "codex", args: "codex" },
      { pid: 900007, parentPid: 1, command: "claude", args: "claude" },
      { pid: 900008, parentPid: 1, command: "CodexBar.exe", argv: ["CodexBar.exe"] },
      { pid: 900009, parentPid: 900008, command: "codex.exe", argv: ["codex.exe"] },
    ]);
    const snapshot = await new MonitorCollector("/tmp").collect();
    expect(snapshot.sessions.map((session) => session.pid).sort()).toEqual([900006, 900007]);
  });
  it("excludes VINTAGE analysis workers and their descendants without hiding other agents", async () => {
    sessionAnalysisProcesses.add(900001);
    vi.mocked(listProcessRows).mockResolvedValue([
      { pid: 900001, parentPid: 1, command: "node", args: "node /tools/bin/codex" },
      { pid: 900002, parentPid: 900001, command: "sh" },
      { pid: 900003, parentPid: 900002, command: "codex", args: "codex exec" },
      { pid: 900004, parentPid: 1, command: "claude", args: "claude" },
    ]);
    expect(
      (await new MonitorCollector("/tmp").collect()).sessions.map((session) => session.pid),
    ).toEqual([900004]);
  });
  it("recognizes native and Node agent launchers without matching commands that merely mention Codex", () => {
    const row = { pid: 10, parentPid: 1, command: "codex", args: "codex" };
    expect(monitorAgent(row)).toBe("codex");
    expect(
      monitorAgent({
        ...row,
        command: "node",
        args: "node /tools/@anthropic-ai/claude-code/cli.js",
      }),
    ).toBe("claude");
    expect(monitorAgent({ ...row, command: "sh", args: "sh -c echo codex" })).toBeNull();
    expect(monitorAgent({ ...row, args: "codex app-server" })).toBeNull();
    expect(
      monitorAgent({ ...row, args: "codex exec-server --remote https://example.test" }),
    ).toBeNull();
    expect(monitorAgent({ ...row, args: 'codex exec "inspect exec-server"' })).toBe("codex");
    expect(monitorAgent({ ...row, args: "codex mcp-server" })).toBeNull();
    expect(monitorAgent({ ...row, args: "codex remote-control" })).toBeNull();
    expect(
      monitorAgent({ ...row, command: "node", args: "node /tools/bin/codex remote-control" }),
    ).toBeNull();
    expect(monitorAgent({ ...row, args: 'codex exec "inspect remote-control"' })).toBe("codex");
    expect(
      monitorAgent({
        ...row,
        args: "codex -c feature=true app-server --analytics-default-enabled",
      }),
    ).toBeNull();
    expect(monitorAgent({ ...row, args: 'codex exec "inspect app-server"' })).toBe("codex");
  });
  it("maps a session through its ancestors to the owned PTY and handles cycles", () => {
    const rows = [
      { pid: 30, parentPid: 20, command: "codex" },
      { pid: 20, parentPid: 10, command: "node" },
    ];
    expect(paneForMonitorPid(30, rows, [{ pid: 10, paneId: "pane" }])).toBe("pane");
    expect(paneForMonitorPid(30, rows, [{ pid: 99, paneId: "other" }])).toBeNull();
    expect(
      paneForMonitorPid(
        30,
        [
          { pid: 30, parentPid: 20, command: "codex" },
          { pid: 20, parentPid: 30, command: "node" },
        ],
        [],
      ),
    ).toBeNull();
  });
  it("keeps lsof records grouped by PID and separates cwd from rollout paths", () => {
    const files = parseMonitorLsof(
      "p10\nfcwd\nn/repo with spaces\nf12\nn/home/.codex/sessions/rollout-a.jsonl\np20\nfcwd\nn/other\nf9\nn/home/.codex/sessions/rollout-b.jsonl\n",
    );
    expect(files.get(10)).toEqual({
      cwd: "/repo with spaces",
      paths: ["/home/.codex/sessions/rollout-a.jsonl"],
    });
    expect(files.get(20)?.paths).toEqual(["/home/.codex/sessions/rollout-b.jsonl"]);
  });
});

describe("Monitor collection with local fixture logs", () => {
  it("treats the OpenCode 2 launcher and interactive child as one OpenCode process", async () => {
    const state = new MonitorTranscript("opencode").state;
    state.sessionId = "opencode2-session";
    const localRead = vi.spyOn(localAgents, "readLocalAgent").mockResolvedValue({
      state,
      diagnostic: null,
      verified: false,
    });
    vi.mocked(listProcessRows).mockResolvedValue([
      { pid: 900001, parentPid: 1, command: "opencode2" },
      {
        pid: 900002,
        parentPid: 900001,
        command: "opencode2.exe",
        args: "opencode2.exe",
      },
    ]);
    const snapshot = await new MonitorCollector("/tmp").collect();
    expect(snapshot.sessions).toHaveLength(1);
    expect(snapshot.sessions[0]).toMatchObject({
      agent: "opencode",
      pid: 900002,
      sessionId: "opencode2-session",
    });
    expect(localRead).toHaveBeenCalledWith(
      "opencode",
      expect.any(String),
      1,
      expect.any(Array),
      "/tmp",
      process.env.XDG_DATA_HOME,
    );
  });

  it("hides the OpenCode service and its launcher without reading session logs", async () => {
    const localRead = vi.spyOn(localAgents, "readLocalAgent");
    vi.mocked(listProcessRows).mockResolvedValue([
      { pid: 900001, parentPid: 1, command: "opencode2" },
      {
        pid: 900002,
        parentPid: 900001,
        command: "opencode2.exe",
        args: "/home/masato/.nvm/versions/node/v24.22.1/lib/node_modules/@opencode-ai/cli/bin/opencode2.exe serve --service",
      },
    ]);
    const snapshot = await new MonitorCollector("/tmp").collect();
    expect(snapshot.sessions).toEqual([]);
    expect(localRead).not.toHaveBeenCalled();
  });

  it("hides unmatched ZCode workers and removes previously matched rows when their session disappears", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const state = new MonitorTranscript("zcode").state;
    state.sessionId = "conversation";
    state.lastActivityAt = Date.now();
    const localRead = vi.spyOn(localAgents, "readLocalAgent").mockResolvedValue({
      state: null,
      diagnostic: "No local session matches this working directory.",
      verified: false,
    });
    vi.mocked(listProcessRows).mockResolvedValue([
      { pid: process.pid, parentPid: process.ppid, command: "zcode-cli" },
      { pid: process.ppid, parentPid: 1, command: "zcode-cli" },
    ]);
    const collector = new MonitorCollector("/tmp");
    expect((await collector.collect()).sessions).toHaveLength(0);
    vi.setSystemTime(Date.now() + 1000);
    localRead.mockResolvedValue({ state, diagnostic: null, verified: true });
    expect((await collector.collect()).sessions).toHaveLength(1);
    vi.setSystemTime(Date.now() + 1000);
    localRead.mockResolvedValue({
      state: null,
      diagnostic: "No matching session.",
      verified: false,
    });
    expect((await collector.collect()).sessions).toHaveLength(0);
    vi.setSystemTime(Date.now() + 1000);
    localRead.mockResolvedValue({ state, diagnostic: null, verified: true });
    expect((await collector.collect()).sessions).toHaveLength(1);
  });

  it.skipIf(process.platform !== "linux")(
    "hides ZCode after one hour without session updates and restores it when activity resumes",
    async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      const updatedAt = 10_000_000;
      const state = new MonitorTranscript("zcode").state;
      state.lastActivityAt = updatedAt;
      state.sessionId = "shared-zcode-session";
      state.status = "Waiting";
      const localRead = vi.spyOn(localAgents, "readLocalAgent").mockImplementation(async () => ({
        state,
        diagnostic: null,
        verified: false,
      }));
      vi.mocked(listProcessRows).mockResolvedValue([
        { pid: process.pid, parentPid: process.ppid, command: "zcode-cli" },
        { pid: process.ppid, parentPid: 1, command: "zcode-cli" },
      ]);
      const collector = new MonitorCollector("/tmp");
      vi.setSystemTime(updatedAt + 3_598_000);
      const shared = (await collector.collect()).sessions;
      expect(shared).toHaveLength(1);
      expect(shared[0]?.processPids).toEqual([process.pid, process.ppid]);
      expect(localRead).toHaveBeenCalledTimes(1);
      vi.setSystemTime(updatedAt + 3_600_000);
      expect((await collector.collect()).sessions).toHaveLength(0);
      expect(localRead).toHaveBeenCalledTimes(2);
      state.lastActivityAt = updatedAt + 3_602_000;
      vi.setSystemTime(state.lastActivityAt);
      expect((await collector.collect()).sessions).toHaveLength(1);
    },
  );

  it.skipIf(process.platform !== "linux")(
    "discovers an open Codex rollout, keeps incremental state, computes rate and removes an exited process on the next refresh",
    async () => {
      home.value = await mkdtemp(join(tmpdir(), "vintage-monitor-collector-"));
      fixtures.push(home.value);
      await mkdir(join(home.value, "sessions"));
      const path = join(home.value, "sessions", "rollout-fixture.jsonl");
      const event = (type: string, payload: unknown) =>
        JSON.stringify({ type, timestamp: "2026-10-11T10:00:00Z", payload }) + "\n";
      await writeFile(
        path,
        event("session_meta", { id: "fixture", cwd: "/fixture" }) +
          event("event_msg", { type: "task_started" }),
      );
      const fd = await open(path, "r");
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(1_000_000);
      vi.mocked(listProcessRows).mockResolvedValue([
        {
          pid: process.pid,
          parentPid: process.ppid,
          command: "codex",
          args: "codex exec PRIVATE_ARGUMENT",
        },
      ]);
      try {
        const collector = new MonitorCollector(home.value);
        const first = await collector.collect();
        expect(first.sessions).toHaveLength(1);
        expect(first.sessions[0]).toMatchObject({
          sessionId: "fixture",
          status: "Thinking",
          tokensPerSecond: null,
        });
        expect(JSON.stringify(first)).not.toContain("PRIVATE_ARGUMENT");
        await appendFile(
          path,
          event("event_msg", {
            type: "token_count",
            info: {
              total_token_usage: { input_tokens: 100, output_tokens: 50 },
              last_token_usage: { input_tokens: 100 },
              model_context_window: 1000,
            },
          }),
        );
        vi.setSystemTime(1_002_000);
        const second = await collector.collect();
        expect(second.sessions[0]).toMatchObject({
          id: first.sessions[0]!.id,
          inputTokens: 100,
          outputTokens: 50,
          tokensPerSecond: 75,
        });
        vi.mocked(listProcessRows).mockResolvedValue([]);
        vi.setSystemTime(1_004_000);
        expect((await collector.collect()).sessions).toHaveLength(0);
        vi.setSystemTime(1_065_000);
        expect((await collector.collect()).sessions).toHaveLength(0);
      } finally {
        await fd.close();
      }
    },
  );

  it.skipIf(process.platform !== "linux")(
    "matches Claude session metadata to its transcript and preserves Unknown for ambiguous ownership",
    async () => {
      home.value = await mkdtemp(join(tmpdir(), "vintage-monitor-claude-"));
      fixtures.push(home.value);
      const root = join(home.value, ".claude");
      const cwd = "/fixture project";
      await mkdir(join(root, "sessions"), { recursive: true });
      const project = join(root, "projects", cwd.replace(/[^a-zA-Z0-9]/gu, "-"));
      await mkdir(project, { recursive: true });
      await writeFile(
        join(root, "sessions", "one.json"),
        JSON.stringify({ pid: process.pid, sessionId: "one", cwd, startedAt: 100 }),
      );
      await writeFile(
        join(project, "one.jsonl"),
        JSON.stringify({
          type: "assistant",
          sessionId: "one",
          message: { model: "claude-sonnet-4-6", stop_reason: "end_turn", content: [] },
        }) + "\n",
      );
      vi.mocked(listProcessRows).mockResolvedValue([
        { pid: process.pid, parentPid: process.ppid, command: "claude", args: "claude" },
      ]);
      const snapshot = await new MonitorCollector(home.value).collect();
      expect(snapshot.sessions[0]).toMatchObject({ sessionId: "one", cwd, status: "Waiting" });
      await writeFile(
        join(root, "sessions", "two.json"),
        JSON.stringify({ pid: process.pid, sessionId: "two", cwd }),
      );
      expect((await new MonitorCollector(home.value).collect()).sessions[0]?.status).toBe(
        "Unknown",
      );
    },
  );
});

it.skipIf(process.platform !== "linux")(
  "discovers a CLI rollout without a persistent open file descriptor",
  async () => {
    home.value = await mkdtemp(join(tmpdir(), "vintage-monitor-closed-fd-"));
    fixtures.push(home.value);
    const root = join(home.value, ".codex");
    vi.stubEnv("CODEX_HOME", root);
    const dir = join(root, "sessions", "2026", "10", "11");
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "rollout-closed.jsonl"),
      JSON.stringify({
        type: "session_meta",
        timestamp: new Date().toISOString(),
        payload: { id: "closed", cwd: process.cwd(), source: "cli", originator: "codex_cli_rs" },
      }) +
        "\n" +
        JSON.stringify({ type: "event_msg", payload: { type: "task_started" } }) +
        "\n",
    );
    vi.mocked(listProcessRows).mockResolvedValue([
      { pid: process.pid, parentPid: process.ppid, command: "codex", args: "codex" },
    ]);
    const snapshot = await new MonitorCollector(home.value).collect();
    expect(snapshot.sessions[0]).toMatchObject({ sessionId: "closed", status: "Thinking" });
  },
);

it("detects supported runtimes without counting GUI helper processes or commands mentioning an agent", () => {
  const row = (command: string, args = command) => ({ pid: 10, parentPid: 1, command, args });
  expect(monitorAgent(row("agy"))).toBe("antigravity");
  expect(
    monitorAgent(
      row("language_server", "/app/antigravity/bin/language_server --app_data_dir antigravity"),
    ),
  ).toBe("antigravity");
  expect(monitorAgent(row("language_server", "/usr/bin/language_server"))).toBeNull();
  expect(monitorAgent(row("opencode"))).toBe("opencode");
  expect(monitorAgent(row("opencode2"))).toBe("opencode");
  expect(monitorAgent(row("opencode2.exe", "opencode2.exe serve --service"))).toBeNull();
  expect(monitorAgent(row("opencode", "opencode --log-level debug serve"))).toBeNull();
  expect(monitorAgent(row("node", "node /tools/bin/opencode2 serve --service"))).toBeNull();
  expect(monitorAgent(row("bun", "bun /tools/bin/opencode2 serve"))).toBeNull();
  expect(monitorAgent(row("opencode2", 'opencode2 run "serve --service"'))).toBe("opencode");
  expect(
    monitorAgent({
      ...row("opencode2.exe"),
      argv: ["C:\\tools\\opencode2.exe", "serve", "--service"],
    }),
  ).toBeNull();
  expect(monitorAgent(row("node", "node /tools/bin/opencode2"))).toBe("opencode");
  expect(monitorAgent(row("node", "node /tools/opencode-ai/bin/opencode"))).toBe("opencode");
  expect(monitorAgent(row("zcode-cli"))).toBe("zcode");
  expect(monitorAgent(row("node", "node /tools/zcode.cjs"))).toBe("zcode");
  expect(monitorAgent(row("zcode", "/opt/ZCode/zcode --type=renderer"))).toBeNull();
  expect(monitorAgent(row("sh", "sh -c echo opencode"))).toBeNull();
  expect(monitorAgent(row("node", "node other.js opencode"))).toBeNull();
});
