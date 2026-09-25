import { describe, expect, it } from "vitest";

import {
  foregroundSnapshotFor,
  inspectForegroundProcess,
  parseProcessRows,
} from "../src/main/processMonitor.js";

describe("process monitor", () => {
  it("parses only well-formed process rows", () => {
    expect(parseProcessRows("  10  1 zsh\ninvalid\n  12 10 node\n")).toEqual([
      { pid: 10, parentPid: 1, command: "zsh" },
      { pid: 12, parentPid: 10, command: "node" },
    ]);
  });

  it("fails closed for an unavailable terminal pid", async () => {
    await expect(inspectForegroundProcess(0)).resolves.toBeNull();
  });

  it("builds a foreground snapshot from shared process rows", () => {
    const rows = [
      { pid: 1, parentPid: 0, command: "zsh" },
      { pid: 10, parentPid: 1, command: "node" },
      { pid: 12, parentPid: 10, command: "claude", args: "node /usr/local/bin/claude" },
    ];

    expect(foregroundSnapshotFor(1, rows)).toEqual({
      process: "claude",
      tree: ["node", "claude"],
      agentCli: true,
    });
    expect(foregroundSnapshotFor(0, rows)).toBeNull();
  });

  it("does not treat a plain runtime process as an agent CLI", () => {
    const rows = [
      { pid: 1, parentPid: 0, command: "zsh" },
      { pid: 10, parentPid: 1, command: "node", args: "node server.js" },
    ];

    expect(foregroundSnapshotFor(1, rows)).toMatchObject({
      process: "node",
      agentCli: false,
    });
  });
});
