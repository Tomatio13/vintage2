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
import ReactMarkdown from "react-markdown";
import { memo } from "react";
import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type MouseEvent as ReactMouseEvent,
} from "react";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";

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
import { classifyMarkdownLink, resolveMarkdownRelativePath } from "../lib/markdownLinks.js";
import { useUiStore } from "../store/uiStore.js";

function WorkspaceMarkdownImage({
  src,
  alt,
  title,
  workspaceId,
  markdownPath,
}: {
  src: string | undefined;
  alt: string | undefined;
  title: string | undefined;
  workspaceId: string;
  markdownPath: string;
}) {
  const [image, setImage] = useState<
    { status: "loading" } | { status: "ready"; dataUrl: string } | { status: "error" }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const imagePath = src ? resolveMarkdownRelativePath(markdownPath, src) : null;
    const readImage = window.desktop?.readWorkspaceImage;
    setImage({ status: "loading" });

    if (!imagePath || !readImage) {
      setImage({ status: "error" });
      return () => {
        cancelled = true;
      };
    }

    void readImage(workspaceId, imagePath)
      .then((dataUrl) => {
        if (!cancelled) setImage({ status: "ready", dataUrl });
      })
      .catch(() => {
        if (!cancelled) setImage({ status: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, [markdownPath, src, workspaceId]);

  if (image.status === "ready") {
    return (
      <img
        alt={alt ?? ""}
        className="my-4 h-auto max-w-full rounded-md"
        decoding="async"
        src={image.dataUrl}
        title={title}
      />
    );
  }

  const label = alt || "Markdown image";
  return (
    <span className="my-3 block text-ui-sm text-foreground-subtle">
      {image.status === "loading" ? `Loading ${label}…` : `Image unavailable: ${label}`}
    </span>
  );
}

function scrollMarkdownAnchorIntoView(container: Element | null, anchor: string): void {
  const escaped = (() => {
    try {
      return CSS.escape(anchor);
    } catch {
      return "";
    }
  })();
  if (!escaped) return;
  try {
    container?.querySelector(`#${escaped}`)?.scrollIntoView({ block: "start" });
  } catch {
    // Invalid selectors or missing scroll containers are safe to ignore.
  }
}

function handleMarkdownLinkClick(
  event: ReactMouseEvent<HTMLAnchorElement>,
  href: string,
  markdownPath: string,
  onOpenFile: (path: string) => void,
): void {
  event.preventDefault();
  const target = classifyMarkdownLink(href, markdownPath);
  switch (target.kind) {
    case "file":
      onOpenFile(target.path);
      return;
    case "external":
      useUiStore.getState().openInBrowserTab(target.url, {
        newTab: event.ctrlKey || event.metaKey,
      });
      return;
    case "external-system":
      void window.desktop?.openExternal(target.url).catch(() => {});
      return;
    case "anchor":
      scrollMarkdownAnchorIntoView(event.currentTarget.closest("article"), target.anchor);
      return;
    default:
  }
}

interface MarkdownContextValue {
  path: string;
  workspaceId: string;
  onOpenFile(path: string): void;
}

const MarkdownContext = createContext<MarkdownContextValue | null>(null);

function MarkdownAnchor({ children, href }: ComponentProps<"a">) {
  const context = useContext(MarkdownContext);
  return (
    <a
      className="text-brand underline underline-offset-2"
      href={href}
      onClick={(event) => {
        event.preventDefault();
        if (href && context) handleMarkdownLinkClick(event, href, context.path, context.onOpenFile);
      }}
    >
      {children}
    </a>
  );
}

function MarkdownImage(props: ComponentProps<"img">) {
  const context = useContext(MarkdownContext);
  return (
    <WorkspaceMarkdownImage
      alt={props.alt}
      markdownPath={context?.path ?? ""}
      src={props.src}
      title={props.title}
      workspaceId={context?.workspaceId ?? ""}
    />
  );
}

// Defined at module level: react-markdown maps these onto rendered elements, so
// unstable function identities here would replace the whole Markdown DOM on
// every render and swallow real mouse clicks (the click event is lost when the
// mousedown target is swapped between mousedown and mouseup).
const markdownComponents = {
  a: MarkdownAnchor,
  img: MarkdownImage,
  blockquote: ({ children }: ComponentProps<"blockquote">) => (
    <blockquote className="my-4 border-l-2 border-brand pl-4 text-foreground-subtle">
      {children}
    </blockquote>
  ),
  code: ({ children, className }: ComponentProps<"code">) => (
    <code
      className={
        className
          ? "font-mono text-ui-sm"
          : "rounded bg-background px-1 py-0.5 font-mono text-ui-sm"
      }
    >
      {children}
    </code>
  ),
  h1: ({ children, id }: ComponentProps<"h1">) => (
    <h1 id={id} className="mb-4 mt-8 text-ui-xl font-semibold first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children, id }: ComponentProps<"h2">) => (
    <h2 id={id} className="mb-3 mt-7 text-ui-lg font-semibold first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children, id }: ComponentProps<"h3">) => (
    <h3 id={id} className="mb-3 mt-6 text-ui-base font-semibold first:mt-0">
      {children}
    </h3>
  ),
  h4: ({ children, id }: ComponentProps<"h4">) => (
    <h4 id={id} className="mb-2 mt-5 font-semibold first:mt-0">
      {children}
    </h4>
  ),
  h5: ({ children, id }: ComponentProps<"h5">) => (
    <h5 id={id} className="mb-2 mt-4 font-semibold first:mt-0">
      {children}
    </h5>
  ),
  h6: ({ children, id }: ComponentProps<"h6">) => (
    <h6 id={id} className="mb-2 mt-4 font-semibold first:mt-0">
      {children}
    </h6>
  ),
  hr: () => <hr className="my-6 border-border" />,
  input: (props: ComponentProps<"input">) => (
    <input {...props} className="mr-2 accent-brand" readOnly />
  ),
  li: ({ children }: ComponentProps<"li">) => <li className="my-1">{children}</li>,
  ol: ({ children }: ComponentProps<"ol">) => (
    <ol className="my-3 list-decimal space-y-1 pl-6">{children}</ol>
  ),
  p: ({ children }: ComponentProps<"p">) => <p className="my-3">{children}</p>,
  pre: ({ children }: ComponentProps<"pre">) => (
    <pre className="my-4 overflow-x-auto rounded-lg bg-background p-3">{children}</pre>
  ),
  strong: ({ children }: ComponentProps<"strong">) => (
    <strong className="font-semibold">{children}</strong>
  ),
  table: ({ children }: ComponentProps<"table">) => (
    <div className="my-4 overflow-x-auto">
      <table className="w-full border-collapse text-left text-ui-sm">{children}</table>
    </div>
  ),
  td: ({ children }: ComponentProps<"td">) => (
    <td className="border border-border px-3 py-2 align-top">{children}</td>
  ),
  th: ({ children }: ComponentProps<"th">) => (
    <th className="border border-border bg-background px-3 py-2 text-left font-semibold">
      {children}
    </th>
  ),
  ul: ({ children }: ComponentProps<"ul">) => (
    <ul className="my-3 list-disc space-y-1 pl-6">{children}</ul>
  ),
};

const markdownRemarkPlugins = [remarkGfm];
const markdownRehypePlugins = [rehypeSlug];

const MarkdownPreview = memo(function MarkdownPreview({
  content,
  workspaceId,
  path,
  onOpenFile,
}: {
  content: string;
  workspaceId: string;
  path: string;
  onOpenFile: (path: string) => void;
}) {
  const contextValue = useMemo(
    () => ({ path, workspaceId, onOpenFile }),
    [path, workspaceId, onOpenFile],
  );
  return (
    <article className="mx-auto max-w-3xl text-ui-base leading-relaxed">
      <MarkdownContext.Provider value={contextValue}>
        <ReactMarkdown
          skipHtml
          remarkPlugins={markdownRemarkPlugins}
          rehypePlugins={markdownRehypePlugins}
          components={markdownComponents}
        >
          {content}
        </ReactMarkdown>
      </MarkdownContext.Provider>
    </article>
  );
});

export function FileViewer({
  workspaceId,
  path,
  targetLine,
  onOpenFile,
}: {
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
    kind === "markdown" ||
    kind === "code" ||
    kind === "json" ||
    kind === "csv" ||
    (kind === "html" && view === "source");
  const needsPreviewUrl =
    (kind === "html" && view === "preview") ||
    kind === "pdf" ||
    kind === "audio" ||
    kind === "video";

  useEffect(() => {
    let cancelled = false;
    setFile(null);
    setPreviewUrl(null);
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
          if (!cancelled) setFile(content);
        })
        .catch(() => {
          if (!cancelled) setError("This file could not be opened.");
        });
    } else if (needsPreviewUrl) {
      void window.desktop
        .getWorkspacePreviewUrl(workspaceId, path)
        .then((url) => {
          if (!cancelled) setPreviewUrl(url);
        })
        .catch(() => {
          if (!cancelled) setError("This file could not be previewed.");
        });
    }
    return () => {
      cancelled = true;
    };
  }, [needsPreviewUrl, needsText, reloadVersion, workspaceId, path]);

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

  // Keep a stable identity so MarkdownPreview's memo holds across renders.
  const onOpenFileRef = useRef(onOpenFile);
  onOpenFileRef.current = onOpenFile;
  const markdownOpenFile = useCallback(
    (targetPath: string) => onOpenFileRef.current?.(targetPath),
    [],
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
          {file && (kind !== "markdown" || view === "source") && kind !== "unsupported" ? (
            <CopySourceButton content={file.content} />
          ) : null}
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
            {kind === "markdown" && file ? (
              view === "preview" ? (
                <div className="h-full overflow-auto">
                  <MarkdownPreview
                    content={file.content}
                    path={path}
                    workspaceId={workspaceId}
                    onOpenFile={markdownOpenFile}
                  />
                </div>
              ) : (
                <CodeSourcePreview
                  content={file.content}
                  lineNumbers={false}
                  path={path}
                  targetLine={targetLine}
                  wrap={wrap}
                  search={search}
                />
              )
            ) : null}
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
