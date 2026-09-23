import { CircleAlert, OctagonAlert, X } from "lucide-react";
import { useEffect, useRef } from "react";

import type { SidebarAttentionItem } from "./Sidebar.js";

function levelLabel(level: SidebarAttentionItem["attentionLevel"]): string {
  return ["", "LOW", "MEDIUM", "HIGH", "CRITICAL"][level]!;
}

function attentionSummary(item: SidebarAttentionItem): string {
  if (item.reason === "error_output") return "An error was detected in terminal output.";
  if (item.reason === "input_request") return "This terminal is waiting for your input.";
  if (item.reason === "command_failed") return "A command exited unsuccessfully.";
  if (item.reason === "session_ended") return "The terminal session has ended.";
  if (item.reason === "warning_output") return "Warning output was detected.";
  if (item.status === "waiting_input") return "This terminal may need your input.";
  if (item.status === "failed") return "The terminal reported a failure.";
  if (item.status === "completed") return "A terminal command completed.";
  if (item.status === "waiting") return "This terminal is waiting for an external task.";
  return "This terminal needs your attention.";
}

export function AttentionToast({
  item,
  onOpen,
  onDismiss,
  onClose,
}: {
  item: SidebarAttentionItem;
  onOpen(): void;
  onDismiss(): void;
  onClose(): void;
}) {
  const critical = item.attentionLevel === 4;
  const Icon = critical ? OctagonAlert : CircleAlert;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (critical) return;
    const timer = setTimeout(() => onCloseRef.current(), 8_000);
    return () => clearTimeout(timer);
  }, [critical]);

  return (
    <article
      aria-label={`${levelLabel(item.attentionLevel)} attention from ${item.paneTitle}`}
      aria-live={critical ? "assertive" : "polite"}
      className={`pointer-events-auto rounded-xl border bg-panel p-3 shadow-lg ${
        critical ? "border-2 border-destructive bg-destructive/10" : "border-destructive/40"
      }`}
      data-attention-level={item.attentionLevel}
      role={critical ? "alert" : "status"}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg ${
            critical ? "bg-destructive text-background" : "bg-destructive/15 text-destructive"
          }`}
        >
          <Icon aria-hidden="true" className={critical ? "size-5" : "size-4"} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-ui-xs font-semibold tracking-wide text-destructive">
            {levelLabel(item.attentionLevel)} ATTENTION
          </p>
          <h2 className="mt-0.5 truncate text-ui-sm font-semibold text-foreground">
            {item.workspaceName} · {item.tabTitle} · {item.paneTitle}
          </h2>
          <p className="mt-1 text-ui-sm text-foreground-subtle">{attentionSummary(item)}</p>
          <p className="mt-1 text-ui-xs text-foreground-subtlest">
            Source: {item.source.toUpperCase()}
            {item.judgmentConfidence === undefined
              ? ""
              : ` · ${Math.round(item.judgmentConfidence * 100)}% confidence`}
            {item.judgmentModel ? ` · ${item.judgmentModel}` : ""}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="rounded-md bg-destructive px-3 py-1.5 text-ui-xs font-semibold text-background hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground"
              onClick={onOpen}
            >
              Open terminal
            </button>
            <button
              className="rounded-md px-3 py-1.5 text-ui-xs font-medium text-foreground-subtle hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
              onClick={onDismiss}
            >
              Dismiss
            </button>
          </div>
        </div>
        {!critical && (
          <button
            aria-label="Close attention toast"
            className="grid size-7 shrink-0 place-items-center rounded-md text-foreground-subtlest hover:bg-hover hover:text-foreground"
            onClick={onClose}
          >
            <X aria-hidden="true" className="size-3.5" />
          </button>
        )}
      </div>
    </article>
  );
}
