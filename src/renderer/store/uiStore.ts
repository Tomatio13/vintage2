import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { TerminalShell } from "../../shared/desktop.js";

export const DEFAULT_BROWSER_START_URL = "https://example.com/";

export type Theme = "system" | "light" | "dark" | "graphite";
export type SettingsSection =
  | "appearance"
  | "terminal"
  | "browser"
  | "attention"
  | "shortcuts"
  | "integrations"
  | "updates";
export const shortcutActions = [
  "previous-tab",
  "next-tab",
  "previous-pane",
  "next-pane",
  "previous-workspace",
  "next-workspace",
  "new-terminal",
  "split-right",
  "split-down",
  "toggle-sidebar",
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
  { action: "new-terminal", key: "n", ctrl: true, alt: false, shift: true },
  { action: "split-right", key: "d", ctrl: true, alt: false, shift: true },
  { action: "split-down", key: "t", ctrl: true, alt: false, shift: true },
  { action: "toggle-sidebar", key: "b", ctrl: true, alt: false, shift: false },
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
  setTheme(theme: Theme): void;
  setUiFontSize(size: number): void;
  saveSettings(settings: VintageSettings): void;
  toggleSidebar(): void;
  toggleSidePane(): void;
  toggleActivity(): void;
  setSettingsOpen(open: boolean): void;
  setSidebarWidth(width: number): void;
  setSidePaneWidth(width: number): void;
  setActivityHeight(height: number): void;
}

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
      shortcuts: defaultShortcuts,
      sidebarOpen: true,
      sidePaneOpen: true,
      activityOpen: true,
      settingsOpen: false,
      sidebarWidth: 264,
      sidePaneWidth: 400,
      activityHeight: 180,
      setTheme: (theme) => set({ theme }),
      setUiFontSize: (uiFontSize) => set({ uiFontSize: Math.min(18, Math.max(12, uiFontSize)) }),
      saveSettings: (settings) => set(settings),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      toggleSidePane: () => set((state) => ({ sidePaneOpen: !state.sidePaneOpen })),
      toggleActivity: () => set((state) => ({ activityOpen: !state.activityOpen })),
      setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
      setSidebarWidth: (sidebarWidth) => set({ sidebarWidth }),
      setSidePaneWidth: (sidePaneWidth) => set({ sidePaneWidth }),
      setActivityHeight: (activityHeight) => set({ activityHeight }),
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
        shortcuts,
        sidebarOpen,
        sidePaneOpen,
        activityOpen,
        sidebarWidth,
        sidePaneWidth,
        activityHeight,
      }),
    },
  ),
);
