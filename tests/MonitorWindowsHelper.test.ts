import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";

const spawn = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ spawn, default: { spawn } }));

function helper() {
  const child = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    stdin: new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    }),
    kill: vi.fn(),
  });
  spawn.mockReturnValue(child);
  return child;
}
const snapshot =
  JSON.stringify({
    version: 1,
    rows: [
      {
        pid: 42,
        parentPid: 1,
        command: "codex.exe",
        argv: ["codex.exe"],
        cwd: "C:\\作業",
        startedAt: 1000,
        cpuPercent: null,
        memoryBytes: 4096,
      },
    ],
  }) + "\n";

afterEach(() => {
  vi.useRealTimers();
  vi.resetModules();
  spawn.mockReset();
});

describe("Windows Monitor helper lifecycle", () => {
  it("coalesces requests, decodes split UTF-8 and retires an idle helper", async () => {
    vi.useFakeTimers();
    const child = helper();
    const { windowsProcessSnapshot } = await import("../src/main/monitorWindows.js");
    const first = windowsProcessSnapshot();
    expect(windowsProcessSnapshot()).toBe(first);
    const bytes = Buffer.from(snapshot);
    const split = bytes.indexOf(Buffer.from("作")) + 1;
    child.stdout.write(bytes.subarray(0, split));
    child.stdout.write(bytes.subarray(split));
    await expect(first).resolves.toMatchObject([{ cwd: "C:\\作業" }]);
    await windowsProcessSnapshot();
    expect(spawn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(15000);
    expect(child.kill).toHaveBeenCalledTimes(1);
  });

  it("rejects timed-out requests and can restart the helper", async () => {
    vi.useFakeTimers();
    const child = helper();
    const { windowsProcessSnapshot } = await import("../src/main/monitorWindows.js");
    const failure = expect(windowsProcessSnapshot()).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(5000);
    await failure;
    expect(child.kill).toHaveBeenCalled();
    const nextChild = helper();
    const next = windowsProcessSnapshot();
    nextChild.stdout.write(snapshot);
    await expect(next).resolves.toHaveLength(1);
    await vi.advanceTimersByTimeAsync(15000);
  });

  it("invalidates cached snapshots after an unexpected helper exit", async () => {
    vi.useFakeTimers();
    const child = helper();
    const { windowsProcessSnapshot } = await import("../src/main/monitorWindows.js");
    const first = windowsProcessSnapshot();
    child.stdout.write(snapshot);
    await first;
    child.emit("exit", 1);
    const nextChild = helper();
    const next = windowsProcessSnapshot();
    nextChild.stdout.write(snapshot);
    await next;
    expect(spawn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(15000);
  });
});
