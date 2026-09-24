import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FileViewer } from "../src/renderer/components/FileViewer.js";
import { TerminalPanel } from "../src/renderer/components/TerminalPanel.js";
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

  it("switches Markdown between rendered preview and source", async () => {
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
    const sourceButton = screen.getByRole("button", { name: "Source" });
    expect(previewButton).toHaveAttribute("aria-pressed", "true");
    expect(sourceButton).toHaveAttribute("aria-pressed", "false");
    expect(await screen.findByRole("heading", { name: "Notes" })).toBeInTheDocument();

    fireEvent.click(sourceButton);

    expect(sourceButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("file-viewer-scroll").querySelector("pre")?.textContent).toBe(
      content,
    );
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
