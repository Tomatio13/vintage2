import { beforeEach, describe, expect, it } from "vitest";

import {
  initialBrowserTabs,
  useUiStore,
  type BrowserTabState,
} from "../src/renderer/store/uiStore.js";

function resetBrowserState(): void {
  useUiStore.setState({
    activeSidePaneTabId: "files",
    browserTabs: [...initialBrowserTabs],
    browserTabCounter: 2,
    browserNavigateRequest: null,
    sidePaneOpen: false,
  });
}

describe("uiStore browser tabs", () => {
  beforeEach(resetBrowserState);

  it("opens a URL in the existing browser tab and switches to it", () => {
    const store = useUiStore.getState();
    expect(store.openInBrowserTab("http://localhost:5173/")).toBe(true);

    const state = useUiStore.getState();
    expect(state.sidePaneOpen).toBe(true);
    expect(state.activeSidePaneTabId).toBe("browser-1");
    expect(state.browserTabs[0]).toMatchObject({
      id: "browser-1",
      initialUrl: "http://localhost:5173/",
      mounted: true,
    });
    expect(state.browserNavigateRequest).toBeNull();
  });

  it("sends a navigate request to an already mounted tab", () => {
    useUiStore.setState({
      browserTabs: [
        { id: "browser-1", title: "Browser", initialUrl: "https://a.example/", mounted: true },
      ],
      activeSidePaneTabId: "files",
    });

    expect(useUiStore.getState().openInBrowserTab("https://b.example/")).toBe(true);
    const state = useUiStore.getState();
    expect(state.activeSidePaneTabId).toBe("browser-1");
    expect(state.browserNavigateRequest).toMatchObject({
      tabId: "browser-1",
      url: "https://b.example/",
      nonce: 1,
    });

    expect(useUiStore.getState().openInBrowserTab("https://c.example/")).toBe(true);
    expect(useUiStore.getState().browserNavigateRequest).toMatchObject({ nonce: 2 });

    useUiStore.getState().consumeBrowserNavigateRequest(2);
    expect(useUiStore.getState().browserNavigateRequest).toBeNull();
  });

  it("creates a new tab when requested or when no tabs remain", () => {
    useUiStore.setState({
      browserTabs: [
        { id: "browser-1", title: "Browser", initialUrl: "https://a.example/", mounted: true },
      ],
      browserTabCounter: 2,
    });

    expect(useUiStore.getState().openInBrowserTab("https://b.example/", { newTab: true })).toBe(
      true,
    );
    const state = useUiStore.getState();
    expect(state.browserTabs).toHaveLength(2);
    expect(state.browserTabs[1]).toMatchObject({
      id: "browser-2",
      initialUrl: "https://b.example/",
    });
    expect(state.activeSidePaneTabId).toBe("browser-2");

    useUiStore.setState({ browserTabs: [], activeSidePaneTabId: "files" });
    expect(useUiStore.getState().openInBrowserTab("https://c.example/")).toBe(true);
    const recreated = useUiStore.getState();
    expect(recreated.browserTabs).toHaveLength(1);
    expect(recreated.browserTabs[0]).toMatchObject({ id: "browser-3" });
    expect(recreated.activeSidePaneTabId).toBe("browser-3");
  });

  it("rejects URLs the embedded browser cannot show", () => {
    expect(useUiStore.getState().openInBrowserTab("javascript:alert(1)")).toBe(false);
    expect(useUiStore.getState().openInBrowserTab("not a url")).toBe(false);
    const state = useUiStore.getState();
    expect(state.browserTabs).toEqual(initialBrowserTabs);
    expect(state.sidePaneOpen).toBe(false);
  });

  it("falls back to a neighbor tab when the active browser tab closes", () => {
    useUiStore.setState({
      browserTabs: [
        { id: "browser-1", title: "Browser", initialUrl: "https://a.example/", mounted: true },
        { id: "browser-2", title: "Browser 2", initialUrl: "https://b.example/", mounted: true },
      ] satisfies BrowserTabState[],
      activeSidePaneTabId: "browser-2",
      browserTabCounter: 3,
    });

    useUiStore.getState().closeBrowserTab("browser-2");
    let state = useUiStore.getState();
    expect(state.activeSidePaneTabId).toBe("browser-1");

    useUiStore.getState().closeBrowserTab("browser-1");
    state = useUiStore.getState();
    expect(state.browserTabs).toHaveLength(0);
    expect(state.activeSidePaneTabId).toBe("files");
  });

  it("mounts an unmounted tab on activation with the default URL", () => {
    useUiStore.getState().activateBrowserTab("browser-1");
    const state = useUiStore.getState();
    expect(state.activeSidePaneTabId).toBe("browser-1");
    expect(state.browserTabs[0]).toMatchObject({
      mounted: true,
      initialUrl: useUiStore.getState().browserDefaultUrl,
    });
  });

  it("adds numbered tabs from the tab strip", () => {
    useUiStore.getState().addBrowserTab();
    let state = useUiStore.getState();
    expect(state.browserTabs).toHaveLength(2);
    expect(state.activeSidePaneTabId).toBe("browser-2");

    useUiStore.getState().addBrowserTab();
    state = useUiStore.getState();
    expect(state.browserTabs).toHaveLength(3);
    expect(state.browserTabs[2]).toMatchObject({ id: "browser-3", title: "Browser 3" });
  });
});
