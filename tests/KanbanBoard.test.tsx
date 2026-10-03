import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { KanbanBoard } from "../src/renderer/components/KanbanBoard.js";
import { useUiStore } from "../src/renderer/store/uiStore.js";
import { SidePane } from "../src/renderer/components/SidePane.js";

import type { DesktopBridge } from "../src/shared/desktop.js";
import type { KanbanSnapshot } from "../src/shared/kanban.js";
const boards = new Map<string, KanbanSnapshot>();
let revision = 0;
beforeEach(() => {
  boards.clear();
  revision = 0;
  window.desktop = {
    readWorkspaceKanban: vi.fn(async (id, initial) => {
      if (!boards.has(id))
        boards.set(id, {
          board: initial ?? { version: 1, cards: [] },
          revision: String(++revision),
        });
      return structuredClone(boards.get(id)!);
    }),
    saveWorkspaceKanban: vi.fn(async (id, board, expected) => {
      if (boards.get(id)?.revision !== expected)
        throw new Error("Board changed on disk. Your draft is kept.");
      const saved = { board: structuredClone(board), revision: String(++revision) };
      boards.set(id, saved);
      return structuredClone(saved);
    }),
    copyWorkspaceKanbanInstructions: vi.fn().mockResolvedValue(undefined),
  } as unknown as DesktopBridge;
});
afterEach(() => {
  delete window.desktop;
  vi.useRealTimers();
});

