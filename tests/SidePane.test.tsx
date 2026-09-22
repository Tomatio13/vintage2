import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SidePane } from "../src/renderer/components/SidePane.js";
import type { DesktopBridge } from "../src/shared/desktop.js";

afterEach(() => {
  delete window.desktop;
});

describe("SidePane files", () => {
  it("opens a file in the central pane only after a double click", async () => {
    const onOpenFile = vi.fn();
    window.desktop = {
      listWorkspaceFiles: vi
        .fn()
        .mockResolvedValue([{ kind: "file", name: "notes.md", path: "docs/notes.md" }]),
    } as unknown as DesktopBridge;
    render(<SidePane workspaceId="workspace" onOpenFile={onOpenFile} />);
    fireEvent.click(screen.getByRole("button", { name: "Files" }));
    const file = await screen.findByRole("button", { name: "notes.md" });
    fireEvent.click(file);
    expect(onOpenFile).not.toHaveBeenCalled();
    fireEvent.doubleClick(file);
    await waitFor(() => expect(onOpenFile).toHaveBeenCalledWith("docs/notes.md"));
  });
});
