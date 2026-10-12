import {
  ArrowDownWideNarrow,
  Bot,
  ChevronsLeft,
  ChevronsRight,
  ListFilter,
  Maximize2,
  Minimize2,
  Plus,
  RefreshCw,
  Search,
  SquareKanban,
  Undo2,
} from "lucide-react";
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
} from "react";
import type { KanbanCard as Card, KanbanStatus as CardStatus } from "../../shared/kanban.js";
import { moveKanbanCard } from "../../shared/kanbanOrder.js";
import { BoardCard } from "./BoardCard.js";
import { BoardStatusIcon } from "./BoardMetadata.js";
import { BoardCardDetail } from "./BoardCardDetail.js";
import { BoardComposer } from "./BoardComposer.js";
import { useKanbanBoard, type EditorDraft } from "./useKanbanBoard.js";

const columns = [
  { id: "todo", title: "To do", color: "bg-foreground-subtle" },
  { id: "doing", title: "Doing", color: "bg-brand" },
  { id: "done", title: "Done", color: "bg-green-600" },
] as const;
export interface CardRequest {
  text: string;
  nonce: number;
}
const iconButton =
  "grid size-7 shrink-0 place-items-center rounded-md text-foreground-subtle hover:bg-hover hover:text-foreground disabled:opacity-40";

