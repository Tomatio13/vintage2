import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";

vi.mock("electron", () => ({ ipcMain: { handle: vi.fn() }, dialog: { showMessageBox: vi.fn() } }));

import { dialog, ipcMain } from "electron";
import { registerAcpIpc } from "../src/main/acpManager.js";
import { AcpSettingsManager } from "../src/main/acpSettings.js";
import { AttentionSettingsManager } from "../src/main/attentionSettings.js";
import { DesktopChannels } from "../src/shared/desktop.js";

it("passes history over ACP on provider switches and clears it with the conversation", async () => {
  const directory = mkdtempSync(join(tmpdir(), "vintage-acp-handoff-"));
  const script = join(directory, "agent.cjs");
  const log = join(directory, "prompts.jsonl");
  writeFileSync(
    script,
    `
    const [profile, log] = process.argv.slice(2);
    const fs = require("node:fs");
    const readline = require("node:readline");
    const reply = (value) => console.log(JSON.stringify({ jsonrpc: "2.0", ...value }));
    readline.createInterface({ input: process.stdin }).on("line", (line) => {
      const { id, method, params } = JSON.parse(line);
      if (id === undefined) return;
      let result = {};
      if (method === "initialize") result = { protocolVersion: params.protocolVersion };
      if (method === "session/new") result = { sessionId: profile };
      if (method === "session/prompt") {
        fs.appendFileSync(log, JSON.stringify({ profile, prompt: params.prompt }) + "\\n");
        if (["Design a feature", "Implement it"].includes(params.prompt.at(-1).text)) {
          reply({ method: "session/update", params: { sessionId: profile, update: {
            sessionUpdate: "tool_call", toolCallId: "command", kind: "execute",
            title: profile + " test command", status: "failed",
            content: [{ type: "content", content: { type: "text", text: profile + " private output" } }],
          } } });
        }
        reply({ method: "session/update", params: { sessionId: profile, update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: profile + " answer to " + params.prompt.at(-1).text },
        } } });
        result = { stopReason: "end_turn" };
      }
      reply({ id, result });
    });
  `,
  );
  const settings = new AcpSettingsManager(directory);
  settings.initialize();
  settings.setSettings({
    profiles: ["planner", "builder"].map((id) => ({
      id,
      name: id,
      executable: process.execPath,
      args: [script, id, log],
    })),
  });

  registerAcpIpc(
    () => directory,
    settings,
    new AttentionSettingsManager(directory),
    () => ({}) as ReturnType<Parameters<typeof registerAcpIpc>[3]>,
  );
  const sender = Object.assign(new EventEmitter(), {
    id: 975,
    isDestroyed: () => false,
    send: vi.fn(),
  });
  const invoke = async (channel: string, ...args: unknown[]) => {
    const listener = vi.mocked(ipcMain.handle).mock.calls.find(([name]) => name === channel)?.[1];
    if (!listener) throw new Error(`Missing IPC handler ${channel}`);
    return listener({ sender } as unknown as Parameters<typeof listener>[0], ...args);
  };

  vi.mocked(dialog.showMessageBox)
    .mockResolvedValueOnce({ response: 0, checkboxChecked: false })
    .mockResolvedValueOnce({ response: 1, checkboxChecked: false });
  let id: string | undefined;
  try {
    ({ id } = await invoke(DesktopChannels.acpCreate, {
      workspaceId: "workspace",
      paneId: "pane",
      profileId: "planner",
    }));
    await invoke(DesktopChannels.acpPrompt, id, "Design a feature");
    await invoke(DesktopChannels.acpConfigure, id, { profileId: "builder" });
    await invoke(DesktopChannels.acpPrompt, id, "Implement it");
    await invoke(DesktopChannels.acpConfigure, id, { profileId: "planner" });
    await invoke(DesktopChannels.acpPrompt, id, "Review it");
    await invoke(DesktopChannels.acpPrompt, id, "One more thing");
    await invoke(DesktopChannels.acpReset, id);
    await invoke(DesktopChannels.acpPrompt, id, "New topic");

    const turns = readFileSync(log, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(turns.map((turn) => turn.profile)).toEqual([
      "planner",
      "builder",
      "planner",
      "planner",
      "planner",
    ]);
    expect(turns[1].prompt[0].text).toContain("planner answer to Design a feature");
    expect(turns[1].prompt[0].text).toContain('"status":"failed"');
    expect(turns[1].prompt[0].text).not.toMatch(/planner test command|planner private output/);
    expect(turns[2].prompt[0].text).toContain("builder private output");
    expect(dialog.showMessageBox).toHaveBeenCalledTimes(2);
    expect(dialog.showMessageBox).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        message: expect.stringContaining("builder"),
        detail: expect.stringContaining("planner private output"),
        defaultId: 0,
      }),
    );
    expect(turns[1].prompt[1]).toEqual({ type: "text", text: "Implement it" });
    expect(turns[2].prompt[0].text).toContain("builder answer to Implement it");
    expect(turns[2].prompt[0].text).not.toContain("Design a feature");
    expect(turns[3].prompt).toEqual([{ type: "text", text: "One more thing" }]);
    expect(turns[4].prompt).toEqual([{ type: "text", text: "New topic" }]);
  } finally {
    if (id) await invoke(DesktopChannels.acpClose, id);
    rmSync(directory, { recursive: true, force: true });
  }
});
