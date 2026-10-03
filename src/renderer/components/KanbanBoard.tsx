import { ArrowLeft, Bot, Pencil, Plus, RefreshCw, Save, Trash2, Undo2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type {
  KanbanCard as Card,
  KanbanSnapshot,
  KanbanStatus as CardStatus,
} from "../../shared/kanban.js";

const columns = [
  { id: "todo", title: "To do", color: "bg-foreground-subtle" },
  { id: "doing", title: "Doing", color: "bg-brand" },
  { id: "done", title: "Done", color: "bg-green-600" },
] as const;
interface EditorDraft {
  id?: string;
  title: string;
  notes: string;
  status: CardStatus;
}
export interface CardRequest {
  text: string;
  nonce: number;
}
const iconButton =
  "grid size-7 shrink-0 place-items-center rounded-md text-foreground-subtle transition-colors hover:bg-hover hover:text-foreground disabled:opacity-40";

function readBoard(key: string): { cards: Card[]; error: string | null } {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { cards: [], error: null };
    const value = JSON.parse(raw) as { version?: number; cards?: unknown };
    if (value.version !== 1 || !Array.isArray(value.cards)) throw new Error();
    const ids = new Set<string>();
    for (const card of value.cards) {
      if (
        !card ||
        typeof card.id !== "string" ||
        !card.id ||
        ids.has(card.id) ||
        typeof card.title !== "string" ||
        typeof card.notes !== "string" ||
        !columns.some((column) => column.id === card.status)
      )
        throw new Error();
      ids.add(card.id);
    }
    return { cards: value.cards, error: null };
  } catch {
    return {
      cards: [],
      error: "Saved board could not be loaded. It has been kept unchanged; reopen Board to retry.",
    };
  }
}

