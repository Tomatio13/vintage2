import { describe, expect, it } from "vitest";
import {
  analysisCliCandidates,
  resolveAnalysisCommand,
} from "../src/main/sessionAnalysisCommand.js";

describe("cross-platform analysis CLI launch", () => {
  it.each(["codex", "claude"] as const)(
    "launches Windows npm %s without a shell and preserves complex argv",
    (cli) => {
      const base = "C:\\Users\\日本語 & %TEMP% !\\AppData\\Roaming\\npm";
      const shim = `${base}\\${cli}.cmd`;
      const entry = `${base}\\node_modules\\${cli === "codex" ? "@openai\\codex\\bin\\codex.js" : "@anthropic-ai\\claude-code\\cli.js"}`;
      const args = [
        "--json-schema",
        JSON.stringify({ type: "object", description: '日本語 " & %TEMP% ! ^ | > $(echo hi)' }),
        "--model",
        "model & quoted",
        "",
      ];
      const command = resolveAnalysisCommand(shim, args, {
        cli,
        platform: "win32",
        home: "C:\\Users\\日本語 & %TEMP% !",
        env: { Path: "C:\\Program Files\\nodejs", AUTH_MARKER: "retained", CLAUDECODE: "parent" },
        executable: (file) => file === shim,
        isFile: (file) => [entry, "C:\\Program Files\\nodejs\\node.exe"].includes(file),
      });
      expect(command.file).toBe("C:\\Program Files\\nodejs\\node.exe");
      expect(command.args).toEqual([entry, ...args]);
      expect(command.env.AUTH_MARKER).toBe("retained");
      expect(command.env).not.toHaveProperty("CLAUDECODE");
      expect(command.env).not.toHaveProperty("PATH");
    },
  );
  it("supports native Windows binaries, UNC paths and home-relative custom paths", () => {
    const file = "\\\\server\\tools\\claude.exe";
    expect(
      resolveAnalysisCommand(file, ["-p"], {
        cli: "claude",
        platform: "win32",
        env: {},
        executable: (candidate) => candidate === file,
      }).file,
    ).toBe(file);
    expect(
      analysisCliCandidates("claude", "~\\.local\\bin\\claude.exe", {
        platform: "win32",
        home: "C:\\Users\\Test",
      }),
    ).toEqual(["C:\\Users\\Test\\.local\\bin\\claude.exe"]);
  });
  it.each(["/opt/homebrew/bin/codex", "/usr/local/bin/codex", "/Users/test/.local/bin/codex"])(
    "finds macOS GUI CLI at %s and preserves its runtime PATH",
    (installed) => {
      const options = {
        platform: "darwin" as const,
        home: "/Users/test",
        env: {
          PATH: "/usr/bin:/bin",
          CODEX_HOME: "/custom-codex",
          NODE_OPTIONS: "--require parent-agent",
        },
        executable: (candidate: string) => candidate === installed,
      };
      expect(analysisCliCandidates("codex", "", options)).toEqual([installed]);
      const command = resolveAnalysisCommand(installed, ["exec", "-"], options);
      expect(command.file).toBe(installed);
      expect(command.env.PATH).toContain("/opt/homebrew/bin");
      expect(command.env.PATH).toContain("/usr/local/bin");
      expect(command.env.CODEX_HOME).toBe("/custom-codex");
      expect(command.env).not.toHaveProperty("NODE_OPTIONS");
    },
  );
  it("discovers macOS nvm installations with a minimal GUI PATH", () => {
    const nvm = "/Users/test/Node installs";
    const installed = `${nvm}/versions/node/v24.15.0/bin/codex`;
    const options = {
      platform: "darwin" as const,
      home: "/Users/test",
      env: { PATH: "/usr/bin:/bin", NVM_DIR: nvm },
      readDirectories: () => ["v22.0.0", "v24.15.0"],
      executable: (file: string) => file === installed,
    };
    expect(analysisCliCandidates("codex", "", options)).toEqual([installed]);
    expect(resolveAnalysisCommand(installed, ["exec"], options).env.PATH!.split(":")[0]).toBe(
      `${nvm}/versions/node/v24.15.0/bin`,
    );
  });
  it("rejects unsupported batch wrappers and reports missing Windows Node", () => {
    const options = {
      cli: "codex" as const,
      platform: "win32" as const,
      env: {},
      executable: () => true,
      isFile: () => false,
    };
    expect(() => resolveAnalysisCommand("C:\\custom\\codex.bat", [], options)).toThrow(
      "supported npm",
    );
    expect(() =>
      resolveAnalysisCommand("C:\\custom\\codex.cmd", [], {
        ...options,
        isFile: (file) => file.endsWith("codex.js"),
      }),
    ).toThrow("Node.js");
  });
});
