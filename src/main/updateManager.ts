import { spawn } from "node:child_process";

import { app, BrowserWindow, shell } from "electron";
import electronUpdater from "electron-updater";

import { debInstallCommand, describeInstallFailure, type DebInstallOutcome } from "./debInstall.js";
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
  #installing = false;
  #downloadedFile: string | null = null;

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
      this.#downloadedFile = info.downloadedFile;
      this.#setStatus({
        status: "downloaded",
        currentVersion: app.getVersion(),
        availableVersion: info.version,
        installMethod: info.downloadedFile.toLowerCase().endsWith(".deb")
          ? "system-installer"
          : "restart",
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

  async installUpdate(): Promise<void> {
    const current = this.#status;
    if (current.status !== "downloaded" || this.#installing) return;

    const downloadedFile = this.#downloadedFile;
    if (process.platform === "linux" && downloadedFile?.toLowerCase().endsWith(".deb")) {
      this.#installing = true;
      try {
        await this.#installDebUpdate(downloadedFile, current.availableVersion);
      } finally {
        this.#installing = false;
      }
      return;
    }

    autoUpdater.quitAndInstall();
  }

  async #installDebUpdate(downloadedFile: string, availableVersion: string): Promise<void> {
    const outcome = await this.#runPrivilegedInstall(downloadedFile);
    if (outcome.kind === "installed") {
      this.#setStatus({
        status: "downloaded",
        currentVersion: app.getVersion(),
        availableVersion,
        installMethod: "installed",
      });
      return;
    }

    // Without system authorization, hand the package to the desktop installer.
    const failureHint =
      outcome.kind === "failed" ? `Automatic installation failed (${outcome.reason}). ` : "";
    const openError = await shell.openPath(downloadedFile).catch((error) => String(error));
    if (openError) {
      const quotedPath = `'${downloadedFile.replaceAll("'", "'\\''")}'`;
      this.#setStatus({
        status: "error",
        currentVersion: app.getVersion(),
        message:
          `${failureHint}Could not open the downloaded .deb package (${openError}). ` +
          `Install it from a terminal with: sudo apt install -- ${quotedPath}. Then restart VINTAGE.`,
      });
      return;
    }

    this.#setStatus({
      status: "downloaded",
      currentVersion: app.getVersion(),
      availableVersion,
      installMethod: "system-installer",
      ...(outcome.kind === "failed" ? { message: outcome.reason } : {}),
    });
  }

  #runPrivilegedInstall(downloadedFile: string): Promise<DebInstallOutcome> {
    const { command, args } = debInstallCommand(downloadedFile);
    return new Promise((resolve) => {
      let stderr = "";
      const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
      child.on("error", () => resolve({ kind: "unavailable" }));
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr = `${stderr}${chunk.toString()}`.slice(-2000);
      });
      child.on("close", (code) => {
        if (code === 0) resolve({ kind: "installed" });
        else resolve({ kind: "failed", reason: describeInstallFailure(stderr) });
      });
    });
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
