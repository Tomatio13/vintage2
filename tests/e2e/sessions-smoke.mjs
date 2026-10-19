import assert from "node:assert/strict";
import { access, mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { _electron as electron } from "playwright-core";

await access(resolve("dist/renderer/index.html")).catch(() => {
  throw new Error("Build the application before running the Sessions smoke test.");
});
const fixture = await mkdtemp(join(tmpdir(), "vintage-sessions-smoke-"));
let app;
try {
  const root = join(fixture, "codex");
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
    `console.log('RESUME_FIXTURE ' + JSON.stringify(process.argv.slice(2)));\nconsole.log('ROOT_FIXTURE ' + process.env.CODEX_HOME);\nsetInterval(()=>{},1000);\n`,
  );
  if (process.platform === "win32") {
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
      CLAUDE_CONFIG_DIR: join(fixture, "claude"),
      [pathKey]: `${bin}${delimiter}${process.env[pathKey] ?? ""}`,
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
  await page.getByRole("button", { name: /Restore the Browser tabs/ }).click();
  await page
    .getByText("The tabs now scroll horizontally and preserve terminal sessions.", { exact: true })
    .waitFor();
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
    "Sessions smoke passed: history, preview, pin, expansion, Escape, resume argv/config root, existing terminal preservation.",
  );
} finally {
  await app?.close();
  await rm(fixture, { recursive: true, force: true });
}
