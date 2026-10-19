import { mkdtemp, mkdir, writeFile, readFile, rm, appendFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { parseHistoryLog, SessionHistory } from "../src/main/sessionHistory.js";
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
const sid = "11111111-2222-4333-8444-555555555555";
const lines = (...entries: unknown[]) =>
  entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n";
const meta = { type: "session_meta", payload: { id: sid, cwd: "/project" } };
const message = (role: string, text: string) => ({
  type: "response_item",
  payload: {
    type: "message",
    role,
    content: [{ type: role === "user" ? "input_text" : "output_text", text }],
  },
});
describe("Session history", () => {
  it("extracts requests and responses without tools, hidden reasoning or injected context", () => {
    const parsed = parseHistoryLog(
      lines(
        meta,
        message("user", "# AGENTS.md instructions\nCONTEXT"),
        message("user", "Fix the tabs"),
        {
          type: "response_item",
          payload: { type: "function_call_output", output: "PRIVATE TOOL" },
        },
        message("assistant", "Fixed"),
      ),
      "codex",
    );
    expect(parsed).toMatchObject({
      sessionId: sid,
      cwd: "/project",
      title: "Fix the tabs",
      messages: [
        { role: "user", text: "Fix the tabs" },
        { role: "assistant", text: "Fixed" },
      ],
    });
    expect(JSON.stringify(parsed)).not.toContain("PRIVATE TOOL");
  });
  it("ignores Claude tool results and sidechains while preserving custom titles", () => {
    const parsed = parseHistoryLog(
      lines(
        {
          type: "user",
          sessionId: sid,
          cwd: "/project",
          message: { role: "user", content: "Implement history" },
        },
        { type: "user", isSidechain: true, message: { role: "user", content: "subagent request" } },
        {
          type: "user",
          message: { role: "user", content: [{ type: "tool_result", content: "PRIVATE TOOL" }] },
        },
        {
          type: "assistant",
          uuid: "a",
          message: {
            role: "assistant",
            content: [
              { type: "thinking", thinking: "PRIVATE REASONING" },
              { type: "text", text: "Done" },
            ],
          },
        },
        { type: "custom-title", customTitle: "Session library" },
      ),
      "claude",
    );
    expect(parsed.title).toBe("Session library");
    expect(parsed.messages).toHaveLength(2);
    expect(parsed.messages[1]?.text).toBe("Done");
  });
  it("discovers exited sessions, bounds large logs, refreshes and validates resume ownership", async () => {
    const root = await mkdtemp(join(tmpdir(), "vintage-history-"));
    dirs.push(root);
    const dir = join(root, "sessions", "2026", "10", "19");
    await mkdir(dir, { recursive: true });
    const path = join(dir, "rollout-test.jsonl");
    await writeFile(
      path,
      lines(
        meta,
        message("user", "Old request"),
        { padding: "x".repeat(2200000) },
        message("assistant", "Latest answer"),
      ),
    );
    const history = new SessionHistory([{ agent: "codex", path: root }]);
    const list = await history.list();
    expect(list.sessions).toHaveLength(1);
    const session = list.sessions[0]!;
    expect(session.title).toBe("Old request");
    const detail = await history.detail(session.key);
    expect(detail.truncated).toBe(true);
    expect(detail.messages.map((entry) => entry.text)).toEqual(["Old request", "Latest answer"]);
    expect(() => history.resume(session.key, "/other-project")).toThrow(
      "Open this session's project",
    );
    expect(() => history.resume("../../etc/passwd", "/project")).toThrow();
    expect(history.resume(session.key, "/project")).toMatchObject({
      file: "codex",
      args: ["resume", sid],
      env: { CODEX_HOME: root },
    });
    await expect(history.detail("../../etc/passwd")).rejects.toThrow("no longer available");
    await appendFile(path, lines(message("assistant", "New answer")));
    await history.list(true);
    expect((await history.detail(session.key)).messages.at(-1)?.text).toBe("New answer");
  });
  it("does not duplicate head and tail messages for medium sized logs", async () => {
    const root = await mkdtemp(join(tmpdir(), "vintage-history-"));
    dirs.push(root);
    await mkdir(join(root, "sessions"));
    await writeFile(
      join(root, "sessions", "rollout-medium.jsonl"),
      lines(
        meta,
        message("user", "Request"),
        { padding: "x".repeat(150000) },
        message("assistant", "Answer"),
      ),
    );
    const history = new SessionHistory([{ agent: "codex", path: root }]);
    const session = (await history.list()).sessions[0]!;
    expect((await history.detail(session.key)).messages).toHaveLength(2);
  });
});

it.each([false, true])(
  "preserves Claude's explicit config-directory state (%s) on resume",
  async (configDirExplicit) => {
    const root = await mkdtemp(join(tmpdir(), "vintage-claude-history-"));
    dirs.push(root);
    const dir = join(root, "projects", "project");
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, `${sid}.jsonl`),
      lines({
        type: "user",
        sessionId: sid,
        cwd: "/project",
        message: { role: "user", content: "Continue the work" },
      }),
    );
    const history = new SessionHistory([{ agent: "claude", path: root, configDirExplicit }]);
    const session = (await history.list()).sessions[0]!;
    const launch = history.resume(session.key, "/project");
    expect(launch.file).toBe("claude");
    expect(launch.args).toEqual(["--resume", sid]);
    expect(launch.env).toEqual(configDirExplicit ? { CLAUDE_CONFIG_DIR: root } : {});
  },
);

