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
  zoomFactor?: number;
  workspaceId?: string;
}

export interface BrowserBookmark {
  workspaceId?: string;
  url: string;
  title: string;
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
  | "board"
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
  "open-board",
  "toggle-notes",
  "toggle-board",
  "toggle-browser",
  "toggle-usage",
  "toggle-review",
  "toggle-files",
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
  { action: "open-board", key: "k", ctrl: true, alt: false, shift: true },
  { action: "toggle-notes", key: "m", ctrl: true, alt: true, shift: false },
  { action: "toggle-board", key: "k", ctrl: true, alt: true, shift: false },
  { action: "toggle-browser", key: "b", ctrl: true, alt: true, shift: false },
  { action: "toggle-usage", key: "u", ctrl: true, alt: true, shift: false },
  { action: "toggle-review", key: "g", ctrl: true, alt: true, shift: false },
  { action: "toggle-files", key: "e", ctrl: true, alt: true, shift: false },
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
  filesPanelEnabled: boolean;
  reviewPanelEnabled: boolean;
  browserPanelEnabled: boolean;
  notesPanelEnabled: boolean;
  boardPanelEnabled: boolean;
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
  browserBookmarks: BrowserBookmark[];
  browserWorkspaceId: string | null;
  browserSelections: Record<string, string>;
  expandedFileFolders: Record<string, string[]>;
  setFileFolderExpanded(workspaceId: string, path: string, expanded: boolean): void;
  setBrowserWorkspace(workspaceId: string): void;
  moveBrowserTab(tabId: string, workspaceId: string | null): void;
  setBrowserZoom(tabId: string, factor: number): void;
  updateBrowserPage(tabId: string, url: string, title?: string): void;
  toggleBrowserBookmark(url: string, title: string, workspaceId?: string | null): void;
  renameBrowserBookmark(url: string, title: string, workspaceId?: string | null): void;
  browserTabCounter: number;
  browserNavigateRequest: BrowserNavigateRequest | null;
  setTheme(theme: Theme): void;
  setUiFontSize(size: number): void;
  saveSettings(settings: VintageSettings): void;
  setUsagePanelEnabled(enabled: boolean): void;
  toggleSidebar(): void;
  toggleSidePane(): void;
  togglePanel(panel: PanelName): void;
  setPanelEnabled(panel: PanelName, enabled: boolean): void;
  toggleNotesPanel(): void;
  toggleBoardPanel(): void;
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

export const panelSettingKeys = {
  files: "filesPanelEnabled",
  review: "reviewPanelEnabled",
  notes: "notesPanelEnabled",
  board: "boardPanelEnabled",
  usage: "usagePanelEnabled",
  browser: "browserPanelEnabled",
} as const;
export type PanelName = keyof typeof panelSettingKeys;

export function isSidePaneTabEnabled(state: VintageSettings, tabId: string): boolean {
  if (tabId.startsWith("browser-")) return state.browserPanelEnabled;
  const key = panelSettingKeys[tabId as PanelName];
  return key !== undefined && state[key];
}

export function firstEnabledSidePaneTab(state: UiState): string {
  for (const name of ["files", "review", "notes", "board", "usage"] as const) {
    if (state[panelSettingKeys[name]]) return name;
  }
  return state.browserPanelEnabled ? (visibleBrowserTabs(state)[0]?.id ?? "") : "";
}

function reconcilePanelSelection(state: UiState): Partial<UiState> {
  if (isSidePaneTabEnabled(state, state.activeSidePaneTabId)) return {};
  const activeSidePaneTabId = firstEnabledSidePaneTab(state);
  return {
    activeSidePaneTabId,
    ...(activeSidePaneTabId.startsWith("browser-")
      ? {
          browserTabs: state.browserTabs.map((tab) =>
            tab.id === activeSidePaneTabId
              ? { ...tab, mounted: true, initialUrl: tab.initialUrl ?? state.browserDefaultUrl }
              : tab,
          ),
        }
      : {}),
  };
}

const BROWSER_TAB_PREFIX = "browser-";

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      theme: "system",
      uiFontSize: 14,
      terminalFontSize: 13,
      terminalFontFamily: '"Cica", "HackGen", "JetBrains Mono", monospace',
      scrollback: 5000,
      shell: "system",
      browserDefaultUrl: DEFAULT_BROWSER_START_URL,
      desktopNotifications: true,
      filesPanelEnabled: true,
      reviewPanelEnabled: true,
      browserPanelEnabled: true,
      notesPanelEnabled: true,
      boardPanelEnabled: true,
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
      browserBookmarks: [],
      browserWorkspaceId: null,
      browserSelections: {},
      expandedFileFolders: {},
      setFileFolderExpanded: (workspaceId, path, expanded) =>
        set((state) => {
          const paths = state.expandedFileFolders[workspaceId] ?? [];
          const next = expanded
            ? [...new Set([...paths, path])]
            : paths.filter((item) => item !== path);
          return { expandedFileFolders: { ...state.expandedFileFolders, [workspaceId]: next } };
        }),
      setBrowserWorkspace: (workspaceId) =>
        set((state) => {
          if (state.browserWorkspaceId === workspaceId) return state;
          const browserSelections = {
            ...state.browserSelections,
            ...(state.browserWorkspaceId
              ? { [state.browserWorkspaceId]: state.activeSidePaneTabId }
              : {}),
          };
          const visible = state.browserTabs.filter(
            (tab) => !tab.workspaceId || tab.workspaceId === workspaceId,
          );
          const remembered = browserSelections[workspaceId];
          const valid = (id: string | undefined) =>
            typeof id === "string" &&
            (!id.startsWith("browser-") || visible.some((tab) => tab.id === id));
          const activeSidePaneTabId = valid(remembered)
            ? remembered!
            : valid(state.activeSidePaneTabId)
              ? state.activeSidePaneTabId
              : (visible.find((tab) => tab.workspaceId === workspaceId)?.id ??
                visible[0]?.id ??
                "files");
          return {
            browserWorkspaceId: workspaceId,
            browserSelections,
            activeSidePaneTabId,
            browserTabs: state.browserTabs.map((tab) =>
              tab.id === activeSidePaneTabId
                ? { ...tab, mounted: true, initialUrl: tab.initialUrl ?? state.browserDefaultUrl }
                : tab,
            ),
            browserNavigateRequest: null,
          };
        }),
      moveBrowserTab: (tabId, workspaceId) =>
        set((state) => ({
          browserTabs: state.browserTabs.map((tab) => {
            if (tab.id !== tabId) return tab;
            const { workspaceId: _previous, ...rest } = tab;
            return workspaceId ? { ...rest, workspaceId } : rest;
          }),
        })),
      setBrowserZoom: (tabId, factor) => {
        if (!Number.isFinite(factor)) return;
        const zoomFactor = Math.round(Math.min(3, Math.max(0.5, factor)) * 10) / 10;
        set((state) => ({
          browserTabs: state.browserTabs.map((tab) =>
            tab.id === tabId ? { ...tab, zoomFactor } : tab,
          ),
        }));
      },
      updateBrowserPage: (tabId, url, title) => {
        let normalized: string;
        try {
          normalized = normalizeBrowserUrl(url);
        } catch {
          return;
        }
        set((state) => ({
          browserTabs: state.browserTabs.map((tab) =>
            tab.id === tabId
              ? { ...tab, initialUrl: normalized, title: title?.trim().slice(0, 200) || normalized }
              : tab,
          ),
        }));
      },
      toggleBrowserBookmark: (url, title, workspaceId) => {
        let normalized: string;
        try {
          normalized = normalizeBrowserUrl(url);
        } catch {
          return;
        }
        set((state) => ({
          browserBookmarks: state.browserBookmarks.some(
            (item) =>
              item.url === normalized &&
              (item.workspaceId ?? null) ===
                (workspaceId === undefined ? state.browserWorkspaceId : workspaceId),
          )
            ? state.browserBookmarks.filter(
                (item) =>
                  item.url !== normalized ||
                  (item.workspaceId ?? null) !==
                    (workspaceId === undefined ? state.browserWorkspaceId : workspaceId),
              )
            : [
                ...state.browserBookmarks,
                {
                  url: normalized,
                  title: title.trim().slice(0, 200) || normalized,
                  ...((workspaceId === undefined ? state.browserWorkspaceId : workspaceId)
                    ? {
                        workspaceId: (workspaceId === undefined
                          ? state.browserWorkspaceId
                          : workspaceId)!,
                      }
                    : {}),
                },
              ],
        }));
      },
      renameBrowserBookmark: (url, title, workspaceId) =>
        set((state) => ({
          browserBookmarks: state.browserBookmarks.map((item) =>
            item.url === url &&
            (item.workspaceId ?? null) ===
              (workspaceId === undefined ? state.browserWorkspaceId : workspaceId)
              ? { ...item, title: title.trim().slice(0, 200) || item.url }
              : item,
          ),
        })),
      browserTabCounter: 2,
      browserNavigateRequest: null,
      setTheme: (theme) => set({ theme }),
      setUiFontSize: (uiFontSize) => set({ uiFontSize: Math.min(18, Math.max(12, uiFontSize)) }),
      saveSettings: (settings) =>
        set((state) => ({ ...settings, ...reconcilePanelSelection({ ...state, ...settings }) })),
      setUsagePanelEnabled: (usagePanelEnabled) =>
        get().setPanelEnabled("usage", usagePanelEnabled),
      setPanelEnabled: (panel, enabled) =>
        set((state) => {
          const next = { ...state, [panelSettingKeys[panel]]: enabled };
          return { [panelSettingKeys[panel]]: enabled, ...reconcilePanelSelection(next) };
        }),
      togglePanel: (panel) => get().setPanelEnabled(panel, !get()[panelSettingKeys[panel]]),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      toggleNotesPanel: () => get().togglePanel("notes"),
      toggleBoardPanel: () => get().togglePanel("board"),
      toggleSidePane: () => set((state) => ({ sidePaneOpen: !state.sidePaneOpen })),
      toggleActivity: () => set((state) => ({ activityOpen: !state.activityOpen })),
      setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
      setSidebarWidth: (sidebarWidth) => set({ sidebarWidth }),
      setSidePaneWidth: (sidePaneWidth) => set({ sidePaneWidth }),
      setActivityHeight: (activityHeight) => set({ activityHeight }),
      activateSidePaneTab: (activeSidePaneTabId) =>
        set((state) =>
          isSidePaneTabEnabled(state, activeSidePaneTabId) ? { activeSidePaneTabId } : state,
        ),
      showSidePaneTab: (tabId) =>
        set((state) => {
          if (!isSidePaneTabEnabled(state, tabId)) return state;
          return { activeSidePaneTabId: tabId, sidePaneOpen: true };
        }),
      openBrowserPane: () =>
        set((state) => {
          if (!state.browserPanelEnabled) return state;
          const visibleTabs = visibleBrowserTabs(state);
          if (visibleTabs.length === 0) {
            const number = state.browserTabCounter;
            const newTab: BrowserTabState = {
              id: `${BROWSER_TAB_PREFIX}${number}`,
              title: `Browser ${number}`,
              initialUrl: state.browserDefaultUrl,
              mounted: true,
              ...(state.browserWorkspaceId ? { workspaceId: state.browserWorkspaceId } : {}),
            };
            return {
              browserTabs: [...state.browserTabs, newTab],
              browserTabCounter: number + 1,
              activeSidePaneTabId: newTab.id,
              sidePaneOpen: true,
            };
          }
          const activeTab = visibleTabs.find(
            (browserTab) => browserTab.id === state.activeSidePaneTabId,
          );
          const targetId = activeTab?.id ?? visibleTabs[0]!.id;
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
        set((state) =>
          state.browserPanelEnabled
            ? {
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
              }
            : state,
        ),
      addBrowserTab: () =>
        set((state) => {
          if (!state.browserPanelEnabled) return state;
          const number = state.browserTabCounter;
          const newTab: BrowserTabState = {
            id: `${BROWSER_TAB_PREFIX}${number}`,
            title: `Browser ${number}`,
            initialUrl: state.browserDefaultUrl,
            mounted: true,
            ...(state.browserWorkspaceId ? { workspaceId: state.browserWorkspaceId } : {}),
          };
          return {
            browserTabs: [...state.browserTabs, newTab],
            browserTabCounter: number + 1,
            activeSidePaneTabId: newTab.id,
          };
        }),
      closeBrowserTab: (tabId) =>
        set((state) => {
          const visibleTabs = visibleBrowserTabs(state);
          const tabIndex = visibleTabs.findIndex((browserTab) => browserTab.id === tabId);
          if (tabIndex < 0) return state;
          const remainingTabs = state.browserTabs.filter((browserTab) => browserTab.id !== tabId);
          const activeSidePaneTabId =
            state.activeSidePaneTabId === tabId
              ? (visibleTabs.filter((tab) => tab.id !== tabId)[Math.max(0, tabIndex - 1)]?.id ??
                "files")
              : state.activeSidePaneTabId;
          return {
            browserTabs: remainingTabs,
            activeSidePaneTabId,
            browserNavigateRequest:
              state.browserNavigateRequest?.tabId === tabId ? null : state.browserNavigateRequest,
          };
        }),
      openInBrowserTab: (url, options) => {
        if (!get().browserPanelEnabled) return false;
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
              ...(state.browserWorkspaceId ? { workspaceId: state.browserWorkspaceId } : {}),
            };
            return {
              browserTabs: [...state.browserTabs, newTab],
              browserTabCounter: number + 1,
              activeSidePaneTabId: newTab.id,
              sidePaneOpen: true,
              browserNavigateRequest: null,
            };
          }
          const visibleTabs = visibleBrowserTabs(state);
          const activeIsBrowser = visibleTabs.some(
            (browserTab) => browserTab.id === state.activeSidePaneTabId,
          );
          const target =
            (activeIsBrowser
              ? visibleTabs.find((browserTab) => browserTab.id === state.activeSidePaneTabId)
              : undefined) ?? visibleTabs[0];
          if (!target) {
            const number = state.browserTabCounter;
            const newTab: BrowserTabState = {
              id: `${BROWSER_TAB_PREFIX}${number}`,
              title: `Browser ${number}`,
              initialUrl: normalizedUrl,
              mounted: true,
              ...(state.browserWorkspaceId ? { workspaceId: state.browserWorkspaceId } : {}),
            };
            return {
              browserTabs: [...state.browserTabs, newTab],
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
        browserTabs,
        browserBookmarks,
        browserWorkspaceId,
        browserSelections,
        expandedFileFolders,
        activeSidePaneTabId,
        desktopNotifications,
        filesPanelEnabled,
        reviewPanelEnabled,
        browserPanelEnabled,
        notesPanelEnabled,
        boardPanelEnabled,
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
        browserTabs,
        browserBookmarks,
        browserWorkspaceId,
        browserSelections,
        expandedFileFolders,
        activeSidePaneTabId,
        desktopNotifications,
        filesPanelEnabled,
        reviewPanelEnabled,
        browserPanelEnabled,
        notesPanelEnabled,
        boardPanelEnabled,
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
        const persisted = (persistedState ?? {}) as Partial<UiState>;
        const browserTabs = restoreBrowserTabs(persisted.browserTabs, currentState.browserTabs);
        const browserWorkspaceId =
          typeof persisted.browserWorkspaceId === "string" ? persisted.browserWorkspaceId : null;
        const activeSidePaneTabId =
          typeof persisted.activeSidePaneTabId === "string" &&
          (browserTabs.some(
            (tab) =>
              tab.id === persisted.activeSidePaneTabId &&
              (!tab.workspaceId || tab.workspaceId === browserWorkspaceId),
          ) ||
            ["files", "review", "notes", "board", "usage"].includes(persisted.activeSidePaneTabId))
            ? persisted.activeSidePaneTabId
            : "files";
        const restored: UiState = {
          ...currentState,
          ...persisted,
          browserTabs: browserTabs.map((tab) => ({
            ...tab,
            mounted:
              (persisted.browserPanelEnabled ?? currentState.browserPanelEnabled) &&
              tab.id === activeSidePaneTabId,
          })),
          browserTabCounter: Math.max(1, ...browserTabs.map((tab) => Number(tab.id.slice(8)))) + 1,
          activeSidePaneTabId,
          browserBookmarks: restoreBookmarks(persisted.browserBookmarks),
          browserWorkspaceId,
          browserSelections: restoreSelections(persisted.browserSelections),
          expandedFileFolders: restoreExpandedFileFolders(persisted.expandedFileFolders),
          shell: TERMINAL_SHELLS.includes(persisted.shell as TerminalShell)
            ? (persisted.shell as TerminalShell)
            : currentState.shell,
          shortcuts: mergeShortcutBindings(persisted.shortcuts),
        };
        return { ...restored, ...reconcilePanelSelection(restored) };
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

function restoreBrowserTabs(value: unknown, fallback: BrowserTabState[]): BrowserTabState[] {
  if (!Array.isArray(value)) return fallback;
  const ids = new Set<string>();
  return value.slice(0, 100).flatMap((tab) => {
    if (
      !tab ||
      typeof tab.id !== "string" ||
      !/^browser-[1-9]\d{0,8}$/.test(tab.id) ||
      ids.has(tab.id)
    )
      return [];
    let initialUrl: string | null = null;
    try {
      if (typeof tab.initialUrl === "string") initialUrl = normalizeBrowserUrl(tab.initialUrl);
    } catch {
      return [];
    }
    ids.add(tab.id);
    return [
      {
        id: tab.id,
        title: typeof tab.title === "string" ? tab.title.slice(0, 200) : "Browser",
        initialUrl,
        mounted: false,
        ...(typeof tab.workspaceId === "string" && tab.workspaceId
          ? { workspaceId: tab.workspaceId }
          : {}),
        ...(typeof tab.zoomFactor === "number" && Number.isFinite(tab.zoomFactor)
          ? { zoomFactor: Math.round(Math.min(3, Math.max(0.5, tab.zoomFactor)) * 10) / 10 }
          : {}),
      },
    ];
  });
}
function restoreBookmarks(value: unknown): BrowserBookmark[] {
  if (!Array.isArray(value)) return [];
  const urls = new Set<string>();
  return value.slice(0, 1000).flatMap((item) => {
    if (!item || typeof item.url !== "string") return [];
    try {
      const url = normalizeBrowserUrl(item.url);
      const workspaceId =
        typeof item.workspaceId === "string" && item.workspaceId ? item.workspaceId : undefined;
      const key = JSON.stringify([workspaceId ?? null, url]);
      if (urls.has(key)) return [];
      urls.add(key);
      return [
        {
          url,
          title: typeof item.title === "string" ? item.title.slice(0, 200) : url,
          ...(workspaceId ? { workspaceId } : {}),
        },
      ];
    } catch {
      return [];
    }
  });
}

function visibleBrowserTabs(
  state: Pick<UiState, "browserTabs" | "browserWorkspaceId">,
): BrowserTabState[] {
  return state.browserTabs.filter(
    (tab) => !tab.workspaceId || tab.workspaceId === state.browserWorkspaceId,
  );
}
function restoreSelections(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 1000)
      .filter(
        ([, id]) =>
          typeof id === "string" &&
          (/^browser-[1-9]\d{0,8}$/.test(id) ||
            ["files", "review", "notes", "board", "usage"].includes(id)),
      ),
  );
}

function restoreExpandedFileFolders(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([id, paths]) => id && Array.isArray(paths))
      .map(([id, paths]) => [
        id,
        [
          ...new Set(
            (paths as unknown[]).filter(
              (path): path is string => typeof path === "string" && path.length > 0,
            ),
          ),
        ],
      ]),
  );
}
