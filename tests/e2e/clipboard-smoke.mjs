import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron } from "playwright-core";

const profile = await mkdtemp(join(tmpdir(), "vintage-clipboard-smoke-"));
let app;
let imagePath;
try {
  app = await electron.launch({
    args: ["--no-sandbox", `--user-data-dir=${profile}`, resolve("dist/main/index.js")],
  });
  const page = await app.firstWindow();
  await page.locator('[data-pane-kind="terminal"] .xterm').first().waitFor();
  await app.evaluate(async ({ clipboard, ClipboardItem }) => {
    globalThis.clipboardSmokeBackup = await Promise.all(
      (await clipboard.read()).map(
        async (item) =>
          new ClipboardItem(
            Object.fromEntries(
              await Promise.all(item.types.map(async (type) => [type, await item.getType(type)])),
            ),
          ),
      ),
    );
  });
  const session = await page.evaluate(async () => {
    const workspace = await window.desktop.getHomeWorkspace();
    return window.desktop.createTerminal({
      workspaceId: workspace.id,
      paneId: "clipboard-smoke",
      cols: 80,
      rows: 24,
    });
  });
  const paste = () => page.evaluate((id) => window.desktop.pasteTerminalClipboard(id), session.id);
  await page.evaluate(() => window.desktop.writeClipboardText("Electron clipboard smoke"));
  assert.equal(
    await app.evaluate(({ clipboard }) => clipboard.readText()),
    "Electron clipboard smoke",
  );
  assert.deepEqual(await paste(), { kind: "text", text: "Electron clipboard smoke" });
  await app.evaluate(async ({ clipboard, ClipboardItem, nativeImage }) => {
    const image = nativeImage.createFromPath("build/icon.png");
    await clipboard.write([
      new ClipboardItem({
        "image/png": new Blob([image.toPNG()], { type: "image/png" }),
        "text/plain": "image takes priority",
      }),
    ]);
  });
  const image = await paste();
  assert.equal(image.kind, "image");
  imagePath = image.filePath;
  assert.equal((await readFile(imagePath)).subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  await app.evaluate(async ({ clipboard }) => clipboard.writeText("x".repeat(1024 * 1024 + 1)));
  await assert.rejects(paste(), /1 MiB/);
  // Keep clipboard ownership: desktop clipboard managers can restore an image
  // when the clipboard is cleared. A non-text format has no pasteable content.
  await app.evaluate(({ clipboard, ClipboardItem }) =>
    clipboard.write([new ClipboardItem({ "application/x-vintage-test": "empty" })]),
  );
  assert.deepEqual(await paste(), { kind: "empty" });
  await page.evaluate((id) => window.desktop.closeTerminal(id), session.id);
  console.log(
    "clipboard smoke: text copy/paste, image priority/PNG, size limit, empty clipboard passed",
  );
} finally {
  if (app) {
    try {
      await app.evaluate(async ({ clipboard }) => {
        if (globalThis.clipboardSmokeBackup) await clipboard.write(globalThis.clipboardSmokeBackup);
      });
    } finally {
      await app.close();
    }
  }
  if (imagePath) await rm(imagePath, { force: true });
  await rm(profile, { recursive: true, force: true });
}
