import {
  Atom,
  Braces,
  ChevronDown,
  ChevronRight,
  CodeXml,
  FileCode,
  FileDiff,
  FileImage,
  FileText,
  Paintbrush,
  RefreshCw,
  Settings2,
  Terminal,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import type {
  WorkspaceGitReviewChange,
  WorkspaceGitReviewDiff,
  WorkspaceGitReviewSnapshot,
} from "../../shared/desktop.js";
import { Button } from "./Button.js";

interface ReviewPaneProps {
  workspaceId: string | null;
  active: boolean;
  refreshVersion: number;
  onRefresh(): void;
}

function changeLabel(kind: WorkspaceGitReviewChange["kind"]): string {
  switch (kind) {
    case "added":
      return "Added";
    case "deleted":
      return "Deleted";
    case "renamed":
      return "Renamed";
    case "untracked":
      return "Untracked";
    case "conflicted":
      return "Conflict";
    default:
      return "Modified";
  }
}

type SyntaxLanguage =
  | "typescript"
  | "javascript"
  | "json"
  | "python"
  | "shell"
  | "markup"
  | "css"
  | "markdown"
  | "rust"
  | "go"
  | "java"
  | "yaml"
  | "generic";

interface LanguageInfo {
  name: string;
  language: SyntaxLanguage;
  label?: string;
  icon: LucideIcon;
  color: string;
}

const languageInfoByExtension: Record<string, LanguageInfo> = {
  ts: {
    name: "TypeScript",
    language: "typescript",
    label: "TS",
    icon: FileCode,
    color: "text-blue-700 dark:text-blue-300",
  },
  mts: {
    name: "TypeScript",
    language: "typescript",
    label: "TS",
    icon: FileCode,
    color: "text-blue-700 dark:text-blue-300",
  },
  cts: {
    name: "TypeScript",
    language: "typescript",
    label: "TS",
    icon: FileCode,
    color: "text-blue-700 dark:text-blue-300",
  },
  tsx: {
    name: "React TypeScript",
    language: "typescript",
    icon: Atom,
    color: "text-sky-700 dark:text-sky-300",
  },
  js: {
    name: "JavaScript",
    language: "javascript",
    label: "JS",
    icon: FileCode,
    color: "text-yellow-700 dark:text-yellow-300",
  },
  mjs: {
    name: "JavaScript",
    language: "javascript",
    label: "JS",
    icon: FileCode,
    color: "text-yellow-700 dark:text-yellow-300",
  },
  cjs: {
    name: "JavaScript",
    language: "javascript",
    label: "JS",
    icon: FileCode,
    color: "text-yellow-700 dark:text-yellow-300",
  },
  jsx: {
    name: "React JavaScript",
    language: "javascript",
    icon: Atom,
    color: "text-sky-700 dark:text-sky-300",
  },
  json: {
    name: "JSON",
    language: "json",
    icon: Braces,
    color: "text-amber-700 dark:text-amber-300",
  },
  jsonc: {
    name: "JSON with comments",
    language: "json",
    icon: Braces,
    color: "text-amber-700 dark:text-amber-300",
  },
  py: {
    name: "Python",
    language: "python",
    label: "Py",
    icon: FileCode,
    color: "text-cyan-700 dark:text-cyan-300",
  },
  pyi: {
    name: "Python",
    language: "python",
    label: "Py",
    icon: FileCode,
    color: "text-cyan-700 dark:text-cyan-300",
  },
  sh: {
    name: "Shell",
    language: "shell",
    label: "$_",
    icon: Terminal,
    color: "text-green-700 dark:text-green-300",
  },
  bash: {
    name: "Bash",
    language: "shell",
    label: "$_",
    icon: Terminal,
    color: "text-green-700 dark:text-green-300",
  },
  zsh: {
    name: "Zsh",
    language: "shell",
    label: "$_",
    icon: Terminal,
    color: "text-green-700 dark:text-green-300",
  },
  fish: {
    name: "Fish",
    language: "shell",
    label: "$_",
    icon: Terminal,
    color: "text-green-700 dark:text-green-300",
  },
  md: {
    name: "Markdown",
    language: "markdown",
    label: "MD",
    icon: FileText,
    color: "text-sky-700 dark:text-sky-300",
  },
  mdx: {
    name: "MDX",
    language: "markdown",
    label: "MD",
    icon: FileText,
    color: "text-sky-700 dark:text-sky-300",
  },
  html: {
    name: "HTML",
    language: "markup",
    icon: CodeXml,
    color: "text-orange-700 dark:text-orange-300",
  },
  htm: {
    name: "HTML",
    language: "markup",
    icon: CodeXml,
    color: "text-orange-700 dark:text-orange-300",
  },
  xml: {
    name: "XML",
    language: "markup",
    icon: CodeXml,
    color: "text-orange-700 dark:text-orange-300",
  },
  svg: {
    name: "SVG",
    language: "markup",
    icon: CodeXml,
    color: "text-orange-700 dark:text-orange-300",
  },
  vue: {
    name: "Vue",
    language: "markup",
    label: "V",
    icon: CodeXml,
    color: "text-green-700 dark:text-green-300",
  },
  svelte: {
    name: "Svelte",
    language: "markup",
    label: "S",
    icon: CodeXml,
    color: "text-orange-700 dark:text-orange-300",
  },
  css: {
    name: "CSS",
    language: "css",
    label: "#",
    icon: Paintbrush,
    color: "text-pink-700 dark:text-pink-300",
  },
  scss: {
    name: "SCSS",
    language: "css",
    label: "#",
    icon: Paintbrush,
    color: "text-pink-700 dark:text-pink-300",
  },
  less: {
    name: "Less",
    language: "css",
    label: "#",
    icon: Paintbrush,
    color: "text-pink-700 dark:text-pink-300",
  },
  rs: {
    name: "Rust",
    language: "rust",
    label: "Rs",
    icon: Settings2,
    color: "text-orange-700 dark:text-orange-300",
  },
  go: {
    name: "Go",
    language: "go",
    label: "Go",
    icon: FileCode,
    color: "text-cyan-700 dark:text-cyan-300",
  },
  java: {
    name: "Java",
    language: "java",
    label: "J",
    icon: FileCode,
    color: "text-red-700 dark:text-red-300",
  },
  kt: {
    name: "Kotlin",
    language: "java",
    label: "Kt",
    icon: FileCode,
    color: "text-purple-700 dark:text-purple-300",
  },
  c: {
    name: "C",
    language: "generic",
    label: "C",
    icon: FileCode,
    color: "text-blue-700 dark:text-blue-300",
  },
  h: {
    name: "C header",
    language: "generic",
    label: "H",
    icon: FileCode,
    color: "text-blue-700 dark:text-blue-300",
  },
  cc: {
    name: "C++",
    language: "generic",
    label: "C+",
    icon: FileCode,
    color: "text-blue-700 dark:text-blue-300",
  },
  cpp: {
    name: "C++",
    language: "generic",
    label: "C+",
    icon: FileCode,
    color: "text-blue-700 dark:text-blue-300",
  },
  hpp: {
    name: "C++ header",
    language: "generic",
    label: "H+",
    icon: FileCode,
    color: "text-blue-700 dark:text-blue-300",
  },
  yml: {
    name: "YAML",
    language: "yaml",
    label: "Y",
    icon: Settings2,
    color: "text-red-700 dark:text-red-300",
  },
  yaml: {
    name: "YAML",
    language: "yaml",
    label: "Y",
    icon: Settings2,
    color: "text-red-700 dark:text-red-300",
  },
  toml: {
    name: "TOML",
    language: "yaml",
    label: "T",
    icon: Settings2,
    color: "text-red-700 dark:text-red-300",
  },
  ini: {
    name: "INI",
    language: "yaml",
    label: "I",
    icon: Settings2,
    color: "text-red-700 dark:text-red-300",
  },
  png: {
    name: "Image",
    language: "generic",
    icon: FileImage,
    color: "text-purple-700 dark:text-purple-300",
  },
  jpg: {
    name: "Image",
    language: "generic",
    icon: FileImage,
    color: "text-purple-700 dark:text-purple-300",
  },
  jpeg: {
    name: "Image",
    language: "generic",
    icon: FileImage,
    color: "text-purple-700 dark:text-purple-300",
  },
  gif: {
    name: "Image",
    language: "generic",
    icon: FileImage,
    color: "text-purple-700 dark:text-purple-300",
  },
  webp: {
    name: "Image",
    language: "generic",
    icon: FileImage,
    color: "text-purple-700 dark:text-purple-300",
  },
};

const defaultLanguageInfo: LanguageInfo = {
  name: "File",
  language: "generic",
  icon: FileDiff,
  color: "text-foreground-subtle",
};

function languageInfoForPath(path: string): LanguageInfo {
  const filename = path.split("/").at(-1)?.toLowerCase() ?? "";
  if (filename === "dockerfile") {
    return {
      name: "Dockerfile",
      language: "shell",
      label: "D",
      icon: Settings2,
      color: "text-sky-700 dark:text-sky-300",
    };
  }
  if (filename === "makefile" || filename === "justfile") {
    return {
      name: "Build file",
      language: "shell",
      label: "M",
      icon: Settings2,
      color: "text-green-700 dark:text-green-300",
    };
  }
  if ([".gitignore", ".dockerignore", ".env", ".editorconfig"].includes(filename)) {
    return {
      name: "Configuration",
      language: "shell",
      icon: Settings2,
      color: "text-foreground-subtle",
    };
  }
  const extension = filename.includes(".") ? filename.split(".").at(-1) : "";
  return (extension && languageInfoByExtension[extension]) || defaultLanguageInfo;
}

export function LanguageIcon({ path }: { path: string }) {
  const info = languageInfoForPath(path);
  const Icon = info.icon;
  return (
    <span
      aria-hidden="true"
      className={`grid size-5 shrink-0 place-items-center ${info.color}`}
      title={info.label ? `${info.name} (${info.label})` : info.name}
    >
      {info.label ? (
        <span className="font-mono text-ui-xs font-semibold leading-none">{info.label}</span>
      ) : (
        <Icon className="size-4" />
      )}
    </span>
  );
}

interface DiffLine {
  kind: "context" | "added" | "removed";
  oldLine: number | null;
  newLine: number | null;
  content: string;
}

interface DiffFold {
  kind: "fold";
  id: string;
  count: number;
  lines: DiffLine[] | null;
}

type DiffEntry = DiffLine | DiffFold;

interface ParsedHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

function foldId(first: DiffLine, last: DiffLine): string {
  return `fold-${first.oldLine ?? 0}-${first.newLine ?? 0}-${last.oldLine ?? 0}-${last.newLine ?? 0}`;
}

function createFold(lines: DiffLine[]): DiffFold {
  const first = lines[0];
  const last = lines.at(-1);
  return {
    kind: "fold",
    id: first && last ? foldId(first, last) : `fold-empty-${lines.length}`,
    count: lines.length,
    lines,
  };
}

function collapseContext(entries: DiffEntry[]): DiffEntry[] {
  const result: DiffEntry[] = [];
  const hasChangedLinesAfter = Array.from({ length: entries.length + 1 }, () => false);
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    hasChangedLinesAfter[index] =
      hasChangedLinesAfter[index + 1] || entry?.kind === "added" || entry?.kind === "removed";
  }
  let hasChangedLinesBefore = false;
  for (let index = 0; index < entries.length; ) {
    const entry = entries[index];
    if (!entry || entry.kind !== "context") {
      if (entry) {
        result.push(entry);
        if (entry.kind === "added" || entry.kind === "removed") hasChangedLinesBefore = true;
      }
      index += 1;
      continue;
    }
    let end = index + 1;
    while (entries[end]?.kind === "context") end += 1;
    const run = entries.slice(index, end) as DiffLine[];
    if (run.length <= 6) {
      result.push(...run);
      index = end;
      continue;
    }

    const changedAfter = hasChangedLinesAfter[end] ?? false;
    if (!hasChangedLinesBefore) {
      const hidden = run.slice(0, -3);
      result.push(createFold(hidden), ...run.slice(-3));
    } else if (!changedAfter) {
      result.push(...run.slice(0, 3), createFold(run.slice(3)));
    } else {
      result.push(...run.slice(0, 3), createFold(run.slice(3, -3)), ...run.slice(-3));
    }
    index = end;
  }
  return result;
}

