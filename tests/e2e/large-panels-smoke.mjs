import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron } from "playwright-core";

const root = await mkdtemp(join(tmpdir(), "vintage-large-panels-"));
const profile = await mkdtemp(join(tmpdir(), "vintage-large-profile-"));
const server = createServer((_request, response) => {
  response.setHeader("content-type", "text/html");
  response.end(
    '<title>Local page</title><input id="draft" aria-label="Draft"><script>let n=0;setInterval(()=>document.title="Local page "+n++,20)</script>',
  );
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}/page`;
let app;
try {
  await mkdir(join(root, "folder"));
  for (let start = 0; start < 15000; start += 100) {
    await Promise.all(
      Array.from({ length: 100 }, (_, offset) => {
        const i = start + offset;
        return writeFile(
          join(
            root,
            i < 12000 ? `file-${String(i).padStart(5, "0")}.txt` : `folder/child-${i - 12000}.txt`,
          ),
          "small text\n",
        );
      }),
    );
  }
  await writeFile(
    join(root, "a-source.ts"),
    Array.from({ length: 20000 }, (_, i) =>
      i === 0 ? "same_marker SAME_MARKER" : i === 8500 || i === 19000 ? "far_marker" : `line_${i}`,
    ).join("\n"),
  );
  app = await electron.launch({
    args: [
      ...(process.platform === "linux" ? ["--no-sandbox"] : []),
      `--user-data-dir=${profile}`,
      resolve("dist/main/index.js"),
    ],
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.evaluate((url) => {
    localStorage.clear();
    localStorage.setItem(
      "ai-workspace-starter-ui",
      JSON.stringify({
        version: 0,
        state: {
          activeSidePaneTabId: "files",
          sidePaneOpen: true,
          sidePaneWidth: 500,
          browserDefaultUrl: url,
          browserTabs: [{ id: "browser-1", title: "Local page", initialUrl: url, mounted: false }],
          browserBookmarks: Array.from({ length: 1000 }, (_, i) => ({
            title: `Saved ${i}`,
            url: `${url}?bookmark=${i}`,
          })),
        },
      }),
    );
  }, url);
  await page.reload();
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.setSize(1600, 1000);
    window.show();
    window.focus();
    window.webContents.setBackgroundThrottling(false);
  });
  await page.locator('[data-pane-kind="terminal"] .xterm').filter({ visible: true }).waitFor();
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, root);
  await page.getByRole("button", { name: "Open folder", exact: true }).click();
  await page.getByRole("button", { name: "a-source.ts", exact: true }).waitFor();
  const files = page.locator("[data-files-scroll]");
  const renderedFiles = async () => page.locator("[data-files-rows] button").count();
  const initialRows = await renderedFiles();
  assert.ok(initialRows < 80, `rendered ${initialRows} file rows`);
  await files.evaluate((element) => {
    element.scrollTop = 11000 * 32;
  });
  await page.getByRole("button", { name: "file-11000.txt", exact: true }).waitFor();
  assert.ok((await renderedFiles()) < 80);
  await files.evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.getByRole("button", { name: "a-source.ts", exact: true }).dblclick();
  await page.getByText("same_marker SAME_MARKER", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Find in file", exact: true }).click();
  assert.ok((await page.locator("[data-code-line]").count()) <= 600);
  await page.getByRole("textbox", { name: "Find in file", exact: true }).fill("same_marker");
  await page.getByText("1 / 2", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Next match", exact: true }).click();
  await page.waitForFunction(() =>
    [...CSS.highlights.entries()].some(
      ([name, highlight]) =>
        name.startsWith("source-active-") &&
        [...highlight].some((range) => range.toString() === "SAME_MARKER"),
    ),
  );
  await page.getByRole("textbox", { name: "Find in file", exact: true }).fill("far_marker");
  await page.getByText("1 / 2", { exact: true }).waitFor();
  await page.locator('[data-code-line="8501"]').waitFor();
  await page.getByRole("button", { name: "Next match", exact: true }).click();
  await page.locator('[data-code-line="19001"]').waitFor();
  assert.ok((await page.locator("[data-code-line]").count()) <= 600);
  const source = page.locator("[data-source-scroll]");
  const sourcePages = page.getByRole("navigation", { name: "Source pages" });
  await sourcePages.getByRole("button", { name: "Next", exact: true }).click();
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await source.evaluate((host) => {
    host.scrollTop = 150;
  });
  const beforeClose = await source.evaluate((host) => ({
    line: host.querySelector("[data-code-line]").dataset.codeLine,
    top: host.scrollTop,
  }));
  await page.getByRole("button", { name: "Close search", exact: true }).click();
  assert.deepEqual(
    await source.evaluate((host) => ({
      line: host.querySelector("[data-code-line]").dataset.codeLine,
      top: host.scrollTop,
    })),
    beforeClose,
  );
  await sourcePages.getByRole("button", { name: "Previous", exact: true }).click();
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  // Crossing a window boundary keeps the first visible row at the same pixel offset.
  for (const direction of [1, -1]) {
    const anchor = await source.evaluate((host, direction) => {
      host.scrollTop = direction > 0 ? host.scrollHeight - host.clientHeight - 20 : 50;
      const top = host.getBoundingClientRect().top;
      const row = [...host.querySelectorAll("[data-code-line]")].find(
        (row) => row.getBoundingClientRect().bottom > top,
      );
      return {
        first: host.querySelector("[data-code-line]").dataset.codeLine,
        line: row.dataset.codeLine,
        offset: row.getBoundingClientRect().top - top,
      };
    }, direction);
    await page.waitForFunction(
      (first) =>
        document.querySelector("[data-source-scroll] [data-code-line]").dataset.codeLine !== first,
      anchor.first,
    );
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    const after = await source.evaluate(
      (host, line) =>
        host.querySelector(`[data-code-line="${line}"]`).getBoundingClientRect().top -
        host.getBoundingClientRect().top,
      anchor.line,
    );
    assert.ok(
      Math.abs(after - anchor.offset) < 2,
      `source anchor moved by ${after - anchor.offset}px`,
    );
    assert.ok((await page.locator("[data-code-line]").count()) <= 600);
  }
  await page.getByRole("button", { name: "folder", exact: true }).click();
  await page.getByRole("button", { name: "child-0.txt", exact: true }).waitFor();
  assert.ok((await renderedFiles()) < 80);
  await page.screenshot({ path: "/tmp/vintage-large-files-smoke.png" });

  const tabs = page.getByRole("group", { name: "Browser tabs", exact: true });
  await tabs.locator("div").first().getByRole("button").first().click();
  for (let i = 0; i < 8; i++)
    await page.getByRole("button", { name: "New browser tab", exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll("webview").length === 9);
  await app.evaluate(async ({ webContents }) => {
    for (const guest of webContents
      .getAllWebContents()
      .filter((contents) => contents.getType() === "webview")) {
      if (guest.isLoading())
        await new Promise((resolve) => guest.once("did-stop-loading", resolve));
      await guest.executeJavaScript('document.querySelector("#draft").value="preserved draft"');
    }
  });
  await page.getByRole("button", { name: "Bookmarks", exact: true }).click();
  assert.equal(await page.getByRole("textbox", { name: /^Bookmark name/ }).count(), 50);
  await page.getByRole("textbox", { name: "Filter bookmarks", exact: true }).fill("Saved 999");
  assert.equal(await page.getByRole("textbox", { name: /^Bookmark name/ }).count(), 1);
  await page.getByRole("button", { name: "Close bookmarks", exact: true }).click();
  await page.waitForTimeout(1500);
  assert.ok((await renderedFiles()) < 80);
  await page.getByRole("button", { name: "More browser actions", exact: true }).click();
  await page.getByRole("button", { name: /^Suspend background tabs/ }).click();
  await page.waitForFunction(() => document.querySelectorAll("webview").length === 1);
  const retainedDrafts = await app.evaluate(async ({ webContents }) =>
    Promise.all(
      webContents
        .getAllWebContents()
        .filter((contents) => contents.getType() === "webview")
        .map((guest) => guest.executeJavaScript('document.querySelector("#draft").value')),
    ),
  );
  assert.deepEqual(retainedDrafts, ["preserved draft"]);
  await tabs.locator("div").first().getByRole("button").first().click();
  await page.waitForFunction(() => document.querySelectorAll("webview").length === 2);
  await app.evaluate(async ({ webContents }) => {
    const guests = webContents
      .getAllWebContents()
      .filter((contents) => contents.getType() === "webview");
    for (const guest of guests)
      if (guest.isLoading())
        await new Promise((resolve) => guest.once("did-stop-loading", resolve));
  });
  await page.getByRole("button", { name: "Files", exact: true }).click();
  assert.equal(
    await page.getByRole("button", { name: "folder", exact: true }).getAttribute("aria-expanded"),
    "true",
  );
  await page.getByRole("button", { name: "child-0.txt", exact: true }).waitFor();
  await page.waitForTimeout(3500);
  assert.ok((await renderedFiles()) < 80);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      files: 15001,
      initialRows,
      finalRows: await renderedFiles(),
      sourceLines: 20000,
      mountedTabsBefore: 9,
      mountedTabsAfterSuspension: 1,
      result:
        "virtual scrolling, nested folders, full source search, bookmarks and tab suspension OK",
    }),
  );
} catch (error) {
  if (app) {
    const page = await app.firstWindow();
    await page.screenshot({ path: "/tmp/vintage-large-panels-failure.png" }).catch(() => {});
  }
  throw error;
} finally {
  if (app) await app.close();
  await new Promise((resolve) => server.close(resolve));
  await rm(root, { recursive: true, force: true });
  await rm(profile, { recursive: true, force: true });
}
