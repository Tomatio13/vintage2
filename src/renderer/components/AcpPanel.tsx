import { acpForkRequests } from "../lib/sessionLaunch.js";
import type { AcpForkSource } from "../../shared/acp.js";
import {
  ArrowDown,
  ArrowUp,
  Bot,
  Brain,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Code2,
  Copy,
  Eye,
  FileCode2,
  FileEdit,
  Globe,
  ListTodo,
  Paperclip,
  RotateCcw,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Square,
  Star,
  TerminalSquare,
  Wrench,
  X,
} from "lucide-react";
import {
  isValidElement,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import {
  DEFAULT_ACP_PROFILES,
  DEFAULT_ACP_SETTINGS,
  type AcpAgentProfile,
  type AcpConversationMessage,
  type AcpModelOption,
  type AcpPermissionPolicy,
  type AcpPermissionRequest,
  type AcpPlanEntry,
  type AcpPromptImage,
  type AcpSessionSnapshot,
  type AcpSettings,
  type AcpSkillItem,
  type AcpSlashCommand,
  type AcpToolCallItem,
} from "../../shared/acp.js";
import {
  DEFAULT_TERMINAL_MONITOR_MODE,
  type AttentionLevel,
  type TerminalAttentionState,
} from "../../shared/desktop.js";
import { useUiStore } from "../store/uiStore.js";
import { Button } from "./Button.js";

const FAVORITES_STORAGE_KEY = "vintage:acp-favorite-models";

function loadFavoriteModels(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string").slice(0, 64)
      : [];
  } catch {
    return [];
  }
}

function saveFavoriteModels(favorites: string[]): void {
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
  } catch {
    /* ignore */
  }
}

function profileBadgeStyle(profileId: string): string {
  if (profileId === "codex") return "bg-cyan-500/15 text-cyan-500 border-cyan-500/30";
  if (profileId === "claude") return "bg-amber-500/15 text-amber-500 border-amber-500/30";
  if (profileId === "opencode") return "bg-emerald-500/15 text-emerald-500 border-emerald-500/30";
  if (profileId === "zai") return "bg-indigo-500/15 text-indigo-400 border-indigo-500/30";
  if (profileId === "antigravity") return "bg-violet-500/15 text-violet-500 border-violet-500/30";
  return "bg-brand/15 text-brand border-brand/30";
}

function permissionPolicyLabel(policy: AcpPermissionPolicy): string {
  if (policy === "auto_all") return "フルアクセス";
  if (policy === "auto_edit") return "Auto-Edit";
  return "Standard (Ask)";
}

function skillScopeLabel(scope: AcpSkillItem["scope"], compact = false): string {
  if (scope === "project") return compact ? "プロジェクト" : "プロジェクト";
  if (scope === "app") return compact ? "アプリ" : "アプリのスキル";
  return compact ? "個人" : "個人のスキル";
}

interface ComposerMenuItem {
  id: string;
  label: string;
  description: string;
  badge?: string;
  kind: "client-command" | "agent-command" | "skill";
  insertText?: string;
  action?: "model" | "clear" | "settings" | "relay";
}

const BUILTIN_SLASH_COMMANDS: readonly ComposerMenuItem[] = [
  {
    id: "builtin:model",
    label: "/model",
    description: "このペインのモデル・プロバイダーを切り替え",
    kind: "client-command",
    action: "model",
  },
  {
    id: "builtin:clear",
    label: "/clear",
    description: "新しいセッションを開始します",
    kind: "client-command",
    action: "clear",
  },
  {
    id: "builtin:relay",
    label: "/relay",
    description: "会話を別Spaceに引き継ぐ",
    kind: "client-command",
    action: "relay",
  },
  {
    id: "builtin:settings",
    label: "/settings",
    description: "ACP Agents 設定を開く",
    kind: "client-command",
    action: "settings",
  },
];

function detectComposerTrigger(
  text: string,
  caret: number,
): { mode: "slash" | "skill" | "file"; query: string; start: number; end: number } | null {
  const before = text.slice(0, caret);
  const slashMatch = /^\/([^\s]*)$/.exec(before);
  if (slashMatch) {
    return {
      mode: "slash",
      query: slashMatch[1] ?? "",
      start: 0,
      end: caret,
    };
  }
  const skillMatch = /(^|\s)\$([^\s]*)$/.exec(before);
  if (skillMatch) {
    const start = before.length - (skillMatch[2]?.length ?? 0) - 1;
    return {
      mode: "skill",
      query: skillMatch[2] ?? "",
      start,
      end: caret,
    };
  }
  const fileMatch = /(^|\s)@([^\s]*)$/.exec(before);
  if (fileMatch) {
    const start = before.length - (fileMatch[2]?.length ?? 0) - 1;
    return {
      mode: "file",
      query: fileMatch[2] ?? "",
      start,
      end: caret,
    };
  }
  return null;
}

function formatTokenCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${Math.round(count / 1_000)}k`;
  return String(count);
}

function formatElapsedSeconds(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  if (totalSec < 60) return `${totalSec}s`;
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}m ${secs}s`;
}

async function readImageFileAsAttachment(file: File): Promise<AcpPromptImage | null> {
  if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) return null;
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const commaIdx = result.indexOf(",");
      if (commaIdx === -1) return resolve(null);
      resolve({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name || "pasted-image.png",
        mimeType: file.type || "image/png",
        dataBase64: result.slice(commaIdx + 1),
      });
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

const MAX_CACHED_ACP_IMAGES = 64;
const resolvedAcpImageCache = new Map<string, string>();

function cacheAcpImage(key: string, dataUrl: string): void {
  if (resolvedAcpImageCache.has(key)) {
    resolvedAcpImageCache.delete(key);
  } else if (resolvedAcpImageCache.size >= MAX_CACHED_ACP_IMAGES) {
    const oldest = resolvedAcpImageCache.keys().next().value;
    if (oldest !== undefined) resolvedAcpImageCache.delete(oldest);
  }
  resolvedAcpImageCache.set(key, dataUrl);
}

const AcpMarkdownImage = memo(function AcpMarkdownImage({
  src,
  alt,
  workspaceId,
  onZoom,
}: {
  src?: string | undefined;
  alt?: string | undefined;
  workspaceId: string;
  onZoom: (url: string, label: string) => void;
}) {
  const cacheKey = src ? `${workspaceId}:${src}` : "";
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(() => {
    if (!src) return null;
    if (/^(?:https?:|data:image\/)/i.test(src)) return src;
    return resolvedAcpImageCache.get(cacheKey) ?? null;
  });
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!src) return;
    if (/^(?:https?:|data:image\/)/i.test(src)) {
      setResolvedSrc(src);
      setFailed(false);
      return;
    }
    const cached = resolvedAcpImageCache.get(cacheKey);
    if (cached) {
      setResolvedSrc(cached);
      setFailed(false);
      return;
    }
    let cancelled = false;
    setFailed(false);
    void window.desktop
      ?.readAcpImage(workspaceId, src)
      .then((dataUrl) => {
        if (cancelled) return;
        if (dataUrl) {
          cacheAcpImage(cacheKey, dataUrl);
          setResolvedSrc(dataUrl);
        } else {
          setFailed(true);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [src, workspaceId, cacheKey]);

  if (!src) return null;
  if (failed) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 font-mono text-ui-xs text-foreground-subtle">
        {alt || src}
      </span>
    );
  }
  if (!resolvedSrc) {
    return (
      <span className="inline-block h-24 w-36 animate-pulse rounded-lg border border-border bg-surface" />
    );
  }
  return (
    <button
      type="button"
      onClick={() => onZoom(resolvedSrc, alt || src)}
      className="my-2 block overflow-hidden rounded-xl border border-border bg-surface transition-opacity hover:opacity-95"
      title="Click to enlarge image"
    >
      <img
        src={resolvedSrc}
        alt={alt || "Image"}
        className="max-h-80 max-w-full object-contain"
        onError={() => setFailed(true)}
      />
    </button>
  );
});

