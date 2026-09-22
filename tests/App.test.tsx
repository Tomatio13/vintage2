import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../src/renderer/App.js";
import { createMockWorkspaceAdapter } from "../src/renderer/adapters/mockWorkspaceAdapter.js";
import { WorkspaceProvider } from "../src/renderer/runtime/WorkspaceProvider.js";
import { defaultShortcuts, useUiStore } from "../src/renderer/store/uiStore.js";
import type { DesktopBridge } from "../src/shared/desktop.js";

vi.mock("../src/renderer/components/TerminalPanel.js", () => ({
  TerminalPanel: () => <div data-testid="terminal-panel" />,
}));

describe("VINTAGE workspace shell", () => {
  afterEach(() => {
    delete window.desktop;
  });

  beforeEach(() => {
    useUiStore.setState({
      sidebarOpen: true,
      sidePaneOpen: true,
      settingsOpen: false,
      shortcuts: defaultShortcuts.map((binding) => ({ ...binding })),
    });
  });
  function renderApp() {
    return render(
      <WorkspaceProvider adapter={createMockWorkspaceAdapter({ delay: async () => {} })}>
        <App />
      </WorkspaceProvider>,
    );
  }

  it("shows the VINTAGE workspace navigator and right browser/files pane", () => {
    renderApp();
    expect(screen.getByText("Your workspace, ready when you are")).toBeInTheDocument();
    expect(screen.getByText("WORKSPACE")).toBeInTheDocument();
    expect(screen.getByLabelText("Drag window")).toBeInTheDocument();
    const sidebarToggle = screen.getByRole("button", { name: "Toggle sidebar" });
    expect(sidebarToggle).toBeInTheDocument();
    expect(sidebarToggle.querySelector("img")).toHaveAttribute("src", "./favicon.svg");
    expect(screen.getByRole("button", { name: "New terminal" })).toBeInTheDocument();
    expect(screen.queryByText("Ctrl+Shift+N")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Browser address" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Files" }));
    expect(screen.getByText("Open a workspace to browse its files.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Browser" }));
    expect(screen.getByRole("textbox", { name: "Browser address" })).toBeInTheDocument();
  });

  it("opens a double-clicked file in a full-height root split", async () => {
    window.desktop = {
      platform: "linux",
      chooseWorkspace: vi.fn().mockResolvedValue({
        id: "workspace",
        name: "workspace",
        path: "/workspace",
      }),
      listWorkspaceFiles: vi
        .fn()
        .mockResolvedValue([{ kind: "file", name: "notes.md", path: "docs/notes.md" }]),
      readWorkspaceFile: vi.fn().mockResolvedValue({
        path: "docs/notes.md",
        content: "notes",
        truncated: false,
      }),
      getWindowState: vi.fn().mockResolvedValue({
        isMaximized: false,
        isFullScreen: false,
        macOSMajorVersion: null,
        supportsNativeRoundedCorners: false,
      }),
      onWindowStateChanged: vi.fn().mockReturnValue(() => {}),
    } as unknown as DesktopBridge;

    renderApp();
    fireEvent.click(screen.getAllByRole("button", { name: "Open workspace" }).at(-1)!);
    const activeTab = (await screen.findByTitle("Double-click to rename tab")).closest(
      ".workspace-tab",
    );
    expect(activeTab).toHaveAttribute("data-active", "true");
    fireEvent.doubleClick(screen.getByTitle("Double-click to rename tab"));
    const tabName = screen.getByRole("textbox", { name: "Rename tab" });
    fireEvent.change(tabName, { target: { value: "Backend" } });
    fireEvent.keyDown(tabName, { key: "Enter" });
    expect(screen.getAllByText("Backend").length).toBeGreaterThanOrEqual(2);

    const splitDown = await screen.findByRole("button", { name: "Split terminal horizontally" });
    fireEvent.click(splitDown);
    fireEvent.click(screen.getByRole("button", { name: "Files" }));
    const file = await screen.findByRole("button", { name: "notes.md" });
    fireEvent.doubleClick(file);

    await waitFor(() => {
      const filePane = document.querySelector<HTMLElement>("[data-pane-kind=file]");
      expect(filePane).not.toBeNull();
      expect(filePane!.style.top).toBe("0%");
      expect(filePane!.style.height).toBe("100%");
    });
  });

  it("executes shortcuts before terminal input stops key propagation", () => {
    renderApp();
    const terminal = document.createElement("div");
    terminal.className = "xterm";
    const input = document.createElement("textarea");
    input.addEventListener("keydown", (event) => event.stopPropagation());
    terminal.append(input);
    document.body.append(terminal);
    fireEvent.keyDown(input, { key: "b", ctrlKey: true });
    expect(screen.queryByText("WORKSPACE")).not.toBeInTheDocument();
    terminal.remove();
  });

  it("rebinds and executes a saved shortcut", () => {
    renderApp();
    fireEvent.click(screen.getAllByLabelText("Open settings")[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Shortcuts" }));
    fireEvent.click(screen.getByLabelText("Set Toggle sidebar shortcut"));
    fireEvent.keyDown(window, { key: "s", altKey: true });
    expect(screen.getByLabelText("Set Toggle sidebar shortcut")).toHaveTextContent("Alt+S");
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    fireEvent.keyDown(window, { key: "s", altKey: true });
    expect(screen.queryByText("WORKSPACE")).not.toBeInTheDocument();
  });

  it("opens the full VINTAGE settings page with appearance choices", () => {
    renderApp();
    fireEvent.click(screen.getAllByLabelText("Open settings")[0]!);
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Graphite A neutral charcoal workspace/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Terminal" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });
});
