import { expect, it } from "vitest";
import { validateKanban, validKanbanDate } from "../src/shared/kanban.js";

const card = { id: "a", title: "Task", status: "todo", notes: "Requirements" };
it("allows version 2 metadata and keeps version 1 strict", () => {
  const enriched = { ...card, priority: "high", dueDate: "2028-02-29", labels: ["Design", "QA"] };
  expect(validateKanban({ version: 2, cards: [enriched] }).cards).toEqual([enriched]);
  expect(() => validateKanban({ version: 1, cards: [enriched] })).toThrow();
  expect(() => validateKanban({ version: 2, cards: [{ ...enriched, injected: true }] })).toThrow();
});
it("rejects invalid metadata including impossible dates, duplicate labels and excess label lengths", () => {
  for (const fields of [
    { priority: "critical" },
    { dueDate: "2026-02-29" },
    { dueDate: "2026-13-01" },
    { dueDate: "0000-01-01" },
    { labels: ["QA", "QA"] },
    { labels: [" "] },
    { labels: [" QA"] },
    { labels: ["x".repeat(33)] },
    { labels: Array.from({ length: 13 }, (_, i) => String(i)) },
    { labels: [null] },
  ]) {
    expect(() => validateKanban({ version: 2, cards: [{ ...card, ...fields }] })).toThrow();
  }
  expect(validKanbanDate("2028-02-29")).toBe(true);
  expect(validKanbanDate("2026-02-29")).toBe(false);
  expect(
    validateKanban({
      version: 2,
      cards: [{ ...card, dueDate: null, priority: "none", labels: [] }],
    }).version,
  ).toBe(2);
});

it("validates version 3 subtasks and rejects them in older schemas", () => {
  const subtask = { id: "s", title: "Check layout", done: false };
  const enriched = { ...card, subtasks: [subtask] };
  expect(validateKanban({ version: 3, cards: [enriched] }).cards).toEqual([enriched]);
  for (const version of [1, 2])
    expect(() => validateKanban({ version, cards: [enriched] })).toThrow();
  for (const subtasks of [
    null,
    [subtask, subtask],
    [{ ...subtask, title: " " }],
    [{ ...subtask, done: 1 }],
    [{ ...subtask, extra: true }],
    Array.from({ length: 101 }, (_, i) => ({ ...subtask, id: String(i) })),
  ]) {
    expect(() => validateKanban({ version: 3, cards: [{ ...card, subtasks }] })).toThrow();
  }
});
