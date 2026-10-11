import { mkdtemp, writeFile, appendFile, rm, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MonitorTranscript } from "../src/main/monitorTranscript.js";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
const feed = (reader: MonitorTranscript, record: unknown) =>
  reader.feed(Buffer.from(`${JSON.stringify(record)}\n`));
const codex = (type: string, payload: unknown) => ({
  type,
  timestamp: "2026-10-11T10:00:00Z",
  payload,
});

describe("Monitor transcripts", () => {
  it("tracks an interactive Codex turn, parallel tools and input waits without treating turn completion as process exit", () => {
    const reader = new MonitorTranscript("codex");
    feed(reader, codex("session_meta", { id: "session", cwd: "/workspace" }));
    feed(reader, codex("event_msg", { type: "task_started" }));
    expect(reader.state.status).toBe("Thinking");
    feed(
      reader,
      codex("response_item", {
        type: "function_call",
        call_id: "a",
        name: "Read",
        arguments: JSON.stringify({ file_path: "/workspace/file", content: "SECRET" }),
      }),
    );
    feed(
      reader,
      codex("response_item", {
        type: "custom_tool_call",
        call_id: "b",
        name: "exec",
        input: "SECRET COMMAND",
      }),
    );
    expect(reader.state.status).toBe("Executing");
    feed(
      reader,
      codex("response_item", {
        type: "function_call_output",
        call_id: "a",
        output: "SECRET OUTPUT",
      }),
    );
    expect(reader.state.currentTool?.id).toBe("b");
    feed(reader, codex("response_item", { type: "custom_tool_call_output", call_id: "b" }));
    expect(reader.state.status).toBe("Thinking");
    feed(
      reader,
      codex("response_item", {
        type: "function_call",
        call_id: "c",
        name: "functions.request_user_input",
        arguments: "{}",
      }),
    );
    expect(reader.state.status).toBe("Waiting");
    feed(reader, codex("event_msg", { type: "task_complete" }));
    expect(reader.state.status).toBe("Waiting");
    expect(reader.state.currentTool).toBeNull();
    expect(JSON.stringify(reader.state)).not.toContain("SECRET");
    feed(reader, codex("event_msg", { type: "task_started" }));
    expect(reader.state.status).toBe("Thinking");
  });

  it("uses Codex reported context capacity and avoids counting cached input twice", () => {
    const reader = new MonitorTranscript("codex");
    feed(
      reader,
      codex("event_msg", {
        type: "token_count",
        info: {
          total_token_usage: { input_tokens: 500, output_tokens: 50, cached_input_tokens: 400 },
          last_token_usage: { input_tokens: 300 },
          model_context_window: 1000,
        },
      }),
    );
    expect(reader.state).toMatchObject({
      inputTokens: 100,
      outputTokens: 50,
      cacheTokens: 400,
      contextTokens: 300,
      contextWindow: 1000,
      contextEstimated: false,
    });
    feed(reader, codex("event_msg", { type: "token_count", info: null }));
    expect(reader.state.inputTokens).toBe(100);
  });

  it("supports new Codex item completion events and ignores progress messages as completion", () => {
    const reader = new MonitorTranscript("codex");
    feed(
      reader,
      codex("event_msg", {
        type: "item_completed",
        item: { type: "UserMessage", content: [{ text: "SECRET" }] },
      }),
    );
    feed(
      reader,
      codex("event_msg", {
        type: "item_completed",
        item: { type: "AgentMessage", phase: "commentary" },
      }),
    );
    expect(reader.state.status).toBe("Thinking");
    feed(
      reader,
      codex("event_msg", {
        type: "item_completed",
        item: {
          type: "CommandExecution",
          id: "exec",
          started_at_ms: 1000,
          completed_at_ms: 2000,
          argv: ["SECRET"],
        },
      }),
    );
    expect(reader.state.tools[0]?.durationMs).toBe(1000);
    feed(
      reader,
      codex("event_msg", {
        type: "item_completed",
        item: { type: "AgentMessage", phase: "final_answer" },
      }),
    );
    expect(reader.state.status).toBe("Waiting");
    expect(JSON.stringify(reader.state)).not.toContain("SECRET");
  });

  it("tracks Claude pending tools, does not interpret tool results as user prompts, and deduplicates usage by message ID", () => {
    const reader = new MonitorTranscript("claude");
    feed(reader, { type: "user", message: { content: "PRIVATE PROMPT" } });
    expect(reader.state.status).toBe("Thinking");
    const assistant = {
      type: "assistant",
      message: {
        id: "m1",
        model: "claude-sonnet-4-6",
        stop_reason: "tool_use",
        usage: {
          input_tokens: 100,
          output_tokens: 20,
          cache_read_input_tokens: 300,
          cache_creation_input_tokens: 50,
        },
        content: [
          {
            type: "tool_use",
            id: "tool",
            name: "Read",
            input: { file_path: "/file", content: "SECRET" },
          },
        ],
      },
    };
    feed(reader, assistant);
    feed(reader, assistant);
    expect(reader.state).toMatchObject({
      status: "Executing",
      inputTokens: 100,
      outputTokens: 20,
      cacheTokens: 350,
      contextTokens: 400,
      contextEstimated: true,
    });
    feed(reader, {
      type: "user",
      message: { content: [{ type: "tool_result", tool_use_id: "tool", content: "SECRET" }] },
    });
    expect(reader.state.status).toBe("Thinking");
    feed(reader, {
      type: "assistant",
      message: { stop_reason: "end_turn", content: [{ type: "text", text: "SECRET" }] },
    });
    expect(reader.state.status).toBe("Waiting");
    expect(JSON.stringify(reader.state)).not.toMatch(/SECRET|PRIVATE PROMPT/u);
  });

  it("buffers partial UTF-8 JSONL and ignores malformed records", () => {
    const reader = new MonitorTranscript("codex");
    const line = Buffer.from(
      JSON.stringify(codex("session_meta", { id: "session", cwd: "/日本語" })) + "\n",
    );
    const split = line.indexOf(Buffer.from("日")) + 1;
    reader.feed(line.subarray(0, split));
    expect(reader.state.sessionId).toBeNull();
    reader.feed(line.subarray(split));
    expect(reader.state.cwd).toBe("/日本語");
    reader.feed(Buffer.from('bad json\n{"unknown":true}\n'));
    expect(reader.state.sessionId).toBe("session");
  });

  it("reads only appended bytes and resets state on truncation or file replacement", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vintage-monitor-"));
    dirs.push(dir);
    const path = join(dir, "rollout.jsonl");
    const reader = new MonitorTranscript("codex");
    await writeFile(
      path,
      JSON.stringify(codex("session_meta", { id: "first", cwd: "/first" })) + "\n",
    );
    await reader.read(path);
    await appendFile(path, JSON.stringify(codex("event_msg", { type: "task_started" })) + "\n");
    await reader.read(path);
    expect(reader.state).toMatchObject({ sessionId: "first", status: "Thinking" });
    await writeFile(path, "{}\n");
    await reader.read(path);
    expect(reader.state.sessionId).toBeNull();
    await writeFile(
      join(dir, "replacement"),
      JSON.stringify(codex("session_meta", { id: "second" })) + "\n",
    );
    await rename(join(dir, "replacement"), path);
    await reader.read(path);
    expect(reader.state.sessionId).toBe("second");
  });
});

it("skips an oversized line and resumes at the next valid JSONL record", () => {
  const reader = new MonitorTranscript("codex");
  reader.feed(Buffer.alloc(2 * 1024 * 1024 + 1, 97));
  reader.feed(Buffer.from("remaining invalid line\n"));
  feed(reader, codex("session_meta", { id: "after-large-line", cwd: "/repo" }));
  expect(reader.state.sessionId).toBe("after-large-line");
});
