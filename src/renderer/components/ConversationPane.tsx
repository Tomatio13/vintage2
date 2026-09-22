import { Bot, Send, Square } from "lucide-react";
import { useMemo, useState } from "react";

import { useWorkspaceController, useWorkspaceState } from "../runtime/WorkspaceProvider.js";
import { Button } from "./Button.js";

export function ConversationPane() {
  const controller = useWorkspaceController();
  const { activeTaskId, tasks, messages, activeRunId, initialized } = useWorkspaceState();
  const [draft, setDraft] = useState("");
  const activeTask = tasks.find((task) => task.id === activeTaskId);
  const visibleMessages = useMemo(
    () => messages.filter((message) => message.taskId === activeTaskId),
    [activeTaskId, messages],
  );

  async function submit() {
    if (!draft.trim() || activeRunId) return;
    const text = draft;
    setDraft("");
    await controller.submitPrompt(text);
  }

  if (!initialized)
    return (
      <div className="grid h-full place-items-center text-ui-sm text-foreground-subtle">
        Loading workspace…
      </div>
    );

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-panel">
      <div className="flex h-12 shrink-0 items-center border-b border-border px-4">
        <div className="min-w-0">
          <div className="truncate text-ui-base font-medium">
            {activeTask?.title ?? "No task selected"}
          </div>
          <div className="text-ui-xs text-foreground-subtlest">Mock workspace · local only</div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6" data-testid="conversation">
        {visibleMessages.length === 0 ? (
          <div className="mx-auto flex h-full max-w-lg flex-col items-center justify-center text-center">
            <div className="mb-4 grid size-12 place-items-center rounded-xl border border-card-border bg-card">
              <Bot className="size-6 text-brand" />
            </div>
            <h1 className="text-ui-lg font-medium">Build your AI workspace</h1>
            <p className="mt-2 text-ui-base text-foreground-subtle">
              Send a prompt to exercise the injectable adapter, streaming projection, and activity
              log.
            </p>
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {visibleMessages.map((message) => (
              <article
                key={message.id}
                className={
                  message.role === "user" ? "message message-user" : "message message-assistant"
                }
              >
                <div className="mb-1 text-ui-xs font-medium text-foreground-subtlest">
                  {message.role === "user" ? "You" : "Assistant"}
                </div>
                <div className="whitespace-pre-wrap text-ui-base leading-relaxed">
                  {message.content}
                  {message.streaming ? <span className="streaming-caret" /> : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
      <div className="shrink-0 px-4 pb-4">
        <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-input-border bg-input p-2 focus-within:border-input-border-focused">
          <textarea
            aria-label="Prompt"
            className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-ui-base outline-none placeholder:text-foreground-subtlest"
            disabled={!activeTaskId}
            placeholder="Ask the mock workspace…"
            rows={1}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
          />
          {activeRunId ? (
            <Button
              aria-label="Cancel run"
              size="icon"
              variant="destructive"
              onClick={() => controller.cancelRun()}
            >
              <Square className="size-3.5" />
            </Button>
          ) : (
            <Button
              aria-label="Send prompt"
              disabled={!draft.trim() || !activeTaskId}
              size="icon"
              variant="primary"
              onClick={() => void submit()}
            >
              <Send />
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