it("assembles Grok chat chunks without displaying reasoning or tools", async () => {
  const root = await mkdtemp(join(tmpdir(), "vintage-grok-history-"));
  dirs.push(root);
  const directory = join(root, "sessions", encodeURIComponent("/project"), sid);
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "summary.json"),
    JSON.stringify({ info: { id: sid, cwd: "/project" }, generated_title: "Grok saved title" }),
  );
  const event = (sessionUpdate: string, text: string) => ({
    params: { sessionId: sid, update: { sessionUpdate, content: { type: "text", text } } },
  });
  await writeFile(
    join(directory, "updates.jsonl"),
    lines(
      event("user_message_chunk", "Fix "),
      event("user_message_chunk", "the tabs"),
      event("agent_thought_chunk", "PRIVATE REASONING"),
      event("agent_message_chunk", "Done "),
      event("agent_message_chunk", "now"),
      event("tool_call", "PRIVATE TOOL"),
    ),
  );
  const history = new SessionHistory([{ agent: "grok", path: root }]);
  const session = (await history.list()).sessions[0]!;
  expect(session).toMatchObject({
    agent: "grok",
    title: "Grok saved title",
    cwd: "/project",
    preview: "Fix the tabs",
  });
  expect((await history.detail(session.key)).messages).toEqual([
    { role: "user", text: "Fix the tabs" },
    { role: "assistant", text: "Done now" },
  ]);
  expect(history.resume(session.key, "/project")).toEqual({
    file: "grok",
    args: ["--resume", sid],
    env: {},
  });
});

it("reads Antigravity titles from its read-only index, filters subagents and only resumes CLI histories", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const { pathToFileURL } = await import("node:url");
  const root = await mkdtemp(join(tmpdir(), "vintage-ag-history-"));
  dirs.push(root);
  const cwd = join(root, "project");
  const directory = join(root, "brain", sid, ".system_generated", "logs");
  await mkdir(directory, { recursive: true });
  const db = new DatabaseSync(join(root, "conversation_summaries.db"));
  db.exec(
    "CREATE TABLE conversation_summaries(conversation_id TEXT,title TEXT,preview TEXT,workspace_uris TEXT,last_modified_time TEXT,parent_conversation_id TEXT)",
  );
  const insert = db.prepare("INSERT INTO conversation_summaries VALUES(?,?,?,?,?,?)");
  insert.run(
    sid,
    "Antigravity saved title",
    "Saved preview",
    JSON.stringify([pathToFileURL(cwd).href]),
    "2026-10-19T12:00:00Z",
    "",
  );
  insert.run("subagent", "Child", "", "[]", "2026-10-19T12:00:00Z", sid);
  db.close();
  await writeFile(
    join(directory, "transcript.jsonl"),
    lines(
      { step_index: 0, type: "USER_INPUT", content: "Build the feature" },
      {
        step_index: 1,
        type: "PLANNER_RESPONSE",
        thinking: "PRIVATE REASONING",
        tool_calls: [{ name: "run", args: "PRIVATE TOOL" }],
      },
      { step_index: 2, type: "VIEW_FILE", content: "PRIVATE FILE" },
      { step_index: 3, type: "PLANNER_RESPONSE", content: "Draft" },
      { step_index: 3, type: "PLANNER_RESPONSE", content: "Final response" },
    ),
  );
  const history = new SessionHistory([{ agent: "antigravity", path: root, resumeSupported: true }]);
  const list = await history.list();
  expect(list.sessions).toHaveLength(1);
  const session = list.sessions[0]!;
  expect(session).toMatchObject({
    agent: "antigravity",
    title: "Antigravity saved title",
    cwd,
  });
  expect((await history.detail(session.key)).messages).toEqual([
    { role: "user", text: "Build the feature" },
    { role: "assistant", text: "Final response" },
  ]);
  expect(history.resume(session.key, cwd)).toEqual({
    file: "agy",
    args: ["--conversation", sid],
    env: {},
  });
  const ide = new SessionHistory([{ agent: "antigravity", path: root }]);
  expect((await ide.list()).sessions[0]?.canResume).toBe(false);
});

it("keeps Grok metadata visible when its transcript is absent", async () => {
  const root = await mkdtemp(join(tmpdir(), "vintage-missing-grok-"));
  dirs.push(root);
  const directory = join(root, "sessions", "project", sid);
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "summary.json"),
    JSON.stringify({ info: { id: sid, cwd: "/project" }, generated_title: "Retained session" }),
  );
  const history = new SessionHistory([{ agent: "grok", path: root }]);
  const session = (await history.list()).sessions[0]!;
  expect(session.title).toBe("Retained session");
  expect((await history.detail(session.key)).messages).toEqual([]);
});

