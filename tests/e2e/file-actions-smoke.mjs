import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron } from "playwright-core";

const root = await mkdtemp(join(tmpdir(), "vintage-file-actions-"));
const profile = await mkdtemp(join(tmpdir(), "vintage-file-actions-profile-"));
await writeFile(join(root, "seed.txt"), "keep");
const app = await electron.launch({
  args: [
    ...(process.platform === "linux" ? ["--no-sandbox"] : []),
    `--user-data-dir=${profile}`,
    resolve("dist/main/index.js"),
  ],
});
try {
  const window = await app.firstWindow();
  await window.locator('[data-pane-kind="terminal"] .xterm').filter({ visible: true }).waitFor();
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, root);
  await window.getByRole("button", { name: "Open folder", exact: true }).click();
  await window.getByRole("button", { name: "Files", exact: true }).click();
  const seed = window.getByRole("button", { name: "seed.txt", exact: true });
  await seed.waitFor();
  await seed.click({ button: "right" });
  await window.getByRole("menuitem", { name: "New folder…", exact: true }).click();
  await window.getByRole("textbox", { name: "Folder name", exact: true }).fill("created");
  await window.getByRole("button", { name: "Create", exact: true }).click();
  const folder = window.getByRole("button", { name: "created", exact: true });
  await folder.waitFor();
  assert.equal((await stat(join(root, "created"))).isDirectory(), true);
  await folder.click({ button: "right" });
  await window.getByRole("menuitem", { name: "New file…", exact: true }).click();
  await window.getByRole("textbox", { name: "File name", exact: true }).fill("empty.txt");
  await window.getByRole("button", { name: "Create", exact: true }).click();
  await window.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(await readFile(join(root, "created/empty.txt"), "utf8"), "");
  await folder.click({ button: "right" });
  await window.getByRole("menuitem", { name: "Delete…", exact: true }).click();
  await window.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal((await stat(join(root, "created"))).isDirectory(), true);
  await folder.click({ button: "right" });
  await window.getByRole("menuitem", { name: "Delete…", exact: true }).click();
  await window.getByRole("button", { name: "Move to Trash", exact: true }).click();
  await folder.waitFor({ state: "hidden" });
  await assert.rejects(stat(join(root, "created")), { code: "ENOENT" });
  assert.equal(await readFile(join(root, "seed.txt"), "utf8"), "keep");
  console.log(
    "file actions smoke: folder/file creation, delete cancellation, nonempty folder Trash and tree refresh OK",
  );
} finally {
  await app.close();
}
