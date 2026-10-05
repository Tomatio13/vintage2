import { ChevronDown, ChevronUp, Search, X, ZoomIn, ZoomOut } from "lucide-react";
import { scrollEditorToOffset } from "../lib/editorPosition.js";
import { useEffect, useId, useRef, useState, type RefObject } from "react";

const buttonClass =
  "grid size-7 shrink-0 place-items-center rounded-md text-foreground-subtle hover:bg-hover disabled:opacity-40";

export function ZoomControls({
  zoom,
  onChange,
}: {
  zoom: number;
  onChange: (zoom: number) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1" role="group" aria-label="Document zoom">
      <button
        type="button"
        className={buttonClass}
        aria-label="Zoom in"
        title="Zoom in"
        disabled={zoom >= 3}
        onClick={() => onChange(Math.min(3, +(zoom + 0.1).toFixed(1)))}
      >
        <ZoomIn className="size-4" />
      </button>
      <button
        type="button"
        className="document-zoom-percentage rounded-md px-1 hover:bg-hover"
        aria-label="Reset zoom"
        title="Reset zoom"
        onClick={() => onChange(1)}
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        className={buttonClass}
        aria-label="Zoom out"
        title="Zoom out"
        disabled={zoom <= 0.5}
        onClick={() => onChange(Math.max(0.5, +(zoom - 0.1).toFixed(1)))}
      >
        <ZoomOut className="size-4" />
      </button>
    </div>
  );
}

