import {
  Bot,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { kanbanCardKey } from "../../shared/kanban.js";
import { BoardSubtaskProgress } from "./BoardSubtasks.js";
import { BoardLabel, BoardPriorityIcon, boardDueDate } from "./BoardMetadata.js";
import { useState, type DragEvent } from "react";
import type { KanbanCard, KanbanStatus } from "../../shared/kanban.js";

const icon =
  "grid size-7 place-items-center rounded-md text-foreground-subtle hover:bg-hover hover:text-foreground disabled:opacity-40";
export function BoardCard({
  card,
  blocked,
  editing,
  selected,
  draggable,
  dragging,
  canUp,
  canDown,
  onEdit,
  onDelete,
  onCopy,
  onMove,
  onReorder,
  onDragStart,
  onDragEnd,
}: {
  card: KanbanCard;
  blocked: boolean;
  editing: boolean;
  selected: boolean;
  draggable: boolean;
  dragging: boolean;
  canUp: boolean;
  canDown: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onMove: (status: KanbanStatus) => void;
  onReorder: (direction: -1 | 1) => void;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const due = card.dueDate ? boardDueDate(card.dueDate, card.status === "done") : null;
  return (
    <article
      aria-label={card.title}
      data-board-card={card.id}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      data-selected={selected}
      className={`board-card group relative rounded-lg border bg-panel px-3 py-3 ${selected ? "border-brand" : "border-border"} ${dragging ? "opacity-40" : ""}`}
    >
      {!!card.labels?.length && (
        <div className="mb-2 flex flex-wrap gap-1">
          {card.labels.map((label) => (
            <BoardLabel key={label} label={label} />
          ))}
        </div>
      )}
      <button
        type="button"
        title="Edit card"
        disabled={blocked}
        onClick={onEdit}
        className={`flex w-full items-start gap-1.5 text-left text-ui-sm font-medium ${card.status === "done" ? "text-foreground-subtle" : ""}`}
      >
        {card.status === "done" && (
          <Check aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
        )}
        <span
          className={`min-w-0 line-clamp-3 [overflow-wrap:anywhere] ${card.status === "done" ? "line-through" : ""}`}
        >
          {card.title}
        </span>
      </button>
      {!!card.subtasks?.length && (
        <div className="mt-2">
          <BoardSubtaskProgress subtasks={card.subtasks} showIcon />
        </div>
      )}
      <div className="mt-3 flex min-w-0 items-center gap-2 text-ui-xs text-foreground-subtle">
        <span title={card.id} className="min-w-0 truncate font-mono text-[10px]">
          {kanbanCardKey(card.id)}
        </span>
        <span
          title={`Priority: ${card.priority ?? "none"}`}
          aria-label={`Priority: ${card.priority ?? "none"}`}
        >
          <BoardPriorityIcon priority={card.priority ?? "none"} />
        </span>
        {due && (
          <span
            title={card.dueDate ?? ""}
            className={`flex shrink-0 items-center gap-1 ${due.overdue ? "text-destructive" : due.today ? "text-brand" : ""}`}
          >
            <Calendar className="size-3" />
            {due.label}
          </span>
        )}
        <span className="flex-1" />
        <button
          type="button"
          aria-label={`Copy AI instructions for ${card.title}`}
          title="Copy this task's AI instructions"
          className={icon}
          disabled={blocked}
          onClick={onCopy}
        >
          <Bot className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label={`More actions for ${card.title}`}
          aria-expanded={menu}
          className={icon}
          disabled={blocked || editing}
          onClick={() => setMenu(!menu)}
        >
          <MoreHorizontal className="size-3.5" />
        </button>
      </div>
      <div className="board-card-actions absolute right-1 top-1 flex rounded-md border border-border bg-panel opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none">
        <button
          type="button"
          aria-label={`${card.status === "done" ? "Reopen" : "Complete"} ${card.title}`}
          title={card.status === "done" ? "Reopen" : "Mark complete"}
          className={icon}
          disabled={blocked || editing}
          onClick={() => onMove(card.status === "done" ? "todo" : "done")}
        >
          <Check className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label={`Edit ${card.title}`}
          title="Edit card"
          className={icon}
          disabled={blocked}
          onClick={onEdit}
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label={`Delete ${card.title}`}
          title="Delete card"
          className={icon}
          disabled={blocked || editing}
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
      {menu && (
        <div
          className="mt-2 space-y-1 border-t border-border pt-2"
          aria-label={`Actions for ${card.title}`}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              setMenu(false);
              (
                event.currentTarget.previousElementSibling?.lastElementChild as HTMLButtonElement
              )?.focus();
            }
          }}
        >
          <p className="text-ui-xs text-foreground-subtle">Move to</p>
          <div className="flex flex-wrap gap-1">
            {(
              [
                ["todo", "To do"],
                ["doing", "Doing"],
                ["done", "Done"],
              ] as const
            ).map(([status, title]) => (
              <button
                key={status}
                type="button"
                disabled={blocked || editing || card.status === status}
                aria-label={`Move ${card.title} to ${title}`}
                className="rounded px-2 py-1 text-ui-xs hover:bg-hover disabled:opacity-40"
                onClick={() => {
                  setMenu(false);
                  onMove(status);
                }}
              >
                {title}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              aria-label={`Move ${card.title} up`}
              disabled={blocked || editing || !canUp}
              className={`${icon} w-auto gap-1 px-2 text-ui-xs flex`}
              onClick={() => onReorder(-1)}
            >
              <ChevronUp className="size-3" />
              Up
            </button>
            <button
              type="button"
              aria-label={`Move ${card.title} down`}
              disabled={blocked || editing || !canDown}
              className={`${icon} w-auto gap-1 px-2 text-ui-xs flex`}
              onClick={() => onReorder(1)}
            >
              <ChevronDown className="size-3" />
              Down
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
