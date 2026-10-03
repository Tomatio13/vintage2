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
it("honors an AI-held lock and copies concise instructions with quoted paths", async () => {
  const { root } = await fixture();
  const dir = join(root, "quotes ' and 日本語");
  const loaded = await readKanban(dir, initial);
  await mkdir(join(dir, "kanban.lock"));
  await expect(saveKanban(dir, initial, loaded.revision)).rejects.toThrow("another writer");
  await rm(join(dir, "kanban.lock"), { recursive: true });
  const instructions = kanbanInstructions(dir, root, initial.cards[0]);
  expect(instructions).toContain(JSON.stringify(join(dir, "kanban.json")));
  expect(instructions).toContain(initial.cards[0]!.id);
  expect(instructions).toContain("update-card.py");
  expect(instructions).toContain("notesをプロンプトとして実行してください");
  expect(instructions).not.toContain("実装してください");
  expect(kanbanInstructions(dir, root)).toContain("todoの全カードを順に処理し");
  expect(kanbanInstructions(dir, root)).not.toContain("1件選び");
  expect(kanbanInstructions(dir, root)).toContain(
    "各カードのnotesをプロンプトとして実行してください",
  );
  expect(instructions).toContain("python3");
  expect(instructions).not.toContain("```");
  expect(instructions.length).toBeLessThan(1500);
  expect(instructions.trim().split("\n")).toHaveLength(8);
  expect((await readKanban(dir)).board).toEqual(initial);
  expect(await readdir(dir)).toEqual(["kanban.json"]);
});

it("runs the prepared helper and copied command, preserving notes and respecting locks", async () => {
  const { root } = await fixture();
  const dir = join(root, "quoted ' 日本語");
  const loaded = await readKanban(dir, initial);
  const cli = await prepareKanbanCli(dir);
  const instructions = kanbanInstructions(dir, root, initial.cards[0]).trim().split("\n");
  const before = await readFile(join(dir, "kanban.json"), "utf8");
  const readCommand = instructions.find(
    (line) => line.startsWith("python3 ") && line.includes(" --read"),
  )!;
  expect(JSON.parse(execFileSync("sh", ["-c", readCommand], { encoding: "utf8" }))).toEqual(
    initial.cards[0],
  );
  const boardRead = kanbanInstructions(dir, root)
    .split("\n")
    .find((line) => line.startsWith("python3 ") && line.includes(" --read"))!;
  expect(JSON.parse(execFileSync("sh", ["-c", boardRead], { encoding: "utf8" }))).toEqual(initial);
  expect(await readFile(join(dir, "kanban.json"), "utf8")).toBe(before);
  expect(await readdir(dir)).toEqual(["kanban.json"]);
  const command = instructions.at(-1)!;
  execFileSync("sh", ["-c", command]);
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
