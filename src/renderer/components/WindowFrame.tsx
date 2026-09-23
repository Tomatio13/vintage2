import {
  createLucideIcon,
  Minus,
  PanelRight,
  SplitSquareHorizontal,
  SplitSquareVertical,
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

const WindowMaximizeIcon = createLucideIcon("WindowMaximize", [
  [
    "path",
    {
      d: "M17.4444 5H6.55556C5.69645 5 5 5.69645 5 6.55556V17.4444C5 18.3036 5.69645 19 6.55556 19H17.4444C18.3036 19 19 18.3036 19 17.4444V6.55556C19 5.69645 18.3036 5 17.4444 5Z",
      key: "frame",
    },
  ],
]);

const WindowRestoreIcon = createLucideIcon("WindowRestore", [
  ["path", { d: "M9 5H13C16.3137 5 19 7.68629 19 11V15", key: "back" }],
  ["rect", { x: "5", y: "9", width: "10", height: "10", rx: "2", key: "front" }],
]);

const windowChromeButtonClass = "size-7 rounded-lg px-0";

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
  const windowIsMaximized = windowState.isMaximized || windowState.isFullScreen;
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
      <section className="vintage-content-card flex min-w-0 flex-1 flex-col overflow-hidden border border-border border-l-0 bg-background">
        <header className="window-drag flex h-9 shrink-0 items-stretch border-b border-border bg-header platform-mac:pl-20">
          <button
            aria-label="Toggle sidebar"
            className="window-no-drag flex w-9 shrink-0 items-center justify-center text-brand hover:bg-hover"
            onClick={toggleSidebar}
          >
            <img alt="" aria-hidden="true" className="size-5" src="./favicon.svg" />
          </button>
          <div className="flex min-w-0 flex-1 items-stretch">{topContent}</div>
          <div aria-label="Drag window" className="min-w-12 flex-1" />
          <div className="window-no-drag flex items-center gap-0.5 px-1">
            {onSplitRight && (
              <Button
                aria-label="Split terminal vertically"
                className={windowChromeButtonClass}
                size="icon"
                variant="ghost"
                onClick={onSplitRight}
              >
                <SplitSquareHorizontal aria-hidden="true" className="size-4" />
              </Button>
            )}
            {onSplitDown && (
              <Button
                aria-label="Split terminal horizontally"
                className={windowChromeButtonClass}
                size="icon"
                variant="ghost"
                onClick={onSplitDown}
              >
                <SplitSquareVertical aria-hidden="true" className="size-4" />
              </Button>
            )}
            <Button
              aria-label="Toggle browser pane"
              className={windowChromeButtonClass}
              size="icon"
              variant="ghost"
              onClick={toggleSidePane}
            >
              <PanelRight aria-hidden="true" className="size-4" />
            </Button>
            {platform !== "darwin" && (
              <>
                <Button
                  aria-label="Minimize window"
                  className={windowChromeButtonClass}
                  size="icon"
                  variant="ghost"
                  onClick={() => void window.desktop?.minimize()}
                >
                  <Minus aria-hidden="true" className="size-4" />
                </Button>
                <Button
                  aria-label={windowIsMaximized ? "Restore window" : "Maximize window"}
                  className={windowChromeButtonClass}
                  size="icon"
                  variant="ghost"
                  onClick={() => void window.desktop?.toggleMaximize()}
                >
                  {windowIsMaximized ? (
                    <WindowRestoreIcon aria-hidden="true" className="size-4" />
                  ) : (
                    <WindowMaximizeIcon aria-hidden="true" className="size-4" />
                  )}
                </Button>
                <Button
                  aria-label="Close window"
                  className={`${windowChromeButtonClass} hover:bg-destructive hover:text-white`}
                  size="icon"
                  variant="ghost"
                  onClick={() => void window.desktop?.close()}
                >
                  <X aria-hidden="true" className="size-4" />
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
