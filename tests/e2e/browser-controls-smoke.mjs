import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron } from "playwright-core";

const server = createServer((req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.end(
    `<title>${req.url}</title><body><h1>Browser controls</h1><a href="/next">Next link</a></body>`,
  );
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}/start`;
const profile = mkdtempSync(join(tmpdir(), "vintage-browser-controls-"));
let app;
try {
  app = await electron.launch({
    args: ["--no-sandbox", `--user-data-dir=${profile}`, resolve("dist/main/index.js")],
  });
  const page = await app.firstWindow();
  await page.getByRole("button", { name: "New browser tab", exact: true }).click();
  const address = page.getByRole("textbox", { name: "Browser address" }).filter({ visible: true });
  await address.fill(url);
  await address.press("Enter");
  await page.waitForFunction(() =>
    [...document.querySelectorAll("webview")].some((g) => {
      try {
        return g.getURL().endsWith("/start") && !g.isLoading();
      } catch {
        return false;
      }
    }),
  );
  const guestId = await page.evaluate(() =>
    [...document.querySelectorAll("webview")]
      .find((g) => g.getURL().endsWith("/start"))
      .getWebContentsId(),
  );
  const key = async (name, extra = {}) =>
    app.evaluate(
      ({ webContents }, { guestId, name, extra }) => {
        const guest = webContents.fromId(guestId);
        guest.focus();
        guest.sendInputEvent({
          type: "keyDown",
          keyCode: name,
          modifiers: ["control", ...(extra.shift ? ["shift"] : [])],
        });
        guest.sendInputEvent({ type: "keyUp", keyCode: name, modifiers: ["control"] });
      },
      { guestId, name, extra },
    );
  await key("=");
  await page.waitForFunction(() =>
    [...document.querySelectorAll("webview")].some((g) => {
      try {
        return g.getZoomFactor() > 1.01;
      } catch {
        return false;
      }
    }),
  );
  await key("0");
  await key("l");
  await address.waitFor({ state: "visible" });
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("aria-label") === "Browser address",
  );
  assert.equal(await address.evaluate((e) => e.selectionEnd - e.selectionStart), url.length);
  const count = await page.locator('[aria-label="Browser tabs"] > div').count();
  // Genuine guest mouse events must produce Chromium's background-tab disposition.
  await app.evaluate(async ({ webContents }, guestId) => {
    const guest = webContents.fromId(guestId);
    const point = await guest.executeJavaScript(
      `(() => { const r = document.querySelector('a').getBoundingClientRect(); return {x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2)}; })()`,
    );
    guest.sendInputEvent({ type: "mouseDown", button: "middle", clickCount: 1, ...point });
    guest.sendInputEvent({ type: "mouseUp", button: "middle", clickCount: 1, ...point });
  }, guestId);
  await page.waitForFunction(
    (count) => document.querySelector('[aria-label="Browser tabs"]').children.length === count + 1,
    count,
  );
  assert.equal(await address.inputValue(), url);
  await address.press("Control+Tab");
  await page.waitForFunction(() =>
    [...document.querySelectorAll('input[aria-label="Browser address"]')].some(
      (e) => e.offsetParent && e.value.endsWith("/next"),
    ),
  );
  const nextAddress = page
    .getByRole("textbox", { name: "Browser address" })
    .filter({ visible: true });
  await nextAddress.press("Control+w");
  await page.waitForFunction(
    (count) => document.querySelector('[aria-label="Browser tabs"]').children.length === count,
    count,
  );
  await page.keyboard.press("Control+Shift+t");
  await page.waitForFunction(
    (count) => document.querySelector('[aria-label="Browser tabs"]').children.length === count + 1,
    count,
  );
  const selected = page.locator('[aria-label="Browser tabs"] button[aria-pressed="true"]');
  await selected.click({ button: "middle" });
  await page.waitForFunction(
    (count) => document.querySelector('[aria-label="Browser tabs"]').children.length === count,
    count,
  );
  await page.keyboard.press("Control+Shift+t");
  await page.waitForFunction(
    (count) => document.querySelector('[aria-label="Browser tabs"]').children.length === count + 1,
    count,
  );
  await page.waitForFunction(() =>
    [...document.querySelectorAll("webview")].some((g) => {
      try {
        return g.checkVisibility() && g.getURL().endsWith("/next") && !g.isLoading();
      } catch {
        return false;
      }
    }),
  );
  const activeGuest = async () =>
    page.evaluate(() =>
      [...document.querySelectorAll("webview")].find((g) => g.checkVisibility()).getWebContentsId(),
    );
  const restoredGuestId = await activeGuest();
  console.log("Tab controls passed");
  await app.evaluate(async ({ webContents }, id) => {
    const guest = webContents.fromId(id);
    await guest.loadURL(guest.getURL().replace("/next", "/history"));
    guest.focus();
  }, restoredGuestId);
  await page.waitForFunction(() =>
    [...document.querySelectorAll('input[aria-label="Browser address"]')].some(
      (e) => e.offsetParent && e.value.endsWith("/history"),
    ),
  );
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].emit("app-command", {}, "browser-backward"),
  );
  await page.waitForFunction(() =>
    [...document.querySelectorAll('input[aria-label="Browser address"]')].some(
      (e) => e.offsetParent && e.value.endsWith("/next"),
    ),
  );
  await page.waitForFunction(() =>
    [...document.querySelectorAll("webview")].some((g) => {
      try {
        return g.getURL().endsWith("/next") && !g.isLoading() && g.canGoForward();
      } catch {
        return false;
      }
    }),
  );
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].emit("app-command", {}, "browser-forward"),
  );
  await page.waitForFunction(() =>
    [...document.querySelectorAll('input[aria-label="Browser address"]')].some(
      (e) => e.offsetParent && e.value.endsWith("/history"),
    ),
  );
  console.log("Back/forward command routing passed");
  // Match Electron's native wheel regression test: wheel ticks carry zoom steps.
  // https://github.com/electron/electron/blob/v41.0.3/spec/api-web-contents-spec.ts
  await app.evaluate(({ webContents }, id) => {
    const guest = webContents.fromId(id);
    guest.focus();
    guest.sendInputEvent({
      type: "mouseWheel",
      x: 40,
      y: 40,
      deltaX: 0,
      deltaY: 120,
      wheelTicksX: 0,
      wheelTicksY: 1,
      modifiers: ["control"],
    });
  }, restoredGuestId);
  await page.waitForFunction(() =>
    [...document.querySelectorAll("webview")].some((g) => {
      try {
        return g.getURL().endsWith("/history") && g.getZoomFactor() > 1.01;
      } catch {
        return false;
      }
    }),
  );
  console.log("Browser controls Electron smoke passed");
} finally {
  await app?.close();
  await new Promise((resolve) => server.close(resolve));
}
