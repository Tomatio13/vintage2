import { FileText, FileWarning } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { WorkspaceFileContent } from "../../shared/desktop.js";

function isMarkdown(path: string): boolean {
  return /\.(md|mdx|markdown)$/iu.test(path);
}

function MarkdownPreview({ content }: { content: string }) {
  const blocks = useMemo(() => content.split(/\n{2,}/u), [content]);
  return (
    <article className="mx-auto max-w-3xl text-ui-base leading-relaxed">
      {blocks.map((block, index) => {
        const heading = /^(#{1,3})\s+(.+)$/u.exec(block);
        if (heading) {
          const Tag = `h${heading[1]?.length ?? 1}` as "h1" | "h2" | "h3";
          return (
            <Tag className="mb-3 mt-6 font-semibold first:mt-0" key={index}>
              {heading[2]}
            </Tag>
          );
        }
        if (block.startsWith("```"))
          return (
            <pre className="my-4 overflow-x-auto rounded-lg bg-background p-3" key={index}>
              <code>{block.replace(/^```[^\n]*\n?|```$/gu, "")}</code>
            </pre>
          );
        if (block.split("\n").every((line) => /^[-*]\s+/u.test(line)))
          return (
            <ul className="my-3 list-disc space-y-1 pl-6" key={index}>
              {block.split("\n").map((line) => (
                <li key={line}>{line.replace(/^[-*]\s+/u, "")}</li>
              ))}
            </ul>
          );
        return (
          <p className="my-3 whitespace-pre-wrap" key={index}>
            {block}
          </p>
        );
      })}
    </article>
  );
}

export function FileViewer({
  workspaceId,
  path,
  onClose,
}: {
  workspaceId: string;
  path: string;
  onClose(): void;
}) {
  const [file, setFile] = useState<WorkspaceFileContent | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setFile(null);
    setError(null);
    if (!window.desktop) {
      setError("File access is available in the desktop app.");
      return;
    }
    void window.desktop
      .readWorkspaceFile(workspaceId, path)
      .then(setFile)
      .catch(() => setError("This file could not be opened."));
  }, [workspaceId, path]);
  const name = path.split("/").at(-1) ?? path;
  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col bg-panel">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="size-4 text-brand" />
          <span className="truncate text-ui-base font-medium">{name}</span>
        </div>
        <button
          className="rounded-md px-2 py-1 text-ui-sm text-foreground-subtle hover:bg-hover"
          onClick={onClose}
        >
          Close
        </button>
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
            <MarkdownPreview content={file.content} />
          ) : (
            <pre className="m-0 whitespace-pre-wrap break-words font-mono text-ui-sm leading-relaxed">
              {file.content}
            </pre>
          )}
          {file.truncated ? (
            <p className="mt-4 text-ui-sm text-foreground-subtle">Preview limited to 1 MB.</p>
          ) : null}
        </div>
      )}
    </section>
  );
}
