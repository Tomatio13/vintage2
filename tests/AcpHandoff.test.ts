import { describe, expect, it } from "vitest";

import { buildAcpHandoff } from "../src/main/acpHandoff.js";
import type { AcpConversationMessage } from "../src/shared/acp.js";

function message(role: AcpConversationMessage["role"], text: string): AcpConversationMessage {
  return {
    id: text.slice(0, 32),
    role,
    text,
    thought: "private reasoning",
    toolCalls: [],
    createdAt: 0,
    streaming: false,
  };
}

describe("ACP conversation handoff", async () => {
  it("preserves prior roles and text while excluding diagnostics, attachments and the new request", async () => {
    const design = message("assistant", "設計案\nsecond line");
    design.images = [
      { id: "image", name: "image", mimeType: "image/png", dataBase64: "past-image" },
    ];
    const diagnostic = message("assistant", "private local error");
    const messages = [
      message("user", "Plan the change"),
      design,
      diagnostic,
      message("user", "Implement the design"),
    ];
    const handoff = await buildAcpHandoff(messages, 0, 3, new WeakSet([diagnostic]));
    expect(handoff).toContain(
      JSON.stringify({ message: 1, role: "user", text: "Plan the change" }),
    );
    expect(handoff).toContain(JSON.stringify({ message: 2, role: "assistant", text: design.text }));
    expect(handoff).not.toMatch(/private|past-image|Implement the design/);
  });

  it("sends only the missed range on return and skips an empty range", async () => {
    const messages = [message("user", "first request"), message("assistant", "later design")];
    const diagnostics = new WeakSet<AcpConversationMessage>();
    expect(await buildAcpHandoff(messages, 1, 2, diagnostics)).toContain("later design");
    expect(await buildAcpHandoff(messages, 1, 2, diagnostics)).not.toContain("first request");
    expect(await buildAcpHandoff(messages, 2, 2, diagnostics)).toBeUndefined();
  });

  it("limits multilingual history while retaining complete recent messages and the original request", async () => {
    const messages = [
      message("user", "original"),
      message("assistant", "古".repeat(4000)),
      message("assistant", "新".repeat(4000)),
    ];
    const handoff = await buildAcpHandoff(messages, 0, 3, new WeakSet())!;
    expect(handoff).toContain("original");
    expect(handoff).toContain("新".repeat(4000));
    expect(handoff).not.toContain("古");
    expect(handoff).toContain("1 history item(s) omitted");
    expect(Buffer.byteLength(handoff ?? "")).toBeLessThan(17 * 1024);
  });
  it("automatically transfers a known exit code without exposing command details", async () => {
    const result = message("assistant", "");
    result.toolCalls.push({
      toolCallId: "run",
      title: "private command",
      kind: "execute",
      status: "failed",
      locations: [],
      content: [{ type: "terminal", terminalId: "term", exitCode: 7, output: "private output" }],
    });
    const handoff = await buildAcpHandoff([result], 0, 1, new WeakSet());
    expect(handoff).toContain('"exitCodes":[7]');
    expect(handoff).not.toContain("private");
  });
});
