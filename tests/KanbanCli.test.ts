import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { prepareKanbanCli } from "../src/main/kanbanCli.js";
import { readKanban, saveKanban } from "../src/main/kanbanStore.js";
import type { KanbanDocument } from "../src/shared/kanban.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
const card = { id: "task", title: "Task", notes: "Original notes", status: "todo" as const };
async function fixture(version: 1 | 2 | 3 = 3) {
  const root = await mkdtemp(join(tmpdir(), "vintage-skill-"));
  roots.push(root);
  const dir = join(root, "quoted ' 日本語");
  const board: KanbanDocument = {
    version,
    cards: [card, { ...card, id: "other", title: "Other" }],
  };
  const loaded = await readKanban(dir, board);
  const cli = await prepareKanbanCli(dir);
  const path = join(dir, "kanban.json");
  const run = (...args: string[]) =>
    execFileSync("python3", [cli, "--board", path, ...args], { encoding: "utf8", stdio: "pipe" });
  return { root, dir, path, cli, board, loaded, run };
}
it("exports a portable Skill with the same executable helper as the app", async () => {
  const { root, cli, path, run } = await fixture();
  const skillRoot = join(root, "skills", "vintage-board");
  expect(await readFile(join(skillRoot, "SKILL.md"), "utf8")).toBe(
    await readFile("skills/vintage-board/SKILL.md", "utf8"),
  );
  expect(await readFile(cli, "utf8")).toBe(
    await readFile("skills/vintage-board/scripts/update-card.py", "utf8"),
  );
  const copied = join(root, "agent-skills", "vintage-board");
  await mkdir(join(copied, "scripts"), { recursive: true });
  await writeFile(
    join(copied, "scripts", "update-card.py"),
    await readFile(join(skillRoot, "scripts", "update-card.py")),
  );
  const output = execFileSync(
    "python3",
    [
      join(copied, "scripts", "update-card.py"),
      "--board",
      path,
      "--card",
      "task",
      "--subtask-add",
      "Portable task",
    ],
    { encoding: "utf8" },
  );
  expect(output).toContain("Added subtask");
  expect(JSON.parse(run("--read", "--card", "task")).subtasks[0].title).toBe("Portable task");
  // Refresh replaces stale exported copies as well as the compatibility command.
  await writeFile(cli, "old helper");
  await prepareKanbanCli(dirname(path));
  expect(JSON.parse(run("--read")).version).toBe(3);
});
it("adds, edits, completes, reopens and deletes by ID while preserving unrelated data", async () => {
  const { dir, run, board, path } = await fixture();
  const raw = await readFile(path, "utf8");
  run("--read");
  expect(await readFile(path, "utf8")).toBe(raw);
  run("--card", "task", "--subtask-add", "Verify layout");
  run("--card", "task", "--subtask-add", "Verify keyboard");
  let first = JSON.parse(run("--card", "task", "--read"));
  const [a, b] = first.subtasks;
  expect(a.id).not.toBe(b.id);
  run(
    "--card",
    "task",
    "--subtask",
    a.id,
    "--subtask-title",
    "Verify all themes",
    "--subtask-done",
    "true",
    "--status",
    "doing",
    "--note",
    "Themes checked",
  );
  first = JSON.parse(run("--card", "task", "--read"));
  expect(first).toMatchObject({
    notes: "Original notes\nThemes checked",
    status: "doing",
    subtasks: [{ id: a.id, title: "Verify all themes", done: true }, b],
  });
  run("--card", "task", "--subtask", a.id, "--subtask-done", "false");
  expect(JSON.parse(run("--card", "task", "--read")).subtasks[0].done).toBe(false);
  run("--card", "task", "--subtask", a.id, "--subtask-delete");
  run("--card", "task", "--subtask", b.id, "--subtask-done", "true");
  expect(JSON.parse(run("--card", "task", "--read"))).toMatchObject({
    status: "doing",
    subtasks: [{ ...b, done: true }],
  });
  expect((await readKanban(dir)).board.cards[1]).toEqual(board.cards[1]);
  run("--card", "task", "--subtask", b.id, "--subtask-delete");
  expect((await readKanban(dir)).board.version).toBe(3);
  expect((await readKanban(dir)).board.cards[0]!.subtasks).toEqual([]);
  expect(await readdir(dir)).toEqual(["kanban.json"]);
});
it.each([1, 2] as const)(
  "backs up exact v%i bytes before CLI subtask creation and invalidates stale UI revisions",
  async (version) => {
    const { dir, run, path, loaded, board } = await fixture(version);
    const original = await readFile(path, "utf8");
    run("--card", "task", "--subtask-add", "New task");
    expect((await readKanban(dir)).board.version).toBe(3);
    expect(await readFile(join(dir, `kanban-v${version}-${loaded.revision}.json`), "utf8")).toBe(
      original,
    );
    await expect(saveKanban(dir, board, loaded.revision)).rejects.toThrow("changed");
    expect((await readKanban(dir)).board.cards[1]).toEqual(board.cards[1]);
  },
);
it("rejects invalid combinations, titles, missing IDs and competing writers without data loss", async () => {
  const { dir, path, run } = await fixture();
  run("--card", "task", "--subtask-add", "Keep me");
  const id = JSON.parse(run("--card", "task", "--read")).subtasks[0].id;
  const raw = await readFile(path, "utf8");
  for (const args of [
    ["--read", "--subtask-add", "Oops"],
    ["--subtask-add", " "],
    ["--subtask-add", "x".repeat(201)],
    ["--subtask-add", "New", "--subtask", id, "--subtask-done", "true"],
    ["--subtask", id, "--subtask-title", " "],
    ["--subtask", id, "--subtask-done", "yes"],
    ["--subtask", id, "--subtask-delete", "--subtask-title", "New"],
    ["--subtask", "missing", "--subtask-done", "true", "--status", "done"],
    ["--subtask", id],
    ["--subtask-done", "true"],
  ]) {
    expect(() => run("--card", "task", ...args)).toThrow();
    expect(await readFile(path, "utf8")).toBe(raw);
    expect(await readdir(dir)).toEqual(["kanban.json"]);
  }
  expect(() => run("--card", "other", "--subtask", id, "--subtask-delete")).toThrow();
  await mkdir(join(dir, "kanban.lock"));
  expect(() => run("--card", "task", "--subtask", id, "--subtask-done", "true")).toThrow();
  expect(await readFile(path, "utf8")).toBe(raw);
  expect(await readdir(dir)).toContain("kanban.lock");
});
it("rejects the subtask limit and oversized updates before writing", async () => {
  const { dir, path, run, loaded, board } = await fixture();
  const subtasks = Array.from({ length: 100 }, (_, i) => ({
    id: String(i),
    title: "Task",
    done: false,
  }));
  await saveKanban(dir, { ...board, cards: [{ ...card, subtasks }] }, loaded.revision);
  const raw = await readFile(path, "utf8");
  expect(() => run("--card", "task", "--subtask-add", "Too many")).toThrow();
  expect(await readFile(path, "utf8")).toBe(raw);
  const current = await readKanban(dir);
  await saveKanban(
    dir,
    { ...current.board, cards: [{ ...current.board.cards[0]!, notes: "x".repeat(199999) }] },
    current.revision,
  );
  const full = await readFile(path, "utf8");
  expect(() =>
    run("--card", "task", "--subtask", "0", "--subtask-done", "true", "--note", "Overflow"),
  ).toThrow();
  expect(await readFile(path, "utf8")).toBe(full);
  expect(await readdir(dir)).toEqual(["kanban.json"]);
});
it.each(["mismatch", "symlink"])(
  "stops CLI migration for a %s backup without changing the board",
  async (mode) => {
    const { root, dir, path, run } = await fixture(2);
    const raw = await readFile(path);
    const backup = join(dir, `kanban-v2-${createHash("sha256").update(raw).digest("hex")}.json`);
    if (mode === "symlink") {
      const outside = join(root, "original.json");
      await writeFile(outside, raw);
      await symlink(outside, backup);
    } else await writeFile(backup, "mismatched");
    expect(() => run("--card", "task", "--subtask-add", "No write")).toThrow();
    expect(await readFile(path)).toEqual(raw);
    expect(await readdir(dir)).not.toContain("kanban.lock");
  },
);
