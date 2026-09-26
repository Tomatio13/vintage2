import {
  ArrowLeft,
  Check,
  ChevronDown,
  Circle,
  CloudDownload,
  FolderOpen,
  Minus,
  Plus,
  RotateCcw,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

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

const sections: Array<{ id: SettingsSection; label: string }> = [
  { id: "appearance", label: "Appearance" },
  { id: "terminal", label: "Terminal" },
  { id: "browser", label: "Browser" },
  { id: "attention", label: "Attention" },
  { id: "shortcuts", label: "Shortcuts" },
  { id: "integrations", label: "Integrations" },
  { id: "usage", label: "Usage" },
  { id: "updates", label: "Updates" },
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

function Choice({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick(): void;
}) {
  return (
    <button
      className={`rounded-md border px-3 py-2 text-ui-sm font-medium ${active ? "border-brand bg-hover text-foreground" : "border-border bg-background text-foreground-subtle hover:bg-hover"}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Stepper({
  value,
  min,
  max,
  suffix,
  step,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  suffix: string;
  step: number;
  onChange(value: number): void;
}) {
  return (
    <div className="flex items-center rounded-md border border-input-border bg-background">
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
      store.usagePanelEnabled,
      store.codexbarPath,
      store.usageRefreshSeconds,
      store.shortcuts,
    ],
  );
  const [draft, setDraft] = useState<VintageSettings>(saved);
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
  const save = useCallback(
    async (closeAfterSave = true) => {
      if (attentionLoading) return;
      setAttentionMessage(null);
      let browserDefaultUrl: string;
      try {
        browserDefaultUrl = normalizeBrowserUrl(draft.browserDefaultUrl);
      } catch (error) {
        setBrowserUrlError(error instanceof Error ? error.message : String(error));
        setSection("browser");
        return;
      }
      setBrowserUrlError(null);
      const normalizedDraft = { ...draft, browserDefaultUrl };
      try {
        const setAttentionSettings = window.desktop?.setAttentionSettings;
        const savedAttention = setAttentionSettings
          ? await setAttentionSettings(attentionDraft)
          : attentionDraft;
        setAttentionDraft(savedAttention);
        setAttentionSaved(savedAttention);
        store.saveSettings(normalizedDraft);
        setDraft(normalizedDraft);
        if (closeAfterSave) store.setSettingsOpen(false);
      } catch (error) {
        setAttentionMessage(error instanceof Error ? error.message : String(error));
      }
    },
    [attentionDraft, attentionLoading, draft, store],
  );
  useEffect(() => {
    if (store.settingsOpen) {
      setDraft(saved);
      setBrowserUrlError(null);
    }
  }, [store.settingsOpen, saved]);
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
        void save(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draft.shortcuts, recording, save, store]);
  if (!store.settingsOpen) return null;
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(saved) ||
    JSON.stringify(attentionDraft) !== JSON.stringify(attentionSaved);
  const change = (patch: Partial<VintageSettings>) => {
    if (patch.browserDefaultUrl !== undefined) setBrowserUrlError(null);
    setDraft((current) => ({ ...current, ...patch }));
  };
  const discard = () => {
    setDraft(saved);
    setAttentionDraft(attentionSaved);
    setRecording(null);
    setShortcutError(null);
    setBrowserUrlError(null);
    setAttentionMessage(null);
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
    updateStatus?.status === "unsupported" ||
    updateStatus?.status === "checking" ||
    updateStatus?.status === "downloading";
  const runUpdateAction = async () => {
    const bridge = window.desktop;
    if (!bridge || !updateStatus) return;
    setUpdateBusy(true);
    setUpdateActionError(null);
    try {
      if (updateStatus.status === "available") {
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

  const content = (() => {
    if (section === "appearance")
      return (
        <>
          <div>
            <h2 className="text-2xl font-semibold">Appearance</h2>
            <p className="mt-1 text-ui-base text-foreground-subtle">
              Choose a color mode and a comfortable interface size.
            </p>
          </div>
          <Card>
            <h3 className="mb-4 text-ui-base font-semibold">Color mode</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {themes.map((item) => (
                <button
                  key={item.id}
                  className={`rounded-xl border-2 bg-background p-3 text-left ${draft.theme === item.id ? "border-brand" : "border-border hover:border-pane-active-border"}`}
                  onClick={() => change({ theme: item.id })}
                >
                  <ThemePreview theme={item.id} />
                  <div className="mt-3 flex items-center justify-between">
                    <span className="font-medium">{item.label}</span>
                    <Circle
                      className={`size-4 ${draft.theme === item.id ? "fill-brand text-brand" : "text-input-border"}`}
                    />
                  </div>
                  <p className="mt-1 text-ui-xs text-foreground-subtle">{item.description}</p>
                </button>
              ))}
            </div>
          </Card>
          <Card>
            <Field
              label="Interface size"
              description="Find a comfortable size for labels, menus and controls."
            >
              <Stepper
                value={draft.uiFontSize}
                min={12}
                max={18}
                step={1}
                suffix=" px"
                onChange={(uiFontSize) => change({ uiFontSize })}
              />
            </Field>
            <div className="mt-4 flex flex-wrap gap-2">
              {[12, 14, 16, 18].map((value) => (
                <Choice
                  active={draft.uiFontSize === value}
                  key={value}
                  onClick={() => change({ uiFontSize: value })}
                >
                  {value}px
                </Choice>
              ))}
            </div>
            <div className="mt-4 rounded-md border border-border bg-background p-4">
              <p className="text-ui-xs text-foreground-subtle">PREVIEW</p>
              <p className="mt-2" style={{ fontSize: draft.uiFontSize }}>
                Your workspace
              </p>
              <p
                className="mt-1 text-foreground-subtle"
                style={{ fontSize: Math.max(11, draft.uiFontSize - 2) }}
              >
                Workspace / Terminal / Files
              </p>
            </div>
          </Card>
          <p className="text-ui-sm text-foreground-subtle">
            Terminal text has its own size control in the Terminal tab.
          </p>
        </>
      );
    if (section === "terminal")
      return (
        <>
          <div>
            <h2 className="text-2xl font-semibold">Terminal</h2>
            <p className="mt-1 text-ui-base text-foreground-subtle">
              Fonts, shells and scrollback, with a live preview.
            </p>
          </div>
          <Card>
            <div className="space-y-5">
              <Field label="Font family" description="Use a preset or choose a monospace font.">
                <div className="relative">
                  <select
                    aria-label="Terminal font family"
                    className="h-9 min-w-52 appearance-none rounded-md border border-input-border bg-background px-3 pr-9 text-ui-sm outline-none focus:border-brand"
                    value={draft.terminalFontFamily}
                    onChange={(event) => change({ terminalFontFamily: event.target.value })}
                  >
                    <option value={'"Cica", "HackGen", "JetBrains Mono", monospace'}>
                      Default
                    </option>
                    <option value="Cica, monospace">Cica</option>
                    <option value="HackGen, monospace">HackGen</option>
                    <option value="JetBrains Mono, monospace">JetBrains Mono</option>
                    <option value="monospace">System monospace</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-2 size-4 text-foreground-subtle" />
                </div>
              </Field>
              <div className="border-t border-border pt-5">
                <Field label="Text size" description="Independent of the interface size.">
                  <div className="flex items-center gap-2">
                    <Stepper
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
            <div className="mt-5 overflow-hidden rounded-md border border-input-border">
              <div className="flex items-center justify-between bg-background px-3 py-2 text-ui-sm text-foreground-subtle">
                <span>Terminal preview</span>
                <span className="rounded-full bg-hover px-2 py-1">{draft.terminalFontSize} px</span>
              </div>
              <pre
                className="m-0 bg-terminal-surface p-4 text-foreground"
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
          </Card>
          <Card>
            <Field
              label="Default shell"
              description="Used for new terminals. Running sessions stay as they are."
            >
              <div className="relative">
                <select
                  aria-label="Default shell"
                  className="h-9 min-w-52 appearance-none rounded-md border border-input-border bg-background px-3 pr-9 text-ui-sm outline-none focus:border-brand"
                  value={draft.shell}
                  onChange={(event) =>
                    change({ shell: event.target.value as VintageSettings["shell"] })
                  }
                >
                  <option value="system">
                    {window.desktop?.platform === "win32"
                      ? "System default (Command Prompt)"
                      : "System default"}
                  </option>
                  {(window.desktop?.platform === "win32"
                    ? windowsShellOptions
                    : posixShellOptions
                  ).map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-2 size-4 text-foreground-subtle" />
              </div>
            </Field>
          </Card>
          <Card>
            <Field
              label="Scrollback"
              description="Lines retained per terminal. Fewer lines use less memory."
            >
              <div className="flex flex-wrap gap-2">
                {[1000, 2500, 5000, 10000].map((value) => (
                  <Choice
                    active={draft.scrollback === value}
                    key={value}
                    onClick={() => change({ scrollback: value })}
                  >
                    {value.toLocaleString()}
                  </Choice>
                ))}
              </div>
            </Field>
            <p className="mt-3 text-ui-sm text-foreground-subtle">
              Reducing this limit removes the oldest retained lines when you save.
            </p>
          </Card>
        </>
      );
    if (section === "browser")
      return (
        <>
          <div>
            <h2 className="text-2xl font-semibold">Browser</h2>
            <p className="mt-1 text-ui-base text-foreground-subtle">
              Choose the page shown when you open the Browser pane.
            </p>
          </div>
          <Card>
            <Field
              label="Default start URL"
              description="HTTP and HTTPS URLs are supported. Leave empty to open a blank page."
            >
              <input
                aria-label="Default browser URL"
                autoComplete="url"
                className="h-9 w-full rounded-md border border-input-border bg-background px-3 text-ui-sm text-foreground outline-none focus:border-brand"
                inputMode="url"
                spellCheck={false}
                type="text"
                value={draft.browserDefaultUrl}
                onChange={(event) => change({ browserDefaultUrl: event.target.value })}
              />
            </Field>
            {browserUrlError && (
              <p className="mt-2 text-ui-sm text-destructive" role="alert">
                {browserUrlError}
              </p>
            )}
          </Card>
        </>
      );
    if (section === "attention")
      return (
        <>
          <div>
            <h2 className="text-2xl font-semibold">Attention</h2>
            <p className="mt-1 text-ui-base text-foreground-subtle">
              Tune terminal monitoring and when attention should be raised.
            </p>
          </div>
          <Card>
            <div className="space-y-5">
              <Field
                label="Output debounce"
                description="Wait for output to settle before checking a running terminal."
              >
                <label className="flex items-center gap-2 text-ui-sm">
                  <input
                    aria-label="Attention debounce"
                    className="h-9 w-24 rounded-md border border-input-border bg-background px-2 text-right outline-none focus:border-brand"
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
              <div className="border-t border-border pt-5">
                <Field
                  label="Agent Monitor interval"
                  description="Ask Jev for an active agent's state at this interval."
                >
                  <label className="flex items-center gap-2 text-ui-sm">
                    <input
                      aria-label="Agent Monitor interval"
                      className="h-9 w-24 rounded-md border border-input-border bg-background px-2 text-right outline-none focus:border-brand"
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
              <div className="border-t border-border pt-5">
                <Field
                  label="Attention threshold"
                  description="Hide lower-priority attention from badges and the Attention list."
                >
                  <div className="relative">
                    <select
                      aria-label="Attention threshold"
                      className="h-9 min-w-36 appearance-none rounded-md border border-input-border bg-background px-3 pr-9 text-ui-sm outline-none focus:border-brand"
                      value={attentionDraft.attentionThreshold}
                      onChange={(event) =>
                        setAttentionDraft((current) => ({
                          ...current,
                          attentionThreshold: Number(event.target.value) as AttentionLevel,
                        }))
                      }
                    >
                      <option value={1}>LOW and above</option>
                      <option value={2}>MEDIUM and above</option>
                      <option value={3}>HIGH and above</option>
                      <option value={4}>CRITICAL only</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2 top-2 size-4 text-foreground-subtle" />
                  </div>
                </Field>
              </div>
              <div className="border-t border-border pt-5">
                <Field
                  label="Desktop notification threshold"
                  description="Native notifications require VINTAGE to be unfocused unless a terminal uses Always Notify."
                >
                  <div className="relative">
                    <select
                      aria-label="Desktop notification threshold"
                      className="h-9 min-w-36 appearance-none rounded-md border border-input-border bg-background px-3 pr-9 text-ui-sm outline-none focus:border-brand"
                      value={attentionDraft.notificationThreshold}
                      onChange={(event) =>
                        setAttentionDraft((current) => ({
                          ...current,
                          notificationThreshold: Number(event.target.value) as AttentionLevel,
                        }))
                      }
                    >
                      <option value={1}>LOW and above</option>
                      <option value={2}>MEDIUM and above</option>
                      <option value={3}>HIGH and above</option>
                      <option value={4}>CRITICAL only</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2 top-2 size-4 text-foreground-subtle" />
                  </div>
                </Field>
              </div>
            </div>
          </Card>
          <p className="text-ui-sm text-foreground-subtle">
            Terminal-specific modes are available in each terminal header. Mute affects native
            notifications only; terminal input, output, and detection continue normally.
          </p>
        </>
      );
    if (section === "shortcuts")
      return (
        <>
          <div>
            <h2 className="text-2xl font-semibold">Keyboard shortcuts</h2>
            <p className="mt-1 text-ui-base text-foreground-subtle">
              Click an assignment, then press the new key combination. Escape cancels recording.
            </p>
          </div>
          {shortcutGroups.map(([title, actions]) => (
            <Card key={title}>
              <h3 className="mb-3 text-ui-sm font-semibold uppercase tracking-wider text-foreground-subtle">
                {title}
              </h3>
              <div className="divide-y divide-border">
                {actions.map((action) => {
                  const binding = draft.shortcuts.find((item) => item.action === action);
                  if (!binding) return null;
                  const active = recording === action;
                  return (
                    <div className="flex items-center justify-between gap-3 py-3" key={action}>
                      <span className="text-ui-base">{shortcutLabels[action]}</span>
                      <button
                        aria-label={`Set ${shortcutLabels[action]} shortcut`}
                        className={`rounded border px-2 py-1 text-ui-sm ${active ? "border-brand bg-hover text-brand" : "border-input-border bg-background text-foreground hover:bg-hover"}`}
                        onClick={() => {
                          setRecording(action);
                          setShortcutError(null);
                        }}
                      >
                        {active ? "Press a shortcut…" : shortcutLabel(binding)}
                      </button>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-3 text-ui-sm text-foreground-subtle">
            <div>
              {shortcutError ? (
                <span className="text-warning">{shortcutError}</span>
              ) : (
                <span>Ctrl+, opens settings · Ctrl+S saves changes</span>
              )}
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
        </>
      );
    if (section === "integrations")
      return (
        <>
          <div>
            <h2 className="text-2xl font-semibold">Integrations</h2>
            <p className="mt-1 text-ui-base text-foreground-subtle">
              Configure semantic terminal judgment and attention notifications.
            </p>
          </div>
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-ui-base font-semibold">TypeSafe / Jev</h3>
                <p className="mt-1 text-ui-sm text-foreground-subtle">
                  The key is encrypted by the operating system and is never returned to this page.
                </p>
              </div>
              <span className="rounded-full bg-hover px-2 py-1 text-ui-xs text-foreground-subtle">
                {jevStatus?.source === "saved"
                  ? "Saved securely"
                  : jevStatus?.source === "environment"
                    ? "Environment variable"
                    : jevStatus
                      ? "Not configured"
                      : "Loading…"}
              </span>
            </div>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input
                aria-label="TypeSafe API key"
                autoComplete="off"
                className="h-10 min-w-0 flex-1 rounded-md border border-input-border bg-background px-3 font-mono text-ui-sm outline-none focus:border-brand"
                disabled={jevBusy || jevStatus?.secureStorageAvailable === false}
                onChange={(event) => setJevApiKey(event.target.value)}
                placeholder={jevStatus?.configured ? "Enter a replacement key" : "Enter API key"}
                spellCheck={false}
                type="password"
                value={jevApiKey}
              />
              <Button
                disabled={
                  jevBusy || !jevApiKey.trim() || jevStatus?.secureStorageAvailable === false
                }
                size="compact"
                variant="primary"
                onClick={() => void saveJevApiKey()}
              >
                Save API key
              </Button>
              {jevStatus?.source === "saved" && (
                <Button
                  disabled={jevBusy}
                  size="compact"
                  variant="ghost"
                  onClick={() => void clearJevApiKey()}
                >
                  Clear saved key
                </Button>
              )}
            </div>
            {jevStatus?.secureStorageAvailable === false && (
              <p className="mt-3 text-ui-sm text-warning">
                Secure OS credential storage is unavailable. Use TYPESAFE_API_KEY in the environment
                instead.
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
          </Card>
          <Card>
            <Field
              label="Desktop notifications"
              description="Show a native OS notification for high-priority attention while VINTAGE is not focused."
            >
              <div className="flex gap-2">
                <Choice
                  active={draft.desktopNotifications}
                  onClick={() => change({ desktopNotifications: true })}
                >
                  On
                </Choice>
                <Choice
                  active={!draft.desktopNotifications}
                  onClick={() => change({ desktopNotifications: false })}
                >
                  Off
                </Choice>
              </div>
            </Field>
          </Card>
          <p className="text-ui-sm text-foreground-subtle">
            Sidebar and pane badges remain available regardless of this setting. Agent-specific
            hooks are not used.
          </p>
        </>
      );
    if (section === "usage")
      return (
        <>
          <div>
            <h2 className="text-2xl font-semibold">Usage</h2>
            <p className="mt-1 text-ui-base text-foreground-subtle">
              Show AI provider usage limits from the codexbar CLI in the side pane.
            </p>
          </div>
          <Card>
            <Field
              label="Show usage panel"
              description="Add a Usage tab to the side pane listing each provider's remaining quota."
            >
              <div className="flex gap-2">
                <Choice
                  active={draft.usagePanelEnabled}
                  onClick={() => change({ usagePanelEnabled: true })}
                >
                  On
                </Choice>
                <Choice
                  active={!draft.usagePanelEnabled}
                  onClick={() => change({ usagePanelEnabled: false })}
                >
                  Off
                </Choice>
              </div>
            </Field>
          </Card>
          <Card>
            <Field
              label="codexbar path"
              description="Leave empty to detect codexbar on PATH or in known install locations."
            >
              <div className="flex w-full items-center justify-end gap-2">
                <input
                  aria-label="codexbar path"
                  autoComplete="off"
                  className="h-9 min-w-0 flex-1 rounded-md border border-input-border bg-background px-3 font-mono text-ui-sm outline-none focus:border-brand"
                  placeholder="Auto-detect (PATH)"
                  spellCheck={false}
                  type="text"
                  value={draft.codexbarPath}
                  onChange={(event) => change({ codexbarPath: event.target.value })}
                />
                <Button
                  disabled={codexbarProbing}
                  size="compact"
                  variant="ghost"
                  onClick={() => void chooseCodexbarExecutable()}
                >
                  <FolderOpen /> Browse…
                </Button>
              </div>
            </Field>
            <p aria-live="polite" className="mt-2 text-ui-xs text-foreground-subtle">
              {codexbarProbing
                ? "Checking for codexbar…"
                : codexbarStatus?.found
                  ? `Detected ${codexbarStatus.version ?? "codexbar"} at ${codexbarStatus.resolvedPath}`
                  : (codexbarStatus?.message ?? "")}
            </p>
          </Card>
          <Card>
            <Field
              label="Auto refresh interval"
              description="Run codexbar again at this interval while the Usage tab is visible."
            >
              <Stepper
                max={600}
                min={60}
                step={10}
                suffix="s"
                value={draft.usageRefreshSeconds}
                onChange={(value) => change({ usageRefreshSeconds: value })}
              />
            </Field>
          </Card>
          <p className="text-ui-sm text-foreground-subtle">
            Which providers appear follows the enabled flags in ~/.config/codexbar/config.json. To
            add Claude Code, run `codexbar config enable --provider claude`.
          </p>
        </>
      );
    return (
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
  })();

  return (
    <section
      aria-label="Settings"
      aria-modal="true"
      className="fixed inset-0 z-50 flex min-h-0 flex-col bg-background text-foreground"
      role="dialog"
    >
      <header className="shrink-0 border-b border-border px-5 pt-4">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Settings</h1>
          <Button variant="ghost" onClick={discard}>
            <ArrowLeft /> Workspace
          </Button>
        </div>
        <nav
          aria-label="Settings sections"
          className="mx-auto mt-2 flex w-full max-w-5xl flex-wrap gap-1 py-2"
        >
          {sections.map((item) => (
            <button
              className={`rounded-md px-4 py-2 text-ui-sm font-medium ${section === item.id ? "bg-hover text-brand" : "text-foreground-subtle hover:bg-hover"}`}
              key={item.id}
              onClick={() => setSection(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">{content}</div>
      </div>
      <footer className="shrink-0 border-t border-border bg-panel px-5 py-3">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3">
          <span className={`text-ui-sm ${dirty ? "text-brand" : "text-foreground-subtle"}`}>
            {attentionMessage ??
              (attentionLoading
                ? "Loading attention settings…"
                : dirty
                  ? "Unsaved changes"
                  : "All changes saved")}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={discard}>
              Discard
            </Button>
            <Button
              disabled={!dirty || attentionLoading}
              variant="primary"
              onClick={() => void save()}
            >
              <Check /> Save changes
            </Button>
          </div>
        </div>
      </footer>
    </section>
  );
}
