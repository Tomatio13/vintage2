import type { BrowserCommand } from "../../shared/browserShortcuts.js";
import { useUiStore } from "../store/uiStore.js";

export function runBrowserTabCommand(command: BrowserCommand): boolean {
  const state = useUiStore.getState();
  if (command === "restore") {
    state.restoreBrowserTab();
    return true;
  }
  if (command === "close") {
    state.closeBrowserTab(state.activeSidePaneTabId);
    return true;
  }
  if (command === "next" || command === "previous") {
    const tabs = state.browserTabs.filter(
      (tab) => !tab.workspaceId || tab.workspaceId === state.browserWorkspaceId,
    );
    const index = tabs.findIndex((tab) => tab.id === state.activeSidePaneTabId);
    if (index >= 0)
      state.activateBrowserTab(
        tabs[(index + (command === "next" ? 1 : tabs.length - 1)) % tabs.length]!.id,
      );
    return true;
  }
  return false;
}
