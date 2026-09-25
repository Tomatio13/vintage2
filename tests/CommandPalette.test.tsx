import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  CommandPalette,
  type CommandPaletteItem,
} from "../src/renderer/components/CommandPalette.js";

function actionItem(id: string, title: string): CommandPaletteItem {
  return {
    id,
    kind: "action",
    section: "actions",
    title,
    icon: "command",
    onSelect: vi.fn(),
  };
}

function workspaceItem(id: string, title: string): CommandPaletteItem {
  return {
    id,
    kind: "workspace",
    section: "workspaces",
    title,
    icon: "workspace",
    onSelect: vi.fn(),
  };
}

function renderPalette(items: CommandPaletteItem[]) {
  const onOpenChange = vi.fn();
  render(<CommandPalette items={items} open onOpenChange={onOpenChange} />);
  const input = screen.getByRole("combobox");
  input.focus();
  return { input, onOpenChange };
}

describe("CommandPalette keyboard navigation", () => {
  it("reaches the truncated section row with ArrowDown and expands it with Enter", () => {
    const items = Array.from({ length: 6 }, (_, index) =>
      actionItem(`action:${index + 1}`, `Action ${index + 1}`),
    );
    const { input } = renderPalette(items);
    expect(screen.queryByRole("option", { name: "Action 5" })).toBeNull();

    for (let step = 0; step < 4; step += 1) {
      fireEvent.keyDown(input, { key: "ArrowDown" });
    }
    expect(screen.getByRole("option", { name: "Show 2 more" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByRole("option", { name: "Action 5" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Show 2 more" })).toBeNull();

    fireEvent.keyDown(input, { key: "Enter" });
    expect(items[4]?.onSelect).toHaveBeenCalledTimes(1);
  });

  it("cycles All/Actions/Locations scope with Tab and Shift+Tab", () => {
    const items = [
      actionItem("action:alpha", "Alpha action"),
      workspaceItem("workspace:home", "Home workspace"),
    ];
    const { input } = renderPalette(items);
    expect(screen.getByRole("option", { name: "Alpha action" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Home workspace" })).toBeInTheDocument();

    fireEvent.keyDown(input, { key: "Tab" });
    expect(screen.getByRole("option", { name: "Alpha action" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Home workspace" })).toBeNull();

    fireEvent.keyDown(input, { key: "Tab" });
    expect(screen.queryByRole("option", { name: "Alpha action" })).toBeNull();
    expect(screen.getByRole("option", { name: "Home workspace" })).toBeInTheDocument();

    fireEvent.keyDown(input, { key: "Tab", shiftKey: true });
    expect(screen.getByRole("option", { name: "Alpha action" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Home workspace" })).toBeNull();
  });
});
