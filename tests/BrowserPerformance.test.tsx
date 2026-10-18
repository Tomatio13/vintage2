import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BrowserPane } from "../src/renderer/components/BrowserPane.js";
import { initialBrowserTabs, useUiStore } from "../src/renderer/store/uiStore.js";

beforeEach(() =>
  useUiStore.setState({
    browserTabs: [...initialBrowserTabs],
    browserBookmarks: [],
    browserWorkspaceId: null,
    browserTabCounter: 2,
    browserPanelEnabled: true,
    activeSidePaneTabId: "files",
  }),
);
afterEach(() => {
  vi.restoreAllMocks();
  useUiStore.setState({
    browserBookmarks: [],
    browserTabs: [...initialBrowserTabs],
    activeSidePaneTabId: "files",
  });
});

it("does not notify subscribers or write storage for repeated page metadata", () => {
  const store = useUiStore.getState();
  store.openInBrowserTab("https://same.example/");
  store.updateBrowserPage("browser-1", "https://same.example/", "Same");
  const save = vi.spyOn(Object.getPrototypeOf(localStorage), "setItem");
  const notify = vi.fn();
  const unsubscribe = useUiStore.subscribe(notify);
  store.updateBrowserPage("browser-1", "https://same.example/", "Same");
  store.updateBrowserPage("missing", "https://same.example/", "Same");
  expect(save).not.toHaveBeenCalled();
  expect(notify).not.toHaveBeenCalled();
  unsubscribe();
});

it("suspends background pages while preserving tab addresses and the selected page", () => {
  const store = useUiStore.getState();
  store.openInBrowserTab("https://first.example/");
  store.openInBrowserTab("https://second.example/", { newTab: true });
  const tabs = useUiStore.getState().browserTabs;
  store.suspendBackgroundBrowserTabs();
  expect(useUiStore.getState().browserTabs).toEqual(
    tabs.map((tab) => (tab.id === "browser-2" ? tab : { ...tab, mounted: false })),
  );
  store.activateBrowserTab("browser-1");
  expect(useUiStore.getState().browserTabs[0]).toMatchObject({
    mounted: true,
    initialUrl: "https://first.example/",
  });
});

it("pages and filters 1000 bookmarks and saves title edits on blur", () => {
  useUiStore.setState({
    browserBookmarks: Array.from({ length: 1000 }, (_, i) => ({
      url: `https://docs.example/${i}`,
      title: `Saved ${i}`,
    })),
  });
  render(<BrowserPane tabId="browser-1" initialUrl="https://example.com/" active />);
  fireEvent.click(screen.getByRole("button", { name: "Bookmarks" }));
  expect(screen.getAllByRole("textbox", { name: /^Bookmark name/ })).toHaveLength(50);
  fireEvent.click(
    within(screen.getByRole("navigation", { name: "Bookmark pages" })).getByRole("button", {
      name: "Next",
    }),
  );
  expect(
    screen.getByRole("textbox", { name: "Bookmark name for https://docs.example/50" }),
  ).toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox", { name: "Filter bookmarks" }), {
    target: { value: "Saved 999" },
  });
  const title = screen.getByRole("textbox", { name: "Bookmark name for https://docs.example/999" });
  expect(screen.getAllByRole("textbox", { name: /^Bookmark name/ })).toHaveLength(1);
  fireEvent.change(title, { target: { value: "Renamed page" } });
  expect(useUiStore.getState().browserBookmarks[999]?.title).toBe("Saved 999");
  fireEvent.blur(title);
  expect(useUiStore.getState().browserBookmarks[999]?.title).toBe("Renamed page");
});

it("normalizes the bookmark page after deleting the final page", () => {
  useUiStore.setState({
    browserBookmarks: Array.from({ length: 51 }, (_, i) => ({
      url: `https://docs.example/${i}`,
      title: `Saved ${i}`,
    })),
  });
  render(<BrowserPane tabId="browser-1" initialUrl="https://example.com/" active />);
  fireEvent.click(screen.getByRole("button", { name: "Bookmarks" }));
  fireEvent.click(
    within(screen.getByRole("navigation", { name: "Bookmark pages" })).getByRole("button", {
      name: "Next",
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Delete bookmark Saved 50" }));
  act(() => useUiStore.getState().toggleBrowserBookmark("https://new.example/", "New bookmark"));
  expect(
    within(screen.getByRole("navigation", { name: "Bookmark pages" })).getByRole("button", {
      name: "Previous",
    }),
  ).toBeDisabled();
  expect(
    screen.getByRole("textbox", { name: "Bookmark name for https://docs.example/0" }),
  ).toBeInTheDocument();
});

it("routes wheel zoom to the active guest and accumulates rapid requests within the zoom limits", () => {
  let zoom: (guestId: number, direction: "in" | "out") => void = () => {};
  const unsubscribe = vi.fn();
  vi.stubGlobal("desktop", {
    onBrowserZoomRequested: (listener: typeof zoom) => {
      zoom = listener;
      return unsubscribe;
    },
  });
  const create = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation(
    (tag: string, options?: ElementCreationOptions) => {
      const element = create(tag, options);
      if (tag === "webview") {
        Object.assign(element, { getWebContentsId: () => 42, setZoomFactor: vi.fn() });
      }
      return element as Electron.WebviewTag;
    },
  );
  const view = render(<BrowserPane tabId="browser-1" initialUrl="https://example.com/" active />);
  try {
    act(() => {
      zoom(99, "in");
      zoom(42, "in");
      zoom(42, "in");
    });
    expect(useUiStore.getState().browserTabs[0]!.zoomFactor).toBe(1.2);
    act(() => zoom(42, "out"));
    expect(useUiStore.getState().browserTabs[0]!.zoomFactor).toBe(1.1);
    act(() => {
      for (let i = 0; i < 40; i++) zoom(42, "out");
    });
    expect(useUiStore.getState().browserTabs[0]!.zoomFactor).toBe(0.5);
    act(() => {
      for (let i = 0; i < 40; i++) zoom(42, "in");
    });
    expect(useUiStore.getState().browserTabs[0]!.zoomFactor).toBe(3);
    view.rerender(
      <BrowserPane tabId="browser-1" initialUrl="https://example.com/" active={false} />,
    );
    act(() => zoom(42, "out"));
    expect(useUiStore.getState().browserTabs[0]!.zoomFactor).toBe(3);
    view.unmount();
    expect(unsubscribe).toHaveBeenCalled();
  } finally {
    view.unmount();
    vi.unstubAllGlobals();
  }
});
