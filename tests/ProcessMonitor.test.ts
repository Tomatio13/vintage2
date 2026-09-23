import { describe, expect, it } from "vitest";

import { inspectForegroundProcess, parseProcessRows } from "../src/main/processMonitor.js";

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
});
