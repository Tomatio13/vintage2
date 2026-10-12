import { Bot, Calendar, Check, Circle, Flag, Save, Tag, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  KANBAN_PRIORITIES,
  KANBAN_SUBTASK_LIMIT,
  kanbanCardKey,
  type KanbanPriority,
  type KanbanStatus,
} from "../../shared/kanban.js";
import { BoardSubtasks } from "./BoardSubtasks.js";
import { BoardLabel } from "./BoardMetadata.js";
import type { EditorDraft } from "./useKanbanBoard.js";

const control =
  "min-w-0 w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-ui-sm text-foreground outline-none hover:bg-hover focus:border-brand disabled:opacity-50";
export function BoardCardDetail({
  draft,
  workspaceName,
  disabled,
  saving,
  onChange,
  onSave,
  onClose,
  onCopy,
  onPendingInput,
}: {
  draft: EditorDraft;
  workspaceName: string;
  disabled: boolean;
  saving: boolean;
  onChange: (draft: EditorDraft) => void;
  onSave: (draft?: EditorDraft) => Promise<void>;
  onClose: () => void;
  onCopy: () => void;
  onPendingInput: (value: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [label, setLabel] = useState("");
  const [labelError, setLabelError] = useState("");
  const [newSubtask, setNewSubtask] = useState("");
  const [subtaskError, setSubtaskError] = useState("");
  const subtasks = draft.subtasks ?? [];
  const labels = draft.labels ?? [];
  useEffect(() => {
    input.current?.focus();
    setLabel("");
    setLabelError("");
    setNewSubtask("");
    setSubtaskError("");
  }, [draft.id]);
  const addLabel = () => {
    const value = label.trim();
    if (!value) return;
    if (value.length > 32 || labels.length >= 12) {
      setLabelError("Use up to 12 labels, each 1–32 characters.");
      return;
    }
    if (!labels.includes(value)) onChange({ ...draft, labels: [...labels, value] });
    setLabel("");
    onPendingInput(newSubtask);
    setLabelError("");
  };
  const addSubtask = () => {
    const title = newSubtask.trim();
    if (!title) return;
    if (subtasks.length >= KANBAN_SUBTASK_LIMIT) {
      setSubtaskError("Use up to 100 subtasks per card.");
      return;
    }
    onChange({
      ...draft,
      subtasks: [...subtasks, { id: crypto.randomUUID(), title, done: false }],
    });
    setNewSubtask("");
    setSubtaskError("");
    onPendingInput(label);
  };
  return (
    <aside
      className="board-detail flex min-h-0 shrink-0 flex-col border-l border-border bg-background"
      aria-label="Card details"
    >
      <form
        aria-label={draft.id ? "Edit card" : "New card"}
        className="flex h-full min-h-0 flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          const value = label.trim();
          const title = newSubtask.trim();
          if (value && !labels.includes(value) && (labels.length >= 12 || value.length > 32)) {
            setLabelError("Use up to 12 labels, each 1–32 characters.");
            return;
          }
          if (title && subtasks.length >= KANBAN_SUBTASK_LIMIT) {
            setSubtaskError("Use up to 100 subtasks per card.");
            return;
          }
          if (subtasks.some((item) => !item.title.trim())) {
            setSubtaskError("Subtask titles cannot be empty.");
            return;
          }
          const next = {
            ...draft,
            ...(value && !labels.includes(value) ? { labels: [...labels, value] } : {}),
            ...(title
              ? { subtasks: [...subtasks, { id: crypto.randomUUID(), title, done: false }] }
              : {}),
          };
          onChange(next);
          setLabel("");
          setNewSubtask("");
          onPendingInput("");
          setLabelError("");
          setSubtaskError("");
          void onSave(next);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !event.nativeEvent.isComposing) {
            event.stopPropagation();
            onClose();
          }
        }}
      >
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
          <span className="min-w-0 flex-1 truncate text-ui-xs text-foreground-subtle">
            {workspaceName} <span className="mx-2">/</span>
            {draft.id ? kanbanCardKey(draft.id) : "New card"}
          </span>
          {draft.id && (
            <button
              type="button"
              disabled={saving}
              aria-label={draft.status === "done" ? "Reopen card" : "Mark card complete"}
              className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-ui-xs hover:bg-hover"
              onClick={() =>
                onChange({ ...draft, status: draft.status === "done" ? "todo" : "done" })
              }
            >
              {draft.status === "done" ? (
                <Check className="size-3.5" />
              ) : (
                <Circle className="size-3.5" />
              )}
              <span className="hidden sm:inline">
                {draft.status === "done" ? "Completed" : "Mark complete"}
              </span>
            </button>
          )}
          {draft.id && (
            <button
              type="button"
              aria-label="Copy selected card AI instructions"
              title="Copy saved card's AI instructions"
              disabled={disabled}
              className="rounded-md p-1.5 hover:bg-hover"
              onClick={onCopy}
            >
              <Bot className="size-4" />
            </button>
          )}
          <button
            type="button"
            aria-label="Cancel card editing"
            title="Close details"
            disabled={saving}
            className="rounded-md p-1.5 hover:bg-hover"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <input
            ref={input}
            aria-label="Card title"
            required
            maxLength={200}
            disabled={saving}
            value={draft.title}
            placeholder="Task title"
            onChange={(event) => onChange({ ...draft, title: event.target.value })}
            className="mb-6 w-full min-w-0 rounded-md border border-transparent bg-transparent px-1 py-2 text-ui-xl font-semibold outline-none focus:border-brand"
          />
          <div className="grid grid-cols-[104px_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
            <label
              htmlFor="board-detail-status"
              className="flex items-center gap-2 text-ui-sm text-foreground-subtle"
            >
              <Circle className="size-4" />
              Status
            </label>
            <select
              id="board-detail-status"
              aria-label="Card status"
              className={control}
              disabled={saving}
              value={draft.status}
              onChange={(event) =>
                onChange({ ...draft, status: event.target.value as KanbanStatus })
              }
            >
              <option value="todo">To do</option>
              <option value="doing">In progress</option>
              <option value="done">Done</option>
            </select>
            <label
              htmlFor="board-detail-priority"
              className="flex items-center gap-2 text-ui-sm text-foreground-subtle"
            >
              <Flag className="size-4" />
              Priority
            </label>
            <select
              id="board-detail-priority"
              aria-label="Card priority"
              className={control}
              disabled={saving}
              value={draft.priority ?? "none"}
              onChange={(event) =>
                onChange({ ...draft, priority: event.target.value as KanbanPriority })
              }
            >
              {KANBAN_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {priority === "none"
                    ? "No priority"
                    : priority[0]!.toUpperCase() + priority.slice(1)}
                </option>
              ))}
            </select>
            <label
              htmlFor="board-detail-due"
              className="flex items-center gap-2 text-ui-sm text-foreground-subtle"
            >
              <Calendar className="size-4" />
              Due date
            </label>
            <input
              id="board-detail-due"
              aria-label="Card due date"
              type="date"
              min="0001-01-01"
              max="9999-12-31"
              className={control}
              disabled={saving}
              value={draft.dueDate ?? ""}
              onChange={(event) => onChange({ ...draft, dueDate: event.target.value || null })}
            />
            <label
              htmlFor="board-detail-label"
              className="flex items-center gap-2 self-start pt-1.5 text-ui-sm text-foreground-subtle"
            >
              <Tag className="size-4" />
              Labels
            </label>
            <div className="min-w-0">
              <div className="flex flex-wrap gap-1">
                {labels.map((value) => (
                  <button
                    type="button"
                    key={value}
                    aria-label={`Remove label ${value}`}
                    title="Remove label"
                    disabled={saving}
                    className="flex max-w-full items-center gap-1 rounded-md hover:bg-hover"
                    onClick={() =>
                      onChange({ ...draft, labels: labels.filter((item) => item !== value) })
                    }
                  >
                    <BoardLabel label={value} />
                    <X className="size-3 shrink-0 text-foreground-subtle" />
                  </button>
                ))}
              </div>
              <div className="mt-1 flex items-center gap-1">
                <input
                  id="board-detail-label"
                  aria-label="New card label"
                  placeholder="Add label…"
                  value={label}
                  disabled={saving}
                  maxLength={32}
                  className={control}
                  onChange={(event) => {
                    setLabel(event.target.value);
                    onPendingInput(`${event.target.value}\n${newSubtask}`);
                  }}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      !event.nativeEvent.isComposing &&
                      event.keyCode !== 229
                    ) {
                      event.preventDefault();
                      addLabel();
                    }
                  }}
                />
                <button
                  type="button"
                  aria-label="Add label"
                  disabled={saving || !label.trim()}
                  className="rounded-md px-2 py-1 text-ui-xs hover:bg-hover disabled:opacity-40"
                  onClick={addLabel}
                >
                  Add
                </button>
              </div>
              {labelError && (
                <p role="alert" className="text-ui-xs text-destructive">
                  {labelError}
                </p>
              )}
            </div>
          </div>
          <div className="mt-8">
            <label htmlFor="board-detail-notes" className="mb-3 block text-ui-sm font-semibold">
              Description / Notes
            </label>
            <textarea
              id="board-detail-notes"
              aria-label="Card notes"
              disabled={saving}
              maxLength={200_000}
              value={draft.notes}
              onChange={(event) => onChange({ ...draft, notes: event.target.value })}
              className="block min-h-40 w-full resize-y rounded-md border border-transparent bg-transparent px-2 py-2 text-ui-sm leading-relaxed outline-none hover:bg-panel focus:border-brand"
              placeholder="Add a description, requirements, or verification results…"
            />
          </div>
          <BoardSubtasks
            subtasks={subtasks}
            newTitle={newSubtask}
            saving={saving}
            error={subtaskError}
            onNewTitle={(title) => {
              setNewSubtask(title);
              setSubtaskError("");
              onPendingInput(`${label}\n${title}`);
            }}
            onChange={(items) => {
              onChange({ ...draft, subtasks: items });
              setSubtaskError("");
            }}
            onAdd={addSubtask}
          />
        </div>
        <div className="flex shrink-0 items-center justify-end border-t border-border px-4 py-3">
          <button
            type="submit"
            disabled={disabled || !draft.title.trim()}
            aria-label={draft.id ? "Save card" : "Create card"}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-ui-sm text-primary-foreground disabled:opacity-40"
          >
            <Save className="size-3.5" />
            {draft.id ? "Save changes" : "Create card"}
          </button>
        </div>
      </form>
    </aside>
  );
}
