import { useCallback, useEffect, useRef, useState } from "react";
import type {
  KanbanCard as Card,
  KanbanSnapshot,
  KanbanStatus as CardStatus,
  KanbanSubtask,
} from "../../shared/kanban.js";

export interface EditorDraft {
  id?: string;
  title: string;
  notes: string;
  status: CardStatus;
  priority?: NonNullable<Card["priority"]>;
  dueDate?: string | null;
  labels?: string[];
  subtasks?: KanbanSubtask[];
}

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
        !["todo", "doing", "done"].includes(card.status)
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

export function useKanbanBoard(workspaceId: string, active: boolean) {
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
  const [missingCard, setMissingCard] = useState(false);
  const [unreadable, setUnreadable] = useState(false);
  const editorRef = useRef(editor);
  editorRef.current = editor;
  const draggingRef = useRef(draggingId);
  draggingRef.current = draggingId;
  const blocked = saving || !snapshot || Boolean(initial.error) || unreadable;
  const applySnapshot = useCallback((next: KanbanSnapshot) => {
    snapshotRef.current = next;
    setSnapshot(next);
    setCards(next.board.cards);
    setChanged(false);
    setMissingCard(false);
    setUnreadable(false);
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
          if (!cancelled && token === generation.current && !draggingRef.current) {
            initialized.current = true;
            if (
              snapshotRef.current &&
              editorRef.current &&
              next.revision !== snapshotRef.current.revision
            ) {
              setChanged(true);
              setDeleted(null);
              setMissingCard(
                Boolean(
                  editorRef.current.id &&
                  !next.board.cards.some((card) => card.id === editorRef.current?.id),
                ),
              );
              setUnreadable(false);
              setError(null);
            } else if (!editorRef.current || !snapshotRef.current) {
              if (snapshotRef.current?.revision !== next.revision) {
                applySnapshot(next);
                setDeleted(null);
              } else {
                setError(null);
                setUnreadable(false);
              }
            } else {
              setUnreadable(false);
              setError(null);
              setChanged(false);
              setMissingCard(false);
            }
          }
        } catch (cause) {
          if (!cancelled && token === generation.current) {
            setUnreadable(true);
            setError(cause instanceof Error ? cause.message : String(cause));
          }
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
  const persist = async (next: Card[]) => {
    const baseline = snapshotRef.current;
    if (!baseline || busy.current || initial.error || unreadable || missingCard || !window.desktop)
      return false;
    busy.current = true;
    setSaving(true);
    generation.current += 1;
    setCopyStatus("");
    try {
      const saved = await window.desktop.saveWorkspaceKanban(
        workspaceId,
        {
          version:
            baseline.board.version === 3 || next.some((card) => card.subtasks !== undefined)
              ? 3
              : baseline.board.version === 2 ||
                  next.some(
                    (card) =>
                      card.priority !== undefined ||
                      card.dueDate !== undefined ||
                      card.labels !== undefined,
                  )
                ? 2
                : 1,
          cards: next,
        },
        baseline.revision,
      );
      applySnapshot(saved);
      setDeleted(null);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };
  return {
    cards,
    snapshot,
    saving,
    changed,
    error,
    missingCard,
    blocked,
    editor,
    setEditor,
    deleted,
    setDeleted,
    draggingId,
    setDraggingId,
    copyStatus,
    copyInstructions,
    reload,
    persist,
  };
}