const AcpHtmlPreviewBlock = memo(function AcpHtmlPreviewBlock({
  code,
  language,
  streaming,
}: {
  code: string;
  language: "html" | "svg";
  streaming: boolean;
}) {
  const [view, setView] = useState<"preview" | "code">(streaming ? "code" : "preview");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!streaming) setView("preview");
  }, [streaming]);

  const srcDoc = useMemo(() => {
    if (language === "svg") {
      return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:12px;display:flex;align-items:center;justify-content:center;min-height:100vh;box-sizing:border-box;background:#ffffff;color:#111827;}svg{max-width:100%;height:auto;}</style></head><body>${code}</body></html>`;
    }
    return code;
  }, [code, language]);

  return (
    <div
      data-testid="acp-html-preview"
      className="my-2.5 overflow-hidden rounded-xl border border-border bg-panel"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border bg-header px-3 py-1.5 text-ui-xs text-foreground-subtle">
        <span className="font-mono font-medium uppercase">{language}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setView("preview")}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-ui-xs transition-colors ${
              view === "preview"
                ? "bg-selected font-medium text-foreground"
                : "hover:bg-hover hover:text-foreground"
            }`}
          >
            <Eye className="size-3" />
            Preview
          </button>
          <button
            type="button"
            onClick={() => setView("code")}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-ui-xs transition-colors ${
              view === "code"
                ? "bg-selected font-medium text-foreground"
                : "hover:bg-hover hover:text-foreground"
            }`}
          >
            <Code2 className="size-3" />
            Code
          </button>
          <button
            type="button"
            aria-label={`Copy ${language}`}
            onClick={() => {
              void window.desktop?.writeClipboardText(code).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              });
            }}
            className="grid size-6 place-items-center rounded-md hover:bg-hover hover:text-foreground"
          >
            {copied ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
          </button>
        </div>
      </div>
      {view === "preview" ? (
        <iframe
          title={`${language.toUpperCase()} preview`}
          sandbox="allow-scripts"
          srcDoc={srcDoc}
          className="h-72 w-full resize-y border-0 bg-white"
        />
      ) : (
        <pre className="max-h-72 overflow-auto p-3 font-mono text-ui-xs leading-relaxed text-foreground">
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
});

function extractCodeBlock(children: ReactNode): { language: string; code: string } | null {
  if (!isValidElement<{ className?: string; children?: ReactNode }>(children)) return null;
  const className = typeof children.props.className === "string" ? children.props.className : "";
  const match = /language-([a-z0-9_-]+)/i.exec(className);
  if (!match) return null;
  const raw = children.props.children;
  const code = Array.isArray(raw) ? raw.join("") : typeof raw === "string" ? raw : "";
  return { language: match[1]!.toLowerCase(), code: code.replace(/\n$/, "") };
}

function buildMarkdownComponents({
  workspaceId,
  streaming,
  onOpenFile,
  onZoomImage,
}: {
  workspaceId: string;
  streaming: boolean;
  onOpenFile?: ((path: string, line?: number) => void) | undefined;
  onZoomImage: (url: string, label: string) => void;
}): Components {
  return {
    p: ({ children }) => <p className="my-2.5 first:mt-0 last:mb-0">{children}</p>,
    h1: ({ children }) => (
      <h1 className="mb-2.5 mt-5 text-ui-xl font-semibold first:mt-0">{children}</h1>
    ),
    h2: ({ children }) => (
      <h2 className="mb-2 mt-4 text-ui-lg font-semibold first:mt-0">{children}</h2>
    ),
    h3: ({ children }) => (
      <h3 className="mb-1.5 mt-3 text-ui-base font-semibold first:mt-0">{children}</h3>
    ),
    ul: ({ children }) => <ul className="my-2.5 list-disc space-y-1 pl-5">{children}</ul>,
    ol: ({ children }) => <ol className="my-2.5 list-decimal space-y-1 pl-5">{children}</ol>,
    blockquote: ({ children }) => (
      <blockquote className="my-2.5 border-l-2 border-border pl-3 text-foreground-subtle">
        {children}
      </blockquote>
    ),
    pre: ({ children }) => {
      const block = extractCodeBlock(children);
      if (
        block &&
        (block.language === "html" || block.language === "htm" || block.language === "svg")
      ) {
        return (
          <AcpHtmlPreviewBlock
            code={block.code}
            language={block.language === "svg" ? "svg" : "html"}
            streaming={streaming}
          />
        );
      }
      return (
        <pre
          data-theme-chat-code
          className="my-2.5 overflow-x-auto rounded-lg border border-border bg-panel p-3 font-mono text-ui-sm leading-relaxed [&>code]:whitespace-pre [&>code]:border-0 [&>code]:bg-transparent [&>code]:p-0"
        >
          {children}
        </pre>
      );
    },
    code: ({ children }) => (
      <code
        data-theme-chat-code
        className="rounded border border-border bg-panel px-1 py-0.5 font-mono text-ui-sm"
      >
        {children}
      </code>
    ),
    table: ({ children }) => (
      <div className="my-2.5 overflow-x-auto">
        <table className="w-full border-collapse text-left text-ui-sm">{children}</table>
      </div>
    ),
    th: ({ children }) => (
      <th className="border border-border bg-panel px-3 py-1.5 font-semibold">{children}</th>
    ),
    td: ({ children }) => (
      <td className="border border-border px-3 py-1.5 align-top">{children}</td>
    ),
    img: ({ src, alt }) => (
      <AcpMarkdownImage src={src} alt={alt} workspaceId={workspaceId} onZoom={onZoomImage} />
    ),
    a: ({ href, children }) => (
      <a
        href={href && /^https?:\/\//i.test(href) ? href : undefined}
        className="cursor-pointer text-brand underline underline-offset-2"
        onClick={(event) => {
          event.preventDefault();
          if (!href) return;
          if (/^https?:\/\//i.test(href)) {
            void window.desktop?.openExternal(href).catch(() => {});
          } else if (onOpenFile) {
            const cleaned = href.replace(/^file:\/\//i, "").split("#")[0] ?? href;
            onOpenFile(cleaned);
          }
        }}
      >
        {children}
      </a>
    ),
  };
}

const remarkPlugins = [remarkGfm];

const AcpThoughtBlock = memo(function AcpThoughtBlock({
  thought,
  streaming,
}: {
  thought: string;
  streaming: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!thought.trim()) return null;
  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="flex min-h-6 w-full items-center gap-1.5 rounded-md px-0.5 text-left text-ui-xs font-medium text-foreground-subtle transition-colors hover:text-foreground"
      >
        {expanded ? (
          <ChevronDown className="size-3.5 shrink-0" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0" />
        )}
        <Brain className={`size-3.5 shrink-0 ${streaming ? "animate-pulse text-brand" : ""}`} />
        <span>{streaming ? "Thinking…" : "Thought process"}</span>
      </button>
      {expanded && (
        <pre className="ml-2 mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap border-l border-border/70 pl-3 font-mono text-ui-xs leading-relaxed text-foreground-subtle">
          {thought}
        </pre>
      )}
    </div>
  );
});

function toolKindIcon(kind: AcpToolCallItem["kind"]) {
  if (kind === "edit" || kind === "delete" || kind === "move") return FileEdit;
  if (kind === "read") return FileCode2;
  if (kind === "execute") return TerminalSquare;
  if (kind === "search") return Search;
  if (kind === "fetch") return Globe;
  return Wrench;
}

function summarizeToolCalls(toolCalls: readonly AcpToolCallItem[]): string {
  if (toolCalls.length === 1) {
    return toolCalls[0]!.title;
  }
  const counts = new Map<string, number>();
  for (const tool of toolCalls) {
    const label =
      tool.kind === "search"
        ? "Search"
        : tool.kind === "fetch"
          ? "Fetch"
          : tool.kind === "read"
            ? "Read"
            : tool.kind === "edit" || tool.kind === "delete" || tool.kind === "move"
              ? "Edit"
              : tool.kind === "execute"
                ? "Command"
                : "Tool";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const parts = [...counts.entries()].map(([label, count]) => `${label} ${count}`);
  return `${toolCalls.length} steps (${parts.join(" · ")})`;
}

const AcpWorkLogEntry = memo(function AcpWorkLogEntry({
  toolCall,
  onOpenFile,
}: {
  toolCall: AcpToolCallItem;
  onOpenFile?: ((path: string, line?: number) => void) | undefined;
}) {
  const [expanded, setExpanded] = useState(toolCall.status === "failed");
  const hasDetails = toolCall.content.length > 0;
  const Icon = toolKindIcon(toolCall.kind);
  const isRunning = toolCall.status === "pending" || toolCall.status === "in_progress";
  const isFailed = toolCall.status === "failed";

  return (
    <div className="min-w-0">
      <div className="flex min-h-6 items-center gap-1.5 rounded-md px-1 hover:bg-hover/50">
        <button
          type="button"
          disabled={!hasDetails}
          onClick={() => hasDetails && setExpanded((current) => !current)}
          className={`flex min-w-0 flex-1 items-center gap-1.5 text-left text-ui-xs ${
            isFailed ? "text-destructive" : isRunning ? "text-foreground" : "text-foreground-subtle"
          } ${hasDetails ? "cursor-pointer hover:text-foreground" : "cursor-default"}`}
        >
          <Icon
            className={`size-3 shrink-0 ${
              isFailed ? "text-destructive" : isRunning ? "animate-pulse text-brand" : ""
            }`}
          />
          <span className="truncate">{toolCall.title}</span>
          {hasDetails &&
            (expanded ? (
              <ChevronDown className="size-3 shrink-0 opacity-60" />
            ) : (
              <ChevronRight className="size-3 shrink-0 opacity-60" />
            ))}
        </button>
        <div className="flex shrink-0 items-center gap-1">
          {toolCall.kind !== "execute" &&
            toolCall.locations.map((loc, idx) => (
              <button
                key={`${loc.path}:${idx}`}
                type="button"
                onClick={() => onOpenFile?.(loc.path, loc.line)}
                className="max-w-36 truncate rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[11px] text-brand hover:bg-hover"
                title={`Open ${loc.path}${loc.line ? `:${loc.line}` : ""}`}
              >
                {loc.path.split("/").at(-1)}
                {loc.line ? `:${loc.line}` : ""}
              </button>
            ))}
          {isFailed && (
            <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-[11px] font-medium text-destructive">
              Failed
            </span>
          )}
          {isRunning && (
            <span className="size-1.5 animate-pulse rounded-full bg-brand" aria-label="Running" />
          )}
        </div>
      </div>
      {expanded && hasDetails && (
        <div className="my-1.5 ml-4 space-y-2 border-l border-border/70 pl-2.5">
          {toolCall.content.map((block, index) => {
            if (block.type === "text") {
              return (
                <pre
                  key={index}
                  className="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-panel p-2.5 font-mono text-ui-xs text-foreground"
                >
                  {block.text}
                </pre>
              );
            }
            if (block.type === "diff") {
              return (
                <div
                  key={index}
                  className="overflow-hidden rounded-lg border border-border bg-panel"
                >
                  <div className="flex items-center justify-between border-b border-border px-2.5 py-1 font-mono text-ui-xs text-foreground-subtle">
                    <span>{block.path}</span>
                    {onOpenFile && (
                      <button
                        type="button"
                        onClick={() => onOpenFile(block.path)}
                        className="text-brand hover:underline"
                      >
                        Open file
                      </button>
                    )}
                  </div>
                  <div className="max-h-56 overflow-auto p-2 font-mono text-ui-xs">
                    {block.oldText && (
                      <pre className="whitespace-pre-wrap bg-diff-removed px-2 py-1 text-diff-removed-foreground">
                        - {block.oldText}
                      </pre>
                    )}
                    <pre className="whitespace-pre-wrap bg-diff-added px-2 py-1 text-diff-added-foreground">
                      + {block.newText}
                    </pre>
                  </div>
                </div>
              );
            }
            if (block.type === "terminal") {
              return (
                <div
                  key={index}
                  className="overflow-hidden rounded-lg border border-border bg-terminal text-foreground"
                >
                  <div className="flex items-center justify-between border-b border-border bg-header px-2.5 py-1 font-mono text-ui-xs text-foreground-subtle">
                    <span className="truncate">$ {block.command ?? block.terminalId}</span>
                    {block.exitCode !== undefined && block.exitCode !== null && (
                      <span>exit {block.exitCode}</span>
                    )}
                  </div>
                  {block.output && (
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap p-2.5 font-mono text-ui-xs">
                      {block.output}
                    </pre>
                  )}
                </div>
              );
            }
            return null;
          })}
        </div>
      )}
    </div>
  );
});

const AcpToolWorkGroup = memo(function AcpToolWorkGroup({
  toolCalls,
  onOpenFile,
}: {
  toolCalls: readonly AcpToolCallItem[];
  onOpenFile?: ((path: string, line?: number) => void) | undefined;
}) {
  const hasFailed = toolCalls.some((tool) => tool.status === "failed");
  const activeTool = [...toolCalls]
    .reverse()
    .find((tool) => tool.status === "in_progress" || tool.status === "pending");
  const [expanded, setExpanded] = useState(hasFailed);

  if (toolCalls.length === 0) return null;

  const SummaryIcon = activeTool ? toolKindIcon(activeTool.kind) : Wrench;
  const summaryLabel = activeTool
    ? `${activeTool.title}${toolCalls.length > 1 ? ` (${toolCalls.length} steps)` : ""}`
    : summarizeToolCalls(toolCalls);

  return (
    <div className="mb-2" data-testid="acp-work-group">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
        className="flex min-h-6 w-full items-center gap-1.5 rounded-md px-0.5 text-left text-ui-xs text-foreground-subtle transition-colors hover:text-foreground"
      >
        {expanded ? (
          <ChevronDown className="size-3.5 shrink-0" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0" />
        )}
        <SummaryIcon
          className={`size-3.5 shrink-0 ${
            hasFailed ? "text-destructive" : activeTool ? "animate-pulse text-brand" : ""
          }`}
        />
        <span className="min-w-0 flex-1 truncate">{summaryLabel}</span>
        {hasFailed && (
          <span className="shrink-0 rounded bg-destructive/15 px-1.5 py-0.5 text-[11px] font-medium text-destructive">
            Failed
          </span>
        )}
      </button>
      {expanded && (
        <div className="ml-2 mt-1 flex flex-col gap-0.5 border-l border-border/70 pl-2">
          {toolCalls.map((tool) => (
            <AcpWorkLogEntry key={tool.toolCallId} toolCall={tool} onOpenFile={onOpenFile} />
          ))}
        </div>
      )}
    </div>
  );
});

const AcpMessageRow = memo(function AcpMessageRow({
  message,
  workspaceId,
  profileBadge,
  profileName,
  profileId,
  modelLabel,
  onOpenFile,
  onZoomImage,
}: {
  message: AcpConversationMessage;
  workspaceId: string;
  profileBadge: string;
  profileName: string;
  profileId: string;
  modelLabel?: string | undefined;
  onOpenFile?: ((path: string, line?: number) => void) | undefined;
  onZoomImage: (url: string, label: string) => void;
}) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);
  const onOpenFileRef = useRef(onOpenFile);
  const onZoomImageRef = useRef(onZoomImage);
  onOpenFileRef.current = onOpenFile;
  onZoomImageRef.current = onZoomImage;

  const components = useMemo(
    () =>
      buildMarkdownComponents({
        workspaceId,
        streaming: message.streaming,
        onOpenFile: (path, line) => onOpenFileRef.current?.(path, line),
        onZoomImage: (url, label) => onZoomImageRef.current(url, label),
      }),
    [workspaceId, message.streaming],
  );

  return (
    <article
      className={`group flex min-w-0 gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}
      aria-label={`${isUser ? "You" : profileName} message`}
    >
      {!isUser && (
        <span
          aria-hidden="true"
          className={`mt-1 flex size-7 shrink-0 items-center justify-center rounded-lg border font-mono text-ui-xs font-semibold ${profileBadgeStyle(profileId)}`}
        >
          {profileBadge}
        </span>
      )}
      <div className={`min-w-0 ${isUser ? "max-w-[88%]" : "flex-1"}`}>
        <div
          className={`mb-1 flex items-center gap-1.5 ${isUser ? "justify-end" : "justify-start"}`}
        >
          <span className="shrink-0 text-ui-xs font-medium text-foreground-subtle">
            {isUser ? "You" : profileName}
          </span>
          {!isUser && modelLabel && (
            <span className="truncate font-mono text-ui-xs text-foreground-subtlest">
              · {modelLabel}
            </span>
          )}
        </div>
        {!isUser && <AcpThoughtBlock thought={message.thought} streaming={message.streaming} />}
        {!isUser && <AcpToolWorkGroup toolCalls={message.toolCalls} onOpenFile={onOpenFile} />}
        {(message.text ||
          (message.images && message.images.length > 0) ||
          isUser ||
          (message.streaming && message.toolCalls.length === 0)) && (
          <div
            data-theme-user-message={isUser ? "" : undefined}
            className={`min-w-0 break-words text-ui-base leading-relaxed [overflow-wrap:anywhere] ${
              isUser
                ? "rounded-2xl rounded-tr-sm border border-border bg-selected px-4 py-2.5 text-foreground"
                : "text-foreground"
            }`}
          >
            {isUser ? (
              <div className="space-y-2">
                {message.images && message.images.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {message.images.map((img) => {
                      const url = `data:${img.mimeType};base64,${img.dataBase64}`;
                      return (
                        <button
                          key={img.id}
                          type="button"
                          onClick={() => onZoomImage(url, img.name)}
                          className="overflow-hidden rounded-lg border border-border"
                        >
                          <img
                            src={url}
                            alt={img.name}
                            className="max-h-32 max-w-44 object-cover"
                          />
                        </button>
                      );
                    })}
                  </div>
                )}
                {message.text && <p className="whitespace-pre-wrap">{message.text}</p>}
              </div>
            ) : (
              <>
                {message.images && message.images.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {message.images.map((img) => {
                      const url = `data:${img.mimeType};base64,${img.dataBase64}`;
                      return (
                        <button
                          key={img.id}
                          type="button"
                          onClick={() => onZoomImage(url, img.name)}
                          className="overflow-hidden rounded-xl border border-border bg-surface"
                        >
                          <img
                            src={url}
                            alt={img.name}
                            className="max-h-72 max-w-full object-contain"
                          />
                        </button>
                      );
                    })}
                  </div>
                )}
                <ReactMarkdown skipHtml remarkPlugins={remarkPlugins} components={components}>
                  {message.text}
                </ReactMarkdown>
                {message.streaming && <span className="streaming-caret" />}
              </>
            )}
          </div>
        )}
        {message.text && (
          <div
            className={`mt-1 flex h-6 items-center gap-2 ${isUser ? "justify-end" : "justify-start"}`}
          >
            <button
              type="button"
              aria-label="Copy message"
              title="Copy message"
              onClick={() => {
                void window.desktop?.writeClipboardText(message.text).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1800);
                });
              }}
              className="grid size-6 place-items-center rounded-md text-foreground-subtle opacity-0 transition-opacity hover:bg-hover hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
            >
              {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
            </button>
          </div>
        )}
      </div>
    </article>
  );
});

function AcpPlanCard({ entries }: { entries: readonly AcpPlanEntry[] }) {
  const [expanded, setExpanded] = useState(true);
  if (entries.length === 0) return null;
  const completedCount = entries.filter((entry) => entry.status === "completed").length;

  return (
    <div
      data-testid="acp-plan-card"
      className="mx-auto mb-2 w-full max-w-3xl overflow-hidden rounded-xl border border-border bg-surface/60"
    >
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-ui-xs font-medium text-foreground-subtle hover:text-foreground"
      >
        <span className="flex items-center gap-1.5">
          {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          <ListTodo className="size-3.5 text-brand" />
          <span>Plan</span>
        </span>
        <span className="font-mono text-[11px] text-foreground-subtlest">
          {completedCount}/{entries.length}
        </span>
      </button>
      {expanded && (
        <ul className="space-y-1 border-t border-border/70 px-3 py-2">
          {entries.map((entry, idx) => (
            <li key={`${idx}:${entry.content}`} className="flex items-start gap-2 text-ui-xs">
              {entry.status === "completed" ? (
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />
              ) : entry.status === "in_progress" ? (
                <Circle className="mt-0.5 size-3.5 shrink-0 animate-pulse fill-brand/30 text-brand" />
              ) : (
                <Circle className="mt-0.5 size-3.5 shrink-0 text-foreground-subtlest" />
              )}
              <span
                className={
                  entry.status === "completed"
                    ? "text-foreground-subtlest line-through"
                    : entry.status === "in_progress"
                      ? "font-medium text-foreground"
                      : "text-foreground-subtle"
                }
              >
                {entry.content}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AcpPermissionBanner({
  request,
  onRespond,
}: {
  request: AcpPermissionRequest;
  onRespond: (requestId: string, optionId: string) => void;
}) {
  return (
    <div
      role="alertdialog"
      aria-label="Permission request"
      className="mx-auto my-3 w-full max-w-3xl overflow-hidden rounded-xl border border-border bg-interaction-confirmation-surface p-3.5 text-interaction-confirmation-foreground shadow-md"
    >
      <div className="flex items-start gap-2.5">
        <ShieldAlert className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-ui-sm font-semibold">
            Permission required · {request.toolCall.title}
          </div>
          {request.toolCall.locations.length > 0 && (
            <div className="mt-1 truncate font-mono text-ui-xs opacity-90">
              {request.toolCall.locations.map((loc) => loc.path).join(", ")}
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {request.options.map((option) => {
              const isAllow = option.kind.startsWith("allow");
              return (
                <Button
                  key={option.optionId}
                  type="button"
                  size="compact"
                  variant={isAllow ? "primary" : "outline"}
                  onClick={() => onRespond(request.requestId, option.optionId)}
                >
                  {option.name}
                </Button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function AcpModelPopover({
  open,
  onClose,
  profiles,
  currentProfileId,
  currentModelId,
  currentReasoningId,
  permissionPolicy,
  availableModels,
  availableReasoning,
  onSelectConfig,
  onOpenSettings,
}: {
  open: boolean;
  onClose: () => void;
  profiles: AcpAgentProfile[];
  currentProfileId: string;
  currentModelId: string;
  currentReasoningId: string;
  permissionPolicy: AcpPermissionPolicy;
  availableModels: AcpModelOption[];
  availableReasoning: { id: string; name: string }[];
  onSelectConfig: (patch: {
    profileId?: string;
    modelId?: string;
    reasoningId?: string;
    permissionPolicy?: AcpPermissionPolicy;
  }) => void;
  onOpenSettings: () => void;
}) {
  const [activeTab, setActiveTab] = useState<string>(currentProfileId);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAllModels, setShowAllModels] = useState(false);
  const [favorites, setFavorites] = useState<string[]>(loadFavoriteModels);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setActiveTab(currentProfileId);
      setSearchQuery("");
      setShowAllModels(false);
    }
  }, [open, currentProfileId]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const toggleFavorite = (profileId: string, modelId: string) => {
    const key = `${profileId}:${modelId}`;
    const next = favorites.includes(key)
      ? favorites.filter((item) => item !== key)
      : [...favorites, key];
    setFavorites(next);
    saveFavoriteModels(next);
  };

  const selectedProfile =
    profiles.find((p) => p.id === (activeTab === "favorites" ? currentProfileId : activeTab)) ??
    profiles[0]!;

  const modelsForView: Array<{ profile: AcpAgentProfile; model: AcpModelOption }> =
    activeTab === "favorites"
      ? favorites.flatMap((favKey) => {
          const separator = favKey.indexOf(":");
          if (separator < 0) return [];
          const profId = favKey.slice(0, separator);
          const modId = favKey.slice(separator + 1);
          const prof = profiles.find((p) => p.id === profId);
          if (!prof) return [];
          const pool = prof.id === currentProfileId ? availableModels : prof.models;
          const mod = pool.find((m) => m.id === modId) ?? prof.models.find((m) => m.id === modId);
          return mod ? [{ profile: prof, model: mod }] : [];
        })
      : (selectedProfile.id === currentProfileId && availableModels.length > 0
          ? availableModels
          : selectedProfile.models
        ).map((model) => ({ profile: selectedProfile, model }));

  const filteredModels = modelsForView.filter(({ model, profile }) =>
    `${model.name} ${model.id} ${model.description ?? ""} ${profile.name}`
      .toLowerCase()
      .includes(searchQuery.trim().toLowerCase()),
  );

  const INITIAL_VISIBLE_COUNT = 12;
  const isSearching = searchQuery.trim().length > 0;
  const canCollapseList =
    !isSearching && activeTab !== "favorites" && filteredModels.length > INITIAL_VISIBLE_COUNT;
  const visibleModels =
    canCollapseList && !showAllModels
      ? filteredModels.slice(0, INITIAL_VISIBLE_COUNT)
      : filteredModels;
  const hiddenModelCount = Math.max(0, filteredModels.length - visibleModels.length);

  const reasoningList =
    selectedProfile.id === currentProfileId && availableReasoning.length > 0
      ? availableReasoning
      : selectedProfile.reasoningLevels;

  const activeModelObj =
    availableModels.find((m) => m.id === currentModelId) ??
    selectedProfile.models.find((m) => m.id === currentModelId);

  const nextPermissionPolicy = (): AcpPermissionPolicy => {
    if (permissionPolicy === "ask") return "auto_edit";
    if (permissionPolicy === "auto_edit") return "auto_all";
    return "ask";
  };

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="ACP Provider, Model and Reasoning selector"
      data-testid="acp-model-popover"
      className=" absolute bottom-full right-0 z-50 mb-2 flex w-[min(36rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-popover-border bg-popover text-foreground shadow-md"
    >
      <div className="flex min-h-72 divide-x divide-border">
        {/* Left rail: Favorites star + Provider icons */}
        <div className="flex w-12 shrink-0 flex-col items-center gap-1.5 bg-surface/50 py-2.5">
          <button
            type="button"
            aria-label="Favorite models"
            aria-pressed={activeTab === "favorites"}
            onClick={() => setActiveTab("favorites")}
            title="Favorites"
            className={`grid size-8 place-items-center rounded-lg transition-colors ${
              activeTab === "favorites"
                ? "bg-selected text-brand"
                : "text-foreground-subtle hover:bg-hover hover:text-foreground"
            }`}
          >
            <Star className="size-4 fill-current" />
          </button>
          <div className="my-0.5 h-px w-6 bg-border" />
          {profiles.map((profile) => {
            const active = activeTab === profile.id;
            return (
              <button
                key={profile.id}
                type="button"
                aria-label={`Provider ${profile.name}`}
                aria-pressed={active}
                title={profile.name}
                onClick={() => {
                  setActiveTab(profile.id);
                  setShowAllModels(false);
                }}
                className={`relative grid size-8 place-items-center rounded-lg font-mono text-ui-xs font-semibold transition-colors ${
                  active
                    ? "bg-selected text-foreground ring-1 ring-brand"
                    : "text-foreground-subtle hover:bg-hover hover:text-foreground"
                }`}
              >
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute -right-1.5 top-1.5 h-5 w-0.5 rounded-full bg-brand"
                  />
                )}
                {profile.badge}
              </button>
            );
          })}
          <button
            type="button"
            aria-label="Configure ACP providers"
            title="Configure ACP providers in Settings"
            onClick={() => {
              onClose();
              onOpenSettings();
            }}
            className="mt-auto grid size-8 place-items-center rounded-lg text-foreground-subtlest hover:bg-hover hover:text-foreground"
          >
            <Settings className="size-4" />
          </button>
        </div>

        {/* Center column: Search + Model list */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
            <Search className="size-3.5 shrink-0 text-foreground-subtlest" />
            <input
              type="text"
              aria-label="Search models"
              placeholder="モデルを検索..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-ui-sm text-foreground outline-none placeholder:text-foreground-subtlest"
            />
          </div>
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-1.5">
            {activeTab !== "favorites" &&
              selectedProfile.id !== currentProfileId &&
              selectedProfile.defaultModel === "" && (
                <button
                  type="button"
                  onClick={() => onSelectConfig({ profileId: selectedProfile.id })}
                  className="w-full rounded-md px-2.5 py-1.5 text-left text-ui-sm hover:bg-menu-hover"
                >
                  Use {selectedProfile.name}
                </button>
              )}
            {filteredModels.length === 0 ? (
              <p className="p-3 text-ui-xs text-foreground-subtlest">
                {!isSearching && activeTab !== "favorites" && selectedProfile.defaultModel === ""
                  ? "Models appear after the agent connects."
                  : activeTab === "favorites"
                    ? "☆ を押してお気に入りモデルを追加してください。"
                    : "一致するモデルがありません。"}
              </p>
            ) : (
              <>
                {visibleModels.map(({ profile, model }) => {
                  const isSelected = profile.id === currentProfileId && model.id === currentModelId;
                  const favKey = `${profile.id}:${model.id}`;
                  const isFav = favorites.includes(favKey);
                  return (
                    <div
                      key={favKey}
                      className={`group flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-ui-sm transition-colors ${
                        isSelected
                          ? "bg-selected font-medium text-foreground"
                          : "hover:bg-menu-hover"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          onSelectConfig({
                            profileId: profile.id,
                            modelId: model.id,
                          })
                        }
                        title={
                          model.description ? `${model.name} — ${model.description}` : model.name
                        }
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <span
                          className={`inline-flex size-5 shrink-0 items-center justify-center rounded border font-mono text-ui-xs ${profileBadgeStyle(profile.id)}`}
                        >
                          {profile.badge}
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          <span>{model.name}</span>
                          {model.id === "default" &&
                            model.description &&
                            !model.name.toLowerCase().includes(model.description.toLowerCase()) && (
                              <span className="ml-1.5 text-ui-xs text-foreground-subtlest">
                                {model.description}
                              </span>
                            )}
                        </span>
                        {isSelected && <Check className="size-3.5 shrink-0 text-brand" />}
                      </button>
                      <button
                        type="button"
                        aria-label={`Favorite ${model.name}`}
                        onClick={() => toggleFavorite(profile.id, model.id)}
                        className={`grid size-6 shrink-0 place-items-center rounded hover:bg-hover ${
                          isFav
                            ? "text-brand"
                            : "text-foreground-subtlest opacity-40 group-hover:opacity-100"
                        }`}
                      >
                        <Star className={`size-3.5 ${isFav ? "fill-current" : ""}`} />
                      </button>
                    </div>
                  );
                })}
                {canCollapseList && (
                  <button
                    type="button"
                    onClick={() => setShowAllModels((current) => !current)}
                    className="mt-1 flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-ui-xs font-medium text-foreground-subtle transition-colors hover:bg-menu-hover hover:text-foreground"
                  >
                    <span>
                      {showAllModels
                        ? "折りたたむ"
                        : `さらに表示 (全 ${filteredModels.length} モデル中 他 ${hiddenModelCount} 件)`}
                    </span>
                    <ChevronRight
                      className={`size-3.5 transition-transform ${showAllModels ? "-rotate-90" : ""}`}
                    />
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right column: Reasoning levels & Access policy */}
        <div className="flex w-44 shrink-0 flex-col justify-between bg-surface/30">
          <div>
            <div className="flex h-10 items-center justify-between border-b border-border px-3">
              <span className="text-ui-xs font-medium text-foreground-subtle">Reasoning</span>
              <span className="max-w-20 truncate font-mono text-ui-xs text-foreground-subtlest">
                {activeModelObj?.name ?? currentModelId}
              </span>
            </div>
            <div className="space-y-0.5 p-1.5">
              {reasoningList.map((level) => {
                const selected = level.id === currentReasoningId;
                return (
                  <button
                    key={level.id}
                    type="button"
                    onClick={() => onSelectConfig({ reasoningId: level.id })}
                    className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-ui-sm transition-colors ${
                      selected
                        ? "bg-selected font-medium text-foreground"
                        : "text-foreground-subtle hover:bg-menu-hover hover:text-foreground"
                    }`}
                  >
                    <span>{level.name}</span>
                    {selected && <Check className="size-3.5 shrink-0 text-brand" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t border-border p-2.5">
            <div className="text-ui-xs text-foreground-subtlest">Workspace Access</div>
            <button
              type="button"
              onClick={() => onSelectConfig({ permissionPolicy: nextPermissionPolicy() })}
              className="mt-1 flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-ui-sm font-medium text-foreground hover:bg-menu-hover"
            >
              <span>{permissionPolicyLabel(permissionPolicy)}</span>
              <ChevronRight className="size-3.5 text-foreground-subtle" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end border-t border-border bg-surface/60 px-3 py-2">
        <button
          type="button"
          onClick={() => onSelectConfig({ permissionPolicy: nextPermissionPolicy() })}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-ui-xs font-medium text-foreground-subtle hover:bg-hover hover:text-foreground"
          title="Click to cycle permission policy (Ask / Auto-Edit / Full Access)"
        >
          {permissionPolicy === "auto_all" ? (
            <ShieldCheck className="size-3.5 text-brand" />
          ) : (
            <ShieldAlert className="size-3.5 text-foreground-subtle" />
          )}
          <span>{permissionPolicyLabel(permissionPolicy)}</span>
        </button>
      </div>
    </div>
  );
}

export function AcpPanel({
  workspaceId,
  paneId,
  title,
  tabTitle = title,
  profileId,
  resumeSessionId,
  resumeSessionKey,
  active,
  onRename,
  onAttentionChange,
  onOpenFile,
  onFork,
}: {
  onFork?: ((source: AcpForkSource) => void) | undefined;
  workspaceId: string;
  paneId: string;
  title: string;
  tabTitle?: string;
  profileId?: string | undefined;
  resumeSessionId?: string | undefined;
  resumeSessionKey?: string | undefined;
  active: boolean;
  onRename?: (title: string) => void;
  onAttentionChange?: (paneId: string, state: TerminalAttentionState | null) => void;
  onOpenFile?: (path: string, line?: number) => void;
}) {
  const { desktopNotifications, setSettingsOpen } = useUiStore();
  const [acpSettings, setAcpSettings] = useState<AcpSettings>(DEFAULT_ACP_SETTINGS);
  const [snapshot, setSnapshot] = useState<AcpSessionSnapshot | null>(null);
  const [draft, setDraft] = useState("");
  const [queued, setQueued] = useState<{ id: string; text: string; images: AcpPromptImage[] }[]>(
    [],
  );
  const [queueHeld, setQueueHeld] = useState(false);
  const [queueEdit, setQueueEdit] = useState<{ id: string; text: string } | null>(null);
  const [dispatching, setDispatching] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const sending = useRef(false);
  const [attachedImages, setAttachedImages] = useState<AcpPromptImage[]>([]);
  const [zoomedImage, setZoomedImage] = useState<{ url: string; label: string } | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [caretPos, setCaretPos] = useState(0);
  const [menuDismissedAt, setMenuDismissedAt] = useState<string | null>(null);
  const [menuSelectedIndex, setMenuSelectedIndex] = useState(0);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);
  const [atBottom, setAtBottom] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sessionIdRef = useRef<string | null>(null);
  const onAttentionChangeRef = useRef(onAttentionChange);
  const desktopNotificationsRef = useRef(desktopNotifications);
  const notifiedEventsRef = useRef(new Set<string>());

  onAttentionChangeRef.current = onAttentionChange;
  desktopNotificationsRef.current = desktopNotifications;

  useEffect(() => {
    const addToDraft = (event: Event) => {
      const { paneId: target, text } = (event as CustomEvent<{ paneId: string; text: string }>)
        .detail;
      if (target !== paneId) return;
      setDraft((previous) => (previous ? `${previous}\n\n${text}` : text));
    };
    window.addEventListener("vintage:acp-draft", addToDraft);
    return () => window.removeEventListener("vintage:acp-draft", addToDraft);
  }, [paneId]);

  useEffect(() => {
    if (!editingTitle) setDraftTitle(title);
  }, [editingTitle, title]);

  const commitTitle = () => {
    const next = draftTitle.trim();
    setEditingTitle(false);
    if (!next) return setDraftTitle(title);
    if (next !== title) onRename?.(next);
  };

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setAtBottom(true);
  }, []);

  useEffect(() => {
    if (atBottom) scrollToBottom();
  }, [snapshot?.messages, snapshot?.pendingPermission, atBottom, scrollToBottom]);

  useEffect(() => {
    const bridge = window.desktop;
    if (!bridge?.getAcpSettings) return;
    void bridge
      .getAcpSettings()
      .then(setAcpSettings)
      .catch(() => {});
  }, [popoverOpen]);

  useEffect(() => {
    const bridge = window.desktop;
    if (!bridge?.createAcpSession) return;
    let disposed = false;

    const offEvent = bridge.onAcpEvent((event) => {
      if (event.sessionId !== sessionIdRef.current) return;
      if (event.type === "session.snapshot") {
        setSnapshot(event.snapshot);
      } else if (event.type === "message.delta") {
        setSnapshot((current) => {
          if (!current) return current;
          return {
            ...current,
            messages: current.messages.map((msg) =>
              msg.id === event.messageId
                ? {
                    ...msg,
                    [event.field]: msg[event.field] + event.delta,
                  }
                : msg,
            ),
          };
        });
      } else if (event.type === "tool.upsert") {
        setSnapshot((current) => {
          if (!current) return current;
          return {
            ...current,
            messages: current.messages.map((msg) => {
              if (msg.id !== event.messageId) return msg;
              const exists = msg.toolCalls.some((t) => t.toolCallId === event.toolCall.toolCallId);
              return {
                ...msg,
                toolCalls: exists
                  ? msg.toolCalls.map((t) =>
                      t.toolCallId === event.toolCall.toolCallId ? event.toolCall : t,
                    )
                  : [...msg.toolCalls, event.toolCall],
              };
            }),
          };
        });
      } else if (event.type === "plan.update") {
        setSnapshot((current) => (current ? { ...current, plan: event.entries } : current));
      } else if (event.type === "permission.requested") {
        setSnapshot((current) =>
          current
            ? { ...current, status: "waiting_permission", pendingPermission: event.request }
            : current,
        );
      } else if (event.type === "permission.resolved") {
        setSnapshot((current) =>
          current ? { ...current, status: "running", pendingPermission: null } : current,
        );
      }
    });

    const offAttention = bridge.onTerminalAttention((state) => {
      if (state.sessionId !== sessionIdRef.current) return;
      onAttentionChangeRef.current?.(paneId, state);
      const mode = state.monitorMode ?? DEFAULT_TERMINAL_MONITOR_MODE;
      const threshold = mode === "always_notify" ? 1 : (state.notificationThreshold ?? 3);
      const eventKey = `${state.sessionId}:${state.status}:${state.lastActivityAt}`;
      if (
        mode !== "mute" &&
        mode !== "ignore" &&
        state.attentionLevel >= threshold &&
        (state.userActionRequired || mode === "always_notify") &&
        desktopNotificationsRef.current &&
        (mode === "always_notify" || !document.hasFocus()) &&
        !notifiedEventsRef.current.has(eventKey)
      ) {
        notifiedEventsRef.current.add(eventKey);
        void bridge
          .showAttentionNotification({
            title: `VINTAGE · ${tabTitle} · ${title}`.slice(0, 120),
            body:
              state.status === "waiting_input"
                ? "ACP agent is waiting for your permission"
                : state.status === "failed"
                  ? "ACP agent reported an error"
                  : "ACP agent finished responding",
            dedupeKey: state.status === "waiting_input" ? `acp-wait:${paneId}` : eventKey,
            attentionLevel: state.attentionLevel as AttentionLevel,
            targetPaneId: paneId,
            ...(mode === "always_notify" ? { force: true } : {}),
          })
          .catch(() => {});
      }
    });

    const forkFrom = acpForkRequests.get(paneId);
    void bridge
      .createAcpSession({
        workspaceId,
        paneId,
        ...(profileId ? { profileId } : {}),
        ...(forkFrom ? { forkFrom } : {}),
        ...(resumeSessionId ? { resumeSessionId } : {}),
        ...(resumeSessionKey ? { resumeSessionKey } : {}),
        tabTitle,
        paneTitle: title,
      })
      .then(async (initialSnapshot) => {
        if (disposed) {
          await bridge.closeAcpSession(initialSnapshot.id);
          return;
        }
        acpForkRequests.delete(paneId);
        sessionIdRef.current = initialSnapshot.id;
        setSnapshot(initialSnapshot);
        await bridge.setAcpActive(initialSnapshot.id, active);
        await bridge.readyAcpSession(initialSnapshot.id);
      })
      .catch((error: unknown) => {
        if (disposed) return;
        acpForkRequests.delete(paneId);
        setSendError(error instanceof Error ? error.message : String(error));
      });

    return () => {
      disposed = true;
      offEvent();
      offAttention();
      onAttentionChangeRef.current?.(paneId, null);
      const sid = sessionIdRef.current;
      sessionIdRef.current = null;
      if (sid) void bridge.closeAcpSession(sid).catch(() => {});
    };
  }, [workspaceId, paneId]);

  useEffect(() => {
    const sid = sessionIdRef.current;
    if (sid) void window.desktop?.setAcpActive(sid, active);
    if (active) textareaRef.current?.focus();
  }, [active]);

  const isRunning =
    snapshot?.status === "running" ||
    snapshot?.status === "starting" ||
    snapshot?.status === "waiting_permission";

  useEffect(() => {
    const startedAt = snapshot?.turnStartedAt;
    if (!isRunning || !startedAt) {
      setElapsedMs(0);
      return;
    }
    setElapsedMs(Math.max(0, Date.now() - startedAt));
    const timer = window.setInterval(() => {
      setElapsedMs(Math.max(0, Date.now() - startedAt));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isRunning, snapshot?.turnStartedAt]);

  const composerTrigger = useMemo(() => {
    const detected = detectComposerTrigger(draft, caretPos);
    if (!detected) return null;
    if (menuDismissedAt === `${detected.mode}:${detected.start}:${detected.query}`) return null;
    return detected;
  }, [draft, caretPos, menuDismissedAt]);

  const composerMenuItems = useMemo<ComposerMenuItem[]>(() => {
    if (!composerTrigger) return [];
    const q = composerTrigger.query.trim().toLowerCase();
    if (composerTrigger.mode === "file") {
      const files = snapshot?.workspaceFiles ?? [];
      return files
        .filter((filePath) => !q || filePath.toLowerCase().includes(q))
        .slice(0, 30)
        .map((filePath) => ({
          id: `file:${filePath}`,
          label: filePath.split("/").at(-1) ?? filePath,
          description: filePath,
          kind: "skill" as const,
          insertText: `@${filePath} `,
        }));
    }
    const skills = snapshot?.availableSkills ?? [];
    if (composerTrigger.mode === "skill") {
      return skills
        .filter(
          (skill) =>
            !q ||
            skill.name.toLowerCase().includes(q) ||
            skill.description.toLowerCase().includes(q),
        )
        .map((skill) => ({
          id: `skill:${skill.name}`,
          label: skill.name,
          description: skill.description,
          badge: skillScopeLabel(skill.scope),
          kind: "skill" as const,
          insertText: `$${skill.name} `,
        }));
    }
    const agentCommands: AcpSlashCommand[] = snapshot?.availableCommands ?? [];
    const seen = new Set(BUILTIN_SLASH_COMMANDS.map((item) => item.label.toLowerCase()));
    const merged: ComposerMenuItem[] = [...BUILTIN_SLASH_COMMANDS];
    for (const cmd of agentCommands) {
      const label = `/${cmd.name}`;
      if (seen.has(label.toLowerCase())) continue;
      seen.add(label.toLowerCase());
      merged.push({
        id: `cmd:${cmd.name}`,
        label,
        description: cmd.description || cmd.inputHint || "",
        kind: "agent-command",
        insertText: `${label} `,
      });
    }
    for (const skill of skills) {
      const label = `/skill:${skill.name}`;
      if (seen.has(label.toLowerCase())) continue;
      seen.add(label.toLowerCase());
      merged.push({
        id: `slash-skill:${skill.name}`,
        label,
        description: skill.description,
        badge: skillScopeLabel(skill.scope, true),
        kind: "skill",
        insertText: `${label} `,
      });
    }
    return merged.filter(
      (item) =>
        !q || item.label.toLowerCase().includes(q) || item.description.toLowerCase().includes(q),
    );
  }, [composerTrigger, snapshot?.availableCommands, snapshot?.availableSkills]);

  useEffect(() => {
    setMenuSelectedIndex(0);
  }, [composerTrigger?.mode, composerTrigger?.query]);

  const relayConversation = useCallback(() => {
    if (!onFork) return;
    const last = snapshot?.messages.at(-1);
    if (!snapshot || !last) {
      setSendError("There is no ACP conversation to relay yet.");
      return;
    }
    if (isRunning || sending.current || last.streaming) {
      setSendError("Wait for the current ACP turn to finish before using /relay.");
      return;
    }
    setSendError(null);
    onFork({ sessionId: snapshot.id, messageId: last.id });
  }, [isRunning, onFork, snapshot]);

  const applyComposerMenuItem = useCallback(
    (item: ComposerMenuItem) => {
      if (!composerTrigger) return;
      if (item.kind === "client-command") {
        setDraft("");
        setCaretPos(0);
        setMenuDismissedAt(null);
        if (item.action === "model") {
          setPopoverOpen(true);
        } else if (item.action === "clear") {
          const sid = sessionIdRef.current;
          if (sid) {
            setQueueHeld(true);
            void window.desktop?.resetAcpSession(sid).then(setSnapshot);
          }
        } else if (item.action === "relay") {
          relayConversation();
        } else if (item.action === "settings") {
          setSettingsOpen(true);
        }
        return;
      }
      const replacement = item.insertText ?? `${item.label} `;
      const nextText =
        draft.slice(0, composerTrigger.start) + replacement + draft.slice(composerTrigger.end);
      const nextCaret = composerTrigger.start + replacement.length;
      setDraft(nextText);
      setCaretPos(nextCaret);
      setMenuDismissedAt(null);
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) {
          el.focus();
          el.setSelectionRange(nextCaret, nextCaret);
        }
      });
    },
    [composerTrigger, draft, relayConversation, setSettingsOpen],
  );

  const sendPrompt = useCallback(async (text: string, images: AcpPromptImage[]) => {
    const sid = sessionIdRef.current;
    if (!sid || !window.desktop || sending.current) return;
    sending.current = true;
    setDispatching(true);
    setSendError(null);
    try {
      await window.desktop.sendAcpPrompt(sid, text, images.length ? images : undefined);
    } catch (error) {
      setQueueHeld(true);
      setSendError(error instanceof Error ? error.message : String(error));
      setDraft((previous) => (previous ? `${text}\n\n${previous}` : text));
      setAttachedImages((previous) => [...images, ...previous]);
    } finally {
      sending.current = false;
      setDispatching(false);
    }
  }, []);

  useEffect(() => {
    const next = queued[0];
    if (!next || queueHeld || queueEdit || dispatching || sending.current) return;
    if (
      snapshot?.status === "error" ||
      snapshot?.status === "stopped" ||
      snapshot?.lastTurnCompleted === false
    ) {
      setQueueHeld(true);
      return;
    }
    if (snapshot?.status !== "ready" || !sessionIdRef.current) return;
    setQueued((items) => items.filter((item) => item.id !== next.id));
    void sendPrompt(next.text, next.images);
  }, [
    dispatching,
    queueEdit,
    queueHeld,
    queued,
    sendPrompt,
    snapshot?.lastTurnCompleted,
    snapshot?.status,
  ]);

  const submitPrompt = async () => {
    const text = draft.trim();
    const sid = sessionIdRef.current;
    if ((!text && attachedImages.length === 0) || !sid) return;
    if (text === "/model" && attachedImages.length === 0) {
      setDraft("");
      setPopoverOpen(true);
      return;
    }
    if (text === "/clear" && attachedImages.length === 0) {
      setDraft("");
      setQueueHeld(true);
      void window.desktop?.resetAcpSession(sid).then(setSnapshot);
      return;
    }
    if (text === "/relay" && attachedImages.length === 0) {
      setDraft("");
      setCaretPos(0);
      relayConversation();
      return;
    }
    if (text === "/settings" && attachedImages.length === 0) {
      setDraft("");
      setSettingsOpen(true);
      return;
    }
    const imagesToSend = attachedImages;
    setDraft("");
    setAttachedImages([]);
    setCaretPos(0);
    setAtBottom(true);
    if (isRunning || sending.current || (queued.length > 0 && !queueHeld)) {
      setQueued((items) => [...items, { id: crypto.randomUUID(), text, images: imagesToSend }]);
      return;
    }
    if (queued.length === 0) setQueueHeld(false);
    await sendPrompt(text, imagesToSend);
  };

  const handleSelectConfig = async (patch: {
    profileId?: string;
    modelId?: string;
    reasoningId?: string;
    modeId?: string;
    permissionPolicy?: AcpPermissionPolicy;
  }) => {
    const sid = sessionIdRef.current;
    if (!sid || !window.desktop?.configureAcpSession) return;
    if (patch.profileId && patch.profileId !== snapshot?.profileId && queued.length)
      setQueueHeld(true);
    const updated = await window.desktop.configureAcpSession(sid, patch);
    setSnapshot(updated);
  };

  const cycleMode = useCallback(() => {
    const modes = snapshot?.availableModes ?? [];
    if (modes.length < 2) return;
    const idx = modes.findIndex((m) => m.id === snapshot?.modeId);
    const next = modes[(idx + 1) % modes.length];
    if (next) void handleSelectConfig({ modeId: next.id });
  }, [snapshot?.availableModes, snapshot?.modeId]);

  const handlePaste = useCallback(async (event: ReactClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(event.clipboardData?.items ?? []);
    const imageFiles = items
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);
    if (imageFiles.length === 0) return;
    event.preventDefault();
    const loaded = (await Promise.all(imageFiles.map(readImageFileAsAttachment))).filter(
      (img): img is AcpPromptImage => img !== null,
    );
    if (loaded.length > 0) {
      setAttachedImages((current) => [...current, ...loaded].slice(0, 8));
    }
  }, []);

  const handleZoomImage = useCallback((url: string, label: string) => {
    setZoomedImage({ url, label });
  }, []);

  const profiles = useMemo(
    () => (acpSettings.profiles.length > 0 ? acpSettings.profiles : [...DEFAULT_ACP_PROFILES]),
    [acpSettings.profiles],
  );

  const currentModelName = useMemo(() => {
    if (!snapshot) return "Model";
    const found = snapshot.availableModels.find((m) => m.id === snapshot.modelId);
    return found?.name ?? (snapshot.modelId || snapshot.profileName);
  }, [snapshot]);

  const currentReasoningName = useMemo(() => {
    if (!snapshot) return "";
    const found = snapshot.availableReasoning.find((r) => r.id === snapshot.reasoningId);
    return found?.name ?? snapshot.reasoningId;
  }, [snapshot]);

  return (
    <section
      aria-label={`${title} ACP agent`}
      data-wallpaper-acp
      className="flex h-full min-h-0 flex-col bg-panel text-foreground"
    >
      {/* Top Header matching TerminalPanel */}
      <div className="sticky top-0 z-10 flex h-8 shrink-0 items-center gap-2 border-b border-border bg-header px-3 pr-10 text-ui-xs text-foreground-subtle">
        <Bot className="size-3.5 shrink-0 text-brand" />
        {editingTitle ? (
          <input
            autoFocus
            aria-label={`Rename ${title}`}
            className="h-5 min-w-0 flex-1 rounded border border-input-border bg-input px-1 text-ui-xs text-foreground outline-none focus:border-input-border-focused"
            value={draftTitle}
            onBlur={commitTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                setDraftTitle(title);
                setEditingTitle(false);
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left"
            title="Double-click to rename"
            onDoubleClick={() => onRename && setEditingTitle(true)}
          >
            ACP · {title} · {snapshot?.profileName ?? "Agent"} ({snapshot?.agentCommand ?? "stdio"})
            {snapshot?.reattached ? " · reconnected" : ""}
          </button>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {snapshot?.usage && snapshot.usage.size > 0 && (
            <span
              data-testid="acp-usage-badge"
              title={`Context: ${snapshot.usage.used.toLocaleString()} / ${snapshot.usage.size.toLocaleString()} tokens`}
              className="rounded-md border border-border bg-surface px-1.5 py-0.5 font-mono text-[11px] text-foreground-subtle"
            >
              {formatTokenCount(snapshot.usage.used)} / {formatTokenCount(snapshot.usage.size)} (
              {Math.min(100, Math.round((snapshot.usage.used / snapshot.usage.size) * 100))}%)
            </span>
          )}
          {snapshot?.status === "running" && (
            <span className="rounded-full bg-brand/15 px-2 py-0.5 font-mono text-ui-xs font-medium text-brand">
              ◌ Thinking{elapsedMs > 0 ? ` · ${formatElapsedSeconds(elapsedMs)}` : ""}
            </span>
          )}
          {snapshot?.status === "ready" &&
            snapshot.lastTurnDurationMs != null &&
            snapshot.lastTurnDurationMs >= 1000 && (
              <span className="font-mono text-[11px] text-foreground-subtlest">
                {formatElapsedSeconds(snapshot.lastTurnDurationMs)}
              </span>
            )}
          {snapshot?.status === "waiting_permission" && (
            <span className="rounded-full bg-warning/15 px-2 py-0.5 text-ui-xs font-medium text-warning">
              ◉ Permission needed
            </span>
          )}
          <button
            type="button"
            aria-label="Reset ACP conversation"
            title="Start a fresh ACP conversation"
            disabled={!sessionIdRef.current}
            onClick={() => {
              const sid = sessionIdRef.current;
              if (sid) {
                setQueueHeld(true);
                void window.desktop?.resetAcpSession(sid).then(setSnapshot);
              }
            }}
            className="grid size-6 place-items-center rounded-md text-foreground-subtle hover:bg-hover hover:text-foreground"
          >
            <RotateCcw className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Main Conversation Stream */}
      <div
        ref={scrollRef}
        onScroll={(event) => {
          const el = event.currentTarget;
          const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
          setAtBottom(nearBottom);
        }}
        className="relative min-h-0 flex-1 overflow-y-auto px-4 py-5"
      >
        {!snapshot || snapshot.messages.length === 0 ? (
          <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center text-center">
            <div className="mb-3 grid size-11 place-items-center rounded-xl border border-card-border bg-card">
              <Sparkles className="size-5 text-brand" />
            </div>
            <h2 className="text-ui-base font-semibold text-foreground">
              {snapshot?.profileName ?? "ACP Agent"} Ready
            </h2>
            <p className="mt-1.5 text-ui-sm text-foreground-subtle">
              Connected via official Agent Client Protocol (`@agentclientprotocol/sdk`). Switch
              providers, models, or reasoning depth anytime from the selector below.
            </p>
            {snapshot?.cwd && (
              <p className="mt-2 max-w-full truncate rounded-md border border-border bg-surface px-2.5 py-1 font-mono text-ui-xs text-foreground-subtlest">
                {snapshot.cwd}
              </p>
            )}
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-5 pb-4">
            {snapshot.messages.map((message) => (
              <AcpMessageRow
                key={message.id}
                message={message}
                workspaceId={workspaceId}
                profileBadge={message.profileBadge ?? snapshot.profileBadge}
                profileName={message.profileName ?? snapshot.profileName}
                profileId={message.profileId ?? snapshot.profileId}
                modelLabel={message.modelName ?? message.modelId}
                onOpenFile={onOpenFile}
                onZoomImage={handleZoomImage}
              />
            ))}
          </div>
        )}

        {snapshot?.pendingPermission && (
          <AcpPermissionBanner
            request={snapshot.pendingPermission}
            onRespond={(requestId, optionId) => {
              const sid = sessionIdRef.current;
              if (sid) void window.desktop?.respondAcpPermission(sid, requestId, optionId);
            }}
          />
        )}

        {snapshot?.errorMessage && (
          <div
            role="alert"
            className="mx-auto mt-3 flex max-w-3xl items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-ui-xs text-destructive"
          >
            <span className="min-w-0 flex-1 break-words">{snapshot.errorMessage}</span>
            <Button
              type="button"
              size="compact"
              variant="outline"
              onClick={() => setSettingsOpen(true)}
            >
              ACP Settings
            </Button>
          </div>
        )}

        {!atBottom && (
          <button
            type="button"
            aria-label="Scroll to latest message"
            onClick={scrollToBottom}
            className="sticky bottom-2 left-1/2 grid size-8 -translate-x-1/2 place-items-center rounded-full border border-popover-border bg-popover text-foreground shadow-md hover:bg-hover"
          >
            <ArrowDown className="size-4" />
          </button>
        )}
      </div>

      {/* Bottom Composer with 3-Column Model & Provider Popover */}
      <div className="shrink-0 px-3 pb-3 pt-1">
        {snapshot?.plan && snapshot.plan.length > 0 && <AcpPlanCard entries={snapshot.plan} />}
        <div
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes("Files")) {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            const droppedFiles = Array.from(event.dataTransfer.files);
            const imageFiles = droppedFiles.filter((file) => file.type.startsWith("image/"));
            const nonImageFiles = droppedFiles.filter((file) => !file.type.startsWith("image/"));
            if (imageFiles.length > 0) {
              void Promise.all(imageFiles.map(readImageFileAsAttachment)).then((loaded) => {
                const valid = loaded.filter((img): img is AcpPromptImage => img !== null);
                if (valid.length > 0) {
                  setAttachedImages((current) => [...current, ...valid].slice(0, 8));
                }
              });
            }
            const paths = nonImageFiles
              .map((file) => window.desktop?.getDroppedFilePath(file) ?? "")
              .filter(Boolean);
            if (paths.length > 0) {
              setDraft(
                (current) =>
                  `${current}${current ? " " : ""}${paths.map((p) => `@${p}`).join(" ")} `,
              );
              textareaRef.current?.focus();
            }
          }}
          data-theme-composer
          className="relative mx-auto flex max-w-3xl flex-col rounded-2xl border border-input-border bg-input p-2.5 focus-within:border-input-border-focused"
        >
          <AcpModelPopover
            open={popoverOpen}
            onClose={() => setPopoverOpen(false)}
            profiles={profiles}
            currentProfileId={snapshot?.profileId ?? acpSettings.defaultProfileId}
            currentModelId={snapshot?.modelId ?? "default"}
            currentReasoningId={snapshot?.reasoningId ?? "medium"}
            permissionPolicy={snapshot?.permissionPolicy ?? "ask"}
            availableModels={snapshot?.availableModels ?? []}
            availableReasoning={snapshot?.availableReasoning ?? []}
            onSelectConfig={(patch) => void handleSelectConfig(patch)}
            onOpenSettings={() => setSettingsOpen(true)}
          />

          {composerTrigger && composerMenuItems.length > 0 && (
            <div
              role="listbox"
              aria-label={
                composerTrigger.mode === "skill"
                  ? "Available skills"
                  : composerTrigger.mode === "file"
                    ? "Workspace files"
                    : "Slash commands"
              }
              data-testid={
                composerTrigger.mode === "skill"
                  ? "acp-skill-menu"
                  : composerTrigger.mode === "file"
                    ? "acp-file-menu"
                    : "acp-slash-menu"
              }
              className="absolute bottom-full left-0 right-0 z-50 mb-2 max-h-72 overflow-y-auto rounded-xl border border-popover-border bg-popover p-1.5 text-foreground shadow-md"
            >
              {composerMenuItems.map((item, idx) => {
                const selected = idx === menuSelectedIndex;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    title={item.description ? `${item.label} — ${item.description}` : item.label}
                    onMouseEnter={() => setMenuSelectedIndex(idx)}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      applyComposerMenuItem(item);
                    }}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left text-ui-sm transition-colors ${
                      selected ? "bg-selected text-foreground" : "hover:bg-menu-hover"
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-baseline gap-2.5">
                      <span className="shrink-0 font-medium text-foreground">{item.label}</span>
                      {item.description && (
                        <span className="min-w-0 flex-1 truncate text-ui-xs text-foreground-subtle">
                          {item.description}
                        </span>
                      )}
                    </div>
                    {item.badge && (
                      <span className="shrink-0 rounded-md border border-border bg-surface px-1.5 py-0.5 text-[11px] font-medium text-foreground-subtle">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {attachedImages.length > 0 && (
            <div className="mb-1.5 flex flex-wrap gap-1.5 px-1">
              {attachedImages.map((img) => (
                <div
                  key={img.id}
                  className="group relative overflow-hidden rounded-lg border border-border bg-surface"
                >
                  <img
                    src={`data:${img.mimeType};base64,${img.dataBase64}`}
                    alt={img.name}
                    className="size-14 object-cover"
                  />
                  <button
                    type="button"
                    aria-label={`Remove ${img.name}`}
                    onClick={() =>
                      setAttachedImages((current) => current.filter((item) => item.id !== img.id))
                    }
                    className="absolute right-0.5 top-0.5 grid size-4 place-items-center rounded-full bg-background/85 text-foreground hover:bg-destructive hover:text-destructive-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {sendError && (
            <p role="alert" className="px-1 text-ui-xs text-destructive">
              {sendError}
            </p>
          )}
          {queued.length > 0 && (
            <div className="max-h-40 space-y-1 overflow-auto border-b border-border px-1 py-2">
              {queued.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 rounded border border-dashed border-border px-2 py-1 text-ui-xs"
                >
                  {queueEdit?.id === item.id ? (
                    <>
                      <textarea
                        aria-label="Edit queued prompt"
                        value={queueEdit.text}
                        rows={2}
                        className="min-w-0 flex-1 resize-y rounded border border-border bg-background p-1"
                        onChange={(event) =>
                          setQueueEdit({ id: item.id, text: event.target.value })
                        }
                      />
                      <Button
                        size="compact"
                        variant="ghost"
                        disabled={!queueEdit.text.trim() && !item.images.length}
                        onClick={() => {
                          const text = queueEdit.text.trim();
                          setQueued((items) =>
                            items.map((entry) =>
                              entry.id === item.id ? { ...entry, text } : entry,
                            ),
                          );
                          setQueueEdit(null);
                        }}
                      >
                        Save
                      </Button>
                      <Button size="compact" variant="ghost" onClick={() => setQueueEdit(null)}>
                        Cancel edit
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="shrink-0 text-foreground-subtle">
                        {queueHeld ? "Held" : "Queued"}
                      </span>
                      <span className="min-w-0 flex-1 truncate" title={item.text}>
                        {item.text || "Image prompt"}
                      </span>
                      <Button
                        size="compact"
                        variant="ghost"
                        disabled={queueEdit !== null}
                        onClick={() => setQueueEdit({ id: item.id, text: item.text })}
                      >
                        Edit
                      </Button>
                      <Button
                        size="compact"
                        variant="ghost"
                        onClick={() =>
                          setQueued((items) => items.filter((entry) => entry.id !== item.id))
                        }
                      >
                        Remove
                      </Button>
                    </>
                  )}
                </div>
              ))}
              {queueHeld && !isRunning && !dispatching && !queueEdit && (
                <Button
                  size="compact"
                  variant="outline"
                  onClick={() => {
                    const next = queued[0];
                    if (!next) return;
                    setQueueHeld(false);
                    setQueued((items) => items.filter((item) => item.id !== next.id));
                    void sendPrompt(next.text, next.images);
                  }}
                >
                  Resume queue
                </Button>
              )}
            </div>
          )}
          <textarea
            ref={textareaRef}
            aria-label="Ask ACP agent"
            rows={2}
            value={draft}
            placeholder="何でも聞いてください... ($スキル /コマンド @ファイル 画像ペースト対応)"
            onPaste={(event) => void handlePaste(event)}
            onChange={(event) => {
              setDraft(event.target.value);
              setCaretPos(event.target.selectionStart ?? event.target.value.length);
              setMenuDismissedAt(null);
            }}
            onSelect={(event) => {
              setCaretPos(event.currentTarget.selectionStart ?? event.currentTarget.value.length);
            }}
            onKeyDown={(event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
              if (event.key === "Tab" && event.shiftKey && !composerTrigger) {
                event.preventDefault();
                cycleMode();
                return;
              }
              if (composerTrigger && composerMenuItems.length > 0) {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setMenuSelectedIndex((idx) => (idx + 1) % composerMenuItems.length);
                  return;
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setMenuSelectedIndex(
                    (idx) => (idx - 1 + composerMenuItems.length) % composerMenuItems.length,
                  );
                  return;
                }
                if (event.key === "Enter" || event.key === "Tab") {
                  event.preventDefault();
                  const chosen = composerMenuItems[menuSelectedIndex] ?? composerMenuItems[0];
                  if (chosen) applyComposerMenuItem(chosen);
                  return;
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setMenuDismissedAt(
                    `${composerTrigger.mode}:${composerTrigger.start}:${composerTrigger.query}`,
                  );
                  return;
                }
              }
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submitPrompt();
              }
            }}
            className="max-h-36 min-h-11 w-full resize-none bg-transparent px-1.5 py-1 text-ui-base text-foreground outline-none placeholder:text-foreground-subtlest"
          />

          <div className="mt-1.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Mention workspace file"
                title="Insert @ file reference"
                onClick={() => {
                  setDraft((current) => `${current}@`);
                  textareaRef.current?.focus();
                }}
                className="grid size-7 place-items-center rounded-lg text-foreground-subtle hover:bg-hover hover:text-foreground"
              >
                <Paperclip className="size-4" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              {snapshot?.availableModes && snapshot.availableModes.length > 1 && (
                <button
                  type="button"
                  data-testid="acp-mode-toggle"
                  aria-label="Switch agent mode"
                  title="Click or press Shift+Tab to switch agent mode"
                  onClick={cycleMode}
                  className="inline-flex h-7 items-center gap-1 rounded-lg border border-border bg-surface px-2 text-ui-xs font-medium text-foreground-subtle transition-colors hover:bg-hover hover:text-foreground"
                >
                  <span>
                    {snapshot.availableModes.find((m) => m.id === snapshot.modeId)?.name ??
                      snapshot.modeId ??
                      snapshot.availableModes[0]!.name}
                  </span>
                </button>
              )}
              {/* Pill button opening the 3-column Provider / Model / Reasoning popover */}
              <button
                type="button"
                aria-label="Select provider, model, and reasoning"
                aria-expanded={popoverOpen}
                data-testid="acp-model-trigger"
                onClick={() => setPopoverOpen((current) => !current)}
                className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-ui-xs font-medium text-foreground transition-colors hover:bg-hover"
              >
                <span
                  className={`inline-flex size-4 items-center justify-center rounded font-mono text-ui-xs font-semibold ${profileBadgeStyle(snapshot?.profileId ?? "claude")}`}
                >
                  {snapshot?.profileBadge ?? "CC"}
                </span>
                <span className="max-w-36 truncate">{currentModelName}</span>
                {currentReasoningName && (
                  <span className="text-foreground-subtle">{currentReasoningName}</span>
                )}
                <ChevronDown className="size-3 text-foreground-subtle" />
              </button>

              {isRunning && (
                <button
                  type="button"
                  aria-label="Cancel ACP turn"
                  title="Stop generation"
                  onClick={() => {
                    const sid = sessionIdRef.current;
                    if (sid) {
                      setQueueHeld(true);
                      setSendError(null);
                      void window.desktop?.cancelAcpPrompt(sid).catch((error: unknown) => {
                        if (sessionIdRef.current === sid) {
                          setSendError(
                            `Could not stop generation: ${error instanceof Error ? error.message : String(error)}`,
                          );
                        }
                      });
                    }
                  }}
                  className="grid size-7 place-items-center rounded-full bg-destructive text-destructive-foreground transition-opacity hover:opacity-90"
                >
                  <Square className="size-3 fill-current" />
                </button>
              )}
              <button
                type="button"
                aria-label={isRunning || dispatching ? "Queue prompt" : "Send prompt"}
                disabled={!draft.trim() && attachedImages.length === 0}
                onClick={() => void submitPrompt()}
                data-theme-message-action
                className="grid size-7 place-items-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ArrowUp className="size-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {zoomedImage && (
        <div
          role="dialog"
          aria-label={zoomedImage.label}
          onClick={() => setZoomedImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-6 backdrop-blur-xs"
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-xl border border-border bg-panel p-2 shadow-xl"
          >
            <button
              type="button"
              aria-label="Close image preview"
              onClick={() => setZoomedImage(null)}
              className="absolute right-3 top-3 grid size-7 place-items-center rounded-full bg-background/90 text-foreground hover:bg-hover"
            >
              <X className="size-4" />
            </button>
            <img
              src={zoomedImage.url}
              alt={zoomedImage.label}
              className="max-h-[84vh] max-w-[86vw] object-contain"
            />
          </div>
        </div>
      )}
    </section>
  );
}
