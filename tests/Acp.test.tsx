import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AcpSettingsManager,
  filterOpenCodeGoModels,
  filterZaiModels,
  parseClaudeSettingsModels,
  resolveAcpCommand,
  sanitizeAcpSettings,
} from "../src/main/acpSettings.js";
import { parseWorkspaceState } from "../src/main/workspaceState.js";
import { AcpPanel } from "../src/renderer/components/AcpPanel.js";
import { Sidebar } from "../src/renderer/components/Sidebar.js";
import { DEFAULT_ACP_SETTINGS, type AcpSessionSnapshot } from "../src/shared/acp.js";
import type { DesktopBridge } from "../src/shared/desktop.js";

describe("ACP settings and workspace state persistence", () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "vintage-acp-test-"));
  });

  afterEach(() => {
    delete window.desktop;
    rmSync(directory, { recursive: true, force: true });
  });

  it("persists and sanitizes built-in and custom ACP agent profiles", () => {
    const manager = new AcpSettingsManager(directory);
    expect(manager.initialize().defaultProfileId).toBe("claude");

    const updated = manager.setSettings({
      defaultProfileId: "codex",
      profiles: [
        ...DEFAULT_ACP_SETTINGS.profiles,
        {
          id: "custom-agent",
          name: "My Custom ACP",
          badge: "mc",
          builtin: false,
          executable: "/usr/local/bin/my-acp",
          defaultCandidates: [],
          args: ["--stdio", "--acp"],
          permissionPolicy: "auto_edit",
          defaultModel: "custom-v1",
          defaultReasoning: "high",
          models: [{ id: "custom-v1", name: "Custom V1" }],
          reasoningLevels: [{ id: "high", name: "High" }],
        },
      ],
    });

    expect(updated.defaultProfileId).toBe("codex");
    const custom = updated.profiles.find((p) => p.id === "custom-agent");
    expect(custom).toMatchObject({
      name: "My Custom ACP",
      badge: "MC",
      builtin: false,
      executable: "/usr/local/bin/my-acp",
      args: ["--stdio", "--acp"],
      permissionPolicy: "auto_edit",
    });

    const reloaded = new AcpSettingsManager(directory);
    expect(reloaded.initialize()).toEqual(updated);
  });

  it("falls back to safe defaults when ACP settings input is malformed", () => {
    const sanitized = sanitizeAcpSettings({ defaultProfileId: "non-existent", profiles: "bad" });
    expect(sanitized.defaultProfileId).toBe("codex");
    expect(sanitized.profiles.length).toBeGreaterThanOrEqual(4);
  });

  it("migrates legacy codex/claude ACP args and resolves bundled adapters without stray flags", () => {
    const sanitized = sanitizeAcpSettings({
      defaultProfileId: "claude",
      profiles: [
        { id: "codex", executable: "", args: ["acp"] },
        { id: "claude", executable: "", args: ["--acp"] },
      ],
    });
    const codex = sanitized.profiles.find((p) => p.id === "codex")!;
    const claude = sanitized.profiles.find((p) => p.id === "claude")!;
    expect(codex.args).toEqual([]);
    expect(claude.args).toEqual([]);

    const resolvedCodex = resolveAcpCommand(codex, "", ["acp"]);
    expect(resolvedCodex.displayPath).toMatch(/codex-acp/);
    expect([resolvedCodex.file, ...resolvedCodex.args].join(" ")).toMatch(/codex-acp/);
    expect(resolvedCodex.args).not.toContain("acp");

    const resolvedClaude = resolveAcpCommand(claude, "", ["--acp"]);
    expect(resolvedClaude.displayPath).toMatch(/claude-agent-acp/);
    expect([resolvedClaude.file, ...resolvedClaude.args].join(" ")).toMatch(/claude-agent-acp/);
    expect(resolvedClaude.args).not.toContain("--acp");
  });

  it("replaces profile models with authoritative ACP discovered models and filters OpenCode to opencode-go", () => {
    const manager = new AcpSettingsManager(directory);
    manager.initialize();
    manager.updateProfileDiscoveredCatalog("claude", [
      { id: "default", name: "Default (recommended)", description: "glm-5.3-flash[1m]" },
      { id: "opus", name: "glm-5.3-flash[1m] (opus)" },
    ]);
    const claude = manager.getProfile("claude");
    expect(claude.models.map((m) => m.id)).toEqual(["default", "opus"]);

    const filtered = filterOpenCodeGoModels([
      { id: "anthropic/claude-opus-4-6", name: "anthropic/Claude Opus 4.6" },
      { id: "opencode/gpt-5.4", name: "opencode/GPT-5.4" },
      { id: "opencode-go/glm-5.3", name: "GLM-5.3" },
      { id: "opencode-go/deepseek-v4.1-flash", name: "DeepSeek V4.1 Flash" },
    ]);
    expect(filtered.map((m) => m.id)).toEqual([
      "opencode-go/glm-5.3",
      "opencode-go/deepseek-v4.1-flash",
    ]);

    const filteredZai = filterZaiModels([
      { id: "opencode-go/glm-5.3", name: "GLM-5.3" },
      { id: "zai-coding-plan/glm-5.3", name: "GLM-5.3" },
      { id: "zai-coding-plan/glm-5.3-flash", name: "GLM-5.3 Flash" },
    ]);
    expect(filteredZai.map((m) => m.id)).toEqual([
      "zai-coding-plan/glm-5.3",
      "zai-coding-plan/glm-5.3-flash",
    ]);

    const claudeCustom = parseClaudeSettingsModels({
      model: "haiku",
      env: {
        ANTHROPIC_DEFAULT_OPUS_MODEL: "glm-5.3-flash[1m]",
        ANTHROPIC_DEFAULT_SONNET_MODEL: "glm-5.3-flash[1m]",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "glm-5.3-flash[1m]",
      },
    });
    expect(claudeCustom.map((m) => m.id)).toEqual(["default", "opus", "sonnet", "haiku"]);
    expect(claudeCustom.find((m) => m.id === "default")?.description).toBe("glm-5.3-flash[1m]");
    expect(claudeCustom.find((m) => m.id === "haiku")?.name).toBe("glm-5.3-flash[1m] (haiku)");
  });

  it("validates kind: 'acp' panes inside workspaceState", () => {
    const state = parseWorkspaceState({
      version: 1,
      activeWorkspaceId: "vintage:home",
      workspaces: [
        {
          id: "vintage:home",
          name: "Home",
          path: "/home/user",
          kind: "home",
          activeTabId: "space-1",
          tabs: [
            {
              id: "space-1",
              title: "Space 1",
              activePaneId: "acp-1",
              panes: [
                { id: "term-1", title: "Terminal 1", kind: "terminal" },
                { id: "acp-1", title: "ACP 1", kind: "acp", profileId: "claude" },
              ],
              layout: {
                type: "split",
                splitId: "split-1",
                axis: "horizontal",
                ratio: 0.5,
                first: { type: "pane", paneId: "term-1" },
                second: { type: "pane", paneId: "acp-1" },
              },
            },
          ],
        },
      ],
    });

    expect(state.workspaces[0]?.tabs[0]?.panes[1]).toEqual({
      id: "acp-1",
      title: "ACP 1",
      kind: "acp",
      profileId: "claude",
    });
  });

  it("renders 'New ACP' directly below 'New space' in the left Sidebar", () => {
    const onNewSpace = vi.fn();
    const onNewAcp = vi.fn();

    render(
      <Sidebar
        workspaces={[]}
        attentionItems={[]}
        attentionHistory={[]}
        activeWorkspaceId={null}
        onOpenWorkspace={() => {}}
        onNewSpace={onNewSpace}
        onNewAcp={onNewAcp}
        onSelectWorkspace={() => {}}
        onSelectTab={() => {}}
        onSelectAttention={() => {}}
        onDismissAttention={() => {}}
        onOpenSettings={() => {}}
      />,
    );

    const newSpaceButton = screen.getByRole("button", { name: "New space" });
    const newAcpButton = screen.getByRole("button", { name: "New ACP" });
    expect(newSpaceButton).toBeInTheDocument();
    expect(newAcpButton).toBeInTheDocument();

    fireEvent.click(newAcpButton);
    expect(onNewAcp).toHaveBeenCalledTimes(1);
  });

  it("opens the 3-column provider, model, and reasoning popover inside AcpPanel and switches configuration", async () => {
    const initialSnapshot: AcpSessionSnapshot = {
      id: "session-1",
      acpSessionId: "acp-1",
      paneId: "pane-acp-1",
      workspaceId: "vintage:home",
      cwd: "/home/user/project",
      profileId: "codex",
      profileName: "Codex",
      profileBadge: "CD",
      agentCommand: "codex acp",
      modelId: "gpt-5.4",
      reasoningId: "medium",
      permissionPolicy: "ask",
      availableModels: [
        { id: "gpt-5.4", name: "GPT-5.4" },
        { id: "gpt-5.3-codex", name: "GPT-5.3 Codex" },
      ],
      availableReasoning: [
        { id: "low", name: "Low" },
        { id: "medium", name: "Medium" },
        { id: "high", name: "High" },
      ],
      status: "ready",
      monitorMode: "ignore_until_error",
      messages: [],
      plan: [],
      pendingPermission: null,
    };

    const configureAcpSession = vi.fn().mockImplementation(async (_id, patch) => ({
      ...initialSnapshot,
      ...patch,
    }));

    const sendAcpPrompt = vi.fn().mockResolvedValue(undefined);
    const onAcpEvent = vi.fn<DesktopBridge["onAcpEvent"]>().mockReturnValue(() => {});
    window.desktop = {
      getAcpSettings: vi.fn().mockResolvedValue(DEFAULT_ACP_SETTINGS),
      createAcpSession: vi.fn().mockResolvedValue(initialSnapshot),
      readyAcpSession: vi.fn().mockResolvedValue(undefined),
      setAcpActive: vi.fn().mockResolvedValue(undefined),
      closeAcpSession: vi.fn().mockResolvedValue(undefined),
      configureAcpSession,
      onAcpEvent,
      sendAcpPrompt,
      onTerminalAttention: vi.fn().mockReturnValue(() => {}),
    } as unknown as DesktopBridge;

    render(<AcpPanel workspaceId="vintage:home" paneId="pane-acp-1" title="ACP 1" active={true} />);

    const trigger = await screen.findByTestId("acp-model-trigger");
    expect(trigger).toHaveTextContent("GPT-5.4");
    expect(trigger).toHaveTextContent("Medium");

    fireEvent.click(trigger);
    const popover = await screen.findByTestId("acp-model-popover");
    expect(popover).toBeInTheDocument();

    // Switch reasoning to High
    fireEvent.click(screen.getByRole("button", { name: "High" }));
    await waitFor(() => {
      expect(configureAcpSession).toHaveBeenCalledWith("session-1", { reasoningId: "high" });
    });

    // Switch provider tab in the left rail to Claude Code and expand all models
    fireEvent.click(screen.getByRole("button", { name: "Provider Claude Code" }));
    expect(screen.getByRole("button", { name: /^CC\s+Claude Fable 5\.2$/i })).toBeInTheDocument();
    const showMoreBtn = screen.getByRole("button", { name: /さらに表示/i });
    fireEvent.click(showMoreBtn);
    fireEvent.click(screen.getByRole("button", { name: /^CC\s+Claude Opus 4\.5$/i }));
    await waitFor(() => {
      expect(configureAcpSession).toHaveBeenCalledWith("session-1", {
        profileId: "claude",
        modelId: "claude-opus-4-5",
      });
    });
    const emit = onAcpEvent.mock.calls[0]?.[0];
    if (!emit) throw new Error("ACP event subscription missing");
    act(() =>
      emit({
        type: "session.snapshot",
        sessionId: initialSnapshot.id,
        snapshot: { ...initialSnapshot, status: "running" },
      }),
    );
    const composer = screen.getByPlaceholderText(/何でも聞いてください/);
    fireEvent.change(composer, { target: { value: "Existing draft" } });
    act(() => {
      window.dispatchEvent(
        new CustomEvent("vintage:acp-draft", {
          detail: { paneId: initialSnapshot.paneId, text: "Selected diff" },
        }),
      );
    });
    expect(composer).toHaveValue("Existing draft\n\nSelected diff");
    fireEvent.click(screen.getByRole("button", { name: "Queue prompt" }));
    expect(sendAcpPrompt).not.toHaveBeenCalled();
    act(() =>
      emit({
        type: "session.snapshot",
        sessionId: initialSnapshot.id,
        snapshot: { ...initialSnapshot, lastTurnCompleted: false },
      }),
    );
    const resume = await screen.findByRole("button", { name: "Resume queue" });
    expect(sendAcpPrompt).not.toHaveBeenCalled();
    fireEvent.click(resume);
    await waitFor(() =>
      expect(sendAcpPrompt).toHaveBeenCalledWith(
        initialSnapshot.id,
        "Existing draft\n\nSelected diff",
        undefined,
      ),
    );
    act(() =>
      emit({
        type: "session.snapshot",
        sessionId: initialSnapshot.id,
        snapshot: { ...initialSnapshot, status: "running" },
      }),
    );
    fireEvent.change(composer, { target: { value: "Run after success" } });
    fireEvent.click(screen.getByRole("button", { name: "Queue prompt" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Edit queued prompt" }), {
      target: { value: "Updated follow-up" },
    });
    act(() =>
      emit({
        type: "session.snapshot",
        sessionId: initialSnapshot.id,
        snapshot: { ...initialSnapshot, lastTurnCompleted: true },
      }),
    );
    expect(sendAcpPrompt).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(sendAcpPrompt).toHaveBeenLastCalledWith(
        initialSnapshot.id,
        "Updated follow-up",
        undefined,
      ),
    );
  });

  it("preserves per-message agent identity across provider switches in mixed conversations", async () => {
    const mixedSnapshot: AcpSessionSnapshot = {
      id: "session-mixed",
      acpSessionId: "acp-mixed",
      paneId: "pane-acp-mixed",
      workspaceId: "vintage:home",
      cwd: "/home/user/project",
      profileId: "codex",
      profileName: "Codex",
      profileBadge: "CD",
      agentCommand: "codex-acp",
      modelId: "gpt-6.2-sol",
      reasoningId: "medium",
      permissionPolicy: "ask",
      availableModels: [{ id: "gpt-6.2-sol", name: "GPT-6.2-Sol" }],
      availableReasoning: [{ id: "medium", name: "Medium" }],
      status: "ready",
      monitorMode: "ignore_until_error",
      messages: [
        {
          id: "u-1",
          role: "user",
          text: "Hello",
          thought: "",
          toolCalls: [],
          createdAt: 1,
          streaming: false,
        },
        {
          id: "a-1",
          role: "assistant",
          text: "Hello from Codex",
          thought: "",
          toolCalls: [],
          createdAt: 2,
          streaming: false,
          profileId: "codex",
          profileName: "Codex",
          profileBadge: "CD",
        },
        {
          id: "u-2",
          role: "user",
          text: "Hey",
          thought: "",
          toolCalls: [],
          createdAt: 3,
          streaming: false,
        },
        {
          id: "a-2",
          role: "assistant",
          text: "Hello from Claude",
          thought: "",
          toolCalls: [
            {
              toolCallId: "t-1",
              title: "WebSearch: ACP protocol",
              kind: "search",
              status: "completed",
              locations: [],
              content: [],
            },
            {
              toolCallId: "t-2",
              title: "Fetch https://example.com",
              kind: "fetch",
              status: "completed",
              locations: [],
              content: [],
            },
          ],
          createdAt: 4,
          streaming: false,
          profileId: "claude",
          profileName: "Claude Code",
          profileBadge: "CC",
          modelId: "haiku",
          modelName: "glm-5.3-flash[1m] (haiku)",
        },
      ],
      plan: [],
      pendingPermission: null,
    };

    window.desktop = {
      getAcpSettings: vi.fn().mockResolvedValue(DEFAULT_ACP_SETTINGS),
      createAcpSession: vi.fn().mockResolvedValue(mixedSnapshot),
      readyAcpSession: vi.fn().mockResolvedValue(undefined),
      setAcpActive: vi.fn().mockResolvedValue(undefined),
      closeAcpSession: vi.fn().mockResolvedValue(undefined),
      onAcpEvent: vi.fn().mockReturnValue(() => {}),
      onTerminalAttention: vi.fn().mockReturnValue(() => {}),
    } as unknown as DesktopBridge;

    const fork = vi.fn();
    render(
      <AcpPanel
        workspaceId="vintage:home"
        paneId="pane-acp-mixed"
        title="ACP 1"
        active
        onFork={fork}
      />,
    );

    const codexMsg = await screen.findByLabelText("Codex message");
    const claudeMsg = await screen.findByLabelText("Claude Code message");
    expect(within(codexMsg).queryByRole("button", { name: "Fork in new Space" })).toBeNull();
    const composer = screen.getByRole("textbox", { name: "Ask ACP agent" });
    fireEvent.change(composer, { target: { value: "/relay", selectionStart: 6 } });
    fireEvent.keyDown(composer, { key: "Enter" });
    expect(fork).toHaveBeenCalledWith({
      sessionId: mixedSnapshot.id,
      messageId: mixedSnapshot.messages.at(-1)?.id,
    });
    expect(codexMsg).toHaveTextContent("CD");
    expect(codexMsg).toHaveTextContent("Hello from Codex");
    expect(claudeMsg).toHaveTextContent("CC");
    expect(claudeMsg).toHaveTextContent("glm-5.3-flash[1m] (haiku)");
    expect(claudeMsg).toHaveTextContent("Hello from Claude");
    // Tool calls are grouped and collapsed by default
    expect(claudeMsg).toHaveTextContent("2 steps (Search 1 · Fetch 1)");
    expect(screen.queryByText("WebSearch: ACP protocol")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /2 steps/i }));
    expect(screen.getByText("WebSearch: ACP protocol")).toBeInTheDocument();
    expect(screen.getByText("Fetch https://example.com")).toBeInTheDocument();
  });

  it("opens $ skills menu and / slash commands menu in AcpPanel composer", async () => {
    const snapshotWithCommands: AcpSessionSnapshot = {
      id: "session-cmd",
      acpSessionId: "acp-cmd",
      paneId: "pane-acp-cmd",
      workspaceId: "vintage:home",
      cwd: "/home/user/project",
      profileId: "codex",
      profileName: "Codex",
      profileBadge: "CD",
      agentCommand: "codex-acp",
      modelId: "gpt-6.2-sol",
      reasoningId: "medium",
      permissionPolicy: "ask",
      availableModels: [{ id: "gpt-6.2-sol", name: "GPT-6.2-Sol" }],
      availableReasoning: [{ id: "medium", name: "Medium" }],
      availableCommands: [
        { name: "compact", description: "Summarize the conversation and reduce context usage" },
      ],
      availableSkills: [
        {
          name: "agent-skills-reviewer",
          description: "Review an Agent Skill's SKILL.md",
          scope: "personal",
          source: "claude",
        },
      ],
      availableModes: [
        { id: "build", name: "Build" },
        { id: "plan", name: "Plan" },
      ],
      modeId: "build",
      workspaceFiles: ["src/main/acpManager.ts", "src/renderer/components/AcpPanel.tsx"],
      usage: { used: 32_000, size: 200_000 },
      status: "ready",
      monitorMode: "ignore_until_error",
      messages: [],
      plan: [
        { content: "Inspect codebase", priority: "high", status: "completed" },
        { content: "Implement ACP features", priority: "high", status: "in_progress" },
      ],
      pendingPermission: null,
    };

    const configureAcpSession = vi.fn().mockImplementation(async (_id, patch) => ({
      ...snapshotWithCommands,
      ...patch,
    }));

    window.desktop = {
      getAcpSettings: vi.fn().mockResolvedValue(DEFAULT_ACP_SETTINGS),
      createAcpSession: vi.fn().mockResolvedValue(snapshotWithCommands),
      readyAcpSession: vi.fn().mockResolvedValue(undefined),
      setAcpActive: vi.fn().mockResolvedValue(undefined),
      closeAcpSession: vi.fn().mockResolvedValue(undefined),
      configureAcpSession,
      onAcpEvent: vi.fn().mockReturnValue(() => {}),
      onTerminalAttention: vi.fn().mockReturnValue(() => {}),
    } as unknown as DesktopBridge;

    render(
      <AcpPanel workspaceId="vintage:home" paneId="pane-acp-cmd" title="ACP 1" active={true} />,
    );

    const textarea = (await screen.findByLabelText("Ask ACP agent")) as HTMLTextAreaElement;

    // Plan card & usage badge are visible
    expect(await screen.findByTestId("acp-plan-card")).toHaveTextContent("1/2");
    expect(screen.getByTestId("acp-usage-badge")).toHaveTextContent("32k / 200k (16%)");

    // Mode toggle switches build -> plan
    const modeBtn = screen.getByTestId("acp-mode-toggle");
    expect(modeBtn).toHaveTextContent("Build");
    fireEvent.click(modeBtn);
    await waitFor(() => {
      expect(configureAcpSession).toHaveBeenCalledWith("session-cmd", { modeId: "plan" });
    });

    // Trigger $ skills menu
    fireEvent.change(textarea, { target: { value: "$", selectionStart: 1 } });
    const skillMenu = await screen.findByTestId("acp-skill-menu");
    expect(skillMenu).toHaveTextContent("agent-skills-reviewer");
    expect(skillMenu).toHaveTextContent("個人のスキル");
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(textarea.value).toBe("$agent-skills-reviewer ");

    // Trigger @ file mention menu
    fireEvent.change(textarea, { target: { value: "@acp", selectionStart: 4 } });
    const fileMenu = await screen.findByTestId("acp-file-menu");
    expect(fileMenu).toHaveTextContent("acpManager.ts");
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(textarea.value).toBe("@src/main/acpManager.ts ");

    // Trigger / slash commands menu
    fireEvent.change(textarea, { target: { value: "/", selectionStart: 1 } });
    const slashMenu = await screen.findByTestId("acp-slash-menu");
    expect(slashMenu).toHaveTextContent("/model");
    expect(slashMenu).toHaveTextContent("/clear");
    expect(slashMenu).toHaveTextContent("/compact");
    expect(slashMenu).toHaveTextContent("/skill:agent-skills-reviewer");
  });

  it("renders local markdown images via readAcpImage and previews html code blocks in sandboxed iframe", async () => {
    const richSnapshot: AcpSessionSnapshot = {
      id: "session-rich",
      acpSessionId: "acp-rich",
      paneId: "pane-acp-rich",
      workspaceId: "vintage:home",
      cwd: "/home/user/project",
      profileId: "antigravity",
      profileName: "Antigravity / Gemini",
      profileBadge: "AG",
      agentCommand: "agy acp",
      modelId: "gemini-4-neon",
      reasoningId: "high",
      permissionPolicy: "ask",
      availableModels: [{ id: "gemini-4-neon", name: "Gemini 4 Neon" }],
      availableReasoning: [{ id: "high", name: "High" }],
      status: "ready",
      monitorMode: "ignore_until_error",
      messages: [
        {
          id: "a-rich",
          role: "assistant",
          text: "![Frog](/tmp/frog.jpg)\n\n```html\n<h1>Hello Preview</h1>\n```",
          thought: "",
          toolCalls: [],
          createdAt: 1,
          streaming: false,
          profileId: "antigravity",
          profileName: "Antigravity / Gemini",
          profileBadge: "AG",
          modelName: "Gemini 4 Neon",
        },
      ],
      plan: [],
      pendingPermission: null,
    };

    const readAcpImage = vi.fn().mockResolvedValue("data:image/jpeg;base64,ZmFrZQ==");
    window.desktop = {
      getAcpSettings: vi.fn().mockResolvedValue(DEFAULT_ACP_SETTINGS),
      createAcpSession: vi.fn().mockResolvedValue(richSnapshot),
      readyAcpSession: vi.fn().mockResolvedValue(undefined),
      setAcpActive: vi.fn().mockResolvedValue(undefined),
      closeAcpSession: vi.fn().mockResolvedValue(undefined),
      readAcpImage,
      onAcpEvent: vi.fn().mockReturnValue(() => {}),
      onTerminalAttention: vi.fn().mockReturnValue(() => {}),
    } as unknown as DesktopBridge;

    render(
      <AcpPanel workspaceId="vintage:home" paneId="pane-acp-rich" title="ACP 1" active={true} />,
    );

    const img = await screen.findByAltText("Frog");
    expect(img).toHaveAttribute("src", "data:image/jpeg;base64,ZmFrZQ==");
    expect(readAcpImage).toHaveBeenCalledWith("vintage:home", "/tmp/frog.jpg");

    const htmlPreview = screen.getByTestId("acp-html-preview");
    expect(htmlPreview.querySelector("iframe")).toHaveAttribute("sandbox", "allow-scripts");
  });
});
