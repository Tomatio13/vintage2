import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkdownEditor } from "../src/renderer/components/MarkdownEditor.js";
import type { DesktopBridge } from "../src/shared/desktop.js";

afterEach(() => {
  delete window.desktop;
});
function bridge() {
  const save = vi.fn().mockResolvedValue(undefined);
  window.desktop = {
    readWorkspaceFile: vi.fn().mockResolvedValue({ content: "# Original", truncated: false }),
    writeWorkspaceMarkdown: save,
  } as unknown as DesktopBridge;
  return save;
}
describe("Markdown editor", () => {
  it("saves explicitly with the original content and previews the draft", async () => {
    const save = bridge();
    render(<MarkdownEditor workspaceId="project" path="note.md" />);
    await screen.findByRole("heading", { name: "Original" });
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "# Changed" } });
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByRole("heading", { name: "Changed" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith("project", "note.md", "# Changed", "# Original"),
    );
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Saved"));
  });
  it("keeps a failed save as a recoverable draft", async () => {
    const save = bridge().mockRejectedValue(new Error("File changed outside this editor"));
    const view = render(<MarkdownEditor workspaceId="project" path="note.md" />);
    await screen.findByRole("heading");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "my draft" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "s", ctrlKey: true });
    expect(await screen.findByRole("alert")).toHaveTextContent("File changed");
    expect(save).toHaveBeenCalledOnce();
    view.unmount();
    render(<MarkdownEditor workspaceId="project" path="note.md" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("textbox")).toHaveValue("my draft");
  });
  it("keeps autosaved notes separate across workspaces and remounts", async () => {
    const view = render(<MarkdownEditor workspaceId="one" />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "first note" } });
    view.unmount();
    const second = render(<MarkdownEditor workspaceId="two" />);
    expect(screen.getByRole("textbox")).toHaveValue("");
    second.unmount();
    render(<MarkdownEditor workspaceId="one" />);
    expect(screen.getByRole("textbox")).toHaveValue("first note");
  });
  it("keeps edits made while a reload is reading", async () => {
    bridge();
    render(<MarkdownEditor workspaceId="reload" path="note.md" />);
    await screen.findByRole("heading");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const read = vi.mocked(window.desktop!.readWorkspaceFile);
    let finish!: (file: Awaited<ReturnType<typeof read>>) => void;
    read.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "new draft" } });
    await act(async () => finish({ path: "note.md", content: "disk", truncated: false }));
    expect(screen.getByRole("textbox")).toHaveValue("new draft");
    expect(localStorage.getItem("vintage:markdown:reload:note.md")).toContain("new draft");
  });
  it("retries a failed preview read at the same version", async () => {
    bridge();
    window.desktop!.getWorkspaceFileVersion = vi.fn().mockResolvedValue("v2");
    vi.mocked(window.desktop!.readWorkspaceFile)
      .mockResolvedValueOnce({ path: "note.md", content: "# Old", truncated: false })
      .mockRejectedValueOnce(new Error("temporary read failure"))
      .mockResolvedValue({ path: "note.md", content: "# Updated", truncated: false });
    render(<MarkdownEditor workspaceId="retry" path="note.md" />);
    await screen.findByRole("heading", { name: "Old" });
    await screen.findByRole("heading", { name: "Updated" }, { timeout: 4500 });
  });
  it("disables editing of truncated files", async () => {
    bridge();
    vi.mocked(window.desktop!.readWorkspaceFile).mockResolvedValue({
      path: "note.md",
      content: "partial",
      truncated: true,
    });
    render(<MarkdownEditor workspaceId="project" path="note.md" />);
    await screen.findByText(/Editing is disabled/);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("textbox")).toBeDisabled();
  });
});
