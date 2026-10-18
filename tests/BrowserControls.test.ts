import { beforeEach, expect, it } from "vitest";
import { browserShortcut } from "../src/shared/browserShortcuts.js";
import { runBrowserTabCommand } from "../src/renderer/lib/browserCommands.js";
import { initialBrowserTabs, useUiStore } from "../src/renderer/store/uiStore.js";

beforeEach(() =>
  useUiStore.setState({
    browserTabs: [...initialBrowserTabs],
    closedBrowserTabs: [],
    browserPanelEnabled: true,
    browserTabCounter: 2,
    browserWorkspaceId: "a",
    browserSelections: {},
    activeSidePaneTabId: "browser-1",
    browserNavigateRequest: null,
  }),
);

it("opens background links in the source scope without changing the selected tab or pending navigation", () => {
  const state = useUiStore.getState();
  state.openInBrowserTab("https://example.com/current");
  const pending = useUiStore.getState().browserNavigateRequest;
  state.openInBrowserTab("https://example.com/link", {
    newTab: true,
    background: true,
    workspaceId: null,
  });
  expect(useUiStore.getState()).toMatchObject({
    activeSidePaneTabId: "browser-1",
    browserNavigateRequest: pending,
  });
  expect(useUiStore.getState().browserTabs[1]).toMatchObject({
    initialUrl: "https://example.com/link",
    mounted: false,
  });
  expect(useUiStore.getState().browserTabs[1]?.workspaceId).toBeUndefined();
});

it("restores the last closed visible tab with its URL, scope and zoom, using a fresh identity", () => {
  const state = useUiStore.getState();
  state.addBrowserTab();
  state.updateBrowserPage("browser-2", "https://a.example/latest", "Latest");
  state.setBrowserZoom("browser-2", 1.7);
  state.closeBrowserTab("browser-2");
  state.setBrowserWorkspace("b");
  state.addBrowserTab();
  state.closeBrowserTab("browser-3");
  state.setBrowserWorkspace("a");
  runBrowserTabCommand("restore");
  expect(useUiStore.getState().browserTabs.at(-1)).toMatchObject({
    id: "browser-4",
    workspaceId: "a",
    initialUrl: "https://a.example/latest",
    title: "Latest",
    zoomFactor: 1.7,
    mounted: true,
  });
  expect(useUiStore.getState().closedBrowserTabs).toHaveLength(1);
});

it("cycles through visible Browser tabs and wraps without selecting another project's tabs", () => {
  const state = useUiStore.getState();
  state.addBrowserTab();
  state.setBrowserWorkspace("b");
  state.addBrowserTab();
  state.setBrowserWorkspace("a");
  runBrowserTabCommand("next");
  expect(useUiStore.getState().activeSidePaneTabId).toBe("browser-1");
  runBrowserTabCommand("previous");
  expect(useUiStore.getState().activeSidePaneTabId).toBe("browser-2");
});

it("recognizes browser keys without capturing terminal split bindings or Alt combinations", () => {
  const key = (key: string, shift = false, alt = false) =>
    browserShortcut({ key, control: true, meta: false, shift, alt });
  expect(key("+", true)).toBe("zoom-in");
  expect(key("0")).toBe("zoom-reset");
  expect(key("Tab", true)).toBe("previous");
  expect(key("T", true)).toBe("restore");
  expect(key("W", true)).toBeNull();
  expect(key("l", false, true)).toBeNull();
});

it("mounts a background neighbor when closing the selected tab", () => {
  const state = useUiStore.getState();
  state.openInBrowserTab("https://example.com/background", { newTab: true, background: true });
  state.closeBrowserTab("browser-1");
  expect(useUiStore.getState()).toMatchObject({
    activeSidePaneTabId: "browser-2",
    browserTabs: [{ id: "browser-2", mounted: true }],
  });
});