export function KanbanBoard({
  workspaceId,
  workspaceName = "Workspace",
  request,
  active = true,
}: {
  workspaceId: string;
  workspaceName?: string;
  request: CardRequest | null;
  active?: boolean;
}) {
  const board = useKanbanBoard(workspaceId, active);
  const { cards, editor, setEditor, blocked, saving, draggingId, setDraggingId } = board;
  const [expanded, setExpanded] = useState(false);
  const [overlay, setOverlay] = useState<CSSProperties>({});
  const root = useRef<HTMLElement>(null);
  const [sort, setSort] = useState<"manual" | "priority" | "due">("manual");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [editorEpoch, setEditorEpoch] = useState(0);
  const [mode, setMode] = useState<"detail" | "inline">("detail");
  const [query, setQuery] = useState("");
  const [showDone, setShowDone] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<CardStatus>>(new Set());
  const [drop, setDrop] = useState<{ status: CardStatus; before: string | null } | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const origin = useRef<HTMLElement | null>(null);
  const originalDraft = useRef<EditorDraft | null>(null);
  const pendingInput = useRef("");
  const processedRequest = useRef<number | null>(null);
  const animation = useRef<number | null>(null);
  const pointer = useRef<{ x: number; y: number; body: HTMLElement } | null>(null);
  const searching = Boolean(query.trim()) || priorityFilter !== "all";
  const orderingDisabled = searching || sort !== "manual";
  const visibleCards = cards.filter(
    (card) =>
      (showDone || card.status !== "done") &&
      (priorityFilter === "all" || (card.priority ?? "none") === priorityFilter) &&
      (!query.trim() ||
        `${card.title}\n${card.notes}`
          .toLocaleLowerCase()
          .includes(query.trim().toLocaleLowerCase())),
  );

  useLayoutEffect(() => {
    if (!expanded || !active) return;
    const host = root.current?.closest<HTMLElement>("[data-workspace-content]");
    const update = () => {
      const bounds = host?.getBoundingClientRect();
      setOverlay({
        position: "fixed",
        left: bounds?.left ?? 0,
        top: bounds?.top ?? 36,
        width: bounds?.width ?? window.innerWidth,
        height: bounds?.height ?? window.innerHeight - 36,
        zIndex: 30,
      });
    };
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    if (host) observer?.observe(host);
    window.addEventListener("resize", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [expanded, active]);
  useEffect(() => {
    if (!active) setExpanded(false);
    else if (editor && mode === "detail") setExpanded(true);
  }, [active]);

  const restoreFocus = () =>
    requestAnimationFrame(() => {
      if (origin.current?.isConnected) origin.current.focus();
      else scroll.current?.focus();
    });
  const close = () => {
    if (saving) return;
    if (
      editor &&
      originalDraft.current &&
      (JSON.stringify(editor) !== JSON.stringify(originalDraft.current) ||
        pendingInput.current.trim()) &&
      !window.confirm("Discard this card draft?")
    )
      return;
    pendingInput.current = "";
    setEditor(null);
    restoreFocus();
  };
  const open = (draft: EditorDraft, nextMode: "detail" | "inline") => {
    if (blocked || saving) return;
    if (
      editor &&
      (JSON.stringify(editor) !== JSON.stringify(originalDraft.current) ||
        pendingInput.current.trim()) &&
      !window.confirm("Discard this card draft and open another card?")
    )
      return;
    if (nextMode === "detail") setExpanded(true);
    pendingInput.current = "";
    origin.current = document.activeElement as HTMLElement;
    originalDraft.current = { ...draft };
    setEditorEpoch((value) => value + 1);
    setMode(nextMode);
    setEditor(draft);
  };
  useEffect(() => {
    if (!request || processedRequest.current === request.nonce || !active || saving) return;
    processedRequest.current = request.nonce;
    if (editor && !window.confirm("Discard this card draft and create a card from the note?"))
      return;
    const [first, ...rest] = request.text.trim().split("\n");
    const draft: EditorDraft = {
      title: (first ?? "").replace(/^\s*(?:[-*+]\s+(?:\[[ xX]\]\s*)?|#{1,6}\s+)/u, "").trim(),
      notes: rest.join("\n").trim(),
      status: "todo",
    };
    originalDraft.current = { ...draft };
    origin.current = document.activeElement as HTMLElement;
    pendingInput.current = "";
    setEditorEpoch((value) => value + 1);
    setExpanded(true);
    setMode("detail");
    setEditor(draft);
  }, [request, active, saving, editor, setEditor]);

  const stopDrag = () => {
    if (animation.current !== null) cancelAnimationFrame(animation.current);
    animation.current = null;
    pointer.current = null;
    setDraggingId(null);
    setDrop(null);
  };
  useEffect(() => {
    if (!active) stopDrag();
    return () => {
      if (animation.current !== null) cancelAnimationFrame(animation.current);
    };
  }, [active]);
  const insertAt = (body: HTMLElement, y: number) => {
    const after = [...body.querySelectorAll<HTMLElement>("[data-board-card]")].find((element) => {
      if (element.dataset.boardCard === draggingId) return false;
      const rect = element.getBoundingClientRect();
      return y < rect.top + rect.height / 2;
    });
    return after?.dataset.boardCard ?? null;
  };
  const autoScroll = () => {
    const tick = () => {
      const current = pointer.current;
      if (!current || !scroll.current) {
        animation.current = null;
        return;
      }
      const horizontal = scroll.current.getBoundingClientRect();
      const vertical = current.body.getBoundingClientRect();
      const speed = (position: number, start: number, end: number) =>
        position < start + 32 ? -10 : position > end - 32 ? 10 : 0;
      scroll.current.scrollLeft += speed(current.x, horizontal.left, horizontal.right);
      current.body.scrollTop += speed(current.y, vertical.top, vertical.bottom);
      setDrop((previous) =>
        previous ? { ...previous, before: insertAt(current.body, current.y) } : previous,
      );
      animation.current = requestAnimationFrame(tick);
    };
    if (animation.current === null) animation.current = requestAnimationFrame(tick);
  };
  const dragOver = (event: DragEvent<HTMLElement>, status: CardStatus) => {
    if (!draggingId || blocked || editor || orderingDisabled || !active) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const body = event.currentTarget.querySelector<HTMLElement>("[data-board-body]");
    setDrop({ status, before: body ? insertAt(body, event.clientY) : null });
    if (body) {
      pointer.current = { x: event.clientX, y: event.clientY, body };
      autoScroll();
    }
  };
  const move = async (id: string, status: CardStatus, before: string | null) => {
    const next = moveKanbanCard(cards, id, status, before);
    if (next !== cards) await board.persist(next);
  };
  const saveEditor = async (draft: EditorDraft | null = editor) => {
    if (!draft || blocked || saving || !draft.title.trim()) return;
    if (draft.id && !cards.some((card) => card.id === draft.id)) return;
    const card: Card = {
      ...draft,
      id: draft.id ?? crypto.randomUUID(),
      title: draft.title.trim(),
      notes: draft.notes,
      status: draft.status,
    };
    const next = draft.id
      ? cards.map((existing) => (existing.id === card.id ? card : existing))
      : [...cards, card];
    if (await board.persist(next)) {
      if (mode === "inline") {
        const emptyDraft = { title: "", notes: "", status: draft.status };
        originalDraft.current = emptyDraft;
        setEditor(emptyDraft);
      } else {
        setEditor(null);
        restoreFocus();
      }
    }
  };
  return (
    <section
      ref={root}
      style={expanded && active ? overlay : undefined}
      data-board-expanded={expanded && active}
      className={`board-surface flex h-full min-h-0 flex-col bg-background ${expanded && active ? "border-t border-border" : ""}`}
      aria-label="Kanban board"
    >
      <div className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand">
          <SquareKanban aria-hidden="true" className="size-5" />
        </span>
        <h2 className="min-w-0 flex-1 truncate text-ui-lg font-semibold">
          {workspaceName} / Board{" "}
          <span className="ml-1 text-ui-xs font-normal text-foreground-subtle">{cards.length}</span>
        </h2>
        <button
          type="button"
          aria-label={expanded ? "Restore board to side pane" : "Expand board"}
          title={expanded ? "Restore board to side pane" : "Expand board"}
          className={iconButton}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </button>
        <button
          type="button"
          aria-label="Copy AI instructions"
          title="Copy instructions for ALL To do cards (including hidden cards)"
          className={iconButton}
          disabled={blocked}
          onClick={() => void board.copyInstructions()}
        >
          <Bot className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Reload board"
          title="Reload board"
          className={iconButton}
          disabled={saving}
          onClick={() => {
            board.reload();
          }}
        >
          <RefreshCw className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Add card"
          title="Add card"
          className={iconButton}
          disabled={blocked || Boolean(editor)}
          onClick={() => open({ title: "", notes: "", status: "todo" }, "detail")}
        >
          <Plus className="size-4" />
        </button>
      </div>
      {board.error && (
        <p role="alert" className="shrink-0 p-3 text-ui-sm text-destructive">
          {board.error}
        </p>
      )}
      {board.changed && (
        <p
          role="status"
          className="shrink-0 border-b border-border p-3 text-ui-sm text-foreground-subtle"
        >
          {board.missingCard
            ? "This card was deleted on disk. Your draft is kept; copy its contents before reloading."
            : "Board changed on disk. Your draft is kept; reload before saving."}
        </p>
      )}
      <div className="board-content flex min-h-0 flex-1 overflow-x-auto">
        <div className="board-list flex min-h-0 min-w-[284px] flex-1 flex-col">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
            <label className="flex min-w-0 max-w-64 flex-1 items-center gap-2 rounded-md border border-border bg-background px-2">
              <Search aria-hidden="true" className="size-3.5 shrink-0 text-foreground-subtle" />
              <input
                aria-label="Search cards"
                placeholder="Search cards"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="min-w-0 w-full bg-transparent py-1.5 text-ui-sm outline-none"
              />
            </label>
            <button
              type="button"
              aria-label="Filter cards"
              aria-expanded={filtersOpen}
              className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-ui-xs hover:bg-hover"
              onClick={() => setFiltersOpen(!filtersOpen)}
            >
              <ListFilter className="size-3.5" />
              Filter{priorityFilter !== "all" ? " · 1" : ""}
            </button>
            <label className="flex items-center gap-1.5 text-ui-xs text-foreground-subtle">
              <ArrowDownWideNarrow className="size-3.5" />
              Sort:
              <select
                aria-label="Sort cards"
                value={sort}
                onChange={(event) => setSort(event.target.value as typeof sort)}
                className="min-w-0 rounded-md bg-transparent py-1 outline-none"
              >
                <option value="manual">Manual</option>
                <option value="priority">Priority</option>
                <option value="due">Due date</option>
              </select>
            </label>
            <span className="flex-1" />
            <label className="flex items-center gap-1.5 text-ui-xs text-foreground-subtle">
              <input
                type="checkbox"
                disabled={Boolean(editor)}
                checked={showDone}
                onChange={(event) => setShowDone(event.target.checked)}
              />
              Show done
            </label>
          </div>
          {filtersOpen && (
            <div className="shrink-0 border-b border-border px-4 py-2">
              <label className="flex items-center gap-2 text-ui-xs text-foreground-subtle">
                Priority
                <select
                  aria-label="Filter by priority"
                  value={priorityFilter}
                  onChange={(event) => setPriorityFilter(event.target.value)}
                  className="rounded-md border border-border bg-background px-2 py-1"
                >
                  <option value="all">All priorities</option>
                  {["urgent", "high", "medium", "low", "none"].map((value) => (
                    <option key={value} value={value}>
                      {value === "none" ? "No priority" : value[0]!.toUpperCase() + value.slice(1)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {searching && (
            <div className="flex shrink-0 items-center gap-2 px-3 py-1 text-ui-xs text-foreground-subtle">
              <span className="flex-1">
                {visibleCards.length} results · Clear filters and select Manual to reorder
              </span>
              <button
                type="button"
                className="rounded px-1 py-1 hover:bg-hover"
                onClick={() => {
                  setQuery("");
                  setPriorityFilter("all");
                }}
              >
                Clear search
              </button>
            </div>
          )}
          <div
            ref={scroll}
            tabIndex={-1}
            data-board-scroll
            className="flex min-h-0 flex-1 items-start gap-3 overflow-x-auto overflow-y-hidden px-4 py-4"
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                pointer.current = null;
                setDrop(null);
              }
            }}
          >
            {columns
              .filter((column) => showDone || column.id !== "done")
              .map((column) => {
                const all = cards.filter((card) => card.status === column.id);
                const priorityWeight = { none: 0, low: 1, medium: 2, high: 3, urgent: 4 };
                const shown = visibleCards
                  .filter((card) => card.status === column.id)
                  .sort((a, b) =>
                    sort === "priority"
                      ? priorityWeight[b.priority ?? "none"] - priorityWeight[a.priority ?? "none"]
                      : sort === "due"
                        ? (a.dueDate ?? "9999-99-99").localeCompare(b.dueDate ?? "9999-99-99")
                        : 0,
                  );
                const folded = collapsed.has(column.id);
                return (
                  <section
                    key={column.id}
                    aria-label={column.title}
                    data-kanban-column={column.id}
                    className={`board-column flex min-h-0 max-h-full shrink-0 flex-col rounded-xl border ${folded ? "w-11" : "w-[260px]"} ${drop?.status === column.id ? "border-brand bg-selected" : "border-border bg-panel/40"}`}
                    onDragOver={(event) => dragOver(event, column.id)}
                    onDragLeave={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                        pointer.current = null;
                        setDrop(null);
                      }
                    }}
                    onDrop={(event) => {
                      if (draggingId && !blocked && !editor && !orderingDisabled && active) {
                        event.preventDefault();
                        const body =
                          event.currentTarget.querySelector<HTMLElement>("[data-board-body]");
                        const before = body ? insertAt(body, event.clientY) : null;
                        void move(draggingId, column.id, before);
                      }
                      stopDrag();
                    }}
                  >
                    {folded ? (
                      <button
                        type="button"
                        aria-label={`Expand ${column.title}`}
                        className="flex min-h-40 flex-col items-center gap-3 py-3 text-ui-sm hover:bg-hover"
                        onClick={() =>
                          setCollapsed((current) => {
                            const next = new Set(current);
                            next.delete(column.id);
                            return next;
                          })
                        }
                      >
                        <ChevronsRight className="size-4" />
                        <BoardStatusIcon status={column.id} />
                        <span className="[writing-mode:vertical-rl]">
                          {column.title} ·{" "}
                          {searching ? `${shown.length} / ${all.length}` : all.length}
                        </span>
                      </button>
                    ) : (
                      <>
                        <div className="flex shrink-0 items-center gap-2 px-3 py-2">
                          <BoardStatusIcon status={column.id} />
                          <h3 className="flex-1 text-ui-sm font-medium">
                            {column.title}{" "}
                            <span className="text-foreground-subtle">
                              {searching ? `${shown.length} / ${all.length}` : all.length}
                            </span>
                          </h3>
                          <button
                            type="button"
                            aria-label={`Add card to ${column.title}`}
                            title="Add card in this column"
                            className={iconButton}
                            disabled={blocked || Boolean(editor)}
                            onClick={() =>
                              open({ title: "", notes: "", status: column.id }, "inline")
                            }
                          >
                            <Plus className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Collapse ${column.title}`}
                            title="Collapse column"
                            className={iconButton}
                            disabled={editor?.status === column.id}
                            onClick={() =>
                              setCollapsed((current) => new Set(current).add(column.id))
                            }
                          >
                            <ChevronsLeft className="size-3.5" />
                          </button>
                        </div>
                        <div
                          data-board-body
                          className="min-h-0 space-y-1.5 overflow-y-auto px-2 pb-2"
                        >
                          {shown.map((card, index) => (
                            <Fragment key={card.id}>
                              {drop?.status === column.id && drop.before === card.id && (
                                <div aria-hidden="true" className="h-0.5 rounded bg-brand" />
                              )}
                              <BoardCard
                                card={card}
                                blocked={blocked}
                                editing={Boolean(editor)}
                                selected={editor?.id === card.id}
                                draggable={!blocked && !editor && !orderingDisabled && active}
                                dragging={draggingId === card.id}
                                canUp={!orderingDisabled && index > 0}
                                canDown={!orderingDisabled && index < shown.length - 1}
                                onEdit={() => open({ ...card }, "detail")}
                                onCopy={() => void board.copyInstructions(card.id)}
                                onDelete={() => {
                                  void (async () => {
                                    const index = cards.findIndex((value) => value.id === card.id);
                                    if (
                                      await board.persist(
                                        cards.filter((value) => value.id !== card.id),
                                      )
                                    )
                                      board.setDeleted({ card, index });
                                  })();
                                }}
                                onMove={(status) => void move(card.id, status, null)}
                                onReorder={(direction) => {
                                  const before =
                                    direction === -1
                                      ? (shown[index - 1]?.id ?? null)
                                      : (shown[index + 2]?.id ?? null);
                                  void move(card.id, card.status, before);
                                }}
                                onDragStart={(event) => {
                                  if (
                                    blocked ||
                                    editor ||
                                    orderingDisabled ||
                                    !active ||
                                    (event.target as HTMLElement).closest("button, input, textarea")
                                  ) {
                                    event.preventDefault();
                                    return;
                                  }
                                  event.dataTransfer.setData("text/plain", card.id);
                                  event.dataTransfer.effectAllowed = "move";
                                  setDraggingId(card.id);
                                }}
                                onDragEnd={stopDrag}
                              />
                            </Fragment>
                          ))}
                          {drop?.status === column.id && drop.before === null && (
                            <div aria-hidden="true" className="h-0.5 rounded bg-brand" />
                          )}
                          {!shown.length && (
                            <p className="px-2 py-3 text-ui-xs text-foreground-subtle">
                              {all.length ? "No cards match this search." : "No cards yet."}
                            </p>
                          )}
                          {editor && mode === "inline" && editor.status === column.id ? (
                            <BoardComposer
                              title={editor.title}
                              disabled={blocked || board.missingCard}
                              saving={saving}
                              onChange={(title) => setEditor({ ...editor, title })}
                              onSave={saveEditor}
                              onClose={close}
                            />
                          ) : (
                            <button
                              type="button"
                              disabled={blocked || Boolean(editor)}
                              aria-label={`Add another card to ${column.title}`}
                              className="flex w-full items-center gap-1 rounded-md px-2 py-2 text-ui-xs text-foreground-subtle hover:bg-hover disabled:opacity-40"
                              onClick={() =>
                                open({ title: "", notes: "", status: column.id }, "inline")
                              }
                            >
                              <Plus className="size-3.5" />
                              Add card
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </section>
                );
              })}
          </div>
        </div>
        {editor && mode === "detail" && (
          <BoardCardDetail
            key={`${editor.id ?? "new"}:${editorEpoch}`}
            workspaceName={workspaceName}
            onPendingInput={(value) => {
              pendingInput.current = value;
            }}
            onCopy={() => void board.copyInstructions(editor.id)}
            draft={editor}
            disabled={blocked || board.missingCard}
            saving={saving}
            onChange={setEditor}
            onSave={saveEditor}
            onClose={close}
          />
        )}
      </div>
      <div
        className="flex shrink-0 items-center gap-2 border-t border-border px-3 py-2 text-ui-xs text-foreground-subtle"
        role="status"
      >
        {saving ? (
          "Saving…"
        ) : board.deleted ? (
          <>
            <span className="min-w-0 flex-1 truncate">Deleted {board.deleted.card.title}</span>
            <button
              type="button"
              disabled={blocked || Boolean(editor)}
              className="flex items-center gap-1 text-foreground hover:text-brand"
              onClick={() => {
                const deleted = board.deleted;
                if (!deleted) return;
                const next = [...cards];
                next.splice(deleted.index, 0, deleted.card);
                void board.persist(next);
              }}
            >
              <Undo2 className="size-3.5" />
              Undo
            </button>
          </>
        ) : (
          board.copyStatus ||
          (!board.snapshot
            ? "Loading board…"
            : "Saved to app data · AI copies instructions; it does not run tasks")
        )}
      </div>
    </section>
  );
}
