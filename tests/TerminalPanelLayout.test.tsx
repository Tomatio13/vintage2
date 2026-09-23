import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TerminalPanel } from "../src/renderer/components/TerminalPanel.js";
import type { DesktopBridge, TerminalAttentionState } from "../src/shared/desktop.js";

const terminalTestState = vi.hoisted(() => ({
  selection: "",
  selectionListener: undefined as (() => void) | undefined,
}));

vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    cols = 80;
    rows = 24;
    options = {};

    loadAddon() {}
    open() {}
    focus() {}
    write() {}
    writeln() {}
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

    expect(screen.getAllByRole("menuitemradio")).toHaveLength(5);
    expect(screen.getByRole("menuitemradio", { name: "Errors Only" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("menuitemradio", { name: "Monitor" })).toHaveAttribute(
      "aria-checked",
      "false",
    );

    fireEvent.click(screen.getByRole("menuitemradio", { name: "Monitor" }));
    expect(bridge.setTerminalMonitorMode).toHaveBeenCalledWith("session-1", "monitor");
    expect(trigger).toHaveTextContent("Monitor");
    expect(trigger).toHaveAttribute("title", "Monitor");

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Mute" }));

    expect(bridge.setTerminalMonitorMode).toHaveBeenCalledWith("session-1", "mute");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
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
});
