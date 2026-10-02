import { create } from "zustand";
import { persist } from "zustand/middleware";

import { normalizeBrowserUrl } from "../lib/browserUrl.js";
import { TERMINAL_SHELLS, type TerminalShell } from "../../shared/desktop.js";

export const DEFAULT_BROWSER_START_URL = "https://example.com/";

export interface BrowserTabState {
  id: string;
  title: string;
  initialUrl: string | null;
  mounted: boolean;
}

export interface BrowserNavigateRequest {
  tabId: string;
  url: string;
  nonce: number;
}

export const initialBrowserTabs: BrowserTabState[] = [
  { id: "browser-1", title: "Browser", initialUrl: null, mounted: false },
];

export type Theme = "system" | "light" | "dark" | "graphite";
export type SettingsSection =
  | "appearance"
  | "terminal"
  | "browser"
  | "attention"
  | "shortcuts"
  | "integrations"
  | "notes"
  | "usage"
  | "updates";
export const shortcutActions = [
  "previous-tab",
  "next-tab",
  "previous-pane",
  "next-pane",
  "previous-workspace",
  "next-workspace",
  "open-command-palette",
  "find-in-terminal",
  "new-terminal",
  "split-right",
  "split-down",
  "toggle-sidebar",
  "toggle-side-pane",
  "open-notes",
  "open-files",
  "open-review",
  "open-usage",
  "open-browser",
  "close-pane",
] as const;
export type ShortcutAction = (typeof shortcutActions)[number];
export interface ShortcutBinding {
  action: ShortcutAction;
  key: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
}
export const defaultShortcuts: ShortcutBinding[] = [
  { action: "previous-tab", key: "left", ctrl: true, alt: false, shift: true },
  { action: "next-tab", key: "right", ctrl: true, alt: false, shift: true },
  { action: "previous-pane", key: "up", ctrl: true, alt: false, shift: true },
  { action: "next-pane", key: "down", ctrl: true, alt: false, shift: true },
  { action: "previous-workspace", key: "left", ctrl: false, alt: true, shift: false },
  { action: "next-workspace", key: "right", ctrl: false, alt: true, shift: false },
  { action: "open-command-palette", key: "p", ctrl: true, alt: false, shift: true },
  { action: "find-in-terminal", key: "f", ctrl: true, alt: false, shift: false },
  { action: "new-terminal", key: "n", ctrl: true, alt: false, shift: true },
  { action: "split-right", key: "d", ctrl: true, alt: false, shift: true },
  { action: "split-down", key: "t", ctrl: true, alt: false, shift: true },
  { action: "toggle-sidebar", key: "b", ctrl: true, alt: false, shift: false },
  { action: "toggle-side-pane", key: "s", ctrl: true, alt: false, shift: true },
  { action: "open-notes", key: "m", ctrl: true, alt: false, shift: true },
  { action: "open-files", key: "e", ctrl: true, alt: false, shift: true },
  { action: "open-review", key: "g", ctrl: true, alt: false, shift: true },
  { action: "open-usage", key: "u", ctrl: true, alt: false, shift: true },
  { action: "open-browser", key: "b", ctrl: true, alt: false, shift: true },
  { action: "close-pane", key: "w", ctrl: true, alt: false, shift: true },
];

export interface VintageSettings {
  theme: Theme;
  uiFontSize: number;
  terminalFontSize: number;
  terminalFontFamily: string;
  scrollback: number;
  shell: TerminalShell;
  browserDefaultUrl: string;
  desktopNotifications: boolean;
  notesPanelEnabled: boolean;
  usagePanelEnabled: boolean;
  codexbarPath: string;
  usageRefreshSeconds: number;
  shortcuts: ShortcutBinding[];
}

interface UiState extends VintageSettings {
  sidebarOpen: boolean;
  sidePaneOpen: boolean;
  activityOpen: boolean;
  settingsOpen: boolean;
  sidebarWidth: number;
  sidePaneWidth: number;
  activityHeight: number;
  activeSidePaneTabId: string;
  browserTabs: BrowserTabState[];
  browserTabCounter: number;
  browserNavigateRequest: BrowserNavigateRequest | null;
  setTheme(theme: Theme): void;
  setUiFontSize(size: number): void;
  saveSettings(settings: VintageSettings): void;
  setUsagePanelEnabled(enabled: boolean): void;
  toggleSidebar(): void;
  toggleSidePane(): void;
  toggleActivity(): void;
  setSettingsOpen(open: boolean): void;
  setSidebarWidth(width: number): void;
  setSidePaneWidth(width: number): void;
  setActivityHeight(height: number): void;
  activateSidePaneTab(tabId: string): void;
  /** Opens the side pane on the given tab; the Usage tab requires the panel to be enabled. */
  showSidePaneTab(tabId: string): void;
  /** Focuses the embedded browser (first or active tab) or opens a new tab; never navigates. */
  openBrowserPane(): void;
  activateBrowserTab(tabId: string): void;
  addBrowserTab(): void;
  closeBrowserTab(tabId: string): void;
  /** Normalizes the URL and shows it in the built-in browser; returns false for unsupported URLs. */
  openInBrowserTab(url: string, options?: { newTab?: boolean }): boolean;
  consumeBrowserNavigateRequest(nonce: number): void;
}

