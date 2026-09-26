import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";

import type {
  CodexbarSnapshot,
  CodexbarStatusResult,
  CodexbarUsageResult,
} from "../shared/desktop.js";

const execFileAsync = promisify(execFile);
const usageTimeoutMs = 90_000;
const probeTimeoutMs = 5_000;
const usageMaxBuffer = 8 * 1024 * 1024;

interface CodexbarCommandError extends Error {
  code?: string | number;
  killed?: boolean;
  path?: string;
  stderr?: string;
  stdout?: string;
}

class CodexbarParseError extends Error {}

function commandError(error: unknown): CodexbarCommandError {
  return error instanceof Error ? (error as CodexbarCommandError) : new Error(String(error));
}

function expandHomePath(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return resolve(homedir(), path.slice(2));
  return path;
}

function autoCandidates(): string[] {
  return [
    "codexbar",
    "/usr/local/bin/codexbar",
    "/opt/homebrew/bin/codexbar",
    resolve(homedir(), ".local/bin/codexbar"),
  ];
}

function lastDiagnosticLine(text: string | undefined): string {
  const lines = (text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines[lines.length - 1] ?? "";
}

function isSnapshot(value: unknown): value is CodexbarSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as CodexbarSnapshot;
  return (
    candidate.schemaVersion === 1 &&
    typeof candidate.generatedAt === "string" &&
    Array.isArray(candidate.providers)
  );
}

function parseSnapshot(stdout: string): CodexbarSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout) as unknown;
  } catch (error) {
    throw new CodexbarParseError(error instanceof Error ? error.message : "output is not JSON");
  }
  if (!isSnapshot(parsed)) {
    throw new CodexbarParseError("unrecognized snapshot schema");
  }
  return parsed;
}

let cachedAutoPath: string | null = null;

async function probeVersion(path: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(path, ["--version"], {
      encoding: "utf8",
      timeout: probeTimeoutMs,
      windowsHide: true,
    });
    return lastDiagnosticLine(stdout) || null;
  } catch {
    return null;
  }
}

export async function resolveCodexbarPath(settingPath: string): Promise<string | null> {
  const configured = settingPath.trim();
  if (configured) return expandHomePath(configured);
  if (cachedAutoPath) return cachedAutoPath;
  for (const candidate of autoCandidates()) {
    if ((await probeVersion(candidate)) !== null) {
      cachedAutoPath = candidate;
      return candidate;
    }
  }
  return null;
}

export async function probeCodexbarStatus(settingPath: string): Promise<CodexbarStatusResult> {
  const configured = settingPath.trim();
  if (configured) {
    const expanded = expandHomePath(configured);
    const version = await probeVersion(expanded);
    return version === null
      ? { found: false, message: `No runnable codexbar at ${expanded}` }
      : { found: true, resolvedPath: expanded, version };
  }
  for (const candidate of autoCandidates()) {
    const version = await probeVersion(candidate);
    if (version !== null) {
      return { found: true, resolvedPath: candidate, version };
    }
  }
  return { found: false, message: "codexbar was not found on PATH or in known install locations." };
}

export async function fetchCodexbarUsage(settingPath: string): Promise<CodexbarUsageResult> {
  const resolvedPath = await resolveCodexbarPath(settingPath);
  if (!resolvedPath) {
    return {
      ok: false,
      errorKind: "not-configured",
      message:
        "codexbar was not found. Install the CodexBar CLI or set its path in Settings → Usage.",
      resolvedPath: null,
    };
  }
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(resolvedPath, ["dashboard"], {
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1" },
      maxBuffer: usageMaxBuffer,
      timeout: usageTimeoutMs,
      windowsHide: true,
    }));
  } catch (rawError) {
    const error = commandError(rawError);
    if (error.code === "ENOENT") {
      return {
        ok: false,
        errorKind: "not-found",
        message: `codexbar was not found at ${resolvedPath}`,
        resolvedPath,
      };
    }
    if (error.killed || error.code === "ETIMEDOUT") {
      return {
        ok: false,
        errorKind: "timeout",
        message: "codexbar did not finish in time.",
        resolvedPath,
      };
    }
    if (typeof error.code === "number" && error.code !== 0) {
      const diagnostic = lastDiagnosticLine(error.stderr);
      return {
        ok: false,
        errorKind: "exec-failed",
        message: `codexbar exited with code ${error.code}${diagnostic ? `: ${diagnostic}` : ""}`,
        resolvedPath,
      };
    }
    return {
      ok: false,
      errorKind: "exec-failed",
      message: lastDiagnosticLine(error.stderr) || "codexbar could not be executed.",
      resolvedPath,
    };
  }
  try {
    return { ok: true, snapshot: parseSnapshot(stdout) };
  } catch (error) {
    return {
      ok: false,
      errorKind: "parse-error",
      message: `codexbar output could not be parsed: ${
        error instanceof Error ? error.message : "unknown reason"
      }`,
      resolvedPath,
    };
  }
}
