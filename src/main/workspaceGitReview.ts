import { execFile } from "node:child_process";
import { lstat, realpath } from "node:fs/promises";
import { devNull } from "node:os";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

import type {
  RegisteredWorkspace,
  WorkspaceGitReviewChange,
  WorkspaceGitReviewDiff,
  WorkspaceGitReviewDiffRequest,
  WorkspaceGitReviewSnapshot,
  WorkspaceGitReviewSource,
} from "../shared/desktop.js";

const execFileAsync = promisify(execFile);
const gitTimeoutMs = 15_000;
const gitMaxBuffer = 4 * 1024 * 1024;
const defaultDiffContextLines = 500;

interface GitCommandError extends Error {
  code?: string | number;
  path?: string;
  stderr?: string;
  stdout?: string;
  syscall?: string;
}

interface GitContext {
  workspaceRoot: string;
  repositoryRoot: string;
  workspacePrefix: string;
}

class UnsafeGitFilterError extends Error {
  constructor() {
    super("Git filter driver cannot be disabled safely");
  }
}

function isWorkspaceGitReviewSource(value: unknown): value is WorkspaceGitReviewSource {
  return value === "unstaged" || value === "staged";
}

function commandError(error: unknown): GitCommandError {
  return error instanceof Error ? (error as GitCommandError) : new Error(String(error));
}

async function runGit(
  cwd: string,
  args: string[],
  acceptedExitCodes: number[] = [0],
  configOverrides: string[] = [],
): Promise<string> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_OPTIONAL_LOCKS: "0",
    GIT_TERMINAL_PROMPT: "0",
    GIT_PAGER: "cat",
    LC_ALL: "C",
    PAGER: "cat",
  };
  for (const key of [
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "GIT_COMMON_DIR",
    "GIT_PREFIX",
    "GIT_CEILING_DIRECTORIES",
  ]) {
    delete env[key];
  }
  try {
    const { stdout } = await execFileAsync(
      "git",
      [
        "--no-pager",
        "-c",
        "core.quotepath=false",
        "-c",
        "color.ui=false",
        "-c",
        "core.fsmonitor=false",
        ...configOverrides.flatMap((setting) => ["-c", setting]),
        ...args,
      ],
      {
        cwd,
        encoding: "utf8",
        env,
        maxBuffer: gitMaxBuffer,
        timeout: gitTimeoutMs,
        windowsHide: true,
      },
    );
    return stdout;
  } catch (rawError) {
    const error = commandError(rawError);
    if (typeof error.code === "number" && acceptedExitCodes.includes(error.code)) {
      return error.stdout ?? "";
    }
    throw error;
  }
}

function isNotRepository(error: unknown): boolean {
  const message = commandError(error).stderr ?? commandError(error).message;
  return /not a git repository/iu.test(message);
}

function isGitUnavailable(error: unknown): boolean {
  const candidate = commandError(error);
  return (
    candidate.code === "ENOENT" && (candidate.path === "git" || candidate.syscall === "spawn git")
  );
}

async function resolveGitContext(workspace: RegisteredWorkspace): Promise<GitContext> {
  const workspaceRoot = await realpath(workspace.path);
  const repositoryOutput = await runGit(workspaceRoot, ["rev-parse", "--show-toplevel"]);
  const repositoryRoot = await realpath(repositoryOutput.trim());
  const fromRepository = relative(repositoryRoot, workspaceRoot);
  if (
    fromRepository === ".." ||
    fromRepository.startsWith(`..${sep}`) ||
    isAbsolute(fromRepository)
  ) {
    throw new Error("Workspace is outside its Git repository");
  }
  return {
    workspaceRoot,
    repositoryRoot,
    workspacePrefix: fromRepository === "." ? "" : fromRepository.split(sep).join("/"),
  };
}

function recordPath(record: string, pattern: RegExp): { xy: string; path: string } | null {
  const match = pattern.exec(record);
  if (!match) return null;
  return { xy: match[1] ?? "..", path: match[2] ?? "" };
}

