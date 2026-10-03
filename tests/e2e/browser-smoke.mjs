import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron } from "playwright-core";

const server = createServer((request, response) => {
  response.setHeader("Content-Type", "text/html");
  response.end(
    `<title>${request.url?.startsWith("/next") ? "Next page" : "Browser fixture"}</title><h1>needle needle needle</h1><a href="/next#section">Next</a>`,
  );
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
const profile = mkdtempSync(join(tmpdir(), "vintage-browser-smoke-"));
const launch = () =>
  electron.launch({
    args: [
      ...(process.platform === "linux" ? ["--no-sandbox"] : []),
      `--user-data-dir=${profile}`,
      resolve("dist/main/index.js"),
    ],
  });
let app;
try {
  app = await launch();
  let window = await app.firstWindow();
  const errors = [];
  window.on("pageerror", (error) => errors.push(error.message));
  await window.locator('[data-pane-kind="terminal"] .xterm').filter({ visible: true }).waitFor();
  await window.evaluate((url) => {
    const state = JSON.parse(localStorage.getItem("ai-workspace-starter-ui")) ?? {
      state: {},
      version: 0,
    };
    state.state.browserDefaultUrl = url;
    localStorage.setItem("ai-workspace-starter-ui", JSON.stringify(state));
  }, url);
  await window.reload();
  await window.getByRole("button", { name: "New browser tab", exact: true }).click();
  await window.getByRole("button", { name: "Browser fixture", exact: true }).waitFor();
  const address = window
    .getByRole("textbox", { name: "Browser address" })
    .filter({ visible: true });
  await address.fill(url);
  await address.press("Enter");
  await window.getByRole("button", { name: "Browser fixture", exact: true }).waitFor();
  await window
    .getByRole("button", { name: "Bookmark page", exact: true })
    .filter({ visible: true })
    .click();
  await window.getByRole("button", { name: "Bookmarks", exact: true }).click();
  await window
    .getByRole("textbox", { name: `Bookmark name for ${url}`, exact: true })
    .fill("My fixture");
  await window.getByRole("button", { name: "Close bookmarks" }).click();
  // Trigger Ctrl+F while focus is inside the guest, not the host renderer.
  const guest = await app.evaluate(
    ({ webContents }) =>
      webContents.getAllWebContents().find((contents) => contents.getType() === "webview")?.id,
  );
  // A target=_blank link must open an app tab without replacing its source.
  await app.evaluate(async ({ webContents }, id) => {
    await webContents.fromId(id).executeJavaScript(`
      const link = document.createElement("a");
      link.href = "/next?popup";
      link.target = "_blank";
      document.body.append(link);
      link.click();
    `);
  }, guest);
  await window.getByRole("button", { name: "Next page", exact: true }).waitFor({ timeout: 5000 });
  assert.equal(
    await app.evaluate(({ webContents }, id) => webContents.fromId(id).getURL(), guest),
    url,
  );
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
  await window.getByRole("button", { name: "Close Next page tab", exact: true }).click();
  await window.getByRole("button", { name: "Browser fixture", exact: true }).click();
  await app.evaluate(({ webContents }, id) => {
    const contents = webContents.fromId(id);
    contents.focus();
    contents.sendInputEvent({ type: "keyDown", keyCode: "F", modifiers: ["control"] });
    contents.sendInputEvent({ type: "keyUp", keyCode: "F", modifiers: ["control"] });
  }, guest);
  await window.getByRole("textbox", { name: "Find in page", exact: true }).fill("needle");
  await window.getByText("1/3", { exact: true }).waitFor();
  await window.getByRole("button", { name: "Next match", exact: true }).click();
  await window.getByText("2/3", { exact: true }).waitFor();
  await window.getByRole("button", { name: "Close page search" }).click();
  const checkZoom = async (factor) =>
    window.waitForFunction((expected) => {
      const guest = [...document.querySelectorAll("webview")].find(
        (element) => element.getBoundingClientRect().width > 0,
      );
      return guest && Math.abs(guest.getZoomFactor() - expected) < 0.001;
    }, factor);
  await window
    .getByRole("button", { name: "More browser actions" })
    .filter({ visible: true })
    .click();
  await window.getByRole("button", { name: "Zoom in", exact: true }).click();
  await checkZoom(1.1);
  await window.getByRole("button", { name: "Zoom out", exact: true }).click();
  await checkZoom(1);
  await window.getByRole("button", { name: "Zoom in", exact: true }).click();
  await window.getByRole("button", { name: "Reset zoom to 100%", exact: true }).click();
  await checkZoom(1);
  await window.getByRole("button", { name: "Zoom in", exact: true }).click();
  await window.getByRole("button", { name: "Zoom in", exact: true }).click();
  await checkZoom(1.2);
  await window
    .getByRole("button", { name: "More browser actions" })
    .filter({ visible: true })
    .click();
  // Navigate via a link inside the guest and then an in-page anchor.
  await app.evaluate(async ({ webContents }, id) => {
    await webContents.fromId(id).executeJavaScript('document.querySelector("a").click()');
  }, guest);
  await window.getByRole("button", { name: "Next page", exact: true }).waitFor();
  await window.waitForFunction(
    (expected) =>
      JSON.parse(localStorage.getItem("ai-workspace-starter-ui")).state.browserTabs.some(
        (tab) => tab.initialUrl === expected,
      ),
    `${url}next#section`,
  );
  await app.evaluate(async ({ webContents }, id) => {
    await webContents.fromId(id).executeJavaScript('location.hash = "latest"');
  }, guest);
  await window.waitForFunction(
    (expected) =>
      JSON.parse(localStorage.getItem("ai-workspace-starter-ui")).state.browserTabs.some(
        (tab) => tab.initialUrl === expected,
      ),
    `${url}next#latest`,
  );
  await checkZoom(1.2);
  const terminalBefore = await window
    .locator('[data-pane-kind="terminal"] .xterm')
    .filter({ visible: true })
    .elementHandle();
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setBounds({ width: 1900, height: 1000 }),
  );
  const divider = window.getByRole("separator", { name: "Resize browser pane" });
  await divider.focus();
  for (let index = 0; index < 35; index++) await divider.press("ArrowLeft");
  assert.ok(
    (await window
      .locator(".workspace-side-panel")
      .evaluate((element) => element.getBoundingClientRect().width)) > 760,
  );
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].maximize());
  await window.waitForTimeout(300);
  await divider.focus();
  await divider.press("ArrowLeft");
  const availableMax = Number(await divider.getAttribute("aria-valuemax"));
  const maximizedWidth = await window
    .locator(".workspace-side-panel")
    .evaluate((element) => element.getBoundingClientRect().width);
  assert.ok(
    maximizedWidth <= availableMax + 1,
    "maximized pane must fit the display while retaining terminal space",
  );
  if (availableMax > 760) assert.ok(maximizedWidth > 760);
  await window.screenshot({ path: "/tmp/vintage-browser-wide.png" });
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.unmaximize();
    window.setBounds({ width: 1100, height: 800 });
  });
  await window.waitForTimeout(300);
  assert.ok(
    (await window
      .locator("main.relative")
      .evaluate((element) => element.getBoundingClientRect().width)) >= 300,
  );
  assert.ok(
    await terminalBefore.evaluate((element) => element.isConnected),
    "terminal surface must survive pane resizing",
  );
  await app.close();
  app = await launch();
  window = await app.firstWindow();
  await window.getByRole("button", { name: "Next page", exact: true }).waitFor();
  await window.waitForFunction(
    (expected) =>
      [...document.querySelectorAll('input[aria-label="Browser address"]')].some(
        (input) => input.value === expected,
      ),
    `${url}next#latest`,
  );
  await checkZoom(1.2);
  assert.equal(
    await window.locator("webview").count(),
    1,
    "background tabs must stay unloaded after restart",
  );
  await window.getByRole("button", { name: "Bookmarks", exact: true }).click();
  assert.equal(
    await window
      .getByRole("textbox", { name: `Bookmark name for ${url}`, exact: true })
      .inputValue(),
    "My fixture",
  );
  await window.getByRole("button", { name: "New tab", exact: true }).click();
  await window.getByRole("button", { name: "Browser fixture", exact: true }).waitFor();
  await checkZoom(1);
  await window.getByRole("button", { name: "Next page", exact: true }).click();
  await checkZoom(1.2);
  // Common pages keep their guest identity while a project changes.
  await window.getByRole("button", { name: "Next page", exact: true }).click({ button: "right" });
  await window.getByRole("button", { name: "Tab scope", exact: true }).click();
  assert.ok(
    (await window
      .getByRole("menuitemradio", { name: "Home", exact: true })
      .getAttribute("aria-checked")) === "true",
  );
  await window.getByRole("menuitemradio", { name: "Common", exact: true }).click();
  assert.equal(
    await window.getByRole("button", { name: "Tab scope", exact: true }).textContent(),
    "Common",
  );
  await window.keyboard.press("Escape");
  const commonGuest = await window.locator("webview").filter({ visible: true }).elementHandle();
  await window
    .getByRole("button", { name: "More browser actions" })
    .filter({ visible: true })
    .click();
  await window.getByRole("button", { name: "Tab scope", exact: true }).click();
  assert.equal(
    await window
      .getByRole("menuitemradio", { name: "Common", exact: true })
      .getAttribute("aria-checked"),
    "true",
  );
  await window.getByRole("menuitemradio", { name: "Home", exact: true }).click();
  assert.equal(
    await window.getByRole("button", { name: "Tab scope", exact: true }).textContent(),
    "Home",
  );
  await window.getByRole("button", { name: "Tab scope", exact: true }).click();
  await window.getByRole("menuitemradio", { name: "Common", exact: true }).click();
  assert.ok(
    await commonGuest.evaluate((element) => element.isConnected),
    "scope changes must preserve the page",
  );
  await window.getByRole("button", { name: "Bookmark scope", exact: true }).click();
  await window.getByRole("menuitemradio", { name: "Common", exact: true }).click();
  await window.getByRole("button", { name: "Bookmark scope", exact: true }).click();
  await window.keyboard.press("Escape");
  assert.ok(
    await window.getByRole("dialog", { name: "Browser actions", exact: true }).isVisible(),
    "Escape should close only the nested picker",
  );
  await window
    .getByRole("button", { name: "More browser actions" })
    .filter({ visible: true })
    .click();
  await window
    .getByRole("button", { name: "Bookmark page", exact: true })
    .filter({ visible: true })
    .click();
  const projectPath = join(mkdtempSync(join(tmpdir(), "vintage-scope-project-")), "Scope fixture");
  mkdirSync(projectPath);
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, projectPath);
  await window.getByRole("button", { name: "Open folder", exact: true }).click();
  await window.getByRole("button", { name: "Scope fixture", exact: true }).waitFor();
  await window.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem("ai-workspace-starter-ui")).state.browserWorkspaceId !==
      "vintage:home",
  );
  assert.equal(
    await window.getByRole("button", { name: "Browser fixture", exact: true }).count(),
    0,
  );
  assert.ok(await commonGuest.evaluate((element) => element.isConnected));
  await window.getByRole("button", { name: "New browser tab", exact: true }).click();
  await window.getByRole("button", { name: "Browser fixture", exact: true }).waitFor();
  await window
    .getByRole("button", { name: "Bookmark page", exact: true })
    .filter({ visible: true })
    .click();
  const projectTab = await window.evaluate(
    () => JSON.parse(localStorage.getItem("ai-workspace-starter-ui")).state.activeSidePaneTabId,
  );
  await window.getByRole("button", { name: "Home", exact: true }).click();
  await window.getByRole("button", { name: "Next page", exact: true }).waitFor();
  assert.ok(await commonGuest.evaluate((element) => element.isConnected));
  await window.getByRole("button", { name: "Scope fixture", exact: true }).click();
  await window.waitForFunction(
    (id) =>
      JSON.parse(localStorage.getItem("ai-workspace-starter-ui")).state.activeSidePaneTabId === id,
    projectTab,
  );
  await window.getByRole("button", { name: "Bookmarks", exact: true }).click();
  assert.equal(
    await window
      .getByRole("textbox", { name: `Bookmark name for ${url}`, exact: true })
      .inputValue(),
    "Browser fixture",
    "Home bookmark must not leak into this project",
  );
  assert.equal(
    await window
      .getByRole("textbox", { name: `Bookmark name for ${url}next#latest`, exact: true })
      .count(),
    1,
    "Common bookmark must stay available",
  );
  await window
    .getByRole("textbox", { name: `Bookmark name for ${url}`, exact: true })
    .fill("Project docs");
  await app.close();
  app = await launch();
  window = await app.firstWindow();
  await window.waitForFunction(
    (id) =>
      JSON.parse(localStorage.getItem("ai-workspace-starter-ui")).state.activeSidePaneTabId === id,
    projectTab,
  );
  await window.getByRole("button", { name: "Browser fixture", exact: true }).waitFor();
  await window.getByRole("button", { name: "Bookmarks", exact: true }).click();
  assert.equal(
    await window
      .getByRole("textbox", { name: `Bookmark name for ${url}`, exact: true })
      .inputValue(),
    "Project docs",
  );
  await window.getByRole("button", { name: "Next page", exact: true }).click();
  await window.waitForFunction(
    (expected) =>
      [...document.querySelectorAll('input[aria-label="Browser address"]')].some(
        (input) => input.value === expected,
      ),
    `${url}next#latest`,
  );
  const localRoot = mkdtempSync(join(tmpdir(), "vintage local 資料-"));
  const localFile = join(localRoot, "local 資料.html");
  const nextFile = join(localRoot, "next page.html");
  writeFileSync(
    localFile,
    '<title>Local file fixture</title><link rel="stylesheet" href="style.css"><script src="script.js"></script><h1>Local HTML</h1><img src="image.svg"><a href="next page.html#anchor">Next local page</a>',
  );
  writeFileSync(nextFile, '<title>Next local file</title><h1 id="anchor">Local anchor</h1>');
  writeFileSync(join(localRoot, "style.css"), "h1 { color: rgb(12, 34, 56); }");
  writeFileSync(join(localRoot, "script.js"), "window.localReady = true;");
  writeFileSync(
    join(localRoot, "image.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="blue"/></svg>',
  );
  const localUrl = pathToFileURL(localFile).href;
  const nextUrl = `${pathToFileURL(nextFile).href}#anchor`;
  await window.getByRole("button", { name: "New browser tab", exact: true }).click();
  await window.waitForFunction((expected) => {
    try {
      const guest = [...document.querySelectorAll("webview")].find(
        (element) => element.getBoundingClientRect().width > 0,
      );
      return guest && guest.getURL() === expected && !guest.isLoading();
    } catch {
      return false;
    }
  }, url);
  const localAddress = window
    .getByRole("textbox", { name: "Browser address" })
    .filter({ visible: true });
  await localAddress.fill(localUrl);
  await localAddress.press("Enter");
  await window.getByRole("button", { name: "Local file fixture", exact: true }).waitFor();
  await window.waitForFunction((expected) => {
    try {
      const guest = [...document.querySelectorAll("webview")].find(
        (element) => element.getBoundingClientRect().width > 0,
      );
      return guest && guest.getURL() === expected && !guest.isLoading();
    } catch {
      return false;
    }
  }, localUrl);
  const localGuest = await app.evaluate(
    ({ webContents }) =>
      webContents
        .getAllWebContents()
        .find(
          (contents) => contents.getURL().startsWith("file:") && contents.getType() === "webview",
        )?.id,
  );
  const localResult = await app.evaluate(async ({ webContents }, id) => {
    const guest = webContents.fromId(id);
    const page = await guest.executeJavaScript(
      '({ color: getComputedStyle(document.querySelector("h1")).color, ready: window.localReady, image: document.querySelector("img").naturalWidth, require: typeof require, desktop: typeof window.desktop })',
    );
    const preferences = guest.getLastWebPreferences();
    return {
      ...page,
      nodeIntegration: preferences.nodeIntegration,
      sandbox: preferences.sandbox,
      webSecurity: preferences.webSecurity,
      contextIsolation: preferences.contextIsolation,
    };
  }, localGuest);
  assert.deepEqual(localResult, {
    color: "rgb(12, 34, 56)",
    ready: true,
    image: 32,
    require: "undefined",
    desktop: "undefined",
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    contextIsolation: true,
  });
  await window
    .getByRole("button", { name: "Bookmark page", exact: true })
    .filter({ visible: true })
    .click();
  await app.evaluate(
    async ({ webContents }, id) =>
      webContents.fromId(id).executeJavaScript('document.querySelector("a").click()'),
    localGuest,
  );
  await window.getByRole("button", { name: "Next local file", exact: true }).waitFor();
  await window.waitForFunction(
    (expected) =>
      JSON.parse(localStorage.getItem("ai-workspace-starter-ui")).state.browserTabs.some(
        (tab) => tab.initialUrl === expected,
      ),
    nextUrl,
  );
  await app.close();
  app = await launch();
  window = await app.firstWindow();
  await window.getByRole("button", { name: "Next local file", exact: true }).waitFor();
  await window.waitForFunction(
    (expected) =>
      [...document.querySelectorAll('input[aria-label="Browser address"]')].some(
        (input) => input.value === expected,
      ),
    nextUrl,
  );
  await window.getByRole("button", { name: "Bookmarks", exact: true }).click();
  assert.equal(
    await window
      .getByRole("textbox", { name: `Bookmark name for ${localUrl}`, exact: true })
      .inputValue(),
    "Local file fixture",
  );
  assert.deepEqual(errors, []);
  console.log(
    "browser smoke: URL/title restore, lazy tabs, bookmark persistence, guest Ctrl+F, search navigation, per-tab zoom restoration, Common/project switching and bookmarks, wide pane with preserved terminal sessions, and local file resources/restoration/security OK",
  );
} finally {
  if (app) await app.close();
  await new Promise((resolve) => server.close(resolve));
}
