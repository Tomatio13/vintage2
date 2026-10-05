import {
  memo,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
  type ReactNode,
} from "react";
import { highlightSourceLine } from "./FilePreviewers.js";
import { cursorPosition } from "../lib/editorPosition.js";

const inlineTokens =
  /\\.|`+[^`]*`+|!?\[[^\]]*\]\([^)]*\)|!?\[[^\]]*\]\[[^\]]*\]|<https?:\/\/[^>]+>|\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_|~~[^~]+~~/gu;
const fenceLanguages: Record<string, string> = {
  javascript: "js",
  typescript: "ts",
  python: "py",
  shell: "sh",
  bash: "sh",
  rust: "rs",
  c: "c",
  cpp: "cpp",
  java: "java",
  json: "json",
  css: "css",
  html: "html",
  yaml: "yaml",
};

export interface MarkdownSourceLine {
  text: string;
  kind: "text" | "heading" | "fence" | "code" | "comment";
  codePath?: string;
}

export function markdownSourceLines(content: string): MarkdownSourceLine[] {
  let fence: { marker: string; length: number; path: string } | null = null;
  let comment = false;
  return content.split("\n").map((text) => {
    // Bound tokenization of pathological single-line files.
    if (text.length > 30_000) return { text, kind: "text" };
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(text);
    if (fence) {
      if (
        marker &&
        marker[1]![0] === fence.marker &&
        marker[1]!.length >= fence.length &&
        !marker[2]!.trim()
      ) {
        fence = null;
        return { text, kind: "fence" };
      }
      return { text, kind: "code", codePath: fence.path };
    }
    if (comment || /^\s*<!--/u.test(text)) {
      comment = !text.includes("-->");
      return { text, kind: "comment" };
    }
    if (marker) {
      const language = marker[2]!.trim().split(/\s/u)[0]?.toLowerCase() ?? "";
      fence = {
        marker: marker[1]![0]!,
        length: marker[1]!.length,
        path: `code.${fenceLanguages[language] ?? language}`,
      };
      return { text, kind: "fence" };
    }
    return {
      text,
      kind:
        /^ {0,3}#{1,6}(?:\s|$)/u.test(text) || /^ {0,3}(?:={3,}|-{3,})\s*$/u.test(text)
          ? "heading"
          : "text",
    };
  });
}

function highlightedMarkdown(line: MarkdownSourceLine): ReactNode {
  if (line.kind === "code") return highlightSourceLine(line.text, line.codePath ?? "code.txt");
  if (line.kind === "comment") return <span className="text-foreground-subtlest">{line.text}</span>;
  if (line.kind === "fence" || line.kind === "heading")
    return <span className="text-syntax-keyword">{line.text}</span>;
  if (line.text.length > 30_000) return line.text;
  const nodes: ReactNode[] = [];
  const prefix = /^(?:\s*>\s*|\s*(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s*)?)/u.exec(line.text);
  let cursor = prefix?.[0].length ?? 0;
  if (prefix)
    nodes.push(
      <span key="prefix" className="text-syntax-attribute">
        {prefix[0]}
      </span>,
    );
  inlineTokens.lastIndex = cursor;
  let match;
  while ((match = inlineTokens.exec(line.text))) {
    nodes.push(line.text.slice(cursor, match.index));
    const token = match[0];
    nodes.push(
      <span
        key={match.index}
        className={
          token.startsWith("\\")
            ? "text-foreground-subtlest"
            : token.startsWith("`")
              ? "text-syntax-string"
              : token.includes("]") || token.startsWith("<")
                ? "text-syntax-function"
                : "text-syntax-keyword"
        }
      >
        {token}
      </span>,
    );
    cursor = match.index + token.length;
  }
  nodes.push(line.text.slice(cursor));
  return nodes;
}

