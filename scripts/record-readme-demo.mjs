import { _electron as electron } from "playwright-core";
import { mkdtemp, mkdir, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

// Film real Claude Code work in a disposable project, without scripted shell output.
const output = process.env.VINTAGE_DEMO_OUTPUT
  ? resolve(process.env.VINTAGE_DEMO_OUTPUT)
  : await mkdtemp(join(tmpdir(), "vintage-demo-output-"));
const root = await mkdtemp(join(tmpdir(), "vintage-video-"));
const project = process.env.VINTAGE_DEMO_PROJECT ?? join(root, "sample-app");
const profile = join(root, "profile");
const shell = join(root, "shell");
const bin = join(root, "bin");
for (const dir of [output, project, profile, shell, bin]) await mkdir(dir, { recursive: true });
await writeFile(join(shell, ".zshenv"), "PROMPT='sample-app ❯ '; RPROMPT=''\n");
await writeFile(
  join(shell, ".zshrc"),
  "PROMPT='sample-app %F{cyan}❯%f '; RPROMPT=''; unset HISTFILE\n",
);
if (!process.env.VINTAGE_DEMO_PROJECT) {
  await writeFile(
    join(project, "package.json"),
    '{"name":"session-guard","type":"module","scripts":{"test":"node --test"}}\n',
  );
  await writeFile(
    join(project, "README.md"),
    "# Session Guard\n\nA small authorization module. Expired sessions must never be accepted.\n",
  );
  await writeFile(
    join(project, "auth.js"),
    "export function authorize(session, now = Date.now()) {\n  if (!session?.token) return false;\n  return true;\n}\n",
  );
  await writeFile(
    join(project, "auth.test.js"),
    "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { authorize } from './auth.js';\ntest('active session is accepted', () => assert.equal(authorize({token:'demo', expiresAt:2000},1000),true));\ntest('expired session is rejected', () => assert.equal(authorize({token:'demo', expiresAt:500},1000),false));\n",
  );
  execFileSync("git", ["init", "-b", "main", project], { stdio: "ignore" });
  execFileSync("git", ["-C", project, "add", "."]);
  execFileSync(
    "git",
    [
      "-C",
      project,
      "-c",
      "user.name=VINTAGE Demo",
      "-c",
      "user.email=demo@example.invalid",
      "commit",
      "-m",
      "Add session guard",
    ],
    { stdio: "ignore" },
  );
}
const claudeExecutable = execFileSync("which", ["claude"], { encoding: "utf8" }).trim();
await writeFile(
  join(bin, "claude"),
  `#!/bin/sh
exec '${claudeExecutable}' --effort low --permission-mode default --allowedTools 'Read,Edit,Write,Bash(node *),Bash(npm test*)' --append-system-prompt 'Work only in this demo project. Keep replies short and in English. Do not use network tools or read files outside this directory.' "$@"
`,
  { mode: 0o755 },
);
const space = (id, title, names) => ({
  id,
  title,
  panes: names.map((title, i) => ({ id: `${id}-${i}`, title, kind: "terminal" })),
  layout:
    names.length === 1
      ? { type: "pane", paneId: `${id}-0` }
      : {
          type: "split",
          splitId: `${id}-split`,
          axis: "horizontal",
          ratio: 0.5,
          first: { type: "pane", paneId: `${id}-0` },
          second: { type: "pane", paneId: `${id}-1` },
        },
  activePaneId: `${id}-0`,
});
await writeFile(
  join(profile, "workspace-state.json"),
  JSON.stringify({
    version: 1,
    activeWorkspaceId: "demo",
    workspaces: [
      {
        id: "demo",
        kind: "project",
        name: "Session Guard",
        path: project,
        activeTabId: "build",
        tabs: [
          space("build", "Build", ["Claude · Implementation", "Claude · Review"]),
          space("notes", "Release", ["Release notes"]),
        ],
      },
    ],
  }),
);
let app;
const shots = [];
try {
  app = await electron.launch({
    args: [
      "--no-sandbox",
      "--disable-gpu",
      "--disable-backgrounding-occluded-windows",
      `--user-data-dir=${profile}`,
      resolve("dist/main/index.js"),
    ],
    env: {
      ...process.env,
      ZDOTDIR: shell,
      PATH: `${bin}:${process.env.PATH}`,
      PS1: "sample-app ❯ ",
      FORCE_COLOR: "1",
      COLORTERM: "truecolor",
      VINTAGE_JEV_DEBUG: "0",
    },
    recordVideo: { dir: join(root, "raw"), size: { width: 1920, height: 1080 } },
  });
  process.once("SIGTERM", () => {
    void app.close().finally(() => process.exit(0));
  });
  await app.evaluate(({ BrowserWindow, ipcMain }, project) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.setContentSize(1920, 1080);
    w.show();
    const original = ipcMain._invokeHandlers.get("terminal:create");
    ipcMain.removeHandler("terminal:create");
    globalThis.demoTerminals = {};
    ipcMain.handle("terminal:create", (event, options) => {
      const terminal = original(event, { ...options, shell: "zsh" });
      globalThis.demoTerminals[options.paneId] = terminal.id;
      return terminal;
    });
    // Retain real collector/history results, scoped to the filming project for privacy.
    const monitor = ipcMain._invokeHandlers.get("monitor:snapshot-get");
    ipcMain.removeHandler("monitor:snapshot-get");
    ipcMain.handle("monitor:snapshot-get", async (event, ...args) => {
      const snapshot = await monitor(event, ...args);
      return {
        ...snapshot,
        sessions: snapshot.sessions.filter((s) => s.cwd === project),
        warnings: [],
        host: snapshot.host ? { ...snapshot.host, name: "Demo workstation" } : snapshot.host,
      };
    });
    const history = ipcMain._invokeHandlers.get("sessions:list");
    ipcMain.removeHandler("sessions:list");
    ipcMain.handle("sessions:list", async (event, ...args) => {
      const list = await history(event, ...args);
      return { ...list, sessions: list.sessions.filter((s) => s.cwd === project), warnings: [] };
    });
  }, project);
  const page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  await page.getByRole("button", { name: "Open settings", exact: true }).waitFor();
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem(
      "ai-workspace-starter-ui",
      JSON.stringify({
        state: {
          theme: "dark",
          themePreferences: { light: "ocean", dark: "graphite", custom: [] },
          shell: "zsh",
          terminalFontSize: 18,
          uiFontSize: 16,
          sidePaneWidth: 540,
          sidebarWidth: 220,
          desktopNotifications: false,
          sessionWaitNotifications: false,
          usagePanelEnabled: false,
        },
        version: 0,
      }),
    );
  });
  await page.reload();
  const wait = (ms) => page.waitForTimeout(ms);
  const term = (index = 0) =>
    page.locator('[data-pane-kind="terminal"] .xterm').filter({ visible: true }).nth(index);
  const command = async (text, index = 0, delay = 4) => {
    await term(index).click({ force: true });
    await page.keyboard.type(text, { delay });
    await page.keyboard.press("Enter");
    await wait(400);
  };
  const button = (name) => page.getByRole("button", { name, exact: true });
  const terminalIds = await app.evaluate(() => globalThis.demoTerminals);
  await page.evaluate(() => {
    window.demoOutput = {};
    window.desktop.onTerminalData((event) => {
      window.demoOutput[event.sessionId] = (window.demoOutput[event.sessionId] ?? "") + event.data;
    });
  });
  const write = async (index, data) => {
    const id = terminalIds[`build-${index}`];
    if (!id) throw new Error("Missing recording terminal");
    await page.evaluate(({ id, data }) => window.desktop.writeTerminal(id, data), { id, data });
  };
  for (const i of [0, 1]) {
    await write(i, "source ~/.zshrc\r");
    await wait(2500);
    await write(
      i,
      `PS1='sample-app ❯ '; RPROMPT=''; export PATH='${bin}':$PATH; unset NO_COLOR; export FORCE_COLOR=1 COLORTERM=truecolor; clear\r`,
    );
    await wait(800);
    await write(i, "claude\r");
    await wait(6000);
    const outputText = await page.evaluate(
      (id) => window.demoOutput[id] ?? "",
      terminalIds[`build-${i}`],
    );
    if (outputText.includes("No, exit")) {
      await write(i, "\x1b[B");
      await wait(250);
      await write(i, "\r");
    }
    await wait(3000);
  }
  // Give the second real session one small project-related turn so its log and
  // model/context metadata exist before filming the Monitor dashboard.
  await write(
    1,
    "Explain in one sentence why a session expiring exactly now must be rejected. Do not use tools.\r",
  );
  await page.waitForFunction(
    async () => {
      const session = (await window.desktop.getMonitorSnapshot()).sessions.find(
        (s) => s.paneId === "build-1",
      );
      return session?.model && session.contextTokens > 0;
    },
    undefined,
    { timeout: 120000, polling: 2000 },
  );
  await page.screenshot({ path: join(output, "claude-ready.png") });
  console.log(`Claude ready: ${join(output, "claude-ready.png")}`);
  if (process.env.VINTAGE_DEMO_READY_GATE) {
    console.log(`Waiting for visual setup check: ${process.env.VINTAGE_DEMO_READY_GATE}`);
    while (
      !(await stat(process.env.VINTAGE_DEMO_READY_GATE)
        .then(() => true)
        .catch(() => false))
    )
      await wait(500);
  }
  let past = await page.evaluate(async () =>
    (await window.desktop.listSessionHistory(true)).sessions.find((s) =>
      s.title.includes("Fix the expired-session bug"),
    ),
  );
  if (!past) {
    console.log("Preparing a real completed session for the Sessions/Resume demonstration");
    const requested = Date.now();
    await write(
      0,
      "Fix the expired-session bug in auth.js, add the exact-expiration regression test, run node --test, then write HISTORY_READY.md. Do not run git commands.\r",
    );
    const deadline = Date.now() + 300000;
    let complete = false;
    while (Date.now() < deadline) {
      complete = await stat(join(project, "HISTORY_READY.md"))
        .then((info) => info.mtimeMs >= requested)
        .catch(() => false);
      if (complete) break;
      await wait(1000);
    }
    if (!complete) throw new Error("The real history preparation did not finish");
    execFileSync("node", ["--test"], { cwd: project, stdio: "ignore" });
    await page.waitForFunction(
      async () =>
        (await window.desktop.getMonitorSnapshot()).sessions.some(
          (s) => s.paneId === "build-0" && s.status === "Waiting",
        ),
      undefined,
      { timeout: 60000 },
    );
    await write(0, "/exit\r");
    await wait(1800);
    past = await page.evaluate(async () =>
      (await window.desktop.listSessionHistory(true)).sessions.find((s) =>
        s.title.includes("Fix the expired-session bug"),
      ),
    );
    if (!past) throw new Error("The completed real session was not indexed");
    await write(0, "claude\r");
    await wait(6000);
  }
  // A single full-frame marker gives the editor an exact frame-level sync point.
  await page.evaluate(() => {
    const e = document.createElement("div");
    e.id = "recording-sync";
    e.style.cssText = "position:fixed;inset:0;background:#ff00ff;z-index:2147483647";
    document.body.append(e);
  });
  await wait(350);
  await page.evaluate(() => document.getElementById("recording-sync").remove());
  const start = Date.now();
  const time = () => (Date.now() - start) / 1000;
  const shot = (title, from, to, maxDuration = 4) =>
    shots.push({ title, start: from, end: to, maxDuration });
  const waitForFile = async (file, limit = 300000) => {
    const deadline = Date.now() + limit;
    while (Date.now() < deadline) {
      if (
        await stat(join(project, file))
          .then((info) => info.mtimeMs >= start)
          .catch(() => false)
      ) {
        await wait(1800);
        return;
      }
      await wait(1000);
    }
    await page.screenshot({ path: join(output, "claude-wait.png") });
    throw new Error(`Claude did not finish ${file}; inspect ${join(output, "claude-wait.png")}`);
  };
  let at = time();
  await wait(2300);
  shot("Your agents. In view.", at, time());
  at = time();
  await command(
    "Read auth.js and auth.test.js, run only node --test, then write VERIFIED.md with the results. Do not run git commands.",
    0,
    20,
  );
  shot("Ask Claude.", at, time(), 4);
  console.log("Claude: verifying the real project; filming live Monitor");
  at = time();
  await button("Monitor").click();
  await page.waitForFunction(
    async () =>
      (await window.desktop.getMonitorSnapshot()).sessions.some(
        (s) => s.paneId === "build-0" && s.contextTokens > 0 && s.model,
      ),
    undefined,
    { timeout: 120000 },
  );
  await wait(1800);
  shot("Monitor. Live.", at, time(), 5);
  at = time();
  await button("Expand monitor").click();
  await wait(5500);
  await page.screenshot({ path: join(output, "monitor-live.png") });
  shot("Every agent, at a glance.", at, time(), 5.5);
  await page.keyboard.press("Escape");
  await waitForFile("VERIFIED.md");
  const verification = execFileSync("node", ["--test"], { cwd: project, encoding: "utf8" });
  const testCount = Number(verification.match(/tests\s+(\d+)/)?.[1] ?? 0);
  at = time();
  // The real Monitor action routes back to the session's owned terminal.
  await button("Open terminal").click();
  await wait(2200);
  shot("One click back to work.", at, time(), 3);
  at = time();
  await button("Sessions").click();
  const historyButton = page
    .getByRole("button", {
      name: new RegExp(past.title.slice(0, 32).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    })
    .first();
  await historyButton.waitFor();
  await wait(2600);
  await page.screenshot({ path: join(output, "sessions-list.png") });
  shot("Your work has a history.", at, time(), 4);
  at = time();
  await historyButton.click();
  await button("Resume in new Space").waitFor();
  await wait(3000);
  await page.screenshot({ path: join(output, "session-conversation.png") });
  shot("Read the conversation.", at, time(), 4);
  at = time();
  await button("Resume in new Space").click();
  await wait(6500);
  await page.screenshot({ path: join(output, "session-resumed.png") });
  shot("Resume. With context.", at, time(), 6);
  at = time();
  await button("Open settings").click();
  await button("Appearance").click();
  await button("Ocean light palette").click();
  await button("Light appearance").click();
  await wait(700);
  await page.keyboard.press("Escape");
  await wait(1700);
  shot("Go light.", at, time(), 4);
  at = time();
  await page.keyboard.press("Control+Shift+P");
  await page.keyboard.type("Build", { delay: 60 });
  await page.keyboard.press("Enter");
  await button("Monitor").click();
  await wait(2500);
  shot("VINTAGE. Keep your agents in view.", at, time(), 4);
  const rawPath = await page.video().path();
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  const artifact = {
    rawPath,
    project,
    root,
    viewport,
    shots,
    sync: "magenta-marker",
    initialTheme: "Graphite dark",
    finalTheme: "Ocean light",
    terminalAgents: ["Claude Code: implementation", "Claude Code: review"],
    realModelTasks: true,
    shellStartup: "source ~/.zshrc, then PS1",
    terminalColor: "FORCE_COLOR=1; COLORTERM=truecolor",
    features: ["Monitor", "Sessions", "Resume", "Claude Code", "Themes"],
    testCount,
    sampleTelemetry: false,
    reference: "https://github.com/eneskirca/nodeterm/blob/main/docs/assets/hero-tour.mp4",
  };
  await writeFile(join(output, "capture.json"), JSON.stringify(artifact, null, 2) + "\n");
  await app.close();
  app = null;
  console.log(`Capture complete: ${join(output, "capture.json")}`);
} catch (error) {
  if (app) {
    const page = await app.firstWindow().catch(() => null);
    if (page) await page.screenshot({ path: join(output, "failure.png") }).catch(() => {});
  }
  console.error(`Capture artifacts: ${output}; project: ${project}`);
  throw error;
} finally {
  if (app) await app.close();
}
