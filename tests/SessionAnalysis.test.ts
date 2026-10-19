import {
  sessionAnalysisProcesses,
  stopSessionAnalysisProcesses,
} from "../src/main/sessionAnalysisProcesses.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  analysisInput,
  parseAnalysis,
  parseAnalysisSettings,
  runAnalysisCommand,
  SessionAnalysisManager,
} from "../src/main/sessionAnalysis.js";
import type { SessionHistoryDetail } from "../src/shared/sessionHistory.js";
const dirs: string[] = [];
afterEach(async () => {
  await vi.waitFor(() => expect(sessionAnalysisProcesses.size).toBe(0));
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
async function directory() {
  const dir = await mkdtemp(join(tmpdir(), "vintage-analysis-test-"));
  dirs.push(dir);
  return dir;
}
const key = "a".repeat(64);
function fixture() {
  const detail: SessionHistoryDetail = {
    session: {
      key,
      agent: "claude",
      sessionId: "test",
      cwd: "/project",
      title: "Fix tabs",
      preview: "Fix tabs",
      updatedAt: 10,
      canResume: true,
    },
    messages: [
      { role: "user", text: "Fix tabs" },
      { role: "assistant", text: "Tests pass. Please verify on Windows." },
    ],
    truncated: false,
  };
  let version = "v1";
  const source = vi.fn(async () => ({ detail, version, updatedAt: detail.session.updatedAt }));
  const analysis = { status: "needs_user", summary: "Tests pass", nextAction: "Verify on Windows" };
  const run = vi.fn(async (_file: string, args: string[]) => {
    if (args[0] === "--version") return "fixture 1.0";
    if (args[0] === "login") return "";
    if (args[0] === "auth") return JSON.stringify({ loggedIn: true });
    if (args[0] === "exec") {
      await writeFile(args[args.indexOf("--output-last-message") + 1]!, JSON.stringify(analysis));
      return "";
    }
    return JSON.stringify({ structured_output: analysis, is_error: false });
  });
  return {
    detail,
    source,
    run,
    analysis,
    change() {
      version = "v2";
      detail.session.updatedAt = 20;
    },
  };
}
describe("Session analysis", () => {
  it("persists results separately, reuses unchanged input and refreshes changed conversations", async () => {
    const f = fixture(),
      dir = await directory();
    const manager = new SessionAnalysisManager(dir, f.source, f.run);
    const first = await manager.analyze(key);
    expect(first).toMatchObject({ ...f.analysis, stale: false, cli: "codex" });
    expect(await manager.analyze(key)).toEqual(first);
    expect(f.run.mock.calls.filter(([, args]) => args[0] === "exec")).toHaveLength(1);
    const restored = new SessionAnalysisManager(dir, f.source, f.run);
    expect(restored.get(key, 10)).toEqual(first);
    f.change();
    expect(restored.get(key, 20)?.stale).toBe(true);
    expect((await restored.analyze(key)).sourceUpdatedAt).toBe(20);
    expect(f.run.mock.calls.filter(([, args]) => args[0] === "exec")).toHaveLength(2);
    await restored.analyze(key, true);
    expect(f.run.mock.calls.filter(([, args]) => args[0] === "exec")).toHaveLength(3);
    expect(
      JSON.parse(await readFile(join(dir, "session-analysis.json"), "utf8")).records[key],
    ).toBeTruthy();
  });
  it("marks a result stale if new activity arrives during analysis and preserves old results on failure", async () => {
    const f = fixture(),
      manager = new SessionAnalysisManager(await directory(), f.source, f.run);
    const first = await manager.analyze(key);
    const original = f.run.getMockImplementation()!;
    f.run.mockImplementation(async (file, args) => {
      const value = await original(file, args);
      if (args[0] === "exec") f.change();
      return value;
    });
    expect((await manager.analyze(key, true)).stale).toBe(true);
    f.run.mockImplementation(async () => {
      throw new Error("offline");
    });
    await expect(manager.analyze(key, true)).rejects.toThrow();
    expect(manager.get(key, 20)?.summary).toBe(first.summary);
  });
  it("uses the chosen CLI independently of the source agent and invalidates cache on settings changes", async () => {
    const f = fixture(),
      manager = new SessionAnalysisManager(await directory(), f.source, f.run);
    await manager.analyze(key);
    manager.setSettings({ cli: "claude", executable: "/custom/claude", model: "haiku" });
    await manager.analyze(key);
    const call = f.run.mock.calls.find(
      ([file, args]) => file === "/custom/claude" && args[0] === "-p",
    );
    expect(call?.[1]).toEqual(
      expect.arrayContaining(["--tools", "", "--no-session-persistence", "--safe-mode", "haiku"]),
    );
    expect((await manager.probe(manager.getSettings())).authentication).toContain("authenticated");
  });
  it("rejects concurrent calls without launching another paid run", async () => {
    const f = fixture();
    let resume!: () => void;
    const gate = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const manager = new SessionAnalysisManager(
      await directory(),
      async () => {
        await gate;
        return f.source();
      },
      f.run,
    );
    const pending = manager.analyze(key);
    await expect(manager.analyze(key)).rejects.toThrow("Another session");
    resume();
    await pending;
  });
  it("limits conversation size and validates untrusted CLI output/settings", () => {
    const f = fixture();
    f.detail.messages = Array.from({ length: 100 }, () => ({
      role: "user",
      text: "x".repeat(24000),
    }));
    const input = JSON.parse(analysisInput(f.detail));
    expect(input.messages).toHaveLength(12);
    expect(input.incompleteHistory).toBe(true);
    expect(JSON.stringify(input).length).toBeLessThan(40000);
    expect(() => parseAnalysis({ status: "complete", summary: "", nextAction: "" })).toThrow();
    expect(() => parseAnalysis({ status: "__proto__", summary: "ok", nextAction: "" })).toThrow();
    expect(() => parseAnalysisSettings({ cli: "bash", executable: "", model: "" })).toThrow();
    expect(() =>
      parseAnalysisSettings({ cli: "codex", executable: "codex --yolo", model: "" }),
    ).toThrow();
  });
  it("pipes data without shell interpolation and terminates timed out processes", async () => {
    const input = "日本語 $(touch /tmp/should-not-exist) `echo hello`";
    expect(
      await runAnalysisCommand(
        process.execPath,
        [
          "-e",
          "process.stdin.setEncoding('utf8'); process.stdin.on('data',s=>process.stdout.write(s))",
        ],
        await directory(),
        input,
      ),
    ).toBe(input);
    await expect(
      runAnalysisCommand(
        process.execPath,
        ["-e", "setInterval(()=>{},1000)"],
        await directory(),
        "",
        100,
      ),
    ).rejects.toThrow("timed out");
  });
  it("stops active analysis workers when the application exits", async () => {
    const pending = runAnalysisCommand(
      process.execPath,
      ["-e", "setInterval(()=>{},1000)"],
      await directory(),
    );
    const rejection = expect(pending).rejects.toThrow("Analysis CLI exited");
    expect(sessionAnalysisProcesses.size).toBeGreaterThan(0);
    stopSessionAnalysisProcesses();
    await rejection;
    expect(sessionAnalysisProcesses.size).toBe(0);
  });
});
