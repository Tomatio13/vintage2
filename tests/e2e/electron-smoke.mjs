import { _electron as electron } from "playwright-core";
import { resolve } from "node:path";

const mainEntry = resolve("dist/main/index.js");
const args = process.platform === "linux" ? ["--no-sandbox", mainEntry] : [mainEntry];
const app = await electron.launch({ args });
try {
  const window = await app.firstWindow();
  await window.evaluate(() => localStorage.clear());
  await window.reload();
  await window.getByText("Your workspace, ready when you are").waitFor();
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
  console.log("electron smoke: VINTAGE landing workspace and appearance settings OK");
} finally {
  await app.close();
}
