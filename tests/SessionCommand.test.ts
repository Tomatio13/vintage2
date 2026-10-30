import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { resolveSessionCommand } from "../src/main/sessionCommand.js";
import { sessionPathsEqual } from "../src/shared/sessionHistory.js";
const sid = "11111111-2222-4333-8444-555555555555";

describe("cross-platform session launch", () => {
  it("launches Windows native CLIs directly without changing authentication variables", () => {
    const file = "C:\\Users\\Test User\\.local\\bin\\claude.exe";
    const command = resolveSessionCommand("claude", ["--resume", sid], {
      platform: "win32",
      home: "C:\\Users\\Test User",
      env: {
        Path: "C:\\Windows\\System32",
        HOME: "C:\\Users\\Test User",
        AUTH_MARKER: "preserved",
      },
      executable: (candidate) => candidate === file,
    });
    expect(command.file).toBe(file);
    expect(command.args).toEqual(["--resume", sid]);
    expect(command.env.AUTH_MARKER).toBe("preserved");
    expect(command.env).not.toHaveProperty("CLAUDE_CONFIG_DIR");
    expect(command.env).not.toHaveProperty("PATH");
    expect(command.env.Path).toContain("C:\\Users\\Test User\\.local\\bin");
  });
  it("uses a verbatim cmd command line for npm shims and keeps paths out of command code", () => {
    const file = "C:\\Users\\日本語 & %TEMP% !\\AppData\\Roaming\\npm\\codex.cmd";
    const home = "C:\\Users\\日本語 & %TEMP% !";
    const command = resolveSessionCommand("codex", ["resume", sid], {
      platform: "win32",
      home,
      env: { PATH: "", SystemRoot: "C:\\Windows" },
      executable: (candidate) => candidate === file,
    });
    expect(command.file).toBe("C:\\Windows\\System32\\cmd.exe");
    expect(command.args).toBe(`/d /v:off /s /c ""%VINTAGE_SESSION_EXECUTABLE%" resume ${sid}"`);
    expect(command.args).not.toContain(home);
    expect(command.env.VINTAGE_SESSION_EXECUTABLE).toBe(file);
  });
  it.each(["grok", "agy"])("supports Windows npm launchers for %s", (file) => {
    const installed = `D:\\Agent Tools\\${file}.cmd`;
    const command = resolveSessionCommand(
      file,
      [file === "grok" ? "--resume" : "--conversation", sid],
      {
        platform: "win32",
        home: "C:\\Users\\Test",
        env: { Path: '"D:\\Agent Tools"', PATHEXT: ".CMD;.EXE" },
        executable: (candidate) => candidate === installed,
      },
    );
    expect(command.env.VINTAGE_SESSION_EXECUTABLE).toBe(installed);
    expect(command.args).toContain(sid);
  });
  it("finds Homebrew CLIs when macOS GUI applications have a minimal PATH", () => {
    const command = resolveSessionCommand("grok", ["--resume", sid], {
      platform: "darwin",
      home: "/Users/test",
      env: { PATH: "/usr/bin:/bin" },
      executable: (candidate) => candidate === "/opt/homebrew/bin/grok",
    });
    expect(command.file).toBe("/opt/homebrew/bin/grok");
    expect(command.args).toEqual(["--resume", sid]);
    expect(command.env.PATH).toContain("/opt/homebrew/bin");
  });
  it("preserves PATH precedence on POSIX and does not search the working directory", () => {
    const paths: string[] = [];
    const command = resolveSessionCommand("agy", ["--conversation", sid], {
      platform: "linux",
      home: "/home/test",
      env: { PATH: ".:relative:/custom/bin:/usr/bin" },
      executable: (candidate) => {
        paths.push(candidate);
        return candidate === "/custom/bin/agy";
      },
    });
    expect(command.file).toBe("/custom/bin/agy");
    expect(paths).toEqual(["/custom/bin/agy"]);
    expect(command.env.PATH).not.toMatch(/(^|:)\.(?:$|:)/);
  });
  it("reports a missing CLI and rejects shell syntax in resume arguments", () => {
    expect(() =>
      resolveSessionCommand("claude", ["--resume", sid], { executable: () => false }),
    ).toThrow("claude was not found");
    expect(() => resolveSessionCommand("grok", ["--resume", `${sid}&calc`])).toThrow("Unsupported");
    expect(() => resolveSessionCommand("cmd", ["/c", "anything"])).toThrow("Unsupported");
  });
  it("demonstrates that a runnable executable in the first PATH directory is trusted", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vintage-path-attack-"));
    const executable = join(directory, "codex");
    await writeFile(executable, "#!/bin/sh\nexit 0\n");
    await chmod(executable, 0o755);

    try {
      const command = resolveSessionCommand("codex", ["resume", sid], {
        platform: "linux",
        home: "/home/test",
        env: { PATH: `${directory}:/usr/bin:/bin` },
        readDirectories: () => [],
      });
      expect(command.file).toBe(executable);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it("matches Windows directory separators and case without folding POSIX paths", () => {
    expect(sessionPathsEqual("C:\\Users\\Test\\Project\\", "c:/users/test/project", true)).toBe(
      true,
    );
    expect(sessionPathsEqual("\\\\Host\\Share\\Project", "//host/share/project/", true)).toBe(true);
    expect(sessionPathsEqual("/repo/", "/repo")).toBe(true);
    expect(sessionPathsEqual("/Repo", "/repo")).toBe(false);
  });
});