function parseDiffPatch(patch: string): DiffEntry[] {
  const hunks: ParsedHunk[] = [];
  let currentHunk: ParsedHunk | null = null;
  let oldLine = 0;
  let newLine = 0;
  for (const line of patch.split("\n")) {
    const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/u.exec(line);
    if (header) {
      currentHunk = {
        oldStart: Number(header[1]),
        oldCount: Number(header[2] ?? 1),
        newStart: Number(header[3]),
        newCount: Number(header[4] ?? 1),
        lines: [],
      };
      hunks.push(currentHunk);
      oldLine = currentHunk.oldStart;
      newLine = currentHunk.newStart;
      continue;
    }
    if (!currentHunk || line.startsWith("\\ No newline at end of file")) continue;
    if (line.startsWith(" ")) {
      currentHunk.lines.push({ kind: "context", oldLine, newLine, content: line.slice(1) });
      oldLine += 1;
      newLine += 1;
    } else if (line.startsWith("+")) {
      currentHunk.lines.push({ kind: "added", oldLine: null, newLine, content: line.slice(1) });
      newLine += 1;
    } else if (line.startsWith("-")) {
      currentHunk.lines.push({ kind: "removed", oldLine, newLine: null, content: line.slice(1) });
      oldLine += 1;
    }
  }

  if (hunks.length === 0) return [];
  const entries: DiffEntry[] = [];
  const firstHunk = hunks[0];
  if (firstHunk && firstHunk.oldStart > 1 && firstHunk.newStart > 1) {
    const count = Math.min(firstHunk.oldStart - 1, firstHunk.newStart - 1);
    entries.push({
      kind: "fold",
      id: `fold-prefix-${firstHunk.oldStart}-${firstHunk.newStart}`,
      count,
      lines: null,
    });
  }
  hunks.forEach((hunk, index) => {
    if (index > 0) {
      const previous = hunks[index - 1];
      if (previous) {
        const oldGap = hunk.oldStart - (previous.oldStart + previous.oldCount);
        const newGap = hunk.newStart - (previous.newStart + previous.newCount);
        const count = Math.min(oldGap, newGap);
        if (count > 0) {
          const oldStart = previous.oldStart + previous.oldCount;
          const newStart = previous.newStart + previous.newCount;
          entries.push({
            kind: "fold",
            id: `fold-gap-${oldStart}-${newStart}-${count}`,
            count,
            lines: null,
          });
        }
      }
    }
    entries.push(...hunk.lines);
  });
  return collapseContext(entries);
}

