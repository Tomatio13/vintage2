import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveShell } from "../src/main/shellResolver.js";

describe("resolveShell", () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "vintage-shell-resolver-"));
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  describe("on POSIX platforms", () => {
    const posix = { platform: "linux" } as const;

    it("resolves the system shell from SHELL", () => {
      expect(resolveShell(undefined, { ...posix, env: { SHELL: "/usr/bin/fish" } })).toEqual({
        file: "/usr/bin/fish",
        args: ["-l"],
      });
      expect(resolveShell("system", { ...posix, env: {} })).toEqual({
        file: "/bin/bash",
        args: ["-l"],
      });
    });

    it("resolves the POSIX shells from fixed locations", () => {
      expect(resolveShell("zsh", posix)).toEqual({ file: "/usr/bin/zsh", args: ["-l"] });
      expect(resolveShell("bash", posix)).toEqual({ file: "/bin/bash", args: ["-l"] });
      expect(resolveShell("fish", posix)).toEqual({ file: "/usr/bin/fish", args: ["-l"] });
    });

    it("rejects Windows-only shells", () => {
      expect(() => resolveShell("cmd", posix)).toThrow("only available on Windows");
      expect(() => resolveShell("gitbash", posix)).toThrow("only available on Windows");
    });
  });

  describe("on Windows", () => {
    const windows = { platform: "win32" } as const;

    it("resolves the system shell from COMSPEC", () => {
      expect(
        resolveShell("system", { ...windows, env: { COMSPEC: "C:\\Windows\\cmd.exe" } }),
      ).toEqual({ file: "C:\\Windows\\cmd.exe", args: [] });
      expect(resolveShell(undefined, { ...windows, env: {} })).toEqual({
        file: "cmd.exe",
        args: [],
      });
    });

    it("resolves Command Prompt from COMSPEC", () => {
      expect(resolveShell("cmd", { ...windows, env: { COMSPEC: "C:\\Windows\\cmd.exe" } })).toEqual(
        { file: "C:\\Windows\\cmd.exe", args: [] },
      );
    });

    it("resolves Windows PowerShell from the system root", () => {
      const systemRoot = stageRooted("System32/WindowsPowerShell/v1.0/powershell.exe");
      expect(resolveShell("powershell", { ...windows, env: { SystemRoot: systemRoot } })).toEqual({
        file: join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
        args: ["-NoLogo"],
      });
    });

    it("falls back to PATH lookup when Windows PowerShell is not in the system root", () => {
      const systemRoot = stageRooted("unrelated/powershell.exe");
      expect(resolveShell("powershell", { ...windows, env: { SystemRoot: systemRoot } })).toEqual({
        file: "powershell.exe",
        args: ["-NoLogo"],
      });
    });

    it("resolves PowerShell 7 from the default install location", () => {
      const programFiles = stageRooted("PowerShell/7/pwsh.exe");
      expect(resolveShell("pwsh", { ...windows, env: { ProgramFiles: programFiles } })).toEqual({
        file: join(programFiles, "PowerShell", "7", "pwsh.exe"),
        args: ["-NoLogo"],
      });
    });

    it("resolves PowerShell 7 from PATH", () => {
      const tools = stageDirectory("tools/pwsh.exe");
      expect(
        resolveShell("pwsh", { ...windows, env: { PATH: `${tools};C:\\Windows\\System32` } }),
      ).toEqual({ file: join(tools, "pwsh.exe"), args: ["-NoLogo"] });
    });

    it("reports PowerShell 7 as missing when pwsh.exe cannot be found", () => {
      expect(() =>
        resolveShell("pwsh", { ...windows, env: { PATH: "C:\\Windows\\System32" } }),
      ).toThrow("PowerShell 7 (pwsh.exe) was not found");
    });

    it("resolves Git Bash from the default install location", () => {
      const programFiles = stageRooted("Git/bin/bash.exe");
      expect(resolveShell("gitbash", { ...windows, env: { ProgramFiles: programFiles } })).toEqual({
        file: join(programFiles, "Git", "bin", "bash.exe"),
        args: ["-i", "-l"],
      });
    });

    it("resolves Git Bash from a PATH entry pointing at Git\\cmd", () => {
      stageRooted("Git/bin/bash.exe");
      const gitCmd = join(directory, "Git", "cmd");
      expect(
        resolveShell("gitbash", { ...windows, env: { PATH: `${gitCmd};C:\\Windows\\System32` } }),
      ).toEqual({
        file: join(gitCmd, "..", "bin", "bash.exe"),
        args: ["-i", "-l"],
      });
    });

    it("reports Git Bash as missing when bash.exe cannot be found", () => {
      expect(() =>
        resolveShell("gitbash", { ...windows, env: { PATH: "C:\\Windows\\System32" } }),
      ).toThrow("Git Bash was not found");
    });

    it("rejects POSIX-only shells", () => {
      expect(() => resolveShell("zsh", windows)).toThrow("not available on Windows");
      expect(() => resolveShell("fish", windows)).toThrow("not available on Windows");
    });
  });

  function stageRooted(relativePath: string): string {
    writeFileAt(join(directory, relativePath));
    return directory;
  }

  function stageDirectory(relativePath: string): string {
    const filePath = join(directory, relativePath);
    writeFileAt(filePath);
    return dirname(filePath);
  }

  function writeFileAt(filePath: string): void {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, "");
  }
});
