import { expect, it } from "vitest";
import type { KanbanCard } from "../src/shared/kanban.js";
import { validateKanban } from "../src/shared/kanban.js";
import { moveKanbanCard } from "../src/shared/kanbanOrder.js";

const cards: KanbanCard[] = [
  { id: "a", title: "A", notes: "Keep A", status: "todo" },
  { id: "x", title: "X", notes: "Keep X", status: "doing" },
  { id: "b", title: "B", notes: "Keep B", status: "todo" },
  { id: "c", title: "C", notes: "Keep C", status: "todo" },
];
it("reorders within a column without changing unrelated cards or version 1 fields", () => {
  const moved = moveKanbanCard(cards, "c", "todo", "a");
  expect(moved.map((card) => card.id)).toEqual(["c", "a", "x", "b"]);
  expect(moved.find((card) => card.id === "x")).toBe(cards[1]);
  expect(validateKanban({ version: 1, cards: moved }).cards).toEqual(moved);
  const last = moveKanbanCard(moved, "c", "todo", null);
  expect(last.map((card) => card.id)).toEqual(["a", "x", "b", "c"]);
  expect(cards.map((card) => card.id)).toEqual(["a", "x", "b", "c"]);
});
it("inserts at the target column head, tail and empty column preserving notes", () => {
  const head = moveKanbanCard(cards, "b", "doing", "x");
  expect(head.map((card) => card.id)).toEqual(["a", "b", "x", "c"]);
  expect(head[1]).toEqual({ ...cards[2], status: "doing" });
  expect(moveKanbanCard(cards, "b", "doing", null).map((card) => card.id)).toEqual([
    "a",
    "x",
    "b",
    "c",
  ]);
  const empty = moveKanbanCard(cards, "a", "done", null);
  expect(empty.at(-1)).toEqual({ ...cards[0], status: "done" });
});
it("ignores invalid targets, self insertion and unchanged order", () => {
  expect(moveKanbanCard(cards, "missing", "todo", null)).toBe(cards);
  expect(moveKanbanCard(cards, "a", "todo", "missing")).toBe(cards);
  expect(moveKanbanCard(cards, "a", "todo", "x")).toBe(cards);
  expect(moveKanbanCard(cards, "a", "todo", "a")).toBe(cards);
  expect(moveKanbanCard(cards, "c", "todo", null)).toBe(cards);
  expect(moveKanbanCard(cards, "a", "todo", "b")).toBe(cards);
});