it.each(["codex", "claude", "grok", "antigravity"] as const)(
  "allows %s resume on Windows and verifies workspace ownership case insensitively",
  async (agent) => {
    const root = await mkdtemp(join(tmpdir(), "vintage-windows-history-"));
    dirs.push(root);
    const cwd = "C:\\Users\\Test\\Project";
    if (agent === "antigravity") {
      const { DatabaseSync } = await import("node:sqlite");
      const db = new DatabaseSync(join(root, "conversation_summaries.db"));
      db.exec(
        "CREATE TABLE conversation_summaries(conversation_id TEXT,title TEXT,preview TEXT,workspace_uris TEXT,last_modified_time TEXT,parent_conversation_id TEXT)",
      );
      db.prepare("INSERT INTO conversation_summaries VALUES(?,?,?,?,?,?)").run(
        sid,
        "Windows session",
        "",
        JSON.stringify(["file:///C:/Users/Test/Project"]),
        "2026-10-19T12:00:00Z",
        "",
      );
      db.close();
    } else if (agent === "grok") {
      const dir = join(root, "sessions", "project", sid);
      await mkdir(dir, { recursive: true });
      await writeFile(
        join(dir, "summary.json"),
        JSON.stringify({ info: { id: sid, cwd }, generated_title: "Windows session" }),
      );
    } else {
      const dir = join(root, agent === "codex" ? "sessions" : "projects");
      await mkdir(dir, { recursive: true });
      await writeFile(
        join(dir, "windows.jsonl"),
        agent === "codex"
          ? lines(
              { type: "session_meta", payload: { id: sid, cwd } },
              message("user", "Windows session"),
            )
          : lines({
              type: "user",
              sessionId: sid,
              cwd,
              message: { role: "user", content: "Windows session" },
            }),
      );
    }
    const history = new SessionHistory(
      [{ agent, path: root, resumeSupported: true, configDirExplicit: false }],
      "win32",
    );
    const session = (await history.list()).sessions[0]!;
    expect(session.canResume).toBe(true);
    expect(history.resume(session.key, "c:/users/test/project/").args).toContain(sid);
    expect(() => history.resume(session.key, "C:\\Users\\Test\\Other")).toThrow(
      "Open this session's project",
    );
  },
);

it("builds bounded analysis evidence without hidden reasoning, sidechains or modifying logs", async () => {
  const root = await mkdtemp(join(tmpdir(), "vintage-analysis-source-"));
  dirs.push(root);
  await mkdir(join(root, "projects"));
  const path = join(root, "projects", "session.jsonl");
  const text = lines(
    {
      type: "user",
      sessionId: sid,
      cwd: "/project",
      message: { role: "user", content: "Fix tests" },
    },
    {
      type: "assistant",
      message: {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "HIDDEN_REASONING" },
          { type: "tool_use", id: "call1", name: "Bash", input: { command: "pnpm test" } },
        ],
      },
    },
    {
      type: "user",
      message: {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "call1", content: "Tests passed", is_error: false },
        ],
      },
    },
    {
      type: "user",
      isSidechain: true,
      message: { role: "user", content: [{ type: "tool_result", content: "UNRELATED_SIDECHAIN" }] },
    },
  );
  await writeFile(path, text);
  const history = new SessionHistory([{ agent: "claude", path: root }]);
  const session = (await history.list()).sessions[0]!;
  const source = await history.analysisSource(session.key);
  expect(source.detail.toolEvidence.join("\n")).toContain("Tests passed");
  expect(source.detail.toolEvidence.join("\n")).toContain("pnpm test");
  expect(JSON.stringify(source)).not.toContain("HIDDEN_REASONING");
  expect(JSON.stringify(source)).not.toContain("UNRELATED_SIDECHAIN");
  expect(await readFile(path, "utf8")).toBe(text);
  await appendFile(path, lines({ type: "user", message: { role: "user", content: "Continue" } }));
  expect((await history.analysisSource(session.key)).version).not.toBe(source.version);
});

it("hides Codex Guardian review sessions by metadata while preserving ordinary sessions with the same title", async () => {
  const root = await mkdtemp(join(tmpdir(), "vintage-guardian-history-"));
  dirs.push(root);
  await mkdir(join(root, "sessions"));
  const variants = [
    { id: sid, thread_source: "guardian_review" },
    { id: "22222222-2222-4333-8444-555555555555", source: { subagent: { other: "guardian" } } },
    { id: "33333333-2222-4333-8444-555555555555", source: "cli" },
  ];
  for (const metadata of variants) {
    await writeFile(
      join(root, "sessions", `${metadata.id}.jsonl`),
      lines(
        { type: "session_meta", payload: { ...metadata, cwd: "/project" } },
        message("user", "Guardian review"),
      ),
    );
  }
  const history = new SessionHistory([{ agent: "codex", path: root }]);
  const result = await history.list();
  expect(result.sessions.map((session) => session.sessionId)).toEqual([variants[2]!.id]);
  expect(result.sessions[0]!.title).toBe("Guardian review");
  for (const metadata of variants)
    expect(await readFile(join(root, "sessions", `${metadata.id}.jsonl`), "utf8")).toContain(
      metadata.id,
    );
});
