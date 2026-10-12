import type { KanbanCard, KanbanStatus } from "./kanban.js";

/** Array order is the version 1 board's manual order, shared by UI and CLI. */
export function moveKanbanCard(
  cards: KanbanCard[],
  id: string,
  status: KanbanStatus,
  beforeId: string | null,
): KanbanCard[] {
  const card = cards.find((value) => value.id === id);
  if (!card || !["todo", "doing", "done"].includes(status) || beforeId === id) return cards;
  if (card.status === status) {
    const column = cards.filter((value) => value.status === status);
    const nextId = column[column.findIndex((value) => value.id === id) + 1]?.id ?? null;
    if (nextId === beforeId) return cards;
  }
  const remaining = cards.filter((value) => value.id !== id);
  let index: number;
  if (beforeId !== null) {
    index = remaining.findIndex((value) => value.id === beforeId && value.status === status);
    if (index < 0) return cards;
  } else {
    const last = remaining.findLastIndex((value) => value.status === status);
    index = last < 0 ? remaining.length : last + 1;
  }
  remaining.splice(index, 0, card.status === status ? card : { ...card, status });
  return remaining.every((value, i) => value === cards[i]) ? cards : remaining;
}
