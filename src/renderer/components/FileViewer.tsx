import { Code2, Eye, FileText, FileWarning, RefreshCw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useEffect, useState } from "react";
import remarkGfm from "remark-gfm";

import type { WorkspaceFileContent } from "../../shared/desktop.js";

function isMarkdown(path: string): boolean {
  return /\.(md|mdx|markdown)$/iu.test(path);
}

function resolveMarkdownImagePath(markdownPath: string, source: string): string | null {
  const sourcePath = source.split(/[?#]/u, 1)[0] ?? "";
  if (!sourcePath || source.startsWith("//") || /^[a-z][a-z\d+.-]*:/iu.test(sourcePath)) {
    return null;
  }

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(sourcePath).replace(/\\/gu, "/");
  } catch {
    return null;
  }

  const rootRelative = decodedPath.startsWith("/");
  const segments = rootRelative ? [] : markdownPath.split("/").slice(0, -1);
  for (const segment of decodedPath.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (segments.length === 0) return null;
      segments.pop();
    } else {
      segments.push(segment);
    }
  }

  return segments.length > 0 ? segments.join("/") : null;
}

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
    const imagePath = src ? resolveMarkdownImagePath(markdownPath, src) : null;
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

function MarkdownPreview({
  content,
  workspaceId,
  path,
}: {
  content: string;
  workspaceId: string;
  path: string;
}) {
  return (
    <article className="mx-auto max-w-3xl text-ui-base leading-relaxed">
      <ReactMarkdown
        skipHtml
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, href }) => (
            <a className="text-brand underline underline-offset-2" href={href}>
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-4 border-l-2 border-brand pl-4 text-foreground-subtle">
              {children}
            </blockquote>
          ),
          code: ({ children, className }) => (
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
          h1: ({ children }) => (
            <h1 className="mb-4 mt-8 text-ui-xl font-semibold first:mt-0">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-3 mt-7 text-ui-lg font-semibold first:mt-0">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-3 mt-6 text-ui-base font-semibold first:mt-0">{children}</h3>
          ),
          h4: ({ children }) => <h4 className="mb-2 mt-5 font-semibold first:mt-0">{children}</h4>,
          h5: ({ children }) => <h5 className="mb-2 mt-4 font-semibold first:mt-0">{children}</h5>,
          h6: ({ children }) => <h6 className="mb-2 mt-4 font-semibold first:mt-0">{children}</h6>,
          hr: () => <hr className="my-6 border-border" />,
          img: ({ alt, src, title }) => (
            <WorkspaceMarkdownImage
              alt={alt}
              markdownPath={path}
              src={src}
              title={title}
              workspaceId={workspaceId}
            />
          ),
          input: (props) => <input {...props} className="mr-2 accent-brand" readOnly />,
          li: ({ children }) => <li className="my-1">{children}</li>,
          ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-6">{children}</ol>,
          p: ({ children }) => <p className="my-3">{children}</p>,
          pre: ({ children }) => (
            <pre className="my-4 overflow-x-auto rounded-lg bg-background p-3">{children}</pre>
          ),
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto">
              <table className="w-full border-collapse text-left text-ui-sm">{children}</table>
            </div>
          ),
          td: ({ children }) => (
            <td className="border border-border px-3 py-2 align-top">{children}</td>
          ),
          th: ({ children }) => (
            <th className="border border-border bg-background px-3 py-2 text-left font-semibold">
              {children}
            </th>
          ),
          ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-6">{children}</ul>,
        }}
      >
        {content}
      </ReactMarkdown>
    </article>
  );
}

export function FileViewer({ workspaceId, path }: { workspaceId: string; path: string }) {
  const [file, setFile] = useState<WorkspaceFileContent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [markdownView, setMarkdownView] = useState<"preview" | "source">("preview");
  const [reloadVersion, setReloadVersion] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setFile(null);
    setError(null);
    if (!window.desktop) {
      setError("File access is available in the desktop app.");
      return () => {
        cancelled = true;
      };
    }
    void window.desktop
      .readWorkspaceFile(workspaceId, path)
      .then((content) => {
        if (!cancelled) setFile(content);
      })
      .catch(() => {
        if (!cancelled) setError("This file could not be opened.");
      });
    return () => {
      cancelled = true;
    };
  }, [reloadVersion, workspaceId, path]);
  useEffect(() => {
    setMarkdownView("preview");
  }, [workspaceId, path]);
  const loading = !file && !error;
  const name = path.split("/").at(-1) ?? path;
  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col bg-panel">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4 pr-10">
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="size-4 text-foreground" />
          <span className="truncate text-ui-base font-medium">{name}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {isMarkdown(path) ? (
            <div
              aria-label="Markdown view"
              className="flex shrink-0 items-center gap-1"
              role="group"
            >
              {(["preview", "source"] as const).map((view) => (
                <button
                  aria-label={view === "preview" ? "Preview" : "Source"}
                  aria-pressed={markdownView === view}
                  className={`grid size-7 place-items-center rounded-md transition-colors hover:bg-hover ${
                    markdownView === view ? "bg-selected text-foreground" : "text-foreground-subtle"
                  }`}
                  key={view}
                  onClick={() => setMarkdownView(view)}
                  title={view === "preview" ? "Preview" : "Source"}
                  type="button"
                >
                  {view === "preview" ? (
                    <Eye aria-hidden="true" className="size-4" />
                  ) : (
                    <Code2 aria-hidden="true" className="size-4" />
                  )}
                </button>
              ))}
            </div>
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
        </div>
      </div>
      {error ? (
        <div className="grid flex-1 place-items-center text-foreground-subtle">
          <div className="text-center">
            <FileWarning className="mx-auto mb-2 size-6" />
            {error}
          </div>
        </div>
      ) : !file ? (
        <div className="grid flex-1 place-items-center text-ui-sm text-foreground-subtle">
          Opening {name}…
        </div>
      ) : (
        <div
          data-testid="file-viewer-scroll"
          className="file-viewer-content min-h-0 flex-1 overflow-y-scroll p-5"
        >
          {isMarkdown(path) ? (
            markdownView === "preview" ? (
              <MarkdownPreview content={file.content} path={path} workspaceId={workspaceId} />
            ) : (
              <pre className="m-0 whitespace-pre-wrap break-words font-mono text-ui-sm leading-relaxed">
                {file.content}
              </pre>
            )
          ) : (
            <pre className="m-0 whitespace-pre-wrap break-words font-mono text-ui-sm leading-relaxed">
              {file.content}
            </pre>
          )}
          {file.truncated ? (
            <p className="mt-4 text-ui-sm text-foreground-subtle">File content limited to 1 MB.</p>
          ) : null}
        </div>
      )}
    </section>
  );
}
