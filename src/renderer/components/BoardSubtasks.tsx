import { ListChecks, Plus, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { KANBAN_SUBTASK_LIMIT, type KanbanSubtask } from "../../shared/kanban.js";

export function BoardSubtaskProgress({
  subtasks,
  showIcon = false,
}: {
  subtasks: KanbanSubtask[];
  showIcon?: boolean;
}) {
  const done = subtasks.filter((item) => item.done).length;
  const total = subtasks.length;
  return (
    <div className="flex min-w-0 items-center gap-2 text-ui-xs text-foreground-subtle">
      {showIcon && <ListChecks aria-hidden="true" className="size-3.5 shrink-0" />}
      <span className="shrink-0 tabular-nums">
        {done}/{total}
      </span>
      {total > 0 && (
        <div
          role="progressbar"
          aria-label="Subtask progress"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          aria-valuetext={`${done} of ${total} subtasks completed`}
          className="h-1 min-w-12 flex-1 overflow-hidden rounded-full bg-border"
        >
          <div
            className={`h-full rounded-full ${done === total ? "bg-green-600" : "bg-brand"}`}
            style={{ width: `${(done / total) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function BoardSubtasks({
  subtasks,
  newTitle,
  saving,
  error,
  onNewTitle,
  onChange,
  onAdd,
}: {
  subtasks: KanbanSubtask[];
  newTitle: string;
  saving: boolean;
  error: string;
  onNewTitle: (title: string) => void;
  onChange: (subtasks: KanbanSubtask[]) => void;
  onAdd: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const previousCount = useRef(subtasks.length);
  useEffect(() => {
    if (subtasks.length > previousCount.current) input.current?.focus();
    previousCount.current = subtasks.length;
  }, [subtasks.length]);
  return (
    <section className="mt-7" aria-label="Subtasks">
      <div className="mb-3 flex items-center gap-3">
        <h3 className="text-ui-sm font-semibold">Subtasks</h3>
        <div className="w-40">
          <BoardSubtaskProgress subtasks={subtasks} />
        </div>
      </div>
      <div className="space-y-1">
        {subtasks.map((item, index) => (
          <div
            key={item.id}
            className="group flex min-w-0 items-center gap-2 rounded-md hover:bg-panel"
          >
            <input
              type="checkbox"
              aria-label={`Complete subtask ${item.title}`}
              checked={item.done}
              disabled={saving}
              className="ml-1 size-3.5 shrink-0 accent-brand"
              onChange={(event) =>
                onChange(
                  subtasks.map((sub) =>
                    sub.id === item.id ? { ...sub, done: event.target.checked } : sub,
                  ),
                )
              }
            />
            <input
              aria-label={`Subtask title ${index + 1}`}
              title={item.title}
              required
              maxLength={200}
              disabled={saving}
              value={item.title}
              onChange={(event) =>
                onChange(
                  subtasks.map((sub) =>
                    sub.id === item.id ? { ...sub, title: event.target.value } : sub,
                  ),
                )
              }
              className={`min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-2 text-ui-sm outline-none focus:border-brand ${item.done ? "text-foreground-subtle line-through" : ""}`}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.nativeEvent.isComposing &&
                  event.keyCode !== 229
                ) {
                  event.preventDefault();
                  input.current?.focus();
                }
              }}
            />
            <button
              type="button"
              aria-label={`Delete subtask ${item.title}`}
              title="Delete subtask"
              disabled={saving}
              className="board-subtask-delete mr-1 rounded-md p-1.5 text-foreground-subtle opacity-0 hover:bg-hover group-hover:opacity-100 group-focus-within:opacity-100 disabled:opacity-40"
              onClick={() => onChange(subtasks.filter((sub) => sub.id !== item.id))}
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          aria-label="Add subtask"
          title="Add subtask · Enter"
          disabled={saving || subtasks.length >= KANBAN_SUBTASK_LIMIT}
          className="rounded-md p-1 text-foreground-subtle hover:bg-hover disabled:opacity-40"
          onClick={() => {
            if (newTitle.trim()) onAdd();
            else input.current?.focus();
          }}
        >
          <Plus className="size-4" />
        </button>
        <input
          ref={input}
          aria-label="New subtask title"
          placeholder="Add subtask…"
          maxLength={200}
          disabled={saving || subtasks.length >= KANBAN_SUBTASK_LIMIT}
          value={newTitle}
          onChange={(event) => onNewTitle(event.target.value)}
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-2 text-ui-sm outline-none focus:border-brand"
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || event.keyCode === 229) return;
            if (event.key === "Enter") {
              event.preventDefault();
              onAdd();
            }
            if (event.key === "Escape" && newTitle) {
              event.preventDefault();
              event.stopPropagation();
              onNewTitle("");
            }
          }}
        />
      </div>
      {subtasks.length >= KANBAN_SUBTASK_LIMIT && (
        <p className="mt-1 text-ui-xs text-foreground-subtle">
          Up to {KANBAN_SUBTASK_LIMIT} subtasks per card.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-1 text-ui-xs text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