function keywordSet(words: string): ReadonlySet<string> {
  return new Set(words.split(/\s+/u));
}

const syntaxKeywords: Partial<Record<SyntaxLanguage, ReadonlySet<string>>> = {
  typescript: keywordSet(
    "as async await break case catch class const continue debugger default delete do else enum export extends finally for from function if implements import in instanceof interface let new of package private protected public return static super switch this throw try typeof var void while with yield abstract declare keyof namespace readonly satisfies type infer is asserts constructor get set module require",
  ),
  javascript: keywordSet(
    "as async await break case catch class const continue debugger default delete do else export extends finally for from function if import in instanceof let new of return static super switch this throw try typeof var void while with yield",
  ),
  json: keywordSet(""),
  python: keywordSet(
    "and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield",
  ),
  shell: keywordSet(
    "case do done elif else esac fi for function if in select then time until while coproc break continue return exit export local readonly declare source alias set unset shift",
  ),
  markup: keywordSet(""),
  css: keywordSet("@import @media @supports @font-face important"),
  markdown: keywordSet(""),
  rust: keywordSet(
    "as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while",
  ),
  go: keywordSet(
    "break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var",
  ),
  java: keywordSet(
    "abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while",
  ),
  yaml: keywordSet("true false null yes no on off"),
  generic: keywordSet(
    "auto break case char const continue default do else enum extern for goto if int long register return short signed sizeof static struct switch typedef union unsigned void volatile while",
  ),
};

