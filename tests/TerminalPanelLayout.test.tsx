import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { WebglAddon } from "@xterm/addon-webgl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TerminalPanel } from "../src/renderer/components/TerminalPanel.js";
import { defaultShortcuts, useUiStore } from "../src/renderer/store/uiStore.js";
import type { DesktopBridge, TerminalAttentionState } from "../src/shared/desktop.js";

const terminalTestState = vi.hoisted(() => ({
  selection: "",
  selectionListener: undefined as (() => void) | undefined,
  keyHandler: undefined as ((event: KeyboardEvent) => boolean) | undefined,
  addons: [] as unknown[],
  terminals: [] as { unicode: { activeVersion: string } }[],
}));

vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    cols = 80;
    rows = 24;
    options = {};
    unicode = { activeVersion: "unicode6" };

    constructor() {
      terminalTestState.terminals.push(this);
    }

    loadAddon(addon: unknown) {
      terminalTestState.addons.push(addon);
    }
    open() {}
    focus() {}
    write() {}
    writeln() {}
    attachCustomKeyEventHandler(handler: (event: KeyboardEvent) => boolean) {
      terminalTestState.keyHandler = handler;
    }
    onData() {
      return { dispose() {} };
    }
    onSelectionChange(listener: () => void) {
      terminalTestState.selectionListener = listener;
      return {
        dispose() {
          terminalTestState.selectionListener = undefined;
        },
      };
    }
    getSelection() {
      return terminalTestState.selection;
    }
    dispose() {}
  },
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit() {}
  },
}));

