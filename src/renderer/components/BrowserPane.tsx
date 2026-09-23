import {
  Bug,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  ExternalLink,
  MonitorSmartphone,
  MousePointerClick,
  RefreshCw,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import { normalizeBrowserUrl } from "../lib/browserUrl.js";
import { Button } from "./Button.js";

interface EmbeddedWebviewElement extends HTMLElement {
  src: string;
  loadURL(url: string): Promise<void>;
  getURL(): string;
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

export function BrowserPane({ initialUrl }: { initialUrl: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const guestRef = useRef<EmbeddedWebviewElement | null>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const pickerGenerationRef = useRef(0);
  const initialUrlRef = useRef(initialUrl);
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
    if (current) setAddress(current);
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
      setAddress((event as WebviewNavigationEvent).url);
      syncNavigationState();
    };
    const fail = (event: Event) => {
      const failure = event as WebviewFailureEvent;
      if (failure.errorCode === -3) return;
      setLoading(false);
      setStatus(failure.errorDescription || "Navigation failed");
    };

    guest.addEventListener("did-start-loading", start);
    guest.addEventListener("did-stop-loading", stop);
    guest.addEventListener("did-navigate", navigate);
    guest.addEventListener("did-navigate-in-page", navigate);
    guest.addEventListener("did-fail-load", fail);
    setBrowserAvailable(true);

    return () => {
      pickerGenerationRef.current += 1;
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
    if (!moreMenuOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!moreMenuRef.current?.contains(event.target as Node)) setMoreMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [moreMenuOpen]);

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
    <section className="flex h-full min-h-0 flex-col bg-panel">
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
          onChange={(event) => setAddress(event.target.value)}
        />
        <Button
          aria-label="Toggle responsive preview"
          aria-pressed={responsivePreview}
          className={`size-7 px-0 ${responsivePreview ? "bg-selected text-foreground" : ""}`}
          disabled={!browserAvailable}
          size="icon"
          title={responsivePreview ? "Exit responsive preview" : "Responsive preview"}
          type="button"
          variant="ghost"
          onClick={() => setResponsivePreview((active) => !active)}
        >
          <MonitorSmartphone aria-hidden="true" className="size-4" />
        </Button>
        <Button
          aria-label={
            pickingElement ? "Cancel element selection" : "Pick element and copy selector"
          }
          aria-pressed={pickingElement}
          className={`size-7 px-0 ${pickingElement ? "bg-selected text-foreground" : ""}`}
          disabled={!browserAvailable || loading}
          size="icon"
          title={pickingElement ? "Cancel element selection" : "Pick element and copy selector"}
          type="button"
          variant="ghost"
          onClick={toggleElementPicker}
        >
          <MousePointerClick aria-hidden="true" className="size-4" />
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
              <button
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-ui-sm text-foreground hover:bg-hover disabled:pointer-events-none disabled:opacity-50"
                disabled={!browserAvailable}
                onClick={() => void openInDefaultBrowser()}
                type="button"
              >
                <ExternalLink aria-hidden="true" className="size-4 shrink-0" />
                <span>Open in default browser</span>
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