const syntaxTypes = keywordSet(
  "Array BigInt Boolean Date Error Function Map Math Number Object Promise Proxy Reflect RegExp Set String Symbol WeakMap WeakSet any boolean never unknown void string number object bigint",
);
const syntaxLiterals = keywordSet(
  "true false null undefined NaN Infinity None True False self Self this nil None",
);

function tokenClass(
  language: SyntaxLanguage,
  word: string,
  previous: string,
  following: string,
): string | null {
  if (syntaxKeywords[language]?.has(word)) return "text-syntax-keyword";
  if (syntaxLiterals.has(word)) return "text-syntax-literal";
  if ((language === "yaml" || language === "css") && following.trimStart().startsWith(":")) {
    return "text-syntax-attribute";
  }
  if (language === "markup" && (previous === "<" || previous === "/")) {
    return "text-syntax-keyword";
  }
  if (language === "markup" && following.trimStart().startsWith("=")) {
    return "text-syntax-attribute";
  }
  if (/^[A-Z]/u.test(word) || syntaxTypes.has(word)) return "text-syntax-type";
  if (following.trimStart().startsWith("(")) return "text-syntax-function";
  return null;
}

function markdownLine(content: string): ReactNode {
  if (/^\s{0,3}#{1,6}\s/u.test(content)) {
    return <span className="font-semibold text-brand">{content}</span>;
  }
  if (/^\s*(```|~~~)/u.test(content)) {
    return <span className="text-foreground-subtlest">{content}</span>;
  }
  const inline = /(`[^`]+`|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|\*[^*]+\*)/gu;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = inline.exec(content)) !== null) {
    if (match.index > cursor) nodes.push(content.slice(cursor, match.index));
    const token = match[0];
    const className = token.startsWith("`")
      ? "text-syntax-string"
      : token.startsWith("[")
        ? "text-brand underline underline-offset-2"
        : token.startsWith("**")
          ? "font-semibold text-brand"
          : "italic text-foreground";
    nodes.push(
      <span key={match.index} className={className}>
        {token}
      </span>,
    );
    cursor = inline.lastIndex;
  }
  if (cursor < content.length) nodes.push(content.slice(cursor));
  return nodes.length ? nodes : content;
}

