import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SidePane } from "../src/renderer/components/SidePane.js";
import { useUiStore } from "../src/renderer/store/uiStore.js";
import type { DesktopBridge } from "../src/shared/desktop.js";
afterEach(() => {
  delete window.desktop;
});
function setup() {
  useUiStore.setState({ activeSidePaneTabId: "files" });
  const bridge = {
    listWorkspaceFiles: vi.fn().mockResolvedValue([
      { name: "note.md", path: "note.md", kind: "file" },
      { name: "target", path: "target", kind: "directory" },
    ]),
    copyWorkspaceEntry: vi.fn().mockResolvedValue(undefined),
    createWorkspaceEntry: vi.fn().mockResolvedValue(undefined),
    trashWorkspaceEntry: vi.fn().mockResolvedValue(undefined),
    renameWorkspaceEntry: vi.fn().mockResolvedValue(undefined),
    copyWorkspaceEntryText: vi.fn().mockResolvedValue(undefined),
  };
  window.desktop = bridge as unknown as DesktopBridge;
  render(<SidePane workspaceId="workspace" onOpenFile={() => {}} />);
  return bridge;
}
it("copies an entry and pastes into a folder, then refreshes", async () => {
  const bridge = setup();
  fireEvent.contextMenu(await screen.findByRole("button", { name: "note.md" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Copy" }));
  fireEvent.contextMenu(screen.getByRole("button", { name: "target" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Paste here" }));
  await waitFor(() =>
    expect(bridge.copyWorkspaceEntry).toHaveBeenCalledWith(
      "workspace",
      "note.md",
      "workspace",
      "target",
    ),
  );
  await waitFor(() => expect(bridge.listWorkspaceFiles).toHaveBeenCalledTimes(2));
});
it("renames via a form and copies a full path", async () => {
  const bridge = setup();
  fireEvent.contextMenu(await screen.findByRole("button", { name: "note.md" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Copy full path" }));
  await waitFor(() =>
    expect(bridge.copyWorkspaceEntryText).toHaveBeenCalledWith("workspace", "note.md", "full"),
  );
  await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  fireEvent.contextMenu(screen.getByRole("button", { name: "note.md" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Rename…" }));
  fireEvent.change(screen.getByRole("textbox", { name: "New name" }), {
    target: { value: "new.md" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Rename" }));
  await waitFor(() =>
    expect(bridge.renameWorkspaceEntry).toHaveBeenCalledWith("workspace", "note.md", "new.md"),
  );
});
it("shows errors without closing the menu", async () => {
  const bridge = setup();
  bridge.copyWorkspaceEntryText.mockRejectedValue(new Error("Missing entry"));
  fireEvent.contextMenu(await screen.findByRole("button", { name: "note.md" }));
  expect(screen.getByRole("menuitem", { name: "Paste here" })).toBeDisabled();
  fireEvent.click(screen.getByRole("menuitem", { name: "Copy file name" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Missing entry");
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});

it("creates a file inside a folder and refreshes the tree", async () => {
  const bridge = setup();
  fireEvent.contextMenu(await screen.findByRole("button", { name: "target" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "New file…" }));
  fireEvent.change(screen.getByRole("textbox", { name: "File name" }), {
    target: { value: "new.txt" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create" }));
  await waitFor(() =>
    expect(bridge.createWorkspaceEntry).toHaveBeenCalledWith(
      "workspace",
      "target",
      "new.txt",
      "file",
    ),
  );
  await waitFor(() => expect(bridge.listWorkspaceFiles).toHaveBeenCalledTimes(2));
});
it("creates a folder alongside a selected file", async () => {
  const bridge = setup();
  fireEvent.contextMenu(await screen.findByRole("button", { name: "note.md" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "New folder…" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Folder name" }), {
    target: { value: "new" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create" }));
  await waitFor(() =>
    expect(bridge.createWorkspaceEntry).toHaveBeenCalledWith("workspace", "", "new", "directory"),
  );
});
it("requires confirmation before moving a folder to Trash and supports cancelling", async () => {
  const bridge = setup();
  fireEvent.contextMenu(await screen.findByRole("button", { name: "target" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Delete…" }));
  expect(screen.getByRole("dialog", { name: "Delete entry" })).toHaveTextContent(
    "all files and folders",
  );
  expect(bridge.trashWorkspaceEntry).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(bridge.trashWorkspaceEntry).not.toHaveBeenCalled();
  fireEvent.contextMenu(screen.getByRole("button", { name: "target" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Delete…" }));
  fireEvent.click(screen.getByRole("button", { name: "Move to Trash" }));
  await waitFor(() =>
    expect(bridge.trashWorkspaceEntry).toHaveBeenCalledWith("workspace", "target"),
  );
  await waitFor(() => expect(bridge.listWorkspaceFiles).toHaveBeenCalledTimes(2));
});
