import { _electron as electron } from "playwright-core";
import { resolve } from "node:path";

const mainEntry = resolve("dist/main/index.js");
const args = process.platform === "linux" ? ["--no-sandbox", mainEntry] : [mainEntry];
const app = await electron.launch({ args });
try {
  const window = await app.firstWindow();
  await window.evaluate(() => localStorage.clear());
  await window.reload();
  await window.getByText("Home", { exact: true }).waitFor();
  await window.locator('.workspace-tab[data-active="true"]').waitFor();
  await window.locator('[data-pane-kind="terminal"] .xterm').waitFor();
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
