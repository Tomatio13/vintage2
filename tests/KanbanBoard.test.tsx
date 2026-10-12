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
  expect(screen.queryByRole("combobox", { name: "Card status" })).not.toBeInTheDocument();
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
  expect(screen.getByRole("combobox", { name: "Card status" })).toHaveValue("doing");
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
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Edit Finish docs" }));
  expect(screen.getByRole("textbox", { name: "Card notes" })).toHaveValue("Add examples");
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

function seedCards() {
  boards.set("one", {
    revision: "seed",
    board: {
      version: 1,
      cards: [
        { id: "a", title: "First", notes: "Needle in notes", status: "todo" },
        { id: "b", title: "Second", notes: "Other notes", status: "todo" },
        { id: "c", title: "Completed", notes: "Finished", status: "done" },
      ],
    },
  });
}
it("adds continuously in the chosen column and ignores Enter during IME composition", async () => {
  render(<KanbanBoard workspaceId="one" request={null} />);
  const add = screen.getByRole("button", { name: "Add card to Doing" });
  await waitFor(() => expect(add).toBeEnabled());
  fireEvent.click(add);
  const input = screen.getByRole("textbox", { name: "New card title" });
  fireEvent.change(input, { target: { value: "IME draft" } });
  fireEvent.keyDown(input, { key: "Enter", isComposing: true, keyCode: 229 });
  expect(window.desktop!.saveWorkspaceKanban).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: "Enter" });
  await screen.findByRole("article", { name: "IME draft" });
  await waitFor(() => expect(input).toHaveValue(""));
  expect(input).toHaveFocus();
  fireEvent.change(input, { target: { value: "Second inline task" } });
  fireEvent.keyDown(input, { key: "Enter" });
  await screen.findByRole("article", { name: "Second inline task" });
  expect(boards.get("one")!.board.cards.every((card) => card.status === "doing")).toBe(true);
  fireEvent.keyDown(input, { key: "Escape" });
  expect(screen.queryByRole("form")).not.toBeInTheDocument();
});
it("searches notes, distinguishes empty results, collapses columns and hides done", async () => {
  seedCards();
  render(<KanbanBoard workspaceId="one" request={null} />);
  await screen.findByRole("article", { name: "First" });
  fireEvent.click(screen.getByRole("button", { name: "Collapse To do" }));
  expect(screen.queryByRole("article", { name: "First" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Expand To do" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Search cards" }), {
    target: { value: "needle" },
  });
  expect(screen.getByRole("article", { name: "First" })).toHaveAttribute("draggable", "false");
  expect(screen.queryByRole("article", { name: "Second" })).not.toBeInTheDocument();
  expect(screen.getByRole("region", { name: "To do" })).toHaveTextContent("1 / 2");
  fireEvent.change(screen.getByRole("textbox", { name: "Search cards" }), {
    target: { value: "missing" },
  });
  expect(screen.getAllByText("No cards match this search.")).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Show done" }));
  expect(screen.queryByRole("region", { name: "Done" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Copy AI instructions" }));
  await waitFor(() =>
    expect(window.desktop!.copyWorkspaceKanbanInstructions).toHaveBeenCalledWith("one", undefined),
  );
  expect(window.desktop!.saveWorkspaceKanban).not.toHaveBeenCalled();
});
it("supports keyboard reorder and state changes while search disables manual reorder", async () => {
  seedCards();
  render(<KanbanBoard workspaceId="one" request={null} />);
  await screen.findByRole("article", { name: "Second" });
  fireEvent.click(screen.getByRole("button", { name: "More actions for Second" }));
  fireEvent.click(screen.getByRole("button", { name: "Move Second up" }));
  await waitFor(() =>
    expect(boards.get("one")!.board.cards.map((card) => card.id)).toEqual(["b", "a", "c"]),
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Search cards" }), {
    target: { value: "Second" },
  });
  expect(screen.getByRole("button", { name: "Move Second down" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Move Second to Doing" }));
  await waitFor(() =>
    expect(boards.get("one")!.board.cards.find((card) => card.id === "b")!.status).toBe("doing"),
  );
});
it("inserts dragged cards at the actual drop position and ignores external drops", async () => {
  seedCards();
  render(<KanbanBoard workspaceId="one" request={null} />);
  const first = await screen.findByRole("article", { name: "First" });
  const second = screen.getByRole("article", { name: "Second" });
  vi.spyOn(first, "getBoundingClientRect").mockReturnValue({ top: 100, height: 80 } as DOMRect);
  vi.spyOn(second, "getBoundingClientRect").mockReturnValue({ top: 190, height: 80 } as DOMRect);
  const dataTransfer = { setData: vi.fn(), effectAllowed: "", dropEffect: "" };
  fireEvent.dragStart(second, { dataTransfer });
  for (const type of ["dragover", "drop"]) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, {
      clientY: { value: 110 },
      dataTransfer: { value: dataTransfer },
    });
    fireEvent(screen.getByRole("region", { name: "To do" }), event);
  }
  await waitFor(() =>
    expect(boards.get("one")!.board.cards.map((card) => card.id)).toEqual(["b", "a", "c"]),
  );
  const saves = vi.mocked(window.desktop!.saveWorkspaceKanban).mock.calls.length;
  fireEvent.drop(screen.getByRole("region", { name: "Done" }), { dataTransfer });
  expect(window.desktop!.saveWorkspaceKanban).toHaveBeenCalledTimes(saves);
});
it("keeps draft contents when the edited card is externally deleted and invalidates Undo", async () => {
  seedCards();
  const view = render(<KanbanBoard workspaceId="one" request={null} />);
  await screen.findByRole("article", { name: "First" });
  fireEvent.click(screen.getByRole("button", { name: "Delete Completed" }));
  await screen.findByRole("button", { name: "Undo" });
  fireEvent.click(screen.getByRole("button", { name: "Edit First" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Card notes" }), {
    target: { value: "Preserve this draft" },
  });
  boards.set("one", { revision: "remote-deletion", board: { version: 1, cards: [] } });
  await act(async () => {
    view.rerender(<KanbanBoard workspaceId="one" request={null} active={false} />);
  });
  await act(async () => {
    view.rerender(<KanbanBoard workspaceId="one" request={null} active />);
  });
  expect(screen.getByRole("textbox", { name: "Card notes" })).toHaveValue("Preserve this draft");
  expect(screen.getByRole("button", { name: "Save card" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
  expect(screen.getByText(/This card was deleted on disk/)).toBeInTheDocument();
});
it("retains search and scroll through details and allows explicit status editing", async () => {
  seedCards();
  render(<KanbanBoard workspaceId="one" request={null} />);
  const first = await screen.findByRole("article", { name: "First" });
  fireEvent.change(screen.getByRole("textbox", { name: "Search cards" }), {
    target: { value: "First" },
  });
  const body = screen.getByRole("region", { name: "To do" }).querySelector("[data-board-body]")!;
  body.scrollTop = 50;
  fireEvent.click(within(first).getByRole("button", { name: "First" }));
  expect(screen.getByRole("article", { name: "First" })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Card notes" })).toHaveValue("Needle in notes");
  fireEvent.change(screen.getByRole("combobox", { name: "Card status" }), {
    target: { value: "doing" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save card" }));
  await screen.findByRole("article", { name: "First" });
  expect(screen.getByRole("textbox", { name: "Search cards" })).toHaveValue("First");
  expect(body.scrollTop).toBe(50);
  expect(boards.get("one")!.board.cards[0]!.status).toBe("doing");
});
it("asks before discarding changed details and keeps the draft when cancelled", async () => {
  seedCards();
  const confirm = vi.fn().mockReturnValue(false);
  vi.stubGlobal("confirm", confirm);
  try {
    render(<KanbanBoard workspaceId="one" request={null} />);
    await screen.findByRole("article", { name: "First" });
    fireEvent.click(screen.getByRole("button", { name: "Edit First" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Card notes" }), {
      target: { value: "Unsaved changes" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel card editing" }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(screen.getByRole("textbox", { name: "Card notes" })).toHaveValue("Unsaved changes");
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancel card editing" }));
    expect(screen.getByRole("article", { name: "First" })).toBeInTheDocument();
    expect(boards.get("one")!.board.cards[0]!.notes).toBe("Needle in notes");
  } finally {
    vi.unstubAllGlobals();
  }
});
it("blocks writes on unreadable disk content and recovers an open draft when it is repaired", async () => {
  seedCards();
  const view = render(<KanbanBoard workspaceId="one" request={null} />);
  await screen.findByRole("article", { name: "First" });
  fireEvent.click(screen.getByRole("button", { name: "Edit First" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Card notes" }), {
    target: { value: "Still here" },
  });
  await act(async () => {
    view.rerender(<KanbanBoard workspaceId="one" request={null} active={false} />);
  });
  vi.mocked(window.desktop!.readWorkspaceKanban).mockRejectedValueOnce(new Error("Invalid JSON"));
  await act(async () => {
    view.rerender(<KanbanBoard workspaceId="one" request={null} active />);
  });
  expect(screen.getByRole("alert")).toHaveTextContent("Invalid JSON");
  expect(screen.getByRole("button", { name: "Save card" })).toBeDisabled();
  await act(async () => {
    view.rerender(<KanbanBoard workspaceId="one" request={null} active={false} />);
  });
  await act(async () => {
    view.rerender(<KanbanBoard workspaceId="one" request={null} active />);
  });
  expect(screen.getByRole("button", { name: "Save card" })).toBeEnabled();
  expect(screen.getByRole("textbox", { name: "Card notes" })).toHaveValue("Still here");
});
it("does not apply an in-flight external snapshot during a drag", async () => {
  seedCards();
  const view = render(<KanbanBoard workspaceId="one" request={null} />);
  const first = await screen.findByRole("article", { name: "First" });
  await act(async () => {
    view.rerender(<KanbanBoard workspaceId="one" request={null} active={false} />);
  });
  let resolveRead: (snapshot: KanbanSnapshot) => void = () => {};
  vi.mocked(window.desktop!.readWorkspaceKanban).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveRead = resolve;
      }),
  );
  await act(async () => {
    view.rerender(<KanbanBoard workspaceId="one" request={null} active />);
  });
  fireEvent.dragStart(first, { dataTransfer: { setData: vi.fn(), effectAllowed: "" } });
  await act(async () => {
    resolveRead({ board: { version: 1, cards: [] }, revision: "late" });
  });
  expect(screen.getByRole("article", { name: "First" })).toBeInTheDocument();
  fireEvent.dragEnd(first);
});

it("keeps the list visible beside details and saves priority, due date and pending labels as version 2", async () => {
  seedCards();
  render(<KanbanBoard workspaceId="one" workspaceName="Website Redesign" request={null} />);
  await screen.findByRole("article", { name: "First" });
  fireEvent.click(screen.getByRole("button", { name: "Edit First" }));
  expect(screen.getByRole("article", { name: "First" })).toBeInTheDocument();
  expect(screen.getByRole("complementary", { name: "Card details" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Kanban board" })).toHaveAttribute(
    "data-board-expanded",
    "true",
  );
  fireEvent.change(screen.getByRole("combobox", { name: "Card priority" }), {
    target: { value: "high" },
  });
  fireEvent.change(screen.getByLabelText("Card due date"), { target: { value: "2026-10-31" } });
  fireEvent.change(screen.getByRole("textbox", { name: "New card label" }), {
    target: { value: "Design" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save card" }));
  await waitFor(() => expect(screen.queryByRole("form")).not.toBeInTheDocument());
  expect(boards.get("one")!.board.version).toBe(2);
  expect(boards.get("one")!.board.cards[0]).toMatchObject({
    id: "a",
    priority: "high",
    dueDate: "2026-10-31",
    labels: ["Design"],
    notes: "Needle in notes",
  });
  const card = screen.getByRole("article", { name: "First" });
  expect(card).toHaveTextContent("Design");
  expect(card).not.toHaveTextContent("Needle in notes");
  fireEvent.click(screen.getByRole("button", { name: "Restore board to side pane" }));
  fireEvent.click(screen.getByRole("button", { name: "Delete Second" }));
  await screen.findByRole("button", { name: "Undo" });
  expect(boards.get("one")!.board.version).toBe(2);
});
it("sorts and filters by priority without rewriting manual order", async () => {
  boards.set("one", {
    revision: "seed",
    board: {
      version: 2,
      cards: [
        {
          id: "a",
          title: "Low task",
          notes: "",
          status: "todo",
          priority: "low",
          dueDate: "2026-10-31",
        },
        {
          id: "b",
          title: "High task",
          notes: "",
          status: "todo",
          priority: "high",
          dueDate: "2026-10-15",
        },
      ],
    },
  });
  render(<KanbanBoard workspaceId="one" request={null} />);
  await screen.findByRole("article", { name: "Low task" });
  fireEvent.change(screen.getByRole("combobox", { name: "Sort cards" }), {
    target: { value: "priority" },
  });
  expect(screen.getAllByRole("article").map((card) => card.getAttribute("aria-label"))).toEqual([
    "High task",
    "Low task",
  ]);
  expect(screen.getByRole("article", { name: "High task" })).toHaveAttribute("draggable", "false");
  fireEvent.click(screen.getByRole("button", { name: "Filter cards" }));
  fireEvent.change(screen.getByRole("combobox", { name: "Filter by priority" }), {
    target: { value: "high" },
  });
  expect(screen.queryByRole("article", { name: "Low task" })).not.toBeInTheDocument();
  expect(window.desktop!.saveWorkspaceKanban).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  fireEvent.change(screen.getByRole("combobox", { name: "Sort cards" }), {
    target: { value: "manual" },
  });
  expect(screen.getAllByRole("article").map((card) => card.getAttribute("aria-label"))).toEqual([
    "Low task",
    "High task",
  ]);
});
it("confirms before discarding a pending label and restores the drawer after hiding Board", async () => {
  seedCards();
  const confirm = vi.fn().mockReturnValue(false);
  vi.stubGlobal("confirm", confirm);
  try {
    const view = render(<KanbanBoard workspaceId="one" request={null} />);
    await screen.findByRole("article", { name: "First" });
    fireEvent.click(screen.getByRole("button", { name: "Edit First" }));
    fireEvent.change(screen.getByRole("textbox", { name: "New card label" }), {
      target: { value: "Pending label" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel card editing" }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(screen.getByRole("textbox", { name: "New card label" })).toHaveValue("Pending label");
    await act(async () => {
      view.rerender(<KanbanBoard workspaceId="one" request={null} active={false} />);
    });
    await act(async () => {
      view.rerender(<KanbanBoard workspaceId="one" request={null} active />);
    });
    expect(screen.getByRole("region", { name: "Kanban board" })).toHaveAttribute(
      "data-board-expanded",
      "true",
    );
    expect(screen.getByRole("textbox", { name: "New card label" })).toHaveValue("Pending label");
  } finally {
    vi.unstubAllGlobals();
  }
});

it("adds, edits, completes and deletes subtasks and saves pending input", async () => {
  seedCards();
  const view = render(<KanbanBoard workspaceId="one" request={null} />);
  await screen.findByRole("article", { name: "First" });
  fireEvent.click(screen.getByRole("button", { name: "Edit First" }));
  const input = screen.getByRole("textbox", { name: "New subtask title" });
  fireEvent.change(input, { target: { value: "Check layout" } });
  fireEvent.keyDown(input, { key: "Enter", isComposing: true });
  expect(
    within(screen.getByRole("region", { name: "Subtasks" })).queryByRole("checkbox"),
  ).not.toBeInTheDocument();
  fireEvent.keyDown(input, { key: "Enter" });
  fireEvent.change(screen.getByRole("textbox", { name: "Subtask title 1" }), {
    target: { value: "Verify layout" },
  });
  fireEvent.click(screen.getByRole("checkbox", { name: "Complete subtask Verify layout" }));
  fireEvent.change(input, { target: { value: "Remove me" } });
  fireEvent.click(screen.getByRole("button", { name: "Add subtask" }));
  fireEvent.click(screen.getByRole("button", { name: "Delete subtask Remove me" }));
  fireEvent.change(input, { target: { value: "Check keyboard" } });
  fireEvent.click(screen.getByRole("button", { name: "Save card" }));
  await waitFor(() => expect(screen.queryByRole("form")).not.toBeInTheDocument());
  expect(boards.get("one")!.board.version).toBe(3);
  expect(boards.get("one")!.board.cards[0]).toMatchObject({
    status: "todo",
    subtasks: [
      { title: "Verify layout", done: true },
      { title: "Check keyboard", done: false },
    ],
  });
  expect(
    within(screen.getByRole("article", { name: "First" })).getByRole("progressbar"),
  ).toHaveAttribute("aria-valuenow", "1");
  view.unmount();
  render(<KanbanBoard workspaceId="one" request={null} />);
  await screen.findByRole("article", { name: "First" });
  fireEvent.click(screen.getByRole("button", { name: "Edit First" }));
  expect(screen.getByRole("checkbox", { name: "Complete subtask Verify layout" })).toBeChecked();
  expect(screen.getByRole("textbox", { name: "Subtask title 2" })).toHaveValue("Check keyboard");
});

it("keeps pending subtasks when closing is cancelled and keeps the draft after save failure", async () => {
  seedCards();
  const confirm = vi.fn().mockReturnValue(false);
  vi.stubGlobal("confirm", confirm);
  try {
    render(<KanbanBoard workspaceId="one" request={null} />);
    await screen.findByRole("article", { name: "First" });
    fireEvent.click(screen.getByRole("button", { name: "Edit First" }));
    fireEvent.change(screen.getByRole("textbox", { name: "New subtask title" }), {
      target: { value: "Keep this task" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel card editing" }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(screen.getByRole("textbox", { name: "New subtask title" })).toHaveValue(
      "Keep this task",
    );
    vi.mocked(window.desktop!.saveWorkspaceKanban).mockRejectedValueOnce(new Error("Save failed"));
    fireEvent.click(screen.getByRole("button", { name: "Save card" }));
    await screen.findByText("Save failed");
    expect(screen.getByRole("textbox", { name: "Subtask title 1" })).toHaveValue("Keep this task");
    expect(boards.get("one")!.board.version).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Save card" }));
    await waitFor(() => expect(screen.queryByRole("form")).not.toBeInTheDocument());
    expect(boards.get("one")!.board.cards[0]!.subtasks).toHaveLength(1);
  } finally {
    vi.unstubAllGlobals();
  }
});
