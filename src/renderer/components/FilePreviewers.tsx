import { Check, Copy, Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import {
  Fragment,
  memo,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { Button } from "./Button.js";
import type { FilePreviewKind } from "../lib/filePreview.js";

export function ImageFilePreview({
  workspaceId,
  path,
  reloadVersion,
}: {
  workspaceId: string;
  path: string;
  reloadVersion: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [customZoom, setCustomZoom] = useState<number | null>(null);
  const [, setContainerVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setImageUrl(null);
    setError(false);
    setImageSize(null);
    setCustomZoom(null);

    if (!window.desktop) {
      setError(true);
      return () => {
        cancelled = true;
      };
    }

    void window.desktop
      .readWorkspaceImage(workspaceId, path)
      .then((url) => {
        if (!cancelled) setImageUrl(url);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [path, reloadVersion, workspaceId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setContainerVersion((version) => version + 1));
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const fitZoom = () => {
    const container = containerRef.current;
    if (!container || !imageSize) return 1;
    return Math.min(
      container.clientWidth / imageSize.width,
      container.clientHeight / imageSize.height,
      1,
    );
  };

  const zoomBy = (factor: number) => {
    const currentZoom = customZoom ?? fitZoom();
    setCustomZoom(Math.min(8, Math.max(0.1, currentZoom * factor)));
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 items-center justify-end gap-1">
        <button
          aria-label="Zoom out"
          className="grid size-7 place-items-center rounded-md text-foreground-subtle transition-colors hover:bg-hover hover:text-foreground"
          onClick={() => zoomBy(0.8)}
          title="Zoom out"
          type="button"
        >
          <ZoomOut aria-hidden="true" className="size-4" />
        </button>
        <button
          aria-label="Fit image"
          className="grid size-7 place-items-center rounded-md text-foreground-subtle transition-colors hover:bg-hover hover:text-foreground"
          onClick={() => setCustomZoom(null)}
          title="Fit image"
          type="button"
        >
          <Maximize2 aria-hidden="true" className="size-4" />
        </button>
        <button
          aria-label="Actual size"
          className="rounded-md px-2 text-ui-xs text-foreground-subtle transition-colors hover:bg-hover hover:text-foreground"
          onClick={() => setCustomZoom(1)}
          title="Actual size"
          type="button"
        >
          1:1
        </button>
        <button
          aria-label="Zoom in"
          className="grid size-7 place-items-center rounded-md text-foreground-subtle transition-colors hover:bg-hover hover:text-foreground"
          onClick={() => zoomBy(1.25)}
          title="Zoom in"
          type="button"
        >
          <ZoomIn aria-hidden="true" className="size-4" />
        </button>
      </div>
      <div
        ref={containerRef}
        className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-lg bg-background p-3"
        style={{
          backgroundImage:
            "linear-gradient(45deg, var(--color-border) 25%, transparent 25%), linear-gradient(-45deg, var(--color-border) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--color-border) 75%), linear-gradient(-45deg, transparent 75%, var(--color-border) 75%)",
          backgroundPosition: "0 0, 0 6px, 6px -6px, -6px 0",
          backgroundSize: "12px 12px",
        }}
      >
        {error ? (
          <p className="text-ui-sm text-foreground-subtle">This image could not be previewed.</p>
        ) : imageUrl ? (
          <img
            alt={path.split(/[\\/]/u).at(-1) ?? "Workspace image"}
            className="block shrink-0 object-contain"
            decoding="async"
            onLoad={(event) =>
              setImageSize({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              })
            }
            src={imageUrl}
            style={
              imageSize
                ? {
                    width: imageSize.width * (customZoom ?? fitZoom()),
                    height: imageSize.height * (customZoom ?? fitZoom()),
                  }
                : { maxHeight: "100%", maxWidth: "100%" }
            }
          />
        ) : (
          <p className="text-ui-sm text-foreground-subtle">Loading image…</p>
        )}
      </div>
      {imageSize ? (
        <p className="shrink-0 text-right text-ui-xs text-foreground-subtlest">
          {imageSize.width} × {imageSize.height}
          {customZoom ? ` · ${Math.round(customZoom * 100)}%` : " · Fit"}
        </p>
      ) : null}
    </div>
  );
}

const maxHighlightedLineCharacters = 30_000;
const initialCodePreviewLines = 600;
const languageKeywords: Record<string, ReadonlySet<string>> = {
  c: new Set(
    "auto break case char const continue default do else enum extern for goto if int return short signed sizeof static struct switch typedef union unsigned void volatile while".split(
      " ",
    ),
  ),
  css: new Set("@media @supports @font-face important inherit initial unset var calc".split(" ")),
  go: new Set(
    "break case chan const defer else fallthrough for func go goto if import interface map package range return select struct switch type var".split(
      " ",
    ),
  ),
  java: new Set(
    "abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for if implements import instanceof int interface long native new package private protected public return short static super switch synchronized this throw throws try void volatile while".split(
      " ",
    ),
  ),
  javascript: new Set(
    "as async await break case catch class const continue debugger default delete do else enum export extends finally for from function if implements import in instanceof let new of return static super switch this throw try typeof var void while yield".split(
      " ",
    ),
  ),
  python: new Set(
    "and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield".split(
      " ",
    ),
  ),
  rust: new Set(
    "as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while".split(
      " ",
    ),
  ),
  shell: new Set(
    "case do done elif else esac fi for function if in select then time until while break continue return exit export local readonly set unset".split(
      " ",
    ),
  ),
  typescript: new Set(
    "as async await break case catch class const continue debugger default delete do else enum export extends finally for from function if implements import in instanceof interface let new of private protected public readonly return static super switch this throw try type typeof var void while yield".split(
      " ",
    ),
  ),
};
const languageByExtension: Record<string, string> = {
  bash: "shell",
  cjs: "javascript",
  cc: "c",
  cpp: "c",
  fish: "shell",
  h: "c",
  hpp: "c",
  js: "javascript",
  jsx: "javascript",
  kt: "java",
  kts: "java",
  mjs: "javascript",
  py: "python",
  sh: "shell",
  ts: "typescript",
  tsx: "typescript",
  yml: "yaml",
  zsh: "shell",
};

function highlightSearchText(content: string, search: string, sourceOffset = 0): ReactNode[] {
  if (!search) return [content];
  const source = content.toLowerCase();
  const query = search.toLowerCase();
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let matchIndex = source.indexOf(query);
  while (matchIndex >= 0 && nodes.length < 256) {
    if (matchIndex > cursor) nodes.push(content.slice(cursor, matchIndex));
    nodes.push(
      <mark
        className="rounded-sm bg-brand/30 text-inherit"
        data-file-search-hit="true"
        key={sourceOffset + matchIndex}
      >
        {content.slice(matchIndex, matchIndex + query.length)}
      </mark>,
    );
    cursor = matchIndex + query.length;
    matchIndex = source.indexOf(query, cursor);
  }
  if (cursor < content.length) nodes.push(content.slice(cursor));
  return nodes.length > 0 ? nodes : [content];
}

interface CodeSyntaxProfile {
  colonAttributes: boolean;
  extension: string;
  markup: boolean;
  tokens: RegExp;
  words: ReadonlySet<string> | undefined;
}

const codeSyntaxProfiles = new Map<string, CodeSyntaxProfile>();
const whitespaceCharacter = /\s/u;
const syntaxLiterals = new Set(["true", "false", "null", "undefined", "None", "True", "False"]);

function codeSyntaxProfile(path: string): CodeSyntaxProfile {
  const extension = path.toLowerCase().split(".").at(-1) ?? "";
  const cached = codeSyntaxProfiles.get(extension);
  if (cached) return cached;

  const hashComments = ["py", "sh", "bash", "zsh", "fish", "yaml", "yml", "toml", "ini"].includes(
    extension,
  );
  const markup = ["html", "htm", "xml", "vue", "svelte"].includes(extension);
  const css = ["css", "scss", "less"].includes(extension);
  const comment = markup
    ? String.raw`<!--.*?(?:-->|$)`
    : hashComments
      ? String.raw`#.*$`
      : css
        ? String.raw`\/\*.*?(?:\*\/|$)`
        : String.raw`\/\/.*$|\/\*.*?(?:\*\/|$)`;
  const profile: CodeSyntaxProfile = {
    colonAttributes: ["yaml", "yml", "toml", "css", "scss"].includes(extension),
    extension,
    markup,
    tokens: new RegExp(
      String.raw`(?<comment>${comment})|(?<string>"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\x60(?:\\.|[^\x60\\])*\x60)|(?<number>\b(?:0[xX][\da-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b)|(?<word>[$A-Za-z_][\w$-]*)`,
      "gu",
    ),
    words: languageKeywords[languageByExtension[extension] ?? extension],
  };
  codeSyntaxProfiles.set(extension, profile);
  return profile;
}

function nextSignificantCharacter(content: string, fromIndex: number): string {
  let index = fromIndex;
  while (index < content.length && whitespaceCharacter.test(content[index] ?? "")) index += 1;
  return content[index] ?? "";
}

function highlightedLine(content: string, profile: CodeSyntaxProfile, search: string): ReactNode {
  const { colonAttributes, extension, markup, tokens, words } = profile;
  tokens.lastIndex = 0;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = tokens.exec(content)) !== null) {
    if (match.index > cursor) {
      nodes.push(...highlightSearchText(content.slice(cursor, match.index), search, cursor));
    }
    const token = match[0];
    let className = "";
    if (match.groups?.comment) className = "text-foreground-subtlest italic";
    else if (match.groups?.string) {
      className =
        extension === "json" && nextSignificantCharacter(content, tokens.lastIndex) === ":"
          ? "text-syntax-attribute"
          : "text-syntax-string";
    } else if (match.groups?.number) className = "text-syntax-number";
    else if (match.groups?.word) {
      const previous = content[match.index - 1] ?? "";
      const followingCharacter = nextSignificantCharacter(content, tokens.lastIndex);
      if (words?.has(token)) className = "text-syntax-keyword";
      else if (syntaxLiterals.has(token)) {
        className = "text-syntax-literal";
      } else if (markup && (previous === "<" || previous === "/")) {
        className = "text-syntax-keyword";
      } else if (followingCharacter === "=" || (colonAttributes && followingCharacter === ":")) {
        className = "text-syntax-attribute";
      } else if (/^[A-Z]/u.test(token)) className = "text-syntax-type";
      else if (followingCharacter === "(") className = "text-syntax-function";
    }
    const highlightedToken = highlightSearchText(token, search, match.index);
    if (className) {
      nodes.push(
        <span key={match.index} className={className}>
          {highlightedToken}
        </span>,
      );
    } else {
      nodes.push(...highlightedToken);
    }
    cursor = tokens.lastIndex;
  }
  if (cursor < content.length) {
    nodes.push(...highlightSearchText(content.slice(cursor), search, cursor));
  }
  return nodes.length > 0 ? nodes : content;
}

export function highlightSourceLine(content: string, path: string): ReactNode {
  return content.length <= maxHighlightedLineCharacters
    ? highlightedLine(content, codeSyntaxProfile(path), "")
    : content;
}

function highlightedPlainLine(content: string, search: string): ReactNode {
  return highlightSearchText(content, search);
}

const CodeSourceLine = memo(function CodeSourceLine({
  hasNextLine,
  index,
  line,
  lineNumbers,
  path,
  search,
  highlightSyntax,
}: {
  highlightSyntax: boolean;
  hasNextLine: boolean;
  index: number;
  line: string;
  lineNumbers: boolean;
  path: string;
  search: string;
}) {
  const displayed =
    line.length > 20_000
      ? `${line.slice(0, 20_000)}… [line truncated; copy source for full text]`
      : line;
  const value =
    highlightSyntax && line.length <= 2_000
      ? highlightedLine(line, codeSyntaxProfile(path), search)
      : highlightedPlainLine(displayed, search);

  return lineNumbers ? (
    <span data-code-line={index + 1} className="grid grid-cols-[3.5rem_minmax(0,1fr)]">
      <span className="sticky left-0 select-none border-r border-border bg-terminal-surface px-2 text-right text-foreground-subtlest">
        {index + 1}
      </span>
      <span data-file-search-text="true" className="px-3">
        {value}
      </span>
    </span>
  ) : (
    <Fragment>
      <span data-code-line={index + 1}>{value}</span>
      {hasNextLine ? "\n" : ""}
    </Fragment>
  );
});

export function CodeSourcePreview({
  content,
  path,
  wrap,
  search = "",
  lineNumbers = true,
  targetLine,
  searchColumn,
  searchLine,
}: {
  content: string;
  path: string;
  wrap: boolean;
  search?: string;
  lineNumbers?: boolean;
  targetLine?: number | undefined;
  searchColumn?: number | undefined;
  searchLine?: number | undefined;
}) {
  const lines = useMemo(() => content.split("\n"), [content]);
  const highlightName = `source-active-${useId().replace(/[^a-z0-9-]/giu, "")}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const [navigation, setNavigation] = useState({
    content,
    start:
      Math.floor(Math.max(0, (searchLine ?? targetLine ?? 1) - 1) / initialCodePreviewLines) *
      initialCodePreviewLines,
  });
  const previousRequest = useRef({ content, targetLine, searchLine, searchColumn });
  const pendingTarget = useRef<number | undefined>(searchLine ?? targetLine);
  const anchor = useRef<{ line: string; offset: number } | null>(null);
  const start = Math.max(
    0,
    Math.min(
      navigation.content === content ? navigation.start : 0,
      Math.max(0, lines.length - initialCodePreviewLines),
    ),
  );
  const end = Math.min(start + initialCodePreviewLines, lines.length);
  const activeLine = searchLine ?? targetLine;
  const highlightSyntax = useMemo(
    () => lines.slice(start, end).reduce((total, line) => total + line.length, 0) <= 50_000,
    [lines, start, end],
  );
  const adjustingScroll = useRef(false);
  const deferScroll = () => {
    adjustingScroll.current = true;
    requestAnimationFrame(() => {
      adjustingScroll.current = false;
    });
  };
  const navigate = (next: number) => {
    deferScroll();
    anchor.current = null;
    if (containerRef.current) containerRef.current.scrollTop = 0;
    setNavigation({ content, start: Math.max(0, next) });
  };
  useLayoutEffect(() => {
    const previous = previousRequest.current;
    previousRequest.current = { content, targetLine, searchLine, searchColumn };
    const changed =
      content !== previous.content ||
      targetLine !== previous.targetLine ||
      (searchLine !== undefined &&
        (searchLine !== previous.searchLine || searchColumn !== previous.searchColumn));
    if (!changed) return;
    const line = searchLine ?? targetLine;
    pendingTarget.current = line;
    anchor.current = null;
    if (line !== undefined && (line - 1 < start || line - 1 >= end))
      setNavigation({
        content,
        start:
          Math.floor(Math.max(0, line - 1) / initialCodePreviewLines) * initialCodePreviewLines,
      });
    else if (content !== previous.content) setNavigation({ content, start: 0 });
  }, [content, targetLine, searchLine, searchColumn, start, end]);
  useLayoutEffect(() => {
    const host = containerRef.current;
    if (!host) return;
    const saved = anchor.current;
    if (saved) {
      const row = host.querySelector(`[data-code-line="${saved.line}"]`);
      if (row)
        host.scrollTop +=
          row.getBoundingClientRect().top - host.getBoundingClientRect().top - saved.offset;
      anchor.current = null;
    }
    if (pendingTarget.current !== undefined) {
      const row = host.querySelector(`[data-code-line="${pendingTarget.current}"]`);
      if (row) {
        row.scrollIntoView?.({ block: "center", inline: "nearest" });
        pendingTarget.current = undefined;
      }
    }
  }, [content, start, activeLine, searchColumn]);
  const shiftWindow = (host: HTMLDivElement, next: number) => {
    if (adjustingScroll.current) return;
    deferScroll();
    const top = host.getBoundingClientRect().top;
    const row = [...host.querySelectorAll<HTMLElement>("[data-code-line]")].find(
      (row) => row.getBoundingClientRect().bottom > top,
    );
    if (row)
      anchor.current = {
        line: row.dataset.codeLine!,
        offset: row.getBoundingClientRect().top - top,
      };
    setNavigation({ content, start: next });
  };
  const scrollWindow = (host: HTMLDivElement, direction = 0) => {
    if (adjustingScroll.current || host.scrollHeight <= host.clientHeight) return;
    if (
      direction >= 0 &&
      host.scrollTop > 0 &&
      host.scrollHeight - host.scrollTop - host.clientHeight < 100 &&
      end < lines.length
    )
      shiftWindow(
        host,
        Math.min(
          start + initialCodePreviewLines / 2,
          Math.max(0, lines.length - initialCodePreviewLines),
        ),
      );
    else if (direction <= 0 && host.scrollTop < 100 && start > 0)
      shiftWindow(host, Math.max(0, start - initialCodePreviewLines / 2));
  };
  const focusedMatch = useRef<{
    content: string;
    line: number;
    column: number;
    search: string;
    wrap: boolean;
  } | null>(null);
  useEffect(() => {
    if (
      !search ||
      searchColumn === undefined ||
      !activeLine ||
      typeof Highlight === "undefined" ||
      !CSS.highlights
    )
      return;
    const host = containerRef.current;
    const text = host?.querySelector(`[data-code-line="${activeLine}"] [data-file-search-text]`);
    if (!text) return;
    const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let cursor = 0;
    let started = false;
    let node: Node | null;
    const endColumn = searchColumn + search.split("\n")[0]!.length;
    while ((node = walker.nextNode())) {
      const end = cursor + (node.textContent?.length ?? 0);
      if (!started && searchColumn < end) {
        range.setStart(node, searchColumn - cursor);
        started = true;
      }
      if (started && endColumn <= end) {
        range.setEnd(node, endColumn - cursor);
        CSS.highlights.set(highlightName, new Highlight(range));
        const previous = focusedMatch.current;
        if (
          !previous ||
          previous.content !== content ||
          previous.line !== activeLine ||
          previous.column !== searchColumn ||
          previous.search !== search ||
          previous.wrap !== wrap
        ) {
          focusedMatch.current = { content, line: activeLine, column: searchColumn, search, wrap };
          const rect = range.getBoundingClientRect();
          const bounds = host!.getBoundingClientRect();
          host!.scrollTop += rect.top - bounds.top - host!.clientHeight / 2;
          host!.scrollLeft += rect.left - bounds.left - host!.clientWidth / 2;
        }
        break;
      }
      cursor = end;
    }
    return () => {
      CSS.highlights.delete(highlightName);
    };
  }, [content, start, activeLine, search, searchColumn, highlightName, path, wrap, lineNumbers]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <style>{`::highlight(${highlightName}) { background: #f9731699; color: inherit; }`}</style>
      <div
        ref={containerRef}
        className="min-h-0 flex-1 overflow-auto rounded-lg bg-terminal-surface py-2 font-mono text-ui-sm leading-5"
        data-source-scroll
        onScroll={(event) => scrollWindow(event.currentTarget)}
        onWheel={(event) => {
          if (event.deltaY) scrollWindow(event.currentTarget, event.deltaY);
        }}
      >
        <pre
          className={`m-0 min-w-full ${wrap ? "whitespace-pre-wrap break-words" : "w-max whitespace-pre"}`}
        >
          {lines.slice(start, end).map((line, row) => (
            <CodeSourceLine
              highlightSyntax={highlightSyntax}
              index={start + row}
              hasNextLine={start + row < lines.length - 1}
              key={start + row}
              line={line}
              lineNumbers={lineNumbers}
              path={path}
              search={search}
            />
          ))}
        </pre>
      </div>
      {lines.length > initialCodePreviewLines && (
        <nav
          aria-label="Source pages"
          className="flex shrink-0 items-center justify-between text-ui-xs text-foreground-subtle"
          data-document-search-ignore
        >
          <Button
            size="compact"
            variant="ghost"
            disabled={start === 0}
            onClick={() => navigate(start - initialCodePreviewLines)}
          >
            Previous
          </Button>
          <span>
            Lines {start + 1}–{end} of {lines.length}
          </span>
          <Button
            size="compact"
            variant="ghost"
            disabled={end >= lines.length}
            onClick={() => navigate(start + initialCodePreviewLines)}
          >
            Next
          </Button>
        </nav>
      )}
    </div>
  );
}

export function parseJsonPreview(content: string) {
  try {
    return { formatted: JSON.stringify(JSON.parse(content), null, 2), error: null };
  } catch (error) {
    return { formatted: content, error: error instanceof Error ? error.message : "Invalid JSON" };
  }
}

export function FormattedJsonPreview({
  parsed,
  path,
  targetLine,
  search,
  searchColumn,
  searchLine,
}: {
  parsed: ReturnType<typeof parseJsonPreview>;
  path: string;
  search?: string;
  searchColumn?: number | undefined;
  searchLine?: number | undefined;
  targetLine?: number | undefined;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {parsed.error ? (
        <p className="rounded-md bg-hover px-3 py-2 text-ui-sm text-foreground-subtle">
          Could not format JSON: {parsed.error}
        </p>
      ) : null}
      <CodeSourcePreview
        targetLine={targetLine}
        searchLine={searchLine}
        content={parsed.formatted}
        path={path}
        wrap={false}
        search={search ?? ""}
        searchColumn={searchColumn}
      />
    </div>
  );
}

function parseDelimited(content: string, delimiter: string) {
  const maxRows = 500;
  const maxColumns = 40;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let truncatedColumns = false;
  let truncatedRows = false;

  const addField = () => {
    if (row.length < maxColumns) row.push(field);
    else truncatedColumns = true;
    field = "";
  };
  const addRow = () => {
    addField();
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index] ?? "";
    if (character === '"') {
      if (quoted && content[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (!quoted && character === delimiter) {
      addField();
    } else if (!quoted && (character === "\n" || character === "\r")) {
      addRow();
      if (character === "\r" && content[index + 1] === "\n") index += 1;
      if (rows.length >= maxRows && index < content.length - 1) {
        truncatedRows = true;
        break;
      }
    } else {
      field += character;
    }
  }
  if (field || row.length > 0) addRow();
  return { rows, truncatedColumns, truncatedRows };
}

export function DelimitedPreview({
  content,
  path,
  search = "",
}: {
  content: string;
  path: string;
  search?: string;
}) {
  const delimiter = path.toLowerCase().endsWith(".tsv") ? "\t" : ",";
  const tableContent = content.startsWith("\uFEFF") ? content.slice(1) : content;
  const result = useMemo(() => parseDelimited(tableContent, delimiter), [tableContent, delimiter]);
  const [header, ...allBody] = result.rows;
  const body = search
    ? allBody.filter((row) => row.some((cell) => cell.toLowerCase().includes(search.toLowerCase())))
    : allBody;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {result.truncatedRows || result.truncatedColumns ? (
        <p className="text-ui-xs text-foreground-subtle">
          Table preview is limited to 500 rows and 40 columns.
        </p>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-left text-ui-sm">
          {header ? (
            <thead className="sticky top-0 bg-panel">
              <tr>
                <th
                  data-document-search-ignore
                  className="border-b border-r border-border px-2 py-2 text-right font-medium text-foreground-subtlest"
                >
                  #
                </th>
                {header.map((cell, index) => (
                  <th className="border-b border-r border-border px-3 py-2 font-medium" key={index}>
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
          ) : null}
          <tbody>
            {body.map((cells, rowIndex) => (
              <tr className="hover:bg-hover" key={rowIndex}>
                <td
                  data-document-search-ignore
                  className="border-b border-r border-border px-2 py-1 text-right text-foreground-subtlest"
                >
                  {rowIndex + 1}
                </td>
                {header?.map((_, columnIndex) => (
                  <td
                    className="max-w-96 border-b border-r border-border px-3 py-1 align-top"
                    key={columnIndex}
                  >
                    <span className="block whitespace-pre-wrap break-words">
                      {cells[columnIndex] ?? ""}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!header || (search && body.length === 0) ? (
          <p className="p-3 text-ui-sm text-foreground-subtle">
            {search ? "No matching rows." : "This table is empty."}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function WorkspaceHtmlPreview({ url }: { url: string }) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <p className="shrink-0 text-ui-xs text-foreground-subtle">
        Safe preview: scripts and external resources are blocked.
      </p>
      <iframe
        className="min-h-0 w-full flex-1 rounded-lg border border-border bg-white"
        referrerPolicy="no-referrer"
        sandbox=""
        src={url}
        title="HTML preview"
      />
    </div>
  );
}

export function WorkspacePdfPreview({ url }: { url: string }) {
  return (
    <iframe
      className="h-full min-h-0 w-full rounded-lg border border-border bg-panel"
      referrerPolicy="no-referrer"
      src={url}
      title="PDF preview"
    />
  );
}

export function WorkspaceMediaPreview({
  kind,
  url,
}: {
  kind: Extract<FilePreviewKind, "audio" | "video">;
  url: string;
}) {
  return kind === "video" ? (
    <div className="grid h-full min-h-0 place-items-center rounded-lg bg-black p-4">
      <video className="max-h-full max-w-full" controls playsInline preload="metadata" src={url} />
    </div>
  ) : (
    <div className="grid h-full min-h-0 place-items-center rounded-lg bg-background p-6">
      <audio className="w-full max-w-xl" controls preload="metadata" src={url} />
    </div>
  );
}

export function CopySourceButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1_400);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  return (
    <button
      aria-label={copied ? "Copied source" : "Copy source"}
      className="grid size-7 place-items-center rounded-md text-foreground-subtle transition-colors hover:bg-hover hover:text-foreground"
      onClick={() => {
        void window.desktop
          ?.writeClipboardText(content)
          .then(() => setCopied(true))
          .catch(() => {});
      }}
      title={copied ? "Copied" : "Copy source"}
      type="button"
    >
      {copied ? (
        <Check aria-hidden="true" className="size-4" />
      ) : (
        <Copy aria-hidden="true" className="size-4" />
      )}
    </button>
  );
}
