import { fireEvent, render, screen, waitFor, type RenderResult } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FileViewer } from "../src/renderer/components/FileViewer.js";
import { TerminalPanel } from "../src/renderer/components/TerminalPanel.js";
import { initialBrowserTabs, useUiStore } from "../src/renderer/store/uiStore.js";
import type { DesktopBridge } from "../src/shared/desktop.js";

afterEach(() => {
  delete window.desktop;
});

describe("FileViewer", () => {
  it("uses a dedicated always-scrollable content region", async () => {
    window.desktop = {
      readWorkspaceFile: vi.fn().mockResolvedValue({
        path: "docs/notes.md",
        content: "line\n".repeat(4_000),
        truncated: false,
      }),
    } as unknown as DesktopBridge;
    render(
      <div style={{ height: 200 }}>
        <FileViewer workspaceId="workspace" path="docs/notes.md" />
      </div>,
    );
    expect(screen.getByText("notes.md").parentElement?.querySelector("svg")).toHaveClass(
      "text-foreground",
    );
    await waitFor(() =>
      expect(screen.getByTestId("file-viewer-scroll")).toHaveClass("overflow-y-scroll"),
    );
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
  });

  it("switches Markdown between rendered preview and editing", async () => {
    const content = "# Notes\n\n- First item";
    window.desktop = {
      readWorkspaceFile: vi.fn().mockResolvedValue({
        path: "docs/notes.md",
        content,
        truncated: false,
      }),
    } as unknown as DesktopBridge;

    render(<FileViewer workspaceId="workspace" path="docs/notes.md" />);

    const previewButton = screen.getByRole("button", { name: "Preview" });
    const sourceButton = screen.getByRole("button", { name: "Edit" });
    expect(previewButton).toHaveAttribute("aria-pressed", "true");
    expect(sourceButton).toHaveAttribute("aria-pressed", "false");
    expect(await screen.findByRole("heading", { name: "Notes" })).toBeInTheDocument();

    fireEvent.click(sourceButton);

    expect(sourceButton).toHaveAttribute("aria-pressed", "true");
    expect(
      (screen.getByRole("textbox", { name: "Markdown editor" }) as HTMLTextAreaElement).value,
    ).toBe(content);
  });

  it("renders Markdown headings with slug ids for anchors", async () => {
    window.desktop = {
      readWorkspaceFile: vi.fn().mockResolvedValue({
        path: "docs/notes.md",
        content: "# Getting started\n\nBody text",
        truncated: false,
      }),
    } as unknown as DesktopBridge;

    render(<FileViewer workspaceId="workspace" path="docs/notes.md" />);

    const heading = await screen.findByRole("heading", { name: "Getting started" });
    expect(heading).toHaveAttribute("id", "getting-started");
  });
});

describe("FileViewer Markdown links", () => {
  const content = [
    "# Guide",
    "",
    "See [setup](#setup), [overview](overview.md), [site](https://example.com),",
    "and [script](javascript:alert(1)).",
    "",
    "## Setup",
  ].join("\n");

  beforeEach(() => {
    useUiStore.setState({
      activeSidePaneTabId: "files",
      browserTabs: [...initialBrowserTabs],
      browserTabCounter: 2,
      browserNavigateRequest: null,
      sidePaneOpen: false,
    });
  });

  afterEach(() => {
    useUiStore.setState({
      activeSidePaneTabId: "files",
      browserTabs: [...initialBrowserTabs],
      browserTabCounter: 2,
      browserNavigateRequest: null,
      sidePaneOpen: false,
    });
  });

  function renderMarkdownViewer(onOpenFile: (path: string) => void = () => {}): RenderResult {
    window.desktop = {
      readWorkspaceFile: vi.fn().mockResolvedValue({
        path: "docs/guide.md",
        content,
        truncated: false,
      }),
    } as unknown as DesktopBridge;
    return render(
      <FileViewer workspaceId="workspace" path="docs/guide.md" onOpenFile={onOpenFile} />,
    );
  }

  it("keeps the Markdown DOM stable across parent re-renders so real clicks land", async () => {
    const view = renderMarkdownViewer();
    const anchor = await screen.findByRole("link", { name: "overview" });

    view.rerender(
      <FileViewer workspaceId="workspace" path="docs/guide.md" onOpenFile={() => {}} />,
    );

    expect(screen.getByRole("link", { name: "overview" })).toBe(anchor);
  });

  it("opens relative file links in the file preview", async () => {
    const onOpenFile = vi.fn();
    renderMarkdownViewer(onOpenFile);

    fireEvent.click(await screen.findByRole("link", { name: "overview" }));

    expect(onOpenFile).toHaveBeenCalledWith("docs/overview.md");
  });

  it("routes plain HTTP links to the built-in browser and Cmd/Ctrl+click to a new tab", async () => {
    renderMarkdownViewer();

    fireEvent.click(await screen.findByRole("link", { name: "site" }));

    let state = useUiStore.getState();
    expect(state.sidePaneOpen).toBe(true);
    expect(state.activeSidePaneTabId).toBe("browser-1");
    expect(state.browserTabs[0]).toMatchObject({
      id: "browser-1",
      initialUrl: "https://example.com/",
      mounted: true,
    });

    fireEvent.click(screen.getByRole("link", { name: "site" }), { ctrlKey: true });

    state = useUiStore.getState();
    expect(state.browserTabs).toHaveLength(2);
    expect(state.browserTabs[1]).toMatchObject({
      id: "browser-2",
      initialUrl: "https://example.com/",
    });
    expect(state.activeSidePaneTabId).toBe("browser-2");
  });

  it("scrolls to slug anchors inside the document without opening anything", async () => {
    const scrollSpy = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
    renderMarkdownViewer();

    fireEvent.click(await screen.findByRole("link", { name: "setup" }));

    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(scrollSpy.mock.contexts[0]).toHaveAttribute("id", "setup");
    expect(useUiStore.getState().sidePaneOpen).toBe(false);
    scrollSpy.mockRestore();
  });

  it("neutralizes links with unsupported schemes", async () => {
    const onOpenFile = vi.fn();
    renderMarkdownViewer(onOpenFile);

    const scriptLink = await screen.findByText("script");
    expect(scriptLink).not.toHaveAttribute("href", "javascript:alert(1)");
    fireEvent.click(scriptLink);

    expect(onOpenFile).not.toHaveBeenCalled();
    expect(useUiStore.getState().sidePaneOpen).toBe(false);
    expect(useUiStore.getState().browserTabs).toEqual(initialBrowserTabs);
  });
});

describe("TerminalPanel title", () => {
  it("renames the terminal on double click and Enter", () => {
    const onRename = vi.fn();
    render(
      <TerminalPanel
        active={false}
        workspaceId="workspace"
        title="Terminal 1"
        onRename={onRename}
      />,
    );

    fireEvent.doubleClick(screen.getByTitle("Double-click to rename"));
    const input = screen.getByRole("textbox", { name: "Rename Terminal 1" });
    fireEvent.change(input, { target: { value: "Backend" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onRename).toHaveBeenCalledWith("Backend");
  });
});
