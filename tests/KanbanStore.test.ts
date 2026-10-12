import { execFileSync } from "node:child_process";
import { prepareKanbanCli } from "../src/main/kanbanCli.js";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { kanbanDirectory, readKanban, saveKanban } from "../src/main/kanbanStore.js";
import { kanbanInstructions } from "../src/main/kanbanInstructions.js";
import type { KanbanDocument } from "../src/shared/kanban.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
const initial: KanbanDocument = {
  version: 1,
  cards: [{ id: "task-1", title: "Task", notes: "Original notes", status: "todo" }],
};
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "vintage-board-"));
  roots.push(root);
  const project = join(root, "project");
  await mkdir(project);
  const dir = await kanbanDirectory(join(root, "app-data"), project);
  return { root, project, dir };
}
it("migrates to app data, leaves project empty and reuses storage by canonical project path", async () => {
  const { root, project, dir } = await fixture();
  const loaded = await readKanban(dir, initial);
  expect(loaded.board).toEqual(initial);
  expect(await readdir(project)).toEqual([]);
  expect(await kanbanDirectory(join(root, "app-data"), join(project, "."))).toBe(dir);
  const existing = await readKanban(dir, { version: 1, cards: [] });
  expect(existing.board).toEqual(initial);
});
it("rejects stale writes and cooperative competing writers, leaving no lock or temp files", async () => {
  const { dir } = await fixture();
  const loaded = await readKanban(dir, initial);
  const next = { ...initial, cards: initial.cards.map((card) => ({ ...card, notes: "New" })) };
  const results = await Promise.allSettled([
    saveKanban(dir, next, loaded.revision),
    saveKanban(
      dir,
      { ...next, cards: next.cards.map((card) => ({ ...card, notes: "Other" })) },
      loaded.revision,
    ),
  ]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  await expect(saveKanban(dir, initial, loaded.revision)).rejects.toThrow(/changed|updated/);
  expect(["New", "Other"]).toContain((await readKanban(dir)).board.cards[0]!.notes);
  expect(await readdir(dir)).toEqual(["kanban.json"]);
});
it("rejects invalid JSON, duplicate IDs, links and oversized documents without overwriting", async () => {
  const { dir, root } = await fixture();
  const loaded = await readKanban(dir, initial);
  await expect(
    saveKanban(dir, { version: 1, cards: [initial.cards[0], initial.cards[0]] }, loaded.revision),
  ).rejects.toThrow();
  await writeFile(join(dir, "kanban.json"), "broken JSON");
  await expect(readKanban(dir)).rejects.toThrow();
  await expect(saveKanban(dir, initial, loaded.revision)).rejects.toThrow();
  expect(await readFile(join(dir, "kanban.json"), "utf8")).toBe("broken JSON");
  await writeFile(join(dir, "kanban.json"), "x".repeat(1_000_001));
  await expect(readKanban(dir)).rejects.toThrow("1 MB");
  await rm(join(dir, "kanban.json"));
  const outside = join(root, "outside.json");
  await writeFile(outside, JSON.stringify(initial));
  await symlink(outside, join(dir, "kanban.json"));
  await expect(readKanban(dir)).rejects.toThrow("link");
  expect(JSON.parse(await readFile(outside, "utf8"))).toEqual(initial);
});
it("honors an AI-held lock and copies Skill-based instructions with exact paths", async () => {
  const { root } = await fixture();
  const dir = join(root, "quotes ' and 日本語");
  const loaded = await readKanban(dir, initial);
  await mkdir(join(dir, "kanban.lock"));
  await expect(saveKanban(dir, initial, loaded.revision)).rejects.toThrow("another writer");
  await rm(join(dir, "kanban.lock"), { recursive: true });
  const instructions = kanbanInstructions(dir, root, initial.cards[0]);
  expect(instructions).toContain(JSON.stringify(join(dir, "kanban.json")));
  expect(instructions).toContain(initial.cards[0]!.id);
  expect(instructions).not.toContain("update-card.py");
  expect(instructions).not.toContain("参照:");
  expect(instructions).not.toContain("更新（");
  expect(instructions).toContain("notesをプロンプトとして実行してください");
  expect(instructions).not.toContain("実装してください");
  expect(kanbanInstructions(dir, root)).toContain("todoの全カードを順に処理し");
  expect(kanbanInstructions(dir, root)).not.toContain("1件選び");
  expect(kanbanInstructions(dir, root)).toContain(
    "各カードのnotesをプロンプトとして実行してください",
  );
  expect(instructions).not.toContain("python3");
  expect(instructions).not.toContain("```");
  expect(instructions.length).toBeLessThan(1500);
  expect(instructions).toContain(join("skills", "vintage-board", "SKILL.md"));
  expect((await readKanban(dir)).board).toEqual(initial);
  expect(await readdir(dir)).toEqual(["kanban.json"]);
});

it("runs the helper referenced by the copied Skill, preserving notes and respecting locks", async () => {
  const { root } = await fixture();
  const dir = join(root, "quoted ' 日本語");
  const loaded = await readKanban(dir, initial);
  await prepareKanbanCli(dir);
  const instructions = kanbanInstructions(dir, root, initial.cards[0]);
  const skillPath = JSON.parse(instructions.match(/Agent Skill: ("(?:\\.|[^"\\])*")/u)![1]!);
  const boardPath = JSON.parse(
    instructions
      .split("\n")
      .find((line) => line.startsWith("Board: "))!
      .slice(7),
  );
  const cli = join(skillPath, "..", "scripts", "update-card.py");
  const before = await readFile(boardPath, "utf8");
  expect(
    JSON.parse(
      execFileSync("python3", [cli, "--board", boardPath, "--read", "--card", "task-1"], {
        encoding: "utf8",
      }),
    ),
  ).toEqual(initial.cards[0]);
  expect(
    JSON.parse(
      execFileSync("python3", [cli, "--board", boardPath, "--read"], { encoding: "utf8" }),
    ),
  ).toEqual(initial);
  expect(await readFile(boardPath, "utf8")).toBe(before);
  expect(await readdir(dir)).toEqual(["kanban.json"]);
  execFileSync("python3", [
    cli,
    "--board",
    boardPath,
    "--card",
    "task-1",
    "--status",
    "doing",
    "--note",
    "進捗",
  ]);
  expect((await readKanban(dir)).board.cards[0]).toEqual({
    ...initial.cards[0],
    status: "doing",
    notes: "Original notes\n進捗",
  });
  execFileSync("python3", [
    cli,
    "--board",
    join(dir, "kanban.json"),
    "--card",
    "task-1",
    "--status",
    "done",
    "--note",
    "検証完了",
  ]);
  expect((await readKanban(dir)).board.cards[0]!.notes).toBe("Original notes\n進捗\n検証完了");
  await expect(saveKanban(dir, initial, loaded.revision)).rejects.toThrow("changed");
  const raw = await readFile(join(dir, "kanban.json"), "utf8");
  await mkdir(join(dir, "kanban.lock"));
  expect(() =>
    execFileSync(
      "python3",
      [cli, "--board", join(dir, "kanban.json"), "--card", "task-1", "--status", "todo"],
      { stdio: "pipe" },
    ),
  ).toThrow();
  expect(await readFile(join(dir, "kanban.json"), "utf8")).toBe(raw);
  await rm(join(dir, "kanban.lock"), { recursive: true });
  expect(() =>
    execFileSync(
      "python3",
      [cli, "--board", join(dir, "kanban.json"), "--card", "missing", "--status", "todo"],
      { stdio: "pipe" },
    ),
  ).toThrow();
  expect(await readdir(dir)).toEqual(["kanban.json"]);
  expect(await readFile(join(dir, "kanban.json"), "utf8")).toBe(raw);
});

it("backs up the exact version 1 file before metadata upgrade and keeps version 2 on later updates", async () => {
  const { dir } = await fixture();
  const loaded = await readKanban(dir, initial);
  const original = await readFile(join(dir, "kanban.json"), "utf8");
  const enriched: KanbanDocument = {
    version: 2,
    cards: [
      {
        ...initial.cards[0]!,
        priority: "high",
        dueDate: "2026-10-31",
        labels: ["Design", "Frontend"],
      },
    ],
  };
  const upgraded = await saveKanban(dir, enriched, loaded.revision);
  const backups = (await readdir(dir)).filter((name) => name.startsWith("kanban-v1-"));
  expect(backups).toEqual([`kanban-v1-${loaded.revision}.json`]);
  expect(await readFile(join(dir, backups[0]!), "utf8")).toBe(original);
  expect(upgraded.board).toEqual(enriched);
  const next = await saveKanban(
    dir,
    { ...enriched, cards: enriched.cards.map((card) => ({ ...card, status: "doing" })) },
    upgraded.revision,
  );
  await expect(saveKanban(dir, initial, next.revision)).rejects.toThrow("downgraded");
  expect((await readdir(dir)).filter((name) => name.startsWith("kanban-v1-"))).toEqual(backups);
  const cli = await prepareKanbanCli(dir);
  execFileSync("python3", [
    cli,
    "--board",
    join(dir, "kanban.json"),
    "--card",
    "task-1",
    "--status",
    "done",
    "--note",
    "AI result",
  ]);
  expect((await readKanban(dir)).board).toEqual({
    version: 2,
    cards: [{ ...enriched.cards[0], status: "done", notes: "Original notes\nAI result" }],
  });
});
it("stops migration without modifying the board if the backup path is unsafe or mismatched", async () => {
  const { dir, root } = await fixture();
  const loaded = await readKanban(dir, initial);
  const original = await readFile(join(dir, "kanban.json"), "utf8");
  const path = join(dir, `kanban-v1-${loaded.revision}.json`);
  const outside = join(root, "outside-backup.json");
  await writeFile(outside, original);
  await symlink(outside, path);
  const next: KanbanDocument = { version: 2, cards: [{ ...initial.cards[0]!, labels: ["QA"] }] };
  await expect(saveKanban(dir, next, loaded.revision)).rejects.toThrow("link");
  expect(await readFile(join(dir, "kanban.json"), "utf8")).toBe(original);
  await rm(path);
  await writeFile(path, JSON.stringify({ version: 1, cards: [] }));
  await expect(saveKanban(dir, next, loaded.revision)).rejects.toThrow("does not match");
  expect(await readFile(join(dir, "kanban.json"), "utf8")).toBe(original);
  expect(await readdir(dir)).not.toContain("kanban.lock");
});

it.each([1, 2] as const)(
  "backs up version %i before subtasks and preserves them through CLI updates",
  async (version) => {
    const { dir } = await fixture();
    const old = { ...initial, version };
    const loaded = await readKanban(dir, old);
    const original = await readFile(join(dir, "kanban.json"), "utf8");
    const next: KanbanDocument = {
      version: 3,
      cards: [{ ...initial.cards[0]!, subtasks: [{ id: "sub-1", title: "Verify", done: true }] }],
    };
    const saved = await saveKanban(dir, next, loaded.revision);
    expect(await readFile(join(dir, `kanban-v${version}-${loaded.revision}.json`), "utf8")).toBe(
      original,
    );
    await expect(saveKanban(dir, old, saved.revision)).rejects.toThrow("downgraded");
    const cli = await prepareKanbanCli(dir);
    execFileSync("python3", [
      cli,
      "--board",
      join(dir, "kanban.json"),
      "--card",
      "task-1",
      "--status",
      "done",
      "--note",
      "Verified",
    ]);
    expect((await readKanban(dir)).board).toEqual({
      ...next,
      cards: [{ ...next.cards[0], status: "done", notes: "Original notes\nVerified" }],
    });
  },
);
