import { app, BrowserWindow } from "electron";
import electronUpdater from "electron-updater";

import { DesktopChannels, type DesktopUpdateStatus } from "../shared/desktop.js";

const { autoUpdater } = electronUpdater;

export class UpdateManager {
  #status: DesktopUpdateStatus = app.isPackaged
    ? { status: "idle", currentVersion: app.getVersion() }
    : {
        status: "unsupported",
        currentVersion: app.getVersion(),
        message: "Update checks are available in installed VINTAGE builds.",
      };
  #checking = false;
  #downloading = false;

  constructor() {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;

    autoUpdater.on("checking-for-update", () => {
      this.#setStatus({ status: "checking", currentVersion: app.getVersion() });
    });
    autoUpdater.on("update-available", (info) => {
      this.#setStatus({
        status: "available",
        currentVersion: app.getVersion(),
        availableVersion: info.version,
      });
    });
    autoUpdater.on("update-not-available", () => {
      this.#setStatus({ status: "up-to-date", currentVersion: app.getVersion() });
    });
    autoUpdater.on("download-progress", (progress) => {
      const availableVersion = this.#availableVersion();
      if (!availableVersion) return;
      this.#setStatus({
        status: "downloading",
        currentVersion: app.getVersion(),
        availableVersion,
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
      });
    });
    autoUpdater.on("update-downloaded", (info) => {
      this.#setStatus({
        status: "downloaded",
        currentVersion: app.getVersion(),
        availableVersion: info.version,
      });
    });
    autoUpdater.on("update-cancelled", (info) => {
      this.#setStatus({
        status: "available",
        currentVersion: app.getVersion(),
        availableVersion: info.version,
      });
    });
    autoUpdater.on("error", (error) => {
      this.#setStatus({
        status: "error",
        currentVersion: app.getVersion(),
        message: error.message,
      });
    });
  }

  getStatus(): DesktopUpdateStatus {
    return { ...this.#status };
  }

  async checkForUpdates(): Promise<DesktopUpdateStatus> {
    if (!app.isPackaged) return this.getStatus();
    if (this.#checking) return this.getStatus();

    this.#checking = true;
    this.#setStatus({ status: "checking", currentVersion: app.getVersion() });
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      this.#setStatus({
        status: "error",
        currentVersion: app.getVersion(),
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.#checking = false;
    }
    return this.getStatus();
  }

  async downloadUpdate(): Promise<DesktopUpdateStatus> {
    if (process.platform === "darwin") {
      throw new Error("Download the macOS update from the VINTAGE Releases page.");
    }
    if (this.#status.status !== "available") return this.getStatus();
    if (this.#downloading) return this.getStatus();

    this.#downloading = true;
    const availableVersion = this.#status.availableVersion;
    this.#setStatus({
      status: "downloading",
      currentVersion: app.getVersion(),
      availableVersion,
      percent: 0,
      bytesPerSecond: 0,
    });
    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      this.#setStatus({
        status: "error",
        currentVersion: app.getVersion(),
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.#downloading = false;
    }
    return this.getStatus();
  }

  installUpdate(): void {
    if (this.#status.status !== "downloaded") return;
    autoUpdater.quitAndInstall();
  }

  #availableVersion(): string | null {
    if ("availableVersion" in this.#status) return this.#status.availableVersion;
    return null;
  }

  #setStatus(status: DesktopUpdateStatus): void {
    this.#status = status;
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed())
        window.webContents.send(DesktopChannels.updateStatusChanged, status);
    }
  }
}