async function createCard(title: string, notes = "") {
  await waitFor(() => expect(screen.getByRole("button", { name: "Add card" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Add card" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Card title" }), {
    target: { value: title },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Card notes" }), {
    target: { value: notes },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create card" }));
  await waitFor(() => expect(screen.queryByRole("form")).not.toBeInTheDocument());
}
it("creates, edits, moves, deletes and undoes a card, persisting each result", async () => {
  const view = render(<KanbanBoard workspaceId="one" request={null} />);
  await createCard("Update README", "Add examples");
  expect(
    within(screen.getByRole("region", { name: "To do" })).getByRole("article", {
      name: "Update README",
    }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  const dataTransfer = { setData: vi.fn(), effectAllowed: "", dropEffect: "" };
  fireEvent.dragStart(screen.getByRole("article", { name: "Update README" }), { dataTransfer });
  fireEvent.drop(screen.getByRole("region", { name: "Doing" }), { dataTransfer });
  await waitFor(() =>
    expect(
      within(screen.getByRole("region", { name: "Doing" })).getByRole("article", {
        name: "Update README",
      }),
    ).toBeInTheDocument(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Edit Update README" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Card title" }), {
    target: { value: "Finish docs" },
  });
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Save card" }));
  await screen.findByRole("article", { name: "Finish docs" });
  fireEvent.dragStart(screen.getByRole("article", { name: "Finish docs" }), { dataTransfer });
  fireEvent.drop(screen.getByRole("region", { name: "Done" }), { dataTransfer });
  await waitFor(() =>
    expect(
      within(screen.getByRole("region", { name: "Done" })).getByRole("article", {
        name: "Finish docs",
      }),
    ).toBeInTheDocument(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Delete Finish docs" }));
  await waitFor(() => expect(screen.queryByRole("article")).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  await screen.findByRole("article", { name: "Finish docs" });
  view.unmount();
  render(<KanbanBoard workspaceId="one" request={null} />);
  await screen.findByRole("article", { name: "Finish docs" });
  expect(
    within(screen.getByRole("region", { name: "Done" })).getByRole("article", {
      name: "Finish docs",
    }),
  ).toHaveTextContent("Add examples");
});
it("moves cards with drag and drop", async () => {
  render(<KanbanBoard workspaceId="one" request={null} />);
  await createCard("Test dragging");
  const dataTransfer = { setData: vi.fn(), effectAllowed: "", dropEffect: "" };
  fireEvent.dragStart(screen.getByRole("article", { name: "Test dragging" }), { dataTransfer });
  fireEvent.dragOver(screen.getByRole("region", { name: "Done" }), { dataTransfer });
  fireEvent.drop(screen.getByRole("region", { name: "Done" }), { dataTransfer });
  await screen.findByRole("article", { name: "Test dragging" });
  await waitFor(() =>
    expect(
      within(screen.getByRole("region", { name: "Done" })).getByRole("article", {
        name: "Test dragging",
      }),
    ).toBeInTheDocument(),
  );
});
it("keeps cards separate across workspaces", async () => {
  const first = render(<KanbanBoard workspaceId="one" request={null} />);
  await createCard("Only in one");
  first.unmount();
  render(<KanbanBoard workspaceId="two" request={null} />);
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
});
it("creates a card from selected note text without changing the memo", async () => {
  localStorage.setItem(
    "vintage:markdown:one::scratchpad",
    JSON.stringify({ content: "Keep this\n- [ ] Update README\nAdd screenshots", original: "" }),
  );
  useUiStore.setState({
    activeSidePaneTabId: "notes",
    notesPanelEnabled: true,
    boardPanelEnabled: true,
  });
  const view = render(<SidePane workspaceId="one" visible onOpenFile={() => {}} />);
  const memo = screen.getByRole("textbox", { name: "Workspace notes" }) as HTMLTextAreaElement;
  memo.setSelectionRange(10, memo.value.length);
  fireEvent.click(screen.getByRole("button", { name: "Create card from note" }));
  expect(screen.getByRole("textbox", { name: "Card title" })).toHaveValue("Update README");
  expect(screen.getByRole("textbox", { name: "Card notes" })).toHaveValue("Add screenshots");
  await waitFor(() => expect(screen.getByRole("button", { name: "Create card" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Create card" }));
  await screen.findByRole("article", { name: "Update README" });
  fireEvent.click(screen.getByRole("button", { name: "Notes" }));
  expect(screen.getByRole("textbox", { name: "Workspace notes" })).toHaveValue(
    "Keep this\n- [ ] Update README\nAdd screenshots",
  );
  fireEvent.click(screen.getByRole("button", { name: "Board" }));
  view.unmount();
  render(<SidePane workspaceId="one" visible onOpenFile={() => {}} />);
  expect(screen.getByRole("button", { name: "Board" })).toHaveAttribute("aria-pressed", "true");
  expect(await screen.findByRole("article", { name: "Update README" })).toBeInTheDocument();
});
it("keeps a draft open on storage failure and never overwrites an unreadable board", async () => {
  const view = render(<KanbanBoard workspaceId="one" request={null} />);
  vi.mocked(window.desktop!.saveWorkspaceKanban).mockRejectedValueOnce(new Error("Could not save"));
  await waitFor(() => expect(screen.getByRole("button", { name: "Add card" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Add card" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Card title" }), {
    target: { value: "Unsaved task" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create card" }));
  await screen.findByRole("alert");
  expect(screen.getByRole("textbox", { name: "Card title" })).toHaveValue("Unsaved task");
  expect(screen.getByRole("alert")).toHaveTextContent("Could not save");
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Create card" }));
  expect(await screen.findByRole("article", { name: "Unsaved task" })).toBeInTheDocument();
  view.unmount();
  localStorage.setItem("vintage:kanban:two", "invalid JSON");
  render(<KanbanBoard workspaceId="two" request={null} />);
  expect(screen.getByRole("alert")).toHaveTextContent("Saved board could not be loaded");
  expect(screen.getByRole("button", { name: "Add card" })).toBeDisabled();
  expect(localStorage.getItem("vintage:kanban:two")).toBe("invalid JSON");
});

it("copies board-wide and selected-card instructions", async () => {
  render(<KanbanBoard workspaceId="one" request={null} />);
  await createCard("AI task");
  fireEvent.click(screen.getByRole("button", { name: "Copy AI instructions" }));
  await waitFor(() =>
    expect(window.desktop!.copyWorkspaceKanbanInstructions).toHaveBeenCalledWith("one", undefined),
  );
  fireEvent.click(screen.getByRole("button", { name: "Copy AI instructions for AI task" }));
  await waitFor(() =>
    expect(window.desktop!.copyWorkspaceKanbanInstructions).toHaveBeenCalledWith(
      "one",
      boards.get("one")!.board.cards[0]!.id,
    ),
  );
});
it("refreshes only visible boards, keeps drafts on external edits and rejects stale saves", async () => {
  boards.set("one", {
    board: { version: 1, cards: [{ id: "task", title: "Original", notes: "Old", status: "todo" }] },
    revision: "initial",
  });
  const view = render(<KanbanBoard workspaceId="one" request={null} active={false} />);
  expect(window.desktop!.readWorkspaceKanban).not.toHaveBeenCalled();
  vi.useFakeTimers();
  await act(async () => {
    view.rerender(<KanbanBoard workspaceId="one" request={null} active />);
  });
  expect(screen.getByRole("article", { name: "Original" })).toBeInTheDocument();
  boards.set("one", {
    board: {
      version: 1,
      cards: [{ id: "task", title: "AI updated", notes: "New", status: "doing" }],
    },
    revision: "remote-1",
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
  });
  expect(
    within(screen.getByRole("region", { name: "Doing" })).getByRole("article", {
      name: "AI updated",
    }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Edit AI updated" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Card notes" }), {
    target: { value: "Human draft" },
  });
  boards.set("one", {
    board: {
      version: 1,
      cards: [{ id: "task", title: "AI updated", notes: "AI result", status: "done" }],
    },
    revision: "remote-2",
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
  });
  expect(screen.getByRole("textbox", { name: "Card notes" })).toHaveValue("Human draft");
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Save card" }));
  });
  expect(screen.getByRole("alert")).toHaveTextContent("Board changed on disk");
  expect(boards.get("one")!.board.cards[0]!.notes).toBe("AI result");
  const readCount = vi.mocked(window.desktop!.readWorkspaceKanban).mock.calls.length;
  view.rerender(<KanbanBoard workspaceId="one" request={null} active={false} />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(12000);
  });
  expect(window.desktop!.readWorkspaceKanban).toHaveBeenCalledTimes(readCount);
});
it("migrates legacy local cards while retaining the backup", async () => {
  const legacy = {
    version: 1,
    cards: [{ id: "old", title: "Legacy card", notes: "Keep", status: "todo" }],
  };
  const raw = JSON.stringify(legacy);
  localStorage.setItem("vintage:kanban:one", raw);
  render(<KanbanBoard workspaceId="one" request={null} />);
  expect(await screen.findByRole("article", { name: "Legacy card" })).toBeInTheDocument();
  expect(window.desktop!.readWorkspaceKanban).toHaveBeenCalledWith("one", legacy);
  expect(localStorage.getItem("vintage:kanban:one")).toBe(raw);
});
