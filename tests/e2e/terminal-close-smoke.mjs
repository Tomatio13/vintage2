import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron } from "playwright-core";

const profile = mkdtempSync(join(tmpdir(), "vintage-terminal-close-"));
const app = await electron.launch({
  args: [
    ...(process.platform === "linux" ? ["--no-sandbox"] : []),
    `--user-data-dir=${profile}`,
    resolve("dist/main/index.js"),
  ],
});
try {
  const page = await app.firstWindow();
  const panes = page.locator('[data-pane-kind="terminal"]').filter({ visible: true });
  await panes.locator(".xterm").waitFor();
  await page.evaluate(() => {
    window.__terminalData = [];
    window.desktop.onTerminalData((event) => window.__terminalData.push(event));
  });
  const firstId = await panes.first().getAttribute("data-pane-id");
  await panes.first().locator(".xterm").click();
  await page.keyboard.type("echo VINTAGE_KEEP_SESSION\r");
  await page.waitForFunction(() =>
    window.__terminalData.some((event) => event.data.includes("VINTAGE_KEEP_SESSION")),
  );
  const sessionId = await page.evaluate(
    () =>
      window.__terminalData.find((event) => event.data.includes("VINTAGE_KEEP_SESSION")).sessionId,
  );
  assert.ok(sessionId);
  await page.keyboard.press("Control+Shift+d");
  await page.waitForFunction(
    () => document.querySelectorAll('[data-pane-kind="terminal"]').length === 2,
  );
  const secondId = await panes.nth(1).getAttribute("data-pane-id");
  await panes.nth(1).locator(".xterm").click();
  await page.keyboard.press("Control+w");
  await page.waitForFunction(
    () => document.querySelectorAll('[data-pane-kind="terminal"]').length === 1,
  );
  assert.equal(await panes.first().getAttribute("data-pane-id"), firstId);
  assert.equal(await page.locator(`[data-pane-id="${secondId}"]`).count(), 0);
  await panes.first().locator(".xterm").click();
  await page.keyboard.type("echo VINTAGE_STILL_RUNNING\r");
  await page.waitForFunction(
    (id) =>
      window.__terminalData.some(
        (event) => event.sessionId === id && event.data.includes("VINTAGE_STILL_RUNNING"),
      ),
    sessionId,
  );
  // A held key must not close the pane it would repeat into.
  await page.evaluate(() =>
    document.querySelector(".xterm-helper-textarea").dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "w",
        ctrlKey: true,
        repeat: true,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  assert.equal(await panes.count(), 1);
  await panes.first().locator(".xterm").click();
  await page.keyboard.press("Control+w");
  await page.waitForFunction(
    () => document.querySelectorAll('[data-pane-kind="terminal"]').length === 0,
  );
  assert.equal(await page.locator(".workspace-tab").count(), 0);
  console.log(
    "Terminal Ctrl+W: focused pane closes, sibling session survives, repeat ignored, final Space closes",
  );
} finally {
  await app.close();
}
