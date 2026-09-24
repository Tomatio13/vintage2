import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../src/renderer/App.js";
import { createMockWorkspaceAdapter } from "../src/renderer/adapters/mockWorkspaceAdapter.js";
import { WorkspaceProvider } from "../src/renderer/runtime/WorkspaceProvider.js";
import {
  DEFAULT_BROWSER_START_URL,
  defaultShortcuts,
  useUiStore,
} from "../src/renderer/store/uiStore.js";
import type {
  DesktopBridge,
  RestoredWorkspaceState,
  TerminalAttentionState,
  WorkspaceStateSnapshot,
} from "../src/shared/desktop.js";

vi.mock("../src/renderer/components/TerminalPanel.js", () => ({
  TerminalPanel: ({
    paneId,
    title,
    onAttentionChange,
  }: {
    paneId: string;
    title: string;
    onAttentionChange?(paneId: string, state: TerminalAttentionState | null): void;
  }) => (
    <div>
      <button
        data-testid={`emit-${title}`}
        data-pane-id={paneId}
        onClick={() =>
          onAttentionChange?.(paneId, {
            sessionId: paneId,
            status: "failed",
            attentionLevel: 3,
            userActionRequired: true,
            source: "shell",
            lastExitCode: 1,
            lastActivityAt: 1_700_000_000_000,
          })
        }
      >
        {title}
      </button>
      <button
        data-testid={`resolve-${title}-${paneId}`}
        onClick={() =>
          onAttentionChange?.(paneId, {
            sessionId: paneId,
            status: "idle",
            attentionLevel: 0,
            userActionRequired: false,
            source: "session",
            lastActivityAt: Date.now(),
          })
        }
      >
        Resolve {title}
      </button>
    </div>
  ),
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
      browserDefaultUrl: DEFAULT_BROWSER_START_URL,
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

  it("opens a local Home space with Files rooted at the home directory on startup", async () => {
    window.desktop = {
      getHomeWorkspace: vi.fn().mockResolvedValue({
        id: "home",
        name: "Home",
        path: "/home/test",
        kind: "home",
      }),
      listWorkspaceFiles: vi.fn().mockResolvedValue([]),
      getWindowState: vi.fn().mockResolvedValue({
        isMaximized: false,
        isFullScreen: false,
        macOSMajorVersion: null,
        supportsNativeRoundedCorners: false,
      }),
      onWindowStateChanged: vi.fn().mockReturnValue(() => {}),
    } as unknown as DesktopBridge;

    renderApp();

    expect(await screen.findByText("Home", { exact: true })).toBeInTheDocument();
    expect(screen.getAllByText("Space 1", { exact: true })).toHaveLength(2);
    expect(await screen.findByText("Home directory")).toBeInTheDocument();
    expect(screen.getByTestId("emit-Terminal 1")).toBeInTheDocument();
    expect(screen.queryByText("Your workspace, ready when you are")).not.toBeInTheDocument();
  });

  it("restores saved Project Spaces, split layout, open files, and active selections", async () => {
    const saved: RestoredWorkspaceState = {
      version: 1,
      activeWorkspaceId: "project-1",
      workspaces: [
        {
          id: "vintage:home",
          name: "Home",
          path: "/home/test",
          kind: "home",
          available: true,
          tabs: [
            {
              id: "home-space",
              title: "Home Space",
              panes: [{ id: "home-terminal", title: "Terminal 1", kind: "terminal" }],
              layout: { type: "pane", paneId: "home-terminal" },
              activePaneId: "home-terminal",
            },
          ],
          activeTabId: "home-space",
        },
        {
          id: "project-1",
          name: "sample-project",
          path: "/workspace/sample-project",
          kind: "project",
          available: true,
          tabs: [
            {
              id: "space-1",
              title: "Backend",
              panes: [
                { id: "terminal-1", title: "Terminal 1", kind: "terminal" },
                { id: "file-1", title: "notes.md", kind: "file", path: "docs/notes.md" },
              ],
              layout: {
                type: "split",
                splitId: "split-1",
                axis: "horizontal",
                ratio: 0.63,
                first: { type: "pane", paneId: "terminal-1" },
                second: { type: "pane", paneId: "file-1" },
              },
              activePaneId: "file-1",
            },
            {
              id: "space-2",
              title: "Frontend",
              panes: [{ id: "terminal-2", title: "Terminal 1", kind: "terminal" }],
              layout: { type: "pane", paneId: "terminal-2" },
              activePaneId: "terminal-2",
            },
          ],
          activeTabId: "space-2",
        },
      ],
    };
    const saveWorkspaceState = vi.fn().mockResolvedValue(undefined);
    const readWorkspaceFile = vi.fn().mockResolvedValue({
      path: "docs/notes.md",
      content: "persisted document content",
      truncated: false,
    });
    window.desktop = {
      loadWorkspaceState: vi.fn().mockResolvedValue(saved),
      saveWorkspaceState,
      readWorkspaceFile,
      listWorkspaceFiles: vi.fn().mockResolvedValue([]),
      getWindowState: vi.fn().mockResolvedValue({
        isMaximized: false,
        isFullScreen: false,
        macOSMajorVersion: null,
        supportsNativeRoundedCorners: false,
      }),
      onWindowStateChanged: vi.fn().mockReturnValue(() => {}),
    } as unknown as DesktopBridge;

    renderApp();

    expect(await screen.findByText("persisted document content")).toBeInTheDocument();
    expect(readWorkspaceFile).toHaveBeenCalledWith("project-1", "docs/notes.md");
    expect(document.querySelector('[data-pane-id="terminal-1"]')).toBeInTheDocument();
    await waitFor(() => expect(saveWorkspaceState).toHaveBeenCalled());
    const latest = saveWorkspaceState.mock.calls.at(-1)![0] as WorkspaceStateSnapshot;
    expect(latest.activeWorkspaceId).toBe("project-1");
    expect(latest.workspaces.find((workspace) => workspace.id === "project-1")).toMatchObject({
      activeTabId: "space-2",
      tabs: [
        {
          id: "space-1",
          layout: { type: "split", ratio: 0.63 },
          activePaneId: "file-1",
        },
        { id: "space-2", title: "Frontend" },
      ],
    });
  });

  it("keeps a missing Project saved and restores its panes after locating the folder", async () => {
    const saved: RestoredWorkspaceState = {
      version: 1,
      activeWorkspaceId: "missing-project",
      workspaces: [
        {
          id: "vintage:home",
          name: "Home",
          path: "/home/test",
          kind: "home",
          available: true,
          tabs: [],
          activeTabId: "",
        },
        {
          id: "missing-project",
          name: "Lost Project",
          path: "/old/location/lost-project",
          kind: "project",
          available: false,
          tabs: [
            {
              id: "saved-space",
              title: "Saved Space",
              panes: [{ id: "saved-terminal", title: "Terminal 1", kind: "terminal" }],
              layout: { type: "pane", paneId: "saved-terminal" },
              activePaneId: "saved-terminal",
            },
          ],
          activeTabId: "saved-space",
        },
      ],
    };
    const locateWorkspace = vi.fn().mockResolvedValue({
      id: "missing-project",
      name: "lost-project",
      path: "/new/location/lost-project",
      kind: "project",
    });
    const saveWorkspaceState = vi.fn().mockResolvedValue(undefined);
    window.desktop = {
      loadWorkspaceState: vi.fn().mockResolvedValue(saved),
      saveWorkspaceState,
      locateWorkspace,
      listWorkspaceFiles: vi.fn().mockResolvedValue([]),
      getWindowState: vi.fn().mockResolvedValue({
        isMaximized: false,
        isFullScreen: false,
        macOSMajorVersion: null,
        supportsNativeRoundedCorners: false,
      }),
      onWindowStateChanged: vi.fn().mockReturnValue(() => {}),
    } as unknown as DesktopBridge;

    renderApp();

    expect(await screen.findByText("Project folder is unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Saved Space" })).toBeInTheDocument();
    expect(document.querySelector('[data-pane-id="saved-terminal"]')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Locate folder" }));

    await waitFor(() => expect(locateWorkspace).toHaveBeenCalledWith("missing-project"));
    await waitFor(() =>
      expect(document.querySelector('[data-pane-id="saved-terminal"]')).toBeInTheDocument(),
    );
    await waitFor(() => expect(saveWorkspaceState).toHaveBeenCalled());
    const latest = saveWorkspaceState.mock.calls.at(-1)![0] as WorkspaceStateSnapshot;
    expect(latest.workspaces.find((workspace) => workspace.id === "missing-project")).toMatchObject(
      {
        path: "/new/location/lost-project",
        activeTabId: "saved-space",
      },
    );
  });

  it("removes a Project from the saved list without touching its directory", async () => {
    const saved: RestoredWorkspaceState = {
      version: 1,
      activeWorkspaceId: "project-1",
      workspaces: [
        {
          id: "vintage:home",
          name: "Home",
          path: "/home/test",
          kind: "home",
          available: true,
          tabs: [],
          activeTabId: "",
        },
        {
          id: "project-1",
          name: "Project",
          path: "/workspace/project",
          kind: "project",
          available: false,
          tabs: [],
          activeTabId: "",
        },
      ],
    };
    const saveWorkspaceState = vi.fn().mockResolvedValue(undefined);
    window.desktop = {
      loadWorkspaceState: vi.fn().mockResolvedValue(saved),
      saveWorkspaceState,
      listWorkspaceFiles: vi.fn().mockResolvedValue([]),
      getWindowState: vi.fn().mockResolvedValue({
        isMaximized: false,
        isFullScreen: false,
        macOSMajorVersion: null,
        supportsNativeRoundedCorners: false,
      }),
      onWindowStateChanged: vi.fn().mockReturnValue(() => {}),
    } as unknown as DesktopBridge;

    renderApp();

    expect(await screen.findByText("Project folder is unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove Project from list" }));
    await waitFor(() => {
      const latest = saveWorkspaceState.mock.calls.at(-1)?.[0] as
        | WorkspaceStateSnapshot
        | undefined;
      expect(latest?.workspaces.some((workspace) => workspace.id === "project-1")).toBe(false);
    });
    expect(screen.queryByText("Project folder is unavailable")).not.toBeInTheDocument();
    expect(screen.getByText("Home", { exact: true })).toBeInTheDocument();
  });

  it("shows the VINTAGE workspace navigator and right browser/files pane", () => {
    renderApp();
    expect(screen.getByText("Your workspace, ready when you are")).toBeInTheDocument();
    expect(screen.getByText("Workspace")).toBeInTheDocument();
    expect(screen.getByLabelText("Drag window")).toBeInTheDocument();
    const sidebarToggle = screen.getByRole("button", { name: "Toggle sidebar" });
    expect(sidebarToggle).toBeInTheDocument();
    expect(sidebarToggle.querySelector("img")).toHaveAttribute("src", "./favicon.svg");
    expect(sidebarToggle.querySelector("img")).toHaveClass("size-5");
    expect(sidebarToggle).not.toHaveClass("border-r");
    expect(sidebarToggle.closest(".vintage-content-card")).toHaveClass("border-l-0");
    const newSpaceButton = screen.getByText("New space").closest("button")!;
    expect(newSpaceButton).toBeInTheDocument();
    expect(newSpaceButton).not.toHaveClass("border-border");
    expect(newSpaceButton.querySelector("svg")).toHaveClass("size-4");
    const browserPaneButton = screen.getByRole("button", { name: "Toggle browser pane" });
    expect(browserPaneButton).toHaveClass("size-7");
    expect(browserPaneButton.querySelector("svg")).toHaveClass("size-4");
    const maximizeButton = screen.getByRole("button", { name: "Maximize window" });
    expect(maximizeButton).toHaveClass("size-7");
    expect(maximizeButton.querySelector("svg")).toHaveClass("size-4");
    expect(screen.queryByText("Ctrl+Shift+N")).not.toBeInTheDocument();
    expect(screen.getByText("Open a workspace to browse its files.")).toBeInTheDocument();
    const paneTabs = screen
      .getAllByRole("button")
      .filter((button) => ["Files", "Browser"].includes(button.textContent?.trim() ?? ""));
    expect(paneTabs.map((button) => button.textContent?.trim())).toEqual(["Files", "Browser"]);
    expect(paneTabs[0]).toHaveClass("text-ui-sm");
    expect(paneTabs[0]?.querySelector("svg")).toHaveClass("size-3.5");
    fireEvent.click(screen.getByRole("button", { name: "Browser" }));
    expect(screen.getByRole("textbox", { name: "Browser address" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Files" }));
    expect(screen.getByText("Open a workspace to browse its files.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Browser" }));
    expect(screen.getByRole("textbox", { name: "Browser address" })).toBeInTheDocument();
  });

  it("preserves browser tabs and their page state when the right pane is toggled", () => {
    window.desktop = {
      getWindowState: vi.fn().mockResolvedValue({
        isMaximized: false,
        isFullScreen: false,
        macOSMajorVersion: null,
        supportsNativeRoundedCorners: false,
      }),
      onWindowStateChanged: vi.fn().mockReturnValue(() => {}),
    } as unknown as DesktopBridge;

    renderApp();

    fireEvent.click(screen.getByRole("button", { name: "Browser" }));
    const firstWebview = document.querySelector(".embedded-webview");
    expect(firstWebview).not.toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "Browser address" }), {
      target: { value: "https://first.example/" },
    });

    fireEvent.click(screen.getByRole("button", { name: "New browser tab" }));
    const secondWebview = document.querySelectorAll(".embedded-webview")[1];
    expect(secondWebview).toBeDefined();
    const secondAddress = screen.getByRole("textbox", { name: "Browser address" });
    fireEvent.change(secondAddress, { target: { value: "https://second.example/" } });

    const togglePane = screen.getByRole("button", { name: "Toggle browser pane" });
    fireEvent.click(togglePane);
    fireEvent.click(togglePane);

    expect(screen.getByRole("button", { name: "Browser 2" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(document.querySelectorAll(".embedded-webview")).toHaveLength(2);
    expect(document.querySelectorAll(".embedded-webview")[0]).toBe(firstWebview);
    expect(document.querySelectorAll(".embedded-webview")[1]).toBe(secondWebview);
    expect(screen.getByRole("textbox", { name: "Browser address" })).toBe(secondAddress);
    expect(secondAddress).toHaveValue("https://second.example/");

    fireEvent.click(screen.getByRole("button", { name: "Browser" }));
    expect(screen.getByRole("textbox", { name: "Browser address" })).toHaveValue(
      "https://first.example/",
    );
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
    expect(screen.getAllByRole("button", { name: "Close notes.md" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Close notes.md" }));
    await waitFor(() => expect(document.querySelector('[data-pane-kind="file"]')).toBeNull());
  });

  it("lists background attention and jumps to its terminal", async () => {
    const dismissTerminalAttention = vi.fn().mockResolvedValue(undefined);
    window.desktop = {
      platform: "linux",
      chooseWorkspace: vi.fn().mockResolvedValue({
        id: "workspace",
        name: "workspace",
        path: "/workspace",
      }),
      listWorkspaceFiles: vi.fn().mockResolvedValue([]),
      getWindowState: vi.fn().mockResolvedValue({
        isMaximized: false,
        isFullScreen: false,
        macOSMajorVersion: null,
        supportsNativeRoundedCorners: false,
      }),
      onWindowStateChanged: vi.fn().mockReturnValue(() => {}),
      dismissTerminalAttention,
    } as unknown as DesktopBridge;

    renderApp();
    fireEvent.click(screen.getAllByRole("button", { name: "Open workspace" }).at(-1)!);
    const firstTerminal = await screen.findByTestId("emit-Terminal 1");
    const closeTerminal = screen.getByRole("button", { name: "Close Terminal 1" });
    expect(closeTerminal).not.toHaveClass("border");
    expect(closeTerminal).not.toHaveClass("bg-background/80");
    expect(closeTerminal).toHaveClass("z-20");
    expect(closeTerminal.querySelector("svg")).toHaveClass("size-4");
    fireEvent.click(screen.getByText("New space"));

    const tabs = document.querySelectorAll(".workspace-tab");
    expect(tabs[0]).toHaveTextContent("Space 1");
    expect(tabs[1]).toHaveTextContent("Space 2");
    expect(screen.getAllByTestId("emit-Terminal 1")).toHaveLength(2);
    expect(tabs[0]).toHaveAttribute("data-active", "false");
    expect(tabs[1]).toHaveAttribute("data-active", "true");
    fireEvent.click(await screen.findByRole("button", { name: "Split terminal horizontally" }));
    expect(screen.getByTestId("emit-Terminal 2")).toBeInTheDocument();

    fireEvent.click(firstTerminal);
    const paneId = firstTerminal.getAttribute("data-pane-id");
    const attention = await screen.findByRole("button", { name: "HIGH Terminal 1: Failed" });
    expect(screen.getByText("Attention")).toBeInTheDocument();
    expect(screen.getByText("workspace · Space 1")).toBeInTheDocument();
    expect(screen.getAllByText("Source: SHELL")).toHaveLength(2);
    expect(
      screen.getByRole("status", { name: "HIGH attention from Terminal 1" }),
    ).toBeInTheDocument();
    fireEvent.click(firstTerminal);
    expect(screen.getAllByRole("status", { name: "HIGH attention from Terminal 1" })).toHaveLength(
      1,
    );

    fireEvent.click(attention);
    expect(tabs[0]).toHaveAttribute("data-active", "true");
    expect(tabs[1]).toHaveAttribute("data-active", "false");

    fireEvent.click(screen.getByRole("button", { name: "Dismiss Terminal 1 attention" }));
    expect(dismissTerminalAttention).toHaveBeenCalledWith(paneId);
    fireEvent.click(screen.getByTestId(`resolve-Terminal 1-${paneId}`));
    fireEvent.click(screen.getByText(/Attention history/));
    expect(
      await screen.findByRole("button", { name: "HIGH Terminal 1: Failed (dismissed)" }),
    ).toBeInTheDocument();

    fireEvent.click(closeTerminal);
    await waitFor(() => expect(firstTerminal).not.toBeInTheDocument());
  });

  it("navigates to the pane targeted by a native notification click", async () => {
    let notificationClick: ((paneId: string) => void) | undefined;
    window.desktop = {
      platform: "linux",
      chooseWorkspace: vi.fn().mockResolvedValue({
        id: "workspace",
        name: "workspace",
        path: "/workspace",
      }),
      listWorkspaceFiles: vi.fn().mockResolvedValue([]),
      getWindowState: vi.fn().mockResolvedValue({
        isMaximized: false,
        isFullScreen: false,
        macOSMajorVersion: null,
        supportsNativeRoundedCorners: false,
      }),
      onWindowStateChanged: vi.fn().mockReturnValue(() => {}),
      onAttentionNotificationClick: vi.fn((listener) => {
        notificationClick = listener;
        return () => {
          notificationClick = undefined;
        };
      }),
    } as unknown as DesktopBridge;

    renderApp();
    fireEvent.click(screen.getAllByRole("button", { name: "Open workspace" }).at(-1)!);
    const firstPane = await screen.findByTestId("emit-Terminal 1");
    const firstPaneId = firstPane.getAttribute("data-pane-id")!;
    fireEvent.click(screen.getByText("New space"));
    const tabs = document.querySelectorAll(".workspace-tab");
    expect(tabs[1]).toHaveAttribute("data-active", "true");

    expect(notificationClick).toBeTypeOf("function");
    act(() => notificationClick?.(firstPaneId));

    await waitFor(() => {
      const updatedTabs = document.querySelectorAll(".workspace-tab");
      expect(updatedTabs[0]).toHaveAttribute("data-active", "true");
      expect(updatedTabs[1]).toHaveAttribute("data-active", "false");
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
    expect(screen.queryByText("Workspace")).not.toBeInTheDocument();
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
    expect(screen.queryByText("Workspace")).not.toBeInTheDocument();
  });

  it("opens the full VINTAGE settings page with appearance choices", () => {
    renderApp();
    fireEvent.click(screen.getAllByLabelText("Open settings")[0]!);
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Graphite A neutral charcoal workspace/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Terminal" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Integrations" }));
    expect(screen.getByText("Desktop notifications")).toBeInTheDocument();
    expect(screen.getByText(/Agent-specific hooks are not used/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("saves the default browser URL and uses it when opening the Browser pane", async () => {
    renderApp();
    fireEvent.click(screen.getAllByLabelText("Open settings")[0]!);
    const settings = screen.getByRole("dialog", { name: "Settings" });
    fireEvent.click(within(settings).getByRole("button", { name: "Browser" }));

    const input = within(settings).getByRole("textbox", { name: "Default browser URL" });
    expect(input).toHaveValue(DEFAULT_BROWSER_START_URL);
    fireEvent.change(input, { target: { value: "example.org/docs" } });
    const save = within(settings).getByRole("button", { name: "Save changes" });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);

    const expectedUrl = "https://example.org/docs";
    await waitFor(() => expect(useUiStore.getState().browserDefaultUrl).toBe(expectedUrl));
    const persistedSettings = JSON.parse(
      localStorage.getItem("ai-workspace-starter-ui") ?? "{}",
    ) as {
      state?: { browserDefaultUrl?: string };
    };
    expect(persistedSettings.state?.browserDefaultUrl).toBe(expectedUrl);

    fireEvent.click(screen.getByRole("button", { name: "Browser" }));
    expect(screen.getByRole("textbox", { name: "Browser address" })).toHaveValue(expectedUrl);
  });

  it("rejects an unsupported default browser URL before saving", async () => {
    renderApp();
    fireEvent.click(screen.getAllByLabelText("Open settings")[0]!);
    const settings = screen.getByRole("dialog", { name: "Settings" });
    fireEvent.click(within(settings).getByRole("button", { name: "Browser" }));

    const input = within(settings).getByRole("textbox", { name: "Default browser URL" });
    fireEvent.change(input, { target: { value: "javascript:alert(1)" } });
    const save = within(settings).getByRole("button", { name: "Save changes" });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);

    expect(await within(settings).findByRole("alert")).toHaveTextContent(
      "Only HTTP and HTTPS addresses are supported",
    );
    expect(useUiStore.getState().browserDefaultUrl).toBe(DEFAULT_BROWSER_START_URL);
  });

  it("loads and saves app-wide attention preferences", async () => {
    const attentionSettings = {
      debounceMs: 800,
      agentMonitorIntervalSeconds: 10,
      attentionThreshold: 1 as const,
      notificationThreshold: 3 as const,
    };
    const setAttentionSettings = vi.fn().mockResolvedValue({
      debounceMs: 1500,
      agentMonitorIntervalSeconds: 10,
      attentionThreshold: 2,
      notificationThreshold: 3,
    });
    window.desktop = {
      platform: "linux",
      getWindowState: vi.fn().mockResolvedValue({
        isMaximized: false,
        isFullScreen: false,
        macOSMajorVersion: null,
        supportsNativeRoundedCorners: false,
      }),
      onWindowStateChanged: vi.fn().mockReturnValue(() => {}),
      getJevSettings: vi.fn().mockResolvedValue({
        configured: false,
        source: "none",
        secureStorageAvailable: true,
        storageBackend: null,
      }),
      getAttentionSettings: vi.fn().mockResolvedValue(attentionSettings),
      setAttentionSettings,
    } as unknown as DesktopBridge;

    renderApp();
    fireEvent.click(screen.getAllByLabelText("Open settings")[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Attention" }));
    const debounce = await screen.findByRole("spinbutton", { name: "Attention debounce" });
    expect(debounce).toHaveValue(800);
    fireEvent.change(debounce, { target: { value: "1500" } });
    const agentMonitorInterval = screen.getByRole("spinbutton", {
      name: "Agent Monitor interval",
    });
    expect(agentMonitorInterval).toHaveValue(10);
    fireEvent.change(agentMonitorInterval, { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(setAttentionSettings).toHaveBeenCalledWith({
        debounceMs: 1500,
        agentMonitorIntervalSeconds: 25,
        attentionThreshold: 1,
        notificationThreshold: 3,
      }),
    );
  });

  it("saves a TypeSafe API key from Integrations without reading it back", async () => {
    const setJevApiKey = vi.fn().mockResolvedValue({
      configured: true,
      source: "saved",
      secureStorageAvailable: true,
      storageBackend: "test-keyring",
    });
    window.desktop = {
      platform: "linux",
      getWindowState: vi.fn().mockResolvedValue({
        isMaximized: false,
        isFullScreen: false,
        macOSMajorVersion: null,
        supportsNativeRoundedCorners: false,
      }),
      onWindowStateChanged: vi.fn().mockReturnValue(() => {}),
      getJevSettings: vi.fn().mockResolvedValue({
        configured: true,
        source: "environment",
        secureStorageAvailable: true,
        storageBackend: "test-keyring",
      }),
      setJevApiKey,
      clearJevApiKey: vi.fn(),
    } as unknown as DesktopBridge;

    renderApp();
    fireEvent.click(screen.getAllByLabelText("Open settings")[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Integrations" }));

    expect(await screen.findByText("Environment variable")).toBeInTheDocument();
    const input = screen.getByLabelText("TypeSafe API key");
    expect(input).toHaveAttribute("type", "password");
    fireEvent.change(input, { target: { value: "new-secret-key" } });
    fireEvent.click(screen.getByRole("button", { name: "Save API key" }));

    await waitFor(() => expect(setJevApiKey).toHaveBeenCalledWith("new-secret-key"));
    expect(await screen.findByText("Saved securely")).toBeInTheDocument();
    expect(screen.getByText("API key saved and activated.")).toBeInTheDocument();
    expect(input).toHaveValue("");
  });
});
