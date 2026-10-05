import {
  ArrowLeft,
  Bell,
  ChartNoAxesColumn,
  Globe,
  Keyboard,
  PanelsTopLeft,
  Palette,
  Pencil,
  Search,
  Plug,
  Terminal,
  type LucideIcon,
  Check,
  ChevronDown,
  CloudDownload,
  FolderOpen,
  Minus,
  Plus,
  RotateCcw,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useId,
  useState,
  type ReactNode,
  type CSSProperties,
} from "react";

import {
  DEFAULT_ATTENTION_SETTINGS,
  type AttentionLevel,
  type AttentionSettings,
  type CodexbarStatusResult,
  type DesktopUpdateStatus,
  type JevSettingsStatus,
  type TerminalShell,
} from "../../shared/desktop.js";
import { normalizeBrowserUrl } from "../lib/browserUrl.js";
import { eventKey, shortcutLabel } from "../lib/shortcuts.js";
import { Button } from "./Button.js";
import {
  defaultShortcuts,
  type ShortcutAction,
  type SettingsSection,
  type Theme,
  type VintageSettings,
  useUiStore,
} from "../store/uiStore.js";

const sections: Array<{ id: SettingsSection; label: string; icon: LucideIcon }> = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "terminal", label: "Terminal", icon: Terminal },
  { id: "browser", label: "Browser", icon: Globe },
  { id: "attention", label: "Attention", icon: Bell },
  { id: "shortcuts", label: "Shortcuts", icon: Keyboard },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "notes", label: "Panels", icon: PanelsTopLeft },
  { id: "usage", label: "Usage", icon: ChartNoAxesColumn },
  { id: "updates", label: "Updates", icon: CloudDownload },
];
const themes: Array<{ id: Theme; label: string; description: string }> = [
  { id: "system", label: "System", description: "Match your device" },
  { id: "light", label: "Light", description: "A brighter workspace" },
  { id: "dark", label: "Dark", description: "A warmer workspace" },
  { id: "graphite", label: "Graphite", description: "A neutral charcoal workspace" },
];
const posixShellOptions: Array<{ id: TerminalShell; label: string }> = [
  { id: "zsh", label: "zsh" },
  { id: "bash", label: "bash" },
  { id: "fish", label: "fish" },
];
const windowsShellOptions: Array<{ id: TerminalShell; label: string }> = [
  { id: "cmd", label: "Command Prompt" },
  { id: "powershell", label: "Windows PowerShell" },
  { id: "pwsh", label: "PowerShell 7" },
  { id: "gitbash", label: "Git Bash" },
];
const shortcutGroups: Array<[string, ShortcutAction[]]> = [
  ["Spaces", ["previous-tab", "next-tab", "new-terminal"]],
  ["Panes", ["previous-pane", "next-pane", "split-right", "split-down", "close-pane"]],
  ["Workspaces", ["previous-workspace", "next-workspace", "toggle-sidebar"]],
  ["Navigation", ["open-command-palette"]],
  [
    "Side pane",
    [
      "toggle-side-pane",
      "open-files",
      "toggle-files",
      "open-review",
      "toggle-review",
      "open-notes",
      "toggle-notes",
      "open-board",
      "toggle-board",
      "open-usage",
      "toggle-usage",
      "open-browser",
      "toggle-browser",
    ],
  ],
  ["Terminal", ["find-in-terminal"]],
];
const shortcutLabels: Record<ShortcutAction, string> = {
  "previous-tab": "Previous space",
  "next-tab": "Next space",
  "previous-pane": "Previous pane",
  "next-pane": "Next pane",
  "previous-workspace": "Previous workspace",
  "next-workspace": "Next workspace",
  "open-command-palette": "Open command palette",
  "find-in-terminal": "Find in terminal",
  "new-terminal": "New space",
  "split-right": "Split right",
  "split-down": "Split down",
  "toggle-sidebar": "Toggle sidebar",
  "toggle-side-pane": "Toggle side pane",
  "open-notes": "Open Notes pane",
  "open-board": "Open Board pane",
  "toggle-notes": "Toggle Notes tab",
  "toggle-board": "Toggle Board tab",
  "toggle-browser": "Toggle Browser tab",
  "toggle-usage": "Toggle Usage tab",
  "toggle-review": "Toggle Review tab",
  "toggle-files": "Toggle Files tab",
  "open-files": "Open Files pane",
  "open-review": "Open Review pane",
  "open-usage": "Open Usage pane",
  "open-browser": "Open Browser pane",
  "close-pane": "Close pane",
};

type PreviewTone = "light" | "dark" | "graphite";
type PreviewPalette = { base: string; surface: string; line: string; accent: string };
const previewPalettes: Record<PreviewTone, PreviewPalette> = {
  light: { base: "#faf8f4", surface: "#e6d9c2", line: "#d0c5b3", accent: "#89682e" },
  dark: { base: "#191816", surface: "#302d27", line: "#514a3f", accent: "#c6a66b" },
  graphite: { base: "#181818", surface: "#303030", line: "#4a4a4a", accent: "#d79a54" },
};

function MiniWindow({ tone }: { tone: PreviewTone }) {
  const palette = previewPalettes[tone];
  return (
    <div
      className="h-20 overflow-hidden rounded-md border"
      style={{ borderColor: palette.line, backgroundColor: palette.base }}
    >
      <div
        className="flex h-3 items-center gap-1 px-2"
        style={{ backgroundColor: palette.surface }}
      >
        {[0, 1, 2].map((dot) => (
          <i className="size-1 rounded-full" key={dot} style={{ backgroundColor: palette.line }} />
        ))}
      </div>
      <div className="flex gap-2 p-2">
        <div className="h-14 w-1/4 rounded-sm" style={{ backgroundColor: palette.surface }} />
        <div className="flex-1 space-y-1 pt-1">
          <div className="h-1 w-1/2 rounded" style={{ backgroundColor: palette.accent }} />
          <div className="h-1 w-4/5 rounded" style={{ backgroundColor: palette.line }} />
          <div className="h-1 w-3/5 rounded" style={{ backgroundColor: palette.line }} />
          <div className="h-6 rounded-sm" style={{ backgroundColor: palette.surface }} />
        </div>
      </div>
    </div>
  );
}

function ThemePreview({ theme }: { theme: Theme }) {
  if (theme === "system")
    return (
      <div className="flex h-20 gap-1">
        <div className="min-w-0 flex-1">
          <MiniWindow tone="light" />
        </div>
        <div className="min-w-0 flex-1">
          <MiniWindow tone="dark" />
        </div>
      </div>
    );
  return <MiniWindow tone={theme} />;
}

