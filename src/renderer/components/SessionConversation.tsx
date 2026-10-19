import { historyAgentStyle } from "../../shared/sessionHistory.js";
import { Check, Copy } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { HistoryAgent, HistoryMessage } from "../../shared/sessionHistory.js";
import { Button } from "./Button.js";

const markdownComponents: Components = {
  p: ({ children }) => <p className="my-3 first:mt-0 last:mb-0">{children}</p>,
  h1: ({ children }) => (
    <h3 className="mb-3 mt-6 text-ui-lg font-semibold first:mt-0">{children}</h3>
  ),
  h2: ({ children }) => (
    <h3 className="mb-3 mt-5 text-ui-base font-semibold first:mt-0">{children}</h3>
  ),
  h3: ({ children }) => <h4 className="mb-2 mt-4 font-semibold first:mt-0">{children}</h4>,
  ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-5">{children}</ol>,
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-border pl-3 text-foreground-subtle">
      {children}
    </blockquote>
  ),
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-lg border border-border bg-panel p-3 text-ui-sm leading-relaxed [&>code]:whitespace-pre [&>code]:border-0 [&>code]:bg-transparent [&>code]:p-0">
      {children}
    </pre>
  ),
  code: ({ children }) => (
    <code className="rounded border border-border bg-panel px-1 py-0.5 font-mono text-[0.9em]">
      {children}
    </code>
  ),
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-left text-ui-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-border bg-panel px-3 py-2 font-semibold">{children}</th>
  ),
  td: ({ children }) => <td className="border border-border px-3 py-2 align-top">{children}</td>,
  hr: () => <hr className="my-5 border-border" />,
  a: ({ href, children }) => (
    <a
      href={href && /^https?:\/\//i.test(href) ? href : undefined}
      className="text-brand underline underline-offset-2"
      onClick={(event) => {
        event.preventDefault();
        if (href && /^https?:\/\//i.test(href))
          void window.desktop?.openExternal(href).catch(() => {});
      }}
    >
      {children}
    </a>
  ),
  // Historical responses should not fetch remote images when opened.
  img: ({ alt }) => <span className="text-foreground-subtle">[Image{alt ? `: ${alt}` : ""}]</span>,
};
const plugins = [remarkGfm];

const ChatMessage = memo(function ChatMessage({
  message,
  agent,
}: {
  message: HistoryMessage;
  agent: HistoryAgent;
}) {
  const user = message.role === "user";
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return (
    <article
      aria-label={`${user ? "You" : historyAgentStyle[agent].name} message`}
      className={`group flex min-w-0 gap-2.5 ${user ? "justify-end" : "justify-start"}`}
    >
      {!user && (
        <span
          aria-hidden="true"
          className={`mt-1 flex size-7 shrink-0 items-center justify-center rounded-lg border border-border text-[10px] font-semibold ${historyAgentStyle[agent].color}`}
        >
          {historyAgentStyle[agent].badge}
        </span>
      )}
      <div className={`min-w-0 ${user ? "max-w-[90%]" : "flex-1"}`}>
        <div className={`mb-1.5 flex items-center gap-2 ${user ? "justify-end" : "justify-start"}`}>
          <span className="text-ui-xs font-medium text-foreground-subtle">
            {user ? "You" : historyAgentStyle[agent].name}
          </span>
        </div>
        <div
          className={`min-w-0 break-words text-ui-base leading-7 [overflow-wrap:anywhere] ${user ? "rounded-2xl rounded-tr-sm border border-border bg-selected px-4 py-3 text-foreground" : "text-foreground"}`}
        >
          {user ? (
            <p className="whitespace-pre-wrap">{message.text}</p>
          ) : (
            <ReactMarkdown skipHtml remarkPlugins={plugins} components={markdownComponents}>
              {message.text}
            </ReactMarkdown>
          )}
        </div>
        <div
          className={`mt-1 flex h-7 items-center gap-2 ${user ? "justify-end" : "justify-start"}`}
        >
          <Button
            type="button"
            variant="ghost"
            size="compact"
            aria-label={`Copy ${user ? "your" : historyAgentStyle[agent].name} message`}
            title="Copy message"
            className="size-7 p-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
            onClick={async () => {
              if (!window.desktop?.writeClipboardText) return;
              try {
                await window.desktop.writeClipboardText(message.text);
                setCopyState("copied");
              } catch {
                setCopyState("failed");
              }
              if (timer.current) clearTimeout(timer.current);
              timer.current = setTimeout(() => setCopyState("idle"), 2000);
            }}
          >
            {copyState === "copied" ? (
              <Check className="size-3.5" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </Button>
          <span role="status" className="text-ui-xs text-foreground-subtlest">
            {copyState === "copied" ? "Copied" : copyState === "failed" ? "Unable to copy" : ""}
          </span>
        </div>
      </div>
    </article>
  );
});
export const SessionConversation = memo(function SessionConversation({
  messages,
  agent,
}: {
  messages: HistoryMessage[];
  agent: HistoryAgent;
}) {
  return (
    <div aria-label="Conversation" className="mx-auto w-full max-w-3xl space-y-5 pb-6">
      {messages.map((message, index) => (
        <ChatMessage key={index} message={message} agent={agent} />
      ))}
    </div>
  );
});
