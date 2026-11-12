import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MermaidDiagram } from "../src/renderer/components/MermaidDiagram.js";
import { FileViewer } from "../src/renderer/components/FileViewer.js";
import type { DesktopBridge } from "../src/shared/desktop.js";
import { MarkdownPreview } from "../src/renderer/components/MarkdownPreview.js";
import { renderMermaid } from "../src/renderer/lib/mermaid.js";

vi.mock("../src/renderer/lib/mermaid.js", () => ({ renderMermaid: vi.fn() }));
afterEach(() => {
  vi.resetAllMocks();
  delete window.desktop;
  document.documentElement.classList.remove("dark");
});
describe("Mermaid preview", () => {
  it("renders only Mermaid fences and keeps normal code", async () => {
    vi.mocked(renderMermaid).mockResolvedValue("<svg><text>Start</text></svg>");
    render(
      <MarkdownPreview
        content={"```mermaid\ngraph TD; A-->B\n```\n\n```js\nconst value = 1;\n```"}
        workspaceId="w"
        path="a.md"
        onOpenFile={() => {}}
      />,
    );
    expect(await screen.findByRole("img", { name: "Mermaid diagram" })).toHaveTextContent("Start");
    expect(screen.getByText("const value = 1;").closest("pre")).toBeInTheDocument();
    expect(renderMermaid).toHaveBeenCalledWith("graph TD; A-->B\n", false);
  });
  it("searches diagram labels without counting hidden SVG styles or scripts", async () => {
    vi.mocked(renderMermaid).mockResolvedValue("<svg><text>Visible label</text></svg>");
    window.desktop = {
      readWorkspaceFile: vi.fn().mockResolvedValue({
        content: "```mermaid\ngraph TD; A-->B\n```",
        truncated: false,
      }),
    } as unknown as DesktopBridge;
    render(<FileViewer workspaceId="mermaid-search" path="diagram.md" />);
    const diagram = await screen.findByRole("img", { name: "Mermaid diagram" });
    // happy-dom's HTML parser drops SVG style contents; construct these nodes directly.
    const svg = diagram.querySelector("svg")!;
    for (const [tag, text] of [
      ["style", ".label { fill: red; }"],
      ["script", "hidden_script"],
    ]) {
      const node = document.createElementNS("http://www.w3.org/2000/svg", tag!);
      node.textContent = text!;
      svg.prepend(node);
    }
    fireEvent.click(screen.getByRole("button", { name: "Find in file" }));
    const search = screen.getByRole("textbox", { name: "Find in file" });
    for (const query of ["fill", "hidden_script"]) {
      fireEvent.change(search, { target: { value: query } });
      expect(screen.getByText("0 / 0")).toBeInTheDocument();
    }
    fireEvent.change(search, { target: { value: "Visible label" } });
    expect(screen.getByText("1 / 1")).toBeInTheDocument();
  });
  it("shows source after a rendering failure", async () => {
    vi.mocked(renderMermaid).mockRejectedValue(new Error("invalid"));
    render(<MermaidDiagram source="invalid diagram" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be rendered");
    expect(screen.getByText("invalid diagram")).toBeInTheDocument();
  });
  it("ignores stale completions and redraws for theme changes", async () => {
    let finish!: (svg: string) => void;
    vi.mocked(renderMermaid)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValue("<svg><text>New</text></svg>");
    const view = render(<MermaidDiagram source="old" />);
    view.rerender(<MermaidDiagram source="new" />);
    await screen.findByRole("img");
    await act(async () => {
      finish("<svg><text>Old</text></svg>");
    });
    expect(screen.getByRole("img")).toHaveTextContent("New");
    act(() => {
      document.documentElement.classList.add("dark");
      window.dispatchEvent(new Event("vintage-theme-changed"));
    });
    await waitFor(() => expect(renderMermaid).toHaveBeenLastCalledWith("new", true));
  });
});
