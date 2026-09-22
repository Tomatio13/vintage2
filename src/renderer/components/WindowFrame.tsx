import {
  Minus,
  PanelRight,
  SplitSquareHorizontal,
  SplitSquareVertical,
  Square,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import type { DesktopWindowState } from "../../shared/desktop.js";
import { useUiStore } from "../store/uiStore.js";
import { Button } from "./Button.js";

const DEFAULT_WINDOW_STATE: DesktopWindowState = {
  isMaximized: false,
  isFullScreen: false,
  macOSMajorVersion: null,
  supportsNativeRoundedCorners: null,
};

export function WindowFrame({
  children,
  sidebar,
  topContent,
  onSplitRight,
  onSplitDown,
}: {
  children: ReactNode;
  sidebar?: ReactNode;
  topContent?: ReactNode;
  onSplitRight?: (() => void) | undefined;
  onSplitDown?: (() => void) | undefined;
}) {
  const [windowState, setWindowState] = useState(DEFAULT_WINDOW_STATE);
  const { toggleSidebar, toggleSidePane } = useUiStore();
  const platform = window.desktop?.platform ?? "linux";
  useEffect(() => {
    let receivedEvent = false;
    const unsubscribe = window.desktop?.onWindowStateChanged((state) => {
      receivedEvent = true;
      setWindowState(state);
    });
    void window.desktop?.getWindowState().then((state) => {
      if (!receivedEvent) setWindowState(state);
    });
    return unsubscribe;
  }, []);
  useEffect(() => {
    const maximized = windowState.isMaximized || windowState.isFullScreen;
    document.documentElement.classList.toggle("window-maximized", maximized);
    document.documentElement.classList.toggle(
      "macos-tahoe",
      windowState.macOSMajorVersion != null && windowState.macOSMajorVersion >= 26,
    );
    return () => {
      document.documentElement.classList.remove("window-maximized", "macos-tahoe");
    };
  }, [windowState]);
  return (
    <div
      className="vintage-window-shell flex h-dvh overflow-hidden bg-sidebar text-foreground"
      data-native-rounded={windowState.supportsNativeRoundedCorners ?? "unknown"}
      data-platform={platform}
    >
      {sidebar && <aside className="h-full w-[270px] shrink-0 overflow-hidden">{sidebar}</aside>}
      <section className="vintage-content-card flex min-w-0 flex-1 flex-col overflow-hidden border border-border bg-background">
        <header className="window-drag flex h-9 shrink-0 items-stretch border-b border-border bg-header platform-mac:pl-20">
          <button
            aria-label="Toggle sidebar"
            className="window-no-drag flex w-9 shrink-0 items-center justify-center border-r border-border text-brand hover:bg-hover"
            onClick={toggleSidebar}
          >
            <img alt="" aria-hidden="true" className="size-4" src="./favicon.svg" />
          </button>
          <div className="flex min-w-0 flex-1 items-stretch">{topContent}</div>
          <div aria-label="Drag window" className="min-w-12 flex-1" />
          <div className="window-no-drag flex items-center gap-0.5 px-1">
            {onSplitRight && (
              <Button
                aria-label="Split terminal vertically"
                size="icon"
                variant="ghost"
                onClick={onSplitRight}
              >
                <SplitSquareHorizontal />
              </Button>
            )}
            {onSplitDown && (
              <Button
                aria-label="Split terminal horizontally"
                size="icon"
                variant="ghost"
                onClick={onSplitDown}
              >
                <SplitSquareVertical />
              </Button>
            )}
            <Button
              aria-label="Toggle browser pane"
              size="icon"
              variant="ghost"
              onClick={toggleSidePane}
            >
              <PanelRight />
            </Button>
            {platform !== "darwin" && (
              <>
                <Button
                  aria-label="Minimize window"
                  size="icon"
                  variant="ghost"
                  onClick={() => void window.desktop?.minimize()}
                >
                  <Minus />
                </Button>
                <Button
                  aria-label={windowState.isMaximized ? "Restore window" : "Maximize window"}
                  size="icon"
                  variant="ghost"
                  onClick={() => void window.desktop?.toggleMaximize()}
                >
                  <Square className="size-3.5" />
                </Button>
                <Button
                  className="hover:bg-destructive hover:text-white"
                  aria-label="Close window"
                  size="icon"
                  variant="ghost"
                  onClick={() => void window.desktop?.close()}
                >
                  <X />
                </Button>
              </>
            )}
          </div>
        </header>
        <main className="min-h-0 flex-1">{children}</main>
      </section>
    </div>
  );
}
