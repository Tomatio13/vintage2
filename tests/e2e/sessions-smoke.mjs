import { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";
import { access, mkdtemp, mkdir, writeFile, readFile, appendFile, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { _electron as electron } from "playwright-core";

await access(resolve("dist/renderer/index.html")).catch(() => {
  throw new Error("Build the application before running the Sessions smoke test.");
});
const fixture = await mkdtemp(join(tmpdir(), "vintage-sessions-smoke-"));
let app;
try {
  const root = join(fixture, "codex");
  const dataHome = join(fixture, "data");
  await mkdir(join(dataHome, "opencode"), { recursive: true });
  const db = new DatabaseSync(join(dataHome, "opencode", "opencode.db"));
  db.exec(`CREATE TABLE session_v2(id TEXT,directory TEXT,title TEXT,time_updated INTEGER,parent_id TEXT);
    CREATE TABLE session_message(id TEXT,session_id TEXT,type TEXT,seq INTEGER,data TEXT);`);
  db.prepare(
    "INSERT INTO session_v2 VALUES ('ses_smoke',?,'OpenCode saved conversation',?,NULL)",
  ).run(homedir(), Date.now());
  db.prepare("INSERT INTO session_message VALUES ('m1','ses_smoke','user',1,?)").run(
    JSON.stringify({ text: "OpenCode history is visible" }),
  );
  db.close();
  const bin = join(fixture, "bin");
  const profile = join(fixture, "profile");
  const dir = join(root, "sessions", "2026", "10", "19");
  await mkdir(dir, { recursive: true });
  await mkdir(bin);
  const sid = "11111111-2222-4333-8444-555555555555";
  const log = [
    { type: "session_meta", payload: { id: sid, cwd: homedir() } },
    {
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "Restore the Browser tabs" }],
      },
    },
    {
      type: "response_item",
      payload: {
        type: "message",
        role: "assistant",
        content: [
          {
            type: "output_text",
            text: "The tabs now scroll horizontally and preserve terminal sessions.",
          },
        ],
      },
    },
  ];
  await writeFile(
    join(dir, "rollout-smoke.jsonl"),
    log.map((entry) => JSON.stringify(entry)).join("\n") + "\n",
  );
  const cliScript = join(fixture, "resume-fixture.cjs");
  await writeFile(
    cliScript,
    `const fs = require('node:fs');
const args = process.argv.slice(2);
if (args[0] === '--version') { console.log('fixture 1.0'); }
else if (args[0] === 'login') { console.log('Logged in'); }
else if (args[0] === 'exec') {
  process.stdin.resume();
  process.stdin.on('end', () => {
    fs.appendFileSync(process.env.VINTAGE_SESSIONS_TEST_ANALYSIS_COUNT, 'run' + String.fromCharCode(10));
    fs.writeFileSync(args[args.indexOf('--output-last-message') + 1], JSON.stringify({ status: 'needs_user', summary: 'Tabs implemented; manual verification remains.', nextAction: 'Verify on Windows.' }));
    console.log(JSON.stringify({type:'turn.completed', usage:{input_tokens:100,output_tokens:50}}));
  });
} else { console.log('RESUME_FIXTURE ' + JSON.stringify(args)); console.log('ROOT_FIXTURE ' + process.env.CODEX_HOME); setInterval(()=>{},1000); }
`,
  );
  if (process.platform === "win32") {
    const npmBin = join(bin, "node_modules", "@openai", "codex", "bin");
    await mkdir(npmBin, { recursive: true });
    await writeFile(join(npmBin, "codex.js"), await readFile(cliScript, "utf8"));
    await writeFile(
      join(bin, "codex.cmd"),
      '@echo off\r\n"%VINTAGE_SESSIONS_TEST_NODE%" "%VINTAGE_SESSIONS_TEST_SCRIPT%" %*\r\n',
    );
  } else {
    await writeFile(
      join(bin, "codex"),
      `#!/bin/sh\nexec "$VINTAGE_SESSIONS_TEST_NODE" "$VINTAGE_SESSIONS_TEST_SCRIPT" "$@"\n`,
      { mode: 0o755 },
    );
  }
  const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === "path") ?? "PATH";
  app = await electron.launch({
    args: [
      "--no-sandbox",
      "--disable-gpu",
      `--user-data-dir=${profile}`,
      resolve("dist/main/index.js"),
    ],
    env: {
      ...process.env,
      CODEX_HOME: root,
      XDG_DATA_HOME: dataHome,
      CLAUDE_CONFIG_DIR: join(fixture, "claude"),
      [pathKey]: `${bin}${delimiter}${dirname(process.execPath)}${delimiter}${process.env[pathKey] ?? ""}`,
      VINTAGE_SESSIONS_TEST_ANALYSIS_COUNT: join(fixture, "analysis-count.txt"),
      VINTAGE_SESSIONS_TEST_NODE: process.execPath,
      VINTAGE_SESSIONS_TEST_SCRIPT: cliScript,
    },
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.setSize(1500, 1000);
    window.show();
    window.focus();
  });
  try {
    await page.getByText("Home", { exact: true }).waitFor();
  } catch (error) {
    await page.screenshot({ path: join(tmpdir(), "vintage-sessions-startup.png") });
    console.error(
      JSON.stringify({
        url: page.url(),
        errors,
        startup: "Renderer did not reach the Home screen",
      }),
    );
    throw error;
  }
  await page.locator('[data-pane-kind="terminal"] .xterm').first().waitFor();
  await page.evaluate(() => {
    window.sessionsOriginalTerminal = document.querySelector('[data-pane-kind="terminal"] .xterm');
  });
  await page.getByRole("button", { name: "Sessions", exact: true }).click();
  await page.getByRole("button", { name: /OpenCode saved conversation/ }).click();
  await page.getByText("OpenCode history is visible", { exact: true }).last().waitFor();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: /Restore the Browser tabs/ }).click();
  await page
    .getByText("The tabs now scroll horizontally and preserve terminal sessions.", { exact: true })
    .waitFor();
  {
    await page.getByRole("button", { name: "Open settings" }).click();
    const settings = page.getByRole("dialog", { name: "Settings" });
    await settings.getByRole("button", { name: "Sessions", exact: true }).click();
    await settings.getByRole("button", { name: "Analysis CLI", exact: true }).waitFor();
    await settings.getByLabel("Analysis model", { exact: true }).fill("fixture-model");
    await settings.getByRole("button", { name: "Save analysis settings" }).click();
    await settings.getByText("Analysis settings saved.", { exact: true }).waitFor();
    await settings.getByRole("button", { name: "Check CLI connection" }).click();
    await settings.getByText(/fixture 1.0 — CLI reports authenticated/).waitFor();
    await settings.getByRole("button", { name: "Workspace", exact: true }).click();
    const original = await readFile(join(dir, "rollout-smoke.jsonl"), "utf8");
    await page.getByRole("button", { name: "Analyze session", exact: true }).click();
    await page
      .getByText("Tabs implemented; manual verification remains.", { exact: true })
      .waitFor();
    await page.getByText("Next: Verify on Windows.", { exact: true }).waitFor();
    assert.equal(
      await readFile(join(dir, "rollout-smoke.jsonl"), "utf8"),
      original,
      "analysis must not modify history",
    );
    await page.getByRole("button", { name: "Reanalyze", exact: true }).waitFor();
    await page.evaluate(async () => {
      const list = await window.desktop.listSessionHistory();
      const session = list.sessions.find((item) => item.title === "Restore the Browser tabs");
      await window.desktop.analyzeSession(session.key);
    });
    assert.equal(
      (await readFile(join(fixture, "analysis-count.txt"), "utf8")).trim().split("\n").length,
      1,
      "unchanged analysis must use the cache",
    );
    await page.getByRole("button", { name: "Reanalyze", exact: true }).click();
    await page.getByText(/Successful analyses: 2/).waitFor();
    await appendFile(
      join(dir, "rollout-smoke.jsonl"),
      JSON.stringify({
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "Windows verification is finished." }],
        },
      }) + "\n",
    );
    await page.getByRole("button", { name: "Refresh sessions", exact: true }).click();
    await page.getByText(/Outdated — conversation changed/).waitFor();
    await page.screenshot({ path: join(tmpdir(), "vintage-sessions-analysis.png") });
  }
  await page.getByRole("button", { name: "Pin session", exact: true }).click();
  await page.getByRole("button", { name: "Expand sessions", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Expanded sessions" });
  await dialog.waitFor();
  const box = await dialog.boundingBox();
  assert(box && box.width > 1300 && box.height > 800, "expanded view must fill the window");
  await page.screenshot({ path: join(tmpdir(), "vintage-sessions-expanded.png") });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Expand sessions", exact: true }).waitFor();
  await page.screenshot({ path: join(tmpdir(), "vintage-sessions-panel.png") });
  await page.evaluate(() => {
    window.sessionsSmokeOutput = [];
    window.desktop.onTerminalData((event) => window.sessionsSmokeOutput.push(event.data));
  });
  await page.getByRole("button", { name: "Resume in new Space", exact: true }).click();
  await page.waitForFunction(() => window.sessionsSmokeOutput.join("").includes("RESUME_FIXTURE"));
  const output = await page.evaluate(() => window.sessionsSmokeOutput.join(""));
  assert(
    output.includes(JSON.stringify(["resume", sid])),
    "resume must receive the selected session ID",
  );
  assert(output.includes(root), "resume must use the original config root");
  assert(
    await page.evaluate(() => window.sessionsOriginalTerminal.isConnected),
    "existing terminal must remain mounted",
  );
  assert.deepEqual(errors, []);
  console.log(
    "Sessions smoke passed: history, settings, CLI probe, analysis, cache, forced reanalysis, outdated marker, unchanged logs, pin, expansion, Escape, resume argv/config root, existing terminal preservation (mock CLI, no LLM charges).",
  );
} finally {
  await app?.close();
  await rm(fixture, { recursive: true, force: true });
}
