import { useEffect, useRef, useState } from "react";
import type { WorkspaceFileEntry } from "../../shared/desktop.js";

type CopiedEntry = { workspaceId: string; path: string };
export function FileActions({
  workspaceId,
  entry,
  x,
  y,
  copied,
  onCopy,
  onClose,
  onChanged,
}: {
  workspaceId: string;
  entry: WorkspaceFileEntry | null;
  x: number;
  y: number;
  copied: CopiedEntry | null;
  onCopy(value: CopiedEntry): void;
  onClose(): void;
  onChanged(): void;
}) {
  const [mode, setMode] = useState<"menu" | "rename" | "file" | "directory" | "delete">("menu");
  const [name, setName] = useState(entry?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const controls = useRef({ busy, onClose });
  controls.current = { busy, onClose };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !controls.current.busy) {
        event.preventDefault();
        controls.current.onClose();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  async function run(action: () => Promise<void>, changed = false) {
    setBusy(true);
    setError(null);
    try {
      await action();
      if (changed) onChanged();
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "File operation failed");
    } finally {
      setBusy(false);
    }
  }
  const directory =
    entry?.kind === "directory"
      ? entry.path
      : (entry?.path.split("/").slice(0, -1).join("/") ?? "");
  const itemClass =
    "block w-full rounded-md px-3 py-2 text-left text-ui-sm hover:bg-hover focus-visible:bg-hover disabled:opacity-40";
  return (
    <div
      className="fixed inset-0 z-50"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={panel}
        role={mode === "menu" ? "menu" : "dialog"}
        aria-label={
          mode === "rename"
            ? "Rename entry"
            : mode === "delete"
              ? "Delete entry"
              : mode === "file"
                ? "New file"
                : mode === "directory"
                  ? "New folder"
                  : "File actions"
        }
        className="fixed w-64 rounded-lg border border-border bg-panel p-1 shadow-xl"
        style={{
          left: Math.max(8, Math.min(x, window.innerWidth - 264)),
          top: Math.max(8, Math.min(y, window.innerHeight - 440)),
        }}
      >
        {mode === "delete" && entry ? (
          <div className="p-2">
            <p className="break-words text-ui-sm">Move “{entry.path}” to the Trash?</p>
            {entry.kind === "directory" && (
              <p className="mt-2 text-ui-xs text-foreground-subtle">
                This includes all files and folders inside it.
              </p>
            )}
            <button
              autoFocus
              className={itemClass}
              disabled={busy}
              onClick={() =>
                void run(() => window.desktop!.trashWorkspaceEntry(workspaceId, entry.path), true)
              }
            >
              Move to Trash
            </button>
            <button className={itemClass} disabled={busy} onClick={onClose}>
              Cancel
            </button>
          </div>
        ) : mode !== "menu" ? (
          <form
            className="p-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (busy) return;
              if (mode === "rename" && entry)
                void run(
                  () => window.desktop!.renameWorkspaceEntry(workspaceId, entry.path, name),
                  true,
                );
              else if (mode === "file" || mode === "directory")
                void run(
                  () => window.desktop!.createWorkspaceEntry(workspaceId, directory, name, mode),
                  true,
                );
            }}
          >
            <label className="text-ui-sm">
              {mode === "rename" ? "New name" : mode === "file" ? "File name" : "Folder name"}
              <input
                autoFocus
                aria-label={
                  mode === "rename" ? "New name" : mode === "file" ? "File name" : "Folder name"
                }
                className="my-2 w-full rounded border border-border bg-input px-2 py-1 text-ui-sm"
                value={name}
                disabled={busy}
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <button className={itemClass} disabled={busy || !name.trim()} type="submit">
              {mode === "rename" ? "Rename" : "Create"}
            </button>
            <button className={itemClass} disabled={busy} type="button" onClick={onClose}>
              Cancel
            </button>
          </form>
        ) : (
          <>
            {(["file", "directory"] as const).map((kind) => (
              <button
                key={kind}
                role="menuitem"
                className={itemClass}
                disabled={busy}
                onClick={() => {
                  setName("");
                  setMode(kind);
                }}
              >
                {kind === "file" ? "New file…" : "New folder…"}
              </button>
            ))}
            {entry && (
              <>
                <button
                  role="menuitem"
                  className={itemClass}
                  disabled={busy}
                  onClick={() => setMode("delete")}
                >
                  Delete…
                </button>
                <button
                  role="menuitem"
                  className={itemClass}
                  disabled={busy}
                  onClick={() => setMode("rename")}
                >
                  Rename…
                </button>
              </>
            )}
            <div role="separator" className="my-1 border-t border-border" />
            {entry && (
              <button
                role="menuitem"
                className={itemClass}
                disabled={busy}
                onClick={() => {
                  onCopy({ workspaceId, path: entry.path });
                  onClose();
                }}
              >
                Copy
              </button>
            )}
            <button
              role="menuitem"
              className={itemClass}
              disabled={!copied || busy}
              onClick={() => {
                if (copied)
                  void run(
                    () =>
                      window.desktop!.copyWorkspaceEntry(
                        copied.workspaceId,
                        copied.path,
                        workspaceId,
                        directory,
                      ),
                    true,
                  );
              }}
            >
              Paste here
            </button>
            {entry && (
              <>
                <div role="separator" className="my-1 border-t border-border" />
                {(["name", "relative", "full"] as const).map((kind) => (
                  <button
                    key={kind}
                    role="menuitem"
                    className={itemClass}
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        window.desktop!.copyWorkspaceEntryText(workspaceId, entry.path, kind),
                      )
                    }
                  >
                    {kind === "name"
                      ? "Copy file name"
                      : kind === "relative"
                        ? "Copy relative path"
                        : "Copy full path"}
                  </button>
                ))}
              </>
            )}
          </>
        )}
        {busy && (
          <p role="status" className="px-3 py-2 text-ui-xs text-foreground-subtle">
            Working…
          </p>
        )}
        {error && (
          <p role="alert" className="max-h-28 overflow-auto px-3 py-2 text-ui-xs text-destructive">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
