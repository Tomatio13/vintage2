import { expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const read = () => actual.readFileSync("package.json", "utf8");
  return { ...actual, default: { ...actual, readFileSync: read }, readFileSync: read };
});

vi.mock("electron", () => ({
  app: { isPackaged: false, getVersion: () => "0.0" },
  BrowserWindow: { getAllWindows: () => [] },
  shell: {},
}));
vi.mock("electron-updater", () => ({
  default: { autoUpdater: { on: vi.fn(), checkForUpdates: vi.fn() } },
}));

import { UpdateManager } from "../src/main/updateManager.js";

it("reports the project version in development without invoking the installed updater", async () => {
  const metadata = JSON.parse(readFileSync("package.json", "utf8"));
  const manager = new UpdateManager();
  expect(manager.getStatus()).toMatchObject({
    status: "unsupported",
    currentVersion: metadata.version,
  });
  expect(await manager.checkForUpdates()).toEqual(manager.getStatus());
});
