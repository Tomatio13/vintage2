import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
  readFileSync: vi.fn(),
  quit: vi.fn(),
  relaunch: vi.fn(),
}));
const lifecycle = new EventEmitter();
vi.mock("node:child_process", () => ({ spawn: mocks.spawn, default: { spawn: mocks.spawn } }));
vi.mock("node:fs", () => ({
  readFileSync: mocks.readFileSync,
  default: { readFileSync: mocks.readFileSync },
}));
vi.mock("electron", () => ({
  app: {
    once: (...args: Parameters<typeof lifecycle.once>) => lifecycle.once(...args),
    quit: mocks.quit,
    relaunch: mocks.relaunch,
  },
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  lifecycle.removeAllListeners();
  vi.stubGlobal("process", { ...process, platform: "linux" });
  mocks.readFileSync.mockReturnValue("Name:\tvintage\nNoNewPrivs:\t0\n");
  mocks.spawn.mockReturnValue({ on: vi.fn(), unref: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());

describe("application restart", () => {
  it("waits for quit and launches only once without Electron's relauncher", async () => {
    const { restartApp } = await import("../src/main/restartApp.js");
    restartApp();
    restartApp();
    expect(mocks.quit).toHaveBeenCalledTimes(1);
    expect(mocks.spawn).not.toHaveBeenCalled();
    expect(mocks.relaunch).not.toHaveBeenCalled();
    lifecycle.emit("quit");
    lifecycle.emit("quit");
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
    expect(mocks.spawn).toHaveBeenCalledWith(
      "/bin/sh",
      [
        "-c",
        expect.any(String),
        "vintage-restart",
        String(process.pid),
        process.execPath,
        ...process.argv.slice(1),
      ],
      { detached: true, stdio: "ignore" },
    );
  });

  it("keeps the application open if it already inherited restricted privileges", async () => {
    mocks.readFileSync.mockReturnValue("NoNewPrivs:\t1\n");
    const { restartApp } = await import("../src/main/restartApp.js");
    expect(restartApp).toThrow("reopen it from your desktop");
    expect(mocks.quit).not.toHaveBeenCalled();
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it("preserves the native restart on other platforms", async () => {
    vi.stubGlobal("process", { ...process, platform: "darwin" });
    const { restartApp } = await import("../src/main/restartApp.js");
    restartApp();
    expect(mocks.relaunch).toHaveBeenCalledOnce();
    expect(mocks.quit).toHaveBeenCalledOnce();
    expect(mocks.readFileSync).not.toHaveBeenCalled();
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
});
