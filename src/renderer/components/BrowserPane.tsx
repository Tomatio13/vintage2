import { ArrowLeft, ArrowRight, RefreshCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import { normalizeBrowserUrl } from "../lib/browserUrl.js";
import { Button } from "./Button.js";

const INITIAL_URL = "https://example.com/";

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
}

interface WebviewNavigationEvent extends Event {
  url: string;
}

interface WebviewFailureEvent extends WebviewNavigationEvent {
  errorCode: number;
  errorDescription: string;
}

export function BrowserPane() {
  const hostRef = useRef<HTMLDivElement>(null);
  const guestRef = useRef<EmbeddedWebviewElement | null>(null);
  const [address, setAddress] = useState(INITIAL_URL);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Ready");
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
    guest.src = INITIAL_URL;
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

    return () => {
      guest.removeEventListener("did-start-loading", start);
      guest.removeEventListener("did-stop-loading", stop);
      guest.removeEventListener("did-navigate", navigate);
      guest.removeEventListener("did-navigate-in-page", navigate);
      guest.removeEventListener("did-fail-load", fail);
      guestRef.current = null;
      guest.remove();
    };
  }, []);

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
      <form
        className="flex shrink-0 items-center gap-1 border-b border-border p-2"
        onSubmit={navigate}
      >
        <Button
          aria-label="Browser back"
          disabled={!historyState.back}
          size="icon"
          type="button"
          variant="ghost"
          onClick={() => guestRef.current?.goBack()}
        >
          <ArrowLeft />
        </Button>
        <Button
          aria-label="Browser forward"
          disabled={!historyState.forward}
          size="icon"
          type="button"
          variant="ghost"
          onClick={() => guestRef.current?.goForward()}
        >
          <ArrowRight />
        </Button>
        <Button
          aria-label={loading ? "Stop loading" : "Reload page"}
          size="icon"
          type="button"
          variant="ghost"
          onClick={() => (loading ? guestRef.current?.stop() : guestRef.current?.reload())}
        >
          {loading ? <X /> : <RefreshCw />}
        </Button>
        <input
          aria-label="Browser address"
          className="h-8 min-w-0 flex-1 rounded-lg border border-input-border bg-input px-2 text-ui-sm text-foreground outline-none focus:border-input-border-focused"
          spellCheck={false}
          value={address}
          onChange={(event) => setAddress(event.target.value)}
        />
      </form>
      <div ref={hostRef} className="min-h-0 flex-1 bg-white" />
      <div className="h-6 shrink-0 truncate border-t border-border px-2 text-ui-xs leading-6 text-foreground-subtlest">
        {status}
      </div>
    </section>
  );
}
