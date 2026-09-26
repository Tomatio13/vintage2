import { existsSync } from "node:fs";
import { join } from "node:path";

import type { TerminalShell } from "../shared/desktop.js";

export interface ShellResolution {
  file: string;
  args: string[];
}

export interface ShellResolveOptions {
  platform?: NodeJS.Platform;
  env?: Record<string, string | undefined>;
}

const POSIX_SHELLS: Partial<Record<TerminalShell, { file: string; args: string[] }>> = {
  zsh: { file: "/usr/bin/zsh", args: ["-l"] },
  bash: { file: "/bin/bash", args: ["-l"] },
  fish: { file: "/usr/bin/fish", args: ["-l"] },
};

export function resolveShell(
  preferred: TerminalShell | undefined,
  options: ShellResolveOptions = {},
): ShellResolution {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  if (preferred === undefined || preferred === "system") {
    return resolveSystemShell(platform, env);
  }
  if (platform === "win32") return resolveWindowsShell(preferred, env);
  return resolvePosixShell(preferred);
}

function resolveSystemShell(
  platform: NodeJS.Platform,
  env: Record<string, string | undefined>,
): ShellResolution {
  if (platform === "win32") return { file: env.COMSPEC || "cmd.exe", args: [] };
  return { file: env.SHELL || "/bin/bash", args: ["-l"] };
}

function resolvePosixShell(preferred: TerminalShell): ShellResolution {
  const posix = POSIX_SHELLS[preferred];
  if (posix) return { ...posix, args: [...posix.args] };
  throw new TypeError(`Shell "${preferred}" is only available on Windows`);
}

function resolveWindowsShell(
  preferred: TerminalShell,
  env: Record<string, string | undefined>,
): ShellResolution {
  switch (preferred) {
    case "cmd":
      return { file: env.COMSPEC || "cmd.exe", args: [] };
    case "powershell": {
      const systemRoot = env.SystemRoot;
      if (systemRoot) {
        const file = join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
        if (existsSync(file)) return { file, args: ["-NoLogo"] };
      }
      return { file: "powershell.exe", args: ["-NoLogo"] };
    }
    case "pwsh": {
      const file = findExistingFile(
        [
          programFiles(env, "PowerShell", "7", "pwsh.exe"),
          programFiles(env, "PowerShell", "7-preview", "pwsh.exe"),
          programFiles(env, "PowerShell", "6", "pwsh.exe"),
          join(env.LOCALAPPDATA || "", "Microsoft", "WindowsApps", "pwsh.exe"),
          ...pathCandidates(env, "pwsh.exe"),
        ].filter((candidate) => candidate.length > 0),
      );
      if (!file) {
        throw new TypeError(
          "PowerShell 7 (pwsh.exe) was not found. Install it from https://aka.ms/powershell",
        );
      }
      return { file, args: ["-NoLogo"] };
    }
    case "gitbash": {
      const file = findExistingFile(
        [
          programFiles(env, "Git", "bin", "bash.exe"),
          programFiles(env, "Git", "usr", "bin", "bash.exe"),
          programFilesX86(env, "Git", "bin", "bash.exe"),
          join(env.LOCALAPPDATA || "", "Programs", "Git", "bin", "bash.exe"),
          ...pathCandidates(env, "Git", "bin", "bash.exe"),
          ...pathSiblingCandidates(env, "bin", "bash.exe"),
        ].filter((candidate) => candidate.length > 0),
      );
      if (!file) {
        throw new TypeError(
          "Git Bash was not found. Install Git for Windows from https://git-scm.com/download/win",
        );
      }
      return { file, args: ["-i", "-l"] };
    }
    default:
      throw new TypeError(`Shell "${preferred}" is not available on Windows`);
  }
}

function findExistingFile(candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function programFiles(env: Record<string, string | undefined>, ...segments: string[]): string {
  return join(env.ProgramFiles || "C:\\Program Files", ...segments);
}

function programFilesX86(env: Record<string, string | undefined>, ...segments: string[]): string {
  return join(env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", ...segments);
}

function pathDirectories(env: Record<string, string | undefined>): string[] {
  return (env.PATH || env.Path || "")
    .split(";")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function pathCandidates(env: Record<string, string | undefined>, ...segments: string[]): string[] {
  return pathDirectories(env).map((directory) => join(directory, ...segments));
}

function pathSiblingCandidates(
  env: Record<string, string | undefined>,
  ...segments: string[]
): string[] {
  return pathDirectories(env).map((directory) => join(directory, "..", ...segments));
}