describe("TerminalPanel", () => {
  beforeEach(() => {
    terminalTestState.selection = "";
    terminalTestState.selectionListener = undefined;
    terminalTestState.keyHandler = undefined;
    terminalTestState.addons = [];
    terminalTestState.terminals = [];
  });

  afterEach(() => {
    delete window.desktop;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps Attention before a right-anchored, ZCode-style monitor menu", async () => {
    let attentionListener: ((state: TerminalAttentionState) => void) | undefined;
    const bridge = {
      createTerminal: vi.fn().mockResolvedValue({
        id: "session-1",
        shell: "zsh",
        cwd: "/workspace",
        monitorMode: "ignore_until_error",
      }),
      onTerminalData: vi.fn().mockReturnValue(() => {}),
      onTerminalExit: vi.fn().mockReturnValue(() => {}),
      onTerminalAttention: vi.fn((listener: (state: TerminalAttentionState) => void) => {
        attentionListener = listener;
        return () => {};
      }),
      setTerminalActive: vi.fn().mockResolvedValue(undefined),
      setTerminalMonitorMode: vi.fn().mockResolvedValue(undefined),
      readyTerminal: vi.fn().mockResolvedValue(undefined),
      closeTerminal: vi.fn().mockResolvedValue(undefined),
    } as unknown as DesktopBridge;
    window.desktop = bridge;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );

    render(
      <TerminalPanel
        workspaceId="workspace-1"
        tabTitle="Space 1"
        paneId="pane-1"
        title="Terminal 1"
        active
      />,
    );

    expect(terminalTestState.terminals[0]?.unicode.activeVersion).toBe("11");
    expect(terminalTestState.addons.some((addon) => addon instanceof WebglAddon)).toBe(true);
    await waitFor(() => expect(attentionListener).toBeDefined());
    act(() =>
      attentionListener?.({
        sessionId: "session-1",
        status: "failed",
        attentionLevel: 3,
        userActionRequired: true,
        source: "shell",
        reason: "command_failed",
        lastActivityAt: 1_700_000_000_000,
      }),
    );

    const controls = screen.getByRole("group", { name: "Terminal 1 attention controls" });
    expect(controls).toHaveClass("ml-auto");
    expect(controls.parentElement).toHaveClass("bg-header");
    expect(controls.children[0]).toHaveAttribute("role", "status");
    expect(controls.children[1]).toHaveAttribute("aria-label", "Terminal 1 monitor mode");
    expect(controls.children[1]).toHaveAttribute("aria-haspopup", "menu");
    expect(controls.children[1]).not.toHaveClass("border-border");
    expect(controls.children[1]).toHaveClass("bg-transparent");
    expect(controls.children[1]).toHaveTextContent("Errors Only");

    fireEvent.click(controls.children[1]!);

    const menu = screen.getByRole("menu", { name: "Terminal 1 monitor mode options" });
    expect(menu.parentElement).toBe(document.body);
    expect(menu).toHaveClass("shadow-none");

    const trigger = controls.children[1] as HTMLButtonElement;
    const triggerRect = new DOMRect(window.innerWidth - 140, 20, 128, 24);
    const menuRect = new DOMRect(0, 0, 240, 300);
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(triggerRect);
    vi.spyOn(menu, "getBoundingClientRect").mockReturnValue(menuRect);
    fireEvent(window, new Event("resize"));
    const maxLeft = Math.max(8, window.innerWidth - menuRect.width - 8);
    const expectedLeft = Math.min(maxLeft, Math.max(8, triggerRect.right - menuRect.width));
    expect(menu).toHaveStyle({ left: `${expectedLeft}px` });

    expect(screen.getAllByRole("menuitemradio")).toHaveLength(6);
    expect(screen.getByRole("menuitemradio", { name: "Errors Only" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("menuitemradio", { name: "Monitor" })).toHaveAttribute(
      "aria-checked",
      "false",
    );

    fireEvent.click(screen.getByRole("menuitemradio", { name: "Agent Monitor" }));
    expect(bridge.setTerminalMonitorMode).toHaveBeenCalledWith("session-1", "agent_monitor");
    expect(trigger).toHaveTextContent("Agent Monitor");
    act(() =>
      attentionListener?.({
        sessionId: "session-1",
        status: "thinking",
        attentionLevel: 0,
        userActionRequired: false,
        source: "jev",
        reason: "semantic_judgment",
        monitorMode: "agent_monitor",
        lastActivityAt: 1_700_000_000_001,
      }),
    );
    expect(screen.getByRole("status", { name: "◌ Thinking" })).toHaveTextContent("Thinking");
    act(() =>
      attentionListener?.({
        sessionId: "session-1",
        status: "waiting",
        attentionLevel: 0,
        userActionRequired: false,
        source: "jev",
        reason: "semantic_judgment",
        monitorMode: "agent_monitor",
        lastActivityAt: 1_700_000_000_002,
      }),
    );
    expect(screen.getByRole("status", { name: "◷ Waiting" })).toHaveTextContent("Waiting");

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Monitor" }));
    expect(bridge.setTerminalMonitorMode).toHaveBeenCalledWith("session-1", "monitor");
    expect(trigger).toHaveTextContent("Monitor");
    expect(trigger).toHaveAttribute("title", "Monitor");

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Mute" }));

    expect(bridge.setTerminalMonitorMode).toHaveBeenCalledWith("session-1", "mute");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("keeps the GPU renderer across focus changes and releases it when hidden", async () => {
    const bridge = {
      createTerminal: vi
        .fn()
        .mockResolvedValue({ id: "session-1", shell: "zsh", cwd: "/workspace" }),
      onTerminalData: vi.fn().mockReturnValue(() => {}),
      onTerminalExit: vi.fn().mockReturnValue(() => {}),
      onTerminalAttention: vi.fn().mockReturnValue(() => {}),
      setTerminalActive: vi.fn().mockResolvedValue(undefined),
      readyTerminal: vi.fn().mockResolvedValue(undefined),
      closeTerminal: vi.fn().mockResolvedValue(undefined),
    } as unknown as DesktopBridge;
    window.desktop = bridge;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    const panel = (active: boolean, webglEnabled = true) => (
      <TerminalPanel
        workspaceId="workspace-1"
        paneId="pane-1"
        title="Terminal 1"
        active={active}
        webglEnabled={webglEnabled}
      />
    );
    const view = render(panel(true));
    await waitFor(() => expect(bridge.readyTerminal).toHaveBeenCalled());
    const renderer = terminalTestState.addons.find(
      (addon) => addon instanceof WebglAddon,
    ) as WebglAddon;
    const dispose = vi.spyOn(renderer, "dispose");
    view.rerender(panel(false));
    view.rerender(panel(true));
    expect(dispose).not.toHaveBeenCalled();
    expect(terminalTestState.addons.filter((addon) => addon instanceof WebglAddon)).toHaveLength(1);
    view.rerender(panel(false, false));
    expect(dispose).toHaveBeenCalledTimes(1);
    view.rerender(panel(true));
    expect(terminalTestState.addons.filter((addon) => addon instanceof WebglAddon)).toHaveLength(2);
    expect(bridge.createTerminal).toHaveBeenCalledTimes(1);
    expect(bridge.closeTerminal).not.toHaveBeenCalled();
  });

  it("copies selected terminal text to the system clipboard", async () => {
    const bridge = {
      writeClipboardText: vi.fn().mockResolvedValue(undefined),
      createTerminal: vi.fn().mockResolvedValue({
        id: "session-1",
        shell: "zsh",
        cwd: "/workspace",
        monitorMode: "ignore_until_error",
      }),
      onTerminalData: vi.fn().mockReturnValue(() => {}),
      onTerminalExit: vi.fn().mockReturnValue(() => {}),
      onTerminalAttention: vi.fn().mockReturnValue(() => {}),
      setTerminalActive: vi.fn().mockResolvedValue(undefined),
      readyTerminal: vi.fn().mockResolvedValue(undefined),
      closeTerminal: vi.fn().mockResolvedValue(undefined),
    } as unknown as DesktopBridge;
    window.desktop = bridge;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );

    render(
      <TerminalPanel
        workspaceId="workspace-1"
        tabTitle="Space 1"
        paneId="pane-1"
        title="Terminal 1"
        active
      />,
    );

    await waitFor(() => expect(bridge.readyTerminal).toHaveBeenCalledWith("session-1"));
    terminalTestState.selection = "selected terminal output";
    act(() => terminalTestState.selectionListener?.());
    await waitFor(() =>
      expect(bridge.writeClipboardText).toHaveBeenCalledWith("selected terminal output"),
    );

    terminalTestState.selection = "";
    act(() => terminalTestState.selectionListener?.());
    expect(bridge.writeClipboardText).toHaveBeenCalledTimes(1);
  });

  it("opens the search bar with the configured find-in-terminal shortcut", async () => {
    const bridge = {
      createTerminal: vi.fn().mockResolvedValue({
        id: "session-1",
        shell: "zsh",
        cwd: "/workspace",
        monitorMode: "ignore_until_error",
      }),
      onTerminalData: vi.fn().mockReturnValue(() => {}),
      onTerminalExit: vi.fn().mockReturnValue(() => {}),
      onTerminalAttention: vi.fn().mockReturnValue(() => {}),
      setTerminalActive: vi.fn().mockResolvedValue(undefined),
      readyTerminal: vi.fn().mockResolvedValue(undefined),
      closeTerminal: vi.fn().mockResolvedValue(undefined),
    } as unknown as DesktopBridge;
    window.desktop = bridge;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );

    render(
      <TerminalPanel
        workspaceId="workspace-1"
        tabTitle="Space 1"
        paneId="pane-1"
        title="Terminal 1"
        active
      />,
    );

    await waitFor(() => expect(terminalTestState.keyHandler).toBeTypeOf("function"));
    const press = (init: KeyboardEventInit) =>
      act(() => {
        terminalTestState.keyHandler?.(new KeyboardEvent("keydown", init));
      });

    press({ key: "f", ctrlKey: true });
    expect(screen.getByPlaceholderText("Find in terminal")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Find in terminal" })).toHaveAttribute(
      "title",
      "Find in terminal (Ctrl+F)",
    );
    fireEvent.click(screen.getByRole("button", { name: "Close search" }));
    expect(screen.queryByPlaceholderText("Find in terminal")).not.toBeInTheDocument();

    press({ key: "f", ctrlKey: true, shiftKey: true });
    expect(screen.queryByPlaceholderText("Find in terminal")).not.toBeInTheDocument();

    act(() => {
      useUiStore.setState({
        shortcuts: defaultShortcuts.map((binding) =>
          binding.action === "find-in-terminal" ? { ...binding, shift: true } : { ...binding },
        ),
      });
    });
    expect(screen.getByRole("button", { name: "Find in terminal" })).toHaveAttribute(
      "title",
      "Find in terminal (Ctrl+Shift+F)",
    );

    press({ key: "f", ctrlKey: true });
    expect(screen.queryByPlaceholderText("Find in terminal")).not.toBeInTheDocument();
    press({ key: "f", ctrlKey: true, shiftKey: true });
    expect(screen.getByPlaceholderText("Find in terminal")).toBeInTheDocument();
  });
});