function kindFromStatus(
  status: string,
  fallback: WorkspaceGitReviewChange["kind"],
): WorkspaceGitReviewChange["kind"] {
  if (status === "A") return "added";
  if (status === "D") return "deleted";
  if (status === "R" || status === "C") return "renamed";
  return fallback;
}

/** Parse Git's NUL-delimited porcelain v2 output without splitting paths on whitespace. */
export function parseWorkspaceGitStatus(
  output: string,
  source: WorkspaceGitReviewSource,
): WorkspaceGitReviewChange[] {
  const changes: WorkspaceGitReviewChange[] = [];
  const records = output.split("\0");
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index] ?? "";
    if (!record) continue;

    if (record.startsWith("? ")) {
      if (source === "unstaged") {
        changes.push({
          path: record.slice(2),
          kind: "untracked",
          added: null,
          removed: null,
        });
      }
      continue;
    }

    if (record.startsWith("u ")) {
      const parsed = recordPath(record, /^u (\S+) \S+ \S+ \S+ \S+ \S+ \S+ \S+ \S+ (.*)$/su);
      if (!parsed) continue;
      changes.push({
        path: parsed.path,
        kind: "conflicted",
        added: null,
        removed: null,
      });
      continue;
    }

    if (record.startsWith("2 ")) {
      const parsed = recordPath(record, /^2 (\S+) \S+ \S+ \S+ \S+ \S+ \S+ \S+ (.*)$/su);
      const originalPath = records[index + 1];
      index += 1;
      if (!parsed || parsed.xy === ".." || !originalPath) continue;
      const status = parsed.xy[source === "staged" ? 0 : 1] ?? ".";
      if (status === ".") continue;
      changes.push({
        path: parsed.path,
        originalPath,
        kind: status === "R" || status === "C" ? "renamed" : kindFromStatus(status, "modified"),
        added: null,
        removed: null,
      });
      continue;
    }

    if (record.startsWith("1 ")) {
      const parsed = recordPath(record, /^1 (\S+) \S+ \S+ \S+ \S+ \S+ \S+ (.*)$/su);
      if (!parsed || parsed.xy === "..") continue;
      const status = parsed.xy[source === "staged" ? 0 : 1] ?? ".";
      if (status === ".") continue;
      changes.push({
        path: parsed.path,
        kind: kindFromStatus(status, "modified"),
        added: null,
        removed: null,
      });
    }
  }
  return changes.sort((left, right) => left.path.localeCompare(right.path));
}

function parseNumstat(
  output: string,
): Map<string, { added: number | null; removed: number | null }> {
  const stats = new Map<string, { added: number | null; removed: number | null }>();
  const records = output.split("\0");
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index] ?? "";
    const match = /^(\d+|-)\t(\d+|-)\t(.*)$/su.exec(record);
    if (!match) continue;
    let path = match[3] ?? "";
    if (!path) {
      index += 2;
      path = records[index] ?? "";
    }
    if (!path) continue;
    stats.set(path, {
      added: match[1] === "-" ? null : Number(match[1]),
      removed: match[2] === "-" ? null : Number(match[2]),
    });
  }
  return stats;
}

async function gitFilterConfigOverrides(cwd: string, paths: string[]): Promise<string[]> {
  if (paths.length === 0) return [];
  const output = await runGit(cwd, ["check-attr", "-z", "filter", "--", ...paths.map(pathSpec)]);
  const fields = output.split("\0");
  const drivers = new Set<string>();
  for (let index = 0; index + 2 < fields.length; index += 3) {
    if (fields[index + 1] !== "filter") continue;
    const driver = fields[index + 2] ?? "";
    if (!driver || driver === "unspecified" || driver === "unset") continue;
    if (!/^[A-Za-z0-9_-][A-Za-z0-9._-]*$/u.test(driver)) throw new UnsafeGitFilterError();
    drivers.add(driver);
  }
  return [...drivers].flatMap((driver) => [
    `filter.${driver}.clean=`,
    `filter.${driver}.smudge=`,
    `filter.${driver}.process=`,
  ]);
}

