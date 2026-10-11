import { _electron as electron } from "playwright-core";
import { fork } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
const home = mkdtempSync(join(tmpdir(), "vintage-extra-agents-"));
const profile = mkdtempSync(join(tmpdir(), "vintage-extra-profile-"));
const children = [];
const databases = [];
let app;
function db(path) {
  mkdirSync(resolve(path, ".."), { recursive: true });
  const value = new DatabaseSync(path);
  databases.push(value);
  value.exec("PRAGMA journal_mode=WAL");
  return value;
}
function sessionDatabase(path, directory, model) {
  const value = db(path);
  value.exec(
    `CREATE TABLE session(id TEXT,directory TEXT,parent_id TEXT,time_created INTEGER,time_updated INTEGER);CREATE TABLE message(id TEXT,session_id TEXT,time_created INTEGER,data TEXT,time_updated INTEGER DEFAULT 0);CREATE TABLE part(id TEXT,message_id TEXT,session_id TEXT,time_created INTEGER,data TEXT,time_updated INTEGER DEFAULT 0);`,
  );
  value
    .prepare("INSERT INTO session VALUES('fixture',?,NULL,?,?)")
    .run(directory, Date.now(), Date.now());
  value
    .prepare("INSERT INTO message(id,session_id,time_created,data) VALUES('message','fixture',?,?)")
    .run(
      Date.now(),
      JSON.stringify({
        role: "assistant",
        modelID: model,
        modelId: model,
        tokens: { input: 1000, output: 100, cache: { read: 100 } },
        content: "PRIVATE USER PROMPT",
      }),
    );
  return value;
}
try {
  const directories = Object.fromEntries(
    ["antigravity", "opencode", "zcode", "grok"].map((agent) => [
      agent,
      join(home, agent + "-project"),
    ]),
  );
  for (const path of Object.values(directories)) mkdirSync(path, { recursive: true });
  const oc = sessionDatabase(
    join(home, ".local/share/opencode/opencode.db"),
    directories.opencode,
    "opencode-test-model",
  );
  const zc = sessionDatabase(
    join(home, ".zcode/cli/db/db.sqlite"),
    directories.zcode,
    "zcode-test-model",
  );
  zc.prepare(
    "INSERT INTO part(id,message_id,session_id,time_created,data) VALUES('tool','message','fixture',?,?)",
  ).run(
    Date.now(),
    JSON.stringify({
      type: "tool",
      tool: "Bash",
      state: { status: "running", input: { command: "PRIVATE COMMAND" }, output: "PRIVATE RESULT" },
    }),
  );
  const tasks = db(join(home, ".zcode/v2/tasks-index.sqlite"));
  tasks.exec(
    "CREATE TABLE tasks(task_id TEXT,workspace_path TEXT,task_status TEXT,deleted INTEGER,archived INTEGER,updated_at INTEGER)",
  );
  tasks
    .prepare("INSERT INTO tasks VALUES('fixture',?,'running',0,0,?)")
    .run(directories.zcode, Date.now());
  const antiRoot = join(home, ".gemini/antigravity-cli");
  const ag = db(join(antiRoot, "conversation_summaries.db"));
  ag.exec(
    "CREATE TABLE conversation_summaries(conversation_id TEXT,workspace_uris TEXT,status TEXT,not_fully_idle INTEGER,last_modified_time TEXT,parent_conversation_id TEXT,killed INTEGER)",
  );
  ag.prepare(
    "INSERT INTO conversation_summaries VALUES('fixture',?,'CASCADE_RUN_STATUS_RUNNING',1,?,'',0)",
  ).run(JSON.stringify([pathToFileURL(directories.antigravity).href]), new Date().toISOString());
  const logs = join(antiRoot, "brain/fixture/.system_generated/logs");
  mkdirSync(logs, { recursive: true });
  const transcript = join(logs, "transcript.jsonl");
  writeFileSync(
    transcript,
    JSON.stringify({
      step_index: 0,
      type: "PLANNER_RESPONSE",
      status: "RUNNING",
      created_at: new Date().toISOString(),
      input_tokens: 1000,
      output_tokens: 100,
      cache_read_tokens: 100,
      content: "PRIVATE USER PROMPT",
      tool_calls: [
        { name: "view_file", args: { AbsolutePath: join(directories.antigravity, "main.ts") } },
      ],
    }) + "\n",
  );
  const grokDirectory = join(
    home,
    ".grok/sessions",
    encodeURIComponent(directories.grok),
    "grok-fixture",
  );
  mkdirSync(grokDirectory, { recursive: true });
  writeFileSync(
    join(grokDirectory, "summary.json"),
    JSON.stringify({
      info: { id: "grok-fixture", cwd: directories.grok },
      current_model_id: "grok-test-model",
      last_active_at: new Date().toISOString(),
    }),
  );
  const grokUpdates = [
    {
      timestamp: Date.now() / 1000,
      params: {
        sessionId: "grok-fixture",
        update: {
          sessionUpdate: "tool_call",
          toolCallId: "tool",
          rawInput: { command: "PRIVATE COMMAND" },
          _meta: { "x.ai/tool": { name: "read_file" } },
        },
      },
    },
  ];
  const writeGrok = () =>
    writeFileSync(
      join(grokDirectory, "updates.jsonl"),
      grokUpdates.map((event) => JSON.stringify(event)).join("\n") + "\n",
    );
  writeGrok();
  const helper = join(home, "agent.cjs");
  writeFileSync(
    helper,
    "process.title=process.argv[2];process.send('ready');setInterval(()=>{},1000);",
  );
  for (const [agent, title] of [
    ["antigravity", "agy"],
    ["opencode", "opencode"],
    ["zcode", "zcode-cli"],
    ["grok", "grok"],
  ]) {
    const child = fork(helper, [title], {
      cwd: directories[agent],
      env: { ...process.env, HOME: home, XDG_DATA_HOME: join(home, ".local/share") },
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    });
    children.push(child);
    await new Promise((done, fail) => {
      child.once("message", done);
      child.once("error", fail);
    });
  }
  app = await electron.launch({
    args: ["--no-sandbox", `--user-data-dir=${profile}`, resolve("dist/main/index.js")],
    env: {
      ...process.env,
      HOME: home,
      XDG_DATA_HOME: join(home, ".local/share"),
      CODEX_HOME: join(home, ".codex"),
      LANG: "ja_JP.UTF-8",
      LC_ALL: "ja_JP.UTF-8",
    },
  });
  const page = await app.firstWindow();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByRole("button", { name: "Monitor", exact: true }).click();
  const pids = children.map((child) => child.pid);
  await page.waitForFunction(async (pids) => {
    const rows = (await window.desktop.getMonitorSnapshot()).sessions.filter((s) =>
      pids.includes(s.pid),
    );
    return (
      rows.length === 4 &&
      rows.find((s) => s.agent === "opencode")?.status === "Thinking" &&
      rows.find((s) => s.agent === "zcode")?.status === "Executing" &&
      rows.find((s) => s.agent === "antigravity")?.status === "Executing" &&
      rows.find((s) => s.agent === "grok")?.status === "Executing"
    );
  }, pids);
  await page.getByRole("button", { name: "Expand monitor" }).click();
  for (const [agent, label] of [
    ["antigravity", "Antigravity"],
    ["opencode", "OpenCode"],
    ["zcode", "ZCode"],
    ["grok", "Grok"],
  ]) {
    const row = page
      .getByLabel("Sessions")
      .getByRole("button")
      .filter({ hasText: agent + "-project" });
    await row.getByText(label, { exact: true }).waitFor();
  }
  const selected = await page.evaluate(
    async (pids) =>
      (await window.desktop.getMonitorSnapshot()).sessions.filter((s) => pids.includes(s.pid)),
    pids,
  );
  if (JSON.stringify(selected).includes("PRIVATE"))
    throw new Error("private transcript content leaked over IPC");
  oc.prepare("UPDATE message SET data=?").run(
    JSON.stringify({
      role: "assistant",
      modelID: "opencode-test-model",
      time: { completed: Date.now() },
      finish: "stop",
      tokens: { input: 1000, output: 100, cache: { read: 100 } },
    }),
  );
  grokUpdates.push({
    timestamp: Date.now() / 1000,
    params: {
      sessionId: "grok-fixture",
      update: { sessionUpdate: "turn_completed", stop_reason: "end_turn" },
    },
  });
  writeGrok();
  tasks.exec("UPDATE tasks SET task_status='completed'");
  ag.exec("UPDATE conversation_summaries SET status='CASCADE_RUN_STATUS_IDLE',not_fully_idle=0");
  await page.waitForFunction(async (pids) => {
    const rows = (await window.desktop.getMonitorSnapshot()).sessions.filter((s) =>
      pids.includes(s.pid),
    );
    return rows.length === 4 && rows.every((s) => s.status === "Waiting");
  }, pids);
  await page.screenshot({ path: join(tmpdir(), "vintage-monitor-extra-agents.png") });
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    JSON.stringify({
      agents: selected.map((s) => ({
        agent: s.agent,
        status: s.status,
        model: s.model,
        context: s.contextTokens,
      })),
      allWaitingAfterCompletion: true,
      privateContentExcluded: true,
      rendererErrors: errors,
    }),
  );
} finally {
  if (app) await app.close();
  for (const child of children)
    if (child.exitCode === null && child.signalCode === null) {
      const exited = new Promise((done) => child.once("exit", done));
      child.kill();
      await exited;
    }
  for (const database of databases) database.close();
  rmSync(home, { recursive: true, force: true });
  rmSync(profile, { recursive: true, force: true });
}
