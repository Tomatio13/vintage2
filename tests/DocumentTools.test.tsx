import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileViewer } from "../src/renderer/components/FileViewer.js";
import type { DesktopBridge } from "../src/shared/desktop.js";

afterEach(() => {
  delete window.desktop;
});

function bridge(content: string, truncated = false) {
  const save = vi.fn().mockResolvedValue(undefined);
  window.desktop = {
    readWorkspaceFile: vi.fn().mockResolvedValue({ content, truncated }),
    writeWorkspaceMarkdown: save,
    writeWorkspaceText: save,
  } as unknown as DesktopBridge;
  return save;
}

describe("Document tools", () => {
  it("searches rendered Markdown and exposes replacement only in edit mode", async () => {
    const save = bridge("# Hello\n\nHello **world**.\n");
    render(<FileViewer workspaceId="tools" path="doc.md" />);
    await screen.findByRole("heading", { name: "Hello" });
    fireEvent.click(screen.getByRole("button", { name: "Find in file" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Find in file" }), {
      target: { value: "hello" },
    });
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Replace with" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next match" }));
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const editor = screen.getByRole("textbox", { name: "Markdown editor" }) as HTMLTextAreaElement;
    expect(editor.selectionStart).toBe(2);
    fireEvent.click(screen.getByRole("button", { name: "Next match" }));
    expect(editor.selectionStart).toBe(9);
    fireEvent.change(screen.getByRole("textbox", { name: "Replace with" }), {
      target: { value: "$&日本語" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Replace" }));
    expect(editor).toHaveValue("# Hello\n\n$&日本語 **world**.\n");
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Replace all" }));
    expect(editor).toHaveValue("# $&日本語\n\n$&日本語 **world**.\n");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        "tools",
        "doc.md",
        "# $&日本語\n\n$&日本語 **world**.\n",
        "# Hello\n\nHello **world**.\n",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.queryByRole("textbox", { name: "Replace with" })).not.toBeInTheDocument();
  });

  it("zooms Markdown preview and editor and resets to 100%", async () => {
    bridge("# Zoom");
    render(<FileViewer workspaceId="tools" path="zoom.md" />);
    const heading = await screen.findByRole("heading");
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByRole("button", { name: "Reset zoom" })).toHaveTextContent("110%");
    expect(heading.closest("article")?.parentElement).toHaveStyle({ zoom: "1.1" });
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("textbox", { name: "Markdown editor" })).toHaveStyle({
      fontSize: "14.3px",
    });
    fireEvent.click(screen.getByRole("button", { name: "Reset zoom" }));
    expect(screen.getByRole("button", { name: "Reset zoom" })).toHaveTextContent("100%");
  });

  it("replaces raw source with syntax-spanning matches and excludes line numbers", async () => {
    const save = bridge('const value = "hello";\nconst other = "HELLO";');
    render(<FileViewer workspaceId="tools" path="code.ts" />);
    await screen.findByText("value");
    fireEvent.keyDown(screen.getByTestId("file-viewer-scroll"), { key: "f", ctrlKey: true });
    fireEvent.change(screen.getByRole("textbox", { name: "Find in file" }), {
      target: { value: '= "hello"' },
    });
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Replace with" }), {
      target: { value: '= "日本語"' },
    });
    fireEvent.click(screen.getByRole("button", { name: "Replace all" }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        "tools",
        "code.ts",
        'const value = "日本語";\nconst other = "日本語";',
        'const value = "hello";\nconst other = "HELLO";',
      ),
    );
    await screen.findAllByText('"日本語"');
    fireEvent.change(screen.getByRole("textbox", { name: "Find in file" }), {
      target: { value: "1" },
    });
    expect(screen.getByText("0 / 0")).toBeInTheDocument();
  });

  it("searches truncated files without allowing replacement", async () => {
    bridge("partial text", true);
    render(<FileViewer workspaceId="tools" path="large.txt" />);
    await screen.findByText("partial text");
    fireEvent.click(screen.getByRole("button", { name: "Find in file" }));
    expect(screen.queryByRole("textbox", { name: "Replace with" })).not.toBeInTheDocument();
  });

  it("keeps original text visible when a replacement save conflicts", async () => {
    const save = bridge("old text").mockRejectedValue(
      new Error("File changed outside this editor"),
    );
    render(<FileViewer workspaceId="tools" path="conflict.txt" />);
    await screen.findByText("old text");
    fireEvent.click(screen.getByRole("button", { name: "Find in file" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Find in file" }), {
      target: { value: "old" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Replace with" }), {
      target: { value: "new" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Replace all" }));
    expect(await screen.findByText("File changed outside this editor")).toBeInTheDocument();
    expect(screen.getByText("old text")).toBeInTheDocument();
    expect(save).toHaveBeenCalledOnce();
  });
});