const quotedStringPattern = String.raw`"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'` + "|`(?:\\.|[^`\\])*`";

function highlightedCodeLine(content: string, path: string): ReactNode {
  const language = languageInfoForPath(path).language;
  if (language === "markdown") return markdownLine(content);

  const comments: string[] = [];
  if (
    ["typescript", "javascript", "rust", "go", "java", "css", "markup", "generic"].includes(
      language,
    )
  ) {
    comments.push(String.raw`\/\/.*$`);
  }
  if (["python", "shell", "yaml"].includes(language)) comments.push(String.raw`#.*$`);
  if (
    ["typescript", "javascript", "rust", "go", "java", "css", "markup", "generic"].includes(
      language,
    )
  ) {
    comments.push(String.raw`\/\*.*?(?:\*\/|$)`);
  }
  if (language === "markup") comments.push(String.raw`<!--.*?(?:-->|$)`);
  const commentGroup = comments.length ? `(?<comment>${comments.join("|")})|` : "";
  const lexer = new RegExp(
    `(?<string>${quotedStringPattern})|${commentGroup}(?<number>\\b(?:0[xX][\\da-fA-F]+|0[bB][01]+|\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?n?)\\b)|(?<word>[$A-Za-z_][\\w$]*)`,
    "gu",
  );
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = lexer.exec(content)) !== null) {
    if (match.index > cursor) nodes.push(content.slice(cursor, match.index));
    const token = match[0];
    let className = "";
    if (match.groups?.comment) className = "text-foreground-subtlest italic";
    else if (match.groups?.string) {
      const isJsonKey =
        language === "json" && content.slice(lexer.lastIndex).trimStart().startsWith(":");
      className = isJsonKey ? "text-syntax-attribute" : "text-syntax-string";
    } else if (match.groups?.number) className = "text-syntax-number";
    else if (match.groups?.word) {
      className =
        tokenClass(
          language,
          token,
          content[match.index - 1] ?? "",
          content.slice(lexer.lastIndex),
        ) ?? "";
    }
    nodes.push(
      className ? (
        <span key={match.index} className={className}>
          {token}
        </span>
      ) : (
        token
      ),
    );
    cursor = lexer.lastIndex;
  }
  if (cursor < content.length) nodes.push(content.slice(cursor));
  return nodes.length ? nodes : content || " ";
}

