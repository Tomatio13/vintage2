import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkdownEditor } from "../src/renderer/components/MarkdownEditor.js";
import type { DesktopBridge } from "../src/shared/desktop.js";

afterEach(() => {
  delete window.desktop;
});
const content =
  "# 見出し\n\n- [x] A **bold** and `code` [link](other.md)\n```typescript\nconst count = 42; // note\n```\n";
function fixture(targetLine?: number) {
  window.desktop = {
    readWorkspaceFile: vi.fn().mockResolvedValue({ content, truncated: false }),
  } as unknown as DesktopBridge;
  return render(
    <MarkdownEditor workspaceId="source-tools" path="example.md" targetLine={targetLine} />,
  );
}

describe("Markdown source editing", () => {
  it("preserves raw source while coloring Markdown and fenced code and numbering empty lines", async () => {
    fixture();
    await screen.findByRole("heading", { name: "見出し" });
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("textbox", { name: "Markdown editor" })).toHaveValue(content);
    const mirror = screen.getByTestId("markdown-syntax-mirror");
    expect(mirror.parentElement).toHaveAttribute("aria-hidden", "true");
    expect(mirror.querySelector('[data-editor-line="1"] > span')).toHaveClass(
      "text-syntax-keyword",
    );
    expect(
      mirror.querySelector('[data-editor-line="3"]')?.querySelector(".text-syntax-string"),
    ).toHaveTextContent("`code`");
    expect(
      mirror.querySelector('[data-editor-line="3"]')?.querySelector(".text-syntax-function"),
    ).toHaveTextContent("[link](other.md)");
    expect(
      mirror.querySelector('[data-editor-line="5"]')?.querySelector(".text-syntax-keyword"),
    ).toHaveTextContent("const");
    expect(
      mirror.querySelector('[data-editor-line="5"]')?.querySelector(".text-syntax-number"),
    ).toHaveTextContent("42");
    expect(document.querySelectorAll("[data-editor-line-number]")).toHaveLength(7);
    expect(document.querySelector('[data-editor-line-number="7"]')).toHaveTextContent("7");
  });

  it("jumps from preview to a chosen line and tracks mouse and keyboard selection", async () => {
    fixture();
    await screen.findByRole("heading");
    fireEvent.click(screen.getByRole("button", { name: "Go to line" }));
    const lineInput = screen.getByRole("spinbutton", { name: "Line number" });
    expect(lineInput).toHaveAttribute("max", "7");
    fireEvent.change(lineInput, { target: { value: "8" } });
    expect(screen.getByRole("button", { name: "Go" })).toBeDisabled();
    fireEvent.change(lineInput, { target: { value: "5" } });
    fireEvent.submit(lineInput.closest("form")!);
    const editor = screen.getByRole("textbox", { name: "Markdown editor" }) as HTMLTextAreaElement;
    expect(editor.selectionStart).toBe(content.indexOf("const count"));
    expect(screen.getByRole("button", { name: "Current cursor position" })).toHaveTextContent(
      "Ln 5, Col 1",
    );
    editor.setSelectionRange(content.indexOf("count") + 2, content.indexOf("count") + 2);
    fireEvent.select(editor);
    expect(screen.getByRole("button", { name: "Current cursor position" })).toHaveTextContent(
      "Ln 5, Col 9",
    );
    fireEvent.keyDown(editor, { key: "g", ctrlKey: true });
    expect(screen.getByRole("spinbutton", { name: "Line number" })).toHaveValue(5);
    fireEvent.keyDown(screen.getByRole("spinbutton"), { key: "Escape" });
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  });

  it("scrolls mirror and gutter with the textarea and updates highlights after edits", () => {
    render(<MarkdownEditor workspaceId="source-scratch" />);
    const editor = screen.getByRole("textbox", { name: "Workspace notes" }) as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: "# New\nsecond\n" } });
    expect(
      screen.getByTestId("markdown-syntax-mirror").querySelector(".text-syntax-keyword"),
    ).toHaveTextContent("# New");
    expect(screen.getByRole("button", { name: "Current cursor position" })).toHaveTextContent(
      "3 lines",
    );
    editor.scrollTop = 75;
    fireEvent.scroll(editor);
    expect(screen.getByTestId("markdown-syntax-mirror")).toHaveStyle({
      transform: "translate(0px, -75px)",
    });
    expect(document.querySelector('[data-editor-line-number="1"]')?.parentElement).toHaveStyle({
      transform: "translateY(-75px)",
    });
  });

  it("opens target lines in edit mode without losing source offsets", async () => {
    fixture(5);
    const editor = (await screen.findByRole("textbox", {
      name: "Markdown editor",
    })) as HTMLTextAreaElement;
    expect(editor.selectionStart).toBe(content.indexOf("const count"));
    expect(screen.getByRole("button", { name: "Current cursor position" })).toHaveTextContent(
      "Ln 5, Col 1",
    );
  });
  it("updates cursor position for search navigation and handles CRLF source offsets", async () => {
    window.desktop = {
      readWorkspaceFile: vi
        .fn()
        .mockResolvedValue({ content: "# Heading\r\n\r\n日本語 target\r\nlast", truncated: false }),
    } as unknown as DesktopBridge;
    render(<MarkdownEditor workspaceId="crlf" path="crlf.md" />);
    await screen.findByRole("heading");
    fireEvent.click(screen.getByRole("button", { name: "Go to line" }));
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "3" } });
    fireEvent.submit(screen.getByRole("spinbutton").closest("form")!);
    const editor = screen.getByRole("textbox", { name: "Markdown editor" }) as HTMLTextAreaElement;
    expect(editor.selectionStart).toBe(editor.value.indexOf("日本語"));
    expect(screen.getByRole("button", { name: "Current cursor position" })).toHaveTextContent(
      "Ln 3, Col 1",
    );
    fireEvent.click(screen.getByRole("button", { name: "Find in file" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Find in file" }), {
      target: { value: "target" },
    });
    expect(editor.selectionStart).toBe(editor.value.indexOf("target"));
    expect(screen.getByRole("button", { name: "Current cursor position" })).toHaveTextContent(
      "Ln 3, Col 11",
    );
  });
});
