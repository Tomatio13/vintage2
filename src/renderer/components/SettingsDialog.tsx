import {
  ArrowLeft,
  Check,
  ChevronDown,
  Circle,
  CloudDownload,
  Minus,
  Plus,
  RotateCcw,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

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
  { id: "shortcuts", label: "Shortcuts" },
  { id: "integrations", label: "Integrations" },
  { id: "updates", label: "Updates" },
];
const themes: Array<{ id: Theme; label: string; description: string }> = [
  { id: "system", label: "System", description: "Match your device" },
  { id: "light", label: "Light", description: "A brighter workspace" },
  { id: "dark", label: "Dark", description: "A warmer workspace" },
  { id: "graphite", label: "Graphite", description: "A neutral charcoal workspace" },
];
const shortcutGroups: Array<[string, ShortcutAction[]]> = [
  ["Tabs", ["previous-tab", "next-tab", "new-terminal"]],
  ["Panes", ["previous-pane", "next-pane", "split-right", "split-down", "close-pane"]],
  ["Workspaces", ["previous-workspace", "next-workspace", "toggle-sidebar"]],
];
const shortcutLabels: Record<ShortcutAction, string> = {
  "previous-tab": "Previous tab",
  "next-tab": "Next tab",
  "previous-pane": "Previous pane",
  "next-pane": "Next pane",
  "previous-workspace": "Previous workspace",
  "next-workspace": "Next workspace",
  "new-terminal": "New terminal",
  "split-right": "Split right",
  "split-down": "Split down",
  "toggle-sidebar": "Toggle sidebar",
  "close-pane": "Close pane",
};
function eventKey(event: KeyboardEvent): string {
  const arrows: Record<string, string> = {
    ArrowLeft: "left",
    ArrowRight: "right",
    ArrowUp: "up",
    ArrowDown: "down",
  };
  return arrows[event.key] ?? event.key.toLowerCase();
}
function shortcutLabel(binding: {
  key: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
}): string {
  const key =
    ({ left: "←", right: "→", up: "↑", down: "↓" } as Record<string, string>)[binding.key] ??
    binding.key.toUpperCase();
  return [binding.ctrl && "Ctrl", binding.alt && "Alt", binding.shift && "Shift", key]
    .filter(Boolean)
    .join("+");
}

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
      hookNotifications: store.hookNotifications,
      shortcuts: store.shortcuts,
    }),
    [
      store.theme,
      store.uiFontSize,
      store.terminalFontSize,
      store.terminalFontFamily,
      store.scrollback,
      store.shell,
      store.hookNotifications,
      store.shortcuts,
    ],
  );
  const [draft, setDraft] = useState<VintageSettings>(saved);
  const [section, setSection] = useState<SettingsSection>("appearance");
  const [recording, setRecording] = useState<ShortcutAction | null>(null);
  const [shortcutError, setShortcutError] = useState<string | null>(null);
  useEffect(() => {
    if (store.settingsOpen) setDraft(saved);
  }, [store.settingsOpen, saved]);
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
        store.saveSettings(draft);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draft, recording, store]);
  if (!store.settingsOpen) return null;
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const change = (patch: Partial<VintageSettings>) =>
    setDraft((current) => ({ ...current, ...patch }));
  const save = () => {
    store.saveSettings(draft);
    store.setSettingsOpen(false);
  };
  const discard = () => {
    setDraft(saved);
    setRecording(null);
    setShortcutError(null);
    store.setSettingsOpen(false);
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
                  <option>System default</option>
                  <option>zsh</option>
                  <option>bash</option>
                  <option>fish</option>
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
            <h2 className="text-2xl font-semibold">Agent connections</h2>
            <p className="mt-1 text-ui-base text-foreground-subtle">
              Manage workspace notifications and supported agent connections.
            </p>
          </div>
          <Card>
            <Field
              label="Attention notifications"
              description="Show blocked agent requests in the workspace sidebar, pane, and notification card."
            >
              <div className="flex gap-2">
                <Choice
                  active={draft.hookNotifications}
                  onClick={() => change({ hookNotifications: true })}
                >
                  On
                </Choice>
                <Choice
                  active={!draft.hookNotifications}
                  onClick={() => change({ hookNotifications: false })}
                >
                  Off
                </Choice>
              </div>
            </Field>
          </Card>
          {[
            ["Codex", "Cx", "Managed session-start hook"],
            ["Claude Code", "Cl", "Managed lifecycle hooks"],
            ["OpenCode", "Op", "Managed lifecycle plugin"],
          ].map(([name, initials, description]) => (
            <Card key={name}>
              <div className="flex flex-wrap items-center gap-3">
                <div className="grid size-11 place-items-center rounded-lg bg-hover text-ui-sm font-semibold">
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium">{name}</h3>
                  <p className="mt-1 text-ui-sm text-foreground-subtle">{description}</p>
                  <p className="mt-1 text-ui-sm text-foreground-subtle">
                    Not available in this Electron edition.
                  </p>
                </div>
                <span className="rounded-full bg-hover px-2 py-1 text-ui-xs text-foreground-subtle">
                  Unavailable
                </span>
              </div>
            </Card>
          ))}
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
              <p className="mt-1 text-ui-sm text-foreground-subtle">Version 0.1.0</p>
            </div>
            <span className="rounded-full bg-hover px-2 py-1 text-ui-xs text-foreground-subtle">
              Electron edition
            </span>
          </div>
          <div className="mt-5 border-t border-border pt-4">
            <h3 className="font-medium">You&apos;re using the Electron edition</h3>
            <p className="mt-2 text-ui-sm text-foreground-subtle">
              Automatic updates for this edition are not available yet.
            </p>
            <Button className="mt-4" disabled size="compact" variant="ghost">
              <CloudDownload /> Check for updates
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
            {dirty ? "Unsaved changes" : "All changes saved"}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={discard}>
              Discard
            </Button>
            <Button disabled={!dirty} variant="primary" onClick={save}>
              <Check /> Save changes
            </Button>
          </div>
        </div>
      </footer>
    </section>
  );
}
