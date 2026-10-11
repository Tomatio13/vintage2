import { mkdtemp, mkdir, writeFile, appendFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { MonitorTranscript } from "../src/main/monitorTranscript.js";
import { GrokUpdateReader, readGrok } from "../src/main/monitorGrok.js";
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

it("preserves a pending Grok tool across a log larger than the tail limit", async () => {
  const home = await mkdtemp(join(tmpdir(), "monitor-grok-long-"));
  dirs.push(home);
  const directory = join(home, ".grok/sessions", encodeURIComponent("/repo"), "long");
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "summary.json"),
    JSON.stringify({ info: { id: "long", cwd: "/repo" } }),
  );
  const event = (update: unknown) =>
    JSON.stringify({ params: { sessionId: "long", update } }) + "\n";
  const start = event({
    sessionUpdate: "tool_call",
    toolCallId: "tool",
    _meta: { "x.ai/tool": { name: "Bash" } },
  });
  const progress = event({ sessionUpdate: "agent_message_chunk", content: "x".repeat(1100000) });
  await writeFile(join(directory, "updates.jsonl"), start + progress);
  expect((await readGrok("/repo", 1, [], home)).state).toMatchObject({
    status: "Executing",
    currentTool: { id: "tool" },
  });
  await writeFile(
    join(directory, "updates.jsonl"),
    start + event({ sessionUpdate: "agent_message_chunk", content: "x".repeat(2200000) }),
  );
  expect((await readGrok("/repo", 1, [], home)).state?.status).toBe("Unknown");
  await writeFile(
    join(directory, "updates.jsonl"),
    start + progress + event({ sessionUpdate: "turn_completed", stop_reason: "end_turn" }),
  );
  expect((await readGrok("/repo", 1, [], home)).state).toMatchObject({
    status: "Waiting",
    currentTool: null,
  });
});

it("reuses unchanged Grok logs, parses only appended bytes, and resets on replacement or rewrite", async () => {
  const home = await mkdtemp(join(tmpdir(), "grok-incremental-"));
  dirs.push(home);
  const path = join(home, "updates.jsonl");
  const seed = new MonitorTranscript("grok").state;
  seed.sessionId = "session";
  seed.status = "Waiting";
  const event = (update: unknown) =>
    JSON.stringify({ params: { sessionId: "session", update } }) + "\n";
  const start = event({
    sessionUpdate: "tool_call",
    toolCallId: "tool",
    _meta: { "x.ai/tool": { name: "Bash" } },
  });
  const initial =
    start + event({ sessionUpdate: "agent_message_chunk", content: "x".repeat(1100000) });
  await writeFile(path, initial);
  const reader = new GrokUpdateReader();
  expect((await reader.read(path, seed)).status).toBe("Executing");
  const firstBytes = reader.bytesProcessed;
  const unchanged = await reader.read(path, seed);
  unchanged.status = "Error";
  expect(reader.bytesProcessed).toBe(firstBytes);
  expect((await reader.read(path, seed)).status).toBe("Executing");
  const finish = event({ sessionUpdate: "turn_completed", stop_reason: "end_turn" });
  const cut = Math.floor(finish.length / 2);
  await appendFile(path, finish.slice(0, cut));
  expect((await reader.read(path, seed)).status).toBe("Executing");
  await appendFile(path, finish.slice(cut));
  expect((await reader.read(path, seed)).status).toBe("Waiting");
  expect(reader.bytesProcessed - firstBytes).toBe(Buffer.byteLength(finish));
  await writeFile(path, start);
  expect((await reader.read(path, seed)).status).toBe("Executing");
  await writeFile(join(home, "new-log"), finish);
  await rename(join(home, "new-log"), path);
  expect((await reader.read(path, seed)).status).toBe("Waiting");
  await writeFile(path, start);
  expect((await reader.read(path, seed)).currentTool?.name).toBe("Bash");
  const rewritten = start.replace('"Bash"', '"Read"');
  expect(Buffer.byteLength(rewritten)).toBe(Buffer.byteLength(start));
  await writeFile(path, rewritten);
  expect((await reader.read(path, seed)).currentTool?.name).toBe("Read");
  await writeFile(
    path,
    start + event({ sessionUpdate: "agent_message_chunk", content: "growing rewrite" }),
  );
  expect((await reader.read(path, seed)).currentTool?.name).toBe("Bash");
});

it("uses the latest reported Grok model consistently across refresh, append and rebuild", async () => {
  const home = await mkdtemp(join(tmpdir(), "grok-model-"));
  dirs.push(home);
  const path = join(home, "updates.jsonl");
  const seed = new MonitorTranscript("grok").state;
  seed.sessionId = "model-session";
  seed.model = "summary-model";
  const event = (model?: string) =>
    JSON.stringify({
      params: {
        sessionId: seed.sessionId,
        update: {
          sessionUpdate: "agent_message_chunk",
          ...(model ? { _meta: { modelId: model } } : {}),
        },
      },
    }) + "\n";
  const reader = new GrokUpdateReader();
  await writeFile(path, event());
  expect((await reader.read(path, seed)).model).toBe("summary-model");
  seed.model = "updated-summary";
  expect((await reader.read(path, seed)).model).toBe("updated-summary");
  await appendFile(path, event("reported-model"));
  expect((await reader.read(path, seed)).model).toBe("reported-model");
  seed.model = "stale-summary";
  expect((await reader.read(path, seed)).model).toBe("reported-model");
  await appendFile(path, event());
  expect((await reader.read(path, seed)).model).toBe("reported-model");
  await appendFile(path, event("next-model"));
  expect((await reader.read(path, seed)).model).toBe("next-model");
  await writeFile(path, event("reported-model"));
  expect((await reader.read(path, seed)).model).toBe("reported-model");
  await writeFile(path, event());
  expect((await reader.read(path, seed)).model).toBe("stale-summary");
});
