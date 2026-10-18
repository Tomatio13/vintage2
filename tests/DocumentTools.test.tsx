import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    expect(document.querySelector("[data-file-search-text]")).toHaveTextContent(/^old text$/);
    expect(save).toHaveBeenCalledOnce();
  });
});

it("searches and replaces matches outside the displayed source page without rendering all lines", async () => {
  const lines = Array.from({ length: 20000 }, (_, i) =>
    i === 8500 || i === 19000 ? "far_marker" : `line_${i}`,
  );
  const save = bridge(lines.join("\n"));
  const { container } = render(<FileViewer workspaceId="tools" path="huge.ts" />);
  await screen.findByText("line_0");
  fireEvent.click(screen.getByRole("button", { name: "Find in file" }));
  expect(container.querySelectorAll("[data-code-line]").length).toBeLessThanOrEqual(600);
  fireEvent.change(screen.getByRole("textbox", { name: "Find in file" }), {
    target: { value: "far_marker" },
  });
  expect(screen.getByText("1 / 2")).toBeInTheDocument();
  expect(container.querySelector('[data-code-line="8501"]')).toHaveTextContent("far_marker");
  fireEvent.click(screen.getByRole("button", { name: "Next match" }));
  expect(container.querySelector('[data-code-line="19001"]')).toHaveTextContent("far_marker");
  expect(container.querySelectorAll("[data-code-line]").length).toBeLessThanOrEqual(600);
  fireEvent.change(screen.getByRole("textbox", { name: "Replace with" }), {
    target: { value: "replaced_marker" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Replace all" }));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(
      "tools",
      "huge.ts",
      lines.join("\n").replaceAll("far_marker", "replaced_marker"),
      lines.join("\n"),
    ),
  );
});

it("searches the formatted JSON source beyond the first page", async () => {
  bridge(JSON.stringify(Array.from({ length: 2000 }, (_, i) => ({ label: `json_item_${i}` }))));
  const { container } = render(<FileViewer workspaceId="tools" path="huge.json" />);
  await screen.findByText('"json_item_0"');
  fireEvent.click(screen.getByRole("button", { name: "Find in file" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Find in file" }), {
    target: { value: '"label": "json_item_1999"' },
  });
  expect(screen.getByText("1 / 1")).toBeInTheDocument();
  expect(screen.getByText('"json_item_1999"')).toBeInTheDocument();
  expect(container.querySelectorAll("[data-code-line]").length).toBeLessThanOrEqual(600);
});

it("retains the source position when search closes after manual navigation", async () => {
  bridge(
    Array.from({ length: 4000 }, (_, i) => (i === 2000 ? "far_marker" : `line_${i}`)).join("\n"),
  );
  const { container } = render(
    <FileViewer workspaceId="tools" path="position.ts" targetLine={1} />,
  );
  await screen.findByText("line_0");
  fireEvent.click(screen.getByRole("button", { name: "Find in file" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Find in file" }), {
    target: { value: "far_marker" },
  });
  expect(container.querySelector('[data-code-line="2001"]')).toBeInTheDocument();
  fireEvent.click(
    within(screen.getByRole("navigation", { name: "Source pages" })).getByRole("button", {
      name: "Next",
    }),
  );
  const first = container.querySelector("[data-code-line]")?.getAttribute("data-code-line");
  fireEvent.click(screen.getByRole("button", { name: "Close search" }));
  expect(container.querySelector("[data-code-line]")?.getAttribute("data-code-line")).toBe(first);
  expect(screen.queryByText("line_0")).not.toBeInTheDocument();
});

it("parses formatted JSON once for both rendering and search", async () => {
  const content = '{"unique_parse_marker":"value"}';
  bridge(content);
  const parse = vi.spyOn(JSON, "parse");
  try {
    render(<FileViewer workspaceId="tools" path="once.json" />);
    await screen.findByText('"unique_parse_marker"');
    fireEvent.click(screen.getByRole("button", { name: "Find in file" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Find in file" }), {
      target: { value: "value" },
    });
    expect(screen.getByText("1 / 1")).toBeInTheDocument();
    expect(parse.mock.calls.filter((call) => call[0] === content)).toHaveLength(1);
  } finally {
    parse.mockRestore();
  }
});

it("zooms Markdown with Ctrl-wheel while leaving ordinary wheel scrolling alone", async () => {
  bridge("# Wheel");
  render(<FileViewer workspaceId="wheel" path="wheel.md" />);
  const heading = await screen.findByRole("heading", { name: "Wheel" });
  const percentage = () => screen.getByRole("button", { name: "Reset zoom" });
  fireEvent.wheel(heading, { deltaY: -100 });
  expect(percentage()).toHaveTextContent("100%");
  const wheel = (target: HTMLElement, deltaY: number) => {
    // happy-dom's WheelEvent omits MouseEvent modifier properties.
    const event = new Event("wheel", { bubbles: true, cancelable: true });
    Object.assign(event, { ctrlKey: true, deltaY });
    return fireEvent(target, event);
  };
  expect(wheel(heading, -100)).toBe(false);
  expect(percentage()).toHaveTextContent("110%");
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  wheel(screen.getByRole("textbox", { name: "Markdown editor" }), 100);
  expect(percentage()).toHaveTextContent("100%");
});