async function getWorkspaceChanges(
  workspace: RegisteredWorkspace,
  source: WorkspaceGitReviewSource,
): Promise<{ context: GitContext; changes: WorkspaceGitReviewChange[] }> {
  const context = await resolveGitContext(workspace);
  const output = await runGit(context.workspaceRoot, [
    "status",
    "--porcelain=v2",
    "-z",
    "--untracked-files=all",
    "--",
    ".",
  ]);
  const changes = parseWorkspaceGitStatus(output, source);
  const scopedChanges = changes.flatMap((change) => {
    if (!context.workspacePrefix) return [change];
    const prefix = `${context.workspacePrefix}/`;
    if (!change.path.startsWith(prefix)) return [];
    const originalPath = change.originalPath;
    if (originalPath && !originalPath.startsWith(prefix)) return [];
    return [
      {
        ...change,
        path: change.path.slice(prefix.length),
        ...(originalPath ? { originalPath: originalPath.slice(prefix.length) } : {}),
      },
    ];
  });
  const numstatArgs = ["diff"];
  if (source === "staged") numstatArgs.push("--cached");
  numstatArgs.push("--numstat", "-z", "--", ".");
  try {
    const filterPaths = scopedChanges.flatMap((change) =>
      change.originalPath ? [change.path, change.originalPath] : [change.path],
    );
    const configOverrides = await gitFilterConfigOverrides(context.workspaceRoot, filterPaths);
    const stats = parseNumstat(
      await runGit(context.workspaceRoot, numstatArgs, [0], configOverrides),
    );
    for (const change of scopedChanges) {
      const scopedPath = context.workspacePrefix
        ? `${context.workspacePrefix}/${change.path}`
        : change.path;
      const counts = stats.get(scopedPath);
      if (counts) {
        change.added = counts.added;
        change.removed = counts.removed;
      }
    }
  } catch {
    // Line counts are supplemental; the status list remains useful without them.
  }
  return { context, changes: scopedChanges };
}

export async function getWorkspaceGitReview(
  workspace: RegisteredWorkspace,
  rawSource: unknown,
): Promise<WorkspaceGitReviewSnapshot> {
  if (!isWorkspaceGitReviewSource(rawSource)) throw new TypeError("Invalid Git review source");
  try {
    const { changes } = await getWorkspaceChanges(workspace, rawSource);
    return { status: "ready", changes };
  } catch (error) {
    if (isGitUnavailable(error)) return { status: "git-unavailable", changes: [] };
    if (isNotRepository(error)) return { status: "not-repository", changes: [] };
    throw error;
  }
}

function validateRelativePath(value: unknown): string {
  if (typeof value !== "string" || !value || value.includes("\0") || isAbsolute(value)) {
    throw new TypeError("Invalid Git review path");
  }
  const segments = value.replaceAll("\\", "/").split("/");
  if (segments.some((segment) => segment === ".." || segment === "." || segment === "")) {
    throw new TypeError("Invalid Git review path");
  }
  return value;
}

function pathSpec(path: string): string {
  return `:(literal)${path}`;
}

function isSameChange(
  change: WorkspaceGitReviewChange,
  request: WorkspaceGitReviewDiffRequest,
): boolean {
  return (
    change.path === request.path &&
    change.originalPath === request.originalPath &&
    change.kind === request.kind
  );
}

