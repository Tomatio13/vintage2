export type KanbanStatus = "todo" | "doing" | "done";
export const KANBAN_PRIORITIES = ["none", "low", "medium", "high", "urgent"] as const;
export type KanbanPriority = (typeof KANBAN_PRIORITIES)[number];
export const KANBAN_SUBTASK_LIMIT = 100;
export interface KanbanSubtask {
  id: string;
  title: string;
  done: boolean;
}
export interface KanbanCard {
  id: string;
  title: string;
  notes: string;
  status: KanbanStatus;
  priority?: KanbanPriority;
  dueDate?: string | null;
  labels?: string[];
  subtasks?: KanbanSubtask[];
}
export interface KanbanDocument {
  version: 1 | 2 | 3;
  cards: KanbanCard[];
}
export interface KanbanSnapshot {
  board: KanbanDocument;
  revision: string;
}

export function validKanbanDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value) || value.startsWith("0000"))
    return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function kanbanCardKey(id: string): string {
  return `TASK-${id.slice(0, 8).toUpperCase()}`;
}
export function kanbanLabelTone(label: string): number {
  return [...label].reduce((hash, char) => (hash * 31 + char.codePointAt(0)!) >>> 0, 0) % 6;
}
export function validKanbanSubtasks(value: unknown): value is KanbanSubtask[] {
  if (!Array.isArray(value) || value.length > KANBAN_SUBTASK_LIMIT) return false;
  const ids = new Set<string>();
  for (const item of value) {
    if (
      !item ||
      typeof item !== "object" ||
      Array.isArray(item) ||
      typeof item.id !== "string" ||
      !item.id.trim() ||
      item.id.length > 128 ||
      ids.has(item.id) ||
      typeof item.title !== "string" ||
      !item.title.trim() ||
      item.title.length > 200 ||
      typeof item.done !== "boolean" ||
      Object.keys(item).some((key) => !["id", "title", "done"].includes(key))
    )
      return false;
    ids.add(item.id);
  }
  return true;
}
export function validateKanban(value: unknown): KanbanDocument {
  if (!value || typeof value !== "object") throw new Error("Invalid Kanban document.");
  const board = value as Record<string, unknown>;
  if (
    ![1, 2, 3].includes(board.version as number) ||
    !Array.isArray(board.cards) ||
    board.cards.length > 1000 ||
    Object.keys(board).some((key) => !["version", "cards"].includes(key))
  )
    throw new Error("Board requires version 1, 2 or 3 and at most 1000 cards.");
  const ids = new Set<string>();
  const fields = [
    "id",
    "title",
    "notes",
    "status",
    ...([2, 3].includes(board.version as number) ? ["priority", "dueDate", "labels"] : []),
    ...(board.version === 3 ? ["subtasks"] : []),
  ];
  for (const value of board.cards) {
    const card = value as Record<string, unknown> | null;
    if (
      !card ||
      typeof card !== "object" ||
      Array.isArray(card) ||
      typeof card.id !== "string" ||
      !card.id ||
      card.id.length > 128 ||
      ids.has(card.id) ||
      typeof card.title !== "string" ||
      !card.title.trim() ||
      card.title.length > 200 ||
      typeof card.notes !== "string" ||
      card.notes.length > 200_000 ||
      !["todo", "doing", "done"].includes(card.status as string) ||
      Object.keys(card).some((key) => !fields.includes(key))
    )
      throw new Error(
        "Invalid Kanban card: use unique IDs, a title (1–200 characters), notes, and todo/doing/done status.",
      );
    if (
      ("priority" in card && !KANBAN_PRIORITIES.includes(card.priority as KanbanPriority)) ||
      ("dueDate" in card && card.dueDate !== null && !validKanbanDate(card.dueDate)) ||
      ("labels" in card &&
        (!Array.isArray(card.labels) ||
          card.labels.length > 12 ||
          card.labels.some(
            (label) =>
              typeof label !== "string" ||
              !label.trim() ||
              label !== label.trim() ||
              label.length > 32,
          ) ||
          new Set(card.labels).size !== card.labels.length))
    )
      throw new Error(
        "Invalid card metadata: use a supported priority, YYYY-MM-DD date, and up to 12 unique labels (1–32 characters).",
      );
    if ("subtasks" in card && !validKanbanSubtasks(card.subtasks))
      throw new Error(
        "Invalid subtasks: use up to 100 unique IDs, titles (1–200 characters), and boolean done values.",
      );
    ids.add(card.id);
  }
  return value as KanbanDocument;
}