function SettingsSelect({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange(value: string): void;
  label: string;
  options: Array<{ id: string; label: string }>;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    root.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  return (
    <div
      className="relative"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        ref={trigger}
        className="flex h-9 w-52 items-center justify-between rounded-lg border border-border bg-panel px-3 text-ui-sm text-foreground outline-none hover:bg-hover focus-visible:border-brand"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {options.find((item) => item.id === value)?.label ?? value}
        <ChevronDown aria-hidden="true" className="size-4 text-foreground-subtle" />
      </button>
      {open && (
        <div
          aria-label={`${label} options`}
          id={menuId}
          role="menu"
          className="absolute right-0 top-full z-10 mt-1 min-w-full w-max max-w-80 rounded-xl border border-popover-border bg-popover p-1 text-foreground shadow-xl"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
              trigger.current?.focus();
              return;
            }
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const items = Array.from(
              event.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
            );
            const current = items.indexOf(document.activeElement as HTMLButtonElement);
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? items.length - 1
                  : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
            items[next]?.focus();
          }}
        >
          {options.map((item) => (
            <button
              aria-checked={value === item.id}
              role="menuitemradio"
              tabIndex={value === item.id ? 0 : -1}
              key={item.id}
              className={`flex w-full items-center justify-between gap-4 rounded-lg px-3 py-2.5 text-left text-ui-base outline-none hover:bg-hover focus-visible:bg-hover ${value === item.id ? "bg-selected" : ""}`}
              onClick={() => {
                onChange(item.id);
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              {item.label}
              {value === item.id && (
                <Check aria-hidden="true" className="size-4 text-foreground-subtle" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SettingsToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange(checked: boolean): void;
}) {
  return (
    <button
      aria-label={label}
      aria-checked={checked}
      role="switch"
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-transparent transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-panel ${checked ? "bg-foreground" : "bg-foreground-subtlest"}`}
      onClick={() => onChange(!checked)}
    >
      <span
        aria-hidden="true"
        className={`size-4 rounded-full bg-background shadow-sm transition-transform ${checked ? "translate-x-5" : "translate-x-1"}`}
      />
    </button>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <section className="rounded-xl border border-border bg-panel p-5">{children}</section>;
}

function Field({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        <h3 className="text-ui-base font-medium">{label}</h3>
        <p className="mt-1 text-ui-sm leading-5 text-foreground-subtle">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Stepper({
  value,
  min,
  max,
  suffix,
  step,
  onChange,
  surface = "background",
}: {
  value: number;
  min: number;
  max: number;
  suffix: string;
  step: number;
  onChange(value: number): void;
  surface?: "background" | "panel";
}) {
  return (
    <div
      className={`flex items-center rounded-lg border ${surface === "panel" ? "border-border bg-panel" : "border-input-border bg-background"}`}
    >
      <Button
        aria-label={`Decrease value`}
        disabled={value <= min}
        size="icon"
        variant="ghost"
        onClick={() => onChange(Math.max(min, value - step))}
      >
        <Minus />
      </Button>
      <span className="w-20 text-center text-ui-base font-medium">
        {value}
        {suffix}
      </span>
      <Button
        aria-label={`Increase value`}
        disabled={value >= max}
        size="icon"
        variant="ghost"
        onClick={() => onChange(Math.min(max, value + step))}
      >
        <Plus />
      </Button>
    </div>
  );
}

export function SettingsDialog() {
  const store = useUiStore();
  const saved = useMemo<VintageSettings>(
    () => ({
      theme: store.theme,
      uiFontSize: store.uiFontSize,
      terminalFontSize: store.terminalFontSize,
      terminalFontFamily: store.terminalFontFamily,
      scrollback: store.scrollback,
      shell: store.shell,
      browserDefaultUrl: store.browserDefaultUrl,
      desktopNotifications: store.desktopNotifications,
      filesPanelEnabled: store.filesPanelEnabled,
      reviewPanelEnabled: store.reviewPanelEnabled,
      browserPanelEnabled: store.browserPanelEnabled,
      notesPanelEnabled: store.notesPanelEnabled,
      boardPanelEnabled: store.boardPanelEnabled,
      usagePanelEnabled: store.usagePanelEnabled,
      codexbarPath: store.codexbarPath,
      usageRefreshSeconds: store.usageRefreshSeconds,
      shortcuts: store.shortcuts,
    }),
    [
      store.theme,
      store.uiFontSize,
      store.terminalFontSize,
      store.terminalFontFamily,
      store.scrollback,
      store.shell,
      store.browserDefaultUrl,
      store.desktopNotifications,
      store.filesPanelEnabled,
      store.reviewPanelEnabled,
      store.browserPanelEnabled,
      store.notesPanelEnabled,
      store.boardPanelEnabled,
      store.usagePanelEnabled,
      store.codexbarPath,
      store.usageRefreshSeconds,
      store.shortcuts,
    ],
  );
  const [draft, setDraft] = useState<VintageSettings>(saved);
  const [shortcutSearch, setShortcutSearch] = useState("");
  const [section, setSection] = useState<SettingsSection>("appearance");
  const [recording, setRecording] = useState<ShortcutAction | null>(null);
  const [shortcutError, setShortcutError] = useState<string | null>(null);
  const [browserUrlError, setBrowserUrlError] = useState<string | null>(null);
  const [jevApiKey, setJevApiKey] = useState("");
  const [jevStatus, setJevStatus] = useState<JevSettingsStatus | null>(null);
  const [jevBusy, setJevBusy] = useState(false);
  const [jevMessage, setJevMessage] = useState<string | null>(null);
  const [codexbarStatus, setCodexbarStatus] = useState<CodexbarStatusResult | null>(null);
  const [codexbarProbing, setCodexbarProbing] = useState(false);
  const [attentionDraft, setAttentionDraft] = useState<AttentionSettings>({
    ...DEFAULT_ATTENTION_SETTINGS,
  });
  const [attentionSaved, setAttentionSaved] = useState<AttentionSettings>({
    ...DEFAULT_ATTENTION_SETTINGS,
  });
  const [attentionLoading, setAttentionLoading] = useState(false);
  const [attentionMessage, setAttentionMessage] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<DesktopUpdateStatus | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateActionError, setUpdateActionError] = useState<string | null>(null);
  const attentionWriteQueue = useRef<Promise<void>>(Promise.resolve());
  const attentionRevision = useRef(0);
  const change = useCallback(
    (patch: Partial<VintageSettings>) => {
      const next = { ...draft, ...patch };
      setDraft(next);
      let browserDefaultUrl = saved.browserDefaultUrl;
      try {
        browserDefaultUrl = normalizeBrowserUrl(next.browserDefaultUrl);
        setBrowserUrlError(null);
      } catch (error) {
        setBrowserUrlError(error instanceof Error ? error.message : String(error));
      }
      store.saveSettings({ ...next, browserDefaultUrl });
    },
    [draft, saved.browserDefaultUrl, store],
  );
  useEffect(() => {
    if (attentionLoading || JSON.stringify(attentionDraft) === JSON.stringify(attentionSaved))
      return;
    const revision = ++attentionRevision.current;
    const pending = { ...attentionDraft };
    attentionWriteQueue.current = attentionWriteQueue.current.then(async () => {
      try {
        const result = window.desktop?.setAttentionSettings
          ? await window.desktop.setAttentionSettings(pending)
          : pending;
        if (revision === attentionRevision.current) {
          setAttentionSaved(result);
          setAttentionDraft(result);
          setAttentionMessage(null);
        }
      } catch (error) {
        if (revision === attentionRevision.current)
          setAttentionMessage(error instanceof Error ? error.message : String(error));
      }
    });
  }, [attentionDraft, attentionLoading, attentionSaved]);
  useEffect(() => {
    if (store.settingsOpen) {
      setDraft(saved);
      setBrowserUrlError(null);
    }
  }, [store.settingsOpen]);
  useEffect(() => {
    if (!store.settingsOpen) return;
    setDraft((current) => ({ ...saved, browserDefaultUrl: current.browserDefaultUrl }));
  }, [saved, store.settingsOpen]);
  useEffect(() => {
    if (!store.settingsOpen) return;
    let cancelled = false;
    setAttentionLoading(true);
    setAttentionMessage(null);
    const getAttentionSettings = window.desktop?.getAttentionSettings;
    if (!getAttentionSettings) {
      setAttentionDraft({ ...DEFAULT_ATTENTION_SETTINGS });
      setAttentionSaved({ ...DEFAULT_ATTENTION_SETTINGS });
      setAttentionLoading(false);
      return;
    }
    void getAttentionSettings()
      .then((settings) => {
        if (cancelled) return;
        setAttentionDraft(settings);
        setAttentionSaved(settings);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setAttentionMessage(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (!cancelled) setAttentionLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [store.settingsOpen]);
  useEffect(() => {
    if (!store.settingsOpen) return;
    const bridge = window.desktop;
    if (!bridge) {
      setUpdateStatus(null);
      return;
    }
    let cancelled = false;
    setUpdateActionError(null);
    const unsubscribe = bridge.onUpdateStatusChanged(setUpdateStatus);
    void bridge
      .getUpdateStatus()
      .then((status) => {
        if (!cancelled) setUpdateStatus(status);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setUpdateActionError(error instanceof Error ? error.message : String(error));
        }
      });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [store.settingsOpen]);
  useEffect(() => {
    if (!store.settingsOpen) return;
    let cancelled = false;
    setJevApiKey("");
    setJevMessage(null);
    const bridge = window.desktop;
    if (!bridge) {
      setJevStatus(null);
      return;
    }
    void bridge
      .getJevSettings()
      .then((status) => {
        if (!cancelled) setJevStatus(status);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setJevMessage(error instanceof Error ? error.message : String(error));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [store.settingsOpen]);
  useEffect(() => {
    if (!store.settingsOpen) return;
    const bridge = window.desktop;
    if (!bridge) {
      setCodexbarStatus(null);
      return;
    }
    let cancelled = false;
    setCodexbarProbing(true);
    const probeTimer = window.setTimeout(() => {
      void bridge
        .getCodexbarStatus(draft.codexbarPath)
        .then((status) => {
          if (!cancelled) setCodexbarStatus(status);
        })
        .catch(() => {
          if (!cancelled) {
            setCodexbarStatus({ found: false, message: "codexbar could not be checked." });
          }
        })
        .finally(() => {
          if (!cancelled) setCodexbarProbing(false);
        });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(probeTimer);
    };
  }, [store.settingsOpen, draft.codexbarPath]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!store.settingsOpen) return;
      if (recording) {
        event.preventDefault();
        if (event.key === "Escape") {
          setRecording(null);
          setShortcutError(null);
          return;
        }
        const key = eventKey(event);
        if (["control", "alt", "shift", "meta"].includes(key)) return;
        if (!event.ctrlKey && !event.altKey) {
          setShortcutError("Use Ctrl or Alt in a shortcut.");
          return;
        }
        const duplicate = draft.shortcuts.some(
          (binding) =>
            binding.action !== recording &&
            binding.key === key &&
            binding.ctrl === event.ctrlKey &&
            binding.alt === event.altKey &&
            binding.shift === event.shiftKey,
        );
        if (duplicate) {
          setShortcutError("This shortcut is already assigned.");
          return;
        }
        change({
          shortcuts: draft.shortcuts.map((binding) =>
            binding.action === recording
              ? { ...binding, key, ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey }
              : binding,
          ),
        });
        setRecording(null);
        setShortcutError(null);
        return;
      }
      if (event.key === "Escape") {
        store.setSettingsOpen(false);
        return;
      }
      if (event.ctrlKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        // Settings are saved as they change.
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draft.shortcuts, recording, change, store]);
  if (!store.settingsOpen) return null;
  const closeSettings = () => {
    setRecording(null);
    setShortcutError(null);
    store.setSettingsOpen(false);
  };
  const chooseCodexbarExecutable = async () => {
    const bridge = window.desktop;
    if (!bridge) return;
    try {
      const chosen = await bridge.chooseCodexbarPath();
      if (chosen) change({ codexbarPath: chosen });
    } catch {
      // Selection canceled; keep the current path.
    }
  };
  const saveJevApiKey = async () => {
    const bridge = window.desktop;
    if (!bridge || !jevApiKey.trim()) return;
    setJevBusy(true);
    setJevMessage(null);
    try {
      const status = await bridge.setJevApiKey(jevApiKey);
      setJevStatus(status);
      setJevApiKey("");
      setJevMessage("API key saved and activated.");
    } catch (error) {
      setJevMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setJevBusy(false);
    }
  };
  const clearJevApiKey = async () => {
    const bridge = window.desktop;
    if (!bridge) return;
    setJevBusy(true);
    setJevMessage(null);
    try {
      const status = await bridge.clearJevApiKey();
      setJevStatus(status);
      setJevApiKey("");
      setJevMessage(
        status.source === "environment"
          ? "Saved key removed. The environment variable is still active."
          : "Saved API key removed.",
      );
    } catch (error) {
      setJevMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setJevBusy(false);
    }
  };
  const updateStatusMessage = (() => {
    if (updateActionError) return updateActionError;
    if (!updateStatus) return "Update status is unavailable.";
    switch (updateStatus.status) {
      case "idle":
        return "Check GitHub Releases for a newer version of VINTAGE.";
      case "unsupported":
        return updateStatus.message;
      case "checking":
        return "Checking for updates…";
      case "up-to-date":
        return "You’re using the latest version.";
      case "available":
        return window.desktop?.platform === "darwin"
          ? `Version ${updateStatus.availableVersion} is available. Download it from Releases and install the DMG manually; this macOS build is not code signed.`
          : `Version ${updateStatus.availableVersion} is available.`;
      case "downloading":
        return `Downloading version ${updateStatus.availableVersion}… ${updateStatus.percent.toFixed(0)}%`;
      case "downloaded":
        if (updateStatus.installMethod === "installed") {
          return `Version ${updateStatus.availableVersion} was installed. Restart VINTAGE to apply the update.`;
        }
        return updateStatus.installMethod === "system-installer"
          ? updateStatus.message
            ? `Automatic installation failed (${updateStatus.message}). Open the .deb package installer, complete the installation, then restart VINTAGE.`
            : `Version ${updateStatus.availableVersion} is ready. Open the .deb package installer, complete the installation, then restart VINTAGE.`
          : `Version ${updateStatus.availableVersion} is ready to install.`;
      case "error":
        return `Update failed: ${updateStatus.message}`;
    }
  })();
  const updateButtonLabel = (() => {
    if (updateBusy || updateStatus?.status === "checking") return "Checking…";
    if (updateStatus?.status === "available") {
      return window.desktop?.platform === "darwin" ? "Open release" : "Download update";
    }
    if (updateStatus?.status === "downloading") {
      return `Downloading ${updateStatus.percent.toFixed(0)}%`;
    }
    if (updateStatus?.status === "downloaded") {
      if (updateStatus.installMethod === "installed") return "Restart now";
      return updateStatus.installMethod === "system-installer"
        ? "Open .deb installer"
        : "Restart & update";
    }
    return "Check for updates";
  })();
  const updateDisabled =
    !window.desktop ||
    !updateStatus ||
    updateBusy ||
    updateStatus?.status === "checking" ||
    updateStatus?.status === "downloading";
  const runUpdateAction = async () => {
    const bridge = window.desktop;
    if (!bridge || !updateStatus) return;
    setUpdateBusy(true);
    setUpdateActionError(null);
    try {
      if (updateStatus.status === "unsupported") {
        await bridge.openExternal("https://github.com/Tomatio13/vintage2/releases/latest");
      } else if (updateStatus.status === "available") {
        if (bridge.platform === "darwin") {
          const tag = updateStatus.availableVersion.replace(/^v/u, "");
          await bridge.openExternal(`https://github.com/Tomatio13/vintage2/releases/tag/v${tag}`);
        } else {
          setUpdateStatus(await bridge.downloadUpdate());
        }
      } else if (updateStatus.status === "downloaded") {
        if (updateStatus.installMethod === "installed") {
          await bridge.restartApp();
        } else {
          await bridge.installUpdate();
        }
      } else {
        setUpdateStatus(await bridge.checkForUpdates());
      }
    } catch (error) {
      setUpdateActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setUpdateBusy(false);
    }
  };

  const renderUsageSettings = () => (
    <>
      <h2 className="text-2xl font-semibold">Usage</h2>
      <section className="mt-3" aria-labelledby="usage-display-heading">
        <h3 className="text-ui-lg font-semibold" id="usage-display-heading">
          Display settings
        </h3>
        <p className="mb-3 mt-1 text-ui-base text-foreground-subtle">
          Control how often AI provider quotas refresh. Enable the Usage tab in Panels.
        </p>
        <div className="rounded-xl border border-border bg-panel">
          <div className="px-5 py-4">
            <Field
              label="Auto refresh interval"
              description="Run CodexBar again at this interval while the Usage tab is visible."
            >
              <Stepper
                surface="panel"
                max={600}
                min={60}
                step={10}
                suffix="s"
                value={draft.usageRefreshSeconds}
                onChange={(usageRefreshSeconds) => change({ usageRefreshSeconds })}
              />
            </Field>
          </div>
        </div>
      </section>
      <section className="mt-5" aria-labelledby="codexbar-settings-heading">
        <h3 className="text-ui-lg font-semibold" id="codexbar-settings-heading">
          CodexBar settings
        </h3>
        <p className="mb-3 mt-1 text-ui-base text-foreground-subtle">
          Connect the local CodexBar CLI used to retrieve provider usage limits.
        </p>
        <div className="rounded-xl border border-border bg-panel">
          <div className="px-5 py-4">
            <label className="text-ui-base font-medium" htmlFor="codexbar-executable">
              CodexBar path
            </label>
            <p className="mt-1 text-ui-sm leading-5 text-foreground-subtle" id="codexbar-path-help">
              Leave empty to detect codexbar on PATH or in known install locations.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <input
                aria-label="codexbar path"
                aria-describedby="codexbar-path-help"
                id="codexbar-executable"
                autoComplete="off"
                className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-panel px-3 font-mono text-ui-sm text-foreground outline-none placeholder:text-foreground-subtlest focus:border-brand"
                placeholder="Auto-detect (PATH)"
                spellCheck={false}
                type="text"
                value={draft.codexbarPath}
                onChange={(event) => change({ codexbarPath: event.target.value })}
              />
              <Button
                disabled={codexbarProbing}
                size="compact"
                variant="outline"
                onClick={() => void chooseCodexbarExecutable()}
              >
                <FolderOpen /> Browse…
              </Button>
            </div>
          </div>
          <div className="border-t border-border px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h4 className="text-ui-base font-medium">Detection status</h4>
              <span
                className={`rounded-md bg-hover px-2 py-1 text-ui-xs ${codexbarStatus?.found && !codexbarProbing ? "text-success" : "text-foreground-subtle"}`}
              >
                {codexbarProbing
                  ? "Checking…"
                  : codexbarStatus?.found
                    ? "Detected"
                    : "Not detected"}
              </span>
            </div>
            <p aria-live="polite" className="mt-2 break-all text-ui-sm text-foreground-subtle">
              {codexbarProbing
                ? "Checking for codexbar…"
                : codexbarStatus?.found
                  ? `Detected ${codexbarStatus.version ?? "codexbar"} at ${codexbarStatus.resolvedPath}`
                  : (codexbarStatus?.message ?? "")}
            </p>
          </div>
        </div>
      </section>
      <p className="mt-2 text-ui-sm leading-5 text-foreground-subtle">
        Which providers appear follows the enabled flags in ~/.config/codexbar/config.json. To add
        Claude Code, run{" "}
        <code className="rounded bg-panel px-1.5 py-0.5">
          codexbar config enable --provider claude
        </code>
        .
      </p>
    </>
  );
  const renderUpdateSettings = () => (
    <>
      <div>
        <h2 className="text-2xl font-semibold">About this edition</h2>
        <p className="mt-1 text-ui-base text-foreground-subtle">
          Version and update availability for VINTAGE.
        </p>
      </div>
      <Card>
        <div className="flex flex-wrap items-center gap-4">
          <div className="grid size-14 place-items-center rounded-xl border border-input-border bg-background">
            <img alt="" aria-hidden="true" className="size-10" src="./favicon.svg" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-ui-lg font-semibold">VINTAGE</h3>
            <p className="mt-1 text-ui-sm text-foreground-subtle">
              Version {updateStatus?.currentVersion ?? "…"}
            </p>
          </div>
          <span className="rounded-full bg-hover px-2 py-1 text-ui-xs text-foreground-subtle">
            Electron edition
          </span>
        </div>
        <div className="mt-5 border-t border-border pt-4">
          <h3 className="font-medium">You&apos;re using the Electron edition</h3>
          <p aria-live="polite" className="mt-2 text-ui-sm text-foreground-subtle">
            {updateStatusMessage}
          </p>
          <Button
            className="mt-4"
            disabled={updateDisabled}
            onClick={() => void runUpdateAction()}
            size="compact"
            variant="ghost"
          >
            {updateStatus?.status === "downloaded" ? (
              updateStatus.installMethod === "system-installer" ? (
                <FolderOpen />
              ) : (
                <RotateCcw />
              )
            ) : (
              <CloudDownload />
            )}
            {updateButtonLabel}
          </Button>
        </div>
      </Card>
    </>
  );
  const content = (() => {
    if (section === "appearance")
      return (
        <>
          <h2 className="text-2xl font-semibold">Appearance</h2>
          <section className="mt-3" aria-labelledby="interface-settings-heading">
            <h3 className="text-ui-lg font-semibold" id="interface-settings-heading">
              Interface settings
            </h3>
            <p className="mb-3 mt-1 text-ui-base text-foreground-subtle">
              Choose the app theme and interface text size.
            </p>
            <div className="rounded-xl border border-border bg-panel">
              <div className="px-5 py-4">
                <Field
                  label="App theme"
                  description="Choose light, dark, graphite, or follow the system theme."
                >
                  <SettingsSelect
                    label="App theme"
                    options={themes}
                    value={draft.theme}
                    onChange={(theme) => change({ theme: theme as Theme })}
                  />
                </Field>
              </div>
              <div className="border-t border-border px-5 py-4">
                <Field
                  label="UI font size"
                  description="Adjust the interface text size. Terminal text is configured separately."
                >
                  <Stepper
                    surface="panel"
                    value={draft.uiFontSize}
                    min={12}
                    max={18}
                    step={1}
                    suffix=" px"
                    onChange={(uiFontSize) => change({ uiFontSize })}
                  />
                </Field>
              </div>
            </div>
          </section>
          <section className="mt-5" aria-labelledby="theme-preview-heading">
            <h3 className="text-ui-lg font-semibold" id="theme-preview-heading">
              Theme preview
            </h3>
            <p className="mb-3 mt-1 text-ui-base text-foreground-subtle">
              Compare the available themes. Select a preview to choose its theme.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {themes.map((item) => (
                <button
                  aria-pressed={draft.theme === item.id}
                  key={item.id}
                  className={`overflow-hidden rounded-xl border bg-panel text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${draft.theme === item.id ? "border-brand" : "border-border hover:border-pane-active-border"}`}
                  onClick={() => change({ theme: item.id })}
                >
                  <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                    <div>
                      <span className="text-ui-base font-semibold">{item.label} preview</span>
                      <p className="mt-1 text-ui-sm text-foreground-subtle">{item.description}</p>
                    </div>
                    {draft.theme === item.id && (
                      <span className="rounded-md bg-hover px-2 py-1 text-ui-xs font-medium text-brand">
                        Selected
                      </span>
                    )}
                  </div>
                  <div className="p-3">
                    <ThemePreview theme={item.id} />
                  </div>
                </button>
              ))}
            </div>
          </section>
          <section className="mt-5" aria-labelledby="text-preview-heading">
            <h3 className="text-ui-lg font-semibold" id="text-preview-heading">
              Text preview
            </h3>
            <p className="mb-3 mt-1 text-ui-base text-foreground-subtle">
              Changes to interface text size are applied automatically.
            </p>
            <div className="rounded-xl border border-border bg-panel p-5">
              <p style={{ fontSize: draft.uiFontSize }}>Your workspace</p>
              <p
                className="mt-2 text-foreground-subtle"
                style={{ fontSize: Math.max(11, draft.uiFontSize - 2) }}
              >
                Workspace / Terminal / Files
              </p>
            </div>
          </section>
        </>
      );
    if (section === "terminal")
      return (
        <>
          <h2 className="text-2xl font-semibold">Terminal</h2>
          <section className="mt-3" aria-labelledby="terminal-text-heading">
            <h3 className="text-ui-lg font-semibold" id="terminal-text-heading">
              Text settings
            </h3>
            <p className="mb-3 mt-1 text-ui-base text-foreground-subtle">
              Choose the terminal font and text size independently of the interface.
            </p>
            <div className="rounded-xl border border-border bg-panel">
              <div className="px-5 py-4">
                <Field
                  label="Font family"
                  description="Choose a monospace font for terminal output."
                >
                  <SettingsSelect
                    label="Terminal font family"
                    value={draft.terminalFontFamily}
                    onChange={(terminalFontFamily) => change({ terminalFontFamily })}
                    options={[
                      {
                        id: '"Cica", "HackGen", "JetBrains Mono", monospace',
                        label: "Default",
                      },
                      { id: "Cica, monospace", label: "Cica" },
                      { id: "HackGen, monospace", label: "HackGen" },
                      { id: "JetBrains Mono, monospace", label: "JetBrains Mono" },
                      { id: "monospace", label: "System monospace" },
                    ]}
                  />
                </Field>
              </div>
              <div className="border-t border-border px-5 py-4">
                <Field
                  label="Text size"
                  description="Adjust terminal text without changing the interface size."
                >
                  <div className="flex items-center gap-2">
                    <Stepper
                      surface="panel"
                      value={draft.terminalFontSize}
                      min={8}
                      max={48}
                      step={1}
                      suffix=" px"
                      onChange={(terminalFontSize) => change({ terminalFontSize })}
                    />
                    {draft.terminalFontSize !== 12 && (
                      <Button
                        size="compact"
                        variant="ghost"
                        onClick={() => change({ terminalFontSize: 12 })}
                      >
                        Reset
                      </Button>
                    )}
                  </div>
                </Field>
              </div>
            </div>
          </section>
          <section className="mt-5" aria-labelledby="terminal-session-heading">
            <h3 className="text-ui-lg font-semibold" id="terminal-session-heading">
              Session settings
            </h3>
            <p className="mb-3 mt-1 text-ui-base text-foreground-subtle">
              Configure the shell and retained output.
            </p>
            <div className="rounded-xl border border-border bg-panel">
              <div className="px-5 py-4">
                <Field
                  label="Default shell"
                  description="Used for new terminals. Running sessions stay as they are."
                >
                  <SettingsSelect
                    label="Default shell"
                    value={draft.shell}
                    onChange={(shell) => change({ shell: shell as TerminalShell })}
                    options={[
                      {
                        id: "system",
                        label:
                          window.desktop?.platform === "win32"
                            ? "System default (Command Prompt)"
                            : "System default",
                      },
                      ...(window.desktop?.platform === "win32"
                        ? windowsShellOptions
                        : posixShellOptions),
                    ]}
                  />
                </Field>
              </div>
              <div className="border-t border-border px-5 py-4">
                <Field
                  label="Scrollback"
                  description="Lines retained per terminal. Fewer lines use less memory."
                >
                  <SettingsSelect
                    label="Scrollback"
                    value={String(draft.scrollback)}
                    onChange={(value) => change({ scrollback: Number(value) })}
                    options={[1000, 2500, 5000, 10000].map((value) => ({
                      id: String(value),
                      label: `${value.toLocaleString()} lines`,
                    }))}
                  />
                </Field>
                <p className="mt-3 text-ui-sm text-foreground-subtle">
                  Reducing this limit removes the oldest retained lines when this setting changes.
                </p>
              </div>
            </div>
          </section>
          <section className="mt-5" aria-labelledby="terminal-preview-heading">
            <h3 className="text-ui-lg font-semibold" id="terminal-preview-heading">
              Terminal preview
            </h3>
            <p className="mb-3 mt-1 text-ui-base text-foreground-subtle">
              Changes to terminal font and text size are applied automatically.
            </p>
            <div className="overflow-hidden rounded-xl border border-border bg-panel">
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 text-ui-sm text-foreground-subtle">
                <span>Terminal output</span>
                <span className="rounded-md bg-hover px-2 py-1">{draft.terminalFontSize} px</span>
              </div>
              <pre
                className="m-0 overflow-x-auto bg-terminal-surface p-5 text-foreground"
                style={{
                  fontFamily: draft.terminalFontFamily,
                  fontSize: draft.terminalFontSize,
                  lineHeight: 1.5,
                }}
              >
                <span className="text-brand">~/workspace</span>
                {"\n$ echo 'Hello, 世界'\n"}
                <span className="text-foreground-subtle">Hello, 世界</span>
              </pre>
            </div>
          </section>
        </>
      );
    if (section === "browser")
      return (
        <>
          <h2 className="text-2xl font-semibold">Browser</h2>
          <section className="mt-3" aria-labelledby="browser-startup-heading">
            <h3 className="text-ui-lg font-semibold" id="browser-startup-heading">
              Startup settings
            </h3>
            <p className="mb-3 mt-1 text-ui-base text-foreground-subtle">
              Choose the start page for the Browser pane.
            </p>
            <div className="rounded-xl border border-border bg-panel">
              <div className="flex flex-col gap-4 px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0 flex-1">
                  <label className="text-ui-base font-medium" htmlFor="browser-start-url">
                    Default start URL
                  </label>
                  <p
                    className="mt-1 text-ui-sm leading-5 text-foreground-subtle"
                    id="browser-start-url-help"
                  >
                    HTTP, HTTPS, and local file URLs are supported. Leave empty to open a blank
                    page.
                  </p>
                </div>
                <div className="w-full min-w-0 xl:w-80 xl:shrink-0">
                  <input
                    aria-label="Default browser URL"
                    aria-describedby={
                      browserUrlError
                        ? "browser-start-url-help browser-start-url-error"
                        : "browser-start-url-help"
                    }
                    aria-invalid={Boolean(browserUrlError)}
                    id="browser-start-url"
                    autoComplete="url"
                    className="h-10 w-full rounded-lg border border-border bg-panel px-3 text-ui-sm text-foreground outline-none placeholder:text-foreground-subtlest hover:border-pane-active-border focus:border-brand"
                    inputMode="url"
                    placeholder="https://example.com"
                    spellCheck={false}
                    type="text"
                    value={draft.browserDefaultUrl}
                    onChange={(event) => change({ browserDefaultUrl: event.target.value })}
                  />
                  {browserUrlError && (
                    <p
                      className="mt-2 text-ui-sm text-destructive"
                      id="browser-start-url-error"
                      role="alert"
                    >
                      {browserUrlError}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </section>
        </>
      );
    if (section === "attention")
      return (
        <>
          <h2 className="text-2xl font-semibold">Attention</h2>
          <section className="mt-3" aria-labelledby="attention-monitoring-heading">
            <h3 className="text-ui-lg font-semibold" id="attention-monitoring-heading">
              Monitoring settings
            </h3>
            <p className="mb-3 mt-1 text-ui-base text-foreground-subtle">
              Control when terminal output is evaluated and how often agents are monitored.
            </p>
            <div className="rounded-xl border border-border bg-panel">
              <div className="px-5 py-4">
                <Field
                  label="Output debounce"
                  description="Wait for output to settle before checking a running terminal."
                >
                  <label className="flex items-center gap-2 text-ui-sm">
                    <input
                      aria-label="Attention debounce"
                      className="h-9 w-24 rounded-lg border border-border bg-panel px-2 text-right outline-none focus:border-brand"
                      max={5000}
                      min={100}
                      step={100}
                      type="number"
                      value={attentionDraft.debounceMs}
                      onChange={(event) =>
                        setAttentionDraft((current) => ({
                          ...current,
                          debounceMs: Number(event.target.value),
                        }))
                      }
                    />
                    ms
                  </label>
                </Field>
              </div>
              <div className="border-t border-border px-5 py-4">
                <Field
                  label="Agent Monitor interval"
                  description="Ask Jev for an active agent's state at this interval."
                >
                  <label className="flex items-center gap-2 text-ui-sm">
                    <input
                      aria-label="Agent Monitor interval"
                      className="h-9 w-24 rounded-lg border border-border bg-panel px-2 text-right outline-none focus:border-brand"
                      max={300}
                      min={5}
                      step={1}
                      type="number"
                      value={attentionDraft.agentMonitorIntervalSeconds}
                      onChange={(event) =>
                        setAttentionDraft((current) => ({
                          ...current,
                          agentMonitorIntervalSeconds: Number(event.target.value),
                        }))
                      }
                    />
                    seconds
                  </label>
                </Field>
              </div>
            </div>
          </section>
          <section className="mt-5" aria-labelledby="attention-notifications-heading">
            <h3 className="text-ui-lg font-semibold" id="attention-notifications-heading">
              Notification settings
            </h3>
            <p className="mb-3 mt-1 text-ui-base text-foreground-subtle">
              Choose the minimum priority shown in Attention and desktop notifications.
            </p>
            <div className="rounded-xl border border-border bg-panel">
              <div className="px-5 py-4">
                <Field
                  label="Attention threshold"
                  description="Hide lower-priority attention from badges and the Attention list."
                >
                  <SettingsSelect
                    label="Attention threshold"
                    value={String(attentionDraft.attentionThreshold)}
                    onChange={(value) =>
                      setAttentionDraft((current) => ({
                        ...current,
                        attentionThreshold: Number(value) as AttentionLevel,
                      }))
                    }
                    options={[
                      { id: "1", label: "LOW and above" },
                      { id: "2", label: "MEDIUM and above" },
                      { id: "3", label: "HIGH and above" },
                      { id: "4", label: "CRITICAL only" },
                    ]}
                  />
                </Field>
              </div>
              <div className="border-t border-border px-5 py-4">
                <Field
                  label="Desktop notification threshold"
                  description="Native notifications require VINTAGE to be unfocused unless a terminal uses Always Notify."
                >
                  <SettingsSelect
                    label="Desktop notification threshold"
                    value={String(attentionDraft.notificationThreshold)}
                    onChange={(value) =>
                      setAttentionDraft((current) => ({
                        ...current,
                        notificationThreshold: Number(value) as AttentionLevel,
                      }))
                    }
                    options={[
                      { id: "1", label: "LOW and above" },
                      { id: "2", label: "MEDIUM and above" },
                      { id: "3", label: "HIGH and above" },
                      { id: "4", label: "CRITICAL only" },
                    ]}
                  />
                </Field>
              </div>
            </div>
          </section>
          <p className="text-ui-sm text-foreground-subtle">
            Terminal-specific modes are available in each terminal header. Mute affects native
            notifications only; terminal input, output, and detection continue normally.
          </p>
        </>
      );
    if (section === "shortcuts") {
      const query = shortcutSearch.trim().toLowerCase();
      const groups = shortcutGroups
        .map(([title, actions]) => ({
          title,
          bindings: actions.flatMap((action) => {
            const binding = draft.shortcuts.find((item) => item.action === action);
            if (!binding) return [];
            const searchable =
              `${title} ${shortcutLabels[action]} ${shortcutLabel(binding)} ${shortcutLabel(binding).replaceAll("+", " ")}`.toLowerCase();
            return !query || searchable.includes(query) ? [{ action, binding }] : [];
          }),
        }))
        .filter((group) => group.bindings.length);
      return (
        <>
          <h2 className="text-2xl font-semibold">Keyboard shortcuts</h2>
          <p className="text-ui-base text-foreground-subtle">
            Click a keybinding to record a new combination. Escape cancels recording.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <div className="relative min-w-0 flex-1">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-3 size-4 text-foreground-subtle"
              />
              <input
                aria-label="Search shortcuts"
                className="h-10 w-full rounded-lg border border-border bg-panel pl-9 pr-9 text-ui-base text-foreground outline-none placeholder:text-foreground-subtlest focus:border-brand"
                placeholder="Search shortcuts"
                value={shortcutSearch}
                onChange={(event) => setShortcutSearch(event.target.value)}
              />
              <Keyboard
                aria-hidden="true"
                className="pointer-events-none absolute right-3 top-3 size-4 text-foreground-subtle"
              />
            </div>
            <Button
              size="compact"
              variant="ghost"
              onClick={() => {
                change({ shortcuts: defaultShortcuts.map((binding) => ({ ...binding })) });
                setRecording(null);
                setShortcutError(null);
              }}
            >
              <RotateCcw /> Restore defaults
            </Button>
          </div>
          {groups.map(({ title, bindings }) => (
            <section className="mt-4" key={title} aria-label={`${title} shortcuts`}>
              <h3 className="mb-3 text-ui-sm font-semibold uppercase tracking-wider text-foreground-subtle">
                {title}
              </h3>
              <div className="overflow-hidden rounded-xl border border-border">
                <table className="w-full table-fixed text-left">
                  <thead className="bg-panel text-ui-base text-foreground-subtle">
                    <tr>
                      <th className="w-1/2 px-5 py-3 font-medium" scope="col">
                        Command
                      </th>
                      <th className="px-5 py-3 font-medium" scope="col">
                        Keybinding
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {bindings.map(({ action, binding }) => {
                      const active = recording === action;
                      return (
                        <tr className="border-t border-border" key={action}>
                          <th className="px-5 py-4 text-ui-base font-normal" scope="row">
                            {shortcutLabels[action]}
                          </th>
                          <td className="px-5 py-3">
                            <button
                              aria-label={`Set ${shortcutLabels[action]} shortcut`}
                              aria-pressed={active}
                              className={`inline-flex max-w-full flex-wrap items-center gap-2 rounded-lg px-2 py-2 text-ui-sm outline-none hover:bg-hover focus-visible:ring-1 focus-visible:ring-brand ${active ? "bg-hover text-brand" : "text-foreground"}`}
                              onClick={() => {
                                setRecording(action);
                                setShortcutError(null);
                              }}
                            >
                              <span className="flex flex-wrap items-center gap-2">
                                {[
                                  binding.ctrl && "Ctrl",
                                  binding.alt && "Alt",
                                  binding.shift && "Shift",
                                  shortcutLabel({
                                    ...binding,
                                    ctrl: false,
                                    alt: false,
                                    shift: false,
                                  }),
                                ]
                                  .filter(Boolean)
                                  .map((key, index) => (
                                    <kbd className="font-sans" key={index}>
                                      {key}
                                    </kbd>
                                  ))}
                              </span>
                              <Pencil
                                aria-hidden="true"
                                className="size-3.5 text-foreground-subtle"
                              />
                            </button>
                            {active && (
                              <div className="mt-2">
                                <div className="inline-flex items-center gap-2 rounded-lg bg-panel px-3 py-2 text-ui-sm">
                                  <Keyboard
                                    aria-hidden="true"
                                    className="size-4 shrink-0 text-foreground-subtle"
                                  />{" "}
                                  Press new combination…
                                </div>
                                <p className="mt-2 text-ui-xs text-foreground-subtle">
                                  Esc to cancel
                                </p>
                                {shortcutError && (
                                  <p className="mt-2 text-ui-sm text-warning" role="alert">
                                    {shortcutError}
                                  </p>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
          {!groups.length && (
            <p className="rounded-xl border border-border bg-panel p-5 text-ui-base text-foreground-subtle">
              No shortcuts match your search.
            </p>
          )}
          <p className="mt-2 text-ui-sm text-foreground-subtle">
            Changes are saved automatically · Esc cancels recording
          </p>
        </>
      );
    }
    if (section === "integrations")
      return (
        <>
          <h2 className="text-2xl font-semibold">Integrations</h2>
          <section className="mt-3" aria-labelledby="jev-integration-heading">
            <h3 className="text-ui-lg font-semibold" id="jev-integration-heading">
              TypeSafe / Jev
            </h3>
            <p className="mb-3 mt-1 text-ui-base text-foreground-subtle">
              Use semantic analysis to help identify terminal activity and attention.
            </p>
            <div className="rounded-xl border border-border bg-panel">
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div>
                  <h4 className="text-ui-base font-medium">Connection status</h4>
                  <p className="mt-1 text-ui-sm text-foreground-subtle">
                    The key is encrypted by the operating system and is never returned to this page.
                  </p>
                </div>
                <span className="rounded-md bg-hover px-2 py-1 text-ui-xs text-foreground-subtle">
                  {jevStatus?.source === "saved"
                    ? "Saved securely"
                    : jevStatus?.source === "environment"
                      ? "Environment variable"
                      : jevStatus
                        ? "Not configured"
                        : "Loading…"}
                </span>
              </div>
              <div className="border-t border-border px-5 py-4">
                <label htmlFor="jev-api-key" className="text-ui-base font-medium">
                  API key
                </label>
                <p className="mt-1 text-ui-sm leading-5 text-foreground-subtle">
                  Enter a key to enable Jev. Saving or clearing a key takes effect immediately.
                </p>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                  <input
                    aria-label="TypeSafe API key"
                    id="jev-api-key"
                    autoComplete="off"
                    className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-panel px-3 font-mono text-ui-sm text-foreground outline-none placeholder:text-foreground-subtlest focus:border-brand disabled:opacity-50"
                    disabled={jevBusy || jevStatus?.secureStorageAvailable === false}
                    onChange={(event) => setJevApiKey(event.target.value)}
                    placeholder={
                      jevStatus?.configured ? "Enter a replacement key" : "Enter API key"
                    }
                    spellCheck={false}
                    type="password"
                    value={jevApiKey}
                  />
                  <Button
                    disabled={
                      jevBusy || !jevApiKey.trim() || jevStatus?.secureStorageAvailable === false
                    }
                    size="compact"
                    variant="outline"
                    onClick={() => void saveJevApiKey()}
                  >
                    Save API key
                  </Button>
                  {jevStatus?.source === "saved" && (
                    <Button
                      disabled={jevBusy}
                      size="compact"
                      variant="destructive"
                      className="bg-[#ff575d] text-white hover:bg-[#ed484e]"
                      onClick={() => void clearJevApiKey()}
                    >
                      Clear saved key
                    </Button>
                  )}
                </div>
                {jevStatus?.secureStorageAvailable === false && (
                  <p className="mt-3 text-ui-sm text-warning">
                    Secure OS credential storage is unavailable. Use TYPESAFE_API_KEY in the
                    environment instead.
                  </p>
                )}
                {jevStatus?.storageBackend && (
                  <p className="mt-3 text-ui-xs text-foreground-subtle">
                    Credential backend: {jevStatus.storageBackend}
                  </p>
                )}
                {jevMessage && (
                  <p aria-live="polite" className="mt-3 text-ui-sm text-foreground-subtle">
                    {jevMessage}
                  </p>
                )}
              </div>
            </div>
          </section>
          <section className="mt-5" aria-labelledby="integration-notifications-heading">
            <h3 className="text-ui-lg font-semibold" id="integration-notifications-heading">
              Desktop notifications
            </h3>
            <p className="mb-3 mt-1 text-ui-base text-foreground-subtle">
              Choose whether attention can send an operating system notification.
            </p>
            <div className="rounded-xl border border-border bg-panel px-5 py-4">
              <Field
                label="Desktop notifications"
                description="Show a native OS notification for high-priority attention while VINTAGE is not focused."
              >
                <SettingsToggle
                  label="Desktop notifications"
                  checked={draft.desktopNotifications}
                  onChange={(desktopNotifications) => change({ desktopNotifications })}
                />
              </Field>
            </div>
          </section>
          <p className="text-ui-sm text-foreground-subtle">
            Sidebar and pane badges remain available regardless of this setting. Agent-specific
            hooks are not used.
          </p>
        </>
      );
    if (section === "notes")
      return (
        <>
          <h2 className="text-2xl font-semibold">Panels</h2>
          <section className="mt-3" aria-labelledby="panel-visibility-heading">
            <h3 className="text-ui-lg font-semibold" id="panel-visibility-heading">
              Side pane tabs
            </h3>
            <p className="mb-3 mt-1 text-ui-base text-foreground-subtle">
              Choose which tabs appear in the side pane. Changes are saved automatically.
            </p>
            <div className="rounded-xl border border-border bg-panel">
              {(
                [
                  [
                    "Files",
                    "filesPanelEnabled",
                    "Browse workspace files. Turning it off keeps open file panes.",
                  ],
                  ["Review", "reviewPanelEnabled", "Inspect local changes and branch diffs."],
                  [
                    "Notes",
                    "notesPanelEnabled",
                    "Show the workspace scratchpad. Turning it off keeps your saved notes.",
                  ],
                  [
                    "Board",
                    "boardPanelEnabled",
                    "Show the Kanban board. Turning it off keeps your saved cards.",
                  ],
                  ["Usage", "usagePanelEnabled", "Show AI provider quotas from CodexBar."],
                  [
                    "Browser",
                    "browserPanelEnabled",
                    "Show the built-in browser. Turning it off keeps your tabs and pages.",
                  ],
                ] as const
              ).map(([label, setting, description], index) => (
                <div className={`px-5 py-4 ${index ? "border-t border-border" : ""}`} key={setting}>
                  <Field label={`Show ${label} tab`} description={description}>
                    <SettingsToggle
                      label={`Show ${label} tab`}
                      checked={draft[setting]}
                      onChange={(enabled) => change({ [setting]: enabled })}
                    />
                  </Field>
                </div>
              ))}
            </div>
          </section>
        </>
      );
    if (section === "usage") return renderUsageSettings();
    return renderUpdateSettings();
  })();

  return (
    <section
      aria-label="Settings"
      style={
        {
          "--color-brand": "var(--color-foreground)",
          "--color-primary": "var(--color-foreground)",
          "--color-primary-foreground": "var(--color-background)",
        } as CSSProperties
      }
      aria-modal="true"
      className="fixed inset-0 z-50 flex min-h-0 flex-col bg-background text-foreground"
      role="dialog"
    >
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-44 shrink-0 flex-col border-r border-border bg-panel sm:w-56">
          <div className="shrink-0 px-3 py-4">
            <Button
              className="window-no-drag w-full justify-start text-foreground"
              variant="ghost"
              type="button"
              disabled={false}
              onClick={closeSettings}
            >
              <ArrowLeft /> Workspace
            </Button>
            <h1 className="px-3 pb-1 pt-5 text-ui-lg font-semibold">Settings</h1>
          </div>
          <nav
            aria-label="Settings sections"
            className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 pb-4"
          >
            {sections.map((item) => (
              <button
                aria-current={section === item.id ? "page" : undefined}
                className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-left text-ui-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${section === item.id ? "bg-hover text-brand" : "text-foreground-subtle hover:bg-hover hover:text-foreground"}`}
                key={item.id}
                onClick={() => setSection(item.id)}
              >
                <item.icon aria-hidden="true" className="size-4 shrink-0" />
                {item.label}
              </button>
            ))}
          </nav>
        </aside>
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8" key={section}>
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
            {content}
            {section === "attention" && attentionMessage && (
              <p className="text-ui-sm text-destructive" role="alert">
                {attentionMessage}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
