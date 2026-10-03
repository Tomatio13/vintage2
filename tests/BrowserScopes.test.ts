import { beforeEach, expect, it } from "vitest";
import { initialBrowserTabs, useUiStore } from "../src/renderer/store/uiStore.js";
beforeEach(() =>
  useUiStore.setState({
    browserTabs: [...initialBrowserTabs],
    browserBookmarks: [],
    browserWorkspaceId: null,
    browserSelections: {},
    activeSidePaneTabId: "files",
    browserTabCounter: 2,
    browserNavigateRequest: null,
  }),
);
it("keeps common tabs and remembers project selection without dropping other projects", async () => {
  const store = useUiStore.getState();
  store.setBrowserWorkspace("project-a");
  store.addBrowserTab();
  store.updateBrowserPage("browser-2", "https://a.example/docs", "A docs");
  store.setBrowserZoom("browser-2", 1.3);
  store.setBrowserWorkspace("project-b");
  store.addBrowserTab();
  store.updateBrowserPage("browser-3", "https://b.example/docs", "B docs");
  store.setBrowserWorkspace("project-a");
  expect(useUiStore.getState().activeSidePaneTabId).toBe("browser-2");
  expect(useUiStore.getState().browserTabs[2]).toMatchObject({
    workspaceId: "project-b",
    initialUrl: "https://b.example/docs",
  });
  store.setBrowserWorkspace("project-b");
  expect(useUiStore.getState().activeSidePaneTabId).toBe("browser-3");
  await useUiStore.persist.rehydrate();
  store.setBrowserWorkspace("project-a");
  expect(useUiStore.getState().activeSidePaneTabId).toBe("browser-2");
  expect(useUiStore.getState().browserTabs[1]).toMatchObject({
    zoomFactor: 1.3,
    workspaceId: "project-a",
    mounted: true,
  });
  expect(useUiStore.getState().browserTabs[0]?.workspaceId).toBeUndefined();
});
it("moves a tab without losing its identity or saved page", () => {
  const store = useUiStore.getState();
  store.setBrowserWorkspace("a");
  store.addBrowserTab();
  store.updateBrowserPage("browser-2", "https://shared.example/", "Shared");
  store.moveBrowserTab("browser-2", null);
  store.setBrowserWorkspace("b");
  expect(useUiStore.getState().activeSidePaneTabId).toBe("browser-2");
  expect(useUiStore.getState().browserTabs[1]).toMatchObject({
    id: "browser-2",
    mounted: true,
    initialUrl: "https://shared.example/",
  });
  expect(useUiStore.getState().browserTabs[1]?.workspaceId).toBeUndefined();
  store.moveBrowserTab("browser-2", "b");
  expect(useUiStore.getState().browserTabs[1]?.workspaceId).toBe("b");
});
it("does not navigate or discard foreign project tabs when none are visible", () => {
  const store = useUiStore.getState();
  useUiStore.setState({ browserTabs: [] });
  store.setBrowserWorkspace("a");
  store.addBrowserTab();
  store.setBrowserWorkspace("b");
  store.openInBrowserTab("https://b.example/");
  expect(useUiStore.getState().browserTabs.map((tab) => tab.workspaceId)).toEqual(["a", "b"]);
  store.closeBrowserTab("browser-3");
  expect(useUiStore.getState().activeSidePaneTabId).toBe("files");
  store.openBrowserPane();
  expect(useUiStore.getState().browserTabs.map((tab) => tab.workspaceId)).toEqual(["a", "b"]);
});
it("stores the same bookmark URL independently for Common and each project", async () => {
  const store = useUiStore.getState();
  store.toggleBrowserBookmark("https://docs.example/", "Common", null);
  store.setBrowserWorkspace("a");
  store.toggleBrowserBookmark("https://docs.example/", "A");
  store.setBrowserWorkspace("b");
  store.toggleBrowserBookmark("https://docs.example/", "B");
  store.renameBrowserBookmark("https://docs.example/", "Common updated", null);
  await useUiStore.persist.rehydrate();
  expect(useUiStore.getState().browserBookmarks.map((item) => item.title)).toEqual([
    "Common updated",
    "A",
    "B",
  ]);
  store.toggleBrowserBookmark("https://docs.example/", "B");
  expect(useUiStore.getState().browserBookmarks.map((item) => item.title)).toEqual([
    "Common updated",
    "A",
  ]);
});

it("migrates older unscoped tabs and bookmarks to Common without losing zoom or URLs", async () => {
  localStorage.setItem(
    "ai-workspace-starter-ui",
    JSON.stringify({
      version: 0,
      state: {
        browserTabs: [
          {
            id: "browser-7",
            title: "Legacy",
            initialUrl: "https://legacy.example/",
            mounted: true,
            zoomFactor: 1.4,
          },
        ],
        browserBookmarks: [{ url: "https://legacy.example/", title: "Legacy docs" }],
        activeSidePaneTabId: "browser-7",
      },
    }),
  );
  await useUiStore.persist.rehydrate();
  const store = useUiStore.getState();
  store.setBrowserWorkspace("a");
  store.setBrowserWorkspace("b");
  expect(useUiStore.getState().activeSidePaneTabId).toBe("browser-7");
  expect(useUiStore.getState().browserTabs[0]).toEqual({
    id: "browser-7",
    title: "Legacy",
    initialUrl: "https://legacy.example/",
    mounted: true,
    zoomFactor: 1.4,
  });
  expect(useUiStore.getState().browserBookmarks).toEqual([
    { url: "https://legacy.example/", title: "Legacy docs" },
  ]);
});