function DiffLineRow({ line, path }: { line: DiffLine; path: string }) {
  const number = line.newLine ?? line.oldLine;
  const color =
    line.kind === "added"
      ? "text-diff-added-foreground"
      : line.kind === "removed"
        ? "text-diff-removed-foreground"
        : "text-foreground";
  const background =
    line.kind === "added"
      ? "bg-diff-added/45"
      : line.kind === "removed"
        ? "bg-diff-removed/45"
        : "";
  const marker = line.kind === "added" ? "+" : line.kind === "removed" ? "−" : "";
  return (
    <div className={`grid w-max min-w-full grid-cols-[3.25rem_1.5rem_auto] ${background}`}>
      <span className="select-none border-r border-border px-1 text-right text-foreground-subtlest">
        {number ?? ""}
      </span>
      <span className={`select-none text-center ${color}`}>{marker}</span>
      <code className={`whitespace-pre px-2 ${color}`}>
        {highlightedCodeLine(line.content, path)}
      </code>
    </div>
  );
}

function DiffPatch({
  patch,
  path,
  expandedFolds,
  onToggleFold,
}: {
  patch: string;
  path: string;
  expandedFolds: Set<string>;
  onToggleFold(fold: DiffFold): void;
}) {
  const entries = parseDiffPatch(patch);
  return (
    <div className="max-h-[62vh] overflow-auto bg-terminal-surface py-1 font-mono text-ui-sm leading-5">
      {entries.map((entry) => {
        if (entry.kind !== "fold")
          return (
            <DiffLineRow
              key={`${entry.oldLine}-${entry.newLine}-${entry.content}`}
              line={entry}
              path={path}
            />
          );
        const expanded = expandedFolds.has(entry.id);
        return (
          <div key={entry.id}>
            <button
              aria-expanded={expanded}
              className="flex w-full min-w-max items-center gap-2 bg-terminal-surface px-3 py-1 text-left text-ui-xs text-foreground-subtle hover:bg-hover"
              type="button"
              onClick={() => onToggleFold(entry)}
            >
              {expanded ? (
                <ChevronDown aria-hidden="true" className="size-3.5 shrink-0" />
              ) : (
                <ChevronRight aria-hidden="true" className="size-3.5 shrink-0" />
              )}
              <span>
                {entry.count} unmodified {entry.count === 1 ? "line" : "lines"}
              </span>
            </button>
            {expanded &&
              entry.lines?.map((line) => (
                <DiffLineRow
                  key={`${entry.id}-${line.oldLine}-${line.newLine}-${line.content}`}
                  line={line}
                  path={path}
                />
              ))}
          </div>
        );
      })}
    </div>
  );
}

