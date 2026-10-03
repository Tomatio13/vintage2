export type KanbanStatus = "todo" | "doing" | "done";
export interface KanbanCard {
  id: string;
  title: string;
  notes: string;
  status: KanbanStatus;
}
export interface KanbanDocument {
  version: 1;
  cards: KanbanCard[];
}
export interface KanbanSnapshot {
  board: KanbanDocument;
  revision: string;
}

export function validateKanban(value: unknown): KanbanDocument {
  if (!value || typeof value !== "object") throw new Error("Invalid Kanban document.");
  const board = value as Record<string, unknown>;
  if (
    board.version !== 1 ||
    !Array.isArray(board.cards) ||
    board.cards.length > 1000 ||
    Object.keys(board).some((key) => !["version", "cards"].includes(key))
  )
    throw new Error("Board requires version 1 and at most 1000 cards.");
  const ids = new Set<string>();
  for (const value of board.cards) {
    const card = value as Record<string, unknown> | null;
    if (
      !card ||
      typeof card !== "object" ||
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
      Object.keys(card).some((key) => !["id", "title", "notes", "status"].includes(key))
    )
      throw new Error(
        "Invalid Kanban card: use unique IDs, a title (1–200 characters), notes, and todo/doing/done status.",
      );
    ids.add(card.id);
  }
  return value as KanbanDocument;
}
