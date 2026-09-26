import { describe, expect, it, vi, beforeEach } from "vitest";

const execFileMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  default: {
    execFile: execFileMock,
  },
  execFile: execFileMock,
}));

import { fetchCodexbarUsage, probeCodexbarStatus } from "../src/main/codexbarClient.js";

const validSnapshot = {
  schemaVersion: 1,
  generatedAt: "2026-09-26T00:00:00Z",
  host: { codexBarVersion: "0.157.0" },
  providers: [
    {
      id: "codex",
      name: "Codex",
      enabled: true,
      windows: [],
    },
  ],
};

function mockSuccess(stdout: string): void {
  execFileMock.mockImplementation(
    (_file: string, _args: string[], _options: unknown, callback: unknown) => {
      (callback as (error: null, value: { stdout: string; stderr: string }) => void)(null, {
        stdout,
        stderr: "",
      });
    },
  );
}

function mockFailure(error: Record<string, unknown>): void {
  execFileMock.mockImplementation(
    (_file: string, _args: string[], _options: unknown, callback: unknown) => {
      const thrown = Object.assign(new Error(String(error.message ?? "failed")), error);
      (callback as (error: Error, value: undefined) => void)(thrown, undefined);
    },
  );
}

beforeEach(() => {
  execFileMock.mockReset();
});

describe("codexbar client", () => {
  it("reports not-configured when auto-detection finds no binary", async () => {
    mockFailure({ code: "ENOENT" });
    await expect(fetchCodexbarUsage("")).resolves.toMatchObject({
      ok: false,
      errorKind: "not-configured",
    });
    expect(execFileMock).toHaveBeenCalledTimes(4);
    expect(execFileMock.mock.calls[0]?.[1]).toEqual(["--version"]);
  });

  it("auto-detects the first runnable candidate and parses the dashboard snapshot", async () => {
    mockSuccess(JSON.stringify(validSnapshot));
    // First call is the --version probe for the "codexbar" PATH candidate, second is dashboard.
    const result = await fetchCodexbarUsage("");
    expect(result).toMatchObject({
      ok: true,
      snapshot: { schemaVersion: 1, providers: [{ id: "codex" }] },
    });
    expect(execFileMock.mock.calls[0]?.[0]).toBe("codexbar");
    expect(execFileMock.mock.calls[0]?.[1]).toEqual(["--version"]);
    expect(execFileMock.mock.calls[1]?.[1]).toEqual(["dashboard"]);
  });

  it("uses the configured path directly without probing", async () => {
    mockSuccess(JSON.stringify(validSnapshot));
    const result = await fetchCodexbarUsage("/usr/local/bin/codexbar");
    expect(result).toMatchObject({ ok: true });
    expect(execFileMock).toHaveBeenCalledTimes(1);
    expect(execFileMock.mock.calls[0]?.[0]).toBe("/usr/local/bin/codexbar");
    expect(execFileMock.mock.calls[0]?.[1]).toEqual(["dashboard"]);
  });

  it("expands a home-relative configured path", async () => {
    mockSuccess(JSON.stringify(validSnapshot));
    await fetchCodexbarUsage("~/bin/codexbar");
    expect(String(execFileMock.mock.calls[0]?.[0])).toMatch(/\/bin\/codexbar$/u);
    expect(String(execFileMock.mock.calls[0]?.[0])).not.toContain("~");
  });

  it("maps invalid JSON to parse-error", async () => {
    mockSuccess("not json at all");
    const result = await fetchCodexbarUsage("/usr/local/bin/codexbar");
    expect(result).toMatchObject({ ok: false, errorKind: "parse-error" });
  });

  it("rejects documents with an unrecognized schema version", async () => {
    mockSuccess(JSON.stringify({ ...validSnapshot, schemaVersion: 2 }));
    const result = await fetchCodexbarUsage("/usr/local/bin/codexbar");
    expect(result).toMatchObject({ ok: false, errorKind: "parse-error" });
  });

  it("maps a missing binary to not-found", async () => {
    mockFailure({ code: "ENOENT" });
    const result = await fetchCodexbarUsage("/usr/local/bin/codexbar");
    expect(result).toMatchObject({
      ok: false,
      errorKind: "not-found",
      resolvedPath: "/usr/local/bin/codexbar",
    });
  });

  it("maps a killed child to timeout", async () => {
    mockFailure({ killed: true });
    const result = await fetchCodexbarUsage("/usr/local/bin/codexbar");
    expect(result).toMatchObject({ ok: false, errorKind: "timeout" });
  });

  it("maps non-zero exit codes to exec-failed with the last stderr line", async () => {
    mockFailure({ code: 1, stderr: "warning line\nboom: provider exploded" });
    const result = await fetchCodexbarUsage("/usr/local/bin/codexbar");
    expect(result).toMatchObject({
      ok: false,
      errorKind: "exec-failed",
      message: expect.stringContaining("boom: provider exploded"),
    });
  });

  it("reports a detected binary and version for status probes", async () => {
    mockSuccess("codexbar 0.157.0\n");
    await expect(probeCodexbarStatus("/usr/local/bin/codexbar")).resolves.toEqual({
      found: true,
      resolvedPath: "/usr/local/bin/codexbar",
      version: "codexbar 0.157.0",
    });
  });

  it("reports not-found when no candidate answers the version probe", async () => {
    mockFailure({ code: "ENOENT" });
    const result = await probeCodexbarStatus("");
    expect(result).toMatchObject({ found: false });
  });
});
