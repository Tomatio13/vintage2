import { DatabaseSync } from "node:sqlite";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  readLocalAgent,
  localDatabaseState,
  antigravityStatus,
} from "../src/main/monitorLocalAgents.js";
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
async function fixture() {
  const home = await mkdtemp(join(tmpdir(), "monitor-extra-"));
  dirs.push(home);
  return home;
}
function sessionDb(path: string) {
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL;
CREATE TABLE session(id TEXT PRIMARY KEY,directory TEXT,parent_id TEXT,time_created INTEGER,time_updated INTEGER);
CREATE TABLE message(id TEXT PRIMARY KEY,session_id TEXT,time_created INTEGER,data TEXT);
CREATE TABLE part(id TEXT PRIMARY KEY,session_id TEXT,message_id TEXT,time_created INTEGER,data TEXT);
INSERT INTO session VALUES('one','/project',NULL,1000,10000);`);
  return db;
}
function message(db: DatabaseSync, value: unknown) {
  db.prepare("INSERT OR REPLACE INTO message VALUES('msg','one',10000,?)").run(
    JSON.stringify(value),
  );
}
describe("OpenCode and ZCode local databases", () => {
  it("reads WAL state transitions without leaking private bodies or confusing stale tools with activity", async () => {
    const home = await fixture();
    const base = join(home, ".local/share/opencode");
    await mkdir(base, { recursive: true });
    const db = sessionDb(join(base, "opencode.db"));
    try {
      message(db, {
        role: "assistant",
        modelID: "test-model",
        tokens: { input: 400, output: 20, cache: { read: 600 } },
        content: "PRIVATE PROMPT",
      });
      let result = await readLocalAgent("opencode", "/project", 1, [], home);
      expect(result.state).toMatchObject({
        status: "Thinking",
        model: "test-model",
        contextTokens: 1000,
      });
      db.prepare("INSERT INTO part VALUES('tool','one','msg',10001,?)").run(
        JSON.stringify({
          type: "tool",
          tool: "Bash",
          state: {
            status: "running",
            input: { command: "PRIVATE COMMAND" },
            output: "PRIVATE RESULT",
          },
        }),
      );
      result = await readLocalAgent("opencode", "/project", 1, [], home);
      expect(result.state).toMatchObject({
        status: "Executing",
        currentTool: { name: "Bash", path: null },
      });
      expect(JSON.stringify(result)).not.toContain("PRIVATE");
      message(db, {
        role: "assistant",
        modelID: "test-model",
        time: { completed: 11000 },
        finish: "stop",
        error: null,
        tokens: { input: 400, output: 20, cache: { read: 600 } },
      });
      result = await readLocalAgent("opencode", "/project", 1, [], home);
      expect(result.state?.status).toBe("Waiting");
      expect(result.state?.currentTool).toBeNull();
      expect((await readLocalAgent("opencode", "/elsewhere", 1, [], home)).state).toBeNull();
      expect((await readLocalAgent("opencode", "/project", 2, [], home)).state).toBeNull();
      expect(db.prepare("SELECT count(*) count FROM message").get()).toMatchObject({ count: 1 });
    } finally {
      db.close();
    }
  });
  it("uses ZCode's modelId casing and cache-inclusive input accounting", async () => {
    const home = await fixture();
    const base = join(home, ".zcode/cli/db");
    await mkdir(base, { recursive: true });
    const db = sessionDb(join(base, "db.sqlite"));
    try {
      message(db, {
        role: "assistant",
        modelId: "GLM-test",
        time: { completed: 11000 },
        finish: "stop",
        tokens: { input: 1000, output: 50, cache: { read: 600 } },
      });
      const result = await readLocalAgent("zcode", "/project", 1, [], home);
      expect(result.state).toMatchObject({
        model: "GLM-test",
        status: "Waiting",
        inputTokens: 400,
        cacheTokens: 600,
        contextTokens: 1000,
        contextWindow: null,
      });
    } finally {
      db.close();
    }
  });
  it("matches shared ZCode workers only when one session is active within an hour", async () => {
    const home = await fixture();
    const base = join(home, ".zcode/cli/db");
    await mkdir(base, { recursive: true });
    const db = sessionDb(join(base, "db.sqlite"));
    try {
      const now = Date.now();
      db.prepare("UPDATE session SET time_updated=? WHERE id='one'").run(now - 1000);
      db.prepare("INSERT INTO session VALUES('old','/project',NULL,1000,?)").run(now - 3_600_000);
      expect((await readLocalAgent("zcode", "/project", 2, [], home)).state?.sessionId).toBe("one");
      db.prepare("UPDATE session SET time_updated=? WHERE id='old'").run(now - 60_000);
      expect((await readLocalAgent("zcode", "/project", 2, [], home)).state).toBeNull();
      // OpenCode still requires a single owning process.
      expect(
        (await readLocalAgent("opencode", "/project", 2, [join(base, "opencode.db")], home)).state,
      ).toBeNull();
    } finally {
      db.close();
    }
  });
  it("uses the ZCode desktop task status to avoid reporting interrupted tools as running", async () => {
    const home = await fixture();
    const base = join(home, ".zcode/cli/db");
    await mkdir(base, { recursive: true });
    const db = sessionDb(join(base, "db.sqlite"));
    const indexDir = join(home, ".zcode/v2");
    await mkdir(indexDir, { recursive: true });
    const tasks = new DatabaseSync(join(indexDir, "tasks-index.sqlite"));
    try {
      tasks.exec(
        "CREATE TABLE tasks(task_id TEXT,workspace_path TEXT,task_status TEXT,deleted INTEGER,archived INTEGER);INSERT INTO tasks VALUES('one','/project','completed',0,0)",
      );
      message(db, { role: "assistant", modelId: "GLM-test", tokens: { input: 0, output: 0 } });
      db.prepare("INSERT INTO part VALUES('stale','one','msg',10001,?)").run(
        JSON.stringify({ type: "tool", tool: "Bash", state: { status: "running" } }),
      );
      expect((await readLocalAgent("zcode", "/project", 1, [], home)).state).toMatchObject({
        status: "Waiting",
        currentTool: null,
      });
    } finally {
      tasks.close();
      db.close();
    }
  });
  it("does not silently select between equally recent sessions", async () => {
    const home = await fixture();
    const base = join(home, ".local/share/opencode");
    await mkdir(base, { recursive: true });
    const db = sessionDb(join(base, "opencode.db"));
    try {
      db.exec("INSERT INTO session VALUES('two','/project',NULL,1000,10000)");
      expect((await readLocalAgent("opencode", "/project", 1, [], home)).state).toBeNull();
    } finally {
      db.close();
    }
  });
  it("reports missing databases without creating them", async () => {
    const home = await fixture();
    expect((await readLocalAgent("zcode", "/project", 1, [], home)).state).toBeNull();
  });
  it("keeps unknown model capacity unknown and detects errors", () => {
    expect(
      localDatabaseState("opencode", {}, { role: "assistant", error: 1 }, undefined, {}).status,
    ).toBe("Error");
    expect(localDatabaseState("zcode", {}, undefined, undefined, {}).contextWindow).toBeNull();
  });
});
describe("Antigravity conversation snapshots", () => {
  it("reads the verified on-disk format and handles transcript rewrites and explicit idle status", async () => {
    const home = await fixture();
    const root = join(home, ".gemini/antigravity-cli");
    await mkdir(root, { recursive: true });
    const db = new DatabaseSync(join(root, "conversation_summaries.db"));
    db.exec(
      "CREATE TABLE conversation_summaries(conversation_id TEXT,workspace_uris TEXT,status TEXT,not_fully_idle INTEGER,last_modified_time TEXT,parent_conversation_id TEXT,killed INTEGER)",
    );
    db.prepare(
      "INSERT INTO conversation_summaries VALUES('conversation',?,'CASCADE_RUN_STATUS_RUNNING',1,'2026-10-11T00:00:00Z','',0)",
    ).run(JSON.stringify([pathToFileURL("/project").href]));
    const logs = join(root, "brain/conversation/.system_generated/logs");
    await mkdir(logs, { recursive: true });
    const path = join(logs, "transcript.jsonl");
    try {
      await writeFile(
        path,
        JSON.stringify({
          step_index: 1,
          type: "RUN_COMMAND",
          status: "RUNNING",
          created_at: "2026-10-11T00:00:00Z",
          content: "PRIVATE",
          tool_calls: [{ name: "run_command", args: { CommandLine: "PRIVATE COMMAND" } }],
        }) + "\n",
      );
      let result = await readLocalAgent("antigravity", "/project", 1, [], home);
      expect(result.state).toMatchObject({
        status: "Executing",
        currentTool: { name: "run_command" },
      });
      expect(JSON.stringify(result)).not.toContain("PRIVATE");
      db.exec(
        "UPDATE conversation_summaries SET status='CASCADE_RUN_STATUS_IDLE',not_fully_idle=0",
      );
      result = await readLocalAgent("antigravity", "/project", 1, [], home);
      expect(result.state?.status).toBe("Waiting");
      expect(result.state?.currentTool).toBeNull();
      await writeFile(
        path,
        JSON.stringify({
          type: "PLANNER_RESPONSE",
          status: "DONE",
          input_tokens: 100,
          cache_read_tokens: 50,
          output_tokens: 20,
          created_at: "2026-10-11T00:00:01Z",
        }) + "\n",
      );
      result = await readLocalAgent("antigravity", "/project", 1, [], home);
      expect(result.state).toMatchObject({
        contextTokens: 150,
        contextWindow: null,
        inputTokens: 100,
        cacheTokens: 50,
        outputTokens: 20,
      });
      expect((await readLocalAgent("antigravity", "/project", 2, [], home)).state).toBeNull();
      expect(
        (
          await readLocalAgent(
            "antigravity",
            "/other",
            2,
            [join(root, "conversations/conversation.db")],
            home,
          )
        ).verified,
      ).toBe(true);
    } finally {
      db.close();
    }
  });
  it("leaves unsupported statuses unknown", () => {
    expect(antigravityStatus("NEW_ENUM", 0)).toBe("Unknown");
    expect(antigravityStatus("CASCADE_RUN_STATUS_IDLE", 0)).toBe("Waiting");
    expect(antigravityStatus("CASCADE_RUN_STATUS_ERROR", 0)).toBe("Error");
  });
});