const BROWSER_TAB_PREFIX = "browser-";

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      theme: "system",
      uiFontSize: 14,
      terminalFontSize: 13,
      terminalFontFamily: '"Cica", "HackGen", "JetBrains Mono", monospace',
      scrollback: 5000,
      shell: "system",
      browserDefaultUrl: DEFAULT_BROWSER_START_URL,
      desktopNotifications: true,
      notesPanelEnabled: true,
      usagePanelEnabled: false,
      codexbarPath: "",
      usageRefreshSeconds: 120,
      shortcuts: defaultShortcuts,
      sidebarOpen: true,
      sidePaneOpen: true,
      activityOpen: true,
      settingsOpen: false,
      sidebarWidth: 264,
      sidePaneWidth: 400,
      activityHeight: 180,
      activeSidePaneTabId: "files",
      browserTabs: initialBrowserTabs,
      browserTabCounter: 2,
      browserNavigateRequest: null,
      setTheme: (theme) => set({ theme }),
      setUiFontSize: (uiFontSize) => set({ uiFontSize: Math.min(18, Math.max(12, uiFontSize)) }),
      saveSettings: (settings) => set(settings),
      setUsagePanelEnabled: (usagePanelEnabled) => set({ usagePanelEnabled }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      toggleSidePane: () => set((state) => ({ sidePaneOpen: !state.sidePaneOpen })),
      toggleActivity: () => set((state) => ({ activityOpen: !state.activityOpen })),
      setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
      setSidebarWidth: (sidebarWidth) => set({ sidebarWidth }),
      setSidePaneWidth: (sidePaneWidth) => set({ sidePaneWidth }),
      setActivityHeight: (activityHeight) => set({ activityHeight }),
      activateSidePaneTab: (activeSidePaneTabId) => set({ activeSidePaneTabId }),
      showSidePaneTab: (tabId) =>
        set((state) => {
          if (tabId === "notes" && !state.notesPanelEnabled) return state;
          if (tabId === "usage" && !state.usagePanelEnabled) return state;
          return { activeSidePaneTabId: tabId, sidePaneOpen: true };
        }),
      openBrowserPane: () =>
        set((state) => {
          if (state.browserTabs.length === 0) {
            const number = state.browserTabCounter;
            const newTab: BrowserTabState = {
              id: `${BROWSER_TAB_PREFIX}${number}`,
              title: `Browser ${number}`,
              initialUrl: state.browserDefaultUrl,
              mounted: true,
            };
            return {
              browserTabs: [...state.browserTabs, newTab],
              browserTabCounter: number + 1,
              activeSidePaneTabId: newTab.id,
              sidePaneOpen: true,
            };
          }
          const activeTab = state.browserTabs.find(
            (browserTab) => browserTab.id === state.activeSidePaneTabId,
          );
          const targetId = activeTab?.id ?? state.browserTabs[0]!.id;
          return {
            sidePaneOpen: true,
            activeSidePaneTabId: targetId,
            browserTabs: state.browserTabs.map((browserTab) =>
              browserTab.id === targetId
                ? {
                    ...browserTab,
                    initialUrl: browserTab.initialUrl ?? state.browserDefaultUrl,
                    mounted: true,
                  }
                : browserTab,
            ),
          };
        }),
      activateBrowserTab: (tabId) =>
        set((state) => ({
          activeSidePaneTabId: tabId,
          browserTabs: state.browserTabs.map((browserTab) =>
            browserTab.id === tabId
              ? {
                  ...browserTab,
                  initialUrl: browserTab.initialUrl ?? state.browserDefaultUrl,
                  mounted: true,
                }
              : browserTab,
          ),
        })),
      addBrowserTab: () =>
        set((state) => {
          const number = state.browserTabCounter;
          const newTab: BrowserTabState = {
            id: `${BROWSER_TAB_PREFIX}${number}`,
            title: `Browser ${number}`,
            initialUrl: state.browserDefaultUrl,
            mounted: true,
          };
          return {
            browserTabs: [...state.browserTabs, newTab],
            browserTabCounter: number + 1,
            activeSidePaneTabId: newTab.id,
          };
        }),
      closeBrowserTab: (tabId) =>
        set((state) => {
          const tabIndex = state.browserTabs.findIndex((browserTab) => browserTab.id === tabId);
          if (tabIndex < 0) return state;
          const remainingTabs = state.browserTabs.filter((browserTab) => browserTab.id !== tabId);
          const activeSidePaneTabId =
            state.activeSidePaneTabId === tabId
              ? (remainingTabs[Math.max(0, tabIndex - 1)]?.id ?? "files")
              : state.activeSidePaneTabId;
          return {
            browserTabs: remainingTabs,
            activeSidePaneTabId,
            browserNavigateRequest:
              state.browserNavigateRequest?.tabId === tabId ? null : state.browserNavigateRequest,
          };
        }),
      openInBrowserTab: (url, options) => {
        let normalizedUrl: string;
        try {
          normalizedUrl = normalizeBrowserUrl(url);
        } catch {
          return false;
        }
        set((state) => {
          if (options?.newTab === true) {
            const number = state.browserTabCounter;
            const newTab: BrowserTabState = {
              id: `${BROWSER_TAB_PREFIX}${number}`,
              title: `Browser ${number}`,
              initialUrl: normalizedUrl,
              mounted: true,
            };
            return {
              browserTabs: [...state.browserTabs, newTab],
              browserTabCounter: number + 1,
              activeSidePaneTabId: newTab.id,
              sidePaneOpen: true,
              browserNavigateRequest: null,
            };
          }
          const activeIsBrowser = state.browserTabs.some(
            (browserTab) => browserTab.id === state.activeSidePaneTabId,
          );
          const target =
            (activeIsBrowser
              ? state.browserTabs.find((browserTab) => browserTab.id === state.activeSidePaneTabId)
              : undefined) ?? state.browserTabs[0];
          if (!target) {
            const number = state.browserTabCounter;
            const newTab: BrowserTabState = {
              id: `${BROWSER_TAB_PREFIX}${number}`,
              title: `Browser ${number}`,
              initialUrl: normalizedUrl,
              mounted: true,
            };
            return {
              browserTabs: [newTab],
              browserTabCounter: number + 1,
              activeSidePaneTabId: newTab.id,
              sidePaneOpen: true,
              browserNavigateRequest: null,
            };
          }
          if (target.mounted) {
            const nonce = (state.browserNavigateRequest?.nonce ?? 0) + 1;
            return {
              activeSidePaneTabId: target.id,
              sidePaneOpen: true,
              browserNavigateRequest: { tabId: target.id, url: normalizedUrl, nonce },
            };
          }
          return {
            browserTabs: state.browserTabs.map((browserTab) =>
              browserTab.id === target.id
                ? { ...browserTab, initialUrl: normalizedUrl, mounted: true }
                : browserTab,
            ),
            activeSidePaneTabId: target.id,
            sidePaneOpen: true,
          };
        });
        return true;
      },
      consumeBrowserNavigateRequest: (nonce) =>
        set((state) =>
          state.browserNavigateRequest?.nonce === nonce ? { browserNavigateRequest: null } : state,
        ),
    }),
    {
      name: "ai-workspace-starter-ui",
      partialize: ({
        theme,
        uiFontSize,
        terminalFontSize,
        terminalFontFamily,
        scrollback,
        shell,
        browserDefaultUrl,
        desktopNotifications,
        notesPanelEnabled,
        usagePanelEnabled,
        codexbarPath,
        usageRefreshSeconds,
        shortcuts,
        sidebarOpen,
        sidePaneOpen,
        activityOpen,
        sidebarWidth,
        sidePaneWidth,
        activityHeight,
      }) => ({
        theme,
        uiFontSize,
        terminalFontSize,
        terminalFontFamily,
        scrollback,
        shell,
        browserDefaultUrl,
        desktopNotifications,
        notesPanelEnabled,
        usagePanelEnabled,
        codexbarPath,
        usageRefreshSeconds,
        shortcuts,
        sidebarOpen,
        sidePaneOpen,
        activityOpen,
        sidebarWidth,
        sidePaneWidth,
        activityHeight,
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<UiState>;
        return {
          ...currentState,
          ...persisted,
          shell: TERMINAL_SHELLS.includes(persisted.shell as TerminalShell)
            ? (persisted.shell as TerminalShell)
            : currentState.shell,
          shortcuts: mergeShortcutBindings(persisted.shortcuts),
        };
      },
    },
  ),
);

function mergeShortcutBindings(persisted: unknown): ShortcutBinding[] {
  const actionSet = new Set<string>(shortcutActions);
  const savedByAction = new Map<ShortcutAction, ShortcutBinding>();
  if (Array.isArray(persisted)) {
    for (const value of persisted) {
      if (
        !value ||
        typeof value !== "object" ||
        !actionSet.has((value as { action?: string }).action ?? "")
      ) {
        continue;
      }

      const binding = value as Partial<ShortcutBinding>;
      if (
        typeof binding.key === "string" &&
        typeof binding.ctrl === "boolean" &&
        typeof binding.alt === "boolean" &&
        typeof binding.shift === "boolean"
      ) {
        savedByAction.set(binding.action as ShortcutAction, {
          action: binding.action as ShortcutAction,
          key: binding.key,
          ctrl: binding.ctrl,
          alt: binding.alt,
          shift: binding.shift,
        });
      }
    }
  }

  return defaultShortcuts.map((binding) => ({
    ...(savedByAction.get(binding.action) ?? binding),
  }));
}