async function readUntrackedDiff(
  workspaceRoot: string,
  path: string,
  contextLines: number,
): Promise<WorkspaceGitReviewDiff> {
  const absolutePath = resolve(workspaceRoot, ...path.split("/"));
  let details: Awaited<ReturnType<typeof lstat>>;
  try {
    details = await lstat(absolutePath);
  } catch {
    return { availability: "unavailable", patch: null, summary: "File is no longer available." };
  }
  if (details.isSymbolicLink() || !details.isFile()) {
    return { availability: "unavailable", patch: null, summary: "This file cannot be previewed." };
  }
  let actualPath: string;
  try {
    actualPath = await realpath(absolutePath);
  } catch {
    return { availability: "unavailable", patch: null, summary: "File is no longer available." };
  }
  const fromWorkspace = relative(workspaceRoot, actualPath);
  if (fromWorkspace === ".." || fromWorkspace.startsWith(`..${sep}`) || isAbsolute(fromWorkspace)) {
    return { availability: "unavailable", patch: null, summary: "File is outside this workspace." };
  }
  const patch = await runGit(
    workspaceRoot,
    [
      "diff",
      "--no-index",
      "--no-ext-diff",
      "--no-textconv",
      "--no-color",
      `--unified=${contextLines}`,
      "--",
      devNull,
      absolutePath,
    ],
    [0, 1],
    await gitFilterConfigOverrides(workspaceRoot, [path]),
  );
  if (/^Binary files .* differ$/mu.test(patch) || patch.includes("GIT binary patch")) {
    return {
      availability: "binary",
      patch: null,
      summary: "Binary file changes cannot be shown as text.",
    };
  }
  return patch
    ? { availability: "patch", patch, summary: null }
    : { availability: "unavailable", patch: null, summary: "No diff is available." };
}

export async function getWorkspaceGitReviewDiff(
  workspace: RegisteredWorkspace,
  rawRequest: unknown,
): Promise<WorkspaceGitReviewDiff> {
  if (!rawRequest || typeof rawRequest !== "object")
    throw new TypeError("Git review request is required");
  const request = rawRequest as Partial<WorkspaceGitReviewDiffRequest>;
  if (!isWorkspaceGitReviewSource(request.source)) throw new TypeError("Invalid Git review source");
  const path = validateRelativePath(request.path);
  const originalPath =
    request.originalPath === undefined ? undefined : validateRelativePath(request.originalPath);
  const contextLines = request.contextLines ?? defaultDiffContextLines;
  if (!Number.isInteger(contextLines) || contextLines < 0 || contextLines > 10_000) {
    throw new TypeError("Git diff context must be an integer between 0 and 10000");
  }
  if (typeof request.kind !== "string") throw new TypeError("Invalid Git review change kind");
  const normalizedRequest: WorkspaceGitReviewDiffRequest = {
    source: request.source,
    path,
    ...(originalPath ? { originalPath } : {}),
    kind: request.kind as WorkspaceGitReviewDiffRequest["kind"],
  };

  try {
    const { context, changes } = await getWorkspaceChanges(workspace, request.source);
    if (!changes.some((change) => isSameChange(change, normalizedRequest))) {
      return {
        availability: "unavailable",
        patch: null,
        summary: "This change is no longer available.",
      };
    }
    if (request.kind === "untracked") {
      return readUntrackedDiff(context.workspaceRoot, path, contextLines);
    }

    const args = ["diff"];
    if (request.source === "staged") args.push("--cached");
    args.push("--no-ext-diff", "--no-textconv", "--no-color", `--unified=${contextLines}`, "--");
    args.push(pathSpec(path));
    if (originalPath) args.push(pathSpec(originalPath));
    const filterPaths = originalPath ? [path, originalPath] : [path];
    const configOverrides = await gitFilterConfigOverrides(context.workspaceRoot, filterPaths);
    const patch = await runGit(context.workspaceRoot, args, [0], configOverrides);
    if (/^Binary files .* differ$/mu.test(patch) || patch.includes("GIT binary patch")) {
      return {
        availability: "binary",
        patch: null,
        summary: "Binary file changes cannot be shown as text.",
      };
    }
    return patch
      ? { availability: "patch", patch, summary: null }
      : { availability: "unavailable", patch: null, summary: "No diff is available." };
  } catch (error) {
    const code = commandError(error).code;
    if (code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
      return {
        availability: "unavailable",
        patch: null,
        summary: "Diff exceeds the display limit.",
      };
    }
    if (error instanceof UnsafeGitFilterError) {
      return {
        availability: "unavailable",
        patch: null,
        summary: "This file uses a Git filter that cannot be disabled safely.",
      };
    }
    if (isNotRepository(error)) {
      return {
        availability: "unavailable",
        patch: null,
        summary: "Workspace is no longer a Git repository.",
      };
    }
    if (isGitUnavailable(error)) {
      return { availability: "unavailable", patch: null, summary: "Git is not installed." };
    }
    throw error;
  }
}
