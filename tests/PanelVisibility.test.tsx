import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { SettingsDialog } from "../src/renderer/components/SettingsDialog.js";
import { SidePane } from "../src/renderer/components/SidePane.js";
import { initialBrowserTabs, panelSettingKeys, useUiStore } from "../src/renderer/store/uiStore.js";

function reset() {
  useUiStore.setState({
    filesPanelEnabled: true,
    reviewPanelEnabled: true,
    browserPanelEnabled: true,
    notesPanelEnabled: true,
    boardPanelEnabled: true,
    usagePanelEnabled: false,
    settingsOpen: false,
    activeSidePaneTabId: "files",
    browserTabs: [...initialBrowserTabs],
    browserWorkspaceId: null,
    browserSelections: {},
    browserTabCounter: 2,
    browserNavigateRequest: null,
  });
}
beforeEach(reset);
afterEach(reset);

it("autosaves all six panel switches and adds four toggle shortcuts", () => {
  useUiStore.setState({ settingsOpen: true });
  render(<SettingsDialog />);
  fireEvent.click(screen.getByRole("button", { name: "Panels" }));
  for (const panel of ["Files", "Review", "Usage", "Browser"] as const) {
    fireEvent.click(screen.getByRole("switch", { name: `Show ${panel} tab` }));
    const key = panelSettingKeys[panel.toLowerCase() as keyof typeof panelSettingKeys];
    expect(useUiStore.getState()[key]).toBe(panel === "Usage");
    expect(JSON.parse(localStorage.getItem("ai-workspace-starter-ui")!).state[key]).toBe(
      panel === "Usage",
    );
  }
  fireEvent.click(screen.getByRole("button", { name: "Shortcuts" }));
  const rows = within(screen.getByRole("region", { name: "Side pane shortcuts" }))
    .getAllByRole("rowheader")
    .map((row) => row.textContent);
  expect(rows).toEqual([
    "Toggle side pane",
    "Open Files pane",
    "Toggle Files tab",
    "Open Review pane",
    "Toggle Review tab",
    "Open Notes pane",
    "Toggle Notes tab",
    "Open Board pane",
    "Toggle Board tab",
    "Open Usage pane",
    "Toggle Usage tab",
    "Open Browser pane",
    "Toggle Browser tab",
  ]);

  for (const panel of ["Files", "Review", "Usage", "Browser"])
    expect(
      screen.getByRole("button", { name: `Set Toggle ${panel} tab shortcut` }),
    ).toBeInTheDocument();
});

it("falls back to enabled panels and blocks disabled open routes", () => {
  const store = useUiStore.getState();
  store.setPanelEnabled("files", false);
  expect(useUiStore.getState().activeSidePaneTabId).toBe("review");
  store.showSidePaneTab("files");
  store.activateSidePaneTab("files");
  expect(useUiStore.getState().activeSidePaneTabId).toBe("review");
  store.setPanelEnabled("review", false);
  expect(useUiStore.getState().activeSidePaneTabId).toBe("notes");
  store.togglePanel("review");
  store.showSidePaneTab("review");
  expect(useUiStore.getState().activeSidePaneTabId).toBe("review");
});

it("hides Browser controls without deleting its running tabs", () => {
  const store = useUiStore.getState();
  store.openInBrowserTab("https://example.com");
  const tabs = useUiStore.getState().browserTabs;
  render(<SidePane workspaceId={null} onOpenFile={() => {}} />);
  act(() => store.setPanelEnabled("browser", false));
  expect(screen.queryByRole("group", { name: "Browser tabs" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "New browser tab" })).not.toBeInTheDocument();
  store.openBrowserPane();
  store.addBrowserTab();
  expect(store.openInBrowserTab("https://other.example")).toBe(false);
  expect(useUiStore.getState().browserTabs).toEqual(tabs);
  act(() => store.setPanelEnabled("browser", true));
  act(() => store.openBrowserPane());
  expect(useUiStore.getState().activeSidePaneTabId).toBe(tabs[0]!.id);
});

it("shows an empty state when every panel is disabled and recovers on enabling one", () => {
  const store = useUiStore.getState();
  for (const panel of Object.keys(panelSettingKeys) as Array<keyof typeof panelSettingKeys>)
    store.setPanelEnabled(panel, false);
  render(<SidePane workspaceId={null} onOpenFile={() => {}} />);
  expect(screen.getByText(/All panels are hidden/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Files" })).not.toBeInTheDocument();
  act(() => store.setPanelEnabled("review", true));
  expect(useUiStore.getState().activeSidePaneTabId).toBe("review");
  expect(screen.getByRole("button", { name: "Review" })).toBeInTheDocument();
});
