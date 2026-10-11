import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { readGrok } from "../src/main/monitorGrok.js";
import { monitorAgent } from "../src/main/monitorCollector.js";
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
it("recognizes Grok's native and versioned binary names", () => {
  const row = { pid: 1, parentPid: 0, command: "grok" };
  expect(monitorAgent(row)).toBe("grok");
  expect(monitorAgent({ ...row, command: "grok-1.0.50" })).toBe("grok");
  expect(monitorAgent({ ...row, command: "sh", args: "echo grok" })).toBeNull();
});
it("reads Grok state transitions without returning prompts, tool inputs or aggregated context", async () => {
  const home = await mkdtemp(join(tmpdir(), "monitor-grok-"));
  dirs.push(home);
  const directory = join(home, ".grok/sessions", encodeURIComponent("/repo"), "session-one");
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "summary.json"),
    JSON.stringify({
      info: { id: "session-one", cwd: "/repo" },
      current_model_id: "grok-test",
      last_active_at: "2026-10-11T10:00:00Z",
      session_summary: "PRIVATE SUMMARY",
    }),
  );
  const updates: unknown[] = [];
  const add = async (update: unknown) => {
    updates.push({ timestamp: 1791712800, params: { sessionId: "session-one", update } });
    await writeFile(
      join(directory, "updates.jsonl"),
      updates.map((value) => JSON.stringify(value)).join("\n") + "\n",
    );
    return readGrok("/repo", 1, [], home);
  };
  expect(
    (await add({ sessionUpdate: "user_message_chunk", content: "PRIVATE PROMPT" })).state?.status,
  ).toBe("Thinking");
  let result = await add({
    sessionUpdate: "tool_call",
    toolCallId: "tool-one",
    title: "PRIVATE COMMAND",
    rawInput: { command: "PRIVATE COMMAND" },
    _meta: { "x.ai/tool": { name: "run_terminal_command" } },
  });
  expect(result.state).toMatchObject({
    status: "Executing",
    model: "grok-test",
    currentTool: { name: "run_terminal_command" },
    tokenTotalsAvailable: false,
    contextTokens: null,
  });
  expect(JSON.stringify(result)).not.toContain("PRIVATE");
  expect(
    (
      await add({
        sessionUpdate: "tool_call_update",
        toolCallId: "tool-one",
        status: "completed",
        rawOutput: "PRIVATE OUTPUT",
      })
    ).state?.status,
  ).toBe("Thinking");
  result = await add({
    sessionUpdate: "turn_completed",
    stop_reason: "end_turn",
    usage: { inputTokens: 100000 },
  });
  expect(result.state).toMatchObject({ status: "Waiting", currentTool: null, contextTokens: null });
  expect((await readGrok("/repo", 2, [], home)).state).toBeNull();
  expect((await readGrok("/repo", 2, [join(directory, "updates.jsonl")], home)).verified).toBe(
    true,
  );
  expect((await readGrok("/different", 1, [], home)).state).toBeNull();
});
