import { _electron as electron } from "playwright-core";
import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
const profile = mkdtempSync(join(tmpdir(), "vintage-monitor-usage-"));
let app;
try {
  app = await electron.launch({
    args: ["--no-sandbox", `--user-data-dir=${profile}`, resolve("dist/main/index.js")],
  });
  // Exercise the renderer/preload/Main boundary without contacting quota providers.
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler("codexbar:usage-get");
    ipcMain.handle("codexbar:usage-get", () => ({
      ok: true,
      snapshot: {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        providers: [
          {
            id: "fixture",
            name: "Usage fixture",
            enabled: true,
            windows: [{ kind: "session", remainingPercent: 72 }],
          },
        ],
      },
    }));
  });
  const page = await app.firstWindow();
  await page.getByRole("button", { name: "Open settings" }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await settings.getByRole("button", { name: "Usage", exact: true }).click();
  await settings.getByRole("switch", { name: "Show Usage in Monitor" }).click();
  await page.keyboard.press("Escape");
  await settings.waitFor({ state: "detached" });
  await page.getByRole("button", { name: "Monitor", exact: true }).click();
  await page.getByText("72% left", { exact: true }).waitFor();
  if (await page.getByRole("button", { name: "Usage", exact: true }).count())
    throw new Error("Usage tab remains");
  await page.getByLabel("Sessions", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Expand monitor" }).click();
  await page.getByRole("dialog").getByText("72% left", { exact: true }).waitFor();
  await page.keyboard.press("Escape");
  // An old saved Usage selection must restore to the merged Monitor tab.
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("ai-workspace-starter-ui"));
    saved.state.activeSidePaneTabId = "usage";
    localStorage.setItem("ai-workspace-starter-ui", JSON.stringify(saved));
  });
  await page.reload();
  await page.getByText("72% left", { exact: true }).waitFor();
  if (
    (await page
      .getByRole("button", { name: "Monitor", exact: true })
      .getAttribute("aria-pressed")) !== "true"
  )
    throw new Error("legacy Usage selection did not migrate");
  await page.screenshot({ path: join(tmpdir(), "vintage-monitor-usage.png") });
  console.log("Usage embedded in Monitor, expanded view and saved selection migration: OK");
} finally {
  if (app) await app.close();
  rmSync(profile, { recursive: true, force: true });
}
