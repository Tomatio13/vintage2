import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import type { RegisteredWorkspace, WorkspaceGitReviewDiffRequest } from "../src/shared/desktop.js";
import {
  getWorkspaceGitReview,
  getWorkspaceGitReviewDiff,
  parseWorkspaceGitStatus,
} from "../src/main/workspaceGitReview.js";

const temporaryDirectories: string[] = [];
const execFileAsync = promisify(execFile);

function createTemporaryDirectory(): string {
  const path = mkdtempSync(join(tmpdir(), "vintage-git-review-"));
  temporaryDirectories.push(path);
  return path;
}

async function git(cwd: string, ...args: string[]): Promise<void> {
  await execFileAsync("git", args, {
    cwd,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
}

function write(root: string, path: string, content: string): void {
  const absolutePath = join(root, path);
  mkdirSync(join(absolutePath, ".."), { recursive: true });
  writeFileSync(absolutePath, content);
}

async function initializeRepository(
  root: string,
): Promise<{ filterMarker: string; filterRanInitially: boolean }> {
  await git(root, "init", "-q");
  await git(root, "config", "user.name", "VINTAGE test");
  await git(root, "config", "user.email", "vintage-test@example.invalid");
  const filterMarker = join(root, "filter-ran");
  await git(root, "config", "filter.demo.clean", `touch ${filterMarker}; cat`);
  await git(root, "config", "filter.demo.smudge", "cat");
  write(root, ".gitattributes", "*.filtered filter=demo\n");
  write(root, "scope/modified.txt", "one\ntwo\nthree\n");
  write(root, "scope/deleted.txt", "remove me\n");
  write(root, "scope/rename-old.txt", "renamed content\n");
  writeFileSync(join(root, "scope/image.bin"), Buffer.from([0, 1, 2]));
  write(root, "scope/filtered.filtered", "before filter\n");
  write(root, "outside/secret.txt", "outside the selected workspace\n");
  await git(root, "add", ".");
  const filterRanInitially = existsSync(filterMarker);
  await git(root, "commit", "-qm", "baseline");
  rmSync(filterMarker, { force: true });
  return { filterMarker, filterRanInitially };
}

afterEach(() => {
  for (const path of temporaryDirectories.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("workspace Git review", () => {
  it("parses NUL-delimited status records without splitting filenames", () => {
    const output = [
      "1 .M N... 100644 100644 100644 abc abc file with spaces.txt",
      "? untracked\tfile.txt",
      "2 R. N... 100644 100644 100644 abc def R100 renamed file.txt",
      "old file.txt",
      "u UU N... 100644 100644 100644 100644 abc def ghi conflict.txt",
    ].join("\0");

    expect(parseWorkspaceGitStatus(output, "unstaged")).toEqual([
      { path: "conflict.txt", kind: "conflicted", added: null, removed: null },
      { path: "file with spaces.txt", kind: "modified", added: null, removed: null },
      { path: "untracked\tfile.txt", kind: "untracked", added: null, removed: null },
    ]);
    expect(parseWorkspaceGitStatus(output, "staged")).toEqual([
      { path: "conflict.txt", kind: "conflicted", added: null, removed: null },
      {
        path: "renamed file.txt",
        originalPath: "old file.txt",
        kind: "renamed",
        added: null,
        removed: null,
      },
    ]);
  });

  it("lists and expands staged, unstaged, untracked, deleted, and renamed files within a subfolder workspace", async () => {
    const repository = createTemporaryDirectory();
    const { filterMarker, filterRanInitially } = await initializeRepository(repository);
    expect(filterRanInitially).toBe(true);
    const workspaceRoot = join(repository, "scope");
    const workspace: RegisteredWorkspace = {
      id: "review-test",
      name: "scope",
      path: workspaceRoot,
      kind: "project",
    };

    write(workspaceRoot, "modified.txt", "one staged\ntwo\nthree\n");
    await git(repository, "add", "scope/modified.txt");
    write(workspaceRoot, "modified.txt", "one unstaged\ntwo\nthree\n");
    rmSync(join(workspaceRoot, "deleted.txt"));
    renameSync(join(workspaceRoot, "rename-old.txt"), join(workspaceRoot, "renamed file.txt"));
    await git(repository, "add", "-A", "--", "scope/rename-old.txt", "scope/renamed file.txt");
    rmSync(filterMarker, { force: true });
    write(workspaceRoot, "untracked\tfile.txt", "untracked line\n");
    write(workspaceRoot, "untracked.filtered", "untracked through filter\n");
    writeFileSync(join(workspaceRoot, "image.bin"), Buffer.from([0, 1, 3]));
    write(workspaceRoot, "filtered.filtered", "after filter\n");
    write(repository, "outside/secret.txt", "modified outside the selected workspace\n");

    const unstaged = await getWorkspaceGitReview(workspace, "unstaged");
    expect(unstaged.status).toBe("ready");
    expect(unstaged.changes.map(({ path, kind }) => [path, kind])).toEqual([
      ["deleted.txt", "deleted"],
      ["filtered.filtered", "modified"],
      ["image.bin", "modified"],
      ["modified.txt", "modified"],
      ["untracked\tfile.txt", "untracked"],
      ["untracked.filtered", "untracked"],
    ]);
    expect(unstaged.changes.map((change) => change.path)).not.toContain("outside/secret.txt");
    expect(existsSync(filterMarker)).toBe(false);

    const staged = await getWorkspaceGitReview(workspace, "staged");
    expect(staged.status).toBe("ready");
    expect(staged.changes.map(({ path, kind }) => [path, kind])).toEqual([
      ["modified.txt", "modified"],
      ["renamed file.txt", "renamed"],
    ]);
    expect(staged.changes.find((change) => change.path === "renamed file.txt")?.originalPath).toBe(
      "rename-old.txt",
    );
    expect(staged.changes.find((change) => change.path === "modified.txt")?.added).toBe(1);

    const requests: WorkspaceGitReviewDiffRequest[] = [
      { source: "staged", path: "modified.txt", kind: "modified" },
      { source: "unstaged", path: "modified.txt", kind: "modified" },
      { source: "unstaged", path: "deleted.txt", kind: "deleted" },
      {
        source: "staged",
        path: "renamed file.txt",
        originalPath: "rename-old.txt",
        kind: "renamed",
      },
      { source: "unstaged", path: "untracked\tfile.txt", kind: "untracked" },
      { source: "unstaged", path: "image.bin", kind: "modified" },
      { source: "unstaged", path: "filtered.filtered", kind: "modified" },
      { source: "unstaged", path: "untracked.filtered", kind: "untracked" },
    ];
    const diffs = await Promise.all(
      requests.map((request) => getWorkspaceGitReviewDiff(workspace, request)),
    );
    expect(diffs.slice(0, 5).every((diff) => diff.availability === "patch")).toBe(true);
    expect(diffs[0]?.patch).toContain("one staged");
    expect(diffs[0]?.patch).not.toContain("one unstaged");
    expect(diffs[1]?.patch).toContain("one unstaged");
    expect(diffs[2]?.patch).toContain("deleted.txt");
    expect(diffs[3]?.patch).toContain("rename-old.txt");
    expect(diffs[4]?.patch).toContain("+untracked line");
    expect(diffs[5]).toMatchObject({
      availability: "binary",
      patch: null,
      summary: "Binary file changes cannot be shown as text.",
    });
    expect(diffs[6]?.availability).toBe("patch");
    expect(diffs[6]?.patch).toContain("after filter");
    expect(diffs[7]?.availability).toBe("patch");
    expect(diffs[7]?.patch).toContain("+untracked through filter");
    expect(existsSync(filterMarker)).toBe(false);
  });

  it("reports a workspace outside Git cleanly and rejects paths outside the workspace", async () => {
    const outsideGit = createTemporaryDirectory();
    const workspace: RegisteredWorkspace = {
      id: "not-a-repo",
      name: "plain folder",
      path: outsideGit,
      kind: "project",
    };
    expect(await getWorkspaceGitReview(workspace, "unstaged")).toEqual({
      status: "not-repository",
      changes: [],
    });
    await expect(
      getWorkspaceGitReviewDiff(workspace, {
        source: "unstaged",
        path: "../outside.txt",
        kind: "modified",
      }),
    ).rejects.toThrow("Invalid Git review path");
  });
});
