import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SidePane } from "../src/renderer/components/SidePane.js";
import type { DesktopBridge } from "../src/shared/desktop.js";

afterEach(() => {
  delete window.desktop;
});

describe("SidePane files", () => {
  it("keeps Files fixed and supports independent, closable Browser tabs", () => {
    render(<SidePane workspaceId={null} onOpenFile={() => {}} />);

    const filesTab = screen.getByRole("button", { name: "Files" });
    const browserTab = screen.getByRole("button", { name: "Browser" });
    expect(filesTab).toHaveAttribute("aria-pressed", "true");
    expect(browserTab).toHaveAttribute("aria-pressed", "false");
    expect(browserTab.closest('[role="group"]')).not.toHaveClass("flex-1");
    expect(filesTab).toHaveClass("text-ui-sm");
    expect(filesTab.querySelector("svg")).toHaveClass("size-3.5");
    expect(screen.queryByRole("button", { name: "Close Files tab" })).not.toBeInTheDocument();
    expect(screen.getByText("Open a workspace to browse its files.")).toBeInTheDocument();

    fireEvent.click(browserTab);
    const firstAddress = screen.getByRole("textbox", { name: "Browser address" });
    expect(firstAddress).toHaveAttribute("placeholder", "Enter a URL and press Enter");
    expect(firstAddress).toHaveClass("h-7", "rounded-lg", "bg-input", "text-ui-base");
    expect(firstAddress.closest("form")).toHaveClass("h-12", "gap-2", "px-3");
    expect(screen.getByRole("button", { name: "Browser back" })).toHaveClass("size-7");
    expect(screen.getByRole("button", { name: "Toggle responsive preview" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Pick element and copy selector" }),
    ).toBeInTheDocument();
    fireEvent.change(firstAddress, { target: { value: "https://first.example/" } });

    fireEvent.click(screen.getByRole("button", { name: "More browser actions" }));
    expect(screen.getByRole("dialog", { name: "Browser actions" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open in default browser" })).toBeDisabled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Browser actions" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "New browser tab" }));
    expect(screen.getByRole("button", { name: "Browser 2" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const secondAddress = screen.getByRole("textbox", { name: "Browser address" });
    expect(secondAddress).not.toHaveValue("https://first.example/");
    fireEvent.change(secondAddress, { target: { value: "https://second.example/" } });

    fireEvent.click(screen.getByRole("button", { name: "Browser" }));
    expect(screen.getByRole("textbox", { name: "Browser address" })).toHaveValue(
      "https://first.example/",
    );
    fireEvent.click(screen.getByRole("button", { name: "Browser 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Close Browser 2 tab" }));
    expect(screen.queryByRole("button", { name: "Browser 2" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Browser" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Close Browser tab" }));
    expect(screen.getByRole("button", { name: "Files" })).toHaveAttribute("aria-pressed", "true");
  });

  it("starts folders collapsed and styles their icons with the theme foreground", async () => {
    const listWorkspaceFiles = vi
      .fn()
      .mockImplementation((_workspaceId: string, directoryPath?: string) =>
        Promise.resolve(
          directoryPath === "src"
            ? [{ kind: "file", name: "main.ts", path: "src/main.ts" }]
            : [{ kind: "directory", name: "src", path: "src" }],
        ),
      );
    window.desktop = {
      listWorkspaceFiles,
    } as unknown as DesktopBridge;
    render(<SidePane workspaceId="workspace" onOpenFile={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Files" }));

    const folder = await screen.findByRole("button", { name: "src" });
    expect(folder).toHaveAttribute("aria-expanded", "false");
    expect(folder.querySelectorAll("svg")[1]).toHaveClass("text-foreground");
    expect(folder.querySelectorAll("svg")[1]).not.toHaveClass("text-brand");
    expect(screen.queryByRole("button", { name: "main.ts" })).not.toBeInTheDocument();

    fireEvent.click(folder);
    expect(folder).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByRole("button", { name: "main.ts" })).toBeInTheDocument();
    expect(listWorkspaceFiles).toHaveBeenLastCalledWith("workspace", "src");
  });

  it("hides Home dotfiles by default and reveals them on request", async () => {
    const listWorkspaceFiles = vi
      .fn()
      .mockImplementation((_workspaceId: string, directoryPath?: string) =>
        Promise.resolve(
          directoryPath === ".config"
            ? [{ kind: "file", name: "settings.json", path: ".config/settings.json" }]
            : [
                { kind: "file", name: ".bashrc", path: ".bashrc" },
                { kind: "directory", name: ".config", path: ".config" },
                { kind: "file", name: "notes.md", path: "notes.md" },
              ],
        ),
      );
    window.desktop = { listWorkspaceFiles } as unknown as DesktopBridge;

    render(<SidePane workspaceId="home" workspaceName="Home" onOpenFile={() => {}} />);

    expect(await screen.findByRole("button", { name: "notes.md" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: ".bashrc" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: ".config" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show hidden files" }));
    const configFolder = await screen.findByRole("button", { name: ".config" });
    fireEvent.click(configFolder);

    expect(await screen.findByRole("button", { name: "settings.json" })).toBeInTheDocument();
    expect(listWorkspaceFiles).toHaveBeenLastCalledWith("home", ".config");
  });

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