export function findMatches(content: string, query: string): { start: number; end: number }[] {
  if (!query) return [];
  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "giu");
  return Array.from(content.matchAll(pattern), (match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
}

/** Search the rendered document, or select exact source offsets in an editor. */
export function DocumentSearch({
  root,
  editor,
  content,
  revision,
  canReplace = false,
  onReplace,
  onEditorSelection,
  replaceHint,
  open,
  onClose,
}: {
  root: RefObject<HTMLDivElement | null>;
  editor?: RefObject<HTMLTextAreaElement | null>;
  content?: string | undefined;
  revision?: unknown;
  canReplace?: boolean;
  replaceHint?: string;
  onReplace?: (content: string) => void;
  onEditorSelection?: (offset: number) => void;
  open: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [index, setIndex] = useState(0);
  const [count, setCount] = useState(0);
  const matches = useRef<{ start: number; end: number }[]>([]);
  const ranges = useRef<Range[]>([]);
  const selectionMatches = useRef<{ start: number; end: number }[]>([]);
  const name = `document-search-${useId().replace(/[^a-z0-9-]/giu, "")}`;
  const searchInput = useRef<HTMLInputElement>(null);
  const notifySelection = useRef(onEditorSelection);
  notifySelection.current = onEditorSelection;

  useEffect(() => {
    if (open) searchInput.current?.focus();
  }, [open]);
  useEffect(() => {
    setIndex(0);
  }, [query, content, canReplace, revision]);
  useEffect(() => {
    matches.current = [];
    selectionMatches.current = [];
    ranges.current = [];
    if (open && query) {
      if (editor?.current && content !== undefined) {
        matches.current = findMatches(content, query);
        selectionMatches.current = findMatches(editor.current.value, query);
        setCount(selectionMatches.current.length);
      } else if (root.current) {
        const sourceLines = root.current.querySelectorAll("[data-file-search-text]");
        const walker = document.createTreeWalker(root.current, NodeFilter.SHOW_TEXT);

        const nodes: { node: Text; start: number; end: number }[] = [];
        let text = "";
        const append = (node: Node) => {
          if (node.parentElement?.closest("[data-document-search-ignore]")) return;
          const value = node.textContent ?? "";
          nodes.push({ node: node as Text, start: text.length, end: text.length + value.length });
          text += value;
        };
        if (sourceLines.length) {
          sourceLines.forEach((line, index) => {
            if (index) text += "\n";
            const lineWalker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
            let node;
            while ((node = lineWalker.nextNode())) append(node);
          });
        } else {
          let node;
          while ((node = walker.nextNode())) append(node);
        }
        const found = findMatches(text, query);
        if (canReplace) matches.current = found;
        let firstIndex = 0;
        let lastIndex = 0;
        for (const match of found) {
          while (firstIndex < nodes.length && nodes[firstIndex]!.end <= match.start) firstIndex++;
          lastIndex = Math.max(lastIndex, firstIndex);
          while (lastIndex < nodes.length && nodes[lastIndex]!.end < match.end) lastIndex++;
          const first = nodes[firstIndex];
          const last = nodes[lastIndex];
          if (!first || !last) continue;
          const range = document.createRange();
          range.setStart(first.node, match.start - first.start);
          range.setEnd(last.node, match.end - last.start);
          ranges.current.push(range);
        }
        setCount(ranges.current.length);
      } else setCount(0);
    } else setCount(0);
    if (typeof Highlight !== "undefined" && CSS.highlights) {
      CSS.highlights.set(name, new Highlight(...ranges.current));
    }
    return () => {
      if (typeof CSS !== "undefined") CSS.highlights?.delete(name);
    };
  }, [open, query, content, revision, editor, root, name, canReplace]);

  useEffect(() => {
    const match = open
      ? (editor?.current ? selectionMatches.current : matches.current)[index]
      : undefined;
    if (match && editor?.current) {
      editor.current.setSelectionRange(match.start, match.end);
      notifySelection.current?.(match.end);
      scrollEditorToOffset(editor.current, editor.current.value, match.start);
    }
    const range = open ? ranges.current[index] : undefined;
    range?.startContainer.parentElement?.scrollIntoView?.({ block: "center", inline: "nearest" });
    if (typeof Highlight !== "undefined" && CSS.highlights)
      CSS.highlights.set(`${name}-active`, new Highlight(...(range ? [range] : [])));
    return () => {
      if (typeof CSS !== "undefined") CSS.highlights?.delete(`${name}-active`);
    };
  }, [open, index, count, query, content, revision, editor, name]);

  if (!open) return null;
  const replace = (all: boolean) => {
    if (!canReplace || !onReplace || content === undefined) return;
    const found = matches.current;
    const selected = all ? found : found[index] ? [found[index]!] : [];
    const pieces: string[] = [];
    let offset = 0;
    for (const match of selected) {
      pieces.push(content.slice(offset, match.start), replacement);
      offset = match.end;
    }
    pieces.push(content.slice(offset));
    if (selected.length) onReplace(pieces.join(""));
  };
  return (
    <div
      className="shrink-0 border-b border-border p-2 text-ui-xs"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          event.preventDefault();
          onClose();
        }
        if (event.key === "Enter") {
          event.stopPropagation();
          event.preventDefault();
          setIndex((current) => (count ? (current + (event.shiftKey ? count - 1 : 1)) % count : 0));
        }
      }}
    >
      <style>{`::highlight(${name}) { background: #eab30866; color: inherit; } ::highlight(${name}-active) { background: #f9731699; color: inherit; }`}</style>
      <div className="flex flex-wrap items-center gap-1">
        <Search className="size-4" />
        <input
          ref={searchInput}
          aria-label="Find in file"
          placeholder="Find in file"
          className="h-7 min-w-0 flex-1 rounded-md border border-border bg-background px-2 outline-none focus:border-brand"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <span aria-live="polite">
          {count ? `${Math.min(index + 1, count)} / ${count}` : "0 / 0"}
        </span>
        <button
          type="button"
          aria-label="Previous match"
          title="Previous match"
          className={buttonClass}
          disabled={!count}
          onClick={() => {
            editor?.current?.focus();
            setIndex((current) => (current + count - 1) % count);
          }}
        >
          <ChevronUp className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Next match"
          title="Next match"
          className={buttonClass}
          disabled={!count}
          onClick={() => {
            editor?.current?.focus();
            setIndex((current) => (current + 1) % count);
          }}
        >
          <ChevronDown className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Close search"
          title="Close search"
          className={buttonClass}
          onClick={onClose}
        >
          <X className="size-4" />
        </button>
      </div>
      {canReplace && replaceHint && <p className="mt-1 text-foreground-subtle">{replaceHint}</p>}
      {canReplace && (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <input
            aria-label="Replace with"
            placeholder="Replace with"
            className="h-7 min-w-0 flex-1 rounded-md border border-border bg-background px-2 outline-none focus:border-brand"
            value={replacement}
            onChange={(event) => setReplacement(event.target.value)}
          />
          <button
            type="button"
            disabled={!query || !count}
            className="rounded-md px-2 py-1 hover:bg-hover disabled:opacity-40"
            onClick={() => replace(false)}
          >
            Replace
          </button>
          <button
            type="button"
            disabled={!query || !count}
            className="rounded-md px-2 py-1 hover:bg-hover disabled:opacity-40"
            onClick={() => replace(true)}
          >
            Replace all
          </button>
        </div>
      )}
    </div>
  );
}