export function KanbanBoard({
  workspaceId,
  request,
  active = true,
}: {
  workspaceId: string;
  request: CardRequest | null;
  active?: boolean;
}) {
  const key = `vintage:kanban:${workspaceId}`;
  const [initial] = useState(() => readBoard(key));
  const [cards, setCards] = useState<Card[]>([]);
  const [snapshot, setSnapshot] = useState<KanbanSnapshot | null>(null);
  const [saving, setSaving] = useState(false);
  const [changed, setChanged] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const [reloadVersion, setReloadVersion] = useState(0);
  const snapshotRef = useRef<KanbanSnapshot | null>(null);
  const initialized = useRef(false);
  const busy = useRef(false);
  const generation = useRef(0);
  const [error, setError] = useState(initial.error);
  const [editor, setEditor] = useState<EditorDraft | null>(null);
  const [deleted, setDeleted] = useState<{ card: Card; index: number } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropColumn, setDropColumn] = useState<CardStatus | null>(null);
  const editorRef = useRef(editor);
  editorRef.current = editor;
  const draggingRef = useRef(draggingId);
  draggingRef.current = draggingId;
  const blocked = saving || !snapshot || Boolean(initial.error);
  const applySnapshot = useCallback((next: KanbanSnapshot) => {
    snapshotRef.current = next;
    setSnapshot(next);
    setCards(next.board.cards);
    setChanged(false);
    setError(null);
  }, []);
  useEffect(() => {
    if (!active || initial.error) return;
    const read = window.desktop?.readWorkspaceKanban;
    if (!read) {
      setError("Board access is available in the desktop app.");
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      if (!busy.current && !draggingRef.current) {
        const token = generation.current;
        try {
          const next = await read(
            workspaceId,
            initialized.current ? undefined : { version: 1, cards: initial.cards },
          );
          if (!cancelled && token === generation.current) {
            initialized.current = true;
            if (
              snapshotRef.current &&
              editorRef.current &&
              next.revision !== snapshotRef.current.revision
            )
              setChanged(true);
            else if (!editorRef.current || !snapshotRef.current) {
              if (snapshotRef.current?.revision !== next.revision) {
                applySnapshot(next);
                setDeleted(null);
              } else setError(null);
            }
          }
        } catch (cause) {
          if (!cancelled && token === generation.current)
            setError(cause instanceof Error ? cause.message : String(cause));
        }
      }
      if (!cancelled) timer = setTimeout(() => void check(), 3000);
    };
    void check();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active, workspaceId, initial, applySnapshot, reloadVersion, Boolean(editor)]);
  const copyInstructions = async (cardId?: string) => {
    try {
      if (!window.desktop) throw new Error("Use the desktop app to copy AI instructions.");
      await window.desktop.copyWorkspaceKanbanInstructions(workspaceId, cardId);
      setCopyStatus("AI instructions copied · Paste into your agent");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };
  const reload = () => {
    if (
      busy.current ||
      (editor && !window.confirm("Discard this card draft and reload the latest board?"))
    )
      return;
    generation.current += 1;
    setEditor(null);
    setDeleted(null);
    setCopyStatus("");
    setReloadVersion((value) => value + 1);
  };
  const titleInput = useRef<HTMLInputElement>(null);
  const processedRequest = useRef<number | null>(null);
  useEffect(() => {
    if (!request || processedRequest.current === request.nonce) return;
    processedRequest.current = request.nonce;
    const [first, ...rest] = request.text.trim().split("\n");
    setEditor({
      title: (first ?? "").replace(/^\s*(?:[-*+]\s+(?:\[[ xX]\]\s*)?|#{1,6}\s+)/u, "").trim(),
      notes: rest.join("\n").trim(),
      status: "todo",
    });
  }, [request]);
  useEffect(() => {
    if (editor) titleInput.current?.focus();
  }, [Boolean(editor)]);

  const persist = async (next: Card[]) => {
    const baseline = snapshotRef.current;
    if (!baseline || busy.current || initial.error || !window.desktop) return false;
    busy.current = true;
    setSaving(true);
    generation.current += 1;
    setCopyStatus("");
    try {
      const saved = await window.desktop.saveWorkspaceKanban(
        workspaceId,
        { version: 1, cards: next },
        baseline.revision,
      );
      applySnapshot(saved);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };
  const move = async (id: string, status: CardStatus) => {
    if (await persist(cards.map((card) => (card.id === id ? { ...card, status } : card))))
      setDeleted(null);
  };
  const add = (status: CardStatus) => setEditor({ title: "", notes: "", status });

  return (
    <section className="flex h-full min-h-0 flex-col bg-panel" aria-label="Kanban board">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        <span className="flex-1 text-ui-sm font-medium">
          Workspace board <span className="ml-1 text-foreground-subtle">{cards.length}</span>
        </span>
        <button
          type="button"
          aria-label="Copy AI instructions"
          title="Copy board path and AI instructions"
          className={iconButton}
          disabled={blocked}
          onClick={() => void copyInstructions()}
        >
          <Bot aria-hidden="true" className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Reload board"
          title="Reload board"
          className={iconButton}
          disabled={saving}
          onClick={reload}
        >
          <RefreshCw aria-hidden="true" className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Add card"
          title="Add card"
          className={iconButton}
          disabled={blocked}
          onClick={() => add("todo")}
        >
          <Plus aria-hidden="true" className="size-4" />
        </button>
      </div>
      {error && (
        <p role="alert" className="shrink-0 p-3 text-ui-sm text-destructive">
          {error}
        </p>
      )}
      {changed && (
        <p
          role="status"
          className="shrink-0 border-b border-border p-3 text-ui-sm text-foreground-subtle"
        >
          Board changed on disk. Your draft is kept; reload before saving.
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        {editor && (
          <form
            aria-label={editor.id ? "Edit card" : "New card"}
            className="m-3 space-y-3 rounded-lg border border-border bg-background p-3"
            onSubmit={async (event) => {
              event.preventDefault();
              const title = editor.title.trim();
              if (!title) return;
              const card: Card = { ...editor, title, id: editor.id ?? crypto.randomUUID() };
              const next = editor.id
                ? cards.map((existing) => (existing.id === editor.id ? card : existing))
                : [...cards, card];
              if (await persist(next)) {
                setEditor(null);
                setDeleted(null);
              }
            }}
          >
            <div className="flex items-center justify-between text-ui-sm font-medium">
              <span className="flex-1">{editor.id ? "Edit card" : "New card"}</span>
              <button
                type="submit"
                aria-label={editor.id ? "Save card" : "Create card"}
                title={editor.id ? "Save card" : "Create card"}
                disabled={!editor.title.trim() || blocked}
                className={iconButton}
              >
                <Save aria-hidden="true" className="size-4" />
              </button>
              <button
                type="button"
                disabled={saving}
                aria-label="Cancel card editing"
                title="Cancel"
                className={iconButton}
                onClick={() => setEditor(null)}
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>
            <label className="block text-ui-xs text-foreground-subtle">
              Title
              <input
                ref={titleInput}
                aria-label="Card title"
                disabled={saving}
                required
                maxLength={200}
                value={editor.title}
                onChange={(event) => setEditor({ ...editor, title: event.target.value })}
                className="mt-1 block w-full rounded-md border border-border bg-panel px-2 py-1.5 text-ui-base leading-relaxed text-foreground outline-none focus:border-brand"
                placeholder="What needs doing?"
              />
            </label>
            <label className="block text-ui-xs text-foreground-subtle">
              Notes
              <textarea
                aria-label="Card notes"
                disabled={saving}
                value={editor.notes}
                onChange={(event) => setEditor({ ...editor, notes: event.target.value })}
                className="mt-1 block min-h-20 w-full resize-y rounded-md border border-border bg-panel px-2 py-1.5 text-ui-base leading-relaxed text-foreground outline-none focus:border-brand"
                placeholder="Details, ideas, or next steps…"
              />
            </label>
          </form>
        )}
        <div className="grid min-h-full min-w-[560px] grid-cols-3 gap-3 p-3">
          {columns.map((column) => (
            <section
              key={column.id}
              aria-label={column.title}
              data-kanban-column={column.id}
              className={`min-w-0 rounded-lg border p-2 ${dropColumn === column.id ? "border-brand bg-selected" : "border-border bg-background"}`}
              onDragOver={(event) => {
                if (!draggingId || blocked) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDropColumn(column.id);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                  setDropColumn(null);
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (draggingId && !blocked) void move(draggingId, column.id);
                setDraggingId(null);
                setDropColumn(null);
              }}
            >
              <div className="mb-2 flex items-center gap-2">
                <span className={`size-2 rounded-full ${column.color}`} />
                <h3 className="flex-1 text-ui-sm font-medium">
                  {column.title}{" "}
                  <span className="ml-1 text-foreground-subtle">
                    {cards.filter((card) => card.status === column.id).length}
                  </span>
                </h3>
                <button
                  type="button"
                  aria-label={`Add card to ${column.title}`}
                  title={`Add card to ${column.title}`}
                  className={iconButton}
                  disabled={blocked}
                  onClick={() => add(column.id)}
                >
                  <Plus aria-hidden="true" className="size-3.5" />
                </button>
              </div>
              <div className="space-y-2">
                {cards
                  .filter((card) => card.status === column.id)
                  .map((card) => (
                    <article
                      key={card.id}
                      aria-label={card.title}
                      draggable={!editor && !blocked}
                      onDragStart={(event) => {
                        event.dataTransfer.setData("text/plain", card.id);
                        event.dataTransfer.effectAllowed = "move";
                        setDraggingId(card.id);
                      }}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setDropColumn(null);
                      }}
                      className={`rounded-md border border-border bg-panel p-2 shadow-sm ${draggingId === card.id ? "opacity-40" : ""}`}
                    >
                      <button
                        type="button"
                        className="w-full break-words text-left text-ui-sm font-medium hover:text-brand"
                        disabled={blocked || Boolean(editor)}
                        title="Edit card"
                        onClick={() => setEditor({ ...card })}
                      >
                        {card.title}
                      </button>
                      {card.notes && (
                        <p className="mt-2 whitespace-pre-wrap break-words text-ui-xs text-foreground-subtle">
                          {card.notes}
                        </p>
                      )}
                      <div className="mt-3 flex items-center justify-end gap-1">
                        <button
                          type="button"
                          aria-label={`Copy AI instructions for ${card.title}`}
                          title="Copy this task's AI instructions"
                          className={iconButton}
                          disabled={blocked}
                          onClick={() => void copyInstructions(card.id)}
                        >
                          <Bot aria-hidden="true" className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={blocked || Boolean(editor)}
                          aria-label={`Edit ${card.title}`}
                          title="Edit card"
                          className={iconButton}
                          onClick={() => setEditor({ ...card })}
                        >
                          <Pencil aria-hidden="true" className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={blocked || Boolean(editor)}
                          aria-label={`Delete ${card.title}`}
                          title="Delete card"
                          className={iconButton}
                          onClick={async () => {
                            const index = cards.findIndex((existing) => existing.id === card.id);
                            if (await persist(cards.filter((existing) => existing.id !== card.id)))
                              setDeleted({ card, index });
                          }}
                        >
                          <Trash2 aria-hidden="true" className="size-3.5" />
                        </button>
                      </div>
                    </article>
                  ))}
                {!cards.some((card) => card.status === column.id) && (
                  <button
                    type="button"
                    className="w-full rounded-md border border-dashed border-border px-2 py-5 text-ui-xs text-foreground-subtle hover:bg-hover"
                    disabled={blocked}
                    onClick={() => add(column.id)}
                  >
                    + Add a card
                  </button>
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
      <div
        className="flex shrink-0 items-center gap-2 border-t border-border px-3 py-2 text-ui-xs text-foreground-subtle"
        role="status"
      >
        {copyStatus ? (
          <span>{copyStatus}</span>
        ) : deleted ? (
          <>
            <span className="flex-1 truncate">Deleted {deleted.card.title}</span>
            <button
              type="button"
              disabled={blocked}
              className="flex items-center gap-1 text-foreground hover:text-brand"
              onClick={async () => {
                const next = [...cards];
                next.splice(deleted.index, 0, deleted.card);
                if (await persist(next)) setDeleted(null);
              }}
            >
              <Undo2 aria-hidden="true" className="size-3.5" />
              Undo
            </button>
          </>
        ) : (
          <>
            <ArrowLeft aria-hidden="true" className="size-3.5" />
            <span>
              {saving
                ? "Saving…"
                : !snapshot
                  ? "Loading board…"
                  : "Saved to app data · AI button copies path and update instructions"}
            </span>
          </>
        )}
      </div>
    </section>
  );
}