export function ReviewPane({ workspaceId, active, refreshVersion, onRefresh }: ReviewPaneProps) {
  const source = "unstaged";
  const [snapshot, setSnapshot] = useState<WorkspaceGitReviewSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedPath, setExpandedPath] = useState<string | null>(null);
  const [diff, setDiff] = useState<WorkspaceGitReviewDiff | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffContextLines, setDiffContextLines] = useState(500);
  const [expandedFolds, setExpandedFolds] = useState<Set<string>>(() => new Set());
  const diffRequestId = useRef(0);

  useEffect(() => {
    setExpandedPath(null);
    setDiff(null);
    setDiffLoading(false);
    setDiffContextLines(500);
    setExpandedFolds(new Set());
    diffRequestId.current += 1;
    if (!active) return;
    if (!workspaceId) {
      setSnapshot(null);
      setError(null);
      setLoading(false);
      return;
    }
    const getReview = window.desktop?.getWorkspaceGitReview;
    if (!getReview) {
      setSnapshot(null);
      setError("Git review is unavailable in this application session.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setSnapshot(null);
    setError(null);
    setLoading(true);
    void getReview(workspaceId, source)
      .then((result) => {
        if (!cancelled) setSnapshot(result);
      })
      .catch(() => {
        if (!cancelled) setError("Unable to load Git changes.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active, refreshVersion, source, workspaceId]);

  const changes = snapshot?.status === "ready" ? snapshot.changes : [];

  const toggleChange = (change: WorkspaceGitReviewChange) => {
    const key = `${change.path}\0${change.originalPath ?? ""}`;
    if (expandedPath === key) {
      diffRequestId.current += 1;
      setExpandedPath(null);
      setDiff(null);
      setDiffLoading(false);
      setExpandedFolds(new Set());
      return;
    }
    const getDiff = window.desktop?.getWorkspaceGitReviewDiff;
    setExpandedPath(key);
    setDiff(null);
    setDiffContextLines(500);
    setExpandedFolds(new Set());
    if (!workspaceId || !getDiff) {
      setDiff({
        availability: "unavailable",
        patch: null,
        summary: "Git review is unavailable in this application session.",
      });
      return;
    }
    const requestId = ++diffRequestId.current;
    setDiffLoading(true);
    void getDiff(workspaceId, {
      source,
      path: change.path,
      ...(change.originalPath ? { originalPath: change.originalPath } : {}),
      kind: change.kind,
    })
      .then((result) => {
        if (requestId === diffRequestId.current) setDiff(result);
      })
      .catch(() => {
        if (requestId === diffRequestId.current) {
          setDiff({
            availability: "unavailable",
            patch: null,
            summary: "Unable to load this diff.",
          });
        }
      })
      .finally(() => {
        if (requestId === diffRequestId.current) setDiffLoading(false);
      });
  };

  const toggleFold = (fold: DiffFold) => {
    if (fold.lines) {
      setExpandedFolds((current) => {
        const next = new Set(current);
        if (next.has(fold.id)) next.delete(fold.id);
        else next.add(fold.id);
        return next;
      });
      return;
    }

    const change = changes.find(
      (candidate) => `${candidate.path}\0${candidate.originalPath ?? ""}` === expandedPath,
    );
    const getDiff = window.desktop?.getWorkspaceGitReviewDiff;
    const nextContextLines = Math.min(diffContextLines * 2, 10_000);
    if (!change || !workspaceId || !getDiff || nextContextLines === diffContextLines) return;
    const requestId = ++diffRequestId.current;
    setDiffLoading(true);
    void getDiff(workspaceId, {
      source,
      path: change.path,
      ...(change.originalPath ? { originalPath: change.originalPath } : {}),
      kind: change.kind,
      contextLines: nextContextLines,
    })
      .then((result) => {
        if (requestId !== diffRequestId.current) return;
        setDiff(result);
        setDiffContextLines(nextContextLines);
        if (result.availability === "patch") {
          setExpandedFolds((current) => new Set(current).add(fold.id));
        }
      })
      .catch(() => {
        if (requestId === diffRequestId.current) {
          setDiff({
            availability: "unavailable",
            patch: null,
            summary: "Unable to load more context for this diff.",
          });
        }
      })
      .finally(() => {
        if (requestId === diffRequestId.current) setDiffLoading(false);
      });
  };

  return (
    <section aria-label="Git review" className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <Button
          aria-label="Refresh review"
          className="ml-auto size-7 px-0"
          disabled={loading || !workspaceId}
          size="icon"
          title="Refresh review"
          type="button"
          variant="ghost"
          onClick={onRefresh}
        >
          <RefreshCw aria-hidden="true" className={`size-4${loading ? " animate-spin" : ""}`} />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {!workspaceId ? (
          <p className="p-2 text-ui-sm text-foreground-subtle">
            Open a workspace to review Git changes.
          </p>
        ) : loading && !snapshot ? (
          <p className="p-2 text-ui-sm text-foreground-subtle">Loading Git changes…</p>
        ) : error ? (
          <p role="alert" className="p-2 text-ui-sm text-destructive">
            {error}
          </p>
        ) : snapshot?.status === "git-unavailable" ? (
          <p className="p-2 text-ui-sm text-foreground-subtle">Git is not installed.</p>
        ) : snapshot?.status === "not-repository" ? (
          <p className="p-2 text-ui-sm text-foreground-subtle">
            This workspace is not a Git repository.
          </p>
        ) : changes.length === 0 ? (
          <p className="p-2 text-ui-sm text-foreground-subtle">
            {loading ? "Refreshing Git changes…" : "No unstaged changes."}
          </p>
        ) : (
          <div className="space-y-0.5">
            {changes.map((change) => {
              const key = `${change.path}\0${change.originalPath ?? ""}`;
              const expanded = expandedPath === key;
              return (
                <div
                  key={key}
                  className="overflow-hidden rounded-xl border border-card-border bg-card"
                >
                  <button
                    aria-expanded={expanded}
                    className="flex w-full min-w-0 items-center gap-2 px-2 py-2 text-left hover:bg-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
                    type="button"
                    onClick={() => toggleChange(change)}
                  >
                    {expanded ? (
                      <ChevronDown
                        aria-hidden="true"
                        className="size-3.5 shrink-0 text-foreground-subtlest"
                      />
                    ) : (
                      <ChevronRight
                        aria-hidden="true"
                        className="size-3.5 shrink-0 text-foreground-subtlest"
                      />
                    )}
                    <LanguageIcon path={change.path} />
                    <span className="min-w-0 flex-1">
                      {change.originalPath && (
                        <span className="block truncate text-ui-xs text-foreground-subtlest">
                          {change.originalPath} →
                        </span>
                      )}
                      <span className="block truncate text-ui-sm text-foreground">
                        {change.path}
                      </span>
                    </span>
                    {change.kind !== "modified" && (
                      <span className="shrink-0 text-ui-xs text-foreground-subtlest">
                        {changeLabel(change.kind)}
                      </span>
                    )}
                    {change.added !== null && (
                      <span className="shrink-0 font-mono text-ui-xs text-diff-added-foreground">
                        +{change.added}
                      </span>
                    )}
                    {change.removed !== null && (
                      <span className="shrink-0 font-mono text-ui-xs text-diff-removed-foreground">
                        −{change.removed}
                      </span>
                    )}
                  </button>
                  {expanded && (
                    <div className="border-t border-border">
                      {diffLoading ? (
                        <p className="p-2 text-ui-xs text-foreground-subtlest">Loading diff…</p>
                      ) : diff?.availability === "patch" && diff.patch ? (
                        <DiffPatch
                          expandedFolds={expandedFolds}
                          patch={diff.patch}
                          path={change.path}
                          onToggleFold={toggleFold}
                        />
                      ) : diff?.summary ? (
                        <p className="p-2 text-ui-xs text-foreground-subtle">{diff.summary}</p>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
