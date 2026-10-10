import { beforeEach, describe, expect, it } from "vitest";
import { initialBrowserTabs, useUiStore } from "../src/renderer/store/uiStore.js";

beforeEach(() => {
  useUiStore.setState({
    browserTabs: [...initialBrowserTabs],
    browserBookmarks: [],
    browserWorkspaceId: null,
    browserSelections: {},
    expandedFileFolders: {},
    browserTabCounter: 2,
    activeSidePaneTabId: "files",
    browserNavigateRequest: null,
  });
});

describe("Browser persistence", () => {
  it("restores latest URLs, titles, tab order and selection, loading only the selected tab", async () => {
    const store = useUiStore.getState();
    store.openInBrowserTab("https://first.example/");
    store.updateBrowserPage("browser-1", "https://first.example/docs#section", "Documentation");
    store.openInBrowserTab("https://second.example/", { newTab: true });
    store.updateBrowserPage("browser-2", "https://second.example/", "Second page");
    const saved = localStorage.getItem("ai-workspace-starter-ui")!;
    useUiStore.setState({ browserTabs: [], activeSidePaneTabId: "files" });
    localStorage.setItem("ai-workspace-starter-ui", saved);
    await useUiStore.persist.rehydrate();
    expect(useUiStore.getState().browserTabs).toEqual([
      {
        id: "browser-1",
        title: "Documentation",
        initialUrl: "https://first.example/docs#section",
        mounted: false,
      },
      {
        id: "browser-2",
        title: "Second page",
        initialUrl: "https://second.example/",
        mounted: true,
      },
    ]);
    expect(useUiStore.getState().activeSidePaneTabId).toBe("browser-2");
    useUiStore.getState().addBrowserTab();
    expect(useUiStore.getState().browserTabs[2]?.id).toBe("browser-3");
    useUiStore.getState().activateBrowserTab("browser-1");
    expect(useUiStore.getState().browserTabs[0]?.mounted).toBe(true);
  });

  it("persists bookmark edits and normalizes URLs without duplicates", async () => {
    const store = useUiStore.getState();
    store.toggleBrowserBookmark("docs.example", "Docs");
    store.renameBrowserBookmark("https://docs.example/", "API docs");
    await useUiStore.persist.rehydrate();
    expect(useUiStore.getState().browserBookmarks).toEqual([
      { url: "https://docs.example/", title: "API docs" },
    ]);
    store.toggleBrowserBookmark("https://docs.example/", "Docs");
    expect(useUiStore.getState().browserBookmarks).toEqual([]);
    store.toggleBrowserBookmark("javascript:alert(1)", "Bad");
    expect(useUiStore.getState().browserBookmarks).toEqual([]);
  });

  it("rejects corrupt or unsafe saved tabs and bookmarks", async () => {
    localStorage.setItem(
      "ai-workspace-starter-ui",
      JSON.stringify({
        state: {
          activeSidePaneTabId: "browser-9",
          browserTabCounter: -100,
          browserTabs: [
            { id: "browser-1", initialUrl: "javascript:alert(1)" },
            {
              id: "browser-4",
              title: "Valid",
              initialUrl: "https://valid.example/",
              mounted: true,
            },
            { id: "browser-4", initialUrl: "https://duplicate.example/" },
            { id: "invalid", initialUrl: "https://invalid.example/" },
          ],
          browserBookmarks: [
            null,
            { url: "javascript:alert(1)" },
            { url: "https://valid.example/", title: "Valid" },
            { url: "https://valid.example/" },
          ],
        },
        version: 0,
      }),
    );
    await useUiStore.persist.rehydrate();
    expect(useUiStore.getState().browserTabs).toEqual([
      { id: "browser-4", title: "Valid", initialUrl: "https://valid.example/", mounted: false },
    ]);
    expect(useUiStore.getState().activeSidePaneTabId).toBe("files");
    expect(useUiStore.getState().browserTabCounter).toBe(5);
    expect(useUiStore.getState().browserBookmarks).toEqual([
      { url: "https://valid.example/", title: "Valid" },
    ]);
  });
});

it("saves per-tab zoom, clamps bounds, and ignores non-finite factors", async () => {
  const store = useUiStore.getState();
  store.openInBrowserTab("https://zoom.example/");
  store.openInBrowserTab("https://zoom.example/", { newTab: true });
  store.setBrowserZoom("browser-1", 1.2);
  store.setBrowserZoom("browser-2", 0.8);
  await useUiStore.persist.rehydrate();
  expect(useUiStore.getState().browserTabs.map((tab) => tab.zoomFactor)).toEqual([1.2, 0.8]);
  store.setBrowserZoom("browser-1", 100);
  store.setBrowserZoom("browser-2", -1);
  store.setBrowserZoom("browser-1", NaN);
  expect(useUiStore.getState().browserTabs.map((tab) => tab.zoomFactor)).toEqual([3, 0.5]);
});

it("restores local file tabs and bookmarks with project scope and zoom", async () => {
  const store = useUiStore.getState();
  store.setBrowserWorkspace("local-docs");
  expect(store.openInBrowserTab("file:///tmp/local page.html#docs", { newTab: true })).toBe(true);
  store.setBrowserZoom("browser-2", 1.2);
  store.toggleBrowserBookmark("file:///tmp/local page.html#docs", "Local docs");
  await useUiStore.persist.rehydrate();
  expect(useUiStore.getState().browserTabs[1]).toMatchObject({
    initialUrl: "file:///tmp/local%20page.html#docs",
    workspaceId: "local-docs",
    zoomFactor: 1.2,
  });
  expect(useUiStore.getState().browserBookmarks).toEqual([
    { url: "file:///tmp/local%20page.html#docs", title: "Local docs", workspaceId: "local-docs" },
  ]);
});

describe("Files expansion persistence", () => {
  it("restores per-project expanded paths and saved collapse operations", async () => {
    const store = useUiStore.getState();
    store.setFileFolderExpanded("a", "src", true);
    store.setFileFolderExpanded("a", "src/lib", true);
    store.setFileFolderExpanded("a", "src", false);
    store.setFileFolderExpanded("b", "docs", true);
    const saved = localStorage.getItem("ai-workspace-starter-ui")!;
    useUiStore.setState({ expandedFileFolders: {} });
    localStorage.setItem("ai-workspace-starter-ui", saved);
    await useUiStore.persist.rehydrate();
    expect(useUiStore.getState().expandedFileFolders).toEqual({ a: ["src/lib"], b: ["docs"] });
  });

  it("accepts old settings and filters invalid saved paths", async () => {
    for (const [value, expected] of [
      [undefined, {}],
      [null, {}],
      [{ a: ["src", "src", 42, ""], b: "invalid" }, { a: ["src"] }],
    ]) {
      localStorage.setItem(
        "ai-workspace-starter-ui",
        JSON.stringify({ state: { expandedFileFolders: value } }),
      );
      await useUiStore.persist.rehydrate();
      expect(useUiStore.getState().expandedFileFolders).toEqual(expected);
    }
  });
});
