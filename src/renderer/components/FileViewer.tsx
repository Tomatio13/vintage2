import {
  Code2,
  ExternalLink,
  Eye,
  FileText,
  FileWarning,
  RefreshCw,
  Search,
  WrapText,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

import { MarkdownEditor } from "./MarkdownEditor.js";

import type { WorkspaceFileContent } from "../../shared/desktop.js";
import {
  CodeSourcePreview,
  CopySourceButton,
  DelimitedPreview,
  FormattedJsonPreview,
  ImageFilePreview,
  WorkspaceHtmlPreview,
  WorkspaceMediaPreview,
  WorkspacePdfPreview,
} from "./FilePreviewers.js";
import { getFilePreviewKind, getFilePreviewLabel } from "../lib/filePreview.js";

export function FileViewer({
  visible = true,
  workspaceId,
  path,
  targetLine,
  onOpenFile,
}: {
  visible?: boolean;
  workspaceId: string;
  path: string;
  targetLine?: number | undefined;
  onOpenFile?: ((path: string) => void) | undefined;
}) {
  const [file, setFile] = useState<WorkspaceFileContent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [view, setView] = useState<"preview" | "source">("preview");
  const [wrap, setWrap] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const kind = getFilePreviewKind(path);
  const needsText =
    kind === "code" || kind === "json" || kind === "csv" || (kind === "html" && view === "source");
  const needsPreviewUrl =
    (kind === "html" && view === "preview") ||
    kind === "pdf" ||
    kind === "audio" ||
    kind === "video";

  useEffect(() => {
    setFile(null);
    setPreviewUrl(null);
  }, [workspaceId, path, needsText, needsPreviewUrl]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setActionError(null);
    if (!window.desktop) {
      if (needsText || needsPreviewUrl) setError("File access is available in the desktop app.");
      return () => {
        cancelled = true;
      };
    }
    if (needsText) {
      void window.desktop
        .readWorkspaceFile(workspaceId, path)
        .then((content) => {
          if (!cancelled) {
            setFile((current) =>
              current?.content === content.content && current.truncated === content.truncated
                ? current
                : content,
            );
          }
        })
        .catch(() => {
          if (!cancelled) setError("This file could not be opened.");
        });
    } else if (needsPreviewUrl) {
      void window.desktop
        .getWorkspacePreviewUrl(workspaceId, path)
        .then((url) => {
          if (!cancelled) setPreviewUrl(`${url}?v=${reloadVersion}`);
        })
        .catch(() => {
          if (!cancelled) setError("This file could not be previewed.");
        });
    }
    return () => {
      cancelled = true;
    };
  }, [needsPreviewUrl, needsText, reloadVersion, workspaceId, path]);

  // Check metadata rather than repeatedly reading unchanged documents or media.
  // A fresh baseline reload also catches edits made while this pane was hidden.
  useEffect(() => {
    const getVersion = window.desktop?.getWorkspaceFileVersion;
    if (!visible || kind === "unsupported" || kind === "markdown" || !getVersion) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let previousVersion: string | null | undefined;
    const check = async () => {
      try {
        const version = await getVersion(workspaceId, path);
        if (cancelled) return;
        if (previousVersion === undefined || version !== previousVersion) {
          previousVersion = version;
          setReloadVersion((current) => current + 1);
        }
      } catch {
        // Keep the last readable preview; retry after transient filesystem errors.
      } finally {
        if (!cancelled) timer = setTimeout(() => void check(), 3000);
      }
    };
    void check();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [visible, kind, view, workspaceId, path]);

  useEffect(() => {
    setView("preview");
    setWrap(true);
    setSearch("");
    setSearchOpen(false);
  }, [workspaceId, path]);

  useEffect(() => {
    if (targetLine && ["markdown", "html", "json", "csv"].includes(kind)) {
      setView("source");
    }
  }, [kind, path, targetLine]);

  const loading = (needsText && !file) || (needsPreviewUrl && !previewUrl);
  const name = path.split("/").at(-1) ?? path;
  const supportsViewToggle = ["markdown", "html", "json", "csv"].includes(kind);
  const supportsSearch =
    kind === "code" ||
    kind === "json" ||
    kind === "csv" ||
    (view === "source" && (kind === "markdown" || kind === "html"));
  const modeLabels =
    kind === "json"
      ? { preview: "Formatted", source: "Raw" }
      : kind === "csv"
        ? { preview: "Table", source: "Source" }
        : { preview: "Preview", source: "Source" };

  const openOutside = () => {
    if (!window.desktop) {
      setActionError("Open this file from the desktop app.");
      return;
    }
    void window.desktop.openWorkspaceFile(workspaceId, path).catch(() => {
      setActionError("This file could not be opened in the system app.");
    });
  };

  if (kind === "markdown")
    return (
      <MarkdownEditor
        key={`${workspaceId}:${path}`}
        workspaceId={workspaceId}
        path={path}
        visible={visible}
        onOpenFile={onOpenFile}
        targetLine={targetLine}
      />
    );

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col bg-panel">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4 pr-10">
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="size-4 text-foreground" />
          <span className="truncate text-ui-base font-medium" title={path}>
            {name}
          </span>
          <span className="shrink-0 rounded-md bg-hover px-1.5 py-0.5 text-ui-xs text-foreground-subtle">
            {getFilePreviewLabel(kind)}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {supportsSearch ? (
            searchOpen ? (
              <>
                <input
                  aria-label="Find in file"
                  autoFocus
                  className="h-7 w-28 rounded-md border border-border bg-background px-2 text-ui-xs outline-none focus:border-brand sm:w-40"
                  onChange={(event) => setSearch(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      setSearch("");
                      setSearchOpen(false);
                    }
                  }}
                  placeholder="Find in file"
                  type="search"
                  value={search}
                />
                <button
                  aria-label="Close search"
                  className="grid size-7 place-items-center rounded-md text-foreground-subtle transition-colors hover:bg-hover"
                  onClick={() => {
                    setSearch("");
                    setSearchOpen(false);
                  }}
                  title="Close search"
                  type="button"
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              </>
            ) : (
              <button
                aria-label="Find in file"
                className="grid size-7 place-items-center rounded-md text-foreground-subtle transition-colors hover:bg-hover hover:text-foreground"
                onClick={() => setSearchOpen(true)}
                title="Find in file"
                type="button"
              >
                <Search aria-hidden="true" className="size-4" />
              </button>
            )
          ) : null}
          {supportsViewToggle ? (
            <div
              aria-label={`${getFilePreviewLabel(kind)} view`}
              className="flex shrink-0 items-center gap-1"
              role="group"
            >
              {(["preview", "source"] as const).map((mode) => (
                <button
                  aria-label={modeLabels[mode]}
                  aria-pressed={view === mode}
                  className={`grid size-7 place-items-center rounded-md transition-colors hover:bg-hover ${
                    view === mode ? "bg-selected text-foreground" : "text-foreground-subtle"
                  }`}
                  key={mode}
                  onClick={() => setView(mode)}
                  title={modeLabels[mode]}
                  type="button"
                >
                  {mode === "preview" ? (
                    <Eye aria-hidden="true" className="size-4" />
                  ) : (
                    <Code2 aria-hidden="true" className="size-4" />
                  )}
                </button>
              ))}
            </div>
          ) : null}
          {file && kind !== "unsupported" ? <CopySourceButton content={file.content} /> : null}
          {kind === "code" || (view === "source" && supportsViewToggle) ? (
            <button
              aria-label={wrap ? "Disable line wrapping" : "Enable line wrapping"}
              aria-pressed={wrap}
              className={`grid size-7 place-items-center rounded-md transition-colors hover:bg-hover ${wrap ? "bg-selected text-foreground" : "text-foreground-subtle"}`}
              onClick={() => setWrap((current) => !current)}
              title={wrap ? "Disable line wrapping" : "Enable line wrapping"}
              type="button"
            >
              <WrapText aria-hidden="true" className="size-4" />
            </button>
          ) : null}
          <button
            aria-label="Reload file"
            className="grid size-7 place-items-center rounded-md text-foreground-subtle transition-colors hover:bg-hover disabled:opacity-50"
            disabled={loading}
            onClick={() => {
              setFile(null);
              setError(null);
              setReloadVersion((version) => version + 1);
            }}
            title="Reload file"
            type="button"
          >
            <RefreshCw aria-hidden="true" className={`size-4${loading ? " animate-spin" : ""}`} />
          </button>
          <button
            aria-label="Open in system app"
            className="grid size-7 place-items-center rounded-md text-foreground-subtle transition-colors hover:bg-hover hover:text-foreground"
            onClick={openOutside}
            title="Open in system app"
            type="button"
          >
            <ExternalLink aria-hidden="true" className="size-4" />
          </button>
        </div>
      </div>
      <div
        data-testid="file-viewer-scroll"
        className="file-viewer-content flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-scroll p-4"
      >
        {actionError ? (
          <p className="mb-2 shrink-0 text-ui-sm text-destructive">{actionError}</p>
        ) : null}
        {error ? (
          <div className="grid flex-1 place-items-center text-foreground-subtle">
            <div className="text-center">
              <FileWarning className="mx-auto mb-2 size-6" />
              {error}
            </div>
          </div>
        ) : loading ? (
          <div className="grid flex-1 place-items-center text-ui-sm text-foreground-subtle">
            Opening {name}…
          </div>
        ) : (
          <div className="min-h-0 flex-1">
            {kind === "image" ? (
              <ImageFilePreview
                path={path}
                reloadVersion={reloadVersion}
                workspaceId={workspaceId}
              />
            ) : null}
            {kind === "html" ? (
              view === "source" && file ? (
                <CodeSourcePreview
                  content={file.content}
                  path={path}
                  targetLine={targetLine}
                  wrap={wrap}
                  search={search}
                />
              ) : previewUrl ? (
                <WorkspaceHtmlPreview url={previewUrl} />
              ) : null
            ) : null}
            {kind === "pdf" && previewUrl ? <WorkspacePdfPreview url={previewUrl} /> : null}
            {(kind === "audio" || kind === "video") && previewUrl ? (
              <WorkspaceMediaPreview kind={kind} url={previewUrl} />
            ) : null}
            {kind === "json" && file ? (
              view === "preview" ? (
                <FormattedJsonPreview content={file.content} path={path} search={search} />
              ) : (
                <CodeSourcePreview
                  content={file.content}
                  path={path}
                  targetLine={targetLine}
                  wrap={wrap}
                  search={search}
                />
              )
            ) : null}
            {kind === "csv" && file ? (
              view === "preview" ? (
                <DelimitedPreview content={file.content} path={path} search={search} />
              ) : (
                <CodeSourcePreview
                  content={file.content}
                  path={path}
                  targetLine={targetLine}
                  wrap={wrap}
                  search={search}
                />
              )
            ) : null}
            {kind === "code" && file ? (
              <CodeSourcePreview
                content={file.content}
                path={path}
                targetLine={targetLine}
                wrap={wrap}
                search={search}
              />
            ) : null}
            {kind === "unsupported" ? (
              <div className="grid h-full place-items-center text-center text-ui-sm text-foreground-subtle">
                <div>
                  <FileWarning className="mx-auto mb-2 size-6" />
                  <p>No in-app preview is available for this file type.</p>
                  <p className="mt-1 text-ui-xs">Use “Open in system app” to view it.</p>
                </div>
              </div>
            ) : null}
          </div>
        )}
        {file?.truncated ? (
          <p className="mt-3 shrink-0 text-ui-sm text-foreground-subtle">
            Text preview limited to the first 1 MB. Open in the system app to view the complete
            file.
          </p>
        ) : null}
      </div>
    </section>
  );
}
