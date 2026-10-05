import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { SettingsDialog } from "../src/renderer/components/SettingsDialog.js";
import { SidePane } from "../src/renderer/components/SidePane.js";
import { useUiStore } from "../src/renderer/store/uiStore.js";

afterEach(() => {
  useUiStore.setState({
    filesPanelEnabled: true,
    reviewPanelEnabled: true,
    browserPanelEnabled: true,
    notesPanelEnabled: true,
    boardPanelEnabled: true,
    settingsOpen: false,
    activeSidePaneTabId: "files",
  });
});
it("saves the Notes visibility preference through Settings", () => {
  useUiStore.setState({ notesPanelEnabled: true, settingsOpen: true });
  render(<SettingsDialog />);
  fireEvent.click(screen.getByRole("button", { name: "Panels" }));
  fireEvent.click(screen.getByRole("switch", { name: "Show Notes tab" }));
  expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
  expect(useUiStore.getState().notesPanelEnabled).toBe(false);
  expect(JSON.parse(localStorage.getItem("ai-workspace-starter-ui")!).state.notesPanelEnabled).toBe(
    false,
  );
});
it("hides active Notes, blocks its shortcut route and restores the tab without deleting notes", () => {
  localStorage.setItem(
    "vintage:markdown:workspace::scratchpad",
    JSON.stringify({ content: "Keep this note", original: "" }),
  );
  useUiStore.setState({ notesPanelEnabled: true, activeSidePaneTabId: "notes" });
  render(<SidePane workspaceId="workspace" onOpenFile={() => {}} />);
  expect(screen.getByRole("textbox", { name: "Workspace notes" })).toHaveValue("Keep this note");
  act(() => useUiStore.setState({ notesPanelEnabled: false }));
  expect(screen.queryByRole("button", { name: "Notes" })).not.toBeInTheDocument();
  expect(useUiStore.getState().activeSidePaneTabId).toBe("files");
  act(() => useUiStore.getState().showSidePaneTab("notes"));
  expect(useUiStore.getState().activeSidePaneTabId).toBe("files");
  act(() => useUiStore.setState({ notesPanelEnabled: true }));
  fireEvent.click(screen.getByRole("button", { name: "Notes" }));
  expect(screen.getByRole("textbox", { name: "Workspace notes" })).toHaveValue("Keep this note");
});

it("saves Board visibility independently and falls back from a hidden Board", () => {
  useUiStore.setState({ notesPanelEnabled: true, boardPanelEnabled: true, settingsOpen: true });
  const settings = render(<SettingsDialog />);
  fireEvent.click(screen.getByRole("button", { name: "Panels" }));
  fireEvent.click(screen.getByRole("switch", { name: "Show Board tab" }));
  expect(useUiStore.getState().boardPanelEnabled).toBe(false);
  expect(useUiStore.getState().notesPanelEnabled).toBe(true);
  expect(JSON.parse(localStorage.getItem("ai-workspace-starter-ui")!).state.boardPanelEnabled).toBe(
    false,
  );
  settings.unmount();
  useUiStore.setState({ boardPanelEnabled: true, activeSidePaneTabId: "board" });
  render(<SidePane workspaceId={null} onOpenFile={() => {}} />);
  const labels = screen.getAllByRole("button").map((button) => button.textContent);
  expect(labels.slice(0, 4)).toEqual(["Files", "Review", "Notes", "Board"]);
  act(() => useUiStore.setState({ boardPanelEnabled: false }));
  expect(screen.queryByRole("button", { name: "Board" })).not.toBeInTheDocument();
  expect(useUiStore.getState().activeSidePaneTabId).toBe("files");
  act(() => useUiStore.getState().showSidePaneTab("board"));
  expect(useUiStore.getState().activeSidePaneTabId).toBe("files");
});

it("keeps Updates separate from Usage settings", () => {
  useUiStore.setState({ settingsOpen: true });
  render(<SettingsDialog />);
  fireEvent.click(screen.getByRole("button", { name: "Usage" }));
  expect(screen.getByRole("textbox", { name: "codexbar path" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Updates" }));
  expect(screen.getByRole("heading", { name: "About this edition" })).toBeInTheDocument();
  expect(screen.queryByRole("textbox", { name: "codexbar path" })).not.toBeInTheDocument();
});

it("autosaves valid browser URLs and keeps the last valid value on invalid input", () => {
  useUiStore.setState({ settingsOpen: true, browserDefaultUrl: "" });
  render(<SettingsDialog />);
  fireEvent.click(screen.getByRole("button", { name: "Browser" }));
  const input = screen.getByRole("textbox", { name: "Default browser URL" });
  fireEvent.change(input, { target: { value: "https://example.com" } });
  const savedUrl = useUiStore.getState().browserDefaultUrl;
  expect(savedUrl).toContain("https://example.com");
  fireEvent.change(input, { target: { value: "javascript:alert(1)" } });
  expect(screen.getByRole("alert")).toBeInTheDocument();
  expect(useUiStore.getState().browserDefaultUrl).toBe(savedUrl);
  fireEvent.click(screen.getByRole("button", { name: "Workspace" }));
  expect(useUiStore.getState().browserDefaultUrl).toBe(savedUrl);
  expect(screen.queryByRole("button", { name: "Discard" })).not.toBeInTheDocument();
});

it("keeps the Workspace return button enabled in every settings section", () => {
  for (const section of [
    "Appearance",
    "Terminal",
    "Browser",
    "Attention",
    "Shortcuts",
    "Integrations",
    "Panels",
    "Usage",
    "Updates",
  ]) {
    useUiStore.setState({ settingsOpen: true });
    const view = render(<SettingsDialog />);
    fireEvent.click(screen.getByRole("button", { name: section }));
    const back = screen.getByRole("button", { name: "Workspace" });
    expect(back).toBeEnabled();
    fireEvent.click(back);
    expect(useUiStore.getState().settingsOpen).toBe(false);
    expect(screen.queryByRole("dialog", { name: "Settings" })).not.toBeInTheDocument();
    view.unmount();
  }
});
