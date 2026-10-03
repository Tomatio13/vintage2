import {
  Bug,
  Bookmark,
  Search,
  Star,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  ExternalLink,
  MonitorSmartphone,
  Minus,
  Plus,
  MousePointerClick,
  RefreshCw,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import { normalizeBrowserUrl } from "../lib/browserUrl.js";
import { useUiStore } from "../store/uiStore.js";
import { BrowserScopePicker } from "./BrowserScopePicker.js";
import { Button } from "./Button.js";

interface EmbeddedWebviewElement extends HTMLElement {
  src: string;
  loadURL(url: string): Promise<void>;
  getURL(): string;
  getTitle(): string;
  setZoomFactor(factor: number): void;
  getWebContentsId(): number;
  findInPage(text: string, options?: { forward?: boolean; findNext?: boolean }): number;
  stopFindInPage(action: "clearSelection"): void;
  canGoBack(): boolean;
  canGoForward(): boolean;
  goBack(): void;
  goForward(): void;
  reload(): void;
  stop(): void;
  executeJavaScript(code: string, userGesture?: boolean): Promise<unknown>;
  openDevTools(): void;
}

interface WebviewNavigationEvent extends Event {
  url: string;
}

interface WebviewFailureEvent extends WebviewNavigationEvent {
  errorCode: number;
  errorDescription: string;
}

interface PageElementPickResult {
  status: "cancelled" | "selected";
  selector?: string;
}

const ELEMENT_PICKER_SCRIPT = `(() => {
  const key = "__vintageElementPicker";
  if (window[key]) {
    window[key].cancel();
    return Promise.resolve({ status: "cancelled" });
  }

  return new Promise((resolve) => {
    let highlighted = null;
    let previousOutline = "";
    const root = document.documentElement;
    const body = document.body;
    const previousRootCursor = root.style.cursor;
    const previousBodyCursor = body?.style.cursor ?? "";

    const restoreHighlight = () => {
      if (highlighted) highlighted.style.outline = previousOutline;
      highlighted = null;
      previousOutline = "";
    };

    const cleanup = () => {
      document.removeEventListener("pointerover", onPointerOver, true);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKeyDown, true);
      restoreHighlight();
      root.style.cursor = previousRootCursor;
      if (body) body.style.cursor = previousBodyCursor;
      delete window[key];
    };

    const onPointerOver = (event) => {
      const element = event.target instanceof Element ? event.target : null;
      if (!element || element === highlighted) return;
      restoreHighlight();
      highlighted = element;
      previousOutline = element.style.outline;
      element.style.outline = "2px solid Highlight";
    };

    const onClick = (event) => {
      const element = event.target instanceof Element ? event.target : null;
      if (!element) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const id = element.id ? "#" + CSS.escape(element.id) : "";
      const classes = Array.from(element.classList)
        .slice(0, 2)
        .map((name) => "." + CSS.escape(name))
        .join("");
      const selector = id || element.tagName.toLowerCase() + classes;
      cleanup();
      resolve({ status: "selected", selector });
    };

    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      cleanup();
      resolve({ status: "cancelled" });
    };

    window[key] = {
      cancel() {
        cleanup();
        resolve({ status: "cancelled" });
      },
    };
    root.style.cursor = "crosshair";
    if (body) body.style.cursor = "crosshair";
    document.addEventListener("pointerover", onPointerOver, true);
    document.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKeyDown, true);
  });
})()`;

export function BrowserPane({
  initialUrl,
  tabId,
  workspaceName,
  active,
  navigateRequest,
  onNavigateRequestHandled,
}: {
  initialUrl: string;
  tabId: string;
  workspaceName?: string | null | undefined;
  active: boolean;
  navigateRequest?: { url: string; nonce: number } | undefined;
  onNavigateRequestHandled?: ((nonce: number) => void) | undefined;
}) {
  const zoomFactor = useUiStore(
    (state) => state.browserTabs.find((tab) => tab.id === tabId)?.zoomFactor ?? 1,
  );
  const setZoom = useUiStore((state) => state.setBrowserZoom);
  const zoomRef = useRef(zoomFactor);
  zoomRef.current = zoomFactor;
  const allBookmarks = useUiStore((state) => state.browserBookmarks);
  const workspaceId = useUiStore((state) => state.browserWorkspaceId);
  const tabWorkspaceId = useUiStore(
    (state) => state.browserTabs.find((tab) => tab.id === tabId)?.workspaceId,
  );
  const moveTab = useUiStore((state) => state.moveBrowserTab);
  const [bookmarkScope, setBookmarkScope] = useState<string | null>(workspaceId);
  useEffect(() => setBookmarkScope(workspaceId), [workspaceId]);
  const bookmarks = allBookmarks.filter(
    (item) => !item.workspaceId || item.workspaceId === workspaceId,
  );

  const updatePage = useUiStore((state) => state.updateBrowserPage);
  const toggleBookmark = useUiStore((state) => state.toggleBrowserBookmark);
  const renameBookmark = useUiStore((state) => state.renameBrowserBookmark);
  const openBookmark = useUiStore((state) => state.openInBrowserTab);
  const [currentUrl, setCurrentUrl] = useState(initialUrl);
  const isBookmarked = bookmarks.some(
    (item) => item.url === currentUrl && (item.workspaceId ?? null) === bookmarkScope,
  );
  const [pageTitle, setPageTitle] = useState("");
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [findText, setFindText] = useState("");
  const [findResult, setFindResult] = useState({ activeMatchOrdinal: 0, matches: 0 });
  const findInputRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const hostRef = useRef<HTMLDivElement>(null);
  const guestRef = useRef<EmbeddedWebviewElement | null>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const pickerGenerationRef = useRef(0);
  const initialUrlRef = useRef(initialUrl);
  const addressDirtyRef = useRef(false);
  const [address, setAddress] = useState(initialUrlRef.current);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [browserAvailable, setBrowserAvailable] = useState(false);
  const [responsivePreview, setResponsivePreview] = useState(false);
  const [pickingElement, setPickingElement] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [historyState, setHistoryState] = useState({ back: false, forward: false });

  const syncNavigationState = () => {
    const guest = guestRef.current;
    if (!guest) return;
    const current = guest.getURL();
    if (current) {
      if (!addressDirtyRef.current) setAddress(current);
      setCurrentUrl(current);
      const title = guest.getTitle();
      setPageTitle(title);
      updatePage(tabId, current, title);
    }
    setHistoryState({ back: guest.canGoBack(), forward: guest.canGoForward() });
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !window.desktop) {
      setStatus("Embedded browser is available in the desktop app");
      return;
    }

    const guest = document.createElement("webview") as EmbeddedWebviewElement;
    guest.className = "embedded-webview";
    guest.setAttribute("partition", "persist:starter-browser");
    // Main denies native popup windows and routes allowed URLs into app tabs.
    guest.setAttribute("allowpopups", "");
    guest.src = initialUrlRef.current;
    guestRef.current = guest;
    host.replaceChildren(guest);

    const start = () => {
      setLoading(true);
      setStatus("Loading…");
    };
    const stop = () => {
      setLoading(false);
      setStatus("Ready");
      syncNavigationState();
    };
    const navigate = (event: Event) => {
      if (!addressDirtyRef.current) setAddress((event as WebviewNavigationEvent).url);
      syncNavigationState();
    };
    const fail = (event: Event) => {
      const failure = event as WebviewFailureEvent;
      if (failure.errorCode === -3) return;
      setLoading(false);
      setStatus(failure.errorDescription || "Navigation failed");
    };

    const found = (event: Event) =>
      setFindResult(
        (event as Event & { result: { activeMatchOrdinal: number; matches: number } }).result,
      );
    const titleUpdated = () => syncNavigationState();
    const ready = () => {
      setBrowserAvailable(true);
      if (activeRef.current) guest.setZoomFactor(zoomRef.current);
    };
    guest.addEventListener("dom-ready", ready);
    guest.addEventListener("found-in-page", found);
    guest.addEventListener("page-title-updated", titleUpdated);
    guest.addEventListener("did-start-loading", start);
    guest.addEventListener("did-stop-loading", stop);
    guest.addEventListener("did-navigate", navigate);
    guest.addEventListener("did-navigate-in-page", navigate);
    guest.addEventListener("did-fail-load", fail);

    return () => {
      pickerGenerationRef.current += 1;
      guest.removeEventListener("dom-ready", ready);
      guest.removeEventListener("found-in-page", found);
      guest.removeEventListener("page-title-updated", titleUpdated);
      guest.removeEventListener("did-start-loading", start);
      guest.removeEventListener("did-stop-loading", stop);
      guest.removeEventListener("did-navigate", navigate);
      guest.removeEventListener("did-navigate-in-page", navigate);
      guest.removeEventListener("did-fail-load", fail);
      guestRef.current = null;
      guest.remove();
    };
  }, []);

  useEffect(() => {
    // Chromium shares zoom by origin; reapply the selected tab's saved preference.
    if (active && browserAvailable) guestRef.current?.setZoomFactor(zoomFactor);
  }, [active, browserAvailable, zoomFactor]);

  useEffect(() => {
    return window.desktop?.onBrowserOpenTabRequested?.((guestId, url) => {
      if (guestRef.current?.getWebContentsId() !== guestId) return;
      // Keep the new tab in its source tab's scope, including Common tabs.
      const state = useUiStore.getState();
      const source = state.browserTabs.find((tab) => tab.id === tabId);
      if (!source) return;
      if (state.openInBrowserTab(url, { newTab: true })) {
        const newTabId = useUiStore.getState().activeSidePaneTabId;
        useUiStore.getState().moveBrowserTab(newTabId, source.workspaceId ?? null);
      }
    });
  }, [tabId]);

  useEffect(() => {
    return window.desktop?.onBrowserFindRequested?.((guestId) => {
      if (activeRef.current && guestRef.current?.getWebContentsId() === guestId) {
        setFindOpen(true);
        requestAnimationFrame(() => findInputRef.current?.focus());
      }
    });
  }, []);

  useEffect(() => {
    if (!findOpen || !active) return;
    findInputRef.current?.focus();
  }, [findOpen, active]);

  useEffect(() => {
    if (!browserAvailable) return;
    if (!findOpen || !findText) {
      guestRef.current?.stopFindInPage("clearSelection");
      setFindResult({ activeMatchOrdinal: 0, matches: 0 });
      return;
    }
    const timer = setTimeout(() => guestRef.current?.findInPage(findText), 100);
    return () => clearTimeout(timer);
  }, [findText, findOpen, browserAvailable, currentUrl]);

  useEffect(() => {
    if (!moreMenuOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!moreMenuRef.current?.contains(event.target as Node)) setMoreMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !moreMenuRef.current?.querySelector('[aria-haspopup="menu"][aria-expanded="true"]')
      )
        setMoreMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [moreMenuOpen]);

  const navigateRequestUrl = navigateRequest?.url;
  const navigateRequestNonce = navigateRequest?.nonce;
  useEffect(() => {
    if (navigateRequestNonce === undefined || !navigateRequestUrl) return;
    const guest = guestRef.current;
    if (!guest) return;
    try {
      const url = normalizeBrowserUrl(navigateRequestUrl);
      setStatus("Loading…");
      void guest.loadURL(url).catch((error: unknown) => {
        setStatus(error instanceof Error ? error.message : String(error));
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
    onNavigateRequestHandled?.(navigateRequestNonce);
  }, [navigateRequestNonce, navigateRequestUrl, onNavigateRequestHandled]);

  const toggleElementPicker = () => {
    const guest = guestRef.current;
    if (!guest) return;

    if (pickingElement) {
      pickerGenerationRef.current += 1;
      setPickingElement(false);
      setStatus("Ready");
      void guest.executeJavaScript("window.__vintageElementPicker?.cancel?.()").catch(() => {});
      return;
    }

    const generation = pickerGenerationRef.current + 1;
    pickerGenerationRef.current = generation;
    setPickingElement(true);
    setStatus("Choose an element or press Esc to cancel");
    void guest
      .executeJavaScript(ELEMENT_PICKER_SCRIPT, true)
      .then(async (value) => {
        if (pickerGenerationRef.current !== generation) return;
        setPickingElement(false);
        const result = value as PageElementPickResult | null;
        if (result?.status !== "selected" || !result.selector) {
          setStatus("Ready");
          return;
        }
        if (!window.desktop) {
          setStatus(`Selected ${result.selector}`);
          return;
        }
        try {
          await window.desktop.writeClipboardText(result.selector);
          setStatus(`Copied selector ${result.selector}`);
        } catch (error) {
          setStatus(error instanceof Error ? error.message : String(error));
        }
      })
      .catch((error: unknown) => {
        if (pickerGenerationRef.current !== generation) return;
        setPickingElement(false);
        setStatus(error instanceof Error ? error.message : String(error));
      });
  };

  const openInDefaultBrowser = async () => {
    setMoreMenuOpen(false);
    const guest = guestRef.current;
    if (!guest || !window.desktop) return;
    try {
      const currentUrl = new URL(guest.getURL());
      if (currentUrl.protocol !== "http:" && currentUrl.protocol !== "https:") {
        throw new Error("Only HTTP and HTTPS pages can be opened externally.");
      }
      await window.desktop.openExternal(currentUrl.toString());
      setStatus("Opened in default browser");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const openDeveloperTools = () => {
    setMoreMenuOpen(false);
    guestRef.current?.openDevTools();
  };

  const navigate = (event: FormEvent) => {
    event.preventDefault();
    const guest = guestRef.current;
    if (!guest) return;
    try {
      const url = normalizeBrowserUrl(address);
      addressDirtyRef.current = false;
      setAddress(url);
      setStatus("Loading…");
      void guest.loadURL(url).catch((error: unknown) => {
        setStatus(error instanceof Error ? error.message : String(error));
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <section
      className="flex h-full min-h-0 flex-col bg-panel"
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
          event.preventDefault();
          event.stopPropagation();
          setFindOpen(true);
          findInputRef.current?.focus();
        }
      }}
    >
      <form className="flex h-12 shrink-0 items-center gap-2 px-3" onSubmit={navigate}>
        <Button
          aria-label="Browser back"
          className="size-7 px-0"
          disabled={!historyState.back}
          size="icon"
          type="button"
          variant="ghost"
          onClick={() => guestRef.current?.goBack()}
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
        </Button>
        <Button
          aria-label="Browser forward"
          className="size-7 px-0"
          disabled={!historyState.forward}
          size="icon"
          type="button"
          variant="ghost"
          onClick={() => guestRef.current?.goForward()}
        >
          <ChevronRight aria-hidden="true" className="size-4" />
        </Button>
        <Button
          aria-label={loading ? "Stop loading" : "Reload page"}
          className="size-7 px-0"
          size="icon"
          type="button"
          variant="ghost"
          onClick={() => (loading ? guestRef.current?.stop() : guestRef.current?.reload())}
        >
          {loading ? (
            <X aria-hidden="true" className="size-4" />
          ) : (
            <RefreshCw aria-hidden="true" className="size-4" />
          )}
        </Button>
        <input
          aria-label="Browser address"
          className="h-7 min-w-0 flex-1 rounded-lg border border-input-border bg-input px-2 text-ui-base text-foreground outline-none placeholder:text-foreground-subtlest hover:border-input-border-hover focus:border-input-border-focused focus:bg-input-focused"
          placeholder="Enter a URL and press Enter"
          spellCheck={false}
          value={address}
          onChange={(event) => {
            addressDirtyRef.current = true;
            setAddress(event.target.value);
          }}
        />
        <Button
          aria-label={isBookmarked ? "Remove bookmark" : "Bookmark page"}
          className="size-7 px-0"
          size="icon"
          type="button"
          variant="ghost"
          onClick={() => toggleBookmark(currentUrl, pageTitle || currentUrl, bookmarkScope)}
        >
          <Star className={`size-4 ${isBookmarked ? "fill-current" : ""}`} />
        </Button>
        <Button
          aria-label="Bookmarks"
          aria-expanded={bookmarksOpen}
          className="size-7 px-0"
          size="icon"
          title="Bookmarks"
          type="button"
          variant="ghost"
          onClick={() => {
            setBookmarksOpen((open) => !open);
            setMoreMenuOpen(false);
          }}
        >
          <Bookmark aria-hidden="true" className="size-4" />
        </Button>
        <Button
          aria-label="Open in default browser"
          className="size-7 px-0"
          disabled={!browserAvailable || !/^https?:/u.test(currentUrl)}
          size="icon"
          title="Open in default browser"
          type="button"
          variant="ghost"
          onClick={() => void openInDefaultBrowser()}
        >
          <ExternalLink aria-hidden="true" className="size-4" />
        </Button>
        <div ref={moreMenuRef} className="relative">
          <Button
            aria-expanded={moreMenuOpen}
            aria-haspopup="dialog"
            aria-label="More browser actions"
            className="size-7 px-0"
            size="icon"
            title="More browser actions"
            type="button"
            variant="ghost"
            onClick={() => setMoreMenuOpen((open) => !open)}
          >
            <Ellipsis aria-hidden="true" className="size-4" />
          </Button>
          {moreMenuOpen && (
            <div
              aria-label="Browser actions"
              className="absolute right-0 top-full z-30 mt-1 w-52 rounded-lg border border-border bg-popover p-1 shadow-lg"
              role="dialog"
            >
              <div className="flex items-center justify-between gap-1 border-b border-border px-2 py-1.5">
                <span className="text-ui-sm">Zoom</span>
                <Button
                  aria-label="Zoom out"
                  disabled={!browserAvailable || zoomFactor <= 0.5}
                  size="icon"
                  variant="ghost"
                  type="button"
                  onClick={() => setZoom(tabId, zoomFactor - 0.1)}
                >
                  <Minus aria-hidden="true" className="size-4" />
                </Button>
                <Button
                  aria-label="Reset zoom to 100%"
                  title="Reset zoom to 100%"
                  disabled={!browserAvailable}
                  size="compact"
                  variant="ghost"
                  type="button"
                  onClick={() => setZoom(tabId, 1)}
                >
                  {Math.round(zoomFactor * 100)}%
                </Button>
                <Button
                  aria-label="Zoom in"
                  disabled={!browserAvailable || zoomFactor >= 3}
                  size="icon"
                  variant="ghost"
                  type="button"
                  onClick={() => setZoom(tabId, zoomFactor + 0.1)}
                >
                  <Plus aria-hidden="true" className="size-4" />
                </Button>
              </div>
              <div className="px-2 py-1.5">
                <p className="mb-1 text-ui-xs text-foreground-subtlest">Tab belongs to</p>
                <BrowserScopePicker
                  title="Tab scope"
                  subtitle="Choose where this tab is available"
                  value={tabWorkspaceId ?? null}
                  workspaceId={workspaceId}
                  workspaceName={workspaceName}
                  active={active && moreMenuOpen}
                  onChange={(scope) => moveTab(tabId, scope)}
                />
              </div>
              <div className="px-2 py-1.5">
                <p className="mb-1 text-ui-xs text-foreground-subtlest">Save bookmarks in</p>
                <BrowserScopePicker
                  title="Bookmark scope"
                  subtitle="Choose where new bookmarks are saved"
                  value={bookmarkScope}
                  workspaceId={workspaceId}
                  workspaceName={workspaceName}
                  active={active && moreMenuOpen}
                  onChange={setBookmarkScope}
                />
              </div>
              <button
                type="button"
                disabled={!browserAvailable}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-ui-sm hover:bg-hover"
                onClick={() => {
                  setFindOpen(true);
                  setMoreMenuOpen(false);
                }}
              >
                <Search className="size-4" /> Find in page (Ctrl+F)
              </button>
              <button
                aria-label="Toggle responsive preview"
                aria-pressed={responsivePreview}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-ui-sm hover:bg-hover disabled:pointer-events-none disabled:opacity-50 ${responsivePreview ? "bg-selected text-foreground" : ""}`}
                disabled={!browserAvailable}
                type="button"
                onClick={() => {
                  setResponsivePreview((active) => !active);
                  setMoreMenuOpen(false);
                }}
              >
                <MonitorSmartphone aria-hidden="true" className="size-4 shrink-0" />
                <span>{responsivePreview ? "Exit responsive preview" : "Responsive preview"}</span>
              </button>
              <button
                aria-label={
                  pickingElement ? "Cancel element selection" : "Pick element and copy selector"
                }
                aria-pressed={pickingElement}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-ui-sm hover:bg-hover disabled:pointer-events-none disabled:opacity-50 ${pickingElement ? "bg-selected text-foreground" : ""}`}
                disabled={!browserAvailable || loading}
                type="button"
                onClick={() => {
                  setMoreMenuOpen(false);
                  toggleElementPicker();
                }}
              >
                <MousePointerClick aria-hidden="true" className="size-4 shrink-0" />
                <span>
                  {pickingElement ? "Cancel element selection" : "Pick element and copy selector"}
                </span>
              </button>
              <button
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-ui-sm text-foreground hover:bg-hover disabled:pointer-events-none disabled:opacity-50"
                disabled={!browserAvailable}
                onClick={openDeveloperTools}
                type="button"
              >
                <Bug aria-hidden="true" className="size-4 shrink-0" />
                <span>Developer tools</span>
              </button>
            </div>
          )}
        </div>
      </form>
      {bookmarksOpen && (
        <div
          className="max-h-60 shrink-0 overflow-auto border-t border-border p-2"
          aria-label="Bookmarks"
        >
          <div className="flex items-center justify-between text-ui-sm">
            <span>Bookmarks</span>
            <Button
              aria-label="Close bookmarks"
              size="icon"
              variant="ghost"
              onClick={() => setBookmarksOpen(false)}
            >
              <X className="size-4" />
            </Button>
          </div>
          {bookmarks.length === 0 && (
            <p className="p-2 text-ui-sm text-foreground-subtle">
              Use the star to bookmark this page.
            </p>
          )}
          {bookmarks.map((item) => (
            <div
              key={JSON.stringify([item.workspaceId ?? null, item.url])}
              className="flex items-center gap-1 py-1"
            >
              <div className="min-w-0 flex-1">
                <span className="text-ui-xs text-foreground-subtle">
                  {item.workspaceId ? (workspaceName ?? "This project") : "Common"}
                </span>
                <input
                  aria-label={`Bookmark name for ${item.url}${bookmarks.filter((bookmark) => bookmark.url === item.url).length > 1 ? ` (${item.workspaceId ? (workspaceName ?? "This project") : "Common"})` : ""}`}
                  className="w-full bg-transparent text-ui-sm"
                  value={item.title}
                  onChange={(event) =>
                    renameBookmark(item.url, event.target.value, item.workspaceId ?? null)
                  }
                />
                <div className="truncate text-ui-xs text-foreground-subtle" title={item.url}>
                  {item.url}
                </div>
              </div>
              <Button size="compact" variant="ghost" onClick={() => openBookmark(item.url)}>
                Open
              </Button>
              <Button
                size="compact"
                variant="ghost"
                onClick={() => openBookmark(item.url, { newTab: true })}
              >
                New tab
              </Button>
              <Button
                aria-label={`Delete bookmark ${item.title}`}
                size="icon"
                variant="ghost"
                onClick={() => toggleBookmark(item.url, item.title, item.workspaceId ?? null)}
              >
                <X className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
      {findOpen && (
        <form
          className="flex shrink-0 items-center gap-1 border-t border-border p-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (findText) guestRef.current?.findInPage(findText, { findNext: true });
          }}
        >
          <input
            ref={findInputRef}
            aria-label="Find in page"
            placeholder="Find in page"
            className="min-w-0 flex-1 rounded border border-input-border bg-input px-2 py-1 text-ui-sm"
            value={findText}
            onChange={(event) => setFindText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setFindOpen(false);
                guestRef.current?.focus();
              }
              if (event.key === "Enter" && event.shiftKey) {
                event.preventDefault();
                if (findText)
                  guestRef.current?.findInPage(findText, { forward: false, findNext: true });
              }
            }}
          />
          <span aria-live="polite" className="text-ui-xs">
            {findResult.activeMatchOrdinal}/{findResult.matches}
          </span>
          <Button
            aria-label="Previous match"
            disabled={!findText}
            type="button"
            size="icon"
            variant="ghost"
            onClick={() =>
              guestRef.current?.findInPage(findText, { forward: false, findNext: true })
            }
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            aria-label="Next match"
            disabled={!findText}
            type="submit"
            size="icon"
            variant="ghost"
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button
            aria-label="Close page search"
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => {
              setFindOpen(false);
              guestRef.current?.focus();
            }}
          >
            <X className="size-4" />
          </Button>
        </form>
      )}
      <div
        className={`min-h-0 flex-1 ${
          responsivePreview ? "overflow-auto bg-panel p-3" : "overflow-hidden bg-white"
        }`}
      >
        <div
          ref={hostRef}
          className={`h-full ${
            responsivePreview
              ? "mx-auto w-full max-w-[390px] border border-border bg-white shadow-lg"
              : "w-full bg-white"
          }`}
        />
      </div>
      <div className="h-6 shrink-0 truncate border-t border-border px-2 text-ui-xs leading-6 text-foreground-subtlest">
        {status}
      </div>
    </section>
  );
}