const SourceLine = memo(
  function SourceLine({ line, number }: { line: MarkdownSourceLine; number: number }) {
    return (
      <div data-editor-line={number} className="markdown-source-line">
        {line.text ? highlightedMarkdown(line) : "\u200b"}
      </div>
    );
  },
  (previous, next) =>
    previous.number === next.number &&
    previous.line.text === next.line.text &&
    previous.line.kind === next.line.kind &&
    previous.line.codePath === next.line.codePath,
);

export function MarkdownSourceInput({
  inputRef,
  content,
  zoom,
  disabled,
  label,
  onChange,
  onPosition,
}: {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  content: string;
  zoom: number;
  disabled: boolean;
  label: string;
  onChange: (content: string) => void;
  onPosition: (position: { line: number; column: number }) => void;
}) {
  const source = useMemo(() => content.replace(/\r\n?/gu, "\n"), [content]);
  const lines = useMemo(() => markdownSourceLines(source), [source]);
  const mirror = useRef<HTMLDivElement>(null);
  const numbers = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<{ top: number; height: number }[]>([]);
  const synchronize = () => {
    const editor = inputRef.current;
    if (!editor) return;
    if (mirror.current)
      mirror.current.style.transform = `translate(${-editor.scrollLeft}px, ${-editor.scrollTop}px)`;
    if (numbers.current) numbers.current.style.transform = `translateY(${-editor.scrollTop}px)`;
  };
  useLayoutEffect(() => {
    const editor = inputRef.current;
    const layer = mirror.current;
    if (!editor || !layer) return;
    const measure = () => {
      layer.style.width = `${editor.clientWidth}px`;
      const origin = layer.getBoundingClientRect().top;
      setLayout(
        Array.from(layer.children, (child) => {
          const bounds = child.getBoundingClientRect();
          return { top: bounds.top - origin, height: bounds.height };
        }),
      );
      synchronize();
    };
    measure();
    position();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(editor);
    return () => observer.disconnect();
  }, [content, zoom, inputRef]);
  const position = () => {
    const editor = inputRef.current;
    if (editor)
      onPosition(
        cursorPosition(
          editor.value,
          editor.selectionDirection === "backward" ? editor.selectionStart : editor.selectionEnd,
        ),
      );
  };
  return (
    <div
      className="markdown-source-editor relative min-h-0 flex-1 overflow-hidden font-mono"
      style={{ fontSize: `${13 * zoom}px`, lineHeight: 1.6 }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-14 overflow-hidden border-r border-border bg-background text-foreground-subtlest"
      >
        <div ref={numbers} className="relative">
          {lines.map((_, index) => (
            <div
              key={index}
              data-editor-line-number={index + 1}
              className="absolute right-2"
              style={{
                top: layout[index]?.top ?? 16 + index * 13 * zoom * 1.6,
                height: layout[index]?.height,
              }}
            >
              {index + 1}
            </div>
          ))}
        </div>
      </div>
      <div
        className="pointer-events-none absolute inset-y-0 left-14 right-0 overflow-hidden"
        aria-hidden="true"
      >
        <div
          ref={mirror}
          data-testid="markdown-syntax-mirror"
          className="markdown-source-mirror p-4"
        >
          {lines.map((line, index) => (
            <SourceLine key={index} line={line} number={index + 1} />
          ))}
        </div>
      </div>
      <textarea
        ref={inputRef}
        aria-label={label}
        className="markdown-source-textarea absolute inset-y-0 left-14 resize-none bg-transparent p-4 outline-none"
        style={{ width: "calc(100% - 3.5rem)", fontSize: "inherit", lineHeight: "inherit" }}
        spellCheck={false}
        disabled={disabled}
        value={source}
        onChange={(event) => {
          onChange(event.target.value);
          position();
        }}
        onFocus={position}
        onSelect={position}
        onClick={position}
        onKeyUp={position}
        onScroll={synchronize}
        placeholder="Write a note…"
      />
    </div>
  );
}
