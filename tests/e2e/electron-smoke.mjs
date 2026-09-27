import { _electron as electron } from "playwright-core";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const mainEntry = resolve("dist/main/index.js");
// Isolate the profile so the smoke always sees a first-run state; the real
// profile's workspace-state.json would restore other workspaces and break
// the Home-first assumptions below.
const userDataDir = mkdtempSync(join(tmpdir(), "vintage-smoke-"));
const args =
  process.platform === "linux"
    ? ["--no-sandbox", `--user-data-dir=${userDataDir}`, mainEntry]
    : [`--user-data-dir=${userDataDir}`, mainEntry];
const app = await electron.launch({ args });
try {
  const window = await app.firstWindow();
  await window.evaluate(() => localStorage.clear());
  await window.reload();
  await window.getByText("Home", { exact: true }).waitFor();
  await window.locator('.workspace-tab[data-active="true"]').waitFor();
  await window.locator('[data-pane-kind="terminal"] .xterm').filter({ visible: true }).waitFor();
  await window.getByText("Home directory", { exact: true }).waitFor();
  const home = await window.evaluate(async () => {
    const workspace = await window.desktop.getHomeWorkspace();
    const entries = await window.desktop.listWorkspaceFiles(workspace.id);
    let rejectsOutsidePath = false;
    try {
      await window.desktop.listWorkspaceFiles(workspace.id, "../");
    } catch {
      rejectsOutsidePath = true;
    }
    return {
      name: workspace.name,
      kind: workspace.kind,
      path: workspace.path,
      directoriesLoadLazily: entries.every((entry) => !entry.children),
      rejectsOutsidePath,
    };
  });
  if (home.name !== "Home" || home.kind !== "home" || !home.path) {
    throw new Error("default local space did not resolve to the user's Home directory");
  }
  if (!home.directoriesLoadLazily) {
    throw new Error("Home Files eagerly loaded nested directories");
  }
  if (!home.rejectsOutsidePath) {
    throw new Error("Home Files accepted a path outside the selected root");
  }
  const terminalHeader = window.locator(
    '[data-pane-kind="terminal"] button[title="Double-click to rename"]',
  );
  await window.waitForFunction(
    (homePath) =>
      document
        .querySelector('[data-pane-kind="terminal"] button[title="Double-click to rename"]')
        ?.textContent?.includes(homePath),
    home.path,
  );
  await terminalHeader.waitFor();
  // Terminal sessions must survive a renderer reload: a marker is typed into
  // the shell and later looked up through the buffer-wide search (terminal
  // output lives on the WebGL canvas, so DOM text queries cannot see it).
  const terminalSurface = window
    .locator('[data-pane-kind="terminal"] .xterm')
    .filter({ visible: true });
  const assertMarkerInBuffer = async () => {
    await window.getByRole("button", { name: "Find in terminal" }).click();
    await window.getByPlaceholder("Find in terminal").fill("VINTAGE_REATTACH_MARKER");
    await window.waitForTimeout(300);
    if ((await window.getByText("No results").count()) > 0) {
      throw new Error("terminal buffer did not contain the reattach marker");
    }
    await window.getByRole("button", { name: "Close search" }).click();
  };
  await terminalSurface.click();
  await window.keyboard.type("echo VINTAGE_REATTACH_MARKER\r");
  await assertMarkerInBuffer();
  // Renaming the pane after its session started must not break reconnection:
  // sessions match by pane id, not by the (possibly renamed) titles.
  await window.locator('button[title="Double-click to rename"]').dblclick();
  const renameInput = window.getByRole("textbox", { name: "Rename Terminal 1" });
  await renameInput.fill("Renamed Terminal");
  await renameInput.press("Enter");
  await window.waitForTimeout(500);
  await window.reload();
  await terminalSurface.waitFor();
  await window.waitForFunction(() => {
    const header = document.querySelector(
      '[data-pane-kind="terminal"] button[title="Double-click to rename"]',
    )?.textContent;
    return Boolean(header?.includes("reconnected") && header.includes("Renamed Terminal"));
  });
  await assertMarkerInBuffer();
  const brandIcon = window.getByRole("button", { name: "Toggle sidebar" }).locator("img");
  await brandIcon.waitFor();
  if ((await brandIcon.evaluate((image) => image.naturalWidth)) === 0) {
    throw new Error("VINTAGE brand icon did not load");
  }
  const chrome = await window.evaluate(() => {
    const shell = document.querySelector(".vintage-window-shell");
    const card = document.querySelector(".vintage-content-card");
    const sidePanel = document.querySelector(".workspace-side-panel");
    if (
      !(shell instanceof HTMLElement) ||
      !(card instanceof HTMLElement) ||
      !(sidePanel instanceof HTMLElement)
    ) {
      throw new Error("window chrome elements were not rendered");
    }
    return {
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      shellRadius: getComputedStyle(shell).borderRadius,
      shellClipPath: getComputedStyle(shell).clipPath,
      cardRadius: getComputedStyle(card).borderRadius,
      sidePanelRadius: getComputedStyle(sidePanel).borderRadius,
    };
  });
  if (process.platform === "linux") {
    if (chrome.bodyBackground !== "rgba(0, 0, 0, 0)")
      throw new Error("expected a transparent page background, got " + chrome.bodyBackground);
    if (chrome.shellRadius !== "16px")
      throw new Error("expected a 16px Linux shell radius, got " + chrome.shellRadius);
    if (!chrome.shellClipPath.includes("16px"))
      throw new Error("expected a 16px Linux shell clip, got " + chrome.shellClipPath);
    if (chrome.cardRadius !== "12px")
      throw new Error("expected a 12px content radius, got " + chrome.cardRadius);
    if (chrome.sidePanelRadius !== "12px")
      throw new Error("expected a 12px side panel radius, got " + chrome.sidePanelRadius);
  }
  await window.getByRole("button", { name: "Open settings" }).click();
  await window.getByRole("dialog", { name: "Settings" }).waitFor();
  await window.getByRole("button", { name: /Graphite A neutral charcoal workspace/ }).waitFor();
  await window.getByRole("button", { name: "Attention" }).click();
  await window.getByLabel("Attention debounce").waitFor();
  await window.getByLabel("Attention threshold").waitFor();
  await window.getByLabel("Desktop notification threshold").waitFor();
  await window.getByRole("button", { name: "Integrations" }).click();
  await window.getByText("TypeSafe / Jev").waitFor();
  await window.getByText(/Saved securely|Environment variable|Not configured/).waitFor();
  await window.getByLabel("TypeSafe API key").waitFor();
  console.log("electron smoke: Home terminal, appearance, attention, and Jev settings OK");
} finally {
  await app.close();
}
