import { fork } from "node:child_process";
import { _electron as electron } from "playwright-core";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const fixture = mkdtempSync(join(tmpdir(), "vintage-monitor-live-"));
const profile = mkdtempSync(join(tmpdir(), "vintage-monitor-profile-"));
const dayDirectory = join(fixture, "sessions", "2026", "10", "11");
mkdirSync(dayDirectory, { recursive: true });
const projectDirectory = join(fixture, "monitor-project");
mkdirSync(projectDirectory);
const script = join(fixture, "codex.js");
const log = join(dayDirectory, "rollout-fixture.jsonl");
writeFileSync(
  script,
  `const fs = require('node:fs');
process.title = 'codex';
const path = ${JSON.stringify(log)};
process.chdir(${JSON.stringify(projectDirectory)});
const event = (type, payload) => fs.appendFileSync(path, JSON.stringify({type, timestamp: new Date().toISOString(), payload}) + '\\n');
event('session_meta', {id: 'vintage-monitor-fixture', cwd: ${JSON.stringify(projectDirectory)}, source: 'vscode', originator: 'codex-tui', timestamp: new Date().toISOString()});
event('turn_context', {model:'fixture-model'});
event('event_msg', {type:'task_started'});
event('event_msg', {type:'token_count', info:{total_token_usage:{input_tokens:2000, output_tokens:100, cached_input_tokens:500}, last_token_usage:{input_tokens:1500}, model_context_window:200000}});
process.stdin.setEncoding('utf8');
process.stdin.on('data', data => {
 if (data.includes('tool')) event('response_item',{type:'function_call', call_id:'fixture-tool', name:'Read', arguments:JSON.stringify({file_path:${JSON.stringify("/tmp/monitor-project/src/main.ts")}})});
 if (data.includes('done')) {event('response_item',{type:'function_call_output', call_id:'fixture-tool', output:'PRIVATE RESULT'});event('event_msg',{type:'task_complete'});}
 if (data.includes('quit')) process.exit(0);
});
console.log('MONITOR_FIXTURE_READY');
setInterval(()=>{},1000);
`,
);
const backgroundScript = join(fixture, "background.js");
writeFileSync(
  backgroundScript,
  `process.title='codex';process.send('ready');setInterval(()=>{},1000);`,
);
let app;
let background;
try {
  background = fork(backgroundScript, {
    cwd: projectDirectory,
    stdio: ["ignore", "ignore", "ignore", "ipc"],
    env: { ...process.env, CODEX_HOME: fixture },
  });
  await new Promise((resolve, reject) => {
    background.once("message", resolve);
    background.once("error", reject);
  });
  app = await electron.launch({
    args: ["--no-sandbox", `--user-data-dir=${profile}`, resolve("dist/main/index.js")],
    // The installed app inherits Japanese locale; ps lstart must remain parseable.
    env: { ...process.env, LANG: "ja_JP.UTF-8", LC_ALL: "ja_JP.UTF-8", CODEX_HOME: fixture },
  });
  const page = await app.firstWindow();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.getByText("Home", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Monitor", exact: true }).click();
  await page.evaluate(() => window.desktop.getMonitorSnapshot());
  const surface = page.locator('[data-pane-kind="terminal"] .xterm').filter({ visible: true });
  await surface.waitFor();
  await surface.click();
  await page.keyboard.type(`node '${script}'\r`);
  await page.waitForFunction(
    async () =>
      (await window.desktop.getMonitorSnapshot()).sessions.some(
        (s) => s.sessionId === "vintage-monitor-fixture" && s.status === "Thinking",
      ),
    undefined,
    { timeout: 8000 },
  );
  const backgroundRow = await page.evaluate(
    async (pid) => (await window.desktop.getMonitorSnapshot()).sessions.find((s) => s.pid === pid),
    background.pid,
  );
  if (backgroundRow?.logMatch !== "unavailable" || backgroundRow.sessionId !== null)
    throw new Error("terminal log incorrectly assigned to background process");
  await page
    .getByRole("button")
    .filter({ hasText: "monitor-project" })
    .filter({ hasText: "fixture-model" })
    .click();
  await page
    .getByLabel("Session details")
    .getByText(/fixture-model/u)
    .waitFor();
  const owned = await page.evaluate(async () => {
    const s = (await window.desktop.getMonitorSnapshot()).sessions.find(
      (s) => s.sessionId === "vintage-monitor-fixture",
    );
    return {
      pid: s?.pid,
      paneId: s?.paneId,
      contextTokens: s?.contextTokens,
      contextWindow: s?.contextWindow,
      logMatch: s?.logMatch,
    };
  });
  if (
    !owned.paneId ||
    owned.contextTokens !== 1500 ||
    owned.contextWindow !== 200000 ||
    owned.logMatch !== "inferred"
  )
    throw new Error("collector / PTY ownership / context mismatch: " + JSON.stringify(owned));
  const paneCount = await page.locator('[data-pane-kind="terminal"]').count();
  await page.getByRole("button", { name: "Open terminal", exact: true }).click();
  await page.waitForFunction(() =>
    document.activeElement?.classList.contains("xterm-helper-textarea"),
  );
  await page.keyboard.type("tool\r");
  await page
    .getByRole("button")
    .filter({ hasText: "monitor-project" })
    .filter({ hasText: "fixture-model" })
    .getByText("Executing", { exact: true })
    .waitFor();
  await page
    .getByText(/Read · /u)
    .first()
    .waitFor();
  await page.getByRole("button", { name: "Expand monitor" }).click();
  const dashboard = page.getByRole("dialog");
  await dashboard.waitFor();
  const width = await dashboard.evaluate((el) => el.getBoundingClientRect().width);
  const viewport = await page.evaluate(() => window.innerWidth);
  if (width < viewport * 0.9 || width > viewport)
    throw new Error("expanded monitor does not fill window");
  await page.waitForFunction(async () => {
    const s = await window.desktop.getMonitorSnapshot();
    return s.host?.memoryTotalBytes > 0 && s.history?.length >= 2 && s.host.cpuPercent !== null;
  });
  await page.screenshot({ path: join(tmpdir(), "vintage-monitor-dashboard.png") });
  await page.keyboard.press("Escape");
  await dashboard.waitFor({ state: "detached" });
  if ((await page.locator('[data-pane-kind="terminal"]').count()) !== paneCount)
    throw new Error("terminal was replaced during monitor expansion");
  await page.screenshot({ path: join(tmpdir(), "vintage-monitor-smoke.png") });
  await page.getByRole("button", { name: "Open terminal", exact: true }).click();
  await page.waitForFunction(() =>
    document.activeElement?.classList.contains("xterm-helper-textarea"),
  );
  await page.keyboard.type("done\r");
  await page
    .getByRole("button")
    .filter({ hasText: "monitor-project" })
    .filter({ hasText: "fixture-model" })
    .getByText("Waiting", { exact: true })
    .waitFor();
  if ((await page.locator('[data-pane-kind="terminal"]').count()) !== paneCount)
    throw new Error("terminal was replaced during monitor navigation");
  const header = await page
    .getByRole("button", { name: "Monitor", exact: true })
    .evaluate((button) => {
      const rect = button.getBoundingClientRect();
      const pane = button.closest("aside").getBoundingClientRect();
      return {
        fits: rect.right <= pane.right + 1 && rect.left >= pane.left - 1,
        headerScroll: button.parentElement.scrollWidth > button.parentElement.clientWidth,
      };
    });
  if (!header.fits) throw new Error("Monitor tab is clipped by the side pane");
  console.log(
    JSON.stringify({
      monitor: "Thinking → Executing → Waiting",
      ownedTerminal: true,
      terminalPreserved: true,
      header,
      rendererErrors: errors,
    }),
  );
  if (errors.length) throw new Error("renderer errors");
  await page.getByRole("button", { name: "Browser", exact: true }).click();
  await page.getByRole("button", { name: "Monitor", exact: true }).click();
  await page.getByRole("button", { name: "Open terminal", exact: true }).click();
  await page.waitForFunction(() =>
    document.activeElement?.classList.contains("xterm-helper-textarea"),
  );
  await page.keyboard.type("quit\r");
  await page
    .getByRole("button")
    .filter({ hasText: `PID ${owned.pid}` })
    .waitFor({ state: "detached" });
  const remaining = await page.evaluate(async () => window.desktop.getMonitorSnapshot());
  if (remaining.sessions.some((session) => session.pid === owned.pid))
    throw new Error("exited process remains in the monitor snapshot");
  console.log("Removed after process exit: OK");
} finally {
  if (app) await app.close();
  if (background && background.exitCode === null) {
    const exited = new Promise((resolve) => background.once("exit", resolve));
    background.kill();
    await exited;
  }
  rmSync(fixture, { recursive: true, force: true });
  rmSync(profile, { recursive: true, force: true });
}
