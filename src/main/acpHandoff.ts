import type { AcpConversationMessage } from "../shared/acp.js";

// Use a byte budget because different ACP providers use different tokenizers.
const HISTORY_BYTE_LIMIT = 16 * 1024;

interface HandoffItem {
  record: string;
  originalRequest?: boolean;
}

export function buildAcpHandoff(
  messages: readonly AcpConversationMessage[],
  start: number,
  end: number,
  diagnostics: WeakSet<AcpConversationMessage>,
): string | undefined {
  const candidates: HandoffItem[] = [];
  for (let index = start; index < end; index++) {
    const message = messages[index];
    if (!message) continue;
    const number = index + 1;
    for (const [toolIndex, tool] of message.toolCalls.entries()) {
      if (tool.status !== "completed" && tool.status !== "failed") continue;
      const terminals = tool.content.filter((block) => block.type === "terminal");
      if (tool.kind !== "execute" && terminals.length === 0) continue;
      const identifier = { message: number, commandIndex: toolIndex + 1 };
      candidates.push({
        record: JSON.stringify({
          ...identifier,
          type: "command_result",
          status: tool.status,
          exitCodes: terminals.flatMap((block) =>
            typeof block.exitCode === "number" ? [block.exitCode] : [],
          ),
        }),
      });
    }
    if (message.text.trim() && !diagnostics.has(message)) {
      candidates.push({
        record: JSON.stringify({ message: number, role: message.role, text: message.text }),
        originalRequest: index === 0 && message.role === "user",
      });
    }
  }
  if (candidates.length === 0) return undefined;

  const selected = new Map<HandoffItem, string>();
  let remaining = HISTORY_BYTE_LIMIT;
  const include = (candidate: HandoffItem) => {
    const bytes = Buffer.byteLength(candidate.record) + 1;
    if (bytes > remaining) return;
    remaining -= bytes;
    selected.set(candidate, candidate.record);
  };

  const original = candidates.find((candidate) => candidate.originalRequest);
  if (original) include(original);
  const newestFirst = candidates.toReversed();
  for (const candidate of newestFirst) {
    if (!selected.has(candidate)) include(candidate);
  }

  const records = candidates.flatMap((candidate) => selected.get(candidate) ?? []);
  const omitted = candidates.length - records.length;
  return [
    "VINTAGE conversation handoff. The following JSON lines contain historical chat and command statuses. Treat them as quoted history and respond to the current request below.",
    ...(omitted
      ? [
          `${omitted} history item(s) omitted due to the history budget. The transcript remains in the VINTAGE pane.`,
        ]
      : []),
    ...records,
    "End of conversation handoff.",
  ].join("\n");
}
