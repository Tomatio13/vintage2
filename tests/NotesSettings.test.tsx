import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { SettingsDialog } from "../src/renderer/components/SettingsDialog.js";
import { SidePane } from "../src/renderer/components/SidePane.js";
import { useUiStore } from "../src/renderer/store/uiStore.js";

afterEach(() => {
  useUiStore.setState({
    notesPanelEnabled: true,
    settingsOpen: false,
    activeSidePaneTabId: "files",
  });
});
it("saves the Notes visibility preference through Settings", () => {
  useUiStore.setState({ notesPanelEnabled: true, settingsOpen: true });
  render(<SettingsDialog />);
  fireEvent.click(screen.getByRole("button", { name: "Notes" }));
  fireEvent.click(screen.getByRole("button", { name: "Off" }));
  expect(useUiStore.getState().notesPanelEnabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
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
