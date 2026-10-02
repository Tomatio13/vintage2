import { Code2, Eye, FileText, FileDown, LoaderCircle, RefreshCw, Save } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MarkdownPreview } from "./MarkdownPreview.js";

interface Draft {
  content: string;
  original: string;
}

export function MarkdownEditor({
  workspaceId,
  path,
  visible = true,
  onOpenFile,
  targetLine,
}: {
  workspaceId: string;
  path?: string;
  targetLine?: number | undefined;
  visible?: boolean;
  onOpenFile?: ((path: string) => void) | undefined;
}) {
  const key = `vintage:markdown:${workspaceId}:${path ?? ":scratchpad"}`;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState(Boolean(path) && !targetLine);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [status, setStatus] = useState("");
  const ready = Boolean(draft);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (targetLine) setPreview(false);
  }, [targetLine]);
  useEffect(() => {
    if (!visible || preview || !ready) return;
    input.current?.focus();
    if (targetLine && draft && input.current) {
      const offset = draft.content
        .split("\n")
        .slice(0, Math.max(0, targetLine - 1))
        .reduce((total, line) => total + line.length + 1, 0);
      input.current.setSelectionRange(offset, offset);
    }
  }, [visible, preview, ready, targetLine]);
  const current = useRef(draft);
  current.current = draft;
  const dirty = Boolean(path && draft && draft.content !== draft.original);

  useEffect(() => {
    let cancelled = false;
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored) as Draft;
        if (typeof parsed.content === "string" && typeof parsed.original === "string") {
          setDraft(parsed);
          return;
        }
      }
    } catch {
      setError("Draft storage is unavailable. Keep this pane open until your text is saved.");
    }
    if (!path) {
      setDraft({ content: "", original: "" });
      return;
    }
    if (!window.desktop) {
      setError("File access is available in the desktop app.");
      return;
    }
    void window.desktop
      .readWorkspaceFile(workspaceId, path)
      .then((file) => {
        if (cancelled) return;
        setTruncated(file.truncated);
        setDraft({ content: file.content, original: file.content });
      })
      .catch(() => {
        if (!cancelled) setError("This file could not be opened.");
      });
    return () => {
      cancelled = true;
    };
  }, [key, path, workspaceId]);

  // Preserve dirty drafts while refreshing clean previews only.
  useEffect(() => {
    if (!path || !visible || !preview || dirty || !ready || !window.desktop) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let version: string | null | undefined;
    const check = async () => {
      try {
        const nextVersion = await window.desktop!.getWorkspaceFileVersion?.(workspaceId, path);
        if (nextVersion === undefined || nextVersion === version) return;
        version = nextVersion;
        const file = await window.desktop!.readWorkspaceFile(workspaceId, path);
        if (!cancelled && current.current?.content === current.current?.original) {
          setTruncated(file.truncated);
          setDraft({ content: file.content, original: file.content });
        }
      } catch {
        /* Retain the last readable preview. */
      } finally {
        if (!cancelled) timer = setTimeout(() => void check(), 3000);
      }
    };
    void check();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [path, workspaceId, visible, preview, dirty, ready]);

  const edit = (content: string) => {
    if (!draft) return;
    const next = { ...draft, content };
    setDraft(next);
    setStatus("");
    try {
      localStorage.setItem(key, JSON.stringify(next));
      if (!path) setStatus("Saved locally");
    } catch {
      setError("Could not save the draft locally. Copy your text before closing this pane.");
    }
  };
  const save = async () => {
    if (!draft || !path || !window.desktop || saving || truncated) return;
    const submitted = draft;
    setSaving(true);
    setError(null);
    try {
      await window.desktop.writeWorkspaceMarkdown(
        workspaceId,
        path,
        submitted.content,
        submitted.original,
      );
      setDraft((previous) => (previous ? { ...previous, original: submitted.content } : previous));
      const latest = current.current;
      if (!latest || latest.content === submitted.content) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify({ ...latest, original: submitted.content }));
      setStatus("Saved");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };
  const reload = async () => {
    if (!path || !window.desktop || saving) return;
    if (dirty && !window.confirm("Discard your draft and reload the file from disk?")) return;
    try {
      const file = await window.desktop.readWorkspaceFile(workspaceId, path);
      setDraft({ content: file.content, original: file.content });
      setTruncated(file.truncated);
      localStorage.removeItem(key);
      setError(null);
      setStatus("Reloaded");
    } catch {
      setError("Could not reload the file. Your draft has been kept.");
    }
  };
  return (
    <section
      className="flex h-full min-h-0 flex-col bg-panel"
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
          event.preventDefault();
          event.stopPropagation();
          void save();
        }
      }}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border p-3 pr-10 text-ui-sm">
        <FileText className="size-4 text-foreground" />
        <span className="min-w-0 flex-1 truncate font-medium" title={path}>
          {path?.split("/").at(-1) ?? "Scratchpad"}
          {dirty ? " •" : ""}
        </span>
        <button
          type="button"
          aria-label="Edit"
          title="Edit"
          className={`grid size-7 shrink-0 place-items-center rounded-md transition-colors hover:bg-hover ${!preview ? "bg-selected text-foreground" : "text-foreground-subtle"}`}
          aria-pressed={!preview}
          onClick={() => setPreview(false)}
        >
          <Code2 aria-hidden="true" className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Preview"
          title="Preview"
          className={`grid size-7 shrink-0 place-items-center rounded-md transition-colors hover:bg-hover ${preview ? "bg-selected text-foreground" : "text-foreground-subtle"}`}
          aria-pressed={preview}
          onClick={() => setPreview(true)}
        >
          <Eye aria-hidden="true" className="size-4" />
        </button>
        {path ? (
          <>
            <button
              type="button"
              aria-label={saving ? "Saving…" : "Save"}
              title={saving ? "Saving…" : "Save (Ctrl/⌘+S)"}
              className="grid size-7 shrink-0 place-items-center rounded-md text-foreground-subtle transition-colors hover:bg-hover hover:text-foreground disabled:opacity-40"
              disabled={!dirty || saving || truncated}
              onClick={() => void save()}
            >
              {saving ? (
                <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
              ) : (
                <Save aria-hidden="true" className="size-4" />
              )}
            </button>
            <button
              type="button"
              aria-label="Reload"
              title="Reload"
              className="grid size-7 shrink-0 place-items-center rounded-md text-foreground-subtle transition-colors hover:bg-hover hover:text-foreground disabled:opacity-40"
              disabled={saving}
              onClick={() => void reload()}
            >
              <RefreshCw aria-hidden="true" className="size-4" />
            </button>
          </>
        ) : (
          <button
            type="button"
            aria-label="Save as .md"
            title="Save as .md"
            className="grid size-7 shrink-0 place-items-center rounded-md text-foreground-subtle transition-colors hover:bg-hover hover:text-foreground disabled:opacity-40"
            disabled={!draft || saving}
            onClick={async () => {
              if (!draft || !window.desktop) return;
              setSaving(true);
              setError(null);
              try {
                const result = await window.desktop.exportWorkspaceNote(workspaceId, draft.content);
                if (result) setStatus(`Exported to ${result}`);
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : String(cause));
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <FileDown aria-hidden="true" className="size-4" />
            )}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="p-3 text-ui-sm text-destructive">
          {error}
        </p>
      )}
      {truncated && <p className="p-3 text-ui-sm">This file exceeds 1 MB. Editing is disabled.</p>}
      {draft ? (
        preview ? (
          <div data-testid="file-viewer-scroll" className="min-h-0 flex-1 overflow-y-scroll p-4">
            <MarkdownPreview
              content={draft.content}
              workspaceId={workspaceId}
              path={path ?? "notes.md"}
              onOpenFile={onOpenFile ?? (() => {})}
            />
          </div>
        ) : (
          <textarea
            ref={input}
            aria-label={path ? "Markdown editor" : "Workspace notes"}
            className="min-h-0 flex-1 resize-none bg-panel p-4 font-mono text-ui-sm leading-relaxed outline-none"
            spellCheck={false}
            disabled={truncated}
            value={draft.content}
            onChange={(event) => edit(event.target.value)}
            placeholder="Write a note…"
          />
        )
      ) : (
        <p className="p-4 text-ui-sm">{error ? "Document unavailable" : "Opening…"}</p>
      )}
      <div
        role="status"
        className="shrink-0 border-t border-border px-3 py-1 text-ui-xs text-foreground-subtle"
      >
        {status ||
          (dirty
            ? "Unsaved changes · Ctrl/⌘+S to save · Draft kept locally"
            : path
              ? "Markdown"
              : "Notes are saved locally as you type")}
      </div>
    </section>
  );
}
